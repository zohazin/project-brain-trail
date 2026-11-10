// Fictional demo accounts (shared by the sign-in buttons and the server-side demo setup).
export const DEMO_PASSWORD = "CheezDemo2026";

export const DEMO_ACCOUNTS = [
  { email: "ali.demo@cheezudhaar.test", name: "Ali", role: "Borrower — needs 20 chairs" },
  { email: "bilal.demo@cheezudhaar.test", name: "Bilal", role: "Owner — 20 chairs, back by 4 PM" },
  { email: "sara.demo@cheezudhaar.test", name: "Sara", role: "Owner — 12 chairs" },
  { email: "usman.demo@cheezudhaar.test", name: "Usman", role: "Owner — 8 chairs, projector" },
  { email: "hina.demo@cheezudhaar.test", name: "Hina", role: "Owner — 8 chairs (backup), glue" },
  { email: "farah.demo@cheezudhaar.test", name: "Farah", role: "Owner — tent, paint (farther away)" },
  { email: "admin.demo@cheezudhaar.test", name: "Zainab", role: "Area admin for Multan" },
] as const;

/** Seeded demo items used by the Shayari demo. */
export const DEMO_ITEMS = {
  usmanProjector: "e0000000-0000-4000-8000-00000000000a",
  saraChairs: "e0000000-0000-4000-8000-000000000002",
  farahTent: "e0000000-0000-4000-8000-000000000008",
} as const;

/** A wall-clock time in Pakistan (UTC+5, no daylight saving) `days` from today, as UTC ISO. */
export function karachiAt(days: number, hour: number, now = new Date()): string {
  const local = new Date(now.getTime() + 5 * 3_600_000);
  const d = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + days, hour - 5, 0, 0);
  return new Date(d).toISOString();
}
