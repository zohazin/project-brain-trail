// Server-only: builds a borrowing plan from real database data (quantity, price, distance, times).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { judgeItems, summarizeItem } from "./ai.server";
import { costFor, daysBetween, fmtDistance, ownerLabel as letter } from "./format";
import type { Plan, PlanLine } from "./plan-types";

type DB = SupabaseClient<Database>;
type Want = Database["public"]["Tables"]["wants"]["Row"];
type Cand = Database["public"]["Functions"]["match_items"]["Returns"][number];

async function admin(): Promise<DB> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as DB;
}

export async function signPaths(paths: (string | null | undefined)[]): Promise<Record<string, string>> {
  const list = Array.from(new Set(paths.filter((p): p is string => Boolean(p))));
  if (list.length === 0) return {};
  const sb = await admin();
  const { data } = await sb.storage.from("photos").createSignedUrls(list, 60 * 60);
  const out: Record<string, string> = {};
  for (const row of data ?? []) if (row.path && row.signedUrl) out[row.path] = row.signedUrl;
  return out;
}

/** Makes sure each item has a fresh private AI summary. */
export async function refreshItemSummary(itemId: string) {
  const sb = await admin();
  const { data: it } = await sb.from("items").select("*").eq("id", itemId).single();
  if (!it) return;
  const s = await summarizeItem({
    name: it.name,
    description: it.description,
    specs: it.specs,
    kind: it.kind,
    unit: it.unit,
  });
  const keywords = Array.from(
    new Set([...s.keywords, ...it.name.toLowerCase().split(/\s+/)].map((k) => k.trim().toLowerCase()).filter(Boolean)),
  );
  await sb
    .from("items")
    .update({ ai_summary: s.summary, ai_keywords: keywords, summary_stale: false })
    .eq("id", itemId);
}

/**
 * Builds the plan for a want. Always reads through the server client: the caller must already
 * have checked that the want belongs to the signed-in borrower (or this is an automatic backup search).
 * Owners stay anonymous ("Owner A") until they say yes.
 */
export async function buildPlan(want: Want, km: number): Promise<Plan> {
  const db = await admin();
  const [{ data: reqs }, { data: mine }] = await Promise.all([
    db.from("requests").select("item_id, quantity, status").eq("want_id", want.id),
    db
      .from("requests")
      .select("item_id, status, is_exception, decided_at, want_id")
      .eq("borrower_id", want.borrower_id)
      .in("status", ["requested", "declined"]),
  ]);
  const active = (reqs ?? []).filter((r) => ["requested", "confirmed", "completed"].includes(r.status));
  const covered = active.reduce((s, r) => s + Number(r.quantity), 0);
  const skipItems = new Set((reqs ?? []).map((r) => r.item_id)); // never re-ask an owner who said no
  const waitingElsewhere = new Set(
    (mine ?? []).filter((r) => r.status === "requested" && r.want_id !== want.id).map((r) => r.item_id),
  );
  const monthAgo = Date.now() - 30 * 24 * 3600 * 1000;
  const exceptionRefused = new Set(
    (mine ?? [])
      .filter((r) => r.status === "declined" && r.is_exception && r.decided_at && new Date(r.decided_at).getTime() > monthAgo)
      .map((r) => r.item_id),
  );
  const need = Math.max(0, Number(want.quantity ?? 0) - covered);
  const offset = (reqs ?? []).length;

  const base: Plan = {
    km,
    need,
    lines: [],
    found: 0,
    missing: need,
    pickups: 0,
    total: 0,
    overBudget: false,
    unsuitable: [],
    exceptions: [],
  };
  if (need === 0) return base;

  const first = await db.rpc("match_items", { _want: want.id, _km: km });
  if (first.error) throw new Error(first.error.message);
  let cands: Cand[] = (first.data ?? []).filter((c) => !skipItems.has(c.item_id));

  // Fill in any missing / outdated AI summaries first.
  const stale = cands.filter((c) => c.needs_summary).slice(0, 12);
  if (stale.length) {
    await Promise.all(stale.map((c) => refreshItemSummary(c.item_id)));
    const again = await db.rpc("match_items", { _want: want.id, _km: km });
    if (again.error) throw new Error(again.error.message);
    cands = (again.data ?? []).filter((c) => !skipItems.has(c.item_id));
  }

  // Private summaries pick the right kind of item; must-have features are checked against the real listing.
  const verdicts = await judgeItems(
    want.ai_summary ?? `${want.quantity} ${want.item_name}`,
    want.requirements ?? [],
    cands.slice(0, 40).map((c) => ({
      id: c.item_id,
      name: c.item_name,
      summary: c.ai_summary ?? c.item_name,
      description: c.description ?? "",
      specs: c.specs ?? "",
    })),
  );
  const verdict = new Map(verdicts.map((v) => [v.id, v]));
  const where = (c: Cand) => `${c.item_name.toLowerCase()} ${fmtDistance(Number(c.distance_km))}`;
  const rightKind = cands.filter((c) => verdict.get(c.item_id)?.right_kind);
  cands = [];
  for (const c of rightKind) {
    const miss = verdict.get(c.item_id)?.missing;
    if (miss) {
      base.unsuitable.push({ item_name: c.item_name, reason: `The ${where(c)} doesn't fit: ${miss}.` });
      continue;
    }
    cands.push(c);
  }

  const budget = want.budget_rs == null ? null : Number(want.budget_rs);
  const photos = await signPaths(cands.map((c) => c.photo_path));
  const days = daysBetween(want.pickup_at, want.return_at);
  const toLine = (c: Cand, qty: number, label: string): PlanLine => ({
    item_id: c.item_id,
    label,
    item_name: c.item_name,
    kind: c.kind,
    unit: c.unit,
    quantity: qty,
    free_qty: Number(c.free_qty),
    distance_km: Number(c.distance_km),
    area_name: c.area_name ?? "",
    price_rs: Number(c.price_rs),
    price_per: Number(c.price_per),
    price_period: c.price_period ?? "each",
    cost: costFor(c.kind, Number(c.price_rs), Number(c.price_per), qty, { period: c.price_period, days }),
    days: c.kind === "return" && c.price_period === "day" ? days : undefined,
    unconfirmed: verdict.get(c.item_id)?.unconfirmed ?? [],
    photo_url: c.photo_path ? (photos[c.photo_path] ?? null) : null,
    avg_rating: c.avg_rating == null ? null : Number(c.avg_rating),
    rating_count: c.rating_count ?? 0,
    condition: c.condition ?? "",
  });

  const eligible: Cand[] = [];
  const far: Cand[] = [];
  for (const c of cands) {
    const free = Number(c.free_qty);
    if (waitingElsewhere.has(c.item_id)) {
      base.unsuitable.push({ item_name: c.item_name, reason: `You already have a request waiting for the ${where(c)}.` });
      continue;
    }
    if (c.time_note) {
      let note = c.time_note.charAt(0).toLowerCase() + c.time_note.slice(1);
      if (free > 1) note = note.replace("needs it back", "needs them back");
      base.unsuitable.push({
        item_name: c.item_name,
        reason: `An owner ${fmtDistance(Number(c.distance_km))} has ${free} ${c.item_name.toLowerCase()}, but ${note}. These don't fit your times.`,
      });
      continue;
    }
    if (free <= 0) {
      base.unsuitable.push({ item_name: c.item_name, reason: `The ${where(c)} is already booked at that time.` });
      continue;
    }
    if (c.kind === "use_up" && c.min_amount != null && need < Number(c.min_amount)) {
      base.unsuitable.push({ item_name: c.item_name, reason: `The ${where(c)} is only shared from ${Number(c.min_amount)} ${c.unit}.` });
      continue;
    }
    if (c.kind === "use_up" && c.step_amount != null && Math.round(need * 1000) % Math.round(Number(c.step_amount) * 1000) !== 0) {
      base.unsuitable.push({ item_name: c.item_name, reason: `The ${where(c)} comes in steps of ${Number(c.step_amount)} ${c.unit}.` });
      continue;
    }
    if (budget === 0 && Number(c.price_rs) > 0) {
      base.unsuitable.push({ item_name: c.item_name, reason: `The ${where(c)} is not free.` });
      continue;
    }
    if (Number(c.distance_km) > Number(c.owner_limit_km)) {
      // Outside the owner's lending limit: only an exception request, and only if the owner allows it.
      if (c.allow_outside && !exceptionRefused.has(c.item_id)) far.push(c);
      continue;
    }
    eligible.push(c);
  }

  // Prefer one owner who has everything (fewer pickups); otherwise combine the nearest owners.
  eligible.sort((a, b) => Number(a.distance_km) - Number(b.distance_km) || Number(a.price_rs) - Number(b.price_rs));
  const single = eligible.find((c) => Number(c.free_qty) >= need);
  let left = need;
  if (single) {
    base.lines.push(toLine(single, need, letter(offset)));
    left = 0;
  } else {
    for (const c of eligible) {
      if (left <= 0) break;
      const take = Math.min(left, Number(c.free_qty));
      base.lines.push(toLine(c, take, letter(offset + base.lines.length)));
      left -= take;
    }
  }
  base.exceptions = far.map((c, j) =>
    toLine(c, Math.min(need, Number(c.free_qty)), letter(offset + base.lines.length + j)),
  );
  base.found = need - left;
  base.missing = left;
  base.pickups = base.lines.length;
  base.total = base.lines.reduce((s, l) => s + l.cost, 0);
  base.overBudget = budget != null && budget > 0 && base.total > budget;
  base.explanation = explainPlan(base, (want.item_name ?? "items").toLowerCase(), want.unit);
  base.checks = stillToCheck(base.lines, cands);
  await markGenerated(db, [...base.lines, ...base.exceptions], base, want.id);
  return base;
}

/** Labels fictional AI demo listings so they are never shown as real neighbours. */
async function markGenerated(db: DB, lines: PlanLine[], plan: Plan, wantId: string) {
  if (lines.length === 0) return;
  const { data } = await db
    .from("items")
    .select("id, why_it_matches, created_at, generation_id")
    .in("id", lines.map((l) => l.item_id))
    .eq("is_generated", true);
  if (!data?.length) return;
  const gen = new Map(data.map((d) => [d.id, d]));
  // The AI's one-line reason was written for the search that created the listing; another search gets the checked reasons only.
  const genIds = Array.from(new Set(data.map((d) => d.generation_id).filter((g): g is string => Boolean(g))));
  const { data: mine } = genIds.length ? await db.from("demo_generations").select("id").in("id", genIds).eq("want_id", wantId) : { data: [] };
  const own = new Set((mine ?? []).map((m) => m.id));
  for (const l of lines) {
    const g = gen.get(l.item_id);
    if (!g) continue;
    l.generated = true;
    l.why = g.generation_id && own.has(g.generation_id) ? g.why_it_matches || undefined : undefined;
  }
  plan.demoCreatedAt = data.map((d) => d.created_at).sort()[0];
}

/** What the borrower should still confirm with each owner. Unknown must-haves stay questions, never assumed. */
export function stillToCheck(lines: PlanLine[], cands: { item_id: string; measured?: boolean | null; condition?: string | null }[]): string[] {
  const out: string[] = [];
  const byId = new Map(cands.map((c) => [c.item_id, c]));
  for (const l of lines) {
    for (const f of l.unconfirmed ?? []) out.push(`Ask ${l.label} whether it has ${f.replace(/^(includes?|with|has)\s+/i, "")}. The listing doesn't say.`);
    const c = byId.get(l.item_id);
    if (l.kind === "use_up" && c && c.measured === false) out.push(`${l.label}'s amount is an estimate. Check it at pickup.`);
    if (l.kind === "return" && !(c?.condition ?? "").trim()) out.push(`${l.label} didn't describe the condition. Check it at pickup and add a photo.`);
  }
  out.push("The exact pickup place is shared only after an owner says yes.");
  return out;
}

/** Plain-English reason the plan fits, or what is still short. Built from the checked numbers, not guessed. */
export function explainPlan(p: Plan, name: string, unit: string): string {
  const amt = (n: number) => (unit === "item" ? `${n} ${name}` : `${n} ${unit} of ${name}`);
  if (p.lines.length === 0) {
    return p.exceptions.length
      ? `Nobody within ${p.km} km can lend ${amt(p.need)} for your times, but an owner farther away accepts exception requests.`
      : `Nobody within ${p.km} km has ${amt(p.need)} free for your times.`;
  }
  const parts = p.lines.map((l) => `${l.label} has ${l.quantity} free ${l.area_name ? `near ${l.area_name}` : "nearby"}`);
  const who = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  const fits = p.lines.length === 1 ? "is free at your times and within both distance limits" : "are all free at your times and within both distance limits";
  const short = p.missing > 0 ? ` That still leaves ${amt(p.missing)} short.` : "";
  return `${who}. ${p.lines.length === 1 ? "This owner" : "They"} ${fits}.${short}`;
}

/** After an owner declines: look only for the missing amount and save it for the borrower to approve. */
export async function prepareBackup(wantId: string, reason: string) {
  const sb = await admin();
  const { data: want } = await sb.from("wants").select("*").eq("id", wantId).single();
  if (!want) return;
  try {
    const plan = await buildPlan(want, Number(want.search_km));
    await sb
      .from("wants")
      .update({ pending_plan: { ...plan, reason, created_at: new Date().toISOString() } })
      .eq("id", wantId);
  } catch (e) {
    console.error("[backup] failed", e);
    await sb
      .from("wants")
      .update({
        pending_plan: {
          km: Number(want.search_km),
          need: 0,
          lines: [],
          found: 0,
          missing: 0,
          pickups: 0,
          total: 0,
          overBudget: false,
          unsuitable: [],
          exceptions: [],
          reason,
          failed: true,
          created_at: new Date().toISOString(),
        },
      })
      .eq("id", wantId);
  }
}
