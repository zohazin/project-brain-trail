import { createFileRoute, Link } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ShayariView } from "@/components/app/Shayari";
import { isShayariSnapshot } from "@/lib/shayari";
import { useState } from "react";
import { toast } from "sonner";
import { ChevronRight } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, Empty, PageTitle, Pill, statusTone } from "@/components/app/bits";
import { answerException, answerRequest } from "@/lib/app.functions";
import { ensureOnline } from "@/hooks/use-app";
import { activityQuery, errMessage } from "@/lib/queries";
import { fmtDateTime, fmtQty, fmtShort, money } from "@/lib/format";
import type { Plan } from "@/lib/plan-types";

type Want = Database["public"]["Tables"]["wants"]["Row"];
type Req = Database["public"]["Tables"]["requests"]["Row"];

export const Route = createFileRoute("/_authenticated/_tabs/activity")({
  head: () => ({
    meta: [
      { title: "Activity — Cheez Udhaar" },
      { name: "description", content: "Your requests, pickups and returns with the next step for each." },
      { property: "og:title", content: "Activity — Cheez Udhaar" },
      { property: "og:description", content: "Your requests, pickups and returns with the next step for each." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(activityQuery(context.userId)),
  component: Activity,
});

function Activity() {
  const { userId } = Route.useRouteContext();
  const { data } = useSuspenseQuery(activityQuery(userId));
  const incoming = data.requests.filter((r) => r.owner_id === userId && r.status === "requested");
  const lending = data.requests.filter((r) => r.owner_id === userId && (r.status === "confirmed" || r.status === "completed"));
  const wants = data.wants.filter((w) => w.status !== "cancelled");

  return (
    <div className="space-y-8">
      <PageTitle sub="Requests, pickups and returns.">Activity</PageTitle>

      {incoming.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xl font-bold">Needs your answer</h2>
          {incoming.map((r) => (
            <IncomingCard key={r.id} r={r} />
          ))}
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-xl font-bold">Borrowing</h2>
        {wants.length === 0 && (
          <Empty>
            Nothing yet. Go to <Link to="/find" className="font-semibold text-primary underline">Find</Link> and tell us what you need.
          </Empty>
        )}
        {wants.map((w) => (
          <WantRow key={w.id} w={w} requests={data.requests.filter((r) => r.want_id === w.id)} />
        ))}
      </section>

      {lending.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-xl font-bold">Lending</h2>
          {lending.map((r) => {
            const out = Number(r.picked_up_qty) - Number(r.returned_qty);
            const claim =
              r.status === "confirmed" &&
              (Number(r.borrower_picked_qty) > Number(r.picked_up_qty) || Number(r.borrower_returned_qty) > Number(r.returned_qty));
            const next =
              r.status === "completed"
                ? "Done"
                : claim
                  ? "Please confirm what was handed over or returned"
                  : Number(r.picked_up_qty) === 0
                    ? `Pickup ${fmtShort(r.pickup_at)}`
                    : r.kind === "return" && out > 0
                      ? `${Number(r.returned_qty)} of ${Number(r.picked_up_qty)} returned — ${out} still due ${fmtShort(r.return_at)}`
                      : "In progress";
            const overdue = Boolean(r.status === "confirmed" && r.kind === "return" && r.return_at && new Date(r.return_at) < new Date() && out > 0);
            const late = overdue || claim;
            return (
              <Link key={r.id} to="/inbox/$requestId" params={{ requestId: r.id }} className="block">
                <Card tone={late ? "attention" : undefined} className="flex items-center gap-3">
                  <div className="flex-1">
                    <p className="font-semibold">
                      {fmtQty(Number(r.quantity), r.unit)} {r.item_name.toLowerCase()} · {r.borrower_name ?? "Borrower"}
                    </p>
                    <p className={late ? "font-semibold" : "text-sm text-muted-foreground"}>{overdue && !claim ? `Late: ${next}` : next}</p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" aria-hidden />
                </Card>
              </Link>
            );
          })}
        </section>
      )}
    </div>
  );
}

function IncomingCard({ r }: { r: Req }) {
  const qc = useQueryClient();
  const answer = useServerFn(answerRequest);
  const answerExc = useServerFn(answerException);
  const [busy, setBusy] = useState<"yes" | "no" | null>(null);
  const needsDistance = r.is_exception && (r.exception_status ?? "pending") === "pending";

  async function respond(accept: boolean) {
    if (busy) return;
    if (!ensureOnline()) return;
    setBusy(accept ? "yes" : "no");
    try {
      // Send the version on screen: if the borrower changed the request meanwhile, the old terms are refused.
      await answer({ data: { requestId: r.id, accept, version: r.terms_version } });
      toast.success(accept ? "Confirmed. A private chat is open in Inbox." : "You said no. Thanks for answering.");
    } catch (e) {
      toast.error(errMessage(e));
    } finally {
      setBusy(null);
      await qc.invalidateQueries({ queryKey: ["activity"] });
    }
  }

  async function distance(allow: boolean) {
    if (busy) return;
    if (!ensureOnline()) return;
    setBusy(allow ? "yes" : "no");
    try {
      await answerExc({ data: { requestId: r.id, allow } });
      toast.success(allow ? "Distance allowed. Now decide if you can lend it." : "You said no to the distance.");
    } catch (e) {
      toast.error(errMessage(e));
    } finally {
      setBusy(null);
      await qc.invalidateQueries({ queryKey: ["activity"] });
    }
  }

  return (
    <Card tone="attention">
      <p className="text-lg font-semibold">
        {r.is_exception ? "Someone a bit farther away" : (r.borrower_name ?? "Someone nearby")} wants {fmtQty(Number(r.quantity), r.unit)}{" "}
        {r.item_name.toLowerCase()}
      </p>
      <p>Pickup: <strong>{fmtDateTime(r.pickup_at)}</strong></p>
      {r.kind === "return" ? (
        <p>Bring back: <strong>{fmtDateTime(r.return_at)}</strong></p>
      ) : (
        <p>It gets used up — no return.</p>
      )}
      <p>You get: <strong>{money(Number(r.total_rs))}</strong></p>
      <p className="text-sm text-muted-foreground">Their name and photo are shared only if you say yes.</p>
      {r.is_exception && (
        <div className="mt-2 rounded-xl bg-card p-3">
          <p className="text-sm font-semibold">They are outside your usual distance and asked for an exception:</p>
          {isShayariSnapshot(r.note_shayari) ? (
            <div className="mt-2 space-y-1">
              <p className="text-xs font-semibold text-muted-foreground">From: Anonymous borrower</p>
              <ShayariView s={r.note_shayari} rhymeLabel="Rhyme" />
            </div>
          ) : (
            <p className="italic">“{r.note}”</p>
          )}
          <p className="mt-1 text-sm">
            {needsDistance
              ? "Step 1: do you allow this distance? Saying yes here does not book anything yet."
              : "You allowed the distance. Step 2: can you lend it?"}
          </p>
        </div>
      )}
      {needsDistance ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button size="lg" disabled={busy !== null} onClick={() => distance(true)}>
            {busy === "yes" ? "Saving…" : "Allow the distance"}
          </Button>
          <Button size="lg" variant="outline" disabled={busy !== null} onClick={() => distance(false)}>
            {busy === "no" ? "Saving…" : "No, too far"}
          </Button>
        </div>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button size="lg" disabled={busy !== null} onClick={() => respond(true)}>
            {busy === "yes" ? "Saving…" : "Yes, lend it"}
          </Button>
          <Button size="lg" variant="outline" disabled={busy !== null} onClick={() => respond(false)}>
            {busy === "no" ? "Saving…" : "No, sorry"}
          </Button>
        </div>
      )}
      <button
        type="button"
        className="mt-2 text-sm font-semibold text-muted-foreground underline"
        disabled={busy !== null}
        onClick={async () => {
          if (!window.confirm("Say no and block this person? They won't see your items again. You can unblock in your profile.")) return;
          const { error } = await supabase.rpc("block_from_request", { _req: r.id });
          if (error) { toast.error(error.message); return; }
          toast.success("Blocked.");
          await qc.invalidateQueries({ queryKey: ["activity"] });
        }}
      >
        Say no and block this person
      </button>
    </Card>
  );
}

function wantStatus(w: Want, reqs: Req[]): { text: string; attention: boolean } {
  const pending = w.pending_plan as Plan | null;
  if (pending?.lines?.length) return { text: `${pending.reason} We found a replacement — approve it?`, attention: true };
  if (pending) return { text: pending.reason ?? "An owner said no.", attention: true };
  if (w.status === "asking") return { text: w.next_question ?? "Tell us a bit more", attention: true };
  if (w.status === "ready") return { text: "See matches and send requests", attention: true };
  const live = reqs.filter((r) => ["requested", "confirmed", "completed"].includes(r.status));
  const covered = live.reduce((s, r) => s + Number(r.quantity), 0);
  const missing = Number(w.quantity ?? 0) - covered;
  const name = (w.item_name ?? "").toLowerCase();
  const owed = live.filter((r) => r.kind === "return" && Number(r.picked_up_qty) > Number(r.returned_qty));
  const anyPicked = live.some((r) => Number(r.picked_up_qty) > 0);
  if (missing > 0) return { text: `${fmtQty(missing, w.unit)} ${w.unit === "item" ? name : ""} still needed`.trim(), attention: true };
  const waiting = live.filter((r) => r.status === "requested");
  if (waiting.length) return { text: `Waiting for ${waiting.map((r) => r.owner_name).join(" and ")}`, attention: false };
  if (anyPicked && owed.length) {
    const back = live.reduce((s, r) => s + Number(r.returned_qty), 0);
    const picked = live.reduce((s, r) => s + Number(r.picked_up_qty), 0);
    if (back > 0) return { text: `${back} of ${picked} back · ${owed.map((r) => r.owner_name).join(", ")} still owed`, attention: true };
    return { text: `Bring back by ${fmtShort(w.return_at)}`, attention: false };
  }
  if (live.length && live.every((r) => r.status === "completed")) return { text: "All done", attention: false };
  return { text: `All ${fmtQty(Number(w.quantity), w.unit)} confirmed · pickup ${fmtShort(w.pickup_at)}`, attention: false };
}

const SHORT_STATUS: Record<string, string> = {
  requested: "Waiting for the owner",
  confirmed: "Confirmed",
  declined: "Said no",
  completed: "Done",
  expired: "Expired",
};

function WantRow({ w, requests }: { w: Want; requests: Req[] }) {
  const s = wantStatus(w, requests);
  return (
    <Link to="/need/$wantId" params={{ wantId: w.id }} className="block">
      <Card tone={s.attention ? "attention" : undefined} className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            {w.quantity ? `${fmtQty(Number(w.quantity), w.unit)} ` : ""}
            {w.item_name ?? w.original_text.slice(0, 60)}
          </p>
          <p className={s.attention ? "font-semibold text-attention-foreground" : "text-sm text-muted-foreground"}>{s.text}</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {requests
              .filter((r) => r.status !== "cancelled")
              .map((r) => (
                <Pill key={r.id} tone={statusTone(r.status)}>
                  {r.owner_name}: {SHORT_STATUS[r.status] ?? r.status}
                </Pill>
              ))}
          </div>
        </div>
        <ChevronRight className="h-5 w-5 text-muted-foreground" aria-hidden />
      </Card>
    </Link>
  );
}
