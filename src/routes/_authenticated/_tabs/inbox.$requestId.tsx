import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  Ban,
  CalendarClock,
  Camera,
  CircleAlert,
  Feather,
  Flag,
  Heart,
  Home,
  Minus,
  Plus,
  RotateCw,
  SendHorizontal,
  Star,
  UserRound,
  Wallet,
  XCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, ItemThumb, Pill, requestStatusWords, statusTone } from "@/components/app/bits";
import { cancelBooking, reportPhoto, requestPhotos } from "@/lib/app.functions";
import { dateChangesQuery, errMessage, profileQuery, requestQuery, type RequestBundle } from "@/lib/queries";
import { DAY_RULE, fmtDateTime, fmtQty, fmtShort, isoToLocalInput, localInputToIso, money, priceLabel, quoteLine } from "@/lib/format";
import { uploadPhoto } from "@/lib/upload";
import { ensureOnline, useDraft } from "@/hooks/use-app";
import { cn } from "@/lib/utils";
import { ShayariPanel, ShayariView } from "@/components/app/Shayari";
import { bookingDone, isShayariSnapshot, thanksStarter, type ShayariSnapshot } from "@/lib/shayari";
import { AiDemoLabel, SAMPLE_PHOTO_TEXT, SimOwnerActions, SimulatedOwnerLabel } from "@/components/app/DemoResults";

type Req = Database["public"]["Tables"]["requests"]["Row"];
type Bundle = RequestBundle;

export const Route = createFileRoute("/_authenticated/_tabs/inbox/$requestId")({
  head: () => ({
    meta: [
      { title: "Booking — Cheez Udhaar" },
      { name: "description", content: "One booking: what was agreed, pickup and return, payment status and your private chat." },
      { property: "og:title", content: "Booking — Cheez Udhaar" },
      { property: "og:description", content: "One booking: what was agreed, pickup and return, payment status and your private chat." },
    ],
  }),
  loader: ({ context, params }) => context.queryClient.ensureQueryData(requestQuery(params.requestId)),
  component: Booking,
});

function n(v: unknown) {
  return Number(v ?? 0);
}

function useRefresh(id: string) {
  const qc = useQueryClient();
  return async () => {
    await qc.invalidateQueries({ queryKey: ["request", id] });
    await qc.invalidateQueries({ queryKey: ["request-photos", id] });
    await qc.invalidateQueries({ queryKey: ["date-changes", id] });
    await qc.invalidateQueries({ queryKey: ["activity"] });
    await qc.invalidateQueries({ queryKey: ["want"] });
    await qc.invalidateQueries({ queryKey: ["notifications"] });
    await qc.invalidateQueries({ queryKey: ["nearby"] });
  };
}

async function rpcSafe(fn: () => PromiseLike<{ error: { message: string } | null }>, ok?: string) {
  if (!ensureOnline()) return false;
  const { error } = await fn();
  if (error) {
    toast.error(error.message);
    return false;
  }
  if (ok) toast.success(ok);
  return true;
}

function Booking() {
  const { userId } = Route.useRouteContext();
  const { requestId } = Route.useParams();
  const { data } = useSuspenseQuery(requestQuery(requestId));
  const photosFn = useServerFn(requestPhotos);
  const r = data.request;
  const photos = useQuery({
    queryKey: [
      "request-photos",
      requestId,
      data.photos.map((p) => `${p.user_id}:${p.choice}:${p.photo_path}`).join("|"),
      JSON.stringify(r.condition_photos ?? []).length,
    ],
    queryFn: () => photosFn({ data: { requestIds: [requestId] } }),
    staleTime: 30 * 60_000,
  });
  const blocked = useQuery({
    queryKey: ["blocked", r.owner_id, r.borrower_id],
    queryFn: async () => {
      const { data: b } = await supabase.rpc("is_blocked", { _a: r.owner_id, _b: r.borrower_id });
      return Boolean(b);
    },
  });
  const iAmOwner = r.owner_id === userId;
  const otherId = iAmOwner ? r.borrower_id : r.owner_id;
  const otherName = iAmOwner ? (r.borrower_name ?? "The borrower") : r.owner_name;
  const otherPhoto = photos.data?.people?.[requestId]?.[otherId] ?? null;
  const active = r.status === "confirmed" || r.status === "completed";

  return (
    <div className="space-y-5">
      <Link to="/inbox" className="text-sm font-semibold text-primary">
        ← Inbox
      </Link>
      <Card id="summary" className="space-y-3">
        <div className="flex gap-4">
          <ItemThumb url={photos.data?.items?.[requestId]} name={r.item_name} className="h-24 w-24 shrink-0" emptyText={r.simulated ? SAMPLE_PHOTO_TEXT : undefined} />
          <div className="min-w-0 flex-1 space-y-1">
            {r.simulated && (
              <div className="flex flex-wrap gap-1">
                <AiDemoLabel />
                <SimulatedOwnerLabel />
              </div>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold">
                {fmtQty(n(r.quantity), r.unit)} {r.item_name.toLowerCase()}
              </h1>
              <Pill tone={statusTone(r.status)}>{requestStatusWords(r, iAmOwner)}</Pill>
            </div>
            {active ? (
              <p className="flex items-center gap-2">
                {otherPhoto ? (
                  <img src={otherPhoto} alt={otherName} className="h-8 w-8 rounded-full object-cover" />
                ) : (
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-sm font-bold">{otherName.charAt(0)}</span>
                )}
                {iAmOwner ? `Lending to ${otherName}` : `Borrowing from ${otherName}`}
              </p>
            ) : (
              <p className="text-muted-foreground">{iAmOwner ? "Someone nearby" : r.owner_name}</p>
            )}
            <p className="text-sm">
              Pickup: <strong>{fmtDateTime(r.pickup_at)}</strong>
            </p>
            {r.kind === "return" && (
              <p className="text-sm">
                Bring back: <strong>{fmtDateTime(r.return_at)}</strong>
              </p>
            )}
            <p className="text-sm">
              Total: <strong>{money(n(r.total_rs))}</strong>
            </p>
            <Agreed r={r} />
          </div>
        </div>
        <Counts r={r} />
        <NextStep r={r} iAmOwner={iAmOwner} otherName={otherName} />
        {!iAmOwner && r.simulated && <SimOwnerActions r={r} showMeet={r.status === "confirmed"} />}
        {(r.status === "requested" || r.status === "confirmed") && n(r.picked_up_qty) === 0 && (
          <CancelBooking r={r} iAmOwner={iAmOwner} otherName={otherName} />
        )}
      </Card>

      {!active && r.status !== "requested" && (
        <Link to="/need/$wantId" params={{ wantId: r.want_id }} className={cn(iAmOwner && "hidden", "font-semibold text-primary underline")}>
          See your search and other owners
        </Link>
      )}

      {active && (
        <>
          {blocked.data && (
            <Card tone="attention">
              <p className="font-semibold">Chat and date changes are closed because one of you blocked the other.</p>
              <p className="text-sm">You can still record the return here, or report a problem so your area admin can help.</p>
            </Card>
          )}
          <Handover r={r} iAmOwner={iAmOwner} otherName={otherName} userId={userId} condition={photos.data?.condition?.[requestId] ?? []} />
          <Payment r={r} iAmOwner={iAmOwner} otherName={otherName} />
          {r.status === "confirmed" && !blocked.data && <DateChange r={r} userId={userId} otherName={otherName} />}
          {r.status === "confirmed" && <Meeting data={data} userId={userId} otherName={otherName} iAmOwner={iAmOwner} />}
          <Address data={data} userId={userId} iAmOwner={iAmOwner} otherName={otherName} />
          <PhotoChoice data={data} userId={userId} otherName={otherName} />
          <Chat data={data} userId={userId} otherName={otherName} closed={Boolean(blocked.data)} />
          {r.status === "completed" && <Rate data={data} userId={userId} iAmOwner={iAmOwner} otherName={otherName} />}
          <Reports data={data} userId={userId} />
          {!blocked.data && <BlockPerson requestId={r.id} otherName={otherName} />}
        </>
      )}
    </div>
  );
}

/** Requested / collected / returned / still due for this one booking. */
function Counts({ r }: { r: Req }) {
  if (r.status !== "confirmed" && r.status !== "completed") return null;
  const qty = n(r.quantity);
  const picked = n(r.picked_up_qty);
  const back = n(r.returned_qty);
  const cells =
    r.kind === "return"
      ? [
          ["Agreed", qty],
          ["Collected", picked],
          ["Returned", back],
          ["Still due", Math.max(0, picked - back)],
        ]
      : [
          ["Agreed", qty],
          ["Handed over", picked],
          ["Still to hand over", Math.max(0, qty - picked)],
        ];
  return (
    <dl className={cn("grid gap-2 text-center", r.kind === "return" ? "grid-cols-4" : "grid-cols-3")}>
      {cells.map(([label, v]) => (
        <div key={label as string} className="rounded-xl bg-muted p-2">
          <dd className="text-xl font-bold">{fmtQty(v as number, r.unit === "item" ? "item" : r.unit)}</dd>
          <dt className="text-xs">{label}</dt>
        </div>
      ))}
    </dl>
  );
}

/** One clear sentence about what happens next, from this person's side. */
function NextStep({ r, iAmOwner, otherName }: { r: Req; iAmOwner: boolean; otherName: string }) {
  const picked = n(r.picked_up_qty);
  const back = n(r.returned_qty);
  const qty = n(r.quantity);
  let text = "";
  let urgent = false;
  switch (r.status) {
    case "requested":
      text = iAmOwner ? "Answer this request in Activity." : "Waiting for the owner. Nothing is booked until they say yes.";
      urgent = iAmOwner;
      break;
    case "declined":
      text = iAmOwner ? "You said no to this request." : "The owner said no. We look for someone else for the missing amount — check your search.";
      break;
    case "expired":
      text = "This request expired because there was no answer before the pickup time. Nothing was booked.";
      break;
    case "cancelled":
      text = r.cancelled_by === (iAmOwner ? r.owner_id : r.borrower_id) ? "You cancelled this. Nothing is reserved." : `${otherName} cancelled this. Nothing is reserved.`;
      break;
    case "completed":
      text = "All done. You can rate each other below.";
      break;
    case "confirmed":
      if (iAmOwner && n(r.borrower_picked_qty) > picked) {
        text = `${otherName} says they collected ${n(r.borrower_picked_qty)}. Please confirm below.`;
        urgent = true;
      } else if (iAmOwner && n(r.borrower_returned_qty) > back) {
        text = `${otherName} says they returned ${n(r.borrower_returned_qty)}. Please confirm how many you received.`;
        urgent = true;
      } else if (picked === 0) {
        text = iAmOwner ? "Agree when and where to meet, then confirm what you hand over." : "Ready to collect. Agree when and where to meet, then tap “I collected these items”.";
      } else if (r.kind === "return" && back < picked) {
        const late = r.return_at && new Date(r.return_at) < new Date();
        text = `${back} of ${picked} returned — ${picked - back} still due${late ? " (late)" : ` by ${fmtShort(r.return_at)}`}.`;
        urgent = Boolean(late);
      } else if (picked < qty) {
        text = `${picked} of ${qty} handed over so far.`;
      }
      break;
  }
  if (!text) return null;
  return (
    <p className={cn("rounded-xl p-3 font-semibold", urgent ? "bg-attention-soft text-attention-foreground" : "bg-muted")}>
      <span className="sr-only">Next step: </span>
      {text}
    </p>
  );
}

type AgreedT = {
  specs?: string;
  description?: string;
  price_rs?: number;
  price_per?: number;
  price_period?: string;
  unit?: string;
  kind?: string;
  area_name?: string;
  condition?: string;
  accessories?: string;
  quote?: { quantity?: number; unit_rate?: number; price_per?: number; period?: string; days?: number | null; total?: number; extra_rs?: number };
};

/** The listing details at the time of the request. They stay the same if the owner edits the listing later. */
function Agreed({ r }: { r: Req }) {
  const a = (r.agreed ?? null) as AgreedT | null;
  if (!a) return null;
  return (
    <details className="text-sm">
      <summary className="cursor-pointer font-semibold text-primary">What was agreed</summary>
      <div className="mt-1 space-y-0.5 text-muted-foreground">
        {a.kind && a.unit && <p>Price: {priceLabel(a.kind, n(a.price_rs), n(a.price_per ?? 1), a.unit, a.price_period, n(r.quantity))}</p>}
        {a.kind && a.unit && (
          <p>
            Worked out:{" "}
            {quoteLine({
              kind: a.kind,
              unit: a.unit,
              quantity: n(r.quantity),
              priceRs: n(a.price_rs),
              pricePer: n(a.price_per ?? 1),
              period: a.price_period,
              days: a.quote?.days ?? undefined,
            })}
            . No extra charges.
          </p>
        )}
        {a.price_period === "day" && n(a.price_rs) > 0 && <p className="text-xs">{DAY_RULE}</p>}
        {a.specs && <p>Details: {a.specs}</p>}
        {a.condition && <p>Condition: {a.condition}</p>}
        {a.accessories && <p>Comes with: {a.accessories}</p>}
        {a.description && <p>{a.description}</p>}
        {a.area_name && <p>Pickup area: {a.area_name}</p>}
      </div>
    </details>
  );
}

function CancelBooking({ r, iAmOwner, otherName }: { r: Req; iAmOwner: boolean; otherName: string }) {
  const cancel = useServerFn(cancelBooking);
  const refresh = useRefresh(r.id);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  if (iAmOwner && r.status === "requested") return null; // owners answer requests in Activity
  const what = `${fmtQty(n(r.quantity), r.unit)} ${r.item_name.toLowerCase()} on ${fmtShort(r.pickup_at)}`;
  if (!open) {
    return (
      <Button variant="ghost" className="text-muted-foreground" onClick={() => setOpen(true)}>
        <XCircle /> {r.status === "requested" ? "Cancel request" : "Cancel before pickup"}
      </Button>
    );
  }
  return (
    <div className="space-y-2 rounded-xl border p-3">
      <p className="font-semibold">Cancel {what}?</p>
      <p className="text-sm text-muted-foreground">
        {r.status === "requested"
          ? "Only this request is cancelled. Your other requests stay."
          : iAmOwner
            ? `${otherName} is told right away, the items become free again, and we look for a replacement for them.`
            : `${otherName} is told right away and the items become free again. Your other bookings stay.`}
      </p>
      <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason (optional)" maxLength={300} className="h-11" />
      <div className="flex flex-wrap gap-2">
        <Button
          variant="destructive"
          disabled={busy}
          onClick={async () => {
            if (!ensureOnline()) return;
            setBusy(true);
            try {
              await cancel({ data: { requestId: r.id, reason } });
              toast.success("Cancelled.");
              await refresh();
            } catch (e) {
              toast.error(errMessage(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Cancelling…" : "Yes, cancel"}
        </Button>
        <Button variant="outline" onClick={() => setOpen(false)}>
          Keep it
        </Button>
      </div>
    </div>
  );
}

function BlockPerson({ requestId, otherName }: { requestId: string; otherName: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  return (
    <Button
      variant="ghost"
      className="text-muted-foreground"
      onClick={async () => {
        if (!window.confirm(`Block ${otherName}? You won't see each other's items or new requests, and chat closes. Any items still out can be returned and recorded here. You can unblock in your profile.`)) return;
        if (!ensureOnline()) return;
        const { error } = await supabase.rpc("block_from_request", { _req: requestId });
        if (error) {
          toast.error(error.message);
          return;
        }
        toast.success(`${otherName} is blocked.`);
        await qc.invalidateQueries();
        navigate({ to: "/inbox" });
      }}
    >
      <Ban /> Block {otherName}
    </Button>
  );
}

type Cond = { url: string; stage: string; mine: boolean; at: string };

function Handover({ r, iAmOwner, otherName, userId, condition }: { r: Req; iAmOwner: boolean; otherName: string; userId: string; condition: Cond[] }) {
  const refresh = useRefresh(r.id);
  const qty = n(r.quantity);
  const picked = n(r.picked_up_qty);
  const back = n(r.returned_qty);
  const claimPick = n(r.borrower_picked_qty);
  const claimBack = n(r.borrower_returned_qty);
  const [p, setP] = useState(Math.max(picked, iAmOwner ? claimPick : picked) || (iAmOwner ? 0 : qty));
  const [b, setB] = useState(Math.max(back, iAmOwner ? claimBack : back));
  const [closePickup, setClosePickup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const name = r.item_name.toLowerCase();
  const out = picked - back;
  const late = r.status === "confirmed" && r.kind === "return" && out > 0 && r.return_at && new Date(r.return_at) < new Date();
  const stage: "pickup" | "return" = picked > 0 && r.kind === "return" ? "return" : "pickup";
  const log = (Array.isArray(r.handover_log) ? r.handover_log : []) as { step: string; action: string; qty: number; role: string; at: string }[];
  const gapPick = claimPick > picked ? claimPick - picked : 0;
  const gapBack = claimBack > back ? claimBack - back : 0;
  const gapBlock =
    (gapPick > 0 || gapBack > 0) && r.status === "confirmed" ? (
      <div className="rounded-xl border border-attention p-3 text-sm">
        <p className="font-semibold">Not agreed yet</p>
        {gapPick > 0 && (
          <p>
            {iAmOwner ? otherName : "You"} said {claimPick} collected · owner confirmed {picked} · {gapPick} not agreed.
          </p>
        )}
        {gapBack > 0 && (
          <p>
            {iAmOwner ? otherName : "You"} said {claimBack} returned · owner confirmed {back} · {gapBack} not agreed.
          </p>
        )}
        <p className="text-muted-foreground">
          Nothing is lost: the claim and the confirmed numbers both stay on record. If you can't agree,{" "}
          <a href="#reports" className="font-semibold text-primary underline">
            report a problem
          </a>{" "}
          so your area admin can help.
        </p>
      </div>
    ) : null;
  const history =
    log.length > 0 ? (
      <details className="text-sm">
        <summary className="cursor-pointer font-semibold text-primary">Pickup and return history</summary>
        <ul className="mt-1 space-y-0.5 text-muted-foreground">
          {log.map((e, i) => (
            <li key={i}>
              {fmtShort(e.at)} — {e.role === "owner" ? (iAmOwner ? "You" : otherName) : iAmOwner ? otherName : "You"}{" "}
              {e.action === "confirmed" ? "confirmed" : "said"} {e.qty} {e.step === "pickup" ? (r.kind === "use_up" ? "handed over" : "collected") : "returned"}
            </li>
          ))}
        </ul>
      </details>
    ) : null;

  useEffect(() => {
    setP(Math.max(picked, iAmOwner ? claimPick : picked) || (iAmOwner ? 0 : qty));
    setB(Math.max(back, iAmOwner ? claimBack : back));
  }, [picked, back, claimPick, claimBack, iAmOwner, qty]);

  async function ownerConfirm() {
    setBusy(true);
    const ok = await rpcSafe(() => supabase.rpc("confirm_handover", { _req: r.id, _picked: p, _returned: b, _close_pickup: closePickup }), "Saved.");
    setBusy(false);
    if (ok) await refresh();
  }
  async function borrowerReport(pp: number, bb: number) {
    setBusy(true);
    const ok = await rpcSafe(() => supabase.rpc("report_handover", { _req: r.id, _picked: pp, _returned: bb }), `Sent. ${otherName} will confirm.`);
    setBusy(false);
    if (ok) await refresh();
  }

  const photoInput = (
    <label className={cn("inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl border px-4 font-semibold hover:bg-accent focus-within:ring-2 focus-within:ring-ring", uploading && "opacity-60")}>
      <Camera className="h-5 w-5" aria-hidden /> {uploading ? "Adding…" : `Add a ${stage === "pickup" ? "pickup" : "return"} condition photo`}
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic"
        className="sr-only"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          setUploading(true);
          try {
            const path = await uploadPhoto(userId, f, "condition");
            const ok = await rpcSafe(() => supabase.rpc("add_condition_photo", { _req: r.id, _path: path, _stage: stage }), "Photo added for both of you.");
            if (ok) await refresh();
          } catch (err) {
            toast.error((err as Error).message);
          } finally {
            setUploading(false);
          }
        }}
      />
    </label>
  );

  const photosBlock = (
    <div className="space-y-2">
      {condition.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Condition photos">
          {condition.map((c) => (
            <li key={c.url} className="text-center text-xs text-muted-foreground">
              <a href={c.url} target="_blank" rel="noopener noreferrer">
                <img src={c.url} alt={`${c.stage} condition photo`} className="h-20 w-20 rounded-xl object-cover" />
              </a>
              {c.stage === "pickup" ? "At pickup" : "At return"}
              {c.mine ? " · you" : ""}
            </li>
          ))}
        </ul>
      )}
      {r.status === "confirmed" && photoInput}
      <p className="text-xs text-muted-foreground">Optional. Only the two of you (and an area admin if there is a report) can see these.</p>
    </div>
  );

  if (r.kind === "use_up") {
    return (
      <Card>
        <h2 className="text-lg font-bold">Handover</h2>
        {r.status === "completed" ? (
          <p>Handed over {fmtQty(picked, r.unit)}. Nothing needs to come back.</p>
        ) : iAmOwner ? (
          <div className="space-y-3">
            {claimPick > picked && <p className="font-semibold">{otherName} says they received {fmtQty(claimPick, r.unit)}.</p>}
            <p>Confirm the amount you handed over. It is taken off your stock once.</p>
            <Counter label={`Handed over (${r.unit})`} value={p} min={picked} max={qty} step={qty >= 50 ? 5 : 1} onChange={setP} />
            {p < qty && p > 0 && (
              <label className="flex items-center justify-between gap-3 rounded-xl bg-muted p-3">
                <span>Ask {otherName} to agree to {fmtQty(p, r.unit)} instead of {fmtQty(qty, r.unit)} (and the lower price)</span>
                <Switch checked={closePickup} onCheckedChange={setClosePickup} aria-label="Agreed on a smaller amount" />
              </label>
            )}
            <Button disabled={busy || p <= picked} onClick={ownerConfirm}>
              Confirm {fmtQty(p, r.unit)} handed over
            </Button>
            {!busy && p <= picked && <p className="text-sm text-muted-foreground">Press + to set how many you handed over.</p>}
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-muted-foreground">{claimPick > 0 ? `You said you received ${fmtQty(claimPick, r.unit)}. Waiting for the owner to confirm.` : "When you have it, tell the owner here."}</p>
            {claimPick < qty && (
              <Button disabled={busy} onClick={() => borrowerReport(qty, 0)}>
                I received {fmtQty(qty, r.unit)}
              </Button>
            )}
          </div>
        )}
        <div className="mt-3 space-y-3">
          {gapBlock}
          {history}
          {photosBlock}
        </div>
      </Card>
    );
  }

  return (
    <Card tone={late ? "attention" : undefined}>
      <h2 className="text-lg font-bold">Pickup and return</h2>
      {r.status === "completed" ? (
        <p>
          All {picked} {name} are back. Thank you!
        </p>
      ) : (
        <div className="space-y-3">
          <p className={late ? "font-semibold" : "text-muted-foreground"}>
            {picked === 0
              ? "Not picked up yet."
              : out > 0
                ? `${back} of ${picked} returned — ${out} still due${late ? " (late)" : ` by ${fmtShort(r.return_at)}`}.`
                : "Everything handed over is back."}
          </p>
          {iAmOwner ? (
            <>
              {(claimPick > picked || claimBack > back) && (
                <p className="rounded-xl bg-attention-soft p-3 font-semibold text-attention-foreground">
                  {claimPick > picked ? `${otherName} says they collected ${claimPick}. ` : ""}
                  {claimBack > back ? `${otherName} says they returned ${claimBack}.` : ""}
                </p>
              )}
              <p className="text-sm">Only you confirm the numbers. If you disagree, set what you actually handed over or received, and report a problem if needed.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Counter label="Handed over" value={p} max={qty} min={picked} onChange={setP} />
                <Counter label="Received back" value={b} max={p} min={back} onChange={setB} />
              </div>
              {p > 0 && p < qty && (
                <label className="flex items-center justify-between gap-3 rounded-xl bg-muted p-3">
                  <span>
                    The rest won't be picked up: ask {otherName} to agree to {p} instead of {qty}
                  </span>
                  <Switch checked={closePickup} onCheckedChange={setClosePickup} aria-label="Agreed on fewer" />
                </label>
              )}
              <div className="flex flex-wrap gap-2">
                <Button disabled={busy || (p === picked && b === back && !closePickup)} onClick={ownerConfirm}>
                  Confirm
                </Button>
                {!busy && p === picked && b === back && !closePickup && (
                  <p className="w-full text-sm text-muted-foreground">Change a number above to confirm what was handed over or came back.</p>
                )}
                {out > 0 && (
                  <Button
                    variant="outline"
                    onClick={async () => {
                      if (await rpcSafe(() => supabase.rpc("send_reminder", { _req: r.id }), "Reminder sent in the chat.")) await refresh();
                    }}
                  >
                    Send a reminder
                  </Button>
                )}
              </div>
            </>
          ) : (
            <>
              {picked === 0 ? (
                <div className="space-y-2">
                  {claimPick > 0 ? (
                    <p>You said you collected {claimPick}. Waiting for {otherName} to confirm.</p>
                  ) : (
                    <>
                      <Counter label="How many did you collect?" value={p} max={qty} min={1} onChange={setP} />
                      <Button disabled={busy} onClick={() => borrowerReport(p, 0)}>
                        I collected these items
                      </Button>
                    </>
                  )}
                </div>
              ) : out > 0 ? (
                <div className="space-y-2">
                  {claimBack > back ? (
                    <p>You said you returned {claimBack}. Waiting for {otherName} to confirm.</p>
                  ) : null}
                  <Counter label="How many are you returning in total?" value={Math.max(b, back)} max={picked} min={back} onChange={setB} />
                  <Button disabled={busy || b <= Math.max(back, claimBack)} onClick={() => borrowerReport(Math.max(picked, claimPick), b)}>
                    I returned {b}
                  </Button>
                  {!busy && b <= Math.max(back, claimBack) && (
                    <p className="text-sm text-muted-foreground">Already counted. Press + when you give back more.</p>
                  )}
                </div>
              ) : null}
            </>
          )}
        </div>
      )}
      <div className="mt-3 space-y-3">
        {gapBlock}
        {history}
        {photosBlock}
      </div>
    </Card>
  );
}

function Counter({ label, value, min, max, step = 1, onChange }: { label: string; value: number; min: number; max: number; step?: number; onChange: (n: number) => void }) {
  return (
    <div>
      <p className="font-semibold">{label}</p>
      <div className="mt-1 flex items-center gap-2">
        <Button type="button" variant="outline" size="icon" aria-label={`${label}: less`} disabled={value <= min} onClick={() => onChange(Math.max(min, value - step))}>
          <Minus />
        </Button>
        <span className="w-14 text-center text-2xl font-bold" aria-live="polite">
          {value}
        </span>
        <Button type="button" variant="outline" size="icon" aria-label={`${label}: more`} disabled={value >= max} onClick={() => onChange(Math.min(max, value + step))}>
          <Plus />
        </Button>
        <span className="text-muted-foreground">of {max}</span>
      </div>
    </div>
  );
}

/** Payment happens outside the app. We only record what each person says. */
function Payment({ r, iAmOwner, otherName }: { r: Req; iAmOwner: boolean; otherName: string }) {
  const refresh = useRefresh(r.id);
  if (n(r.total_rs) <= 0) return null;
  const status = r.payment_status;
  const text =
    status === "confirmed_paid"
      ? `${iAmOwner ? "You" : otherName} confirmed receiving ${money(n(r.total_rs))}.`
      : status === "reported_paid"
        ? `${iAmOwner ? otherName : "You"} said ${money(n(r.total_rs))} was paid. ${iAmOwner ? "Please confirm if you received it." : `Waiting for ${otherName} to confirm.`}`
        : `Not marked as paid yet (${money(n(r.total_rs))}).`;
  return (
    <Card className="space-y-2">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <Wallet className="h-5 w-5" aria-hidden /> Payment
      </h2>
      <p>{text}</p>
      <p className="text-sm text-muted-foreground">Pay each other directly (cash or your own app). Cheez Udhaar does not move any money — this only records what you both say.</p>
      {iAmOwner && status !== "confirmed_paid" && (
        <Button variant="outline" onClick={async () => (await rpcSafe(() => supabase.rpc("report_payment", { _req: r.id }), "Marked as received.")) && refresh()}>
          I received the money
        </Button>
      )}
      {!iAmOwner && status === "none" && (
        <Button variant="outline" onClick={async () => (await rpcSafe(() => supabase.rpc("report_payment", { _req: r.id }), "Marked as paid.")) && refresh()}>
          I paid outside the app
        </Button>
      )}
    </Card>
  );
}

function DateChange({ r, userId, otherName }: { r: Req; userId: string; otherName: string }) {
  const refresh = useRefresh(r.id);
  const { data: list } = useQuery(dateChangesQuery(r.id));
  const pending = (list ?? []).find((d) => d.status === "pending");
  const last = (list ?? []).find((d) => d.status !== "pending");
  const [open, setOpen] = useState(false);
  const [pickup, setPickup] = useState(isoToLocalInput(r.pickup_at));
  const [back, setBack] = useState(isoToLocalInput(r.return_at));
  const [qty, setQty] = useState(n(r.quantity));
  const [busy, setBusy] = useState(false);
  const picked = n(r.picked_up_qty) > 0;
  const name = r.item_name.toLowerCase();
  const amount = (v: number) => (r.unit === "item" ? `${v} ${name}` : `${fmtQty(v, r.unit)} of ${name}`);

  useEffect(() => setQty(n(r.quantity)), [r.quantity]);

  async function propose(e: FormEvent) {
    e.preventDefault();
    const p = picked ? r.pickup_at : localInputToIso(pickup);
    const b = r.kind === "return" ? localInputToIso(back) : null;
    if (!p || (r.kind === "return" && !b)) {
      toast.error("Please choose the dates.");
      return;
    }
    setBusy(true);
    const ok = await rpcSafe(
      () => supabase.rpc("propose_booking_change", { _req: r.id, _pickup: p, _return: b as string, _qty: qty, _note: "" }),
      `Sent to ${otherName}. The current agreement stays until they say yes.`,
    );
    setBusy(false);
    if (ok) {
      setOpen(false);
      await refresh();
    }
  }

  async function answer(accept: boolean) {
    if (!pending || !ensureOnline()) return;
    const { data: res, error } = await supabase.rpc("answer_date_change", { _id: pending.id, _accept: accept });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(res === "accepted" ? "Change agreed." : res === "expired" ? "This change expired. The current agreement stays." : "Kept the current agreement.");
    await refresh();
  }

  const oldQty = pending ? n(pending.old_quantity ?? r.quantity) : 0;
  const newQty = pending ? n(pending.new_quantity ?? r.quantity) : 0;
  const oldPick = pending?.old_pickup_at ?? r.pickup_at;
  const oldBack = pending?.old_return_at ?? r.return_at;

  return (
    <Card className="space-y-2">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <CalendarClock className="h-5 w-5" aria-hidden /> Change this booking
      </h2>
      {pending ? (
        <div className="space-y-2 rounded-xl bg-attention-soft p-3 text-attention-foreground">
          <p className="font-semibold">{pending.proposed_by === userId ? "You asked for a change" : `${otherName} asked for a change`}</p>
          {pending.note && <p className="text-sm">“{pending.note}”</p>}
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="rounded-lg bg-card p-2 text-foreground">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Current agreement</p>
              <p className="font-semibold">{amount(oldQty)}</p>
              <p className="text-sm">Pickup {fmtShort(oldPick)}{r.kind === "return" ? ` · back ${fmtShort(oldBack)}` : ""}</p>
              <p className="text-sm">{money(n(pending.old_total ?? r.total_rs))}</p>
            </div>
            <div className="rounded-lg bg-card p-2 text-foreground ring-2 ring-attention">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Requested change</p>
              <p className="font-semibold">{amount(newQty)}</p>
              <p className="text-sm">Pickup {fmtShort(pending.new_pickup_at)}{r.kind === "return" ? ` · back ${fmtShort(pending.new_return_at)}` : ""}</p>
              <p className="text-sm">{money(n(pending.new_total ?? r.total_rs))}</p>
            </div>
          </div>
          <p className="text-sm">
            The current agreement stays until this is accepted.{pending.expires_at ? ` If there is no answer by ${fmtShort(pending.expires_at)}, nothing changes.` : ""}
          </p>
          {pending.proposed_by === userId ? (
            <Button variant="outline" size="sm" onClick={async () => (await rpcSafe(() => supabase.rpc("withdraw_date_change", { _id: pending.id }), "Withdrawn.")) && refresh()}>
              Withdraw
            </Button>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => answer(true)}>
                Accept the change
              </Button>
              <Button size="sm" variant="outline" onClick={() => answer(false)}>
                Keep the current agreement
              </Button>
            </div>
          )}
        </div>
      ) : (
        <>
          {last && (
            <p className="text-sm text-muted-foreground">
              Last change {last.status === "accepted" ? "was accepted" : last.status === "declined" ? "was declined" : last.status === "expired" ? "expired without an answer" : "was withdrawn"}.
            </p>
          )}
          {!open ? (
            <Button variant="outline" onClick={() => setOpen(true)}>
              Change amount or dates
            </Button>
          ) : (
            <form onSubmit={propose} className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Counter label="Amount" value={qty} min={Math.max(1, n(r.picked_up_qty))} max={Math.max(n(r.quantity) * 3, n(r.quantity) + 10)} onChange={setQty} />
              </div>
              {!picked && (
                <label className="space-y-1">
                  <span className="font-semibold">New pickup</span>
                  <Input type="datetime-local" value={pickup} onChange={(e) => setPickup(e.target.value)} className="h-12 text-base" />
                </label>
              )}
              {r.kind === "return" && (
                <label className="space-y-1">
                  <span className="font-semibold">New return</span>
                  <Input type="datetime-local" value={back} onChange={(e) => setBack(e.target.value)} className="h-12 text-base" />
                </label>
              )}
              <p className="text-sm text-muted-foreground sm:col-span-2">
                We check other bookings and work out the new price first. {otherName} needs to accept before anything changes.
              </p>
              <div className="flex gap-2 sm:col-span-2">
                <Button type="submit" disabled={busy}>
                  {busy ? "Checking…" : "Propose this change"}
                </Button>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </>
      )}
    </Card>
  );
}

function Meeting({ data, userId, otherName, iAmOwner }: { data: Bundle; userId: string; otherName: string; iAmOwner: boolean }) {
  const r = data.request;
  const refresh = useRefresh(r.id);
  const mine = data.meeting.find((m) => m.user_id === userId);
  const theirs = data.meeting.find((m) => m.user_id !== userId);
  const [from, setFrom] = useState(isoToLocalInput(mine?.free_from ?? r.pickup_at));
  const [to, setTo] = useState(isoToLocalInput(mine?.free_to ?? new Date(new Date(r.pickup_at).getTime() + 3600_000).toISOString()));
  const [place, setPlace] = useState(mine?.place ?? "");
  const [busy, setBusy] = useState(false);
  const PLACES = ["A public place (market, mosque or park gate)", "Campus pickup", "Owner's home pickup"];

  async function save(e: FormEvent) {
    e.preventDefault();
    const f = localInputToIso(from);
    const t = localInputToIso(to);
    if (!f || !t || t <= f) {
      toast.error("The end time must be after the start time.");
      return;
    }
    if (!ensureOnline()) return;
    setBusy(true);
    const { error } = await supabase
      .from("meeting_prefs")
      .upsert({ request_id: r.id, user_id: userId, free_from: f, free_to: t, place: place.trim(), updated_at: new Date().toISOString() });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Saved.");
    await refresh();
  }

  let suggestion: { text: string; ok: boolean } | null = null;
  if (mine && theirs) {
    const start = Math.max(new Date(mine.free_from).getTime(), new Date(theirs.free_from).getTime());
    const end = Math.min(new Date(mine.free_to).getTime(), new Date(theirs.free_to).getTime());
    const ownerPlace = iAmOwner ? mine.place : theirs.place;
    const borrowerPlace = iAmOwner ? theirs.place : mine.place;
    const ownerAddr = data.addresses.find((a) => a.user_id === r.owner_id);
    const where = ownerAddr?.home_pickup && ownerAddr.shared ? "the owner's home" : ownerPlace || borrowerPlace || "a place you both know";
    suggestion =
      start < end
        ? { text: `Meet ${fmtDateTime(new Date(start).toISOString())} at ${where}.`, ok: true }
        : { text: "Your free times don't overlap. Please choose another time. The booking stays as it is.", ok: false };
  }

  return (
    <Card>
      <h2 className="text-lg font-bold">When and where to meet</h2>
      {suggestion ? (
        <p className={cn("mt-2 rounded-xl p-3 font-semibold", suggestion.ok ? "bg-success-soft" : "bg-attention-soft text-attention-foreground")}>
          {suggestion.ok ? "Suggested: " : ""}
          {suggestion.text}
        </p>
      ) : (
        <p className="mt-1 text-muted-foreground">{mine ? `Waiting for ${otherName} to say when they are free.` : "When are you free, and where would you like to meet?"}</p>
      )}
      {suggestion?.ok && <p className="mt-1 text-sm text-muted-foreground">Both of you see this. If it works, say so in the chat below.</p>}
      {theirs && (
        <p className="mt-2 text-sm">
          {otherName} is free {fmtShort(theirs.free_from)} – {fmtShort(theirs.free_to)}
          {theirs.place ? `, prefers ${theirs.place}` : ""}.
        </p>
      )}
      <form onSubmit={save} className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="font-semibold">I'm free from</span>
          <Input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} className="h-12 text-base" />
        </label>
        <label className="space-y-1">
          <span className="font-semibold">Until</span>
          <Input type="datetime-local" value={to} onChange={(e) => setTo(e.target.value)} className="h-12 text-base" />
        </label>
        <div className="space-y-1 sm:col-span-2">
          <label htmlFor={`place-${r.id}`} className="font-semibold">
            Where do you prefer to meet?
          </label>
          <div className="flex flex-wrap gap-2">
            {PLACES.map((p) => (
              <button key={p} type="button" onClick={() => setPlace(p)} aria-pressed={place === p} className={cn("rounded-full border px-3 py-1.5 text-sm", place === p ? "border-primary bg-accent font-semibold" : "bg-card")}>
                {p}
              </button>
            ))}
          </div>
          <Input id={`place-${r.id}`} value={place} onChange={(e) => setPlace(e.target.value)} placeholder="e.g. Gulgasht main market" maxLength={200} className="h-12 text-base" />
        </div>
        <Button type="submit" disabled={busy} className="sm:col-span-2">
          {mine ? "Update my time" : "Save my time"}
        </Button>
      </form>
    </Card>
  );
}

function Address({ data, userId, iAmOwner, otherName }: { data: Bundle; userId: string; iAmOwner: boolean; otherName: string }) {
  const r = data.request;
  const refresh = useRefresh(r.id);
  const mine = data.addresses.find((a) => a.user_id === userId);
  const theirs = data.addresses.find((a) => a.user_id !== userId && a.shared);
  const [home, setHome] = useState(mine?.home_pickup ?? false);
  const [address, setAddress] = useState(mine?.address ?? "");
  const [busy, setBusy] = useState(false);
  const showForm = iAmOwner ? home : true;

  async function save(shared: boolean) {
    if (!ensureOnline()) return;
    setBusy(true);
    const { error } = await supabase.from("party_addresses").upsert({
      request_id: r.id,
      user_id: userId,
      home_pickup: iAmOwner ? home : false,
      address: address.trim(),
      shared,
      updated_at: new Date().toISOString(),
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(shared ? `Address shared with ${otherName} for this booking.` : "Saved. Not shared.");
    await refresh();
  }

  return (
    <Card className="space-y-3">
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <Home className="h-5 w-5" aria-hidden /> Exact address
      </h2>
      {theirs ? (
        <p>
          {otherName} shared: {theirs.home_pickup ? "Home pickup at " : ""}
          <strong>{theirs.address}</strong>
        </p>
      ) : (
        <p className="text-muted-foreground">{otherName} hasn't shared an exact address. Agree on a place above.</p>
      )}
      {iAmOwner && (
        <label className="flex items-center justify-between gap-3">
          <span>Offer pickup from my home</span>
          <Switch checked={home} onCheckedChange={setHome} aria-label="Offer home pickup" />
        </label>
      )}
      {showForm && (
        <div className="space-y-2">
          <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="My address" aria-label="My address" maxLength={300} className="h-12 text-base" />
          <p className="text-sm text-muted-foreground">
            {mine?.shared ? `${otherName} can see your address.` : "Only you can see this until you share it."} You decide for your own address only.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={busy} onClick={() => save(false)}>
              {mine?.shared ? "Hide my address" : "Save without sharing"}
            </Button>
            <Button disabled={busy || !address.trim()} onClick={() => save(true)}>
              Share my address with {otherName}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function PhotoChoice({ data, userId, otherName }: { data: Bundle; userId: string; otherName: string }) {
  const r = data.request;
  const refresh = useRefresh(r.id);
  const mine = data.photos.find((p) => p.user_id === userId);
  const [busy, setBusy] = useState(false);

  async function choose(choice: "profile" | "other" | "skip", path: string | null = null) {
    if (!ensureOnline()) return;
    setBusy(true);
    const { error } = await supabase.from("request_photos").upsert({ request_id: r.id, user_id: userId, choice, photo_path: path, updated_at: new Date().toISOString() });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(choice === "skip" ? "No photo will be shown." : `Photo shared with ${otherName} for this booking only.`);
    await refresh();
  }

  return (
    <Card>
      <h2 className="flex items-center gap-2 text-lg font-bold">
        <UserRound className="h-5 w-5" aria-hidden /> Your photo for this booking
      </h2>
      <p className="text-sm text-muted-foreground">
        {mine
          ? mine.choice === "skip"
            ? "You chose not to show a photo."
            : `Only ${otherName} sees it, and only for this booking.`
          : "Helps you recognise each other. You control only your own photo."}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <Button variant={mine?.choice === "profile" ? "default" : "outline"} disabled={busy} onClick={() => choose("profile")}>
          Share profile photo
        </Button>
        <label className={cn("inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl border px-5 text-base font-semibold hover:bg-accent focus-within:ring-2 focus-within:ring-ring", mine?.choice === "other" && "border-primary bg-accent")}>
          <Camera className="h-5 w-5" aria-hidden /> Choose another photo
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic"
            className="sr-only"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              try {
                const p = await uploadPhoto(userId, f, "booking");
                await choose("other", p);
              } catch (err) {
                toast.error((err as Error).message);
              }
            }}
          />
        </label>
        <Button variant={mine?.choice === "skip" ? "default" : "outline"} disabled={busy} onClick={() => choose("skip")}>
          Skip
        </Button>
      </div>
    </Card>
  );
}

type Outgoing = {
  clientId: string;
  body: string;
  state: "sending" | "failed";
  /** Rhymes and thank-you cards: the approved content is kept exactly as reviewed. */
  kind?: "shayari" | "thanks";
  previewId?: string;
  shayari?: ShayariSnapshot;
  error?: string | undefined;
};

function RichBubble({ kind, s, body, mine }: { kind: string; s: ShayariSnapshot | null; body: string; mine: boolean }) {
  return (
    <div className={cn("w-full max-w-[95%] rounded-2xl border-2 bg-card px-3 py-2 text-card-foreground sm:max-w-[90%]", mine ? "border-primary" : "border-attention")}>
      {kind === "thanks" && (
        <p className="mb-1 flex items-center gap-1 text-xs font-semibold text-muted-foreground">
          <Heart className="h-3.5 w-3.5" aria-hidden /> Thank-you card
        </p>
      )}
      {s ? (
        <ShayariView s={s} rhymeLabel={mine ? "Your rhyme" : "Rhyme"} />
      ) : (
        <p dir="auto" className="whitespace-pre-wrap">
          {kind !== "thanks" && <Feather className="mr-1 inline h-3.5 w-3.5" aria-hidden />}
          {body}
        </p>
      )}
    </div>
  );
}

function Chat({ data, userId, otherName, closed }: { data: Bundle; userId: string; otherName: string; closed: boolean }) {
  const r = data.request;
  const qc = useQueryClient();
  const [text, setText, clearText] = useDraft(`cu-chat:${r.id}`, "");
  // Unsent messages are kept on this device, so a reload or lost connection doesn't lose them.
  const [outgoing, setOutgoing] = useDraft<Outgoing[]>(`cu-outbox:${r.id}`, []);
  const [rhymeOpen, setRhymeOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const lastId = data.messages[data.messages.length - 1]?.id;

  // Anything left "sending" from an earlier visit is shown as not sent; when the connection is back, retry once each.
  useEffect(() => {
    setOutgoing((list) => list.map((x) => (x.state === "sending" ? { ...x, state: "failed" } : x)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r.id]);
  const outRef = useRef(outgoing);
  outRef.current = outgoing;
  useEffect(() => {
    // Safe to repeat: each message has its own id, and the database keeps only one copy.
    // Messages refused for good (e.g. the chat was closed) are not resent; the person sees why and can remove them.
    const retry = () => outRef.current.filter((o) => !o.error).forEach((o) => void deliver(o));
    window.addEventListener("online", retry);
    if (navigator.onLine) retry();
    return () => window.removeEventListener("online", retry);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r.id]);

  // Opening the chat marks it read.
  useEffect(() => {
    void supabase.rpc("mark_chat_read", { _req: r.id }).then(() => {
      void qc.invalidateQueries({ queryKey: ["unread"] });
      void qc.invalidateQueries({ queryKey: ["notifications"] });
    });
  }, [r.id, lastId, qc]);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [lastId, outgoing.length]);

  // Messages already saved by the server are hidden from the "sending" list (no duplicates on retry).
  const saved = new Set(data.messages.map((m) => m.client_id).filter(Boolean));
  const pending = outgoing.filter((o) => !saved.has(o.clientId));
  const busyIds = useRef(new Set<string>());

  async function deliver(o: Outgoing) {
    if (busyIds.current.has(o.clientId)) return; // a second tap while this one is still on its way
    busyIds.current.add(o.clientId);
    setOutgoing((list) => list.map((x) => (x.clientId === o.clientId ? { ...x, state: "sending", error: undefined } : x)));
    try {
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        setOutgoing((list) => list.map((x) => (x.clientId === o.clientId ? { ...x, state: "failed" } : x)));
        return;
      }
      // Rhymes and thank-you cards go through the server, which checks the chat is still allowed (blocks, booking state).
      // A stalled connection must not leave "Sending…" forever: give up after 20 s and offer "try again" (same id, so no duplicate).
      const stop = AbortSignal.timeout(20_000);
      const { error } = o.kind
        ? await supabase
            .rpc("send_rich_message", {
              _req: r.id,
              _client_id: o.clientId,
              _kind: o.kind,
              _preview: (o.previewId ?? null) as string,
              _body: o.previewId ? "" : o.body,
            })
            .abortSignal(stop)
        : await supabase.from("messages").insert({ request_id: r.id, sender_id: userId, body: o.body, client_id: o.clientId }).abortSignal(stop);
      // 23505 = this exact message was already saved by an earlier try: treat as sent.
      if (error && error.code !== "23505") {
        const revoked = /row-level security|permission denied/i.test(error.message);
        const permanent = revoked || /closed|not allowed|only the borrower|paused|once the owner|not available|opens after/i.test(error.message);
        const why = revoked ? "This chat is closed now, so this message can't be sent." : error.message;
        setOutgoing((list) => list.map((x) => (x.clientId === o.clientId ? { ...x, state: "failed", error: permanent ? why : undefined } : x)));
        return;
      }
      await qc.invalidateQueries({ queryKey: ["request", r.id] });
      setOutgoing((list) => list.filter((x) => x.clientId !== o.clientId));
    } finally {
      busyIds.current.delete(o.clientId);
    }
  }

  function queue(o: Omit<Outgoing, "clientId" | "state">) {
    const item: Outgoing = { ...o, clientId: crypto.randomUUID(), state: "sending" };
    setOutgoing((list) => [...list, item]);
    void deliver(item);
  }

  function send(e: FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setRhymeOpen(false);
    clearText();
    queue({ body });
  }

  const me = useQuery(profileQuery(userId));
  const iAmBorrower = r.borrower_id === userId;
  const sentThanks = data.messages.some((m) => m.kind === "thanks" && m.sender_id === userId) || pending.some((o) => o.kind === "thanks");

  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold">Chat with {otherName}</h2>
        <a href="#summary" className="text-sm font-semibold text-primary underline">
          Booking summary
        </a>
      </div>
      <p className="text-sm text-muted-foreground">Only the two of you can see this.</p>
      <ol ref={listRef} className="mt-3 max-h-[32rem] space-y-2 overflow-y-auto" aria-live="polite">
        {data.messages.map((m) => (
          <li key={m.id} className={m.sender_id === null ? "text-center" : m.sender_id === userId ? "flex justify-end" : "flex"}>
            {m.sender_id === null ? (
              <span className="inline-block rounded-2xl bg-muted px-3 py-1 text-sm text-muted-foreground">
                {m.body} <span className="opacity-70">· {fmtShort(m.created_at)}</span>
              </span>
            ) : m.kind === "shayari" || m.kind === "thanks" ? (
              <div className={cn("flex w-full flex-col", m.sender_id === userId ? "items-end" : "items-start")}>
                <RichBubble kind={m.kind} s={isShayariSnapshot(m.shayari) ? m.shayari : null} body={m.body} mine={m.sender_id === userId} />
                <span className="mt-0.5 text-[11px] text-muted-foreground">
                  {fmtShort(m.created_at)}
                  {m.sender_id === userId ? " · Sent" : ""}
                </span>
              </div>
            ) : (
              <span className={cn("max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2", m.sender_id === userId ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-secondary text-secondary-foreground")}>
                {m.body}
                <span className="block text-[11px] opacity-80">
                  {fmtShort(m.created_at)}
                  {m.sender_id === userId ? " · Sent" : ""}
                </span>
              </span>
            )}
          </li>
        ))}
        {pending.map((o) => (
          <li key={o.clientId} className="flex flex-col items-end">
            {o.kind ? (
              <RichBubble kind={o.kind} s={o.shayari ?? null} body={o.body} mine />
            ) : (
              <span className={cn("max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md px-3 py-2", o.state === "failed" ? "border-2 border-attention bg-attention-soft text-foreground" : "bg-primary/70 text-primary-foreground")}>
                {o.body}
              </span>
            )}
            <span className="mt-0.5 block text-[11px]">
              {o.state === "sending" ? (
                "Sending…"
              ) : (
                <span className="inline-flex flex-wrap items-center justify-end gap-2">
                  {o.error && <span className="font-semibold text-attention-foreground">{o.error}</span>}
                  <button type="button" className="inline-flex items-center gap-1 font-semibold underline" onClick={() => void deliver(o)}>
                    <CircleAlert className="h-3 w-3" aria-hidden /> Not sent — try again <RotateCw className="h-3 w-3" aria-hidden />
                  </button>
                  <button type="button" className="font-semibold underline" onClick={() => setOutgoing((l) => l.filter((x) => x.clientId !== o.clientId))}>
                    Remove
                  </button>
                </span>
              )}
            </span>
          </li>
        ))}
      </ol>
      {closed ? (
        <p className="mt-3 rounded-xl bg-muted p-3 text-sm">Chat is closed.</p>
      ) : (
        <>
          {iAmBorrower && !sentThanks && bookingDone(r) && me.data && !me.data.restricted && (
            <SayThanks r={r} userId={userId} otherName={otherName} onQueue={queue} />
          )}
          <form onSubmit={send} className="mt-3 flex flex-wrap gap-2">
            <Input
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Write a message"
              maxLength={1000}
              className="h-12 min-w-0 flex-1 text-base"
              aria-label="Message"
            />
            {text.trim() && !rhymeOpen && (
              <Button type="button" variant="outline" className="h-12" onClick={() => setRhymeOpen(true)}>
                <Feather /> Make it rhyme
              </Button>
            )}
            <Button type="submit" size="icon" className="h-12 w-12" disabled={!text.trim()} aria-label="Send message">
              <SendHorizontal />
            </Button>
          </form>
          {rhymeOpen && text.trim() && (
            <div className="mt-3">
              <ShayariPanel
                context="dm"
                source={text}
                target={{ requestId: r.id }}
                onClose={() => setRhymeOpen(false)}
                onEditSource={() => inputRef.current?.focus()}
                onSendOriginal={(original) => {
                  setRhymeOpen(false);
                  clearText();
                  queue({ body: original });
                }}
                onSendRhyme={(p) => {
                  setRhymeOpen(false);
                  clearText();
                  queue({ body: p.lines.join("\n"), kind: "shayari", previewId: p.id, shayari: p });
                }}
              />
            </div>
          )}
        </>
      )}
    </Card>
  );
}

/** Optional thank-you after this booking is fully finished. Separate from ratings; it never changes stars. */
function SayThanks({
  r,
  otherName,
  onQueue,
}: {
  r: Req;
  userId: string;
  otherName: string;
  onQueue: (o: Omit<Outgoing, "clientId" | "state">) => void;
}) {
  const starter = thanksStarter(r) ?? "Thank you!";
  const [open, setOpen] = useState(false);
  const [msg, setMsg, clearMsg] = useDraft(`cu-thanks:${r.id}`, starter);
  const [rhyme, setRhyme] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  if (!open) {
    return (
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-success bg-success-soft p-3">
        <p className="font-semibold">Everything is done. Want to thank {otherName}?</p>
        <Button type="button" onClick={() => setOpen(true)}>
          <Heart /> Say thanks
        </Button>
      </div>
    );
  }
  return (
    <div className="mt-3 space-y-2 rounded-xl border border-success bg-success-soft p-3">
      <label htmlFor={`thanks-${r.id}`} className="font-semibold">
        Say thanks
      </label>
      <Textarea id={`thanks-${r.id}`} ref={ref} value={msg} onChange={(e) => setMsg(e.target.value)} maxLength={600} className="bg-card text-base" />
      <p className="text-sm text-muted-foreground">This goes to your chat with {otherName}. It is not a rating and doesn't change any stars.</p>
      {!rhyme && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={!msg.trim()} onClick={() => setRhyme(true)}>
            <Feather /> Make it rhyme
          </Button>
          <Button
            type="button"
            disabled={!msg.trim()}
            onClick={() => {
              onQueue({ body: msg.trim(), kind: "thanks" });
              clearMsg();
            }}
          >
            <SendHorizontal /> Send
          </Button>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Not now
          </Button>
        </div>
      )}
      {rhyme && msg.trim() && (
        <ShayariPanel
          context="thanks"
          source={msg}
          target={{ requestId: r.id }}
          onClose={() => setRhyme(false)}
          onEditSource={() => ref.current?.focus()}
          onSendOriginal={(original) => {
            onQueue({ body: original, kind: "thanks" });
            clearMsg();
          }}
          onSendRhyme={(p) => {
            onQueue({ body: p.lines.join("\n"), kind: "thanks", previewId: p.id, shayari: p });
            clearMsg();
          }}
        />
      )}
    </div>
  );
}

function StarInput({ value, onChange, label }: { value: number; onChange: (n: number) => void; label: string }) {
  return (
    <div>
      <p className="font-semibold">{label}</p>
      <div className="flex gap-1" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((s) => (
          <button key={s} type="button" role="radio" aria-checked={value === s} aria-label={`${s} stars`} onClick={() => onChange(s)} className="rounded-lg p-1">
            <Star className={cn("h-8 w-8", s <= value ? "fill-attention text-attention" : "text-muted-foreground")} />
          </button>
        ))}
      </div>
    </div>
  );
}

function Rate({ data, userId, iAmOwner, otherName }: { data: Bundle; userId: string; iAmOwner: boolean; otherName: string }) {
  const r = data.request;
  const refresh = useRefresh(r.id);
  const mine = data.ratings.find((x) => x.rater_id === userId);
  const editable = !mine || Date.now() - new Date(mine.created_at).getTime() < 7 * 86_400_000;
  const [editing, setEditing] = useState(false);
  const [person, setPerson] = useState(mine?.person_stars ?? 0);
  const [item, setItem] = useState(mine?.item_stars ?? 0);
  const [comment, setComment] = useState(mine?.comment ?? "");
  const [busy, setBusy] = useState(false);

  if (mine && !editing) {
    return (
      <Card tone="success" className="space-y-2">
        <p className="font-semibold">
          You gave {otherName} {mine.person_stars} stars{mine.item_stars ? ` and the item ${mine.item_stars} stars` : ""}.
        </p>
        {editable ? (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            Change my rating
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">Ratings can be changed for 7 days.</p>
        )}
      </Card>
    );
  }
  return (
    <Card>
      <h2 className="text-lg font-bold">Rate this exchange</h2>
      <p className="text-sm text-muted-foreground">One rating per person for each booking. You can change it for 7 days.</p>
      <div className="mt-2 space-y-3">
        <StarInput label={`How was ${otherName}?`} value={person} onChange={setPerson} />
        {!iAmOwner && <StarInput label={`How was the ${r.item_name.toLowerCase()}?`} value={item} onChange={setItem} />}
        <Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Anything to add? (optional)" maxLength={500} />
        <Button
          disabled={busy || person === 0 || (!iAmOwner && item === 0)}
          onClick={async () => {
            setBusy(true);
            const ok = await rpcSafe(() => supabase.rpc("rate_exchange", { _req: r.id, _person_stars: person, _item_stars: iAmOwner ? 0 : item, _comment: comment }), "Rating saved.");
            setBusy(false);
            if (ok) {
              setEditing(false);
              await refresh();
            }
          }}
        >
          Save rating
        </Button>
        {!busy && (person === 0 || (!iAmOwner && item === 0)) && (
          <p className="text-sm text-muted-foreground">Tap the stars{iAmOwner ? "" : " for both questions"} to save.</p>
        )}
      </div>
    </Card>
  );
}

const KINDS = [
  ["missing", "Missing items"],
  ["damage", "Damage"],
  ["late", "Late return"],
  ["conduct", "Inappropriate behaviour"],
  ["other", "Something else"],
] as const;
type Kind = (typeof KINDS)[number][0];
const kindLabel = (k: string) => KINDS.find(([x]) => x === k)?.[1] ?? "Other";

function reportStatusWords(s: string, decision: string | null, appealDecision: string | null) {
  switch (s) {
    case "open":
      return "Reported. Waiting for the other person's side and the area admin.";
    case "replied":
      return "The other person replied. Waiting for the area admin.";
    case "under_review":
      return "Under review by your area admin.";
    case "decided":
      return `Resolved — area admin decided: ${decision ?? ""}`;
    case "appealed":
      return "Appealed. Waiting for the area admin to look again.";
    default:
      return `Closed — final decision: ${appealDecision ?? decision ?? ""}`;
  }
}

function Reports({ data, userId }: { data: Bundle; userId: string }) {
  const r = data.request;
  const refresh = useRefresh(r.id);
  const photoFn = useServerFn(reportPhoto);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>("missing");
  const [desc, setDesc, clearDesc] = useDraft(`cu-report:${r.id}`, "");
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [replies, setReplies] = useState<Record<string, string>>({});

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const ok = await rpcSafe(
      () => supabase.rpc("create_report", { _req: r.id, _kind: kind, _description: desc.trim(), _photo: photo ?? "" }),
      "Reported. The other person can reply, and an area admin will review it.",
    );
    setBusy(false);
    if (!ok) return;
    setOpen(false);
    clearDesc();
    setPhoto(null);
    await refresh();
  }

  return (
    <section id="reports" className="scroll-mt-20 space-y-3">
      {data.reports.map((rp) => {
        const mineReport = rp.reporter_id === userId;
        return (
          <Card key={rp.id} tone="attention">
            <p className="font-semibold">
              {mineReport ? "You reported a problem" : "A problem was reported about this booking"} · {kindLabel(rp.kind)}
            </p>
            <p className="mt-1">{rp.description}</p>
            {rp.photo_path && (
              <Button
                variant="link"
                className="h-auto p-0"
                onClick={async () => {
                  const u = await photoFn({ data: { reportId: rp.id } });
                  if (u.url) window.open(u.url, "_blank", "noopener");
                }}
              >
                See photo
              </Button>
            )}
            {rp.reply && (
              <p className="mt-2 rounded-xl bg-card p-3">
                <strong>Reply:</strong> {rp.reply}
              </p>
            )}
            {!mineReport && ["open", "replied", "under_review"].includes(rp.status) && (
              <div className="mt-2 flex gap-2">
                <Input value={replies[rp.id] ?? ""} onChange={(e) => setReplies({ ...replies, [rp.id]: e.target.value })} placeholder="Your side of the story" maxLength={1500} className="h-11 bg-card" />
                <Button
                  disabled={!replies[rp.id]?.trim()}
                  onClick={async () => {
                    if (await rpcSafe(() => supabase.rpc("reply_report", { _id: rp.id, _reply: (replies[rp.id] ?? "").trim() }), "Reply sent.")) await refresh();
                  }}
                >
                  Reply
                </Button>
              </div>
            )}
            <p className="mt-2 text-sm">{reportStatusWords(rp.status, rp.decision, rp.appeal_decision)}</p>
            {rp.status === "decided" && (
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={async () => {
                  const why = window.prompt("Why do you disagree with the decision?");
                  if (!why?.trim()) return;
                  if (await rpcSafe(() => supabase.rpc("appeal_report", { _id: rp.id, _appeal: why.trim() }), "Appeal sent.")) await refresh();
                }}
              >
                Appeal this decision
              </Button>
            )}
          </Card>
        );
      })}

      {!open ? (
        <Button variant="ghost" className="text-muted-foreground" onClick={() => setOpen(true)}>
          <Flag /> Report a problem
        </Button>
      ) : (
        <Card>
          <form onSubmit={submit} className="space-y-3">
            <h2 className="text-lg font-bold">Report a problem</h2>
            <p className="text-sm text-muted-foreground">Private. The other person can reply, and your area admin decides. Nobody is banned just because of a report.</p>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="What happened?">
              {KINDS.map(([k, l]) => (
                <Button key={k} type="button" role="radio" aria-checked={kind === k} variant={kind === k ? "default" : "outline"} onClick={() => setKind(k)}>
                  {l}
                </Button>
              ))}
            </div>
            <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What happened?" maxLength={1500} required />
            <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl border px-4 font-semibold hover:bg-accent focus-within:ring-2 focus-within:ring-ring">
              <Camera className="h-5 w-5" aria-hidden /> {photo ? "Photo added" : "Add a private photo"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/heic"
                className="sr-only"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (!f) return;
                  try {
                    setPhoto(await uploadPhoto(userId, f, "reports"));
                  } catch (err) {
                    toast.error((err as Error).message);
                  }
                }}
              />
            </label>
            <div className="flex gap-2">
              <Button type="submit" disabled={busy || !desc.trim()}>
                Send report
              </Button>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}
    </section>
  );
}
