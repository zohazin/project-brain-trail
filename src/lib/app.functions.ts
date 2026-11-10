import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { Plan } from "./plan-types";

type AiFail = { ok: false; aiError: string; retryAfter: number | null };

async function aiErr(e: unknown): Promise<AiFail> {
  const { AiUnavailableError } = await import("./ai.server");
  if (e instanceof AiUnavailableError) return { ok: false, aiError: e.message, retryAfter: e.retryAfter };
  throw e;
}

/** Area admins only: model, recent writing-helper problems (codes only, no message text) and an optional live check. */
export const aiDiagnostics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ probe: z.boolean().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { data: roles } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
    if (!(roles ?? []).some((r) => r.role === "area_admin")) throw new Error("Only area admins can see this.");
    const ai = await import("./ai.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let probe: Awaited<ReturnType<typeof ai.probeAi>> | null = null;
    let probeWait = 0;
    if (data.probe) {
      // One live check per minute for everyone, so the button can't run up costs.
      const { data: last } = await supabaseAdmin.from("ai_events").select("created_at").eq("feature", "probe").order("created_at", { ascending: false }).limit(1).maybeSingle();
      const ago = last ? (Date.now() - new Date(last.created_at).getTime()) / 1000 : Infinity;
      if (ago < 60) probeWait = Math.ceil(60 - ago);
      else probe = await ai.probeAi();
    }
    const { data: events } = await supabaseAdmin
      .from("ai_events")
      .select("created_at, feature, kind, code, http_status, retry_after")
      .order("created_at", { ascending: false })
      .limit(8);
    return { configured: ai.aiConfigured(), model: ai.textModel(), probe, probeWait, events: events ?? [] };
  });

export const getAiStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { aiConfigured } = await import("./ai.server");
    return { ai: aiConfigured() };
  });

// ---------------- Borrower conversation ----------------
const talkSchema = z.object({
  wantId: z.string().uuid().nullable(),
  message: z.string().trim().max(1000),
  photoPath: z.string().max(300).nullable(),
  km: z.number().min(0.5).max(100).nullable().optional(),
});

const withArticle = (name: string) => (/^[aeiou]/i.test(name) ? `an ${name}` : `a ${name}`);

export const talkNeed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => talkSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const ai = await import("./ai.server");
    const { buildPlan } = await import("./plan.server");

    const { data: me } = await supabase.from("profiles").select("*").eq("id", userId).single();
    if (!me) throw new Error("Profile not found");

    let want;
    if (data.wantId) {
      const r = await supabase.from("wants").select("*").eq("id", data.wantId).single();
      if (r.error || !r.data) throw new Error("Not found");
      want = r.data;
      if (want.status === "done" || want.status === "cancelled") {
        throw new Error("This search is finished. Start a new search on Find.");
      }
      if (want.status === "active") {
        return changeAfterSend(want, data.message, supabase);
      }
    } else {
      const r = await supabase
        .from("wants")
        .insert({
          borrower_id: userId,
          original_text: data.message,
          search_km: data.km ?? Number(me.travel_km),
          lat: me.lat,
          lng: me.lng,
          area_name: me.area_name,
        })
        .select("*")
        .single();
      if (r.error || !r.data) throw new Error(r.error?.message ?? "Could not start");
      want = r.data;
    }

    const conversation = Array.isArray(want.conversation)
      ? (want.conversation as { role: "user" | "assistant"; text: string }[])
      : [];

    let userText = data.message;
    try {
      if (data.photoPath) {
        if (!data.photoPath.startsWith(`${userId}/`)) throw new Error("Not allowed");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const file = await supabaseAdmin.storage.from("photos").download(data.photoPath);
        if (file.error || !file.data) throw new Error("Could not read the photo");
        const buf = Buffer.from(await file.data.arrayBuffer());
        const mime = file.data.type || "image/jpeg";
        const seen = await ai.describePhoto(`data:${mime};base64,${buf.toString("base64")}`);
        const photoOnly = !userText;
        userText = `${userText ? `${userText}\n` : ""}(Sent a photo. It looks like: ${seen.item_name}. ${seen.description})`;
        if (photoOnly || !seen.sure) {
          // Ask the borrower to confirm or correct the AI's guess before searching.
          const q = seen.sure
            ? `This looks like ${withArticle(seen.item_name.toLowerCase())}. Is that right? If not, tell me what it is.`
            : `I'm not sure what this is. It might be ${withArticle(seen.item_name.toLowerCase())}. What is it?`;
          conversation.push({ role: "user", text: userText }, { role: "assistant", text: q });
          const upd = await supabase
            .from("wants")
            .update({
              conversation,
              original_text: want.original_text || userText,
              item_name: want.item_name ?? seen.item_name,
              next_question: q,
              status: "asking",
              photo_path: data.photoPath,
              updated_at: new Date().toISOString(),
            })
            .eq("id", want.id);
          if (upd.error) throw new Error(upd.error.message);
          return { ok: true as const, wantId: want.id, plan: null };
        }
      }
      if (!userText) throw new Error("Please write what you need.");
      conversation.push({ role: "user", text: userText });

      const nowIso = new Date().toISOString();
      const f = await ai.understandNeed({
        nowIso,
        conversation,
        known: {
          item_name: want.item_name,
          kind: want.kind as "return" | "use_up",
          quantity: want.quantity == null ? null : Number(want.quantity),
          unit: want.unit,
          details: want.details,
          purpose: want.purpose,
          budget_rs: want.budget_rs == null ? null : Number(want.budget_rs),
          pickup_at: want.pickup_at,
          return_at: want.return_at,
          requirements: want.requirements ?? [],
        },
      });

      // Check the AI's answer against simple rules before trusting it.
      const parse = (s: string | null) => {
        if (!s) return null;
        const d = new Date(s);
        return Number.isNaN(d.getTime()) ? null : d;
      };
      const pickup = parse(f.pickup_at);
      let ret = f.kind === "use_up" ? null : parse(f.return_at);
      let question = f.next_question;
      let pickupIso = pickup ? pickup.toISOString() : null;
      if (pickup && pickup.getTime() < Date.now() - 10 * 60 * 1000) {
        pickupIso = null;
        question = "That time has already passed. When will you pick it up?";
      }
      if (pickup && ret && ret.getTime() <= pickup.getTime()) {
        ret = null;
        question = f.quantity && f.quantity > 1 ? "When will you bring them back? It must be after pickup." : "When will you bring it back? It must be after pickup.";
      }
      const plural = (f.quantity ?? 1) > 1;
      if (!question) {
        if (!f.item_name) question = "What do you need?";
        else if (!f.quantity) question = "How many do you need?";
        else if (!pickupIso) question = "When will you pick it up?";
        else if (f.kind === "return" && !ret) question = plural ? "When will you bring them back?" : "When will you bring it back?";
      }
      const ready = Boolean(f.item_name && f.quantity && pickupIso && (f.kind === "use_up" || ret)) && !question;
      if (question) conversation.push({ role: "assistant", text: question });

      const upd = await supabase
        .from("wants")
        .update({
          conversation,
          original_text: want.original_text || userText,
          item_name: f.item_name,
          kind: f.kind,
          quantity: f.quantity,
          unit: f.unit || "item",
          details: f.details,
          purpose: f.purpose,
          budget_rs: f.budget_rs,
          pickup_at: pickupIso,
          return_at: ret ? ret.toISOString() : null,
          ai_summary: f.summary,
          requirements: Array.from(new Set(f.requirements.map((x) => x.trim()).filter(Boolean))).slice(0, 8),
          ai_keywords: Array.from(new Set(f.keywords.map((k) => k.toLowerCase().trim()).filter(Boolean))),
          next_question: ready ? null : question,
          status: ready ? "ready" : "asking",
          photo_path: data.photoPath ?? want.photo_path,
          updated_at: new Date().toISOString(),
        })
        .eq("id", want.id)
        .select("*")
        .single();
      if (upd.error || !upd.data) throw new Error(upd.error?.message ?? "Could not save");

      let plan: Plan | null = null;
      if (ready) plan = await buildPlan(upd.data, Number(upd.data.search_km));
      return { ok: true as const, wantId: want.id, plan };
    } catch (e) {
      const fail = await aiErr(e);
      return { ...fail, wantId: want.id };
    }
  });

type Sb = SupabaseClient<Database>;
type WantRow = Database["public"]["Tables"]["wants"]["Row"];

/**
 * Requests were already sent. Understand the change, but don't apply it: show the person what would happen
 * to each sent or accepted request first (they approve with applyQuantityChange).
 */
async function changeAfterSend(want: WantRow, message: string, supabase: Sb) {
  const ai = await import("./ai.server");
  const { previewQuantityChange } = await import("./change");
  if (!message.trim()) throw new Error("Please write what you want to change.");
  const conversation = Array.isArray(want.conversation)
    ? (want.conversation as { role: "user" | "assistant"; text: string }[])
    : [];
  try {
    const f = await ai.understandNeed({
      nowIso: new Date().toISOString(),
      conversation: [...conversation, { role: "user", text: message }],
      known: {
        item_name: want.item_name,
        kind: want.kind as "return" | "use_up",
        quantity: want.quantity == null ? null : Number(want.quantity),
        unit: want.unit,
        pickup_at: want.pickup_at,
        return_at: want.return_at,
        requirements: want.requirements ?? [],
      },
    });
    const from = Number(want.quantity ?? 0);
    const to = f.quantity == null ? from : Number(f.quantity);
    const moved = (a: string | null, b: string | null) =>
      Boolean(a && b && Math.abs(new Date(a).getTime() - new Date(b).getTime()) > 5 * 60_000);
    const timesChanged = moved(f.pickup_at, want.pickup_at) || moved(f.return_at, want.return_at);
    let reply: string;
    let change: ReturnType<typeof previewQuantityChange> | null = null;
    if (to > 0 && to !== from) {
      const { data: reqs } = await supabase.from("requests").select("*").eq("want_id", want.id);
      change = previewQuantityChange(
        (reqs ?? []).map((r) => ({ ...r, quantity: Number(r.quantity), picked_up_qty: Number(r.picked_up_qty) })),
        from,
        to,
      );
      reply = `You now need ${to} instead of ${from}. Please check what changes below before I do anything.`;
    } else if (timesChanged) {
      reply = "Requests were already sent with the old times. Open each booking and tap “Change dates” so both of you can agree.";
    } else {
      reply = f.next_question ?? "Got it. Nothing needs to change.";
    }
    conversation.push({ role: "user", text: message }, { role: "assistant", text: reply });
    await supabase.from("wants").update({ conversation, updated_at: new Date().toISOString() }).eq("id", want.id);
    return { ok: true as const, wantId: want.id, plan: null, change };
  } catch (e) {
    const fail = await aiErr(e);
    return { ...fail, wantId: want.id };
  }
}

export const applyQuantityChange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ wantId: z.string().uuid(), quantity: z.number().gt(0).max(100000) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const r = await supabase.rpc("change_want_quantity", { _want: data.wantId, _qty: data.quantity });
    if (r.error) throw new Error(r.error.message);
    const res = (r.data ?? {}) as { changed?: number; asked?: number; cancelled?: number };
    const asked = Number(res.asked ?? 0);
    const { data: w } = await supabase.from("wants").select("conversation").eq("id", data.wantId).single();
    const convo = Array.isArray(w?.conversation) ? (w!.conversation as { role: string; text: string }[]) : [];
    convo.push({
      role: "assistant",
      text: asked
        ? `You now need ${data.quantity}. ${asked === 1 ? "One owner has" : `${asked} owners have`} to agree to the smaller amount. Until then, the current booking stays as it is.`
        : `Done. You now need ${data.quantity}.`,
    });
    await supabase.from("wants").update({ conversation: convo }).eq("id", data.wantId);
    return { ok: true, asked };
  });

export const planForWant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ wantId: z.string().uuid(), km: z.number().min(0.5).max(100) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { buildPlan } = await import("./plan.server");
    const { supabase } = context;
    const r = await supabase
      .from("wants")
      .update({ search_km: data.km })
      .eq("id", data.wantId)
      .select("*")
      .single();
    if (r.error || !r.data) throw new Error("Not found");
    try {
      const plan = await buildPlan(r.data, data.km);
      return { ok: true as const, plan };
    } catch (e) {
      return aiErr(e);
    }
  });

export const cleanNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ text: z.string().trim().min(1).max(600) }).parse(d))
  .handler(async ({ data, context }) => {
    // Same anonymity cleaning as "Make it rhyme": fixed rules, delete-only cleaner, then a final check.
    const { safeNote, mySecrets } = await import("./safe-note.server");
    const email = typeof context.claims?.email === "string" ? context.claims.email : null;
    try {
      const r = await safeNote(data.text, await mySecrets(context.supabase, context.userId, email));
      if (r.ok) return { ok: true as const, note: r.note, removed: r.removed };
      if ("review" in r) return { ok: false as const, review: r.review };
      return { ok: false as const, aiError: r.aiError, retryAfter: r.retryAfter };
    } catch (e) {
      return aiErr(e);
    }
  });

// ---------------- Owner answers a request ----------------
export const answerRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ requestId: z.string().uuid(), accept: z.boolean(), version: z.number().int().positive().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const before = await supabase.from("requests").select("*").eq("id", data.requestId).single();
    if (before.error || !before.data) throw new Error("Not found");
    // The version the owner was looking at: if the borrower changed the request since, the database refuses the old terms.
    const r = await supabase.rpc("respond_request", { _req: data.requestId, _accept: data.accept, ...(data.version ? { _version: data.version } : {}) });
    if (r.error) throw new Error(r.error.message);
    const after = await supabase.from("requests").select("status").eq("id", data.requestId).single();
    if (after.data?.status === "expired") {
      throw new Error("This request expired because the pickup time has passed. Nothing was booked.");
    }
    if (!data.accept && before.data.status === "requested") {
      // Without the borrower searching again, look for only the missing amount.
      const { prepareBackup } = await import("./plan.server");
      const who = before.data.owner_name || "An owner";
      const unit = before.data.unit === "item" ? before.data.item_name.toLowerCase() : `${before.data.unit} of ${before.data.item_name.toLowerCase()}`;
      await prepareBackup(
        before.data.want_id,
        `${who} can't lend ${Number(before.data.quantity)} ${unit}.`,
      );
    }
    return { ok: true };
  });

// ---------------- AI demo results (demo accounts only) ----------------
/** Fills the missing amount of a demo search with fictional listings made live by AI (or reuses saved ones). */
export const demoMatches = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        wantId: z.string().uuid(),
        km: z.number().min(0.5).max(100),
        mode: z.enum(["auto", "retry", "another"]),
        backup: z.boolean().optional(),
        fault: z.enum(["timeout", "balance", "invalid", "save"]).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    // Ownership is checked as the signed-in person first (RLS), then again inside demoPlan.
    const w = await context.supabase.from("wants").select("id, search_km, pending_plan").eq("id", data.wantId).single();
    if (w.error || !w.data) throw new Error("Not found");
    const { demoPlan } = await import("./demo-gen.server");
    const km = data.backup ? Number(w.data.search_km) : data.km;
    // `fault` is a presenter test switch; demoPlan refuses every non-demo account before reaching it.
    const out = await demoPlan({ borrowerId: context.userId, wantId: data.wantId, km, mode: data.mode, fault: data.fault });
    if (data.backup && out.ok && out.created) {
      const { prepareBackup } = await import("./plan.server");
      const reason = (w.data.pending_plan as Plan | null)?.reason ?? "An owner can't lend.";
      await prepareBackup(data.wantId, reason);
    }
    return out;
  });

export const UNAVAILABLE = "Someone else booked this item for these times first, so it isn't available. Nothing was booked for you; a replacement search is ready.";

/** Presenter controls for a simulated demo owner. They run the normal booking rules as that owner. */
export const simOwnerAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ requestId: z.string().uuid(), action: z.enum(["accept", "decline", "pickup", "return", "meet"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: me } = await context.supabase.from("profiles").select("is_demo").eq("id", context.userId).single();
    if (!me?.is_demo) throw new Error("Demo actions are only for demo accounts.");
    const before = await context.supabase.from("requests").select("*").eq("id", data.requestId).single();
    if (before.error || !before.data || before.data.borrower_id !== context.userId || !before.data.simulated) {
      throw new Error("Demo actions work only with simulated demo owners.");
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const r = await supabaseAdmin.rpc("sim_owner_act", { _req: data.requestId, _presenter: context.userId, _action: data.action });
    if (r.error && data.action === "accept" && /enough free/i.test(r.error.message)) {
      // Lost a race: another borrower's booking took the stock first. The owner can't lend, so the normal decline runs
      // and a replacement for only this amount is offered. The other booking is untouched.
      const d = await supabaseAdmin.rpc("sim_owner_act", { _req: data.requestId, _presenter: context.userId, _action: "decline" });
      if (!d.error) {
        const { prepareBackup } = await import("./plan.server");
        const b = before.data;
        await prepareBackup(b.want_id, `${b.owner_name || "An owner"}'s ${b.item_name.toLowerCase()} was booked by someone else for these times.`);
      }
      return { ok: false as const, status: "unavailable", message: UNAVAILABLE };
    }
    if (r.error) throw new Error(r.error.message);
    const status = String((r.data as { status?: string } | null)?.status ?? "");
    if (data.action === "accept" && status === "expired") {
      throw new Error("This request expired because the pickup time has passed. Nothing was booked.");
    }
    if (data.action === "decline" && before.data.status === "requested") {
      const { prepareBackup } = await import("./plan.server");
      const b = before.data;
      const unit = b.unit === "item" ? b.item_name.toLowerCase() : `${b.unit} of ${b.item_name.toLowerCase()}`;
      await prepareBackup(b.want_id, `${b.owner_name || "An owner"} can't lend ${Number(b.quantity)} ${unit}.`);
    }
    return { ok: true as const, status, message: null };
  });

// Owner answers an exception (distance) first; this is separate from saying yes to the booking.
export const answerException = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ requestId: z.string().uuid(), allow: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const before = await supabase.from("requests").select("*").eq("id", data.requestId).single();
    if (before.error || !before.data) throw new Error("Not found");
    const r = await supabase.rpc("answer_exception", { _req: data.requestId, _allow: data.allow });
    if (r.error) throw new Error(r.error.message);
    if (!data.allow && before.data.status === "requested") {
      const { prepareBackup } = await import("./plan.server");
      await prepareBackup(before.data.want_id, `${before.data.owner_name || "An owner"} can't make an exception for the distance.`);
    }
    return { ok: true };
  });

// Either person cancels before pickup. If an owner cancels an accepted booking, look for a replacement.
export const cancelBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ requestId: z.string().uuid(), reason: z.string().trim().max(300) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const before = await supabase.from("requests").select("*").eq("id", data.requestId).single();
    if (before.error || !before.data) throw new Error("Not found");
    const r = await supabase.rpc("cancel_booking", { _req: data.requestId, _reason: data.reason });
    if (r.error) throw new Error(r.error.message);
    const b = before.data;
    if (b.owner_id === userId && b.status === "confirmed") {
      const { prepareBackup } = await import("./plan.server");
      const unit = b.unit === "item" ? b.item_name.toLowerCase() : `${b.unit} of ${b.item_name.toLowerCase()}`;
      await prepareBackup(b.want_id, `${b.owner_name} cancelled ${Number(b.quantity)} ${unit}.`);
    }
    return { ok: true };
  });

// ---------------- Lender saves an item ----------------
const itemSchema = z.object({
  id: z.string().uuid().nullable(),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000),
  specs: z.string().trim().max(1000),
  photo_paths: z.array(z.string().max(300)).max(6),
  category: z.string().trim().max(60),
  condition: z.string().trim().max(200),
  accessories: z.string().trim().max(300),
  price_period: z.enum(["each", "day"]),
  min_amount: z.number().gt(0).max(100000).nullable(),
  step_amount: z.number().gt(0).max(100000).nullable(),
  measured: z.boolean(),
  kind: z.enum(["return", "use_up"]),
  quantity: z.number().min(0).max(100000),
  unit: z.string().trim().min(1).max(20),
  price_rs: z.number().min(0).max(1000000),
  price_per: z.number().gt(0).max(100000),
  avail_days: z.array(z.number().int().min(0).max(6)).min(1),
  avail_start: z.string().regex(/^\d{2}:\d{2}$/),
  avail_end: z.string().regex(/^\d{2}:\d{2}$/),
  area_name: z.string().trim().max(100),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  max_distance_km: z.number().gt(0).max(100),
  allow_outside: z.boolean(),
});

export const saveItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => itemSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.photo_paths.some((p) => !p.startsWith(`${userId}/`))) throw new Error("Not allowed");
    if (data.avail_end <= data.avail_start) throw new Error("The end time must be after the start time.");
    const { id, ...rest } = data;
    const fields = { ...rest, photo_path: rest.photo_paths[0] ?? null };
    let itemId = id;
    if (id) {
      // Stock can't go below what is already promised in accepted bookings.
      const { reservedPeak } = await import("./change");
      const { data: full } = await supabase
        .from("requests")
        .select("kind, quantity, picked_up_qty, returned_qty, pickup_at, return_at")
        .eq("item_id", id)
        .eq("status", "confirmed");
      const reserved = reservedPeak(
        (full ?? []).map((r) => ({
          kind: r.kind,
          quantity: Number(r.quantity),
          picked_up_qty: Number(r.picked_up_qty),
          returned_qty: Number(r.returned_qty),
          pickup_at: r.pickup_at,
          return_at: r.return_at,
        })),
      );
      if (data.quantity < reserved) {
        const what = data.kind === "use_up" ? `${reserved} ${data.unit}` : String(reserved);
        throw new Error(
          `${what} ${reserved === 1 && data.kind === "return" ? "is" : "are"} promised in accepted bookings at the same time. You can't go below ${reserved} until they are ${data.kind === "use_up" ? "handed over" : "returned"}, or a booking is cancelled.`,
        );
      }
      const r = await supabase.from("items").update(fields).eq("id", id).eq("owner_id", userId).select("id").single();
      if (r.error || !r.data) throw new Error(r.error?.message ?? "Could not save");
    } else {
      const r = await supabase.from("items").insert({ ...fields, owner_id: userId }).select("id").single();
      if (r.error || !r.data) throw new Error(r.error?.message ?? "Could not save");
      itemId = r.data.id;
    }
    // Fresh private AI summary for matching.
    const { data: cur } = await supabase.from("items").select("summary_stale, ai_summary").eq("id", itemId!).single();
    let summarized = !cur?.summary_stale && Boolean(cur?.ai_summary);
    if (!summarized) {
      try {
        const { refreshItemSummary } = await import("./plan.server");
        await refreshItemSummary(itemId!);
        summarized = true;
      } catch (e) {
        console.error("[item summary]", e);
      }
    }
    return { id: itemId!, summarized };
  });

// ---------------- Photos (signed links after permission checks) ----------------
export const nearbyItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        km: z.number().min(0.5).max(100),
        from: z.string().datetime().nullable().optional(),
        to: z.string().datetime().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { signPaths } = await import("./plan.server");
    // Without dates only the listed amount is known; with dates the database checks that exact interval.
    const r = await context.supabase.rpc("nearby_items", {
      _km: data.km,
      ...(data.from ? { _from: data.from } : {}),
      ...(data.from && data.to ? { _to: data.to } : {}),
    });
    if (r.error) throw new Error(r.error.message);
    const urls = await signPaths((r.data ?? []).map((x) => x.photo_path));
    // Fictional AI demo listings carry a label (demo accounts only ever see demo listings).
    const ids = (r.data ?? []).map((x) => x.item_id);
    const gen = ids.length ? await context.supabase.rpc("generated_item_ids", { _ids: ids }) : { data: [] as string[] };
    const generated = new Set((gen.data ?? []) as string[]);
    return (r.data ?? []).map((x) => ({
      ...x,
      is_generated: generated.has(x.item_id),
      listed_qty: Number(x.listed_qty),
      free_qty: x.free_qty == null ? null : Number(x.free_qty),
      time_note: x.time_note ?? null,
      price_rs: Number(x.price_rs),
      price_per: Number(x.price_per),
      distance_km: Number(x.distance_km),
      avg_rating: x.avg_rating == null ? null : Number(x.avg_rating),
      photo_url: x.photo_path ? (urls[x.photo_path] ?? null) : null,
    }));
  });

export const requestPhotos = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ requestIds: z.array(z.string().uuid()).max(100) }).parse(d))
  .handler(async ({ data, context }) => {
    const { signPaths } = await import("./plan.server");
    type CondPhoto = { url: string; stage: string; mine: boolean; at: string };
    if (data.requestIds.length === 0) return { items: {}, people: {}, condition: {} as Record<string, CondPhoto[]> };
    // RLS: only requests where the caller is a party come back.
    const { data: reqs } = await context.supabase
      .from("requests")
      .select("id, item_photo, borrower_id, owner_id, status, condition_photos")
      .in("id", data.requestIds);
    const list = reqs ?? [];
    const { data: choices } = await context.supabase
      .from("request_photos")
      .select("*")
      .in("request_id", list.map((r) => r.id));
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const profileIds = Array.from(new Set((choices ?? []).filter((c) => c.choice === "profile").map((c) => c.user_id)));
    const { data: profs } = profileIds.length
      ? await supabaseAdmin.from("profiles").select("id, avatar_path").in("id", profileIds)
      : { data: [] as { id: string; avatar_path: string | null }[] };
    const avatar = new Map((profs ?? []).map((p) => [p.id, p.avatar_path]));
    const personPath = (c: { choice: string; user_id: string; photo_path: string | null }) =>
      c.choice === "profile" ? (avatar.get(c.user_id) ?? null) : c.choice === "other" ? c.photo_path : null;
    const cond = (r: (typeof list)[number]) =>
      (Array.isArray(r.condition_photos) ? r.condition_photos : []) as { path: string; by: string; stage: string; at: string }[];
    const urls = await signPaths([
      ...list.map((r) => r.item_photo),
      ...(choices ?? []).map((c) => personPath(c)),
      ...list.flatMap((r) => cond(r).map((c) => c.path)),
    ]);
    const items: Record<string, string | null> = {};
    for (const r of list) items[r.id] = r.item_photo ? (urls[r.item_photo] ?? null) : null;
    const people: Record<string, Record<string, string | null>> = {};
    for (const c of choices ?? []) {
      const p = personPath(c);
      people[c.request_id] = { ...(people[c.request_id] ?? {}), [c.user_id]: p ? (urls[p] ?? null) : null };
    }
    const condition: Record<string, CondPhoto[]> = {};
    for (const r of list) {
      condition[r.id] = cond(r)
        .filter((c) => urls[c.path])
        .map((c) => ({ url: urls[c.path]!, stage: c.stage, mine: c.by === context.userId, at: c.at }));
    }
    return { items, people, condition };
  });

export const reportPhoto = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ reportId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { signPaths } = await import("./plan.server");
    // RLS: parties and area admins only.
    const { data: rp } = await context.supabase.from("reports").select("photo_path").eq("id", data.reportId).single();
    if (!rp?.photo_path) return { url: null };
    const urls = await signPaths([rp.photo_path]);
    return { url: urls[rp.photo_path] ?? null };
  });

// ---------------- Demo reset (demo accounts only) ----------------
export const resetDemo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: me } = await context.supabase.from("profiles").select("is_demo").eq("id", context.userId).single();
    if (!me?.is_demo) throw new Error("Only demo accounts can reset the demo.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { wipeDemo } = await import("./demo.server");
    return { ok: true, removed: await wipeDemo(supabaseAdmin) };
  });

/** Resets the demo, then prepares the three Shayari starting points (demo accounts only; rhymes stay live). */
export const prepareShayariDemo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: me } = await context.supabase.from("profiles").select("is_demo").eq("id", context.userId).single();
    if (!me?.is_demo) throw new Error("Only demo accounts can prepare the demo.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { buildShayariDemo } = await import("./demo.server");
    return buildShayariDemo(supabaseAdmin);
  });

// ---------------- One listing as a borrower sees it ----------------
export const listingDetail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ itemId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { signPaths } = await import("./plan.server");
    const r = await context.supabase.rpc("listing_detail", { _item: data.itemId });
    if (r.error) throw new Error(r.error.message);
    const it = (r.data ?? [])[0];
    if (!it) return null;
    const urls = await signPaths(it.photo_paths ?? []);
    const gen = await context.supabase.rpc("generated_item_ids", { _ids: [data.itemId] });
    return {
      ...it,
      is_generated: ((gen.data ?? []) as string[]).includes(data.itemId),
      price_rs: Number(it.price_rs),
      price_per: Number(it.price_per),
      distance_km: Number(it.distance_km),
      owner_limit_km: Number(it.owner_limit_km),
      listed_qty: Number(it.listed_qty),
      min_amount: it.min_amount == null ? null : Number(it.min_amount),
      step_amount: it.step_amount == null ? null : Number(it.step_amount),
      avg_rating: it.avg_rating == null ? null : Number(it.avg_rating),
      photo_urls: (it.photo_paths ?? []).map((p) => urls[p]).filter((u): u is string => Boolean(u)),
    };
  });

// ---------------- Asking for one listing directly (same checks as an AI search) ----------------
const directSchema = z.object({
  itemId: z.string().uuid(),
  quantity: z.number().gt(0).max(100000),
  pickupAt: z.string().datetime(),
  returnAt: z.string().datetime().nullable(),
});

export type DirectQuote = {
  quantity: number;
  unit: string;
  kind: string;
  unit_rate: number;
  price_per: number;
  period: string;
  days: number | null;
  pickup_at: string;
  return_at: string | null;
  extra_rs: number;
  total: number;
  free_qty: number | null;
  listed_qty: number;
  problem: string | null;
  distance_km: number;
  exception: boolean;
  item_name: string;
};

function toQuote(j: unknown): DirectQuote {
  const q = (j ?? {}) as Partial<Record<keyof DirectQuote, unknown>>;
  const num = (v: unknown) => (v == null ? null : Number(v));
  return {
    quantity: Number(q.quantity ?? 0),
    unit: String(q.unit ?? "item"),
    kind: String(q.kind ?? "return"),
    unit_rate: Number(q.unit_rate ?? 0),
    price_per: Number(q.price_per ?? 1),
    period: String(q.period ?? "each"),
    days: num(q.days),
    pickup_at: String(q.pickup_at ?? ""),
    return_at: q.return_at == null ? null : String(q.return_at),
    extra_rs: Number(q.extra_rs ?? 0),
    total: Number(q.total ?? 0),
    free_qty: num(q.free_qty),
    listed_qty: Number(q.listed_qty ?? 0),
    problem: q.problem == null ? null : String(q.problem),
    distance_km: Number(q.distance_km ?? 0),
    exception: Boolean(q.exception),
    item_name: String(q.item_name ?? ""),
  };
}

/** The database works out availability and the full price for these exact dates. */
export const quoteListing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => directSchema.parse(d))
  .handler(async ({ data, context }) => {
    const r = await context.supabase.rpc("quote_item", {
      _item: data.itemId,
      _qty: data.quantity,
      _from: data.pickupAt,
      _to: data.returnAt as string,
    });
    if (r.error) throw new Error(r.error.message);
    return toQuote(r.data);
  });

/** Sends one request for a listing the person picked themselves. The database rechecks everything, including this exact total. */
export const requestListing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    directSchema
      .extend({ expectedTotal: z.number().min(0), note: z.string().trim().max(600).optional(), shayariPreview: z.string().uuid().nullable().optional() })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const qr = await supabase.rpc("quote_item", { _item: data.itemId, _qty: data.quantity, _from: data.pickupAt, _to: data.returnAt as string });
    if (qr.error) throw new Error(qr.error.message);
    const q = toQuote(qr.data);
    if (q.problem) throw new Error(q.problem);
    if (q.total !== data.expectedTotal) throw new Error(`The price changed to ${q.total === 0 ? "Free" : `Rs ${q.total}`}. Please check the new total.`);
    const { data: me } = await supabase.from("profiles").select("lat, lng, area_name, travel_km").eq("id", userId).single();
    if (!me) throw new Error("Profile not found");
    if (q.exception && data.note?.trim() && !data.shayariPreview) {
      // The note must be the checked version the person approved: nothing private may slip through.
      const { mySecrets } = await import("./safe-note.server");
      const { hasPrivate, unsureContact } = await import("./shayari");
      const email = typeof context.claims?.email === "string" ? context.claims.email : null;
      if (hasPrivate(data.note, await mySecrets(supabase, userId, email)) || unsureContact(data.note)) {
        throw new Error("Your note still has private details. Please preview it again.");
      }
    }
    const ins = await supabase
      .from("wants")
      .insert({
        borrower_id: userId,
        original_text: `Asked directly for ${q.quantity} ${q.item_name.toLowerCase()}.`,
        item_name: q.item_name,
        kind: q.kind,
        quantity: q.quantity,
        unit: q.unit,
        pickup_at: data.pickupAt,
        return_at: q.kind === "return" ? data.returnAt : null,
        search_km: Math.max(Number(me.travel_km), Math.ceil(q.distance_km)),
        lat: me.lat,
        lng: me.lng,
        area_name: me.area_name,
        status: "ready",
        conversation: [
          { role: "user", text: `I'd like ${q.quantity} ${q.item_name.toLowerCase()}.` },
          { role: "assistant", text: "Request sent from the listing. Nothing is booked until the owner says yes." },
        ],
      })
      .select("id")
      .single();
    if (ins.error || !ins.data) throw new Error(ins.error?.message ?? "Could not start the request");
    const sent = await supabase.rpc("send_requests", {
      _want: ins.data.id,
      _allocs: [
        {
          item_id: data.itemId,
          quantity: data.quantity,
          is_exception: q.exception,
          note: q.exception ? (data.note ?? "") : null,
          shayari_preview: q.exception ? (data.shayariPreview ?? null) : null,
          expected_total: data.expectedTotal,
        },
      ],
    });
    if (sent.error) {
      await supabase.from("wants").delete().eq("id", ins.data.id);
      throw new Error(sent.error.message);
    }
    return { wantId: ins.data.id };
  });
