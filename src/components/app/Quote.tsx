import type { ReactNode } from "react";
import { CalendarClock, Receipt } from "lucide-react";
import { DAY_RULE, fmtDateTime, fmtQty, money, quoteLine } from "@/lib/format";
import { cn } from "@/lib/utils";

export type QuoteRow = {
  /** "Owner A" etc. Leave empty for a single listing. */
  label?: string | undefined;
  itemName: string;
  kind: string;
  unit: string;
  quantity: number;
  priceRs: number;
  pricePer: number;
  period?: string | null | undefined;
  days?: number | null | undefined;
  /** Total worked out on the server for this row. */
  cost: number;
};

/**
 * Everything a person agrees to before a request is sent: amount, exact dates, chargeable period,
 * unit rate, each owner's subtotal and the full total. Totals come from the server.
 */
export function QuoteBox({
  rows,
  pickupAt,
  returnAt,
  budget,
  className,
}: {
  rows: QuoteRow[];
  pickupAt: string | null;
  returnAt: string | null;
  budget?: number | null;
  className?: string;
}) {
  const total = rows.reduce((s, r) => s + r.cost, 0);
  const qty = rows.reduce((s, r) => s + r.quantity, 0);
  const first = rows[0];
  const perDay = rows.some((r) => r.kind === "return" && r.period === "day" && r.priceRs > 0);
  const over = budget != null && budget > 0 && total > budget;
  const freeOnly = budget === 0 && total > 0;
  if (!first) return null;
  return (
    <div className={cn("space-y-2 rounded-xl bg-muted p-3 text-sm", className)} aria-label="Price check">
      <p className="flex items-center gap-2 font-semibold">
        <Receipt className="h-4 w-4 text-primary" aria-hidden /> Before you send
      </p>
      <dl className="grid gap-1">
        <Line label="You're asking for" value={`${fmtQty(qty, first.unit)} ${first.unit === "item" ? first.itemName.toLowerCase() : `of ${first.itemName.toLowerCase()}`}`} />
        <Line
          label="Pickup"
          value={pickupAt ? fmtDateTime(pickupAt) : "Not chosen"}
          icon={<CalendarClock className="h-4 w-4 text-primary" aria-hidden />}
        />
        {first.kind === "return" ? (
          <Line label="Bring back" value={returnAt ? fmtDateTime(returnAt) : "Not chosen"} icon={<CalendarClock className="h-4 w-4 text-primary" aria-hidden />} />
        ) : (
          <Line label="Bring back" value="Not needed — it gets used up" />
        )}
      </dl>
      <ul className="space-y-1 border-t pt-2">
        {rows.map((r, i) => (
          <li key={i} className="flex flex-wrap justify-between gap-x-3">
            <span>
              {r.label ? <strong>{r.label}: </strong> : null}
              {quoteLine({ kind: r.kind, unit: r.unit, quantity: r.quantity, priceRs: r.priceRs, pricePer: r.pricePer, period: r.period, days: r.days ?? undefined })}
            </span>
            {rows.length > 1 && <span className="font-semibold">{money(r.cost)}</span>}
          </li>
        ))}
      </ul>
      <p className="text-muted-foreground">No extra charges.</p>
      <p className="flex justify-between border-t pt-2 text-base font-bold">
        <span>{rows.length > 1 ? "Combined total" : "Total"}</span>
        <span>{money(total)}</span>
      </p>
      {perDay && <p className="text-xs text-muted-foreground">{DAY_RULE}</p>}
      {(over || freeOnly) && (
        <p className="font-semibold text-attention-foreground">
          {freeOnly ? "You asked for free items only, but this costs money." : `This is over your budget of ${money(budget ?? 0)}.`}
        </p>
      )}
      <p className="text-xs text-muted-foreground">You pay the owner directly. Cheez Udhaar does not move money. This exact price is saved with the booking.</p>
    </div>
  );
}

function Line({ label, value, icon }: { label: string; value: string; icon?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2">
      {icon}
      <dt className="text-muted-foreground">{label}:</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}
