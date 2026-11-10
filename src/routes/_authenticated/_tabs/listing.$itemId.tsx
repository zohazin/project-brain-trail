import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, CalendarClock, MapPin, Package, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, Empty, ItemThumb, Stars } from "@/components/app/bits";
import { AiDemoLabel, SAMPLE_PHOTO_TEXT, SimulatedOwnerLabel } from "@/components/app/DemoResults";
import { DirectRequest } from "@/components/app/DirectRequest";
import { listingDetail } from "@/lib/app.functions";
import { DAY_NAMES, fmtClock, fmtDistance, fmtQty, priceLabel } from "@/lib/format";

const listingQuery = (itemId: string) =>
  queryOptions({ queryKey: ["listing", itemId], queryFn: () => listingDetail({ data: { itemId } }) });

export const Route = createFileRoute("/_authenticated/_tabs/listing/$itemId")({
  head: () => ({
    meta: [
      { title: "Listing — Cheez Udhaar" },
      { name: "description", content: "Photos, price, pickup area and availability for one item you can borrow nearby." },
      { property: "og:title", content: "Listing — Cheez Udhaar" },
      { property: "og:description", content: "Photos, price, pickup area and availability for one item you can borrow nearby." },
    ],
  }),
  loader: ({ context, params }) => context.queryClient.ensureQueryData(listingQuery(params.itemId)),
  component: Listing,
});

function Listing() {
  const { itemId } = Route.useParams();
  const { userId } = Route.useRouteContext();
  const { data: it } = useSuspenseQuery(listingQuery(itemId));
  const navigate = useNavigate();
  const [shown, setShown] = useState(0);

  if (!it) {
    return (
      <div className="space-y-4">
        <BackToFind />
        <Empty>This listing isn't available to you right now. It may be paused or outside both distance limits.</Empty>
      </div>
    );
  }

  function askForThis() {
    if (!it) return;
    // Add to the request the person is already typing on Find, instead of replacing it.
    const key = `cu-find-text:${userId}`;
    let cur = "";
    try {
      cur = JSON.parse(localStorage.getItem(key) ?? '""') as string;
    } catch {
      cur = "";
    }
    const add = `I need ${it.item_name.toLowerCase()}.`;
    if (!cur.toLowerCase().includes(it.item_name.toLowerCase())) {
      localStorage.setItem(key, JSON.stringify(cur.trim() ? `${cur.trim()} ${add}` : add));
    }
    navigate({ to: "/find" });
  }

  const days = it.avail_days.length === 7 ? "Every day" : it.avail_days.map((d) => DAY_NAMES[d]).join(", ");
  return (
    <div className="space-y-4">
      <BackToFind />
      <Card className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,16rem)_1fr]">
          <div className="space-y-2">
            <ItemThumb url={it.photo_urls[shown] ?? null} name={it.item_name} className="w-full" emptyText={it.is_generated ? SAMPLE_PHOTO_TEXT : undefined} />
            {it.photo_urls.length > 1 && (
              <div className="flex gap-2" role="group" aria-label="More photos">
                {it.photo_urls.map((u, i) => (
                  <button key={u} type="button" onClick={() => setShown(i)} aria-label={`Photo ${i + 1}`} aria-pressed={shown === i} className={i === shown ? "rounded-xl ring-2 ring-primary" : "rounded-xl"}>
                    <ItemThumb url={u} name="" className="h-14 w-14" />
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="min-w-0 space-y-2">
            {it.category && <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{it.category}</p>}
            {it.is_generated && (
              <div className="flex flex-wrap gap-1">
                <AiDemoLabel />
                <SimulatedOwnerLabel />
              </div>
            )}
            <h1 className="text-2xl font-bold">{it.item_name}</h1>
            <p className="text-xl font-semibold text-primary">{priceLabel(it.kind, it.price_rs, it.price_per, it.unit, it.price_period, it.listed_qty)}</p>
            <Stars avg={it.avg_rating} count={it.rating_count} />
            <p className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-primary" aria-hidden /> Pickup near {it.area_name || "your area"} · {fmtDistance(it.distance_km)}
            </p>
            <p className="text-sm text-muted-foreground">Approximate straight-line distance. The exact place is shared only after the owner says yes.</p>
            <p className="flex items-center gap-2">
              <Package className="h-4 w-4 text-primary" aria-hidden />
              {fmtQty(it.listed_qty, it.unit)} listed · {it.kind === "return" ? "Bring it back" : "Use it up"}
            </p>
            {it.kind === "use_up" && (
              <p className="text-sm text-muted-foreground">
                {it.measured ? "Amount measured by the owner." : "Amount is the owner's estimate."}
                {it.min_amount ? ` Smallest amount: ${fmtQty(it.min_amount, it.unit)}.` : ""}
                {it.step_amount ? ` Comes in steps of ${fmtQty(it.step_amount, it.unit)}.` : ""}
              </p>
            )}
            <p className="flex items-center gap-2 text-sm">
              <CalendarClock className="h-4 w-4 text-primary" aria-hidden /> {days}, {fmtClock(it.avail_start)}–{fmtClock(it.avail_end)}
            </p>
          </div>
        </div>
        {it.description && <p>{it.description}</p>}
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          {it.specs && <Fact label="Details" value={it.specs} />}
          {it.condition && <Fact label="Condition" value={it.condition} />}
          {it.accessories && <Fact label="Comes with" value={it.accessories} />}
          {it.distance_km > it.owner_limit_km && <Fact label="Distance" value="You are farther than this owner usually lends. You can ask for an exception." />}
        </dl>
      </Card>
      <DirectRequest
        item={{
          id: it.item_id,
          name: it.item_name,
          kind: it.kind,
          unit: it.unit,
          listed: it.listed_qty,
          outside: it.distance_km > it.owner_limit_km,
          minAmount: it.min_amount,
          stepAmount: it.step_amount,
        }}
      />
      <Card className="space-y-2">
        <p className="font-semibold">Not sure this is the right one?</p>
        <Button variant="outline" size="lg" className="w-full" onClick={askForThis}>
          <Search /> Describe what you need on Find
        </Button>
        <p className="text-center text-sm text-muted-foreground">Your request on Find is kept. We add this item to it.</p>
      </Card>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted p-3">
      <dt className="font-semibold">{label}</dt>
      <dd className="text-muted-foreground">{value}</dd>
    </div>
  );
}

function BackToFind() {
  return (
    <Link to="/find" className="inline-flex items-center gap-1 text-sm font-semibold text-primary">
      <ArrowLeft className="h-4 w-4" aria-hidden /> Back to Find
    </Link>
  );
}
