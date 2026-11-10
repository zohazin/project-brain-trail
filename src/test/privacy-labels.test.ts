import { describe, expect, it } from "vitest";
import { ownerLabel } from "@/lib/format";

describe("Owners stay anonymous before they say yes", () => {
  it("the first owner in a request is shown as Owner A", () => {
    expect(ownerLabel(0)).toBe("Owner A");
  });
  it("the third owner (a backup after a decline) is Owner C", () => {
    expect(ownerLabel(2)).toBe("Owner C");
  });
});
