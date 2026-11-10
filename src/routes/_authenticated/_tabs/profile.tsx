import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Camera, IdCard, LogOut, RotateCcw } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { resetDemo } from "@/lib/app.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, PageTitle, Pill } from "@/components/app/bits";
import { LocationPicker, type PickedPlace } from "@/components/app/LocationPicker";
import { DistancePicker } from "@/components/app/DistancePicker";
import { InstallSection } from "@/components/app/InstallApp";
import { DemoGuide, ShayariDemoSetup } from "@/components/app/DemoAccounts";
import { blocksQuery, impactQuery, profileQuery } from "@/lib/queries";
import { ownPhotoUrl, uploadPhoto } from "@/lib/upload";

export const Route = createFileRoute("/_authenticated/_tabs/profile")({
  head: () => ({
    meta: [
      { title: "My profile — Cheez Udhaar" },
      { name: "description", content: "Your name, area, usual distance, blocked people and demo tools." },
      { property: "og:title", content: "My profile — Cheez Udhaar" },
      { property: "og:description", content: "Your name, area, usual distance, blocked people and demo tools." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(profileQuery(context.userId)),
  component: Profile,
});

function Profile() {
  const { userId, email } = Route.useRouteContext();
  const { data: p } = useSuspenseQuery(profileQuery(userId));
  const qc = useQueryClient();
  const navigate = useNavigate();
  const reset = useServerFn(resetDemo);
  const [name, setName] = useState(p.display_name);
  const [place, setPlace] = useState<PickedPlace | null>(p.lat && p.area_name ? { area_name: p.area_name, lat: p.lat, lng: p.lng! } : null);
  const [km, setKm] = useState(Number(p.travel_km));
  const [avatar, setAvatar] = useState(p.avatar_path);
  const [busy, setBusy] = useState(false);
  const photo = useQuery({ queryKey: ["own-photo", avatar], queryFn: () => ownPhotoUrl(avatar), enabled: Boolean(avatar) });
  const blocks = useQuery(blocksQuery(userId));
  const authUser = useQuery({
    queryKey: ["auth-user", userId],
    queryFn: async () => (await supabase.auth.getUser()).data.user,
    staleTime: 60_000,
  });

  async function save() {
    setBusy(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: name.trim() || p.display_name,
        avatar_path: avatar,
        area_name: place?.area_name ?? p.area_name,
        lat: place?.lat ?? p.lat,
        lng: place?.lng ?? p.lng,
        travel_km: km,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Saved.");
    qc.invalidateQueries({ queryKey: ["profile", userId] });
    qc.invalidateQueries({ queryKey: ["nearby"] });
  }

  return (
    <div className="space-y-5">
      <PageTitle sub={email}>My profile</PageTitle>
      {p.restricted && (
        <Card tone="attention">
          <p className="font-semibold">Your account is paused after a review by your area admin.</p>
          <p>You can still return items and chat. Check your bookings to appeal.</p>
        </Card>
      )}
      <Card className="space-y-2">
        <h2 className="text-lg font-bold">Your status</h2>
        <p className="flex flex-wrap items-center gap-2">
          Email: <Pill tone={authUser.data?.email_confirmed_at ? "success" : "attention"}>{authUser.data?.email_confirmed_at ? "Confirmed" : authUser.isPending ? "Checking…" : "Not confirmed yet"}</Pill>
        </p>
        <p className="flex flex-wrap items-center gap-2">
          Identity:{" "}
          <Pill tone={p.identity_status === "verified" ? "success" : "muted"}>
            {p.identity_status === "verified" ? "Checked" : p.identity_status === "test_number" ? "Test number only — not checked" : "Not added"}
          </Pill>
        </p>
        <p className="text-sm text-muted-foreground">These are separate. Confirming your email does not check who you are.</p>
      </Card>
      <Card className="space-y-4">
        <div className="flex items-center gap-4">
          {photo.data ? (
            <img src={photo.data} alt="Your profile" className="h-20 w-20 rounded-full object-cover" />
          ) : (
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-secondary text-3xl font-bold">{name.charAt(0)}</span>
          )}
          <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-xl border px-4 font-semibold hover:bg-accent">
            <Camera className="h-5 w-5" aria-hidden /> {avatar ? "Change photo" : "Add photo"}
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                try {
                  setAvatar(await uploadPhoto(userId, f, "profile"));
                } catch (err) {
                  toast.error((err as Error).message);
                }
              }}
            />
          </label>
        </div>
        <label className="block space-y-1">
          <span className="font-semibold">Name</span>
          <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className="h-12 text-base" />
        </label>
        <div className="flex items-center gap-2 rounded-xl bg-attention-soft p-3 text-attention-foreground">
          <IdCard className="h-5 w-5" aria-hidden /> Test identity number: <span className="font-mono">{p.test_cnic ?? "00000-0000000-0"}</span>
        </div>
      </Card>
      <Card className="space-y-3">
        <h2 className="text-lg font-bold">Your area</h2>
        <LocationPicker value={place} onPick={setPlace} />
      </Card>
      <Card className="space-y-3">
        <h2 className="text-lg font-bold">How far can you go to pick it up?</h2>
        <p className="text-sm text-muted-foreground">Your usual distance. You can pick a different one for each search.</p>
        <DistancePicker value={km} onChange={setKm} />
      </Card>
      <Button size="lg" className="w-full" disabled={busy} onClick={save}>
        {busy ? "Saving…" : "Save"}
      </Button>
      {(blocks.data?.length ?? 0) > 0 && (
        <Card className="space-y-2">
          <h2 className="text-lg font-bold">People you blocked</h2>
          <ul className="divide-y">
            {blocks.data!.map((b) => (
              <li key={b.blocked_id} className="flex items-center justify-between gap-3 py-2">
                <span>{b.label || "Someone"}</span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    const { error } = await supabase.from("blocks").delete().eq("blocker_id", userId).eq("blocked_id", b.blocked_id);
                    if (error) { toast.error(error.message); return; }
                    toast.success("Unblocked.");
                    await qc.invalidateQueries({ queryKey: ["blocks", userId] });
                  }}
                >
                  Unblock
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Card className="space-y-2">
        <h2 className="text-lg font-bold">Install the app</h2>
        <InstallSection />
      </Card>
      <Impact demo={p.is_demo} />
      {p.is_demo && (
        <Card tone="attention" className="space-y-2">
          <p className="font-semibold">Demo account</p>
          <p className="text-sm">Demo accounts only see demo people and demo items. Real members never see them.</p>
          <DemoGuide />
          <p className="text-sm">
            Reset removes the old demo requests, chats and reminders, puts the chairs, glue and paint back, and leaves every real member's records alone.
          </p>
          <Button
            variant="outline"
            onClick={async () => {
              if (
                !window.confirm(
                  "Reset the demo?\n\nThis removes requests, chats, reports, notifications and test listings made between demo accounts, and puts the demo items and stock back.\n\nReal members' accounts, listings, photos and bookings are not touched.",
                )
              )
                return;
              try {
                await reset();
                await qc.invalidateQueries();
                toast.success("Demo data is reset.");
              } catch (e) {
                toast.error((e as Error).message);
              }
            }}
          >
            <RotateCcw /> Reset demo data
          </Button>
          <ShayariDemoSetup />
        </Card>
      )}
      <Button
        variant="outline"
        size="lg"
        className="w-full"
        onClick={async () => {
          await supabase.auth.signOut();
          navigate({ to: "/" });
        }}
      >
        <LogOut /> Sign out
      </Button>
    </div>
  );
}

/** Counts from real completed bookings only. No money savings shown: there is no comparison price to base them on. */
function Impact({ demo }: { demo: boolean }) {
  const { data, isPending } = useQuery(impactQuery());
  return (
    <Card className="space-y-2">
      <h2 className="text-lg font-bold">Community so far</h2>
      {isPending ? (
        <p className="text-muted-foreground">Counting…</p>
      ) : !data || data.completed === 0 ? (
        <p className="text-muted-foreground">No finished bookings yet{demo ? " in the demo" : ""}.</p>
      ) : (
        <dl className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
          <ImpactStat label="Bookings finished" value={data.completed} />
          <ImpactStat label="Reusable items collected" value={Number(data.reusable_collected)} />
          <ImpactStat label="Items returned" value={Number(data.items_returned)} />
          <ImpactStat label="Neighbours who borrowed" value={data.borrowers} />
        </dl>
      )}
      <p className="text-xs text-muted-foreground">
        Based on finished bookings {demo ? "between demo accounts" : "between real members"}. We don't show money saved because we have no shop prices to compare with.
      </p>
    </Card>
  );
}

function ImpactStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col-reverse rounded-xl bg-muted p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-2xl font-bold">{value}</dd>
    </div>
  );
}
