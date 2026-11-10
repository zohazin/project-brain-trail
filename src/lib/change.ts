// Browser-safe: what happens to already-sent requests when a borrower changes how many they need.
// Mirrors the database function change_want_quantity() so the person sees the exact consequences first.

export type ChangeReq = {
  id: string;
  owner_name: string;
  quantity: number;
  status: string;
  picked_up_qty: number;
  created_at: string;
};

export type ChangeStep = {
  requestId: string;
  label: string;
  status: string;
  /**
   * cancel: not needed any more (cancelling before pickup is always allowed)
   * reduce: request not answered yet, changes right away
   * ask: accepted booking, the owner must agree first; until then the current amount stays booked
   */
  action: "cancel" | "reduce" | "ask";
  from: number;
  to: number;
};

export type ChangePreview = {
  from: number;
  to: number;
  steps: ChangeStep[];
  /** How many are still needed after the change (a new search covers them). */
  stillNeeded: number;
  /** False when items are already picked up and the number can't go that low. */
  possible: boolean;
};

const ACTIVE = ["requested", "confirmed", "completed"];

export type Reservation = {
  kind: string;
  quantity: number;
  picked_up_qty: number;
  returned_qty: number;
  pickup_at: string;
  return_at: string | null;
};

/**
 * Most units promised at any one moment by accepted bookings. Supplies: everything not yet handed over.
 * Reusable items: the busiest overlap of pickup→return windows (late items count until they come back).
 */
export function reservedPeak(list: Reservation[], now = Date.now()): number {
  const supplies = list.filter((r) => r.kind === "use_up").reduce((s, r) => s + Math.max(0, r.quantity - r.picked_up_qty), 0);
  const spans = list
    .filter((r) => r.kind !== "use_up" && r.quantity - r.returned_qty > 0)
    .map((r) => {
      const start = new Date(r.pickup_at).getTime();
      let end = new Date(r.return_at ?? r.pickup_at).getTime();
      if (r.picked_up_qty > r.returned_qty && end < now) end = Number.POSITIVE_INFINITY; // late: still out
      return { start, end, q: r.quantity - r.returned_qty };
    });
  let peak = 0;
  for (const a of spans) {
    const at = a.start;
    const sum = spans.filter((b) => b.start <= at && b.end > at).reduce((s, b) => s + b.q, 0);
    peak = Math.max(peak, sum);
  }
  return supplies + peak;
}

export function previewQuantityChange(reqs: ChangeReq[], from: number, to: number): ChangePreview {
  const covered = reqs.filter((r) => ACTIVE.includes(r.status)).reduce((s, r) => s + Number(r.quantity), 0);
  let excess = covered - to;
  const steps: ChangeStep[] = [];
  if (excess > 0) {
    const open = reqs
      .filter((r) => (r.status === "requested" || r.status === "confirmed") && Number(r.picked_up_qty) === 0)
      .sort((a, b) => {
        const s = (a.status === "requested" ? 0 : 1) - (b.status === "requested" ? 0 : 1);
        return s !== 0 ? s : new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
    for (const r of open) {
      if (excess <= 0) break;
      const q = Number(r.quantity);
      if (excess >= q) {
        steps.push({ requestId: r.id, label: r.owner_name, status: r.status, action: "cancel", from: q, to: 0 });
        excess -= q;
      } else {
        steps.push({
          requestId: r.id,
          label: r.owner_name,
          status: r.status,
          action: r.status === "confirmed" ? "ask" : "reduce",
          from: q,
          to: q - excess,
        });
        excess = 0;
      }
    }
  }
  // "ask" steps keep their current amount until the owner agrees.
  const after = covered - steps.filter((x) => x.action !== "ask").reduce((s, x) => s + (x.from - x.to), 0);
  return { from, to, steps, stillNeeded: Math.max(0, to - after), possible: excess <= 0 };
}
