import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Camera, IdCard } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Logo } from "@/components/app/Logo";
import { LocationPicker, type PickedPlace } from "@/components/app/LocationPicker";
import { DistancePicker } from "@/components/app/DistancePicker";
import { profileQuery } from "@/lib/queries";
import { uploadPhoto } from "@/lib/upload";

const TEST_CNIC = "00000-0000000-0";

export const Route = createFileRoute("/_authenticated/welcome")({
  head: () => ({
    meta: [
      { title: "Welcome — Cheez Udhaar" },
      { name: "description", content: "Set up your name, area and how far you can go to pick things up." },
      { property: "og:title", content: "Welcome — Cheez Udhaar" },
      { property: "og:description", content: "Set up your name, area and how far you can go to pick things up." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(profileQuery(context.userId)),
  component: Welcome,
});

function Welcome() {
  const { userId } = Route.useRouteContext();
  const { data: profile } = useSuspenseQuery(profileQuery(userId));
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(profile.display_name);
  const [avatar, setAvatar] = useState<string | null>(profile.avatar_path);
  const [place, setPlace] = useState<PickedPlace | null>(
    profile.lat && profile.area_name ? { area_name: profile.area_name, lat: profile.lat, lng: profile.lng! } : null,
  );
  const [km, setKm] = useState(Number(profile.travel_km) || 3);
  const [busy, setBusy] = useState(false);

  async function finish() {
    if (!place) return;
    setBusy(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        display_name: name.trim() || profile.display_name,
        test_cnic: TEST_CNIC,
        avatar_path: avatar,
        area_name: place.area_name,
        lat: place.lat,
        lng: place.lng,
        travel_km: km,
        onboarded: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    await qc.invalidateQueries({ queryKey: ["profile", userId] });
    navigate({ to: "/find" });
  }

  const steps = [
    <section key="name" className="space-y-4">
      <h1 className="text-2xl font-bold">What should we call you?</h1>
      <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} className="h-12 text-base" aria-label="Your name" />
      <Button size="lg" className="w-full" disabled={!name.trim()} onClick={() => setStep(1)}>
        Next
      </Button>
    </section>,
    <section key="cnic" className="space-y-4">
      <h1 className="text-2xl font-bold">Identity card number</h1>
      <div className="rounded-2xl border-2 border-dashed border-attention bg-attention-soft p-4">
        <div className="flex items-center gap-2 font-semibold text-attention-foreground">
          <IdCard className="h-5 w-5" aria-hidden /> Test number for this trial
        </div>
        <p className="mt-2 font-mono text-2xl tracking-wider">{TEST_CNIC}</p>
        <p className="mt-2 text-sm text-attention-foreground">
          This is not a real CNIC. Please do not enter your real identity card number during this test.
        </p>
      </div>
      <Button size="lg" className="w-full" onClick={() => setStep(2)}>
        Use the test number
      </Button>
    </section>,
    <section key="photo" className="space-y-4">
      <h1 className="text-2xl font-bold">Add a profile photo?</h1>
      <p className="text-muted-foreground">Your photo stays private. You choose who sees it, one booking at a time.</p>
      {avatar && <p className="rounded-xl bg-success-soft p-3">Photo added.</p>}
      <label className="flex h-12 cursor-pointer items-center justify-center gap-2 rounded-xl border bg-card text-base font-semibold hover:bg-accent">
        <Camera className="h-5 w-5" aria-hidden /> {avatar ? "Choose another photo" : "Add photo"}
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
      <Button size="lg" className="w-full" onClick={() => setStep(3)}>
        {avatar ? "Next" : "Skip for now"}
      </Button>
    </section>,
    <section key="loc" className="space-y-4">
      <h1 className="text-2xl font-bold">Where are you?</h1>
      <LocationPicker value={place} onPick={setPlace} />
      <Button size="lg" className="w-full" disabled={!place} onClick={() => setStep(4)}>
        Next
      </Button>
    </section>,
    <section key="km" className="space-y-4">
      <h1 className="text-2xl font-bold">How far can you go to pick it up?</h1>
      <DistancePicker value={km} onChange={setKm} />
      <p className="text-sm text-muted-foreground">You can change this for any search.</p>
      <Button size="lg" className="w-full" disabled={busy} onClick={finish}>
        {busy ? "Saving…" : "Start finding things"}
      </Button>
    </section>,
  ];

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-md px-5 py-8">
        <Logo />
        <div className="mt-6 flex items-center gap-3">
          {step > 0 && (
            <button onClick={() => setStep(step - 1)} className="rounded-lg p-2 hover:bg-accent" aria-label="Back">
              <ArrowLeft className="h-5 w-5" />
            </button>
          )}
          <div className="flex flex-1 gap-1.5" aria-label={`Step ${step + 1} of ${steps.length}`}>
            {steps.map((_, i) => (
              <span key={i} className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-primary" : "bg-muted"}`} />
            ))}
          </div>
        </div>
        <div className="mt-6 rounded-2xl bg-card p-6 shadow-card">{steps[step]}</div>
      </div>
    </main>
  );
}
