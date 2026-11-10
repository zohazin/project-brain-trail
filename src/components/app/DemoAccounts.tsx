import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { BookOpen, Feather, FlaskConical, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { TZ } from "@/lib/format";
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "@/lib/demo";
import { prepareShayariDemo } from "@/lib/app.functions";

export { DEMO_ACCOUNTS, DEMO_PASSWORD } from "@/lib/demo";

export function DemoAccounts() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState<string | null>(null);

  async function signIn(email: string) {
    setBusy(email);
    await supabase.auth.signOut();
    const { error } = await supabase.auth.signInWithPassword({ email, password: DEMO_PASSWORD });
    setBusy(null);
    if (error) {
      toast.error("Could not sign in to the demo account.");
      return;
    }
    navigate({ to: "/find" });
  }

  return (
    <section className="rounded-2xl border border-dashed border-attention bg-attention-soft p-4">
      <div className="flex items-center gap-2 text-attention-foreground">
        <FlaskConical className="h-5 w-5" aria-hidden />
        <h2 className="text-lg font-semibold">Try the demo</h2>
      </div>
      <p className="mt-1 text-sm text-attention-foreground">
        Test people with made-up details, not real users. Password for all: <strong>{DEMO_PASSWORD}</strong>.
        Use a second browser or phone to act as an owner.
      </p>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {DEMO_ACCOUNTS.map((a) => (
          <li key={a.email}>
            <Button
              variant="outline"
              className="h-auto w-full flex-col items-start gap-0 whitespace-normal py-2 text-left"
              disabled={busy !== null}
              onClick={() => signIn(a.email)}
            >
              <span className="text-base">{busy === a.email ? "Signing in…" : `Sign in as ${a.name}`}</span>
              <span className="text-xs font-normal text-muted-foreground">{a.role}</span>
            </Button>
          </li>
        ))}
      </ul>
      <DemoGuide className="mt-3" />
    </section>
  );
}

/** The next Sunday (from tomorrow on) in Pakistan time, e.g. "Sunday 15 November 2026". */
export function nextSundayLabel(now = new Date()): string {
  const day = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(now);
  const dow = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(day);
  const add = dow <= 0 ? 7 : 7 - dow;
  const d = new Date(now.getTime() + add * 86_400_000);
  return new Intl.DateTimeFormat("en-GB", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(d).replace(",", "");
}

/** A three-minute walk through the chair scenario with two devices. */
export function DemoGuide({ className }: { className?: string }) {
  const [sunday, setSunday] = useState<string | null>(null);
  useEffect(() => setSunday(nextSundayLabel()), []);
  return (
    <details className={["rounded-xl bg-card p-3 text-sm", className].filter(Boolean).join(" ")}>
      <summary className="flex cursor-pointer items-center gap-2 font-semibold">
        <BookOpen className="h-4 w-4" aria-hidden /> Demo guide (about 3 minutes)
      </summary>
      <ol className="mt-2 list-decimal space-y-1 pl-5">
        <li>
          Phone A: sign in as <strong>Ali</strong>. On Find type: <em>Sunday ko 20 kursiyan chahiye, 1 baje le jaunga, shaam 6 baje wapas</em>.
          {sunday && (
            <>
              {" "}
              The app should show <strong>{sunday}</strong>, 1:00 PM to 6:00 PM, before anything is sent.
            </>
          )}
        </li>
        <li>Ali sees Owner A 12 + Owner B 8. Bilal is left out because he needs his chairs back by 4 PM. Tap Send.</li>
        <li>
          Phone B: sign in as <strong>Sara</strong> → Activity → Yes. Then sign in as <strong>Usman</strong> → No.
        </li>
        <li>Phone A: Activity shows a replacement (Owner C, 8 chairs). Approve it. Phone B: sign in as <strong>Hina</strong> → Yes.</li>
        <li>On a booking in Inbox, Ali taps “I collected”, the owner confirms. Later Ali returns fewer and the owner confirms: “1 still due”.</li>
        <li>
          Profile → <strong>Reset demo data</strong> to start again. Only demo-to-demo records are reset.
        </li>
      </ol>
      <p className="mt-2 text-xs text-muted-foreground">Demo people are made up and only ever see each other. The AI replies are live, not recorded.</p>
      <AiDemoSteps />
      <ShayariDemoSteps />
    </details>
  );
}

/** Mystery Card 2 — Shayari Mode: how to show all three places in about three minutes. */
export function ShayariDemoSteps() {
  return (
    <section aria-labelledby="shayari-demo" className="mt-3 rounded-xl border border-border p-3">
      <h3 id="shayari-demo" className="flex items-center gap-2 font-semibold">
        <Feather className="h-4 w-4 text-primary" aria-hidden /> Shayari demo
      </h3>
      <ol className="mt-2 list-decimal space-y-1 pl-5">
        <li>
          Sign in as <strong>Ali</strong> → Profile → <strong>Prepare Shayari demo</strong>. This resets demo data and sets up three examples. Rhymes are not
          prepared: they are written live.
        </li>
        <li>
          <strong>Booking chat:</strong> open “Chat with Usman (projector)”. Type any message, tap <strong>Make it rhyme</strong>, pick Urdu, Roman Urdu or
          English and Friendly or Funny, then Send. Second browser: sign in as <strong>Usman</strong> → Inbox → the same chat.
        </li>
        <li>
          <strong>Faraway request:</strong> open “Faraway tent request”, choose <strong>10 km</strong>. Farah usually lends within 3 km. Write why you need it
          (try a name or phone number), tap Make it rhyme: you see the safe note and the rhyme before sending. Sign in as <strong>Farah</strong> → Activity.
        </li>
        <li>
          <strong>Thank-you:</strong> open “Chairs from Sara”: 11 of 12 are back, so no thanks yet. Ali taps “I returned” for 12; <strong>Sara</strong> confirms.
          Then Ali sees <strong>Say thanks</strong> and can make it rhyme. Ratings stay separate.
        </li>
        <li>Language and tone are remembered per person. Changing them makes a new rhyme; nothing is sent until you tap Send.</li>
      </ol>
    </section>
  );
}

/** Profile (demo accounts only): resets the demo and prepares the three Shayari starting points. */
export function ShayariDemoSetup() {
  const prepare = useServerFn(prepareShayariDemo);
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState<{ chatRequestId: string; thanksRequestId: string; exceptionWantId: string } | null>(null);
  return (
    <div className="space-y-2">
      <Button
        variant="outline"
        disabled={busy}
        onClick={async () => {
          if (!window.confirm("Prepare the Shayari demo?\n\nThis first resets demo data (demo accounts only), then sets up a projector chat, a faraway tent search and a 12-chair booking with 1 chair still out.")) return;
          setBusy(true);
          try {
            const r = await prepare();
            setReady(r);
            await qc.invalidateQueries();
            toast.success("Shayari demo is ready.");
          } catch (e) {
            toast.error((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Feather />} {busy ? "Preparing…" : "Prepare Shayari demo"}
      </Button>
      {ready && (
        <ul className="space-y-1 text-sm font-semibold">
          <li>
            <Link className="text-primary underline" to="/inbox/$requestId" params={{ requestId: ready.chatRequestId }}>
              Chat with Usman (projector)
            </Link>
          </li>
          <li>
            <Link className="text-primary underline" to="/need/$wantId" params={{ wantId: ready.exceptionWantId }}>
              Faraway tent request (Ali only)
            </Link>
          </li>
          <li>
            <Link className="text-primary underline" to="/inbox/$requestId" params={{ requestId: ready.thanksRequestId }}>
              Chairs from Sara — 1 still due
            </Link>
          </li>
        </ul>
      )}
    </div>
  );
}

/** AI demo results: fictional owners and listings created live when the demo neighbours don't have enough. */
export function AiDemoSteps() {
  return (
    <section aria-labelledby="ai-demo" className="mt-3 rounded-xl border border-border p-3">
      <h3 id="ai-demo" className="font-semibold">AI demo results (any item, one device)</h3>
      <ol className="mt-2 list-decimal space-y-1 pl-5">
        <li>
          Sign in as <strong>Ali</strong>. On Find type, for example: <em>Sunday ko 5 glue guns chahiye, 1 baje le jaunga, shaam 6 baje wapas. Budget 600</em>. Answer
          the one detail question (e.g. full-size, no glue sticks).
        </li>
        <li>
          The demo neighbours have no glue guns, so AI creates 1–3 <strong>fictional</strong> owners live (e.g. 3 + 2), marked “AI demo result”, “Fictional demo listing”
          and “Sample photo unavailable”. Prices, distance and times are checked by the app. Demo stock that fits is always used first.
        </li>
        <li>Tap Send. On each request use the demo buttons: “Simulate owner accepting” or “Simulate owner declining”. A no brings a replacement for only the missing amount.</li>
        <li>
          Open a booking: tap “I collected these items”, then “Confirm pickup as owner”. Return fewer, then “Confirm return as owner” to show “1 still due”. Try
          “Owner shares a meeting time” and Make it rhyme in the chat.
        </li>
        <li>“Create another sample plan” makes a new one before you send. Profile → “Show AI demo results” turns this off. Reset removes every fictional owner and listing.</li>
      </ol>
    </section>
  );
}
