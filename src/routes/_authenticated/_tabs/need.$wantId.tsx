import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { CalendarClock, Check, ChevronRight, Feather, MapPin, MapPinned, SendHorizontal, Sparkles } from "lucide-react";
import { ShayariPanel } from "@/components/app/Shayari";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DistancePicker } from "@/components/app/DistancePicker";
import { AiNotice, Card, ItemThumb, Pill, Stars, requestStatusWords, statusTone } from "@/components/app/bits";
import { applyQuantityChange, cancelBooking, cleanNote, planForWant, talkNeed } from "@/lib/app.functions";
import { errMessage, profileQuery, wantQuery } from "@/lib/queries";
import { coverageLine, fmtDateTime, fmtDistance, fmtQty, money, priceLabel } from "@/lib/format";
import { QuoteBox, type QuoteRow } from "@/components/app/Quote";
import type { Plan, PlanLine } from "@/lib/plan-types";
import type { ChangePreview } from "@/lib/change";
import { ensureOnline, useDraft } from "@/hooks/use-app";

type Want = Database["public"]["Tables"]["wants"]["Row"];
type Req = Database["public"]["Tables"]["requests"]["Row"];

export const Route = createFileRoute("/_authenticated/_tabs/need/$wantId")({
  head: () => ({
    meta: [
      { title: "Your request — Cheez Udhaar" },
      { name: "description", content: "Your borrowing request: who can lend, the exact price and what is confirmed." },
      { property: "og:title", content: "Your request — Cheez Udhaar" },
      { property: "og:description", content: "Your borrowing request: who can lend, the exact price and what is confirmed." },
    ],
  }),
  loader: ({ context, params }) => context.queryClient.ensureQueryData(wantQuery(params.wantId)),
  component: NeedPage,
});

function itemWord(w: Pick<Want, "item_name" | "unit">, qty?: number | null) {
  const name = (w.item_name ?? "items").toLowerCase();
  if (w.unit && w.unit !== "item") return `${qty ?? ""} ${w.unit} of ${name}`.trim();
  return qty != null ? `${qty} ${name}` : name;
}

function NeedPage() {
  const { wantId } = Route.useParams();
  const { data } = useSuspenseQuery(wantQuery(wantId));
  const { want, requests } = data;

  const active = requests.filter((r) => ["requested", "confirmed", "completed"].includes(r.status));
  const covered = active.reduce((s, r) => s + Number(r.quantity), 0);
  const missing = Math.max(0, Number(want.quantity ?? 0) - covered);
  const pending = want.pending_plan as Plan | null;

  return (
    <div className="space-y-5">
      <Link to="/activity" className="text-sm font-semibold text-primary">
        ← Activity
      </Link>
      <Conversation want={want} />
      {(want.status === "ready" || want.status === "active") && <Summary want={want} />}
      {pending && <Backup want={want} plan={pending} />}
      {requests.length > 0 && <Requests want={want} requests={requests} missing={missing} />}
      {(want.status === "ready" || (want.status === "active" && missing > 0 && !pending?.lines?.length)) && (
        <PlanSection want={want} missing={missing} />
      )}
    </div>
  );
}

function Conversation({ want }: { want: Want }) {
  const qc = useQueryClient();
  const talk = useServerFn(talkNeed);
  const [answer, setAnswer, clearAnswer] = useDraft(`cu-answer:${want.id}`, "");
  const [busy, setBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [change, setChange] = useState<ChangePreview | null>(null);
  const convo = (Array.isArray(want.conversation) ? want.conversation : []) as { role: string; text: string }[];
  const canTalk = want.status === "asking" || want.status === "ready" || want.status === "active";

  function onSend(e: FormEvent) {
    e.preventDefault();
    void send();
  }

  async function send() {
    if (!answer.trim() || busy) return;
    if (!ensureOnline()) return;
    setBusy(true);
    setAiError(null);
    try {
      const r = await talk({ data: { wantId: want.id, message: answer.trim(), photoPath: null } });
      if (!r.ok) setAiError(r.aiError);
      else {
        clearAnswer();
        if (r.plan) qc.setQueryData(["plan", want.id, r.plan.km], { ok: true, plan: r.plan });
        if ("change" in r) setChange(r.change ?? null);
        if (want.status === "ready") qc.removeQueries({ queryKey: ["plan", want.id] });
      }
      await qc.invalidateQueries({ queryKey: ["want", want.id] });
    } catch (err) {
      toast.error(errMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-3">
      <ol className="space-y-2">
        {convo.map((m, i) => (
          <li key={i} className={m.role === "user" ? "flex justify-end" : "flex"}>
            <p
              className={
                m.role === "user"
                  ? "max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-primary-foreground"
                  : "max-w-[85%] rounded-2xl rounded-bl-md bg-card px-4 py-2.5 text-lg font-semibold shadow-card"
              }
            >
              {m.text}
            </p>
          </li>
        ))}
      </ol>
      {change && <ChangeCard want={want} change={change} onDone={() => setChange(null)} />}
      {canTalk && (
        <form onSubmit={onSend} className="space-y-1">
          {want.status !== "asking" && (
            <label htmlFor={`talk-${want.id}`} className="text-sm font-semibold text-muted-foreground">
              Need to change something? Tell us (e.g. “Actually mujhe 20 ki jagah 15 chahiye”).
            </label>
          )}
          <div className="flex gap-2">
            <Input
              id={`talk-${want.id}`}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder={want.status === "asking" ? "Type your answer" : "Type a change"}
              className="h-12 rounded-xl bg-card text-base"
              aria-label={want.status === "asking" ? (want.next_question ?? "Your answer") : "Type a change"}
              autoFocus={want.status === "asking"}
              maxLength={500}
            />
            <Button type="submit" size="icon" disabled={busy || !answer.trim()} aria-label="Send">
              <SendHorizontal />
            </Button>
          </div>
        </form>
      )}
      {busy && <p className="text-sm text-muted-foreground">Reading your answer…</p>}
      {aiError && <AiNotice message={aiError} onRetry={() => void send()} retrying={busy} />}
    </section>
  );
}

/** Shows exactly what happens to sent or accepted requests before anything changes. */
function ChangeCard({ want, change, onDone }: { want: Want; change: ChangePreview; onDone: () => void }) {
  const qc = useQueryClient();
  const apply = useServerFn(applyQuantityChange);
  const [busy, setBusy] = useState(false);
  const name = (want.item_name ?? "").toLowerCase();
  return (
    <Card tone="attention" className="space-y-2">
      <p className="text-lg font-semibold">
        Change from {change.from} to {change.to} {name}?
      </p>
      {change.steps.length === 0 ? (
        <p>Nothing you already sent changes. {change.stillNeeded > 0 && `We'll look for ${change.stillNeeded} more.`}</p>
      ) : (
        <ul className="list-disc space-y-1 pl-5">
          {change.steps.map((s) => (
            <li key={s.requestId}>
              {s.action === "cancel" ? (
                `${s.label}'s ${s.status === "confirmed" ? "accepted booking" : "request"} for ${s.from} will be cancelled${s.status === "confirmed" ? " (allowed before pickup). They will be told" : ""}.`
              ) : s.action === "ask" ? (
                <span>
                  {s.label} is asked to agree: <strong>Current agreement — {s.from} {name}</strong> · <strong>Requested change — {s.to} {name}</strong>. Until they say yes, the {s.from} stay booked.
                </span>
              ) : (
                `${s.label}'s request (not answered yet) changes now from ${s.from} to ${s.to}. They can't accept the old amount.`
              )}
            </li>
          ))}
        </ul>
      )}
      {change.stillNeeded > 0 && change.steps.length > 0 && <p>After that, {change.stillNeeded} more are still needed and we'll search for them.</p>}
      {!change.possible && <p className="font-semibold">Some items are already picked up, so you can't go that low.</p>}
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={busy || !change.possible}
          onClick={async () => {
            if (!ensureOnline()) return;
            setBusy(true);
            try {
              const res = await apply({ data: { wantId: want.id, quantity: change.to } });
              toast.success(res.asked ? "Change sent. The owner needs to agree before the booking changes." : `Changed to ${change.to}.`);
              qc.removeQueries({ queryKey: ["plan", want.id] });
              await qc.invalidateQueries({ queryKey: ["want", want.id] });
              await qc.invalidateQueries({ queryKey: ["activity"] });
              onDone();
            } catch (e) {
              toast.error(errMessage(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Changing…" : "Yes, make this change"}
        </Button>
        <Button variant="outline" onClick={onDone}>
          Keep it as it is
        </Button>
      </div>
    </Card>
  );
}

function Summary({ want }: { want: Want }) {
  return (
    <Card>
      <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">You need</p>
      <p className="mt-1 text-2xl font-bold">{itemWord(want, Number(want.quantity))}</p>
      {want.details && <p className="text-muted-foreground">{want.details}</p>}
      {want.purpose && <p className="text-muted-foreground">For: {want.purpose}</p>}
      {want.requirements.length > 0 && (
        <p className="mt-1">
          Must have: <strong>{want.requirements.join(", ")}</strong>
        </p>
      )}
      <dl className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="flex gap-2">
          <CalendarClock className="mt-0.5 h-5 w-5 text-primary" aria-hidden />
          <div>
            <dt className="text-sm text-muted-foreground">Pickup</dt>
            <dd className="font-semibold">{fmtDateTime(want.pickup_at)}</dd>
          </div>
        </div>
        {want.kind === "return" ? (
          <div className="flex gap-2">
            <CalendarClock className="mt-0.5 h-5 w-5 text-primary" aria-hidden />
            <div>
              <dt className="text-sm text-muted-foreground">Bring back</dt>
              <dd className="font-semibold">{fmtDateTime(want.return_at)}</dd>
            </div>
          </div>
        ) : (
          <div>
            <dt className="text-sm text-muted-foreground">Return</dt>
            <dd className="font-semibold">Not needed — it gets used up</dd>
          </div>
        )}
        <div>
          <dt className="text-sm text-muted-foreground">Budget</dt>
          <dd className="font-semibold">{want.budget_rs == null ? "Not set" : Number(want.budget_rs) === 0 ? "Free only" : `Up to Rs ${want.budget_rs}`}</dd>
        </div>
      </dl>
    </Card>
  );
}

function PlanSection({ want, missing }: { want: Want; missing: number }) {
  const qc = useQueryClient();
  const planFn = useServerFn(planForWant);
  const { data: profile } = useQuery(profileQuery(want.borrower_id));
  const [km, setKm] = useState(Number(want.search_km));
  const [wider, setWider] = useState(false);
  const [savingKm, setSavingKm] = useState(false);
  const usualKm = profile ? Number(profile.travel_km) : null;

  async function saveUsual() {
    setSavingKm(true);
    const { error } = await supabase.from("profiles").update({ travel_km: km, updated_at: new Date().toISOString() }).eq("id", want.borrower_id);
    setSavingKm(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`${km} km is now your usual distance.`);
    await qc.invalidateQueries({ queryKey: ["profile", want.borrower_id] });
  }
  const plan = useQuery({
    queryKey: ["plan", want.id, km],
    queryFn: () => planFn({ data: { wantId: want.id, km } }),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  const [sending, setSending] = useState(false);

  async function send(lines: PlanLine[], exception?: { note: string; previewId?: string | undefined }) {
    if (sending) return;
    if (!ensureOnline()) return;
    setSending(true);
    // The server checks availability, both distance limits, times and this exact price again before sending.
    const allocs = lines.map((l) => ({
      item_id: l.item_id,
      quantity: l.quantity,
      is_exception: Boolean(exception),
      note: exception?.note ?? null,
      shayari_preview: exception?.previewId ?? null,
      expected_total: l.cost,
    }));
    const { data, error } = await supabase.rpc("send_requests", { _want: want.id, _allocs: allocs });
    setSending(false);
    if (error) {
      toast.error(error.message);
      qc.removeQueries({ queryKey: ["plan", want.id] });
      return;
    }
    // 0 = already sent by an earlier tap or a retry after a timeout: nothing new, nothing duplicated.
    toast.success(data === 0 ? "Already sent. Nothing was sent twice." : data === 1 ? "Request sent." : `${data} requests sent.`);
    qc.removeQueries({ queryKey: ["plan", want.id] });
    await qc.invalidateQueries({ queryKey: ["want", want.id] });
    await qc.invalidateQueries({ queryKey: ["activity"] });
  }

  const p = plan.data?.ok ? plan.data.plan : null;
  const unitName = (want.item_name ?? "").toLowerCase();

  return (
    <section className="space-y-4">
      <div className="space-y-2">
        <h2 className="text-xl font-bold">Search within {km} km</h2>
        <DistancePicker value={km} onChange={setKm} choices={[1, 3, 5, 10, 20]} />
        {usualKm != null && km !== usualKm && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">Only for this search. Your usual distance stays {usualKm} km.</span>
            <Button variant="outline" size="sm" disabled={savingKm} onClick={saveUsual}>
              Save {km} km as my usual distance
            </Button>
          </div>
        )}
      </div>

      {plan.isPending && (
        <Card>
          <p className="flex items-center gap-2 text-muted-foreground">
            <Sparkles className="h-5 w-5 animate-pulse text-primary" aria-hidden /> Looking for {unitName} near you…
          </p>
        </Card>
      )}
      {plan.isError && <AiNotice message={errMessage(plan.error)} onRetry={() => void plan.refetch()} retrying={plan.isFetching} />}
      {plan.data && !plan.data.ok && (
        <AiNotice
          message={plan.data.aiError}
          retryAfter={plan.data.retryAfter}
          onRetry={() => void plan.refetch()}
          retrying={plan.isFetching}
          next="No plan was made and nothing is reserved. You can go back to Find and browse nearby items with date filters."
        />
      )}

      {p && (
        <>
          {p.lines.length > 0 && (
            <Card>
              <h2 className="text-xl font-bold">
                {p.missing === 0
                  ? `We found ${fmtQty(p.found, want.unit)} ${want.unit === "item" ? unitName : ""}`.trim()
                  : `We found ${p.found} of ${p.need}`}
              </h2>
              <p className="text-muted-foreground">
                {p.pickups} {p.pickups === 1 ? "pickup" : "pickups"} · Total: <strong className="text-foreground">{money(p.total)}</strong>
                {p.overBudget && <span className="ml-2 font-semibold text-attention-foreground">Over your budget</span>}
              </p>
              <FitAndChecks plan={p} />
              <ul className="mt-3 divide-y">
                {p.lines.map((l) => (
                  <PlanRow key={l.item_id} line={l} />
                ))}
              </ul>
              <QuoteBox
                className="mt-3"
                rows={p.lines.map(toQuoteRow)}
                pickupAt={want.pickup_at}
                returnAt={want.kind === "return" ? want.return_at : null}
                budget={want.budget_rs == null ? null : Number(want.budget_rs)}
              />
              <Button size="lg" className="mt-3 w-full" disabled={sending} onClick={() => send(p.lines)}>
                <Check /> {sending ? "Sending…" : p.lines.length === 1 ? "Send request" : `Send ${p.lines.length} requests`}
              </Button>
              <p className="mt-2 text-center text-sm text-muted-foreground">Nothing is booked until each owner says yes.</p>
            </Card>
          )}

          {p.missing > 0 && (
            <Card tone="attention">
              <p className="text-lg font-semibold">
                {p.found === 0 ? `No ${unitName} found within ${p.km} km for your times.` : `${fmtQty(p.missing, want.unit)} ${want.unit === "item" ? unitName : ""} still needed.`}
              </p>
              {p.lines.length === 0 && p.explanation && <p className="text-sm">{p.explanation}</p>}
              {!wider ? (
                <Button className="mt-3" variant="outline" size="lg" onClick={() => setWider(true)}>
                  <MapPinned /> Search a wider area
                </Button>
              ) : (
                <div className="mt-3 space-y-2">
                  <p className="font-semibold">How far can you go for this search?</p>
                  <div className="flex flex-wrap gap-2">
                    {[3, 5, 10, 20, 30]
                      .filter((k) => k > p.km)
                      .slice(0, 4)
                      .map((k) => (
                        <Button key={k} variant="outline" onClick={() => setKm(k)}>
                          <MapPinned /> Try {k} km
                        </Button>
                      ))}
                  </div>
                  <p className="text-sm text-muted-foreground">Or choose any distance above.</p>
                </div>
              )}
            </Card>
          )}

          {p.exceptions.map((ex) => (
            <ExceptionCard key={ex.item_id} line={ex} wantId={want.id} sending={sending} onSend={(note, previewId) => send([ex], { note, previewId })} />
          ))}

          {p.unsuitable.length > 0 && (
            <Card>
              <h3 className="font-semibold">Not a fit</h3>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
                {p.unsuitable.map((u, i) => (
                  <li key={i}>{u.reason}</li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
      {missing === 0 && want.status === "active" && null}
    </section>
  );
}

function toQuoteRow(l: PlanLine): QuoteRow {
  return {
    label: l.label,
    itemName: l.item_name,
    kind: l.kind,
    unit: l.unit,
    quantity: l.quantity,
    priceRs: l.price_rs,
    pricePer: l.price_per,
    period: l.price_period,
    days: l.days,
    cost: l.cost,
  };
}

/** Two short explanations: why this plan fits, and what still needs checking with the owners. */
function FitAndChecks({ plan }: { plan: Plan }) {
  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-2">
      {plan.explanation && (
        <div className="rounded-xl bg-success-soft p-3 text-sm">
          <p className="font-semibold">Why it fits</p>
          <p>{plan.explanation}</p>
        </div>
      )}
      {(plan.checks?.length ?? 0) > 0 && (
        <div className="rounded-xl bg-attention-soft p-3 text-sm text-attention-foreground">
          <p className="font-semibold">What still needs checking</p>
          <ul className="list-disc pl-4">
            {plan.checks!.map((c, i) => (
              <li key={i}>{c}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function PlanRow({ line }: { line: PlanLine }) {
  return (
    <li className="flex items-center gap-3 py-3">
      <ItemThumb url={line.photo_url} name={line.item_name} className="h-16 w-16 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">
          {line.label} · {fmtQty(line.quantity, line.unit)} {line.unit === "item" ? line.item_name.toLowerCase() : `of ${line.item_name.toLowerCase()}`}
        </p>
        <p className="flex items-center gap-1 text-sm text-muted-foreground">
          <MapPin className="h-4 w-4" aria-hidden /> Pickup near {line.area_name || "your area"} · {fmtDistance(line.distance_km)}
        </p>
        <p className="text-sm text-muted-foreground">{priceLabel(line.kind, line.price_rs, line.price_per, line.unit, line.price_period, line.free_qty)}</p>
        {line.condition && <p className="text-sm text-muted-foreground">Condition: {line.condition}</p>}
        <Stars avg={line.avg_rating} count={line.rating_count} />
      </div>
      <p className="font-bold">{money(line.cost)}</p>
    </li>
  );
}

function ExceptionCard({
  line,
  wantId,
  sending,
  onSend,
}: {
  line: PlanLine;
  wantId: string;
  sending: boolean;
  onSend: (note: string, previewId?: string) => void;
}) {
  const clean = useServerFn(cleanNote);
  const [text, setText] = useDraft(`cu-exception:${wantId}:${line.item_id}`, "");
  const [rhyme, setRhyme] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [removed, setRemoved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [review, setReview] = useState<string | null>(null);

  return (
    <Card tone="attention">
      <p className="text-lg font-semibold">We found a match. Ask the owner if they can make an exception.</p>
      <p className="mt-1">
        {fmtQty(line.quantity, line.unit)} {line.item_name.toLowerCase()} · {fmtDistance(line.distance_km)} ·{" "}
        {money(line.cost)}. This owner usually lends only closer by, but accepts requests from farther away.
      </p>
      {!preview ? (
        <div className="mt-3 space-y-2">
          <label htmlFor={`why-${line.item_id}`} className="font-semibold">
            Why do you need it? (one short note)
          </label>
          <Textarea id={`why-${line.item_id}`} value={text} onChange={(e) => { setText(e.target.value); setReview(null); }} maxLength={600} className="bg-card" />
          <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={busy || !text.trim()}
            onClick={async () => {
              setBusy(true);
              setAiError(null);
              setReview(null);
              try {
                const r = await clean({ data: { text } });
                if (r.ok) {
                  setPreview(r.note);
                  setRemoved(r.removed);
                } else if ("review" in r) setReview(r.review);
                else setAiError(r.aiError);
              } catch (e) {
                toast.error(errMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Checking…" : "Preview note"}
          </Button>
          {text.trim() && !rhyme && (
            <Button variant="outline" onClick={() => setRhyme(true)}>
              <Feather /> Make it rhyme
            </Button>
          )}
          </div>
          {aiError && <AiNotice message={aiError} />}
          {review && <p className="rounded-xl bg-card p-3 font-semibold text-attention-foreground">{review}</p>}
          {rhyme && text.trim() && (
            <ShayariPanel
              context="exception"
              source={text}
              target={{ itemId: line.item_id, wantId, quantity: line.quantity }}
              sending={sending}
              sendLabel="Send request"
              onClose={() => setRhyme(false)}
              onEditSource={() => document.getElementById(`why-${line.item_id}`)?.focus()}
              onSendOriginal={(safe) => onSend(safe)}
              onSendRhyme={(p) => onSend(p.original, p.id)}
            />
          )}
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          {removed && (
            <p className="rounded-xl bg-card p-3 font-semibold text-attention-foreground">
              We took out names, phone numbers or addresses. Here is the corrected note.
            </p>
          )}
          <p className="font-semibold">
            The owner will see only this note. Your name, contact, address and any photo you added stay hidden:
          </p>
          <blockquote className="rounded-xl bg-card p-3 italic">“{preview}”</blockquote>
          <div className="flex gap-2">
            <Button disabled={sending} onClick={() => onSend(preview)}>
              {sending ? "Sending…" : "Send request"}
            </Button>
            <Button variant="outline" onClick={() => setPreview(null)}>
              Change note
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function Backup({ want, plan }: { want: Want; plan: Plan }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  async function approve() {
    if (busy) return;
    if (!ensureOnline()) return;
    setBusy(true);
    const { error } = await supabase.rpc("send_requests", {
      _want: want.id,
      _allocs: plan.lines.map((l) => ({ item_id: l.item_id, quantity: l.quantity, is_exception: false, note: null, expected_total: l.cost })),
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Request sent.");
    await qc.invalidateQueries({ queryKey: ["want", want.id] });
    await qc.invalidateQueries({ queryKey: ["activity"] });
  }

  async function dismiss() {
    await supabase.from("wants").update({ pending_plan: null }).eq("id", want.id);
    await qc.invalidateQueries({ queryKey: ["want", want.id] });
    await qc.invalidateQueries({ queryKey: ["activity"] });
  }

  if (plan.failed) {
    return (
      <Card tone="attention">
        <p className="text-lg font-semibold">{plan.reason}</p>
        <p>We couldn't look for a replacement automatically right now. Use “Search a wider area” below.</p>
        <Button variant="outline" className="mt-2" onClick={dismiss}>
          OK
        </Button>
      </Card>
    );
  }
  if (plan.lines.length === 0) {
    return (
      <Card tone="attention">
        <p className="text-lg font-semibold">{plan.reason}</p>
        <p>We looked again but found no one else within {plan.km} km for the missing amount. Everything already confirmed is kept.</p>
        <Button variant="outline" className="mt-2" onClick={dismiss}>
          OK
        </Button>
      </Card>
    );
  }
  return (
    <Card tone="attention">
      <p className="text-lg font-semibold">{plan.reason}</p>
      <p>
        We found a replacement for the missing {fmtQty(plan.need, want.unit)}. Everything already confirmed is kept.
      </p>
      <ul className="mt-2 divide-y rounded-xl bg-card px-3">
        {plan.lines.map((l) => (
          <PlanRow key={l.item_id} line={l} />
        ))}
      </ul>
      <QuoteBox className="mt-2" rows={plan.lines.map(toQuoteRow)} pickupAt={want.pickup_at} returnAt={want.kind === "return" ? want.return_at : null} budget={want.budget_rs == null ? null : Number(want.budget_rs)} />
      {plan.missing > 0 && <p className="mt-2">Still {fmtQty(plan.missing, want.unit)} short after this.</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="lg" disabled={busy} onClick={approve}>
          <Check /> {busy ? "Sending…" : plan.lines.length === 1 ? `Send request to ${plan.lines[0]?.label}` : `Send ${plan.lines.length} requests`}
        </Button>
        <Button size="lg" variant="outline" onClick={dismiss}>
          Not now
        </Button>
      </div>
    </Card>
  );
}

function Requests({ want, requests, missing }: { want: Want; requests: Req[]; missing: number }) {
  const qc = useQueryClient();
  const cancel = useServerFn(cancelBooking);
  const live = requests.filter((r) => r.status !== "cancelled");
  const confirmed = live.filter((r) => r.status === "confirmed" || r.status === "completed");
  const confirmedQty = confirmed.reduce((s, r) => s + Number(r.quantity), 0);
  const requestedQty = live.filter((r) => r.status === "requested").reduce((s, r) => s + Number(r.quantity), 0);
  const picked = confirmed.reduce((s, r) => s + Number(r.picked_up_qty), 0);
  const back = confirmed.reduce((s, r) => s + Number(r.returned_qty), 0);
  const owed = confirmed.filter((r) => r.kind === "return" && Number(r.picked_up_qty) > Number(r.returned_qty));
  const name = (want.item_name ?? "").toLowerCase();
  const due = want.kind === "return" ? picked - back : 0;
  const needed = Number(want.quantity ?? 0);

  return (
    <section className="space-y-3">
      <h2 className="text-xl font-bold">Your requests</h2>
      <p className="text-lg font-semibold">{coverageLine(confirmedQty, needed)}</p>
      <div className="grid grid-cols-3 gap-2 text-center sm:grid-cols-6">
        <Stat label="Needed" value={String(needed)} />
        <Stat label="Waiting" value={String(requestedQty)} />
        <Stat label="Confirmed" value={String(confirmedQty)} />
        <Stat label={want.kind === "return" ? "Collected" : "Handed over"} value={String(picked)} />
        {want.kind === "return" ? <Stat label="Returned" value={String(back)} /> : <Stat label="Still needed" value={String(missing)} attention={missing > 0} />}
        {want.kind === "return" ? <Stat label="Still due" value={String(due)} attention={due > 0} /> : <Stat label="Confirmed total" value={money(confirmed.reduce((s, r) => s + Number(r.total_rs), 0))} />}
      </div>
      {want.kind === "return" && missing > 0 && <p className="text-sm text-muted-foreground">Still needed: {missing}. Waiting means sent, but the owner hasn't said yes yet.</p>}
      {want.kind === "return" && picked > 0 && (
        <Card tone={owed.length ? "attention" : "success"}>
          <p className="text-lg font-semibold">
            {back} of {picked} {name} back.
          </p>
          {owed.map((r) => (
            <p key={r.id}>
              {r.owner_name} is still owed {Number(r.picked_up_qty) - Number(r.returned_qty)}{" "}
              {Number(r.picked_up_qty) - Number(r.returned_qty) === 1 ? name.replace(/s$/, "") : name}.
            </p>
          ))}
          {owed.length === 0 && back === picked && <p>Everything you picked up is back.</p>}
        </Card>
      )}
      <ul className="space-y-2">
        {live.map((r) => (
          <li key={r.id}>
            <Card className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {r.owner_name} · {fmtQty(Number(r.quantity), r.unit)} {r.unit === "item" ? r.item_name.toLowerCase() : r.item_name.toLowerCase()}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <Pill tone={statusTone(r.status)}>{requestStatusWords({ ...r, quantity: Number(r.quantity) }, false)}</Pill>
                  <span className="text-sm text-muted-foreground">{money(Number(r.total_rs))}</span>
                  {r.status === "confirmed" && r.kind === "return" && (
                    <span className="text-sm text-muted-foreground">
                      Picked up {Number(r.picked_up_qty)} · Back {Number(r.returned_qty)}
                    </span>
                  )}
                </div>
              </div>
              {(r.status === "confirmed" || r.status === "completed") && (
                <Button asChild variant="outline" size="sm">
                  <Link to="/inbox/$requestId" params={{ requestId: r.id }}>
                    Open <ChevronRight />
                  </Link>
                </Button>
              )}
              {r.status === "requested" && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    if (!window.confirm(`Cancel your request to ${r.owner_name} for ${fmtQty(Number(r.quantity), r.unit)} ${r.item_name.toLowerCase()}? Nothing else changes.`)) return;
                    if (!ensureOnline()) return;
                    try {
                      await cancel({ data: { requestId: r.id, reason: "" } });
                      toast.success("Request cancelled.");
                    } catch (e) {
                      toast.error(errMessage(e));
                    }
                    await qc.invalidateQueries({ queryKey: ["want", want.id] });
                  }}
                >
                  Cancel
                </Button>
              )}
            </Card>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Stat({ label, value, attention }: { label: string; value: string; attention?: boolean }) {
  return (
    <div className={attention ? "rounded-2xl bg-attention-soft p-3 text-attention-foreground" : "rounded-2xl bg-card p-3 shadow-card"}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-sm">{label}</p>
    </div>
  );
}
