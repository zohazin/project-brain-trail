// Trial mode: the banner, entering a private trial from a real account, leaving it, and the AI demo lender in a chat.
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Bot, FlaskConical, Loader2, LogOut, RotateCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { demoLenderReply, startTrial } from "@/lib/app.functions";
import { errMessage } from "@/lib/queries";
import { ensureOnline } from "@/hooks/use-app";
import { REPLY_FAILED, REPLY_MAX_AGE_MS, TRIAL_BANNER } from "@/lib/demo-chat";

/** The member's own session, kept on this device while they try the trial (cleared by sign-out like every cu- key). */
const REAL_KEY = "cu-real-session";

function hasRealSession(): boolean {
  try {
    return Boolean(window.localStorage.getItem(REAL_KEY));
  } catch {
    return false;
  }
}

/** Compact banner shown on every page to demo and trial accounts. */
export function TrialBanner({ className }: { className?: string }) {
  const [canLeave, setCanLeave] = useState(false);
  useEffect(() => setCanLeave(hasRealSession()), []);
  return (
    <div className={["flex flex-wrap items-center gap-x-2 gap-y-1 bg-attention-soft px-3 py-1.5 text-xs font-semibold text-attention-foreground", className].filter(Boolean).join(" ")} role="note">
      <FlaskConical className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{TRIAL_BANNER}</span>
      {canLeave && <LeaveTrial compact />}
    </div>
  );
}

/** For a real member: opens a separate trial account with sample items and AI lenders. Real records are never touched. */
export function TryTrialButton({ className, variant = "default" }: { className?: string; variant?: "default" | "outline" }) {
  const fn = useServerFn(startTrial);
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  async function go() {
    if (busy || !ensureOnline()) return;
    setBusy(true);
    try {
      const { data } = await supabase.auth.getSession();
      const s = data.session;
      const creds = await fn();
      if (s) window.localStorage.setItem(REAL_KEY, JSON.stringify({ access_token: s.access_token, refresh_token: s.refresh_token }));
      // No sign-out here: that would end the member's own session, which "Leave trial" brings back.
      const { error } = await supabase.auth.signInWithPassword(creds);
      if (error) throw new Error("Couldn't open your trial. Please try again.");
      toast.success("Trial mode is on. Ask for anything — sample items and AI lenders fill in.");
      navigate({ to: "/find" });
    } catch (e) {
      window.localStorage.removeItem(REAL_KEY);
      toast.error(errMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Button className={className} variant={variant} disabled={busy} onClick={() => void go()}>
      {busy ? <Loader2 className="animate-spin" aria-hidden /> : <FlaskConical />} {busy ? "Opening trial…" : "Try with sample items"}
    </Button>
  );
}

/** Back to the member's own account (or the sign-in page if that session can't be restored). */
export function LeaveTrial({ compact }: { compact?: boolean }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  async function leave() {
    if (busy) return;
    setBusy(true);
    let saved: { access_token: string; refresh_token: string } | null = null;
    try {
      saved = JSON.parse(window.localStorage.getItem(REAL_KEY) ?? "null");
    } catch {
      saved = null;
    }
    window.localStorage.removeItem(REAL_KEY);
    qc.clear();
    const back = saved ? await supabase.auth.setSession(saved) : null;
    setBusy(false);
    if (!back || back.error || !back.data.session) {
      await supabase.auth.signOut({ scope: "local" });
      toast.message("Trial closed. Please sign in to your own account.");
      navigate({ to: "/auth", search: { mode: "signin" } });
      return;
    }
    toast.success("Back to your own account.");
    navigate({ to: "/find" });
  }
  return compact ? (
    <button type="button" className="ml-auto inline-flex items-center gap-1 underline" disabled={busy} onClick={() => void leave()}>
      <LogOut className="h-3.5 w-3.5" aria-hidden /> {busy ? "Leaving…" : "Leave trial"}
    </button>
  ) : (
    <Button variant="outline" disabled={busy} onClick={() => void leave()}>
      <LogOut /> {busy ? "Leaving…" : "Leave trial and go back to my account"}
    </Button>
  );
}

type ReplyRow = { message_id: string; status: string; reply_id: string | null; wants_change: boolean; error: string | null; updated_at: string };
type Msg = { id: string; sender_id: string | null; client_id: string | null; created_at: string };

/**
 * The AI demo lender in the normal booking chat. Only messages the borrower just sent (or an explicit "Try again")
 * ask for a reply; the server keeps one reply per message, so repeated taps or reconnects never make two.
 */
export function useDemoLender({ requestId, enabled, messages, borrowerId, lastId }: { requestId: string; enabled: boolean; messages: Msg[]; borrowerId: string; lastId: string | undefined }) {
  const fn = useServerFn(demoLenderReply);
  const qc = useQueryClient();
  const [waiting, setWaiting] = useState<Record<string, true>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const inFlight = useRef(new Set<string>());
  const rows = useQuery({
    queryKey: ["demo-replies", requestId, lastId],
    enabled,
    queryFn: async () => {
      const { data } = await supabase.from("demo_replies").select("message_id, status, reply_id, wants_change, error, updated_at").eq("request_id", requestId);
      return (data ?? []) as ReplyRow[];
    },
  });
  const byMessage = new Map((rows.data ?? []).map((r) => [r.message_id, r]));

  async function ask(clientId: string, retry = false) {
    if (!enabled || inFlight.current.has(clientId)) return;
    inFlight.current.add(clientId);
    setWaiting((w) => ({ ...w, [clientId]: true }));
    setErrors((e) => {
      const { [clientId]: _drop, ...rest } = e;
      return rest;
    });
    try {
      // Bounded: the reply normally takes a few seconds; after 45 s the person gets "Try again" (no automatic resend).
      for (let i = 0; i < 12; i++) {
        const out = await Promise.race([
          fn({ data: { requestId, clientId, ...(retry && i === 0 ? { retry: true } : {}) } }),
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error(REPLY_FAILED)), 45_000)),
        ]);
        if (out.ok) break;
        if ("pending" in out && out.pending) {
          await new Promise((r) => setTimeout(r, 4000));
          if (i === 11) setErrors((e) => ({ ...e, [clientId]: REPLY_FAILED }));
          continue;
        }
        if ("off" in out) break;
        if ("aiError" in out) setErrors((e) => ({ ...e, [clientId]: out.aiError || REPLY_FAILED }));
        break;
      }
    } catch (e) {
      console.error("[trial] reply request failed", errMessage(e));
      setErrors((x) => ({ ...x, [clientId]: REPLY_FAILED }));
    } finally {
      inFlight.current.delete(clientId);
      setWaiting((w) => {
        const { [clientId]: _drop, ...rest } = w;
        return rest;
      });
      await qc.invalidateQueries({ queryKey: ["request", requestId] });
      await qc.invalidateQueries({ queryKey: ["demo-replies", requestId] });
    }
  }

  /** The newest borrower message with no reply attempt yet (e.g. the connection dropped right after sending). */
  const last = [...messages].reverse().find((m) => m.sender_id !== null);
  const orphan =
    enabled && last && last.sender_id === borrowerId && last.client_id && !byMessage.has(last.id) && !waiting[last.client_id] && Date.now() - new Date(last.created_at).getTime() < REPLY_MAX_AGE_MS
      ? last
      : null;

  function statusFor(m: Msg): { typing: boolean; error: string | null; retry: (() => void) | null } | null {
    if (!enabled || m.sender_id !== borrowerId || !m.client_id) return null;
    const row = byMessage.get(m.id);
    const cid = m.client_id;
    if (waiting[cid] || (row?.status === "running" && Date.now() - new Date(row.updated_at).getTime() < 60_000)) return { typing: true, error: null, retry: null };
    const err = errors[cid] ?? (row?.status === "failed" || row?.status === "running" ? row.error || REPLY_FAILED : null);
    if (err) return { typing: false, error: err.startsWith(REPLY_FAILED) ? err : REPLY_FAILED, retry: () => void ask(cid, true) };
    if (orphan && orphan.id === m.id) return { typing: false, error: null, retry: () => void ask(cid, true) };
    return null;
  }
  const wantsChange = new Set((rows.data ?? []).filter((r) => r.wants_change && r.reply_id).map((r) => r.reply_id!));
  return { ask, statusFor, wantsChange };
}

/** Under a borrower message: typing indicator, or the failure line with Try again. */
export function LenderStatus({ s, name }: { s: NonNullable<ReturnType<ReturnType<typeof useDemoLender>["statusFor"]>>; name: string }) {
  if (s.typing) {
    return (
      <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground" aria-live="polite">
        <Bot className="h-3.5 w-3.5" aria-hidden /> {name} is typing<span className="animate-pulse">…</span>
      </p>
    );
  }
  if (s.error) {
    return (
      <p className="mt-1 flex flex-wrap items-center justify-end gap-2 text-xs font-semibold text-attention-foreground">
        {s.error}
        {s.retry && (
          <button type="button" className="inline-flex items-center gap-1 underline" onClick={s.retry}>
            <RotateCw className="h-3 w-3" aria-hidden /> Try again
          </button>
        )}
      </p>
    );
  }
  return s.retry ? (
    <p className="mt-1 text-xs">
      <button type="button" className="inline-flex items-center gap-1 font-semibold underline" onClick={s.retry}>
        <Bot className="h-3 w-3" aria-hidden /> Get {name}'s reply
      </button>
    </p>
  ) : null;
}
