import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowLeft, Camera, Eye, MapPin, Pencil, Star, Trash2 } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { DistancePicker } from "@/components/app/DistancePicker";
import { LocationPicker, type PickedPlace } from "@/components/app/LocationPicker";
import { Card, ItemThumb } from "@/components/app/bits";
import { saveItem } from "@/lib/app.functions";
import { DAY_NAMES, costFor, fmtClock, fmtQty, money, priceLabel } from "@/lib/format";
import { errMessage } from "@/lib/queries";
import { ownPhotoUrls, uploadPhoto } from "@/lib/upload";
import { ensureOnline, useDraft } from "@/hooks/use-app";
import { cn } from "@/lib/utils";

type Item = Database["public"]["Tables"]["items"]["Row"];
type Profile = Database["public"]["Tables"]["profiles"]["Row"];

type Draft = {
  photo_paths: string[];
  name: string;
  category: string;
  description: string;
  specs: string;
  condition: string;
  accessories: string;
  kind: "return" | "use_up";
  quantity: number;
  unit: string;
  measured: boolean;
  min_amount: number | null;
  step_amount: number | null;
  free: boolean;
  price_rs: number;
  price_per: number;
  price_period: "each" | "day";
  avail_days: number[];
  avail_start: string;
  avail_end: string;
  place: PickedPlace | null;
  max_distance_km: number;
  allow_outside: boolean;
};

const STEPS = ["photo", "name", "about", "kind", "qty", "price", "times", "area", "reach", "outside", "review"] as const;
const CATEGORIES = ["Furniture", "Electronics", "Tools", "Kitchen", "Events", "Books", "Sports", "Supplies", "Other"];
const MAX_PHOTOS = 6;

function fromItem(item: Item | undefined, profile: Profile): Draft {
  const paths = item ? (item.photo_paths?.length ? item.photo_paths : item.photo_path ? [item.photo_path] : []) : [];
  return {
    photo_paths: paths,
    name: item?.name ?? "",
    category: item?.category ?? "",
    description: item?.description ?? "",
    specs: item?.specs ?? "",
    condition: item?.condition ?? "",
    accessories: item?.accessories ?? "",
    kind: (item?.kind as Draft["kind"]) ?? "return",
    quantity: item ? Number(item.quantity) : 1,
    unit: item?.unit ?? "item",
    measured: item?.measured ?? true,
    min_amount: item?.min_amount == null ? null : Number(item.min_amount),
    step_amount: item?.step_amount == null ? null : Number(item.step_amount),
    free: item ? Number(item.price_rs) === 0 : true,
    price_rs: item ? Number(item.price_rs) : 0,
    price_per: item ? Number(item.price_per) : 1,
    price_period: (item?.price_period as Draft["price_period"]) ?? "each",
    avail_days: item?.avail_days ?? [0, 1, 2, 3, 4, 5, 6],
    avail_start: item?.avail_start?.slice(0, 5) ?? "09:00",
    avail_end: item?.avail_end?.slice(0, 5) ?? "20:00",
    place: item
      ? { area_name: item.area_name, lat: item.lat, lng: item.lng }
      : profile.lat && profile.area_name
        ? { area_name: profile.area_name, lat: profile.lat, lng: profile.lng! }
        : null,
    max_distance_km: item ? Number(item.max_distance_km) : 3,
    allow_outside: item?.allow_outside ?? false,
  };
}

const num = (v: string) => (v.trim() === "" ? null : Math.max(0, Number(v)));

export function ItemWizard({ userId, profile, item }: { userId: string; profile: Profile; item?: Item }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const save = useServerFn(saveItem);
  // The draft is kept on this device, so a failed save or a lost connection never loses what was typed.
  const draftKey = `cu-item-draft:${userId}:${item ? `${item.id}:${item.updated_at}` : "new"}`;
  const [d, setD, clearDraft] = useDraft<Draft>(draftKey, fromItem(item, profile));
  const [step, setStep] = useState(item ? STEPS.length - 1 : 0);
  const [returnToReview, setReturnToReview] = useState(Boolean(item));
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(0);
  const [preview, setPreview] = useState(false);
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));
  const photos = useQuery({
    queryKey: ["own-photos", d.photo_paths.join("|")],
    queryFn: () => ownPhotoUrls(d.photo_paths),
    enabled: d.photo_paths.length > 0,
    staleTime: 30 * 60_000,
  });
  const urlOf = (p: string) => photos.data?.[p] ?? null;

  const next = () => {
    if (returnToReview) setStep(STEPS.length - 1);
    else setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };
  const goTo = (s: (typeof STEPS)[number]) => {
    setReturnToReview(true);
    setStep(STEPS.indexOf(s));
  };

  async function addPhotos(files: FileList | null) {
    const list = Array.from(files ?? []).slice(0, MAX_PHOTOS - d.photo_paths.length);
    if (list.length === 0) {
      if (files?.length) toast.error(`You can add up to ${MAX_PHOTOS} photos.`);
      return;
    }
    setUploading(list.length);
    for (const f of list) {
      try {
        const path = await uploadPhoto(userId, f, "items");
        setD((x) => ({ ...x, photo_paths: [...x.photo_paths, path].slice(0, MAX_PHOTOS) }));
      } catch (err) {
        toast.error(`${f.name}: ${(err as Error).message}`);
      } finally {
        setUploading((u) => u - 1);
      }
    }
  }

  async function submit() {
    if (!d.place) {
      toast.error("Please choose a pickup area.");
      return;
    }
    if (!ensureOnline()) return;
    setBusy(true);
    try {
      const r = await save({
        data: {
          id: item?.id ?? null,
          name: d.name,
          description: d.description,
          specs: d.specs,
          category: d.category,
          condition: d.condition,
          accessories: d.accessories,
          photo_paths: d.photo_paths,
          kind: d.kind,
          quantity: d.quantity,
          unit: d.kind === "return" ? "item" : d.unit,
          measured: d.kind === "use_up" ? d.measured : true,
          min_amount: d.kind === "use_up" ? d.min_amount : null,
          step_amount: d.kind === "use_up" ? d.step_amount : null,
          price_rs: d.free ? 0 : d.price_rs,
          price_per: d.kind === "use_up" && !d.free ? d.price_per : 1,
          price_period: d.kind === "return" && !d.free ? d.price_period : "each",
          avail_days: d.avail_days,
          avail_start: d.avail_start,
          avail_end: d.avail_end,
          area_name: d.place.area_name,
          lat: d.place.lat,
          lng: d.place.lng,
          max_distance_km: d.max_distance_km,
          allow_outside: d.allow_outside,
        },
      });
      toast.success(r.summarized ? "Saved. People nearby can now find it." : "Saved. It will show up in searches shortly.");
      clearDraft();
      await qc.invalidateQueries({ queryKey: ["my-items", userId] });
      if (item) await qc.invalidateQueries({ queryKey: ["item", item.id] });
      navigate({ to: "/my-items" });
    } catch (e) {
      toast.error(`${errMessage(e)} Your changes are kept.`);
    } finally {
      setBusy(false);
    }
  }

  const current = STEPS[step];
  const unitLabel = d.kind === "use_up" ? d.unit : d.quantity === 1 ? "item" : "items";
  const exampleQty = d.kind === "use_up" ? d.price_per * 2 : 2;
  const examplePrice = costFor(d.kind, d.price_rs, d.price_per, exampleQty, { period: d.price_period, days: 2 });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        {step > 0 && current !== "review" && (
          <button onClick={() => (returnToReview ? setStep(STEPS.length - 1) : setStep(step - 1))} className="rounded-lg p-2 hover:bg-accent" aria-label="Back">
            <ArrowLeft className="h-5 w-5" />
          </button>
        )}
        <div className="flex flex-1 gap-1" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
          {STEPS.map((_, i) => (
            <span key={i} className={cn("h-1.5 flex-1 rounded-full", i <= step ? "bg-primary" : "bg-muted")} />
          ))}
        </div>
      </div>

      <Card className="space-y-4 p-6">
        {current === "photo" && (
          <>
            <h1 className="text-2xl font-bold">Add photos of your item</h1>
            <p className="text-muted-foreground">Up to {MAX_PHOTOS}. The first one is the cover. Big photos are made smaller for phones.</p>
            {d.photo_paths.length > 0 && (
              <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                {d.photo_paths.map((p, i) => (
                  <li key={p} className="space-y-1">
                    <div className="relative">
                      <ItemThumb url={urlOf(p)} name={i === 0 ? "Cover photo" : `Photo ${i + 1}`} className="w-full" />
                      {i === 0 && <span className="absolute left-1 top-1 rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground">Cover</span>}
                    </div>
                    <div className="flex justify-center gap-1">
                      {i > 0 && (
                        <button type="button" className="rounded-lg p-2 hover:bg-accent" aria-label={`Make photo ${i + 1} the cover`} onClick={() => set({ photo_paths: [p, ...d.photo_paths.filter((x) => x !== p)] })}>
                          <Star className="h-4 w-4" />
                        </button>
                      )}
                      <button type="button" className="rounded-lg p-2 hover:bg-accent" aria-label={`Remove photo ${i + 1}`} onClick={() => set({ photo_paths: d.photo_paths.filter((x) => x !== p) })}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {d.photo_paths.length < MAX_PHOTOS && (
              <label className="flex h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border bg-card text-base font-semibold hover:bg-accent focus-within:ring-2 focus-within:ring-ring">
                <Camera className="h-5 w-5" aria-hidden /> {uploading > 0 ? `Adding ${uploading}…` : d.photo_paths.length ? "Add more photos" : "Add photos"}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/heic"
                  multiple
                  className="sr-only"
                  onChange={(e) => {
                    void addPhotos(e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>
            )}
            <Button size="lg" className="w-full" disabled={uploading > 0} onClick={next}>
              {d.photo_paths.length ? "Next" : "Skip for now"}
            </Button>
          </>
        )}

        {current === "name" && (
          <>
            <h1 className="text-2xl font-bold">What is it called?</h1>
            <Input value={d.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Folding chairs" maxLength={120} className="h-12 text-base" autoFocus aria-label="Item name" />
            <div className="space-y-1">
              <p className="font-semibold">Category</p>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((c) => (
                  <button key={c} type="button" aria-pressed={d.category === c} onClick={() => set({ category: d.category === c ? "" : c })} className={cn("rounded-full border px-3 py-1.5 text-sm", d.category === c ? "border-primary bg-accent font-semibold" : "bg-card")}>
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <Button size="lg" className="w-full" disabled={!d.name.trim()} onClick={next}>
              Next
            </Button>
          </>
        )}

        {current === "about" && (
          <>
            <h1 className="text-2xl font-bold">Tell people about it</h1>
            <Textarea value={d.description} onChange={(e) => set({ description: e.target.value })} placeholder="What is it like? English or Roman Urdu is fine." maxLength={2000} className="min-h-24 text-base" aria-label="Description" />
            <label className="block space-y-1">
              <span className="font-semibold">Important details (optional)</span>
              <Input value={d.specs} onChange={(e) => set({ specs: e.target.value })} placeholder="e.g. HDMI input, 3000 lumens / plastic, white" maxLength={1000} className="h-12 text-base" />
            </label>
            <label className="block space-y-1">
              <span className="font-semibold">Condition (optional)</span>
              <Input value={d.condition} onChange={(e) => set({ condition: e.target.value })} placeholder="e.g. Good, small scratch on one leg" maxLength={200} className="h-12 text-base" />
            </label>
            <label className="block space-y-1">
              <span className="font-semibold">Comes with (optional)</span>
              <Input value={d.accessories} onChange={(e) => set({ accessories: e.target.value })} placeholder="e.g. Power cable, remote, carry bag" maxLength={300} className="h-12 text-base" />
            </label>
            <Button size="lg" className="w-full" onClick={next}>
              Next
            </Button>
          </>
        )}

        {current === "kind" && (
          <>
            <h1 className="text-2xl font-bold">Will it come back to you?</h1>
            <div className="grid gap-3">
              <Choice active={d.kind === "return"} onClick={() => { set({ kind: "return", unit: "item" }); next(); }} title="Bring it back" sub="Chairs, projectors, tools. We track who has it and when it is due." />
              <Choice active={d.kind === "use_up"} onClick={() => { set({ kind: "use_up", unit: d.unit === "item" ? "ml" : d.unit }); next(); }} title="Use it up" sub="Glue, paint and other supplies. No return needed." />
            </div>
          </>
        )}

        {current === "qty" && (
          <>
            <h1 className="text-2xl font-bold">{d.kind === "return" ? "How many do you have?" : "How much do you have?"}</h1>
            <div className="flex gap-2">
              <Input type="number" min={0} step="any" value={d.quantity} onChange={(e) => set({ quantity: Math.max(0, Number(e.target.value)) })} className="h-12 w-32 text-base" aria-label="Amount" />
              {d.kind === "use_up" && (
                <select value={d.unit} onChange={(e) => set({ unit: e.target.value })} className="h-12 rounded-xl border bg-card px-3 text-base" aria-label="Unit">
                  {["ml", "litre", "g", "kg", "metre", "piece"].map((u) => (
                    <option key={u}>{u}</option>
                  ))}
                </select>
              )}
            </div>
            {d.kind === "use_up" && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <Choice active={d.measured} onClick={() => set({ measured: true })} title="I measured it" />
                  <Choice active={!d.measured} onClick={() => set({ measured: false })} title="It's my estimate" />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="space-y-1">
                    <span className="font-semibold">Smallest amount you share (optional)</span>
                    <Input type="number" min={0} step="any" value={d.min_amount ?? ""} onChange={(e) => set({ min_amount: num(e.target.value) || null })} placeholder={`e.g. 5 ${d.unit}`} className="h-12 text-base" />
                  </label>
                  <label className="space-y-1">
                    <span className="font-semibold">In steps of (optional)</span>
                    <Input type="number" min={0} step="any" value={d.step_amount ?? ""} onChange={(e) => set({ step_amount: num(e.target.value) || null })} placeholder={`e.g. 5 ${d.unit}`} className="h-12 text-base" />
                  </label>
                </div>
              </>
            )}
            {item && <p className="text-sm text-muted-foreground">If you lower this below what's promised in accepted bookings, we'll tell you and keep the old amount.</p>}
            <Button size="lg" className="w-full" disabled={!(d.quantity > 0)} onClick={next}>
              Next
            </Button>
          </>
        )}

        {current === "price" && (
          <>
            <h1 className="text-2xl font-bold">Is it free?</h1>
            <div className="grid grid-cols-2 gap-3">
              <Choice active={d.free} onClick={() => set({ free: true })} title="Free" />
              <Choice active={!d.free} onClick={() => set({ free: false, price_rs: d.price_rs || 10 })} title="Set a price" />
            </div>
            {!d.free && (
              <div className="space-y-3">
                {d.kind === "return" && (
                  <div className="grid grid-cols-2 gap-3">
                    <Choice active={d.price_period === "each"} onClick={() => set({ price_period: "each" })} title="Per booking" sub="One price, however long" />
                    <Choice active={d.price_period === "day"} onClick={() => set({ price_period: "day" })} title="Per day" sub="Each started day counts" />
                  </div>
                )}
                <div className="flex flex-wrap items-center gap-2 text-base">
                  Rs
                  <Input type="number" min={1} value={d.price_rs} onChange={(e) => set({ price_rs: Math.max(0, Number(e.target.value)) })} className="h-12 w-28 text-base" aria-label="Price in rupees" />
                  {d.kind === "use_up" ? (
                    <>
                      per
                      <Input type="number" min={1} step="any" value={d.price_per} onChange={(e) => set({ price_per: Math.max(0.001, Number(e.target.value)) })} className="h-12 w-24 text-base" aria-label="Amount for this price" />
                      {d.unit}
                    </>
                  ) : d.price_period === "day" ? (
                    "for each item, per day"
                  ) : (
                    "for each item"
                  )}
                </div>
                <p className="rounded-xl bg-muted p-3 text-sm">
                  Example: {exampleQty} {d.kind === "use_up" ? d.unit : "items"}
                  {d.kind === "return" && d.price_period === "day" ? " for 2 days" : ""} will cost {money(examplePrice)}. Borrowers see the full total before anyone agrees.
                </p>
              </div>
            )}
            <Button size="lg" className="w-full" onClick={next}>
              Next
            </Button>
          </>
        )}

        {current === "times" && (
          <>
            <h1 className="text-2xl font-bold">When can people pick it up?</h1>
            <div className="flex flex-wrap gap-2">
              {DAY_NAMES.map((dn, i) => {
                const on = d.avail_days.includes(i);
                return (
                  <button
                    key={dn}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set({ avail_days: on ? d.avail_days.filter((x) => x !== i) : [...d.avail_days, i].sort() })}
                    className={cn("h-12 w-14 rounded-xl border text-base font-semibold", on ? "border-primary bg-primary text-primary-foreground" : "bg-card")}
                  >
                    {dn}
                  </button>
                );
              })}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1">
                <span className="font-semibold">From</span>
                <Input type="time" value={d.avail_start} onChange={(e) => set({ avail_start: e.target.value })} className="h-12 text-base" />
              </label>
              <label className="space-y-1">
                <span className="font-semibold">{d.kind === "return" ? "Must be back by" : "Until"}</span>
                <Input type="time" value={d.avail_end} onChange={(e) => set({ avail_end: e.target.value })} className="h-12 text-base" />
              </label>
            </div>
            <Button size="lg" className="w-full" disabled={d.avail_days.length === 0 || d.avail_end <= d.avail_start} onClick={next}>
              Next
            </Button>
          </>
        )}

        {current === "area" && (
          <>
            <h1 className="text-2xl font-bold">Where is the pickup area?</h1>
            <LocationPicker value={d.place} onPick={(p) => set({ place: p })} />
            <p className="text-sm text-muted-foreground">Borrowers see only this area and a rough distance. Your exact address stays private until you choose to share it.</p>
            <Button size="lg" className="w-full" disabled={!d.place} onClick={next}>
              Next
            </Button>
          </>
        )}

        {current === "reach" && (
          <>
            <h1 className="text-2xl font-bold">How far away can a borrower be?</h1>
            <p className="text-muted-foreground">
              Measured in a straight line from the borrower's chosen area to your pickup area{d.place ? ` (${d.place.area_name})` : ""}. It's approximate — the road trip can be a little longer.
            </p>
            <DistancePicker value={d.max_distance_km} onChange={(km) => set({ max_distance_km: km })} />
            <Button size="lg" className="w-full" onClick={next}>
              Next
            </Button>
          </>
        )}

        {current === "outside" && (
          <>
            <h1 className="text-2xl font-bold">Can people outside this area send you a request?</h1>
            <p className="text-muted-foreground">They can send one short note without their name. You first decide on the distance, then on the booking. You can always say no.</p>
            <div className="grid grid-cols-2 gap-3">
              <Choice active={d.allow_outside} onClick={() => { set({ allow_outside: true }); next(); }} title="Yes" />
              <Choice active={!d.allow_outside} onClick={() => { set({ allow_outside: false }); next(); }} title="No" />
            </div>
          </>
        )}

        {current === "review" && (
          <>
            <div className="flex items-center justify-between gap-3">
              <h1 className="text-2xl font-bold">Check and save</h1>
              <Button variant="outline" size="sm" onClick={() => setPreview((v) => !v)} aria-pressed={preview}>
                <Eye /> {preview ? "Hide preview" : "Preview listing"}
              </Button>
            </div>
            {preview && (
              <div className="rounded-2xl border-2 border-dashed p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">What borrowers see</p>
                <div className="w-48">
                  <ItemThumb url={d.photo_paths[0] ? urlOf(d.photo_paths[0]) : null} name={d.name} className="w-full" />
                  <p className="mt-2 font-semibold leading-tight">{d.name || "Item name"}</p>
                  <p className="flex items-center gap-1 text-sm text-muted-foreground">
                    <MapPin className="h-3 w-3" aria-hidden /> {d.place?.area_name ?? "Your area"} · about 1 km away
                  </p>
                  <p className="text-sm text-muted-foreground">{fmtQty(d.quantity, d.kind === "use_up" ? d.unit : "item")} available</p>
                  <p className="font-semibold text-primary">{d.free ? "Free" : priceLabel(d.kind, d.price_rs, d.price_per, d.unit, d.price_period)}</p>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">Your name, exact address and photo are never shown here.</p>
              </div>
            )}
            <dl className="divide-y rounded-xl border">
              <Row label="Photos" value={d.photo_paths.length ? `${d.photo_paths.length} (first is the cover)` : "None"} onEdit={() => goTo("photo")} />
              <Row label="Name" value={d.category ? `${d.name} · ${d.category}` : d.name} onEdit={() => goTo("name")} />
              <Row label="Details" value={[d.specs, d.condition && `Condition: ${d.condition}`, d.accessories && `With: ${d.accessories}`].filter(Boolean).join(" · ") || "—"} onEdit={() => goTo("about")} />
              <Row label="Type" value={d.kind === "return" ? "Bring it back" : "Use it up"} onEdit={() => goTo("kind")} />
              <Row
                label="Amount"
                value={`${d.quantity} ${unitLabel}${d.kind === "use_up" ? ` (${d.measured ? "measured" : "estimate"}${d.min_amount ? `, from ${d.min_amount}` : ""}${d.step_amount ? `, steps of ${d.step_amount}` : ""})` : ""}`}
                onEdit={() => goTo("qty")}
              />
              <Row label="Price" value={d.free ? "Free" : priceLabel(d.kind, d.price_rs, d.price_per, d.unit, d.price_period)} onEdit={() => goTo("price")} />
              <Row
                label="Times"
                value={`${d.avail_days.length === 7 ? "Every day" : d.avail_days.map((i) => DAY_NAMES[i]).join(", ")}, ${fmtClock(d.avail_start)}–${fmtClock(d.avail_end)}`}
                onEdit={() => goTo("times")}
              />
              <Row label="Pickup area" value={d.place?.area_name ?? "—"} onEdit={() => goTo("area")} />
              <Row label="Borrowers up to" value={`${d.max_distance_km} km away (straight line)`} onEdit={() => goTo("reach")} />
              <Row label="Requests from farther" value={d.allow_outside ? "Yes" : "No"} onEdit={() => goTo("outside")} />
            </dl>
            {item && <p className="text-sm text-muted-foreground">Changes don't affect bookings that were already sent — they keep what was agreed.</p>}
            <Button size="lg" className="w-full" disabled={busy || uploading > 0 || !d.name.trim() || !d.place} onClick={submit}>
              {busy ? "Saving…" : item ? "Save changes" : "Lend this item"}
            </Button>
          </>
        )}
      </Card>
    </div>
  );
}

function Choice({ active, onClick, title, sub }: { active: boolean; onClick: () => void; title: string; sub?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn("rounded-2xl border-2 p-4 text-left transition-colors", active ? "border-primary bg-accent" : "border-border bg-card hover:bg-accent")}
    >
      <span className="block text-lg font-semibold">{title}</span>
      {sub && <span className="block text-sm text-muted-foreground">{sub}</span>}
    </button>
  );
}

function Row({ label, value, onEdit }: { label: string; value: string; onEdit: () => void }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <dt className="w-24 shrink-0 text-sm text-muted-foreground sm:w-32">{label}</dt>
      <dd className="line-clamp-3 min-w-0 flex-1 break-words">{value}</dd>
      <button type="button" onClick={onEdit} className="rounded-lg p-2 hover:bg-accent" aria-label={`Change ${label}`}>
        <Pencil className="h-4 w-4" />
      </button>
    </div>
  );
}
