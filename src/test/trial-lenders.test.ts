import { describe, expect, it } from "vitest";
import { canAutoReply, cleanReply, historyLines, LENDER_LABEL, replyDecision, REPLY_FAILED, shareNote, TRIAL_BADGE, TRIAL_BANNER } from "@/lib/demo-chat";

const now = Date.parse("2026-11-11T12:00:00Z");
const ago = (ms: number) => new Date(now - ms).toISOString();

describe("AI demo lender: one reply per saved message", () => {
  it("creates a reply for a message with no attempt yet", () => {
    expect(replyDecision(null, false, now)).toBe("create");
  });
  it("reuses a saved reply instead of asking the AI again", () => {
    expect(replyDecision({ status: "ready", updated_at: ago(5_000) }, false, now)).toBe("reuse");
    expect(replyDecision({ status: "ready", updated_at: ago(5_000) }, true, now)).toBe("reuse");
  });
  it("waits while another tap is already getting the reply", () => {
    expect(replyDecision({ status: "running", updated_at: ago(10_000) }, true, now)).toBe("pending");
  });
  it("never retries a failed reply by itself; only Try again runs it", () => {
    expect(replyDecision({ status: "failed", updated_at: ago(10_000) }, false, now)).toBe("show_failure");
    expect(replyDecision({ status: "failed", updated_at: ago(10_000) }, true, now)).toBe("claim");
  });
  it("treats a reply stuck for over a minute as stopped", () => {
    expect(replyDecision({ status: "running", updated_at: ago(61_000) }, false, now)).toBe("show_failure");
    expect(replyDecision({ status: "running", updated_at: ago(61_000) }, true, now)).toBe("claim");
  });
});

describe("Only fresh borrower messages get a reply (no loops, no replying to history)", () => {
  it("replies to the borrower's own recent message", () => {
    expect(canAutoReply({ sender_id: "b", created_at: ago(30_000) }, "b", now)).toBe(true);
  });
  it("never replies to the lender's own message or an app message", () => {
    expect(canAutoReply({ sender_id: "o", created_at: ago(1_000) }, "b", now)).toBe(false);
    expect(canAutoReply({ sender_id: null, created_at: ago(1_000) }, "b", now)).toBe(false);
  });
  it("does not reply to messages older than 6 hours", () => {
    expect(canAutoReply({ sender_id: "b", created_at: ago(7 * 3600_000) }, "b", now)).toBe(false);
  });
});

describe("The lender knows its own share of the borrower's search", () => {
  it("8 of 20 chairs, 12 with another lender", () => {
    const note = shareNote({ mine: 8, unit: "item", item: "Chairs", wanted: 20, others: [{ quantity: 12, status: "confirmed" }] });
    expect(note).toContain("for 8 chairs only");
    expect(note).toContain("needs 20 in total");
    expect(note).toContain("other 12 are in another booking with a different lender");
    expect(note).not.toContain("not booked");
  });
  it("cancelled or declined bookings don't count as booked elsewhere", () => {
    const note = shareNote({ mine: 8, unit: "item", item: "Chairs", wanted: 20, others: [{ quantity: 12, status: "declined" }] });
    expect(note).toContain("12 are not booked with anyone yet");
  });
});

describe("Chat context and safety", () => {
  it("rhymes are given to the lender with their plain meaning", () => {
    const lines = historyLines([{ sender_id: "b", body: "x", kind: "shayari", shayari: { lines: ["a", "b"], meaning: "Thank you for the chairs" } }], "b", "o");
    expect(lines[0]).toContain("plain meaning: \"Thank you for the chairs\"");
  });
  it("removes phone numbers from a reply", () => {
    expect(cleanReply("Call me on 0300-1234567 kal")).not.toContain("1234567");
  });
  it("uses the agreed labels and failure text", () => {
    expect(LENDER_LABEL).toBe("AI demo lender — simulated person");
    expect(TRIAL_BANNER).toBe("Trial mode — fictional items and AI lenders.");
    expect(TRIAL_BADGE).toBe("Trial data");
    expect(REPLY_FAILED).toBe("The demo lender couldn't reply. Your message is saved. Try again.");
  });
});
