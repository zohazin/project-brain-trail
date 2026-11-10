import { describe, expect, it } from "vitest";
import { spokenKm } from "@/lib/need-text";

describe("distance the person typed", () => {
  it("reads Roman Urdu and English distances", () => {
    expect(spokenKm("Budget zero, 5 km ke andar.")).toBe(5);
    expect(spokenKm("within 2.5 km please")).toBe(2.5);
    expect(spokenKm("10 kilometer tak chalega")).toBe(10);
  });
  it("ignores text without a distance and impossible values", () => {
    expect(spokenKm("5 glue guns chahiye")).toBeNull();
    expect(spokenKm("500 km door")).toBeNull();
  });
});
