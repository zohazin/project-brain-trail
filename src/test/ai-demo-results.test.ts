import { describe, expect, it } from "vitest";
import { checkDemoListings, demoVersionKey, generationDecision, mentions, placeAt, shareShortfall, timeFits, type DemoListingDraft, type DemoNeed } from "@/lib/demo-gen";
import { kmBetween } from "@/lib/areas";

// Sunday 15 Nov 2026, 1 PM → 6 PM Pakistan time
const need: DemoNeed = {
  item_name: "glue guns",
  kind: "return",
  unit: "item",
  missing: 5,
  budget_rs: null,
  pickup_at: "2026-11-15T08:00:00.000Z",
  return_at: "2026-11-15T13:00:00.000Z",
  search_km: 5,
  requirements: [],
};

function listing(over: Partial<DemoListingDraft> = {}): DemoListingDraft {
  return {
    owner_first_name: "Kamran",
    item_name: "Glue gun",
    category: "Tools",
    description: "Full-size hot glue gun, 40 W.",
    specs: "40 W, 11 mm nozzle",
    accessories: "",
    condition: "Good",
    quantity: 3,
    price_rs: 50,
    price_per: 1,
    price_period: "day",
    distance_km: 1.5,
    owner_limit_km: 3,
    available_from: "09:00",
    available_until: "20:00",
    meets: [],
    why_it_matches: "Fits the craft day.",
    summary: "Full-size hot glue gun.",
    ...over,
  };
}

describe("AI demo results: server checks before anything is saved", () => {
  it("accepts a split of 3 + 2 for 5 missing glue guns", () => {
    const r = checkDemoListings([listing(), listing({ owner_first_name: "Nadia", quantity: 2, distance_km: 2.5 })], need);
    expect(r.ok).toBe(true);
  });
  it("rejects listings that together have less than the missing amount", () => {
    const r = checkDemoListings([listing({ quantity: 2 }), listing({ owner_first_name: "Nadia", quantity: 2 })], need);
    expect(r.ok).toBe(false);
  });
  it("rejects more than 3 listings", () => {
    const four = ["Asad", "Nadia", "Imran", "Rabia"].map((n) => listing({ owner_first_name: n, quantity: 2 }));
    expect(checkDemoListings(four, need).ok).toBe(false);
  });
  it("rejects a listing farther than the search distance", () => {
    expect(checkDemoListings([listing({ quantity: 5, distance_km: 6, owner_limit_km: 8 })], need).ok).toBe(false);
  });
  it("rejects an owner lending limit shorter than the distance", () => {
    expect(checkDemoListings([listing({ quantity: 5, distance_km: 3, owner_limit_km: 2 })], need).ok).toBe(false);
  });
  it("budget zero means every fictional listing must be free", () => {
    const zero = { ...need, budget_rs: 0 };
    expect(checkDemoListings([listing({ quantity: 5 })], zero).ok).toBe(false);
    expect(checkDemoListings([listing({ quantity: 5, price_rs: 0 })], zero).ok).toBe(true);
  });
  it("rejects a total over the remaining budget", () => {
    const b = { ...need, budget_rs: 200 };
    expect(checkDemoListings([listing({ quantity: 5, price_rs: 50 })], b).ok).toBe(false); // 5 × 50 = 250
    expect(checkDemoListings([listing({ quantity: 5, price_rs: 40 })], b).ok).toBe(true); // 200
  });
  it("rejects availability that doesn't cover pickup at 1 PM and return at 6 PM", () => {
    expect(checkDemoListings([listing({ quantity: 5, available_until: "16:00" })], need).ok).toBe(false);
    expect(checkDemoListings([listing({ quantity: 5, available_from: "14:00" })], need).ok).toBe(false);
  });
  it("requires each must-have to be written in the listing itself", () => {
    const n = { ...need, requirements: ["includes glue sticks"] };
    expect(checkDemoListings([listing({ quantity: 5 })], n).ok).toBe(false);
    expect(checkDemoListings([listing({ quantity: 5, accessories: "10 glue sticks included" })], n).ok).toBe(true);
  });
  it("rejects contact details and real demo names", () => {
    expect(checkDemoListings([listing({ quantity: 5, description: "Call 0300 1234567" })], need).ok).toBe(false);
    expect(checkDemoListings([listing({ quantity: 5, owner_first_name: "Sara" })], need).ok).toBe(false);
  });
  it("rejects half items for countable things", () => {
    expect(checkDemoListings([listing({ quantity: 5.5 })], need).ok).toBe(false);
  });
});

describe("AI demo results: reuse and placement", () => {
  it("the same details give the same key, so no second AI call", () => {
    expect(demoVersionKey(need)).toBe(demoVersionKey({ ...need, requirements: [] }));
  });
  it("a different missing amount or time gives a new key", () => {
    expect(demoVersionKey({ ...need, missing: 4 })).not.toBe(demoVersionKey(need));
    expect(demoVersionKey({ ...need, return_at: "2026-11-15T12:00:00.000Z" })).not.toBe(demoVersionKey(need));
  });
  it("shares the shortfall nearest first when no single owner has enough", () => {
    expect(shareShortfall([{ quantity: 3, distance_km: 2 }, { quantity: 3, distance_km: 1 }], 5)).toEqual([2, 3]);
    expect(shareShortfall([{ quantity: 2, distance_km: 1 }, { quantity: 6, distance_km: 3 }], 5)).toEqual([0, 5]);
  });
  it("places the fictional owner at the stated distance", () => {
    const p = placeAt(30.21, 71.475, 2.5, 60);
    expect(kmBetween({ lat: 30.21, lng: 71.475 }, p)).toBeCloseTo(2.5, 2);
  });
  it("time check matches the database rule for overnight returns", () => {
    // pickup Sun 1 PM, back Mon 10 AM: must be available from 10 AM or earlier
    expect(timeFits("09:00", "20:00", "2026-11-15T08:00:00.000Z", "2026-11-16T05:00:00.000Z", "return")).toBe(true);
    expect(timeFits("11:00", "20:00", "2026-11-15T08:00:00.000Z", "2026-11-16T05:00:00.000Z", "return")).toBe(false);
  });
  it("a must-have counts only when its words appear", () => {
    expect(mentions("HDMI input", "Epson projector with HDMI and VGA")).toBe(true);
    expect(mentions("HDMI input", "Epson projector, VGA only")).toBe(false);
  });
  it("distance wording in must-haves is left to the search, not the listing text", () => {
    const n = { ...need, requirements: ["within 5 km", "full-size"] };
    expect(checkDemoListings([listing({ quantity: 5, description: "Full-size hot glue gun, 40 W." })], n).ok).toBe(true);
  });
});

describe("sample plan retries (controlled failures)", () => {
  const now = Date.parse("2026-11-10T20:00:00Z");
  const at = (msAgo: number) => new Date(now - msAgo).toISOString();
  it("reuses a saved set when a retry follows a lost answer", () => {
    expect(generationDecision({ status: "ready", created_at: at(5_000) }, "retry", now)).toBe("reuse");
    expect(generationDecision({ status: "ready", created_at: at(5_000) }, "auto", now)).toBe("reuse");
  });
  it("only 'Create another sample plan' replaces a saved set", () => {
    expect(generationDecision({ status: "ready", created_at: at(5_000) }, "another", now)).toBe("create");
  });
  it("waits for a creation that is still running instead of starting a second one", () => {
    expect(generationDecision({ status: "running", created_at: at(30_000) }, "retry", now)).toBe("pending");
  });
  it("clears a creation that never finished before trying again", () => {
    expect(generationDecision({ status: "running", created_at: at(5 * 60_000) }, "auto", now)).toBe("abandon_then_create");
  });
  it("a page load after a failure shows it; only Try again makes a new attempt", () => {
    expect(generationDecision({ status: "failed", created_at: at(1_000) }, "auto", now)).toBe("show_failure");
    expect(generationDecision({ status: "failed", created_at: at(1_000) }, "retry", now)).toBe("create");
  });
  it("an invalid AI answer (no listings) is refused", () => {
    expect(checkDemoListings([], need).ok).toBe(false);
  });
});
