// Anonymity cleaning for faraway (exception) notes. One path for "Preview note" and "Make it rhyme".
// It protects the original: it may only hide or delete private details, never add or reorder the person's words.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { hasPrivate, privateWords, scrubPrivate, unsureContact } from "./shayari";

export type SafeNote =
  | { ok: true; note: string; removed: boolean; secrets: string[] }
  | { ok: false; review: string }
  | { ok: false; aiError: string; retryAfter: number | null };

/** The caller's own private words (name parts, area, test ID, email) that must never reach the owner. */
export async function mySecrets(supabase: SupabaseClient<Database>, userId: string, email: string | null): Promise<string[]> {
  const { data: me } = await supabase.from("profiles").select("display_name, area_name, test_cnic").eq("id", userId).single();
  return privateWords([me?.display_name, me?.area_name, me?.test_cnic, email, email?.split("@")[0]]);
}

export async function safeNote(text: string, secrets: string[]): Promise<SafeNote> {
  const ai = await import("./ai.server");
  // 1) Fixed rules first, so contact details never reach the cleaner.
  const pre = scrubPrivate(text, secrets).trim();
  // 2) The cleaner finds names and addresses the rules can't see; it only deletes (checked word by word).
  let note: string;
  let aiRemoved = false;
  try {
    const r = await ai.anonymizeNote(pre);
    note = scrubPrivate(r.note, secrets).trim();
    aiRemoved = r.removed;
  } catch (e) {
    if (e instanceof ai.AiUnavailableError) return { ok: false, aiError: e.message, retryAfter: e.retryAfter };
    throw e;
  }
  // 3) Anything left that we can't safely interpret: the sender edits, we don't guess.
  if (!note || note === "[hidden]") return { ok: false, review: "After hiding private details nothing was left. Please say why you need it, without names or contact details." };
  if (hasPrivate(note, secrets)) return { ok: false, review: "Please take out names, phone numbers or addresses and try again." };
  const unsure = unsureContact(note);
  if (unsure) return { ok: false, review: unsure };
  return { ok: true, note, removed: aiRemoved || note !== text.trim(), secrets };
}
