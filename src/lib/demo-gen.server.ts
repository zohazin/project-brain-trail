// Server-only: AI demo results. Fictional owners and listings, created live by AI for demo accounts only.
// The database stays the source of truth: generated listings are ordinary demo listings, matched, priced,
// sent and booked through the same functions as every other listing.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { Plan } from "./plan-types";
import {
  checkDemoListings,
  demoVersionKey,
  MAX_GENERATIONS_PER_DAY,
  MAX_ROUNDS_PER_SEARCH,
  placeAt,
  RESERVED_NAMES,
  type DemoListingDraft,
  type DemoNeed,
} from "./demo-gen";
import { MULTAN_AREAS, nearestArea } from "./areas";
import { fmtDateTime } from "./format";

type DB = SupabaseClient<Database>;
type Want = Database["public"]["Tables"]["wants"]["Row"];

export type DemoMode = "auto" | "retry" | "another";
/** Presenter test switch for demo accounts only: makes the AI step fail in a chosen way. Never honoured for real members. */
export type DemoFault = "timeout" | "balance" | "invalid" | "save";
export type DemoOutcome =
  | { ok: true; plan: Plan; created: boolean; note: string | null }
  | { ok: false; pending: true; aiError?: undefined; problem?: undefined }
  | { ok: false; aiError: string; retryAfter: number | null; pending?: undefined; problem?: undefined }
  | { ok: false; problem: string; pending?: undefined; aiError?: undefined };

const NOT_FIT = "The AI's sample listings didn't fit your request, so nothing was added.";
const STALE_MS = 120_000;

async function admin(): Promise<DB> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as DB;
}

/** Removes fictional listings (only those nobody has requested) and their simulated owners. */
export async function removeGenerations(db: DB, wantId: string): Promise<void> {
  const { data: gens } = await db.from("demo_generations").select("id, item_ids, owner_ids, status").eq("want_id", wantId);
  for (const g of gens ?? []) {
    for (const itemId of g.item_ids ?? []) {
      const { count } = await db.from("requests").select("id", { count: "exact", head: true }).eq("item_id", itemId);
      if (!count) await db.from("items").delete().eq("id", itemId).eq("is_generated", true);
    }
    for (const ownerId of g.owner_ids ?? []) await removeSimOwnerIfUnused(db, ownerId);
    if (g.status !== "replaced") await db.from("demo_generations").update({ status: "replaced" }).eq("id", g.id);
  }
}

async function removeSimOwnerIfUnused(db: DB, ownerId: string) {
  const { data: p } = await db.from("profiles").select("is_simulated").eq("id", ownerId).maybeSingle();
  if (!p?.is_simulated) return; // never touch a real or seeded account
  const [{ count: items }, { count: reqs }] = await Promise.all([
    db.from("items").select("id", { count: "exact", head: true }).eq("owner_id", ownerId),
    db.from("requests").select("id", { count: "exact", head: true }).eq("owner_id", ownerId),
  ]);
  if (!items && !reqs) await db.auth.admin.deleteUser(ownerId);
}

async function saveListings(db: DB, generationId: string, want: Want, need: DemoNeed, list: DemoListingDraft[], breakAfterFirst = false) {
  const itemIds: string[] = [];
  const ownerIds: string[] = [];
  const centre = MULTAN_AREAS[0]!;
  const lat = Number(want.lat ?? centre.lat);
  const lng = Number(want.lng ?? centre.lng);
  const keywords = new Set((want.ai_keywords ?? []).map((k) => k.toLowerCase()));
  try {
    for (const [i, l] of list.entries()) {
      const pt = placeAt(lat, lng, Number(l.distance_km), (i * 127 + Math.floor(Math.random() * 70)) % 360);
      const area = nearestArea(pt.lat, pt.lng).name;
      const name = l.owner_first_name.trim().replace(/\s+/g, " ");
      const u = await db.auth.admin.createUser({
        email: `sim-${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}@demo-owner.cheezudhaar.test`,
        password: `${crypto.randomUUID()}${crypto.randomUUID()}`,
        email_confirm: true,
        user_metadata: { display_name: name, simulated_demo_owner: true },
      });
      if (u.error || !u.data.user) throw new Error(`simulated owner: ${u.error?.message ?? "no user"}`);
      const ownerId = u.data.user.id;
      ownerIds.push(ownerId);
      const p = await db
        .from("profiles")
        .update({
          display_name: name,
          is_demo: true,
          is_simulated: true,
          ai_demo_results: false,
          onboarded: true,
          city: "Multan",
          area_name: area,
          lat: pt.lat,
          lng: pt.lng,
          travel_km: Number(l.owner_limit_km),
        })
        .eq("id", ownerId);
      if (p.error) throw new Error(`simulated owner profile: ${p.error.message}`);
      const kw = Array.from(new Set([...keywords, ...l.item_name.toLowerCase().split(/\s+/).filter((w) => w.length > 2)]));
      const it = await db
        .from("items")
        .insert({
          owner_id: ownerId,
          name: l.item_name.trim(),
          description: l.description.trim(),
          specs: l.specs.trim(),
          accessories: l.accessories.trim(),
          condition: l.condition.trim(),
          category: l.category.trim().slice(0, 40),
          kind: need.kind,
          unit: need.unit,
          quantity: Number(l.quantity),
          price_rs: Number(l.price_rs),
          price_per: need.kind === "use_up" ? Number(l.price_per) : 1,
          price_period: need.kind === "use_up" ? "each" : l.price_period,
          avail_days: [0, 1, 2, 3, 4, 5, 6],
          avail_start: `${l.available_from}:00`,
          avail_end: `${l.available_until}:00`,
          city: "Multan",
          area_name: area,
          lat: pt.lat,
          lng: pt.lng,
          max_distance_km: Number(l.owner_limit_km),
          allow_outside: false,
          status: "active",
          is_demo: true,
          is_generated: true,
          generation_id: generationId,
          why_it_matches: l.why_it_matches.trim().slice(0, 240),
          ai_summary: l.summary.trim(),
          ai_keywords: kw,
          summary_stale: false,
          measured: true,
        })
        .select("id")
        .single();
      if (it.error || !it.data) throw new Error(`sample listing: ${it.error?.message ?? "not saved"}`);
      itemIds.push(it.data.id);
      if (breakAfterFirst) throw new Error("test: connection lost while saving");
    }
    return { itemIds, ownerIds };
  } catch (e) {
    for (const id of itemIds) await db.from("items").delete().eq("id", id);
    for (const id of ownerIds) await db.auth.admin.deleteUser(id);
    throw e;
  }
}

/** Marks a creation that never finished as failed and removes anything it left behind (listings nobody requested, unused owners). */
async function abandon(db: DB, generationId: string) {
  const { data: items } = await db.from("items").select("id, owner_id").eq("generation_id", generationId).eq("is_generated", true);
  for (const it of items ?? []) {
    const { count } = await db.from("requests").select("id", { count: "exact", head: true }).eq("item_id", it.id);
    if (!count) await db.from("items").delete().eq("id", it.id);
    await removeSimOwnerIfUnused(db, it.owner_id);
  }
  await db.from("demo_generations").update({ status: "failed", error: "Creating sample matches stopped before it finished. Nothing was added.", finished_at: new Date().toISOString() }).eq("id", generationId).eq("status", "running");
}

/**
 * Fills only the missing amount of a demo search with fictional listings made live by AI.
 * - "auto": reuses what was already made for these exact details (no second AI call).
 * - "retry": after a failure, the presenter asked to try again.
 * - "another": the presenter asked for a different sample plan (only before anything was sent).
 */
export async function demoPlan(args: { borrowerId: string; wantId: string; km: number; mode: DemoMode; fault?: DemoFault | undefined }): Promise<DemoOutcome> {
  const db = await admin();
  const [{ data: me }, { data: want }] = await Promise.all([
    db.from("profiles").select("is_demo, is_simulated, ai_demo_results, restricted").eq("id", args.borrowerId).single(),
    db.from("wants").select("*").eq("id", args.wantId).single(),
  ]);
  if (!me?.is_demo || me.is_simulated) throw new Error("AI demo results are only for demo accounts.");
  if (!want || want.borrower_id !== args.borrowerId) throw new Error("Not found");
  if (!me.ai_demo_results) return { ok: false, problem: "AI demo results are switched off in your profile." };
  if (me.restricted) return { ok: false, problem: "Your account is paused after a review." };
  if (!want.item_name || !want.quantity || !want.pickup_at || !["ready", "active"].includes(want.status)) {
    return { ok: false, problem: "Finish the request details first." };
  }
  if (want.kind === "return" && !want.return_at) return { ok: false, problem: "Please say when you will bring it back first." };
  if (new Date(want.pickup_at).getTime() < Date.now() - 15 * 60_000) return { ok: false, problem: "The pickup time has passed. Please choose a new time." };

  const { buildPlan } = await import("./plan.server");
  if (args.mode === "another") {
    const { count } = await db.from("requests").select("id", { count: "exact", head: true }).eq("want_id", want.id);
    if (count) return { ok: false, problem: "Requests were already sent for this search, so its sample plan can't be replaced. Reset the demo to start again." };
    await removeGenerations(db, want.id);
  }
  let plan = await buildPlan(want, args.km);
  if (plan.missing <= 0) {
    return {
      ok: true,
      plan,
      created: false,
      note: args.mode === "another" ? "Enough demo stock was found, so no fictional listings were needed." : null,
    };
  }

  // Budget left for the shortfall: what is already found or booked is paid first.
  const { data: active } = await db.from("requests").select("total_rs, status").eq("want_id", want.id).in("status", ["requested", "confirmed", "completed"]);
  const spent = plan.total + (active ?? []).reduce((s, r) => s + Number(r.total_rs), 0);
  const budget = want.budget_rs == null ? null : Math.max(0, Number(want.budget_rs) - spent);
  const need: DemoNeed = {
    item_name: want.item_name,
    kind: want.kind === "use_up" ? "use_up" : "return",
    unit: want.unit || "item",
    missing: plan.missing,
    budget_rs: budget,
    pickup_at: want.pickup_at,
    return_at: want.kind === "return" ? want.return_at : null,
    search_km: args.km,
    requirements: want.requirements ?? [],
  };
  const key = demoVersionKey(need);
  const { data: prev } = await db
    .from("demo_generations")
    .select("*")
    .eq("want_id", want.id)
    .eq("version_key", key)
    .order("round", { ascending: false })
    .limit(1);
  const last = prev?.[0];
  const fresh = last ? Date.now() - new Date(last.created_at).getTime() < STALE_MS : false;
  if (last?.status === "running" && fresh) return { ok: false, pending: true };
  if (last?.status === "running" && !fresh) await abandon(db, last.id); // a creation that never finished: clear its leftovers
  // A ready result is reused for "auto" and also for "retry": a retry after a lost answer must not create a second set.
  if (last?.status === "ready" && args.mode !== "another") {
    return { ok: true, plan, created: false, note: "The saved sample listings don't cover everything for these details. You can create another sample plan." };
  }
  if (last && args.mode === "auto") {
    if (last.status === "ready") {
      return { ok: true, plan, created: false, note: "The saved sample listings don't cover everything for these details. You can create another sample plan." };
    }
    if (last.status === "failed") return { ok: false, aiError: last.error ?? NOT_FIT, retryAfter: null };
  }

  const since = new Date(Date.now() - 86_400_000).toISOString();
  const [{ count: rounds }, { count: today }] = await Promise.all([
    db.from("demo_generations").select("id", { count: "exact", head: true }).eq("want_id", want.id),
    db.from("demo_generations").select("id", { count: "exact", head: true }).eq("borrower_id", args.borrowerId).gte("created_at", since),
  ]);
  if ((rounds ?? 0) >= MAX_ROUNDS_PER_SEARCH) {
    return { ok: false, problem: "This search already has the most sample plans. Reset the demo or start a new search." };
  }
  if ((today ?? 0) >= MAX_GENERATIONS_PER_DAY) {
    return { ok: false, problem: "You've made many sample plans today. Reset the demo or try again tomorrow." };
  }

  const { proposeDemoListings, AiUnavailableError, textModel, logAiEvent } = await import("./ai.server");
  const ins = await db
    .from("demo_generations")
    .insert({ want_id: want.id, borrower_id: args.borrowerId, version_key: key, round: (last?.round ?? 0) + 1, missing: need.missing, model: textModel() })
    .select("id")
    .single();
  if (ins.error || !ins.data) {
    if (ins.error?.code === "23505") return { ok: false, pending: true }; // another tap is already creating it
    throw new Error(ins.error?.message ?? "Could not start");
  }
  const genId = ins.data.id;
  const fail = (msg: string) => db.from("demo_generations").update({ status: "failed", error: msg, finished_at: new Date().toISOString() }).eq("id", genId);

  const { data: sims } = await db.from("profiles").select("display_name").eq("is_simulated", true).limit(200);
  const avoid = Array.from(new Set([...RESERVED_NAMES, ...(sims ?? []).map((s) => s.display_name.toLowerCase())])).slice(0, 60);
  const ask = async (problems?: string[]) => {
    if (args.fault === "timeout") throw new AiUnavailableError("timeout");
    if (args.fault === "balance") throw new AiUnavailableError("balance");
    if (args.fault === "invalid") return { listings: [] as DemoListingDraft[] };
    return proposeDemoListings({
      need,
      summary: want.ai_summary ?? `${want.quantity} ${want.item_name}`,
      details: want.details,
      purpose: want.purpose,
      pickupLocal: fmtDateTime(want.pickup_at),
      returnLocal: need.return_at ? fmtDateTime(need.return_at) : null,
      alreadyFound: plan.found + (active ?? []).length,
      avoidNames: avoid,
      ...(problems ? { problems } : {}),
    });
  };
  try {
    let check = checkDemoListings((await ask()).listings, need);
    if (!check.ok) check = checkDemoListings((await ask(check.problems)).listings, need); // one bounded correction
    if (!check.ok) {
      console.error("[demo] proposal rejected", check.problems.slice(0, 5));
      await logAiEvent("demo_listings", "invalid", { code: "failed_checks" });
      await fail(NOT_FIT);
      return { ok: false, aiError: NOT_FIT, retryAfter: null };
    }
    const made = await saveListings(db, genId, want, need, check.listings, args.fault === "save");
    await db
      .from("demo_generations")
      .update({ status: "ready", item_ids: made.itemIds, owner_ids: made.ownerIds, proposal: check.listings, finished_at: new Date().toISOString() })
      .eq("id", genId);
    plan = await buildPlan(want, args.km);
    return { ok: true, plan, created: true, note: plan.missing > 0 ? "Some fictional listings didn't pass the final check. You can create another sample plan." : null };
  } catch (e) {
    if (e instanceof AiUnavailableError) {
      await fail(e.message);
      return { ok: false, aiError: e.message, retryAfter: e.retryAfter };
    }
    console.error("[demo] failed", e);
    await fail("Something went wrong while creating the sample listings. Nothing was added.");
    return { ok: false, aiError: "Something went wrong while creating the sample listings. Nothing was added.", retryAfter: null };
  }
}

/** Reset: removes every fictional listing, simulated owner and generation log. Seeded and real accounts are untouched. */
export async function wipeGenerated(db: DB, demoIds: string[]): Promise<void> {
  const { data: sims } = await db.from("profiles").select("id").eq("is_simulated", true).eq("is_demo", true);
  const simIds = (sims ?? []).map((s) => s.id);
  if (simIds.length) {
    const { error: re } = await db.from("requests").delete().in("owner_id", simIds).in("borrower_id", demoIds);
    if (re) throw new Error(`Could not reset sample bookings: ${re.message}`);
  }
  const { error: ie } = await db.from("items").delete().eq("is_generated", true).eq("is_demo", true);
  if (ie) throw new Error(`Could not reset sample listings: ${ie.message}`);
  if (demoIds.length) await db.from("demo_generations").delete().in("borrower_id", demoIds);
  for (const id of simIds) await db.auth.admin.deleteUser(id);
}
