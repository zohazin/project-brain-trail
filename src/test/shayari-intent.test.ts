import { describe, expect, it } from "vitest";
import { intentProblems, rhymeProblems } from "@/lib/shayari";
import { failKind } from "@/lib/ai.server";

const ok = (meaning: string, lines = ["a", "b"]) => ({ lines, meaning });

describe("speaker and intent are kept", () => {
  const src = "Kal shaam 5 baje projector le sakta hoon?";
  it("refuses turning the borrower's question into one addressed to the borrower", () => {
    expect(intentProblems(src, ok("Kya aap kal shaam 5 baje projector le sakte hain?")).some((p) => p.includes("speaker"))).toBe(true);
  });
  it("refuses turning a permission question into a statement", () => {
    expect(intentProblems(src, ok("Main kal shaam 5 baje projector le jaunga.")).some((p) => p.includes("question"))).toBe(true);
  });
  it("accepts the same speaker asking the same question (Roman Urdu, Urdu, English)", () => {
    expect(intentProblems(src, ok("Kya main kal shaam 5 baje projector le sakta hoon?"))).toEqual([]);
    expect(intentProblems(src, ok("کیا میں کل شام 5 بجے پروجیکٹر لے سکتا ہوں؟"))).toEqual([]);
    expect(intentProblems(src, ok("Can I collect the projector tomorrow at 5 PM?"))).toEqual([]);
  });
  it("keeps a negation", () => {
    const s = "Main 5 baje se pehle nahi aa sakta.";
    expect(intentProblems(s, ok("Main 5 baje se pehle aa sakta hoon."))).not.toEqual([]);
    expect(intentProblems(s, ok("Main 5 baje se pehle nahi aa sakta.", ["Main 5 se pehle nahi aa paunga", "x"]))).toEqual([]);
  });
  it("keeps a condition", () => {
    const s = "Sirf agar HDMI cable saath ho to projector chahiye.";
    expect(intentProblems(s, ok("Mujhe HDMI cable aur projector chahiye."))).not.toEqual([]);
    expect(intentProblems(s, ok("I need the projector only if the HDMI cable comes with it."))).toEqual([]);
  });
  it("keeps a yes/no question about a price", () => {
    const s = "Kya 10 ml glue ka total Rs 30 hai?";
    expect(intentProblems(s, ok("10 ml glue ka total Rs 30 hai."))).not.toEqual([]);
    expect(intentProblems(s, ok("Kya 10 ml glue ka total Rs 30 hai?"))).toEqual([]);
  });
});

describe("rhyme is more than a repeated word", () => {
  it("refuses identical endings with nothing rhyming before", () => {
    expect(rhymeProblems(["Kal projector chahiye", "Shaam ko cable chahiye"])).not.toEqual([]);
    expect(rhymeProblems(["Projector chahiye", "Projector chahiye"])).not.toEqual([]);
  });
  it("accepts a qafia before a repeated radif", () => {
    expect(rhymeProblems(["Kal shaam aane ki ijazat hai kya", "Projector le jaane ki ijazat hai kya"])).toEqual([]);
    expect(rhymeProblems(["Kal shaam aane ki ijazat hai kya", "Projector ki ijazat hai kya"])).not.toEqual([]);
    expect(rhymeProblems(["Shaam ko aana hai", "Projector le jana hai"])).toEqual([]);
  });
  it("accepts different end words", () => {
    expect(rhymeProblems(["Kal shaam paanch baje aaun", "Projector le kar jaaun"])).toEqual([]);
  });
});

describe("AI failures get the right kind", () => {
  it.each([
    [{ code: "payment_required", httpStatus: 402 }, "balance"],
    [{ code: "rate_limited", httpStatus: 429 }, "busy"],
    [{ code: "timeout" }, "timeout"],
    [{ name: "TimeoutError" }, "timeout"],
    [{ code: "invalid_response" }, "invalid"],
    [{ code: "operation_failed", httpStatus: 503 }, "unavailable"],
  ])("%o → %s", (e, kind) => expect(failKind(e)).toBe(kind));
});
