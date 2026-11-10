import { afterEach, describe, expect, it, vi } from "vitest";

const gen = vi.fn();
vi.mock("@lovable.dev/ai-gateway", () => ({
  generateResponse: (...a: unknown[]) => gen(...a),
  GatewayError: class GatewayError extends Error {
    httpStatus?: number;
  },
}));

import {
  bookingDone,
  generationKey,
  hasPrivate,
  numberProblems,
  privateWords,
  scriptProblems,
  scrubPrivate,
  shapeProblems,
  thanksStarter,
} from "@/lib/shayari";

const done12 = { status: "completed", kind: "return", quantity: 12, picked_up_qty: 12, returned_qty: 12, item_name: "Folding chairs", unit: "item" };

describe("Shayari facts are kept", () => {
  it("rejects a meaning that drops the 5 PM time from the projector request", () => {
    const src = "Kal shaam 5 baje event ke liye projector le sakta hoon?";
    const p = numberProblems(src, { lines: ["Projector ka sawal hai", "Event ka khayal hai"], meaning: "Kya main kal event ke liye projector le sakta hoon?" });
    expect(p).toContain("The plain meaning dropped the number 5.");
  });
  it("accepts a meaning that keeps 1, 6 and 8 from the chairs request", () => {
    const src = "Mujhe Sunday 1 se 6 baje tak 8 chairs chahiye. Budget zero hai.";
    expect(numberProblems(src, { lines: ["Itwar ko kursiyan chahiye", "Muft mein mil jaayen to dil se dua hai"], meaning: "Mujhe Sunday 1 se 6 baje tak 8 chairs chahiye, budget zero hai." })).toEqual([]);
  });
  it("rejects a rhyme that adds a number not in the message or booking", () => {
    expect(numberProblems("Thanks for the chairs", { lines: ["20 chairs ka shukriya", "dil se"], meaning: "Thanks for the chairs" })).toContain(
      "The rhyme added the number 20, which is not in the message.",
    );
  });
  it("counts Urdu digits as the same number", () => {
    expect(numberProblems("12 chairs", { lines: ["a", "b"], meaning: "۱۲ کرسیاں" })).toEqual([]);
  });
});

describe("Shayari shape and script", () => {
  it("needs exactly two lines", () => {
    expect(shapeProblems(["one", "two", "three"], "m")).toEqual(["The rhyme must have exactly two lines."]);
    expect(shapeProblems(["one", "two"], "m")).toEqual([]);
  });
  it("Urdu must use Urdu script, Roman Urdu must use Latin letters", () => {
    expect(scriptProblems("urdu", ["Kal shaam aana"])).toHaveLength(1);
    expect(scriptProblems("urdu", ["کل شام 5 بجے آنا"])).toEqual([]);
    expect(scriptProblems("roman_urdu", ["کل شام"])).toHaveLength(1);
    expect(scriptProblems("english", ["See you at 5 PM"])).toEqual([]);
  });
});

describe("Faraway request privacy", () => {
  const secrets = privateWords(["Ali Raza", "Gulgasht Colony"]);
  const raw = "Mera naam Ali Raza hai, 0300-1234567 pe call karein. Mujhe Sunday 1 se 6 baje tak 8 chairs chahiye.";
  it("removes the borrower's name and phone number before anything is shared", () => {
    const safe = scrubPrivate(raw, secrets);
    expect(safe).not.toMatch(/Ali|Raza|0300|1234567/);
    expect(safe).toContain("8 chairs");
    expect(hasPrivate(safe, secrets)).toBe(false);
  });
  it("flags generated text that brings a name or email back", () => {
    expect(hasPrivate("Ali bhai ko kursiyan chahiye", secrets)).toBe(true);
    expect(hasPrivate("write to ali@example.com", [])).toBe(true);
    expect(hasPrivate("8 chairs on Sunday", secrets)).toBe(false);
  });
});

describe("Thank-you prompt", () => {
  it("offers the 12-chair sentence only when all 12 are confirmed back", () => {
    expect(bookingDone(done12)).toBe(true);
    expect(thanksStarter(done12)).toBe("Thank you for lending me the 12 chairs. I have returned all 12.".replace("chairs", "folding chairs"));
  });
  it("is hidden while one chair is still due", () => {
    const due = { ...done12, status: "confirmed", returned_qty: 11 };
    expect(bookingDone(due)).toBe(false);
    expect(thanksStarter(due)).toBeNull();
  });
  it("shows for a finished supply exchange", () => {
    expect(bookingDone({ status: "completed", kind: "use_up", quantity: 10, picked_up_qty: 10, returned_qty: 0 })).toBe(true);
  });
});

describe("Stale results", () => {
  it("a language or tone change makes a different generation key", () => {
    const a = generationKey({ source: "hi", language: "urdu", tone: "friendly" });
    expect(generationKey({ source: "hi", language: "english", tone: "friendly" })).not.toBe(a);
    expect(generationKey({ source: "hi", language: "urdu", tone: "funny" })).not.toBe(a);
    expect(generationKey({ source: "hi ", language: "urdu", tone: "friendly" })).toBe(a);
  });
});

describe("AI timeout", () => {
  afterEach(() => gen.mockReset());
  it("does not resend a timed-out request (it may have run); reports that it took too long", async () => {
    process.env["LOVABLE_API_KEY"] = "test";
    gen.mockImplementation(() => {
      const e = new Error("timed out");
      e.name = "TimeoutError";
      return Promise.reject(e);
    });
    const { writeShayari } = await import("@/lib/ai.server");
    await expect(
      writeShayari({ source: "hi", keyMessage: null, language: "english", tone: "friendly", context: "dm", facts: "", nowLocal: "", feedback: [] }),
    ).rejects.toThrow("The writing helper took too long to answer.");
    expect(gen).toHaveBeenCalledTimes(1);
  });
});

describe("faraway note cleaner keeps only the borrower's own words", () => {
  it("drops a phrase the AI added that the borrower never wrote", async () => {
    const { onlySourceWords } = await import("@/lib/shayari");
    const src = "Main Ali hoon, 0300-1234567. Shadi ke liye 12 chairs chahiye.";
    const ai = "Main [hidden] hoon, [hidden]. Shadi ke liye 12 chairs chahiye. Meherbani hogi.";
    const out = onlySourceWords(ai, src);
    expect(out).not.toMatch(/Meherbani/i);
    expect(out).toContain("Shadi ke liye 12 chairs chahiye.");
  });
  it("keeps a note unchanged when the AI only removed details", async () => {
    const { onlySourceWords } = await import("@/lib/shayari");
    expect(onlySourceWords("Need the projector for 2 days.", "Need the projector for 2 days, call Sara.")).toBe("Need the projector for 2 days.");
  });
});
