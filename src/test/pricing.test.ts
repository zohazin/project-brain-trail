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
