// Browser-safe rules for AI demo results (fictional listings for demo accounts only). Pure, so they are unit-tested.
import { costFor, daysBetween, TZ } from "./format";

/** What the AI proposes for one fictional listing (before the server checks it). */
export type DemoListingDraft = {
  owner_first_name: string;
  item_name: string;
  category: string;
  description: string;
  specs: string;
  accessories: string;
  condition: string;
  quantity: number;
  price_rs: number;
  price_per: number;
  price_period: "each" | "day";
  distance_km: number;
  owner_limit_km: number;
  available_from: string;
  available_until: string;
  meets: string[];
  why_it_matches: string;
  summary: string;
};

/** The search as the server sees it when asking for fictional listings. */
export type DemoNeed = {
  item_name: string;
  kind: "return" | "use_up";
  unit: string;
  missing: number;
  budget_rs: number | null;
  pickup_at: string;
  return_at: string | null;
  search_km: number;
  requirements: string[];
};

/** Real demo names are never reused for simulated owners. */
export const RESERVED_NAMES = ["ali", "bilal", "sara", "usman", "hina", "farah", "zainab"];
export const MAX_DEMO_LISTINGS = 3;
/** Bounds so one presenter can't make endless AI calls. */
export const MAX_ROUNDS_PER_SEARCH = 6;
export const MAX_GENERATIONS_PER_DAY = 15;

const CONTACT = /(\+?92|\b0?3\d{2})[\s-]?\d{3,}|\d{7,}|@|https?:|www\.|\.com\b|whatsapp/i;
const STOP = new Set(["the", "and", "for", "with", "must", "have", "has", "needs", "need", "include", "includes", "including", "that", "can", "use", "able", "input", "port", "included", "size", "type", "work", "works"]);

/** Stable key for one version of a search: the same details never make a second AI call. */
export function demoVersionKey(n: DemoNeed): string {
  const parts = [
    n.item_name.trim().toLowerCase(),
    n.kind,
    n.unit.trim().toLowerCase(),
    String(n.missing),
    n.budget_rs == null ? "-" : String(n.budget_rs),
    n.pickup_at,
    n.return_at ?? "-",
    String(n.search_km),
    [...n.requirements].map((r) => r.trim().toLowerCase()).sort().join("|"),
  ].join("~");
  let h = 2166136261;
  for (let i = 0; i < parts.length; i++) {
    h ^= parts.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `v1-${(h >>> 0).toString(36)}-${parts.length}`;
}

/** "HH:MM" in Pakistan time. */
export function localHm(iso: string): string {
  const s = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
  return s.length === 4 ? `0${s}` : s;
}

function localDay(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

const HM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Same rule as the database's time check, for listings available every day. */
export function timeFits(from: string, until: string, pickupAt: string, returnAt: string | null, kind: string): boolean {
  if (!HM.test(from) || !HM.test(until) || from >= until) return false;
  const p = localHm(pickupAt);
  if (p < from || p > until) return false;
  if (kind === "return" && returnAt) {
    const r = localHm(returnAt);
    if (r > until) return false;
    if (localDay(returnAt) > localDay(pickupAt) && r < from) return false;
  }
  return true;
}

function words(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3 && !STOP.has(w));
}

/** Distance, area or time wording is checked by the search itself, not by the listing text. */
export function isSearchDetail(requirement: string): boolean {
  return /\b(\d+(\.\d+)?\s*km|kilomet|within|nearby|near me|ke andar|distance|budget|pickup time|return time)\b/i.test(requirement);
}

/** A must-have counts as met only when the listing's own text mentions it. */
export function mentions(requirement: string, text: string): boolean {
  const t = text.toLowerCase();
  const ws = words(requirement);
  if (ws.length === 0) return true;
  return ws.every((w) => t.includes(w) || (w.endsWith("s") && t.includes(w.slice(0, -1))));
}

/** Greedy share of the shortfall, nearest first (as the plan does when no single owner has enough). */
export function shareShortfall(list: Pick<DemoListingDraft, "quantity" | "distance_km">[], missing: number): number[] {
  const order = list.map((l, i) => ({ i, d: l.distance_km })).sort((a, b) => a.d - b.d);
  const out = list.map(() => 0);
  const single = order.find((o) => list[o.i]!.quantity >= missing);
  if (single) {
    out[single.i] = missing;
    return out;
  }
  let left = missing;
  for (const o of order) {
    const take = Math.min(left, list[o.i]!.quantity);
    out[o.i] = take;
    left -= take;
  }
  return out;
}

export type DemoCheck = { ok: true; listings: DemoListingDraft[] } | { ok: false; problems: string[] };

/** Server-side check of every AI-proposed listing against the search before anything is saved. */
export function checkDemoListings(raw: DemoListingDraft[], need: DemoNeed): DemoCheck {
  const problems: string[] = [];
  const list = (raw ?? []).slice(0, MAX_DEMO_LISTINGS + 1);
  if (list.length === 0) return { ok: false, problems: ["No listings were proposed."] };
  if (list.length > MAX_DEMO_LISTINGS) problems.push(`At most ${MAX_DEMO_LISTINGS} listings.`);
  const names = new Set<string>();
  list.forEach((l, i) => {
    const at = `Listing ${i + 1}`;
    const nm = (l.owner_first_name ?? "").trim();
    if (!/^[A-Za-z][A-Za-z ]{1,19}$/.test(nm)) problems.push(`${at}: owner first name must be a short plain name.`);
    if (RESERVED_NAMES.includes(nm.toLowerCase())) problems.push(`${at}: owner name ${nm} is already used by a demo account.`);
    if (names.has(nm.toLowerCase())) problems.push(`${at}: owner names must be different.`);
    names.add(nm.toLowerCase());
    if (!l.item_name || l.item_name.length > 80) problems.push(`${at}: item name missing or too long.`);
    if ((l.description ?? "").length > 400 || (l.specs ?? "").length > 300 || (l.accessories ?? "").length > 200) problems.push(`${at}: text too long.`);
    if ((l.condition ?? "").length > 120 || (l.category ?? "").length > 40 || (l.why_it_matches ?? "").length > 240) problems.push(`${at}: text too long.`);
    const all = [l.owner_first_name, l.item_name, l.description, l.specs, l.accessories, l.condition, l.why_it_matches, l.summary].join(" ");
    if (CONTACT.test(all)) problems.push(`${at}: must not contain phone numbers, emails, links or contact details.`);
    const q = Number(l.quantity);
    if (!(q > 0) || q > Math.max(need.missing * 2, need.missing + 5) || q > 100000) problems.push(`${at}: quantity must be between 1 and ${need.missing}.`);
    if (need.unit === "item" && !Number.isInteger(q)) problems.push(`${at}: quantity must be a whole number.`);
    const d = Number(l.distance_km);
    if (!(d >= 0.2) || d > need.search_km - 0.1) problems.push(`${at}: distance must be between 0.2 and ${(need.search_km - 0.1).toFixed(1)} km.`);
    const lim = Number(l.owner_limit_km);
    if (!(lim >= d + 0.2) || lim > 20) problems.push(`${at}: owner lending limit must be at least the distance plus 0.2 km (max 20).`);
    if (!(Number(l.price_rs) >= 0) || Number(l.price_rs) > 5000) problems.push(`${at}: price must be 0 to 5000 rupees.`);
    if (!(Number(l.price_per) > 0)) problems.push(`${at}: price_per must be above 0.`);
    if (need.kind === "use_up" && l.price_period !== "each") problems.push(`${at}: supplies are priced per amount (price_period "each").`);
    if (need.budget_rs === 0 && Number(l.price_rs) !== 0) problems.push(`${at}: the budget is zero, so it must be free.`);
    if (!timeFits(l.available_from, l.available_until, need.pickup_at, need.return_at, need.kind)) {
      problems.push(`${at}: availability ${l.available_from}–${l.available_until} must include pickup ${localHm(need.pickup_at)}${need.return_at && need.kind === "return" ? ` and return ${localHm(need.return_at)}` : ""}.`);
    }
    const text = `${l.item_name} ${l.description} ${l.specs} ${l.accessories}`;
    for (const r of need.requirements.filter((x) => !isSearchDetail(x))) {
      if (!mentions(r, text)) problems.push(`${at}: description or specs must clearly say it has "${r}".`);
    }
  });
  const sum = list.reduce((s, l) => s + (Number(l.quantity) || 0), 0);
  if (sum < need.missing) problems.push(`Together the listings must have at least ${need.missing} (now ${sum}).`);
  if (need.budget_rs != null && need.budget_rs > 0 && problems.length === 0) {
    const share = shareShortfall(list, need.missing);
    const days = daysBetween(need.pickup_at, need.return_at);
    const total = list.reduce(
      (s, l, i) => s + (share[i] ? costFor(need.kind, Number(l.price_rs), Number(l.price_per), share[i]!, { period: l.price_period, days }) : 0),
      0,
    );
    if (total > need.budget_rs) problems.push(`The total for ${need.missing} would be Rs ${total}, over the budget of Rs ${need.budget_rs}. Lower the prices.`);
  }
  return problems.length ? { ok: false, problems } : { ok: true, listings: list };
}

/** A point `km` away from (lat, lng) in direction `bearing` degrees. */
export function placeAt(lat: number, lng: number, km: number, bearing: number): { lat: number; lng: number } {
  const R = 6371;
  const br = (bearing * Math.PI) / 180;
  const p1 = (lat * Math.PI) / 180;
  const l1 = (lng * Math.PI) / 180;
  const dr = km / R;
  const p2 = Math.asin(Math.sin(p1) * Math.cos(dr) + Math.cos(p1) * Math.sin(dr) * Math.cos(br));
  const l2 = l1 + Math.atan2(Math.sin(br) * Math.sin(dr) * Math.cos(p1), Math.cos(dr) - Math.sin(p1) * Math.sin(p2));
  return { lat: (p2 * 180) / Math.PI, lng: (l2 * 180) / Math.PI };
}
