import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { Camera, ChevronDown, Loader2, MapPin, RefreshCw, Search, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DistancePicker } from "@/components/app/DistancePicker";
import { MyItemsPanel } from "@/components/app/MyItemsPanel";
import { InstallBanner } from "@/components/app/InstallApp";
import { AiNotice, Card, Empty, ItemThumb, Stars } from "@/components/app/bits";
import { getAiStatus, nearbyItems, talkNeed } from "@/lib/app.functions";
import { profileQuery, errMessage } from "@/lib/queries";
import { fmtDateTime, fmtDistance, fmtQty, localInputToIso, priceLabel } from "@/lib/format";
import { uploadPhoto, ownPhotoUrl } from "@/lib/upload";
import { ensureOnline, useDraft } from "@/hooks/use-app";

export const Route = createFileRoute("/_authenticated/_tabs/find")({
  head: () => ({
    meta: [
      { title: "Find an item — Cheez Udhaar" },
      { name: "description", content: "Describe what you need or add a photo, and see what neighbours have listed nearby." },
      { property: "og:title", content: "Find an item — Cheez Udhaar" },
      { property: "og:description", content: "Describe what you need or add a photo, and see what neighbours have listed nearby." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(profileQuery(context.userId)),
  component: FindPage,
});

type Extra = { qty: string; pickup: string; back: string; budget: string };
const NO_EXTRA: Extra = { qty: "", pickup: "", back: "", budget: "" };

/** Optional details become one plain sentence the helper reads together with the request. */
function extrasSentence(x: Extra): string {
  const parts: string[] = [];
  if (x.qty.trim()) parts.push(`I need ${x.qty.trim()}.`);
  const p = localInputToIso(x.pickup);
  if (p) parts.push(`I will pick it up ${fmtDateTime(p)} (Pakistan time).`);
  const b = localInputToIso(x.back);
  if (b) parts.push(`I will bring it back ${fmtDateTime(b)} (Pakistan time).`);
  if (x.budget.trim()) parts.push(Number(x.budget) === 0 ? "My budget is 0, it must be free." : `My budget is Rs ${x.budget.trim()}.`);
  return parts.join(" ");
}

function FindPage() {
  const { userId } = Route.useRouteContext();
  const { data: profile } = useSuspenseQuery(profileQuery(userId));
  const navigate = useNavigate();
  const qc = useQueryClient();
  const talk = useServerFn(talkNeed);
  const nearbyFn = useServerFn(nearbyItems);
  const aiStatusFn = useServerFn(getAiStatus);
  // Kept on this device, so the request survives opening a listing, going back, a reload or a failed send.
  const [text, setText, clearText] = useDraft(`cu-find-text:${userId}`, "");
  const [photoPath, setPhotoPath, clearPhoto] = useDraft<string | null>(`cu-find-photo:${userId}`, null);
  const [extra, setExtra, clearExtra] = useDraft<Extra>(`cu-find-extra:${userId}`, NO_EXTRA);
  const [km, setKm] = useDraft(`cu-find-km:${userId}`, Number(profile.travel_km));
  const [showExtra, setShowExtra] = useState(() => Object.values(extra).some((v) => v));
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [aiError, setAiError] = useState<{ text: string; retryAfter: number | null } | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const working = useRef(false); // blocks a second tap before the screen updates
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!busy) {
      setElapsed(0);
      return;
    }
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [busy]);

  const photoUrl = useQuery({
    queryKey: ["own-photo", photoPath],
    queryFn: () => ownPhotoUrl(photoPath),
    enabled: Boolean(photoPath),
    staleTime: 30 * 60_000,
  });
  const aiStatus = useQuery({ queryKey: ["ai-status"], queryFn: () => aiStatusFn(), staleTime: 60_000 });
  // With dates, the server checks that exact interval; without dates we only know what is listed.
  const from = localInputToIso(extra.pickup);
  const to = localInputToIso(extra.back);
  const nearby = useQuery({
    queryKey: ["nearby", km, from, to],
    queryFn: () => nearbyFn({ data: { km, from, to } }),
    refetchInterval: 30_000,
  });
  const extraText = extrasSentence(extra);
  const hasLocation = profile.lat != null && profile.lng != null && Boolean(profile.area_name);
  const usable = text.trim().length >= 3 || Boolean(photoPath);
  const blocker = !hasLocation
    ? "Choose your area first, so we can look nearby."
    : uploading
      ? "Wait for the photo to finish adding."
      : !usable
        ? "Write what you need (a few words is fine) or add a photo."
        : null;

  async function submit() {
    if (working.current || busy || blocker) return;
    if (!ensureOnline()) return;
    working.current = true;
    setBusy(true);
    setAiError(null);
    try {
      const message = [text.trim(), extraText].filter(Boolean).join("\n");
      const r = await talk({ data: { wantId: null, message, photoPath, km } });
      if (!r.ok) {
        setAiError({ text: r.aiError, retryAfter: r.retryAfter });
        return;
      }
      if (r.plan) qc.setQueryData(["plan", r.wantId, r.plan.km], { ok: true, plan: r.plan });
      clearText();
      clearPhoto();
      clearExtra();
      navigate({ to: "/need/$wantId", params: { wantId: r.wantId } });
    } catch (err) {
      toast.error(errMessage(err));
    } finally {
      working.current = false;
      setBusy(false);
    }
  }

  const progress = photoPath && elapsed < 6
    ? "Looking at your photo…"
    : elapsed < 6
      ? "Reading your request…"
      : "Checking who nearby has it free…";

  async function pickPhoto(f: File) {
    setUploading(true);
    try {
      setPhotoPath(await uploadPhoto(userId, f, "wants"));
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void submit();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_17rem]">
      <div className="min-w-0 space-y-6">
        {aiStatus.data && !aiStatus.data.ai && (
          <AiNotice message="The AI helper is not connected yet, so we can't read your request. Ask the app owner to connect it." />
        )}
        <InstallBanner />
        <Card>
          <form onSubmit={onSubmit} className="space-y-4">
            <label htmlFor="need" className="block font-display text-3xl font-bold">
              What do you need?
            </label>
            <Textarea
              id="need"
              ref={inputRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g. 20 chairs on Sunday, 1 PM to 6 PM"
              className="min-h-28 rounded-2xl bg-background text-lg"
              maxLength={1000}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  e.currentTarget.form?.requestSubmit();
                }
              }}
            />
            <p className="text-sm text-muted-foreground">Write a full sentence in English or Roman Urdu. You can also just send a photo.</p>
            <div className="flex flex-wrap items-center gap-3">
              {!photoPath && (
                <PhotoButton label={uploading ? "Adding photo…" : "Add photo"} disabled={uploading} onFile={pickPhoto} />
              )}
              {photoPath && (
                <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-background p-2">
                  <ItemThumb url={photoUrl.data} name="Your photo" className="h-16 w-16" />
                  <PhotoButton label={uploading ? "Replacing…" : "Replace"} small disabled={uploading} onFile={pickPhoto} icon={<RefreshCw className="h-4 w-4" aria-hidden />} />
                  <button type="button" className="flex h-11 items-center gap-1 rounded-lg px-3 text-sm font-semibold text-muted-foreground hover:bg-accent" onClick={() => setPhotoPath(null)}>
                    <X className="h-4 w-4" aria-hidden /> Remove
                  </button>
                </div>
              )}
            </div>

            <p className="flex flex-wrap items-center gap-2 text-base">
              <MapPin className="h-5 w-5 text-primary" aria-hidden />
              {hasLocation ? (
                <>
                  <span>
                    Near <strong>{profile.area_name}</strong>
                  </span>
                  <Link to="/profile" className="text-sm font-semibold text-primary underline">
                    Change
                  </Link>
                </>
              ) : (
                <Button asChild variant="outline" size="sm">
                  <Link to="/profile">Choose area</Link>
                </Button>
              )}
            </p>
            <div className="space-y-2">
              <p className="font-semibold">Search within {km} km</p>
              <DistancePicker value={km} onChange={setKm} />
              <p className="text-sm text-muted-foreground">
                Straight-line distance from your area, so the road trip can be a little longer.
                {km !== Number(profile.travel_km) && ` Only for this search — your usual distance is ${Number(profile.travel_km)} km.`}
              </p>
            </div>

            <div>
              <button
                type="button"
                onClick={() => setShowExtra((s) => !s)}
                aria-expanded={showExtra}
                className="flex items-center gap-2 rounded-lg py-2 text-left font-semibold text-primary"
              >
                <SlidersHorizontal className="h-4 w-4" aria-hidden /> Add dates, amount or budget (optional)
                <ChevronDown className={showExtra ? "h-4 w-4 rotate-180" : "h-4 w-4"} aria-hidden />
              </button>
              {showExtra && (
                <div className="mt-2 grid gap-3 rounded-2xl bg-muted p-3 sm:grid-cols-2">
                  <label className="space-y-1">
                    <span className="text-sm font-semibold">How many do you need?</span>
                    <Input value={extra.qty} onChange={(e) => setExtra({ ...extra, qty: e.target.value })} placeholder="e.g. 20 or 10 ml" maxLength={30} className="h-12 bg-card text-base" />
                  </label>
                  <label className="space-y-1">
                    <span className="text-sm font-semibold">Budget (Rs)</span>
                    <Input type="number" min={0} value={extra.budget} onChange={(e) => setExtra({ ...extra, budget: e.target.value })} placeholder="0 = free only" className="h-12 bg-card text-base" />
                  </label>
                  <label className="space-y-1">
                    <span className="text-sm font-semibold">When will you pick it up?</span>
                    <Input type="datetime-local" value={extra.pickup} onChange={(e) => setExtra({ ...extra, pickup: e.target.value })} className="h-12 bg-card text-base" />
                  </label>
                  <label className="space-y-1">
                    <span className="text-sm font-semibold">When will you bring it back?</span>
                    <Input type="datetime-local" value={extra.back} onChange={(e) => setExtra({ ...extra, back: e.target.value })} className="h-12 bg-card text-base" />
                  </label>
                  {extraText && <p className="text-sm text-muted-foreground sm:col-span-2">We'll add: “{extraText}”</p>}
                  {Object.values(extra).some((v) => v) && (
                    <button type="button" className="justify-self-start text-sm font-semibold text-muted-foreground underline" onClick={() => setExtra(NO_EXTRA)}>
                      Clear these details
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Button type="submit" size="lg" className="w-full" disabled={busy || Boolean(blocker)} aria-describedby="find-why">
                {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Search />} {busy ? progress : "Find items"}
              </Button>
              <p id="find-why" className="text-center text-sm text-muted-foreground" aria-live="polite">
                {busy ? `Working… ${elapsed}s. This can take up to 30 seconds. Your text is kept.` : blocker ?? ""}
              </p>
            </div>
            {aiError && (
              <AiNotice
                message={aiError.text}
                retryAfter={aiError.retryAfter}
                onRetry={() => void submit()}
                retrying={busy}
                next="You can still browse the nearby items below and pick your dates to check what is free. No booking was made."
              />
            )}
          </form>
        </Card>

        <section className="space-y-3" aria-busy={nearby.isPending}>
          <h2 className="text-xl font-bold">
            Near {profile.area_name} · within {km} km
          </h2>
          <p className="text-sm text-muted-foreground">
            {from ? `Free amounts are for your dates: pickup ${fmtDateTime(from)}${to ? `, back ${fmtDateTime(to)}` : ""}.` : "Choose dates above to check availability. Until then you see what each owner has listed."}
          </p>
          {nearby.isPending && (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3" aria-label="Loading nearby items">
              {[0, 1, 2].map((i) => (
                <li key={i} className="h-56 animate-pulse rounded-2xl bg-muted" />
              ))}
            </ul>
          )}
          {nearby.isError && (
            <Card tone="attention" className="flex flex-wrap items-center gap-3">
              <p className="font-semibold">Could not load nearby items. Check your connection.</p>
              <Button variant="outline" size="sm" onClick={() => nearby.refetch()}>
                Try again
              </Button>
            </Card>
          )}
          {nearby.data && nearby.data.length === 0 && (
            <Empty>
              Nothing listed within {km} km yet.{" "}
              {km < 10 ? (
                <button type="button" className="font-semibold text-primary underline" onClick={() => setKm(10)}>
                  Look within 10 km
                </button>
              ) : (
                <Link to="/my-items/new" className="font-semibold text-primary underline">
                  Lend an item to get things started
                </Link>
              )}
            </Empty>
          )}
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {nearby.data?.map((it) => (
              <li key={it.item_id}>
                <Link to="/listing/$itemId" params={{ itemId: it.item_id }} className="block h-full">
                  <Card className="h-full p-3 transition-colors hover:bg-accent">
                    <ItemThumb url={it.photo_url} name={it.item_name} className="w-full" />
                    <h3 className="mt-2 text-base font-semibold leading-tight">{it.item_name}</h3>
                    <p className="text-sm text-muted-foreground">
                      {it.area_name ? `${it.area_name} · ` : ""}
                      {fmtDistance(it.distance_km)}
                    </p>
                    <Availability it={it} dated={Boolean(from)} />
                    <p className="mt-1 font-semibold text-primary">{priceLabel(it.kind, it.price_rs, it.price_per, it.unit, it.price_period, it.listed_qty)}</p>
                    <Stars avg={it.avg_rating} count={it.rating_count} />
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <aside className="hidden lg:block" aria-label="My items">
        <div className="sticky top-8">
          <MyItemsPanel userId={userId} />
        </div>
      </aside>
    </div>
  );
}

type NearbyCard = { listed_qty: number; free_qty: number | null; time_note: string | null; unit: string };

/** "20 listed" until dates are known; then what is free for that exact interval. */
function Availability({ it, dated }: { it: NearbyCard; dated: boolean }) {
  if (!dated || it.free_qty == null) {
    return (
      <p className="text-sm text-muted-foreground">
        {fmtQty(it.listed_qty, it.unit)} listed
        <span className="block text-xs">Choose dates to check availability</span>
      </p>
    );
  }
  if (it.time_note) return <p className="text-sm font-semibold text-attention-foreground">Not free then: {it.time_note.toLowerCase()}</p>;
  const free = Math.max(0, it.free_qty);
  return (
    <p className={free > 0 ? "text-sm text-muted-foreground" : "text-sm font-semibold text-attention-foreground"}>
      {free > 0 ? `${fmtQty(free, it.unit)} free for your dates` : "None free for your dates"}
      <span className="block text-xs">{fmtQty(it.listed_qty, it.unit)} listed</span>
    </p>
  );
}

function PhotoButton({
  label,
  onFile,
  disabled,
  small,
  icon,
}: {
  label: string;
  onFile: (f: File) => void;
  disabled?: boolean;
  small?: boolean;
  icon?: ReactNode;
}) {
  return (
    <label
      className={
        (small ? "h-11 px-3 text-sm " : "h-12 px-4 text-base ") +
        "flex cursor-pointer items-center gap-2 rounded-xl border bg-background font-semibold hover:bg-accent focus-within:ring-2 focus-within:ring-ring" +
        (disabled ? " pointer-events-none opacity-60" : "")
      }
    >
      {icon ?? <Camera className="h-5 w-5" aria-hidden />} {label}
      <input
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic"
        className="sr-only"
        aria-label={label}
        disabled={disabled}
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) onFile(f);
        }}
      />
    </label>
  );
}
