// AI demo lenders in trial mode: pure rules shared by the server and the chat screen (unit-tested).
import { scrubPrivate } from "./shayari";

export const UNAVAILABLE = "Someone else booked this item for these times first, so it isn't available. Nothing was booked for you; a replacement search is ready.";
export const LENDER_LABEL = "AI demo lender — simulated person";
export const TRIAL_BANNER = "Trial mode — fictional items and AI lenders.";
export const TRIAL_BADGE = "Trial data";
export const REPLY_FAILED = "The demo lender couldn't reply. Your message is saved. Try again.";
/** A reply that has been "running" this long is treated as stopped (the server call died). */
export const REPLY_STALE_MS = 60_000;
/** Older messages never get an automatic reply (no replying to history on reload). */
export const REPLY_MAX_AGE_MS = 6 * 60 * 60_000;

export type ReplyRow = { status: "running" | "ready" | "failed" | string; updated_at: string };
export type ReplyStep = "create" | "reuse" | "pending" | "claim" | "show_failure";

/**
 * What to do when asked for the AI lender's reply to one saved message. At most one reply per message:
 * - no row yet → create it; a saved reply → reuse it (no second AI call);
 * - still running → pending; stopped or failed → only an explicit "Try again" runs the AI again.
 */
export function replyDecision(row: ReplyRow | null | undefined, retry: boolean, now: number, staleMs = REPLY_STALE_MS): ReplyStep {
  if (!row) return "create";
  if (row.status === "ready") return "reuse";
  const stale = now - new Date(row.updated_at).getTime() > staleMs;
  if (row.status === "running" && !stale) return "pending";
  return retry ? "claim" : "show_failure";
}

/** Only fresh messages written by the borrower get an AI reply. */
export function canAutoReply(msg: { sender_id: string | null; created_at: string }, borrowerId: string, now: number): boolean {
  return msg.sender_id === borrowerId && now - new Date(msg.created_at).getTime() <= REPLY_MAX_AGE_MS;
}

type Share = { mine: number; unit: string; item: string; wanted: number | null; others: { quantity: number; status: string }[] };

/** Plain facts about this lender's share of the borrower's whole search (e.g. 8 of 20). */
export function shareNote(s: Share): string {
  const u = s.unit === "item" ? s.item.toLowerCase() : `${s.unit} of ${s.item.toLowerCase()}`;
  const active = s.others.filter((o) => ["requested", "confirmed", "completed"].includes(o.status));
  const elsewhere = active.reduce((t, o) => t + o.quantity, 0);
  const parts = [`This lender's booking is for ${s.mine} ${u} only.`];
  if (s.wanted != null && s.wanted > s.mine) {
    parts.push(`The borrower needs ${s.wanted} in total.`);
    if (elsewhere > 0) parts.push(`The other ${elsewhere} are in ${active.length === 1 ? "another booking" : `${active.length} other bookings`} with a different lender, not with this lender.`);
    const gap = s.wanted - s.mine - elsewhere;
    if (gap > 0) parts.push(`${gap} are not booked with anyone yet.`);
  }
  return parts.join(" ");
}

type ChatMsg = { sender_id: string | null; body: string; kind: string; shayari?: unknown };

/** The recent conversation, as plain lines for the AI (rhymes are given with their plain meaning). */
export function historyLines(messages: ChatMsg[], borrowerId: string, ownerId: string, limit = 12): string[] {
  return messages.slice(-limit).map((m) => {
    const who = m.sender_id === borrowerId ? "Borrower" : m.sender_id === ownerId ? "You (lender)" : "App";
    const s = m.shayari as { lines?: string[]; meaning?: string } | null | undefined;
    if ((m.kind === "shayari" || m.kind === "thanks") && s?.lines?.length) {
      return `${who} (sent as a two-line rhyme): "${s.lines.join(" / ")}" — plain meaning: "${s.meaning ?? ""}"`;
    }
    return `${who}: ${m.body}`;
  });
}

/** Final safety on the AI's reply: no contact details, short, never empty. */
export function cleanReply(text: string): string {
  const t = scrubPrivate(String(text ?? "").replace(/\s+\n/g, "\n").trim()).trim();
  return t.length > 600 ? `${t.slice(0, 597).trimEnd()}…` : t;
}
