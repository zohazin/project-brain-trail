import { describe, expect, it } from "vitest";
import { dropContactClauses, hasPrivate, onlySourceWords, privateWords, scrubPrivate, unsureContact } from "@/lib/shayari";
import { karachiAt } from "@/lib/demo";

const ALI = privateWords(["Ali (Demo borrower)", "Gulgasht Colony", null, "ali.demo@cheezudhaar.test", "ali.demo"]);
const NOTE = "Main Ali hoon, mera number 0300-1234567 hai. Sunday 1 se 6 baje tak shadi ke liye 12 chairs chahiye. Pickup Gulgasht House 45 se kar sakta hoon.";

describe("faraway note: fixed privacy rules", () => {
  it("hides the name, phone and house address in the test note but keeps 12 chairs, the time window and the purpose", () => {
    const out = scrubPrivate(NOTE, ALI);
    expect(out).not.toMatch(/Ali|0300|1234567|House 45|Gulgasht/);
    expect(out).toContain("Sunday 1 se 6 baje tak shadi ke liye 12 chairs chahiye.");
    expect(hasPrivate(out, ALI)).toBe(false);
  });

  it.each([
    ["+92 300 1234567"],
    ["0300 123 4567"],
    ["0300.1234567"],
    ["(061) 4512345"],
    ["۰۳۰۰۱۲۳۴۵۶۷"],
    ["+923001234567"],
  ])("hides the phone number %s", (phone) => {
    expect(scrubPrivate(`call ${phone} please`)).toBe("call [hidden] please");
  });

  it("hides emails, @handles and links", () => {
    expect(scrubPrivate("mail ali@example.com, insta @ali_k, www.ali.pk")).toBe("mail [hidden], insta [hidden], [hidden]");
  });

  it("keeps budgets, prices and time ranges that are not phone numbers", () => {
    const t = "Budget Rs 3000 - 5000, 1 se 6 baje, 10 ml glue, total Rs 30";
    expect(scrubPrivate(t)).toBe(t);
    expect(hasPrivate(t)).toBe(false);
  });

  it("hides exact addresses like House 45, gali no 3 and مکان نمبر 45", () => {
    expect(scrubPrivate("House 45 se")).toBe("[hidden] se");
    expect(scrubPrivate("gali no 3 mein")).toBe("[hidden] mein");
    expect(scrubPrivate("مکان نمبر 45 سے")).toBe("[hidden] سے");
  });

  it("does not treat 'Demo' or 'borrower' from a demo display name as private words", () => {
    expect(ALI).toContain("Ali");
    expect(ALI).not.toContain("Demo");
    expect(ALI).not.toContain("borrower");
  });
});

describe("faraway note: ask the sender when unsure", () => {
  it("asks to edit a 7-8 digit number or a spelled-out email", () => {
    expect(unsureContact("ring 4512345")).not.toBeNull();
    expect(unsureContact("ali at gmail dot com")).not.toBeNull();
  });
  it("does not ask about ordinary times, amounts or [hidden]", () => {
    expect(unsureContact("Sunday 1 se 6 baje 12 chairs, mera number [hidden] hai")).toBeNull();
  });
});

describe("faraway note: the cleaner may only delete", () => {
  it("drops words the person never wrote", () => {
    expect(onlySourceWords("Meherbani hogi, 12 chairs chahiye", "12 chairs chahiye")).toBe("12 chairs chahiye");
  });
  it("drops words moved out of the person's order", () => {
    expect(onlySourceWords("chahiye 12 chairs", "12 chairs chahiye")).toBe("chahiye");
  });
  it("keeps a clean deletion with [hidden]", () => {
    const src = "Main [hidden] hoon. 12 chairs chahiye, Pickup [hidden] se.";
    expect(onlySourceWords("Main [hidden] hoon. 12 chairs chahiye, Pickup [hidden] se.", src)).toBe(src);
  });
});

describe("demo times", () => {
  it("builds Pakistan wall-clock times in UTC (5 PM PKT = 12:00 UTC)", () => {
    const now = new Date("2026-11-10T16:09:00Z"); // 21:09 in Karachi, Tuesday
    expect(karachiAt(1, 17, now)).toBe("2026-11-11T12:00:00.000Z");
    expect(karachiAt(0, 13, new Date("2026-11-10T20:30:00Z"))).toBe("2026-11-11T08:00:00.000Z"); // already Wednesday in Karachi
  });
});

describe("rhyme facts: numbers written as words", () => {
  it("lets 'budget zero hai' become 'budget 0' without a false 'added number' failure", async () => {
    const { numberProblems } = await import("@/lib/shayari");
    const src = "Sunday 1 se 6 tak 12 chairs chahiye, budget zero hai.";
    expect(numberProblems(src, { lines: ["12 chairs Sunday 1 to 6", "budget 0, so free"], meaning: "12 chairs Sunday 1 to 6, budget 0." })).toEqual([]);
  });
  it("still refuses a number that is neither written nor spoken in the message", async () => {
    const { numberProblems } = await import("@/lib/shayari");
    expect(numberProblems("budget zero hai", { lines: ["a", "b"], meaning: "budget 500" })).toHaveLength(1);
  });
});

describe("hidden contact clauses are dropped (delete-only)", () => {
  it("removes 'call me on [hidden]' and 'I am [hidden]' but keeps the need", () => {
    expect(dropContactClauses("Main [hidden] hoon, [hidden] pe call karein, ghar [hidden] mein hai. Tent sirf 2 raaton ke liye chahiye, Sunday ko wapas kar dunga.")).toBe(
      "Tent sirf 2 raaton ke liye chahiye, Sunday ko wapas kar dunga.",
    );
  });
  it("keeps clauses without hidden details untouched", () => {
    expect(dropContactClauses("Tent 2 raaton ke liye chahiye, please call karna zaroori nahi.")).toBe("Tent 2 raaton ke liye chahiye, please call karna zaroori nahi.");
  });
  it("never returns an empty note", () => {
    expect(dropContactClauses("[hidden] pe call karein.")).toBe("[hidden] pe call karein.");
  });
});
