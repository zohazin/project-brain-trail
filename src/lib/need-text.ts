// Pure helpers that read fixed facts from what the person typed, so they never depend on the AI.

/** A search distance the person stated, e.g. "5 km ke andar", "within 2.5 km", "10 kilometer tak". Null when none. */
export function spokenKm(text: string): number | null {
  const m = /(\d+(?:[.,]\d+)?)\s*(?:km|kms|kilo ?meters?|kilo ?metres?|kilomit(?:a|e)r)\b/i.exec(text);
  if (!m) return null;
  const n = Number(m[1]!.replace(",", "."));
  return Number.isFinite(n) && n >= 0.5 && n <= 100 ? n : null;
}
