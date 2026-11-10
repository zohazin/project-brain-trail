// Shayari Mode (Mystery Card 2): the one shared generator for private chats, faraway requests and thank-you cards.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  SHAYARI_FAILED,
  bookingDone,
  hasPrivate,
  intentProblems,
  rhymeProblems,
  numberProblems,
  numbersIn,
  scriptProblems,
  scrubPrivate,
  shapeProblems,
  unsureContact,
  type ShayariPreview,
} from "./shayari";

const TZ = "Asia/Karachi";
const RATE_LIMIT = 12; // generations per person
const RATE_WINDOW_MIN = 10;
const MAX_ROUNDS = 2; // first try + one correction
const MAX_SOURCE = 600; // longer messages are sent as they are

export type ShayariResult =
  | { ok: true; preview: ShayariPreview; reused: boolean; cleaned: boolean }
  | { ok: true; chooseKey: { original: string; options: string[] }; cleaned: boolean }
  | { ok: false; problem: "failed" | "serious" | "review" | "limit" | "closed"; message: string; original: string | null }
  | { ok: false; aiError: string; retryAfter: number | null };

const schema = z.object({
  context: z.enum(["dm", "exception", "thanks"]),
  requestId: z.string().uuid().nullable().optional(),
  itemId: z.string().uuid().nullable().optional(),
  wantId: z.string().uuid().nullable().optional(),
  quantity: z.number().positive().max(100000).nullable().optional(),
  pickupAt: z.string().max(40).nullable().optional(),
  returnAt: z.string().max(40).nullable().optional(),
  text: z.string().trim().min(1).max(2000),
  keyMessage: z.string().trim().min(1).max(400).nullable().optional(),
  language: z.enum(["urdu", "roman_urdu", "english"]),
  tone: z.enum(["friendly", "funny"]),
  fresh: z.boolean().optional(),
});

function localWhen(iso: string | null | undefined): { text: string; nums: string[] } {
  if (!iso) return { text: "", nums: [] };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { text: "", nums: [] };
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ, weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit", hour12: true,
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const nums = [get("day"), get("hour"), get("minute")].filter((x) => x && x !== "00");
  const text = `${get("weekday")} ${get("day")} ${get("month")}, ${get("hour")}:${get("minute")} ${get("dayPeriod").toUpperCase()}`;
  return { text, nums };
}

async function sha(s: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export const makeShayari = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => schema.parse(d))
  .handler(async ({ data, context }): Promise<ShayariResult> => {
    const { supabase, userId, claims } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ai = await import("./ai.server");
    const aiFail = (e: InstanceType<typeof ai.AiUnavailableError>): ShayariResult => ({ ok: false, aiError: e.message, retryAfter: e.retryAfter });
    if (data.text.length > MAX_SOURCE) {
      return { ok: false, problem: "failed", message: `This message is too long to rhyme (over ${MAX_SOURCE} letters). Shorten it, or send it as it is.`, original: null };
    }

    // 1) Who may write here, and the booking facts the model may use (read as the caller: RLS applies).
    let facts = "";
    let factNums: string[] = [];
    let ref: string;
    if (data.context === "dm" || data.context === "thanks") {
      if (!data.requestId) throw new Error("Not allowed");
      const { data: r } = await supabase
        .from("requests")
        .select("id, borrower_id, owner_id, status, kind, item_name, quantity, unit, pickup_at, return_at, picked_up_qty, returned_qty")
        .eq("id", data.requestId)
        .maybeSingle();
      if (!r || (r.borrower_id !== userId && r.owner_id !== userId)) throw new Error("Not allowed");
      if (r.status !== "confirmed" && r.status !== "completed") {
        return { ok: false, problem: "closed", message: "Chat opens after the owner says yes.", original: null };
      }
      const { data: blocked } = await supabase.rpc("is_blocked", { _a: r.owner_id, _b: r.borrower_id });
      if (blocked) return { ok: false, problem: "closed", message: "Chat is closed.", original: null };
      if (data.context === "thanks") {
        const { data: me } = await supabase.from("profiles").select("restricted").eq("id", userId).single();
        if (r.borrower_id !== userId) throw new Error("Only the borrower can send a thank-you card.");
        if (me?.restricted) return { ok: false, problem: "closed", message: "Your account is paused after a review, so thank-you cards are off.", original: null };
        if (!bookingDone(r)) {
          return { ok: false, problem: "closed", message: "You can say thanks once the owner confirms everything is back.", original: null };
        }
      }
      const p = localWhen(r.pickup_at);
      const b = localWhen(r.return_at);
      const unit = r.unit && r.unit !== "item" ? ` ${r.unit}` : "";
      facts = `Item: ${r.item_name}. Agreed amount: ${Number(r.quantity)}${unit}. Pickup: ${p.text}.${
        r.kind === "return" ? ` Return by: ${b.text}. Collected: ${Number(r.picked_up_qty)}. Returned: ${Number(r.returned_qty)}.` : " Used up, no return."
      } The writer is the ${r.borrower_id === userId ? "borrower" : "owner"}.`;
      factNums = [...numbersIn(`${Number(r.quantity)} ${Number(r.picked_up_qty)} ${Number(r.returned_qty)}`), ...p.nums, ...b.nums];
      ref = `req:${r.id}`;
    } else {
      if (!data.itemId) throw new Error("Not allowed");
      // Same visibility rules as the listing page (demo boundary, blocks, active listings only).
      const { data: rows } = await supabase.rpc("listing_detail", { _item: data.itemId });
      const found = (rows ?? [])[0];
      if (!found) throw new Error("This item is no longer available.");
      const it = { id: data.itemId, name: found.item_name, unit: found.unit, kind: found.kind };
      let pickup = data.pickupAt ?? null;
      let back = data.returnAt ?? null;
      let qty = data.quantity ?? null;
      if (data.wantId) {
        const { data: w } = await supabase.from("wants").select("borrower_id, pickup_at, return_at, quantity").eq("id", data.wantId).maybeSingle();
        if (!w || w.borrower_id !== userId) throw new Error("Not allowed");
        pickup = w.pickup_at;
        back = w.return_at;
        qty = qty ?? (w.quantity == null ? null : Number(w.quantity));
      }
      const p = localWhen(pickup);
      const b = localWhen(back);
      const unit = it.unit && it.unit !== "item" ? ` ${it.unit}` : "";
      facts = `Item asked for: ${it.name}.${qty ? ` Amount: ${qty}${unit}.` : ""}${p.text ? ` Pickup: ${p.text}.` : ""}${
        it.kind === "return" && b.text ? ` Return by: ${b.text}.` : ""
      } The owner has not agreed yet.`;
      factNums = [...(qty ? [String(qty)] : []), ...p.nums, ...b.nums];
      ref = `item:${it.id}`;
    }

    // 2) Small per-person limit (every try counts, even failed ones).
    const since = new Date(Date.now() - RATE_WINDOW_MIN * 60_000).toISOString();
    const { count } = await supabaseAdmin.from("shayari_attempts").select("id", { count: "exact", head: true }).eq("user_id", userId).gte("created_at", since);
    if ((count ?? 0) >= RATE_LIMIT) {
      return { ok: false, problem: "limit", message: "You've made a lot of rhymes. Please wait a few minutes, or send your original message.", original: null };
    }

    // 3) Reuse an unchanged valid preview: same person, place, booking facts, text, key message, language and tone.
    //    Checked before any AI call, so a repeated tap or an unchanged selection costs nothing.
    const sourceKey = await sha(JSON.stringify([data.context, ref, facts, data.text.trim(), data.keyMessage ?? null, data.language, data.tone]));
    if (!data.fresh) {
      const { data: old } = await supabaseAdmin
        .from("shayari_previews")
        .select("id, original, key_message, lines, meaning, language, tone")
        .eq("user_id", userId)
        .eq("source_key", sourceKey)
        .gte("created_at", new Date(Date.now() - 60 * 60_000).toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (old) {
        const { count: used } = await supabaseAdmin.from("messages").select("id", { count: "exact", head: true }).eq("preview_id", old.id);
        if (!used) return { ok: true, reused: true, cleaned: old.original !== data.text.trim(), preview: old as ShayariPreview };
      }
    }

    // 4) The safe source. For faraway requests the anonymity check runs BEFORE anything goes to the poetry writer.
    let source = data.text;
    let secrets: string[] = [];
    let cleaned = false;
    if (data.context === "exception") {
      const { safeNote, mySecrets } = await import("./safe-note.server");
      const email = typeof claims?.email === "string" ? claims.email : null;
      secrets = await mySecrets(supabase, userId, email);
      await supabaseAdmin.from("shayari_attempts").insert({ user_id: userId });
      const r = await safeNote(data.text, secrets);
      if (!r.ok) {
        if ("aiError" in r) return { ok: false, aiError: r.aiError, retryAfter: r.retryAfter ?? null };
        return { ok: false, problem: "review", message: r.review, original: null };
      }
      source = r.note;
      cleaned = r.removed;
    }
    const keyMessage = data.keyMessage ? (data.context === "exception" ? scrubPrivate(data.keyMessage, secrets) : data.keyMessage) : null;

    // 5) Write, check, and at most one correction.
    const nowLocal = localWhen(new Date().toISOString()).text;
    let feedback: string[] = [];
    for (let round = 1; round <= MAX_ROUNDS; round++) {
      await supabaseAdmin.from("shayari_attempts").insert({ user_id: userId });
      let draft: Awaited<ReturnType<typeof ai.writeShayari>>;
      try {
        draft = await ai.writeShayari({ source, keyMessage, language: data.language, tone: data.tone, context: data.context, facts, nowLocal, feedback });
      } catch (e) {
        if (e instanceof ai.AiUnavailableError) return aiFail(e);
        throw e;
      }
      if (draft.too_many && !keyMessage) {
        const options = draft.key_options.map((o) => (data.context === "exception" ? scrubPrivate(o, secrets) : o).trim()).filter(Boolean).slice(0, 4);
        if (options.length >= 2) return { ok: true, cleaned, chooseKey: { original: source, options } };
      }
      if (draft.serious && data.tone === "funny") {
        return {
          ok: false,
          problem: "serious",
          message: "This sounds serious, so we won't make it funny. Try Friendly or send your original message.",
          original: source,
        };
      }
      const key = keyMessage ?? draft.key_message.trim();
      const lines = draft.lines;
      const problems = [
        ...shapeProblems(lines, draft.meaning),
        ...(lines.length === 2 ? scriptProblems(data.language, [...lines, draft.meaning]) : []),
        ...numberProblems(keyMessage ?? source, { lines, meaning: draft.meaning }, factNums),
        ...(lines.length === 2 ? rhymeProblems(lines) : []),
        ...intentProblems(keyMessage ?? source, { lines, meaning: draft.meaning }),
      ];
      if (data.context === "exception" && draft.intent?.status === "confirmed") problems.push("The owner has not agreed: keep it as a request.");
      if (data.context === "exception" && [...lines, draft.meaning, key].some((t) => hasPrivate(t, secrets) || unsureContact(t))) {
        problems.push("Do not include names, phone numbers, emails or addresses.");
      }
      if (problems.length === 0) {
        try {
          const c = await ai.checkShayari({ source, keyMessage: key, language: data.language, context: data.context, lines, meaning: draft.meaning });
          if (!c.same_speaker) problems.push("Keep the same speaker: the sender stays the one speaking (I stays I).");
          if (!c.same_doer) problems.push("Keep the same person doing the action.");
          if (!c.same_act) problems.push("Keep the same kind of message: asking permission, question, request, answer or thanks.");
          if (!c.proposal_kept) problems.push("A proposed time or plan must stay a proposal.");
          if (!c.negation_kept) problems.push("Keep every 'not' from the message.");
          if (!c.condition_kept) problems.push("Keep every condition such as 'only if'.");
          if (!c.facts_kept) problems.push("The meaning must keep every item, number, date and time from the message.");
          if (c.invents) problems.push("Do not add facts that are not in the message.");
          if (c.claims_agreement) problems.push("Do not say anyone agreed.");
          if (c.identifying && data.context === "exception") problems.push("Do not include anything that identifies the person.");
          if (!c.rhymes) problems.push("The two lines must rhyme.");
          if (problems.length) problems.push(...c.problems.slice(0, 3));
        } catch (e) {
          if (e instanceof ai.AiUnavailableError) return aiFail(e);
          throw e;
        }
      }
      if (problems.length === 0) {
        const row = {
          user_id: userId,
          context: data.context,
          request_id: data.context === "exception" ? null : data.requestId!,
          item_id: data.context === "exception" ? data.itemId! : null,
          source_key: sourceKey,
          original: source,
          key_message: key.slice(0, 600),
          language: data.language,
          tone: data.tone,
          lines,
          meaning: draft.meaning,
        };
        const { data: saved, error } = await supabaseAdmin
          .from("shayari_previews")
          .insert(row)
          .select("id, original, key_message, lines, meaning, language, tone")
          .single();
        if (error || !saved) throw new Error("Could not save the rhyme. Please try again.");
        return { ok: true, reused: false, cleaned, preview: saved as ShayariPreview };
      }
      // Bodies are private: log only which checks failed.
      console.warn("[shayari] round", round, "failed checks:", problems.length);
      feedback = [...new Set(problems)].slice(0, 6);
    }
    const priv = data.context === "exception" && feedback.some((f) => /names|identif/i.test(f));
    return priv
      ? { ok: false, problem: "review", message: "Some words could identify you. Please edit your message and try again.", original: source }
      : { ok: false, problem: "failed", message: SHAYARI_FAILED, original: source };
  });
