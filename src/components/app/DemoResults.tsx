// AI demo results: labels, the one-time explanation, live creation of sample matches and simulated-owner actions.
// Demo accounts only. Every label says plainly that these listings and owners are fictional.
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Bot, Check, Handshake, PackageCheck, RefreshCw, Sparkles, Undo2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AiNotice, Card } from "@/components/app/bits";
import { demoMatches, simOwnerAction } from "@/lib/app.functions";
import { errMessage } from "@/lib/queries";
import { fmtShort } from "@/lib/format";
import { ensureOnline } from "@/hooks/use-app";
import type { Plan } from "@/lib/plan-types";

export const SAMPLE_PHOTO_TEXT = "Sample photo unavailable";

export function AiDemoLabel({ className }: { className?: string }) {
  return (
    <span className={["inline-flex flex-wrap items-center gap-1", className].filter(Boolean).join(" ")}>
      <span className="inline-flex items-center gap-1 rounded-full bg-attention px-2 py-0.5 text-xs font-semibold text-foreground">
        <Bot className="h-3.5 w-3.5" aria-hidden /> AI demo result
      </span>
      <span className="rounded-full border border-attention px-2 py-0.5 text-xs font-semibold">Fictional demo listing</span>
    </span>
  );
}

export function SimulatedOwnerLabel() {
  return <span className="rounded-full border border-attention bg-attention-soft px-2 py-0.5 text-xs font-semibold text-attention-foreground">Simulated owner</span>;
}

const INTRO_KEY = "cu-ai-demo-intro";

/** Shown once per device (until sign-out clears it). */
export function DemoIntro() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      setShow(!window.localStorage.getItem(INTRO_KEY));
    } catch {
      setShow(false);
    }
  }, []);
  if (!show) return null;
  return (
    <Card tone="attention" className="space-y-2">
      <p className="flex items-center gap-2 font-semibold">
        <Sparkles className="h-5 w-5" aria-hidden /> AI demo results
      </p>
      <p className="text-sm">
        In demo accounts, when the demo neighbours don't have enough, AI creates a few <strong>fictional</strong> owners and listings live for your request.
        They are labelled, only demo accounts can see them, and you can act as their owner with the demo buttons. Real members never see them.
      </p>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          try {
            window.localStorage.setItem(INTRO_KEY, "1");
          } catch {
            /* ignore */
          }
          setShow(false);
        }}
      >
        Got it
      </Button>
    </Card>
  );
}

/** Banner above a plan that contains fictional listings. */
export function DemoPlanBanner({ plan, justCreated, canReplace, onAnother, busy }: { plan: Plan; justCreated: boolean; canReplace: boolean; onAnother: () => void; busy: boolean }) {
  return (
    <div className="mt-3 space-y-2 rounded-xl border-2 border-dashed border-attention bg-attention-soft p-3 text-sm text-attention-foreground">
      <p className="font-semibold">
        <Bot className="mr-1 inline h-4 w-4" aria-hidden />
        {justCreated ? "AI just created the fictional listings marked below for this demo." : `AI created the fictional listings marked below for this demo${plan.demoCreatedAt ? ` (${fmtShort(plan.demoCreatedAt)})` : ""}. They are saved, not made again.`}
      </p>
      <p>Prices, distances and availability were checked by the app like any other listing. Nothing is booked until each owner says yes.</p>
      {canReplace && (
        <Button size="sm" variant="outline" disabled={busy} onClick={onAnother}>
          <RefreshCw className={busy ? "animate-spin" : ""} /> {busy ? "Creating…" : "Create another sample plan"}
        </Button>
      )}
    </div>
  );
}

type Outcome = Awaited<ReturnType<typeof demoMatches>>;

/** Asks the server to fill the missing amount with fictional listings. Runs once per search version; never repeats on its own after a failure. */
export function DemoMaker({ wantId, km, need, missing, backup, planCreatedAt, onPlan }: { wantId: string; km: number; need: number; missing: number; backup?: boolean; planCreatedAt?: string | undefined; onPlan: (o: Extract<Outcome, { ok: true }>) => void }) {
  const fn = useServerFn(demoMatches);
  const [manual, setManual] = useState<Outcome | null>(null);
  const [busy, setBusy] = useState(false);
  const q = useQuery({
    queryKey: ["demo-matches", wantId, km, need, missing, backup ? `b:${planCreatedAt ?? ""}` : "plan"],
    queryFn: () => fn({ data: { wantId, km, mode: "auto", ...(backup ? { backup: true } : {}) } }),
    staleTime: Infinity,
    retry: false,
    refetchOnWindowFocus: false,
    refetchInterval: (query) => (query.state.data && !query.state.data.ok && query.state.data.pending ? 4000 : false),
  });
  const out = manual ?? q.data;
  useEffect(() => {
    if (out?.ok && (out.created || out.plan.missing < missing)) onPlan(out);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [out]);

  async function run(mode: "retry" | "another") {
    if (busy || !ensureOnline()) return;
    setBusy(true);
    try {
      setManual(await fn({ data: { wantId, km, mode, ...(backup ? { backup: true } : {}) } }));
    } catch (e) {
      toast.error(errMessage(e));
    } finally {
      setBusy(false);
    }
  }

  if (q.isPending || busy || (out && !out.ok && out.pending)) {
    return (
      <Card>
        <p className="flex items-center gap-2 font-semibold">
          <Sparkles className="h-5 w-5 animate-pulse text-primary" aria-hidden /> Creating sample matches for your demo…
        </p>
        <p className="mt-1 text-sm text-muted-foreground">AI is writing fictional neighbours and listings for the missing amount. This takes a few seconds.</p>
      </Card>
    );
  }
  if (q.isError) return <AiNotice message={errMessage(q.error)} onRetry={() => void run("retry")} retrying={busy} />;
  if (!out) return null;
  if (!out.ok && out.aiError) {
    return (
      <AiNotice
        message={out.aiError}
        retryAfter={out.retryAfter}
        onRetry={() => void run("retry")}
        retrying={busy}
        next="No fictional listings were added and nothing is reserved. Real demo results above stay as they are."
      />
    );
  }
  if (!out.ok && out.problem) {
    return (
      <Card tone="attention">
        <p className="font-semibold">{out.problem}</p>
      </Card>
    );
  }
  if (out.ok && out.note) {
    return (
      <Card tone="attention" className="space-y-2">
        <p className="font-semibold">{out.note}</p>
        {!backup && (
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void run("another")}>
            <RefreshCw /> Create another sample plan
          </Button>
        )}
      </Card>
    );
  }
  return null;
}

type SimReq = { id: string; status: string; simulated: boolean; kind: string; quantity: number | string; picked_up_qty: number | string; returned_qty: number | string; borrower_picked_qty: number | string; borrower_returned_qty: number | string };

/** Presenter controls: act as the simulated owner. Every tap goes through the normal booking rules. */
export function SimOwnerActions({ r, onDone, showMeet }: { r: SimReq; onDone?: () => void | Promise<void>; showMeet?: boolean }) {
  const fn = useServerFn(simOwnerAction);
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  if (!r.simulated) return null;
  const picked = Number(r.picked_up_qty);
  const claimedPick = Number(r.borrower_picked_qty);
  const back = Number(r.returned_qty);
  const claimedBack = Number(r.borrower_returned_qty);

  async function act(action: "accept" | "decline" | "pickup" | "return" | "meet", ok: string) {
    if (busy || !ensureOnline()) return;
    setBusy(action);
    try {
      await fn({ data: { requestId: r.id, action } });
      toast.success(ok);
    } catch (e) {
      toast.error(errMessage(e));
    } finally {
      setBusy(null);
      await qc.invalidateQueries({ queryKey: ["want"] });
      await qc.invalidateQueries({ queryKey: ["request", r.id] });
      await qc.invalidateQueries({ queryKey: ["activity"] });
      await qc.invalidateQueries({ queryKey: ["notifications"] });
      await onDone?.();
    }
  }

  const buttons: { key: "accept" | "decline" | "pickup" | "return" | "meet"; label: string; ok: string; icon: typeof Check; variant?: "outline" }[] = [];
  if (r.status === "requested") {
    buttons.push({ key: "accept", label: "Simulate owner accepting", ok: "The simulated owner said yes.", icon: Check });
    buttons.push({ key: "decline", label: "Simulate owner declining", ok: "The simulated owner said no.", icon: X, variant: "outline" });
  }
  if (r.status === "confirmed") {
    if (claimedPick > picked) buttons.push({ key: "pickup", label: `Confirm pickup as owner (${claimedPick})`, ok: "Pickup confirmed by the simulated owner.", icon: PackageCheck });
    if (r.kind === "return" && claimedBack > back) buttons.push({ key: "return", label: `Confirm return as owner (${claimedBack})`, ok: "Return confirmed by the simulated owner.", icon: Undo2 });
    if (showMeet) buttons.push({ key: "meet", label: "Owner shares a meeting time", ok: "The simulated owner shared when they are free.", icon: Handshake, variant: "outline" });
  }
  if (buttons.length === 0) {
    if (r.status !== "confirmed") return null;
    return (
      <p className="rounded-xl border border-dashed border-attention p-2 text-sm text-attention-foreground">
        Demo: tap “I collected” or record a return first, then confirm it here as the simulated owner.
      </p>
    );
  }
  return (
    <div className="space-y-2 rounded-xl border-2 border-dashed border-attention bg-attention-soft p-3 text-attention-foreground">
      <p className="text-sm font-semibold">Demo actions (you act as the simulated owner)</p>
      <div className="flex flex-wrap gap-2">
        {buttons.map((b) => (
          <Button key={b.key} size="sm" variant={b.variant ?? "default"} disabled={busy !== null} onClick={() => void act(b.key, b.ok)}>
            <b.icon /> {busy === b.key ? "Working…" : b.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
