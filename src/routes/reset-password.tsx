import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/app/Logo";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Set a new password — Cheez Udhaar" },
      { name: "description", content: "Choose a new password for your Cheez Udhaar account." },
      { property: "og:title", content: "Set a new password — Cheez Udhaar" },
      { property: "og:description", content: "Choose a new password for your account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const isRecovery = window.location.hash.includes("type=recovery");
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    supabase.auth.getSession().then(({ data: s }) => {
      if (s.session || isRecovery) setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) { toast.error("Please use at least 8 characters."); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Your password is changed.");
    navigate({ to: "/find" });
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-md px-5 py-8">
        <Logo />
        <form onSubmit={onSubmit} className="mt-8 space-y-4 rounded-2xl bg-card p-6 shadow-card">
          <h1 className="text-2xl font-bold">Set a new password</h1>
          {!ready && <p className="text-muted-foreground">Open this page from the link in your email.</p>}
          <div className="space-y-1.5">
            <Label htmlFor="pw" className="text-base">
              New password
            </Label>
            <Input id="pw" type="password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} className="h-12 text-base" autoComplete="new-password" />
          </div>
          <Button type="submit" size="lg" className="w-full" disabled={busy || !ready}>
            Save new password
          </Button>
        </form>
      </div>
    </main>
  );
}
