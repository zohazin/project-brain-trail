// Shared, browser-safe formatting helpers. All times are shown in Pakistan time.
export const TZ = "Asia/Karachi";

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
    .format(new Date(iso))
    .replace(" at ", ", ")
    .replace(/\b(am|pm)\b/, (m) => m.toUpperCase());
}

export function fmtShort(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
    .format(new Date(iso))
    .replace(/\b(am|pm)\b/, (m) => m.toUpperCase());
}

export function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  })
    .format(new Date(iso))
    .replace(/\b(am|pm)\b/, (m) => m.toUpperCase());
}

export function fmtDistance(km: number | null | undefined): string {
  if (km == null) return "";
  if (km < 1) return "under 1 km away";
  return `about ${Math.round(km * 2) / 2} km away`;
}

export function fmtQty(qty: number, unit: string): string {
  const n = Number(qty);
  if (!unit || unit === "item") return String(n);
  return `${n} ${unit}`;
}

/** Number of started days between pickup and return (at least 1). Matches the database. */
export function daysBetween(fromIso: string | null | undefined, toIso: string | null | undefined): number {
  if (!fromIso || !toIso) return 1;
  const ms = new Date(toIso).getTime() - new Date(fromIso).getTime();
  return Math.max(1, Math.ceil(ms / 86_400_000));
}

// Money and amounts are scaled to whole numbers before multiplying, so 0.1 + 0.2 style errors can't creep in.
const scale = (n: number, f: number) => Math.round(Number(n) * f);

/**
 * Total price in rupees. Mirrors the database function price_for():
 * - use it up: price per amount (Rs 15 per 5 ml → 10 ml = Rs 30), rounded to whole rupees
 * - bring it back: price each, or price each per day (days = started days between pickup and return)
 */
export function costFor(
  kind: string,
  priceRs: number,
  pricePer: number,
  qty: number,
  opts?: { period?: string | null | undefined; days?: number | undefined },
): number {
  const paisa = scale(priceRs || 0, 100);
  if (paisa === 0) return 0;
  const q = scale(qty, 1000);
  if (kind === "use_up") {
    const per = scale(pricePer || 1, 1000) || 1000;
    return Math.round((paisa * q) / per / 100);
  }
  const days = opts?.period === "day" ? Math.max(1, Math.ceil(opts.days ?? 1)) : 1;
  return (paisa * q * days) / 100_000;
}

/**
 * The owner's price with its real unit:
 * - supplies: "Rs 15 per 5 ml"
 * - daily rental: "Rs 500 per day" (or "Rs 50 each per day" when several are listed)
 * - fixed fee: "Rs 500 per booking" (or "Rs 50 each per booking")
 */
export function priceLabel(
  kind: string,
  priceRs: number,
  pricePer: number,
  unit: string,
  period?: string | null,
  listed = 1,
): string {
  const p = Number(priceRs) || 0;
  if (p === 0) return "Free";
  if (kind === "use_up") return `Rs ${p} per ${fmtQty(pricePer, unit)}`;
  const each = Number(listed) > 1 ? " each" : "";
  return period === "day" ? `Rs ${p}${each} per day` : `Rs ${p}${each} per booking`;
}

/** How a daily price is counted, shown next to every per-day quote. */
export const DAY_RULE =
  "Per-day prices count each started 24 hours from the pickup time. Crossing midnight alone does not add a day, and a part day counts as a full day.";

export type QuoteParts = {
  kind: string;
  unit: string;
  quantity: number;
  priceRs: number;
  pricePer: number;
  period?: string | null | undefined;
  days?: number | undefined;
};

/** One plain line showing how the total is worked out, e.g. "3 × Rs 50 per day × 2 days = Rs 300". */
export function quoteLine(q: QuoteParts): string {
  const total = costFor(q.kind, q.priceRs, q.pricePer, q.quantity, { period: q.period, days: q.days });
  if (!Number(q.priceRs)) return "Free";
  if (q.kind === "use_up") return `${fmtQty(q.quantity, q.unit)} at Rs ${Number(q.priceRs)} per ${fmtQty(q.pricePer, q.unit)} = ${money(total)}`;
  const qty = `${q.quantity} × Rs ${Number(q.priceRs)}`;
  if (q.period === "day") {
    const d = Math.max(1, Math.ceil(q.days ?? 1));
    return `${qty} per day × ${d} ${d === 1 ? "day" : "days"} = ${money(total)}`;
  }
  return `${qty} per booking = ${money(total)}`;
}

/** Headline for a split request, e.g. "12 confirmed — 8 still needed". */
export function coverageLine(confirmed: number, needed: number): string {
  const still = Math.max(0, needed - confirmed);
  return still === 0 ? `All ${confirmed} confirmed` : `${confirmed} confirmed — ${still} still needed`;
}

export function money(n: number): string {
  return Number(n) === 0 ? "Free" : `Rs ${Math.round(Number(n)).toLocaleString("en-PK")}`;
}

/** Converts a value from <input type="datetime-local"> (Pakistan time) to ISO. */
export function localInputToIso(v: string): string | null {
  if (!v) return null;
  const d = new Date(`${v}:00+05:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** ISO -> value for <input type="datetime-local"> in Pakistan time. */
export function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(new Date(iso).getTime() + 5 * 3600 * 1000);
  return d.toISOString().slice(0, 16);
}

export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function fmtClock(t: string): string {
  const [h = 0, m = 0] = t.split(":").map(Number);
  const ap = h >= 12 ? "PM" : "AM";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(m).padStart(2, "0")} ${ap}`;
}

/** Anonymous name for an owner before they say yes: "Owner A", "Owner B", … (matches the database labels). */
export function ownerLabel(index: number): string {
  return `Owner ${String.fromCharCode(65 + (index % 26))}`;
}
