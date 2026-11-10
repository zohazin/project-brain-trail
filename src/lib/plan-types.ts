export type PlanLine = {
  item_id: string;
  /** Anonymous label such as "Owner A". Real names are shared only after an owner says yes. */
  label: string;
  item_name: string;
  kind: string;
  unit: string;
  quantity: number;
  free_qty: number;
  distance_km: number;
  /** Approximate pickup area, never an exact address. */
  area_name: string;
  price_rs: number;
  price_per: number;
  price_period?: string;
  cost: number;
  /** Chargeable days for a per-day price (each started 24 hours from pickup). */
  days?: number | undefined;
  /** Must-have features this listing doesn't mention: ask the owner. */
  unconfirmed?: string[] | undefined;
  measured?: boolean | undefined;
  photo_url: string | null;
  avg_rating: number | null;
  rating_count: number;
  condition?: string;
};

export type Plan = {
  km: number;
  need: number;
  lines: PlanLine[];
  found: number;
  missing: number;
  pickups: number;
  total: number;
  overBudget: boolean;
  unsuitable: { item_name: string; reason: string }[];
  exceptions: PlanLine[];
  /** Plain explanation of why the plan fits, or what is still short. */
  explanation?: string;
  /** Things the borrower should still check with the owner (unknown must-haves, estimates, condition). */
  checks?: string[];
  reason?: string;
  failed?: boolean;
  created_at?: string;
};
