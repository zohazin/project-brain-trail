// Shayari Mode (Mystery Card 2): browser-safe types, labels and the checks the server runs on every rhyme.

export type ShayariLanguage = "urdu" | "roman_urdu" | "english";
export type ShayariTone = "friendly" | "funny";
export type ShayariContext = "dm" | "exception" | "thanks";

export const SHAYARI_LANGUAGES: { id: ShayariLanguage; label: string }[] = [
  { id: "urdu", label: "Urdu" },
  { id: "roman_urdu", label: "Roman Urdu" },
  { id: "english", label: "English" },
];
export const SHAYARI_TONES: { id: ShayariTone; label: string }[] = [
  { id: "friendly", label: "Friendly" },
  { id: "funny", label: "Funny" },
];

export const SHAYARI_FAILED = "Couldn't make a rhyme. Try again or send your original message.";

/** What was approved and sent: kept exactly as shown to the sender. */
export type ShayariSnapshot = {
  original: string;
  key_message: string;
  lines: string[];
  meaning: string;
  language: ShayariLanguage;
  tone: ShayariTone;
};

export type ShayariPreview = ShayariSnapshot & { id: string };

export function isShayariSnapshot(x: unknown): x is ShayariSnapshot {
  if (!x || typeof x !== "object") return false;
  const s = x as Record<string, unknown>;
  const lines = s["lines"];
  const lang = s["language"];
  return (
    typeof s["original"] === "string" &&
    typeof s["meaning"] === "string" &&
    Array.isArray(lines) &&
    lines.length === 2 &&
    lines.every((l) => typeof l === "string") &&
    (lang === "urdu" || lang === "roman_urdu" || lang === "english")
  );
}

export const textDir = (lang: ShayariLanguage): "rtl" | "ltr" => (lang === "urdu" ? "rtl" : "ltr");
export const langTag = (lang: ShayariLanguage): string => (lang === "urdu" ? "ur" : lang === "roman_urdu" ? "ur-Latn" : "en");

/** Identifies one generation request; a reply for an older key must never replace a newer draft. */
export function generationKey(p: { source: string; language: ShayariLanguage; tone: ShayariTone; keyMessage?: string | null }): string {
  return JSON.stringify([p.source.trim(), p.language, p.tone, p.keyMessage ?? null]);
}

// ---------------- numbers ----------------
const DIGIT_MAP: Record<string, string> = {};
"۰۱۲۳۴۵۶۷۸۹".split("").forEach((d, i) => (DIGIT_MAP[d] = String(i)));
"٠١٢٣٤٥٦٧٨٩".split("").forEach((d, i) => (DIGIT_MAP[d] = String(i)));

export function normalizeDigits(s: string): string {
  return s.replace(/[۰-۹٠-٩]/g, (d) => DIGIT_MAP[d] ?? d);
}

/** Distinct numbers in a text (Urdu digits count too), e.g. "5:30 baje 12 chairs" → ["5", "30", "12"]. */
export function numbersIn(s: string): string[] {
  const found = normalizeDigits(s).match(/\d+(?:\.\d+)?/g) ?? [];
  return [...new Set(found.map((n) => String(Number(n))))];
}

// Numbers written as words ("budget zero", "do din", "teen chairs") may appear as digits in the rhyme.
const NUMBER_WORDS: Record<string, string> = {
  zero: "0", sifar: "0", sifr: "0", one: "1", ek: "1", two: "2", do: "2", three: "3", teen: "3", four: "4", char: "4", chaar: "4",
  five: "5", paanch: "5", panch: "5", six: "6", chhe: "6", chay: "6", seven: "7", saat: "7", eight: "8", aath: "8", nine: "9", nau: "9",
  ten: "10", das: "10", eleven: "11", gyarah: "11", twelve: "12", barah: "12", baara: "12", twenty: "20", bees: "20", hundred: "100", sau: "100",
  صفر: "0", ایک: "1", دو: "2", تین: "3", چار: "4", پانچ: "5", چھ: "6", سات: "7", آٹھ: "8", نو: "9", دس: "10", بارہ: "12", بیس: "20", سو: "100",
};
export function wordNumbersIn(s: string): string[] {
  return [...new Set(s.toLowerCase().split(/[^\p{L}]+/u).map((w) => NUMBER_WORDS[w]).filter((n): n is string => Boolean(n)))];
}

/**
 * Every number in the key message must be kept in the plain meaning, and the rhyme and meaning
 * may not add numbers that are neither in the message nor in the booking facts.
 */
export function numberProblems(source: string, out: { lines: string[]; meaning: string }, factNumbers: string[] = []): string[] {
  const src = numbersIn(source);
  const meaning = new Set(numbersIn(out.meaning));
  const allowed = new Set([...src, ...wordNumbersIn(source), ...factNumbers.map((n) => String(Number(n))), "1"]);
  const problems: string[] = [];
  for (const n of src) if (!meaning.has(n)) problems.push(`The plain meaning dropped the number ${n}.`);
  for (const n of numbersIn([...out.lines, out.meaning].join(" "))) {
    if (!allowed.has(n)) problems.push(`The rhyme added the number ${n}, which is not in the message.`);
  }
  return problems;
}

// ---------------- shape and script ----------------
const ARABIC = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/g;
const LATIN = /[A-Za-z]/g;

export function shapeProblems(lines: unknown, meaning: unknown): string[] {
  const p: string[] = [];
  if (!Array.isArray(lines) || lines.length !== 2) return ["The rhyme must have exactly two lines."];
  const ls = lines.map((l) => (typeof l === "string" ? l.trim() : ""));
  if (ls.some((l) => !l)) p.push("Both rhyme lines must have words.");
  if (ls.some((l) => l.length > 140)) p.push("Each rhyme line must be shorter than 140 characters.");
  if (ls.some((l) => /\n/.test(l))) p.push("Each rhyme line must be one line.");
  if (ls[0] && ls[0] === ls[1]) p.push("The two rhyme lines must be different.");
  if (typeof meaning !== "string" || !meaning.trim()) p.push("The plain meaning is missing.");
  else if (meaning.length > 600) p.push("The plain meaning is too long.");
  return p;
}

/** Urdu must be in Urdu script; Roman Urdu and English must be in Latin script. Short Latin brand words (HDMI) are fine in Urdu. */
export function scriptProblems(lang: ShayariLanguage, texts: string[]): string[] {
  const p: string[] = [];
  for (const t of texts) {
    const ar = (t.match(ARABIC) ?? []).length;
    const la = (t.match(LATIN) ?? []).length;
    if (lang === "urdu") {
      if (ar === 0 || la > ar * 0.25) p.push("Urdu must be written in Urdu script.");
    } else if (ar > 0) {
      p.push(lang === "english" ? "English must be in ordinary English letters." : "Roman Urdu must be written in English letters.");
    }
  }
  return [...new Set(p)];
}

// ---------------- privacy ----------------
// Same patterns as SQL has_contact()/scrub_contact(). Phone numbers need 9+ digits (+92, spaces, dots, dashes,
// brackets and Urdu digits all count), so budgets like "Rs 3000 - 5000" and times like "1 se 6" are kept.
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const LINK = /(?:https?:\/\/|www\.)\S+/gi;
const HANDLE = /(^|[^A-Za-z0-9])@[A-Za-z0-9_.]{3,}/g;
const PHONE = /\+?\(?\d(?:[\s.()-]{0,2}\d){8,13}/g;
// "House 45", "H# 12", "gali no 3", "Plot 7-B", "مکان نمبر 45": an exact address.
const ADDRESS =
  /(^|[^\p{L}])(?:house|h\s?#|h\.?\s?no|ghar|makan|plot|flat|apartment|street|gali|lane|block|sector|mohalla|مکان|گھر|گلی|پلاٹ|بلاک)\s*(?:no\.?|number|nmbr|nambar|نمبر|#)?\s*\d+(?:\s?-?\s?[A-Za-z])?(?![\p{L}\p{N}])/giu;

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Words from the person's private profile that must never reach the other person (name parts, area, ID). */
export function privateWords(values: (string | null | undefined)[]): string[] {
  const words = new Set<string>();
  for (const v of values) {
    if (!v) continue;
    const t = v.trim();
    if (t.length >= 3) words.add(t);
    for (const w of t.split(/[\s,.()@_-]+/)) if (w.length >= 3 && !/^\d+$/.test(w) && !/^(demo|owner|borrower|admin|area|test)$/i.test(w)) words.add(w);
  }
  return [...words];
}

function wordRe(w: string) {
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(w)}(?=$|[^\\p{L}\\p{N}])`, "giu");
}

/** Replaces contact details, exact house addresses and private profile words with [hidden]. */
export function scrubPrivate(text: string, secrets: string[] = []): string {
  let out = normalizeDigits(text)
    .replace(EMAIL, "[hidden]")
    .replace(LINK, "[hidden]")
    .replace(HANDLE, (_m, pre: string) => `${pre}[hidden]`)
    .replace(PHONE, "[hidden]")
    .replace(ADDRESS, (_m, pre: string) => `${pre}[hidden]`);
  for (const s of [...secrets].sort((a, b) => b.length - a.length)) out = out.replace(wordRe(s), (_m, pre: string) => `${pre}[hidden]`);
  return out.replace(/\[hidden\](?:\s*\[hidden\])+/g, "[hidden]");
}

/** True when a text still carries contact details, an exact address or a private word. */
export function hasPrivate(text: string, secrets: string[] = []): boolean {
  const t = normalizeDigits(text);
  if ([EMAIL, LINK, HANDLE, PHONE, ADDRESS].some((re) => new RegExp(re.source, re.flags.replace("g", "")).test(t))) return true;
  return secrets.some((s) => new RegExp(wordRe(s).source, "iu").test(t));
}

/**
 * Things we can't safely interpret: a long digit run that might be a phone number, a spelled-out email,
 * or an "@". The sender is asked to edit instead of us guessing.
 */
export function unsureContact(text: string): string | null {
  const t = normalizeDigits(text).replace(/\[hidden\]/g, " ");
  if (/\d(?:[\s.()-]{0,2}\d){6,}/.test(t)) return "Your message has a long number that could be a phone number. Please remove it or write it differently.";
  if (/@/.test(t) || /\b(?:at|@)\s*(?:gmail|yahoo|hotmail|outlook)\b|\bdot\s*com\b/i.test(t)) return "Your message may contain an email or social handle. Please remove it.";
  return null;
}

/**
 * Delete-only: drops a clause whose private detail was hidden and that only asked to call, message or visit,
 * or said who the person is ("Main [hidden] hoon", "[hidden] pe call karein", "ghar [hidden] mein hai").
 * Otherwise the owner would get an empty "please call me" with nothing to call.
 */
const CONTACT_CLAUSE = /\b(call|phone|fone|number|nambar|whats ?app|sms|text|message|msg|contact|rabta|email|e-mail|ghar|house|address|pata|rehta|rehti|naam|name|hoon|hun|i am|i'm|mera|meri|my)\b/i;
export function dropContactClauses(note: string): string {
  const parts = note.split(/(?<=[,.;!?،۔؟])\s+/);
  const leftWords = (c: string) => c.replace(/\[hidden\]/g, " ").split(/\s+/).filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
  // A clause that is mostly hidden ("[hidden] mein hai.") says nothing once its detail is gone.
  const kept = parts.filter((c) => !(c.includes("[hidden]") && (CONTACT_CLAUSE.test(c) || leftWords(c) < 4)));
  const out = kept.join(" ").trim();
  return out || note;
}

const core = (w: string) => normalizeDigits(w).replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();

/**
 * Keeps only words the person actually wrote, in the order they wrote them (plus [hidden]).
 * The cleaner may delete private details, but must never add or reorder words (e.g. an added "Meherbani hogi").
 */
export function onlySourceWords(cleaned: string, source: string): string {
  const src = normalizeDigits(source).split(/\s+/).map(core);
  let at = 0;
  const kept: string[] = [];
  for (const chunk of cleaned.split(/\s+/)) {
    const c = core(chunk);
    if (!c) continue;
    if (c === "hidden") {
      kept.push(chunk);
      continue;
    }
    let j = at;
    while (j < src.length && src[j] !== c) j++;
    if (j < src.length) {
      kept.push(chunk);
      at = j + 1;
    }
  }
  return kept.join(" ").replace(/\s+([,.!?،؟])/g, "$1").trim();
}

// ---------------- thank-you ----------------
type DoneShape = { status: string; kind: string; quantity: number | string; picked_up_qty: number | string; returned_qty: number | string };

/** Same rule as SQL booking_done(): fully handed over and, for things that come back, everything confirmed back. */
export function bookingDone(r: DoneShape): boolean {
  if (r.status !== "completed") return false;
  const q = Number(r.quantity);
  if (r.kind === "use_up") return Number(r.picked_up_qty) >= q;
  return Number(r.picked_up_qty) >= q && Number(r.returned_qty) >= q;
}

/** A simple editable first sentence, offered only for a finished booking. */
export function thanksStarter(r: DoneShape & { item_name: string; unit: string }): string | null {
  if (!bookingDone(r)) return null;
  const name = r.item_name.toLowerCase();
  const q = Number(r.kind === "use_up" ? r.picked_up_qty : r.returned_qty);
  if (r.kind === "use_up") return `Thank you for the ${r.unit && r.unit !== "item" ? `${q} ${r.unit} of ${name}` : `${q} ${name}`}.`;
  if (q === 1) return `Thank you for lending me the ${name}. I have returned it.`;
  return `Thank you for lending me the ${q} ${name}. I have returned all ${q}.`;
}

// ---------------- speaker, act, negation, condition ----------------
// Word lists across English, Roman Urdu and Urdu. The meaning may be in another language than the message.
const FIRST_PERSON = ["i", "i'm", "im", "i'll", "me", "my", "mine", "we", "us", "our", "main", "mein", "mai", "mujhe", "mujh", "mera", "meri", "mere", "hum", "hamein", "humein", "hamara", "hamari", "hoon", "hun", "میں", "مجھے", "مجھ", "میرا", "میری", "میرے", "ہم", "ہمیں", "ہمارا", "ہماری", "ہوں"];
const NEGATION = ["not", "no", "never", "can't", "cannot", "won't", "don't", "doesn't", "isn't", "nahi", "nahin", "nai", "mat", "نہیں", "نہ", "مت"];
const CONDITION = ["if", "only", "unless", "provided", "agar", "sirf", "tabhi", "warna", "اگر", "صرف", "تبھی", "ورنہ"];

const wordsOf = (s: string) => s.toLowerCase().replace(/[’']/g, "'").split(/[^\p{L}\p{N}']+/u).filter(Boolean);
const hasAny = (s: string, list: string[]) => {
  const w = new Set(wordsOf(s));
  return list.some((x) => w.has(x));
};

/**
 * Fixed checks before the AI reader: a first-person message stays first person, a question stays a question,
 * and every negation and condition survives in the plain meaning. Numbers are checked separately.
 */
export function intentProblems(source: string, out: { lines: string[]; meaning: string }): string[] {
  const p: string[] = [];
  const all = [...out.lines, out.meaning].join(" ");
  if (hasAny(source, FIRST_PERSON) && !hasAny(out.meaning, FIRST_PERSON)) {
    p.push("Keep the sender as the speaker: the message says 'I', so the meaning must also say 'I' (do not address the question to the sender).");
  }
  if (/[?؟]\s*$/.test(source.trim()) && !/[?؟]/.test(out.meaning)) p.push("The message is a question, so the plain meaning must stay a question.");
  if (hasAny(source, NEGATION) && !hasAny(out.meaning, NEGATION)) p.push("The message says 'not'; the plain meaning must keep that negation.");
  if (hasAny(source, CONDITION) && !hasAny(out.meaning, CONDITION)) p.push("The message has a condition ('only if'); the plain meaning must keep it.");
  if (hasAny(source, NEGATION) && !hasAny(all, NEGATION)) p.push("The rhyme dropped the 'not' from the message.");
  return [...new Set(p)];
}

const lastWords = (l: string) => wordsOf(normalizeDigits(l)).filter((w) => !/^\d+$/.test(w));
const tail = (w: string, n: number) => [...w].slice(-n).join("");

/** A rhyme can't be only the same end word repeated: if the last word repeats (radif), the word before must rhyme. */
export function rhymeProblems(lines: string[]): string[] {
  if (lines.length !== 2) return [];
  const a = lastWords(lines[0]!);
  const b = lastWords(lines[1]!);
  if (!a.length || !b.length) return [];
  if (a[a.length - 1] !== b[b.length - 1]) return [];
  // Repeated radif: walk back past identical words, then the first differing pair must share an ending.
  let i = a.length - 1;
  let j = b.length - 1;
  while (i >= 0 && j >= 0 && a[i] === b[j]) {
    i--;
    j--;
  }
  if (i < 0 || j < 0) return ["The two lines end the same way with nothing that rhymes. Use rhyming end words."];
  return tail(a[i]!, 2) === tail(b[j]!, 2) ? [] : ["Don't rhyme by only repeating the same end word; the words before it must rhyme too."];
}
