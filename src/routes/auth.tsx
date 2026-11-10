import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { ArrowLeft, MailCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Logo } from "@/components/app/Logo";
import { DemoAccounts } from "@/components/app/DemoAccounts";

type Mode = "signin" | "signup" | "code" | "forgot" | "forgot-sent";

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>): { mode?: "signin" | "signup" | undefined } => {
    const m = s["mode"];
    return m === "signin" || m === "signup" ? { mode: m } : {};
  },
  head: () => ({
    meta: [
      { title: "Sign in or create an account — Cheez Udhaar" },
      { name: "description", content: "Create your Cheez Udhaar account or sign in to borrow and lend nearby." },
      { property: "og:title", content: "Sign in — Cheez Udhaar" },
      { property: "og:description", content: "Create your account or sign in to borrow and lend nearby." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>(search.mode === "signin" ? "signin" : "signup");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/find" });
    });
  }, [navigate]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function onSignUp(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) { toast.error("Please use at least 8 characters for your password."); return; }
    setBusy(true);
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { emailRedirectTo: window.location.origin + "/find", data: { display_name: name.trim() } },
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    if (data.session) { navigate({ to: "/welcome" }); return; }
    setMode("code");
    setCooldown(60);
  }

  async function onResend() {
    setBusy(true);
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin + "/find" },
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("We sent a new email.");
    setCooldown(60);
  }

  async function onSignIn(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) {
      if (/confirm/i.test(error.message)) {
        setMode("code");
        toast.error("Please confirm your email first. Tap the link we emailed you.");
        return;
      }
      { toast.error("Email or password is not right."); return; }
    }
    navigate({ to: "/find" });
  }

  async function onForgot(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin + "/reset-password",
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setMode("forgot-sent");
  }

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-md px-5 py-8">
        <div className="flex items-center justify-between">
          <Link to="/" aria-label="Home">
            <Logo />
          </Link>
        </div>

        <div className="mt-8 rounded-2xl bg-card p-6 shadow-card">
          {mode === "signup" && (
            <form onSubmit={onSignUp} className="space-y-4">
              <h1 className="text-2xl font-bold">Create your account</h1>
              <p className="text-muted-foreground">New here? Sign up with your email. We'll send you a link to confirm it.</p>
              <Field label="Your name" id="name">
                <Input id="name" required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} className="h-12 text-base" autoComplete="name" />
              </Field>
              <Field label="Email" id="email">
                <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-12 text-base" autoComplete="email" />
              </Field>
              <Field label="Password (at least 8 characters)" id="password">
                <Input id="password" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className="h-12 text-base" autoComplete="new-password" />
              </Field>
              <Button type="submit" className="w-full" size="lg" disabled={busy}>
                {busy ? "Please wait…" : "Create account"}
              </Button>
              <p className="text-center text-sm">
                Already have an account?{" "}
                <button type="button" className="font-semibold text-primary underline" onClick={() => setMode("signin")}>
                  Sign in
                </button>
              </p>
            </form>
          )}

          {mode === "code" && (
            <div className="space-y-4">
              <MailCheck className="h-10 w-10 text-primary" aria-hidden />
              <h1 className="text-2xl font-bold">Check your email</h1>
              <p className="text-muted-foreground">
                We sent a message to <strong className="text-foreground">{email}</strong>. Open it and tap{" "}
                <strong className="text-foreground">“verify your email”</strong>. That confirms your account and signs you in.
              </p>
              <p className="text-sm text-muted-foreground">Can't find it? Look in your spam folder.</p>
              <Button type="button" variant="outline" className="w-full" disabled={busy || cooldown > 0} onClick={onResend}>
                {cooldown > 0 ? `Send again in ${cooldown}s` : "Send the email again"}
              </Button>
              <Button type="button" className="w-full" onClick={() => setMode("signin")}>
                I confirmed — sign in
              </Button>
              <button type="button" className="flex items-center gap-1 text-sm text-muted-foreground" onClick={() => setMode("signup")}>
                <ArrowLeft className="h-4 w-4" /> Change email
              </button>
            </div>
          )}

          {mode === "signin" && (
            <form onSubmit={onSignIn} className="space-y-4">
              <h1 className="text-2xl font-bold">Welcome back</h1>
              <Field label="Email" id="email">
                <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-12 text-base" autoComplete="email" />
              </Field>
              <Field label="Password" id="password">
                <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="h-12 text-base" autoComplete="current-password" />
              </Field>
              <Button type="submit" className="w-full" size="lg" disabled={busy}>
                {busy ? "Please wait…" : "Sign in"}
              </Button>
              <div className="flex justify-between text-sm">
                <button type="button" className="font-semibold text-primary underline" onClick={() => setMode("forgot")}>
                  Forgot password?
                </button>
                <button type="button" className="font-semibold text-primary underline" onClick={() => setMode("signup")}>
                  Create account
                </button>
              </div>
            </form>
          )}

          {mode === "forgot" && (
            <form onSubmit={onForgot} className="space-y-4">
              <h1 className="text-2xl font-bold">Reset your password</h1>
              <p className="text-muted-foreground">We will email you a link to set a new password.</p>
              <Field label="Email" id="email">
                <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-12 text-base" />
              </Field>
              <Button type="submit" className="w-full" size="lg" disabled={busy}>
                Send reset link
              </Button>
              <button type="button" className="flex items-center gap-1 text-sm text-muted-foreground" onClick={() => setMode("signin")}>
                <ArrowLeft className="h-4 w-4" /> Back to sign in
              </button>
            </form>
          )}

          {mode === "forgot-sent" && (
            <div className="space-y-4">
              <MailCheck className="h-10 w-10 text-primary" aria-hidden />
              <h1 className="text-2xl font-bold">Check your email</h1>
              <p className="text-muted-foreground">If an account exists for {email}, a reset link is on its way.</p>
              <Button variant="outline" className="w-full" onClick={() => setMode("signin")}>
                Back to sign in
              </Button>
            </div>
          )}
        </div>

        <div className="mt-8">
          <DemoAccounts />
        </div>
      </div>
    </main>
  );
}

function Field({ label, id, children }: { label: string; id: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-base">
        {label}
      </Label>
      {children}
    </div>
  );
}
