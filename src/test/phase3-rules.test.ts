import { describe, expect, it } from "vitest";
import { costFor, daysBetween, priceLabel } from "@/lib/format";
import { previewQuantityChange, reservedPeak } from "@/lib/change";
import { swBlocked } from "@/lib/pwa";

describe("Per-day prices", () => {
  it("Rs 50 each per day for 3 chairs over 2 started days is Rs 300", () => {
    const days = daysBetween("2026-11-15T08:00:00.000Z", "2026-11-16T09:00:00.000Z");
    expect(days).toBe(2);
    expect(costFor("return", 50, 1, 3, { period: "day", days })).toBe(300);
  });
  it("a booking shorter than a day still counts as 1 day", () => {
    expect(daysBetween("2026-11-15T08:00:00.000Z", "2026-11-15T13:00:00.000Z")).toBe(1);
  });
  it("shows 'each per day' for per-day items when several are listed", () => {
    expect(priceLabel("return", 50, 1, "item", "day", 3)).toBe("Rs 50 each per day");
  });
});

describe("Safe decimal amounts for supplies", () => {
  it("Rs 15 per 5 ml for 10 ml is exactly Rs 30", () => {
    expect(costFor("use_up", 15, 5, 10)).toBe(30);
  });
  it("Rs 0.1 per 0.1 litre for 0.3 litre is Rs 0 after rounding to whole rupees, never a float slip", () => {
    expect(costFor("use_up", 0.1, 0.1, 0.3)).toBe(0);
  });
  it("Rs 25 per 0.5 kg for 1.5 kg is Rs 75", () => {
    expect(costFor("use_up", 25, 0.5, 1.5)).toBe(75);
  });
});

const req = (id: string, owner: string, quantity: number, status: string, created: string, picked = 0) => ({
  id,
  owner_name: owner,
  quantity,
  status,
  picked_up_qty: picked,
  created_at: created,
});

describe("Changing 20 chairs to 15 after sending", () => {
  const reqs = [req("a", "Owner A", 12, "confirmed", "2026-11-09T10:00:00Z"), req("b", "Owner B", 8, "requested", "2026-11-09T10:01:00Z")];
  it("lowers the request that isn't answered yet first (Owner B 8 → 3) and keeps Owner A's accepted 12", () => {
    const p = previewQuantityChange(reqs, 20, 15);
    expect(p.steps).toEqual([{ requestId: "b", label: "Owner B", status: "requested", action: "reduce", from: 8, to: 3 }]);
    expect(p.stillNeeded).toBe(0);
    expect(p.possible).toBe(true);
  });
  it("going down to 10 cancels Owner B and asks Owner A to agree to 10 (their accepted 12 stay until then)", () => {
    const p = previewQuantityChange(reqs, 20, 10);
    expect(p.steps.map((s) => [s.label, s.action, s.to])).toEqual([
      ["Owner B", "cancel", 0],
      ["Owner A", "ask", 10],
    ]);
  });
  it("going up to 25 changes nothing sent and needs 5 more", () => {
    const p = previewQuantityChange(reqs, 20, 25);
    expect(p.steps).toEqual([]);
    expect(p.stillNeeded).toBe(5);
  });
  it("can't go below what was already picked up", () => {
    const picked = [req("a", "Owner A", 12, "confirmed", "2026-11-09T10:00:00Z", 12)];
    expect(previewQuantityChange(picked, 12, 5).possible).toBe(false);
  });
});

describe("Stock can't drop below accepted bookings", () => {
  const now = Date.parse("2026-11-10T00:00:00Z");
  it("two bookings at the same time reserve 7 + 5 = 12", () => {
    const list = [
      { kind: "return", quantity: 7, picked_up_qty: 0, returned_qty: 0, pickup_at: "2026-11-15T08:00:00Z", return_at: "2026-11-15T13:00:00Z" },
      { kind: "return", quantity: 5, picked_up_qty: 0, returned_qty: 0, pickup_at: "2026-11-15T10:00:00Z", return_at: "2026-11-15T12:00:00Z" },
    ];
    expect(reservedPeak(list, now)).toBe(12);
  });
  it("bookings on different days only reserve the bigger one (7)", () => {
    const list = [
      { kind: "return", quantity: 7, picked_up_qty: 0, returned_qty: 0, pickup_at: "2026-11-15T08:00:00Z", return_at: "2026-11-15T13:00:00Z" },
      { kind: "return", quantity: 5, picked_up_qty: 0, returned_qty: 0, pickup_at: "2026-11-17T08:00:00Z", return_at: "2026-11-17T13:00:00Z" },
    ];
    expect(reservedPeak(list, now)).toBe(7);
  });
  it("supplies reserve what isn't handed over yet (10 ml of 10, 4 ml handed over → 6)", () => {
    const list = [{ kind: "use_up", quantity: 10, picked_up_qty: 4, returned_qty: 0, pickup_at: "2026-11-15T08:00:00Z", return_at: null }];
    expect(reservedPeak(list, now)).toBe(6);
  });
});

describe("The offline helper never runs in the editor preview", () => {
  const prod = { prod: true, inIframe: false };
  it("is off in the Lovable preview", () => {
    expect(swBlocked({ hostname: "id-preview--36845aad-bdca-4fb8-b5e6-ed9a15d4575c.lovable.app", search: "" }, prod)).toBe(true);
  });
  it("is off inside an iframe and in development", () => {
    expect(swBlocked({ hostname: "cheez-udhaar.lovable.app", search: "" }, { prod: true, inIframe: true })).toBe(true);
    expect(swBlocked({ hostname: "cheez-udhaar.lovable.app", search: "" }, { prod: false, inIframe: false })).toBe(true);
  });
  it("is off with ?sw=off", () => {
    expect(swBlocked({ hostname: "cheez-udhaar.lovable.app", search: "?sw=off" }, prod)).toBe(true);
  });
  it("is on for the published app", () => {
    expect(swBlocked({ hostname: "cheez-udhaar.lovable.app", search: "" }, prod)).toBe(false);
  });
});
