import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ChevronDown, Feather, Loader2, Pencil, RotateCw, SendHorizontal, ShieldCheck, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { AiNotice } from "@/components/app/bits";
import { makeShayari, type ShayariResult } from "@/lib/shayari.functions";
import { profileQuery } from "@/lib/queries";
import {
  SHAYARI_FAILED,
  SHAYARI_LANGUAGES,
  SHAYARI_TONES,
  generationKey,
  langTag,
  textDir,
  type ShayariContext,
  type ShayariLanguage,
  type ShayariPreview,
  type ShayariSnapshot,
  type ShayariTone,
} from "@/lib/shayari";
import { ensureOnline } from "@/hooks/use-app";
import { cn } from "@/lib/utils";

/**
 * The one display for every Shayari message (chat, faraway request, thank-you card):
 * rhyme and plain meaning in labelled columns on wide screens, stacked on phones, original behind a button.
 */
export function ShayariView({
  s,
  rhymeLabel = "Your rhyme",
  originalLabel = "original message",
  className,
}: {
  s: ShayariSnapshot;
  rhymeLabel?: string;
  originalLabel?: string;
  className?: string;
}) {
  const [showOriginal, setShowOriginal] = useState(false);
  const dir = textDir(s.language);
  const urdu = s.language === "urdu";
  // Urdu runs right-to-left; English item names, numbers, prices and times inside it stay in their own direction.
  const textCls = cn("break-words [overflow-wrap:anywhere] [unicode-bidi:isolate]", urdu && "font-urdu text-right");
  return (
    <div className={cn("@container min-w-0 space-y-2", className)}>
      <div className="grid gap-3 @md:grid-cols-[3fr_2fr] @md:gap-4">
        <section aria-label={rhymeLabel} className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{rhymeLabel}</p>
          <p dir={dir} lang={langTag(s.language)} className={cn("mt-1 text-lg font-semibold", textCls, urdu ? "leading-[2.4]" : "leading-snug")}>
            <span className="block">{s.lines[0]}</span>
            <span className="block">{s.lines[1]}</span>
          </p>
        </section>
        <section aria-label="Plain meaning" className="min-w-0 @md:border-l @md:border-border @md:pl-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Plain meaning</p>
          <p dir={dir} lang={langTag(s.language)} className={cn("mt-1 text-[0.95rem] text-muted-foreground", textCls, urdu ? "leading-[2.2]" : "leading-relaxed")}>
            {s.meaning}
          </p>
        </section>
      </div>
      <div>
        <button
          type="button"
          aria-expanded={showOriginal}
          onClick={() => setShowOriginal((v) => !v)}
          className="inline-flex min-h-10 items-center gap-1 rounded-lg px-1 text-sm font-semibold text-primary underline-offset-4 hover:underline"
        >
          <ChevronDown className={cn("h-4 w-4 transition-transform", showOriginal && "rotate-180")} aria-hidden />
          {showOriginal ? `Hide ${originalLabel}` : `Show ${originalLabel}`}
        </button>
        {showOriginal && (
          <p dir="auto" className="mt-1 whitespace-pre-wrap break-words rounded-lg bg-muted p-2 text-sm [unicode-bidi:plaintext]">
            {s.original}
          </p>
        )}
      </div>
    </div>
  );
}

/** The person's remembered language and tone. Saved on their profile; nothing is sent automatically. */
export function useShayariPrefs(): [ShayariLanguage, ShayariTone, (l: ShayariLanguage) => void, (t: ShayariTone) => void] {
  const { userId } = useRouteContext({ from: "/_authenticated" });
  const qc = useQueryClient();
  const profile = useQuery(profileQuery(userId));
  const [lang, setLang] = useState<ShayariLanguage | null>(null);
  const [tone, setTone] = useState<ShayariTone | null>(null);
  const p = profile.data as { shayari_language?: ShayariLanguage; shayari_tone?: ShayariTone } | undefined;
  const save = (patch: { shayari_language?: ShayariLanguage; shayari_tone?: ShayariTone }) => {
    void supabase
      .from("profiles")
      .update(patch)
      .eq("id", userId)
      .then(() => qc.invalidateQueries({ queryKey: ["profile", userId] }));
  };
  return [
    lang ?? p?.shayari_language ?? "roman_urdu",
    tone ?? p?.shayari_tone ?? "friendly",
    (l) => {
      setLang(l);
      save({ shayari_language: l });
    },
    (t) => {
      setTone(t);
      save({ shayari_tone: t });
    },
  ];
}

type Target = {
  requestId?: string;
  itemId?: string;
  wantId?: string;
  quantity?: number | null;
  pickupAt?: string | null;
  returnAt?: string | null;
};

type Status = "making" | "ready" | "choose" | "failed" | "stale" | "idle";

function Choice<T extends string>({ label, value, options, onChange, disabled }: { label: string; value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; disabled?: boolean }) {
  return (
    <div role="radiogroup" aria-label={label} className="space-y-1">
      <p className="text-sm font-semibold">{label}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <Button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={value === o.id}
            variant={value === o.id ? "default" : "outline"}
            size="sm"
            className="h-10 px-4"
            disabled={disabled}
            onClick={() => onChange(o.id)}
          >
            {o.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

/**
 * One preview panel for every place Shayari Mode appears. It never sends by itself:
 * the person reviews the rhyme and chooses Send or Send original.
 */
export function ShayariPanel({
  context,
  source,
  target,
  onSendRhyme,
  onSendOriginal,
  onEditSource,
  onClose,
  sending,
  sendLabel = "Send",
}: {
  context: ShayariContext;
  source: string;
  target: Target;
  onSendRhyme: (p: ShayariPreview) => void;
  onSendOriginal: (original: string) => void;
  onEditSource: () => void;
  onClose: () => void;
  sending?: boolean;
  sendLabel?: string;
}) {
  const make = useServerFn(makeShayari);
  const [lang, tone, setLang, setTone] = useShayariPrefs();
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<{ key: string; preview: ShayariPreview } | null>(null);
  const [choose, setChoose] = useState<{ key: string; options: string[] } | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [keyMessage, setKeyMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ text: string; serious?: boolean; ai?: boolean; retryAfter?: number | null } | null>(null);
  const [safeOriginal, setSafeOriginal] = useState<string | null>(null);
  const [cleaned, setCleaned] = useState(false);
  const latest = useRef<string | null>(null);
  const inflight = useRef<string | null>(null);

  const currentKey = generationKey({ source, language: lang, tone, keyMessage });

  async function run(opts: { fresh?: boolean; key?: string | null; lang?: ShayariLanguage; tone?: ShayariTone } = {}) {
    const km = opts.key === undefined ? keyMessage : opts.key;
    const language = opts.lang ?? lang;
    const tn = opts.tone ?? tone;
    const text = source.trim();
    if (!text) return;
    if (!ensureOnline()) {
      setStatus("failed");
      setNotice({ text: "You're offline. New rhymes need a connection. You can still send your original message." });
      return;
    }
    const key = generationKey({ source: text, language, tone: tn, keyMessage: km });
    // A second tap for the same message, language and tone while it is still being made: no extra request.
    if (inflight.current === key && !opts.fresh) return;
    inflight.current = key;
    latest.current = key;
    setStatus("making");
    setNotice(null);
    setResult(null);
    setChoose(null);
    let r: ShayariResult;
    try {
      r = await make({
        data: {
          context,
          requestId: target.requestId ?? null,
          itemId: target.itemId ?? null,
          wantId: target.wantId ?? null,
          quantity: target.quantity ?? null,
          pickupAt: target.pickupAt ?? null,
          returnAt: target.returnAt ?? null,
          text,
          keyMessage: km,
          language,
          tone: tn,
          fresh: opts.fresh,
        },
      });
    } catch (e) {
      if (inflight.current === key) inflight.current = null;
      if (latest.current !== key) return;
      setStatus("failed");
      setNotice({ text: e instanceof Error && e.message === "Not allowed" ? "You can't make a rhyme here." : SHAYARI_FAILED });
      return;
    }
    if (inflight.current === key) inflight.current = null;
    // An older reply must never replace a newer draft, language or tone.
    if (latest.current !== key) return;
    if (r.ok && "preview" in r) {
      setResult({ key, preview: r.preview });
      setSafeOriginal(r.preview.original);
      setCleaned(r.cleaned);
      setStatus("ready");
    } else if (r.ok) {
      setChoose({ key, options: r.chooseKey.options });
      setPicked(null);
      setSafeOriginal(r.chooseKey.original);
      setCleaned(r.cleaned);
      setStatus("choose");
    } else if ("aiError" in r) {
      setStatus("failed");
      setNotice({ text: r.aiError, ai: true, retryAfter: r.retryAfter });
    } else {
      setStatus("failed");
      if (r.original) setSafeOriginal(r.original);
      setNotice({ text: r.message, serious: r.problem === "serious" });
    }
  }

  // Start once on open; language, tone and key-message changes start a new rhyme below.
  useEffect(() => {
    void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const pickLang = (l: ShayariLanguage) => {
    if (l === lang) return;
    setLang(l);
    void run({ lang: l });
  };
  const pickTone = (t: ShayariTone) => {
    if (t === tone) return;
    setTone(t);
    void run({ tone: t });
  };
  const chooseKeyMessage = (k: string | null) => {
    setKeyMessage(k);
    void run({ key: k });
  };

  // Editing the message while a rhyme is being made (or after) invalidates the old result.
  const sourceRef = useRef(source);
  useEffect(() => {
    if (sourceRef.current === source) return;
    sourceRef.current = source;
    latest.current = null;
    inflight.current = null;
    setResult(null);
    setChoose(null);
    setKeyMessage(null);
    setSafeOriginal(null);
    setNotice(null);
    setStatus(source.trim() ? "stale" : "idle");
  }, [source]);

  const fresh = result && result.key === currentKey ? result.preview : null;
  const shownOriginal = context === "exception" ? safeOriginal : source.trim();
  const busy = status === "making";

  return (
    <div className="space-y-3 rounded-2xl border-2 border-primary/40 bg-card p-4 text-card-foreground" aria-live="polite">
      <div className="flex items-start justify-between gap-2">
        <h3 className="flex items-center gap-2 text-lg font-bold">
          <Feather className="h-5 w-5 text-primary" aria-hidden /> Make it rhyme
        </h3>
        <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="Close Make it rhyme">
          <X />
        </Button>
      </div>

      <div className="rounded-xl bg-muted p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {context === "exception" && shownOriginal ? "Original message (as the owner will see it)" : "Original message"}
        </p>
        <p dir="auto" className="mt-1 whitespace-pre-wrap">
          {shownOriginal ?? source.trim()}
        </p>
        {context === "exception" && !shownOriginal && (
          <p className="mt-1 text-xs text-muted-foreground">We hide names, phone numbers and addresses before making the rhyme.</p>
        )}
        {context === "exception" && cleaned && (
          <p className="mt-2 flex items-center gap-1 text-sm font-semibold text-attention-foreground">
            <ShieldCheck className="h-4 w-4" aria-hidden /> We took out names, phone numbers or addresses.
          </p>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Choice label="Choose language" value={lang} options={SHAYARI_LANGUAGES} onChange={pickLang} />
        <Choice label="Tone" value={tone} options={SHAYARI_TONES} onChange={pickTone} />
      </div>

      {status === "making" && (
        <p className="flex items-center gap-2 font-semibold">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Making your rhyme…
        </p>
      )}
      {status === "stale" && (
        <div className="space-y-2">
          <p className="font-semibold">Your message changed.</p>
          <Button type="button" onClick={() => void run({ key: null })}>
            <Feather /> Make it rhyme
          </Button>
        </div>
      )}
      {status === "choose" && choose && (
        <div className="space-y-2">
          <p className="font-semibold">Your message has several points. Pick the key message for the rhyme:</p>
          <div role="radiogroup" aria-label="Key message" className="space-y-2">
            {choose.options.map((o) => (
              <label key={o} className={cn("flex cursor-pointer gap-2 rounded-xl border p-3", picked === o && "border-primary bg-primary/5")}>
                <input type="radio" name="key-message" className="mt-1" checked={picked === o} onChange={() => setPicked(o)} />
                <span>{o}</span>
              </label>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">Your full original message stays available to send instead.</p>
          <Button type="button" disabled={!picked} onClick={() => chooseKeyMessage(picked)}>
            Use this key message
          </Button>
        </div>
      )}
      {status === "failed" && notice && (
        <div className="space-y-2">
          <p className="font-semibold">Couldn't make a rhyme</p>
          {notice.ai ? (
            <AiNotice
              message={notice.text}
              retryAfter={notice.retryAfter}
              onRetry={() => void run({ fresh: true })}
              retrying={busy}
              next={
                context === "exception" && !safeOriginal
                  ? "Faraway notes need the privacy check first, so you can send this later, or go back and send the request without a note."
                  : "You can send the original message instead."
              }
            />
          ) : (
            <p className="rounded-xl bg-attention-soft p-3 font-semibold text-attention-foreground">{notice.text}</p>
          )}
          {notice.serious && (
            <Button type="button" variant="outline" onClick={() => pickTone("friendly")}>
              Use Friendly
            </Button>
          )}
        </div>
      )}

      {fresh && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-success">Ready to send — check it first</p>
          <p className="text-sm text-muted-foreground">
            This part becomes the rhyme: <span className="text-foreground">{fresh.key_message}</span>
          </p>
          <div className="rounded-xl bg-secondary/60 p-3">
            <ShayariView s={fresh} />
          </div>
          {context === "exception" && (
            <p className="text-sm text-muted-foreground">The owner sees exactly this, without your name. It is not a booking until they say yes.</p>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {fresh && (
          <Button type="button" disabled={sending} onClick={() => onSendRhyme(fresh)}>
            {sending ? <Loader2 className="animate-spin" aria-hidden /> : <SendHorizontal />} {sending ? "Sending…" : sendLabel}
          </Button>
        )}
        <Button
          type="button"
          variant="outline"
          disabled={sending || !(context === "exception" ? safeOriginal : source.trim())}
          onClick={() => onSendOriginal(context === "exception" ? safeOriginal! : source.trim())}
        >
          Send original
        </Button>
        {(fresh || (status === "failed" && !notice?.ai)) && (
          <Button type="button" variant="ghost" disabled={busy || sending} onClick={() => void run({ fresh: true })}>
            <RotateCw /> Try again
          </Button>
        )}
        <Button type="button" variant="ghost" disabled={sending} onClick={onEditSource}>
          <Pencil /> Edit message
        </Button>
      </div>
      {context === "exception" && !safeOriginal && (
        <p className="text-xs text-muted-foreground">“Send original” is available once we have checked your message for private details.</p>
      )}
    </div>
  );
}
