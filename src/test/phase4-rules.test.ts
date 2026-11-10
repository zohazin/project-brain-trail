import { describe, expect, it } from "vitest";
import { coverageLine, daysBetween, priceLabel, quoteLine } from "@/lib/format";
import { previewQuantityChange } from "@/lib/change";
import { nextSundayLabel } from "@/components/app/DemoAccounts";

describe("Price units are shown before requesting", () => {
  it("a reusable projector with a fixed fee shows 'Rs 500 per booking', not 'each'", () => {
    expect(priceLabel("return", 500, 1, "item", "each", 1)).toBe("Rs 500 per booking");
  });
  it("a daily rental shows 'Rs 500 per day'", () => {
    expect(priceLabel("return", 500, 1, "item", "day", 1)).toBe("Rs 500 per day");
  });
  it("supplies show the price and measured amount: 'Rs 15 per 5 ml'", () => {
    expect(priceLabel("use_up", 15, 5, "ml")).toBe("Rs 15 per 5 ml");
  });
  it("free listings stay 'Free'", () => {
    expect(priceLabel("return", 0, 1, "item", "day", 20)).toBe("Free");
  });
});

describe("Daily rental rule: each started 24 hours from pickup", () => {
  it("Sat 6 PM to Sun 10 AM crosses midnight but is 16 hours, so 1 day", () => {
    expect(daysBetween("2026-11-14T13:00:00.000Z", "2026-11-15T05:00:00.000Z")).toBe(1);
  });
  it("25 hours is 2 days (a part day counts as a full day)", () => {
    expect(daysBetween("2026-11-14T08:00:00.000Z", "2026-11-15T09:00:00.000Z")).toBe(2);
  });
  it("the quote line shows the working: 3 × Rs 50 per day × 2 days = Rs 300", () => {
    expect(quoteLine({ kind: "return", unit: "item", quantity: 3, priceRs: 50, pricePer: 1, period: "day", days: 2 })).toBe(
      "3 × Rs 50 per day × 2 days = Rs 300",
    );
  });
  it("glue: 10 ml at Rs 15 per 5 ml = Rs 30", () => {
    expect(quoteLine({ kind: "use_up", unit: "ml", quantity: 10, priceRs: 15, pricePer: 5 })).toBe("10 ml at Rs 15 per 5 ml = Rs 30");
  });
});

describe("Confirmed vs still needed", () => {
  it("12 of 20 chairs confirmed reads '12 confirmed — 8 still needed'", () => {
    expect(coverageLine(12, 20)).toBe("12 confirmed — 8 still needed");
  });
});

describe("Changing an accepted booking needs the owner's yes", () => {
  const reqs = [{ id: "a", owner_name: "Owner A", quantity: 12, status: "confirmed", picked_up_qty: 0, created_at: "2026-11-09T10:00:00Z" }];
  it("12 → 10 on an accepted booking is a request to the owner, and the 12 stay booked until then", () => {
    const p = previewQuantityChange(reqs, 12, 10);
    expect(p.steps).toEqual([{ requestId: "a", label: "Owner A", status: "confirmed", action: "ask", from: 12, to: 10 }]);
    expect(p.stillNeeded).toBe(0);
  });
  it("an unanswered request changes right away", () => {
    const p = previewQuantityChange([{ ...reqs[0]!, status: "requested" }], 12, 10);
    expect(p.steps[0]?.action).toBe("reduce");
  });
});

describe("Demo dates are calculated, never fixed", () => {
  it("on Tuesday 10 November 2026 the demo Sunday is 15 November 2026", () => {
    expect(nextSundayLabel(new Date("2026-11-10T04:12:00Z"))).toBe("Sunday 15 November 2026");
  });
  it("on a Sunday it points to the next Sunday", () => {
    expect(nextSundayLabel(new Date("2026-11-15T06:00:00Z"))).toBe("Sunday 22 November 2026");
  });
});
