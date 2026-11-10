import { describe, expect, it } from "vitest";
import { costFor, priceLabel } from "@/lib/format";

describe("Use it up pricing", () => {
  it("glue at Rs 15 per 5 ml costs Rs 30 for 10 ml", () => {
    expect(costFor("use_up", 15, 5, 10)).toBe(30);
  });
  it("shows the owner's price per amount", () => {
    expect(priceLabel("use_up", 15, 5, "ml")).toBe("Rs 15 per 5 ml");
  });
});

describe("Bring it back pricing", () => {
  it("free items cost nothing for any amount", () => {
    expect(costFor("return", 0, 1, 20)).toBe(0);
    expect(priceLabel("return", 0, 1, "item")).toBe("Free");
  });
  it("priced items cost price times quantity", () => {
    expect(costFor("return", 500, 1, 2)).toBe(1000);
  });
});

describe("Decimal-safe supply totals", () => {
  it("250 g at Rs 80 per 100 g is exactly Rs 200", () => {
    expect(costFor("use_up", 80, 100, 250)).toBe(200);
  });
  it("0.1 + 0.2 style amounts don't drift: 0.3 kg at Rs 10 per 0.1 kg is Rs 30", () => {
    expect(costFor("use_up", 10, 0.1, 0.3)).toBe(30);
  });
});
