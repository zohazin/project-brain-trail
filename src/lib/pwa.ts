// The only place that registers the offline service worker. Browser-only; call from an effect.
import { toast } from "sonner";

const SW_URL = "/sw.js";
const PREVIEW_LABEL = /^(?:id-preview|preview)(?:-[a-z0-9]+)?--.+$/;
const PROJECT_ID = "36845aad-bdca-4fb8-b5e6-ed9a15d4575c";

/** True where a service worker must never run: dev, the editor preview, iframes, or ?sw=off. */
export function swBlocked(loc: { hostname: string; search: string }, opts: { prod: boolean; inIframe: boolean }): boolean {
  const host = loc.hostname.toLowerCase();
  const label = host.split(".")[0] ?? "";
  const onLovableHost = [".lovable.app", ".gpt-eng.com", ".gptengineer.run"].some((d) => host.endsWith(d));
  if (!opts.prod || opts.inIframe) return true;
  if (onLovableHost && PREVIEW_LABEL.test(label)) return true;
  if (onLovableHost && label === `project--${PROJECT_ID}-dev`) return true;
  if (host === "lovableproject.com" || host.endsWith(".lovableproject.com")) return true;
  if (host === "lovableproject-dev.com" || host.endsWith(".lovableproject-dev.com")) return true;
  if (host === "beta.lovable.dev" || host.endsWith(".beta.lovable.dev")) return true;
  if (new URLSearchParams(loc.search).get("sw") === "off") return true;
  return false;
}

async function unregisterOurs() {
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.all(
    regs.filter((r) => (r.active ?? r.waiting ?? r.installing)?.scriptURL.endsWith(SW_URL)).map((r) => r.unregister()),
  );
}

let started = false;

export async function registerAppSW() {
  if (started || typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  started = true;
  let inIframe = true;
  try {
    inIframe = window.self !== window.top;
  } catch {
    inIframe = true;
  }
  if (swBlocked(window.location, { prod: import.meta.env.PROD, inIframe })) {
    await unregisterOurs().catch(() => undefined);
    return;
  }
  const hadController = Boolean(navigator.serviceWorker.controller);
  // A new version took over: offer a reload. Drafts are saved on the device, so nothing typed is lost.
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController) return;
    toast("A new version of Cheez Udhaar is ready.", {
      duration: Infinity,
      action: { label: "Reload", onClick: () => window.location.reload() },
    });
  });
  try {
    const reg = await navigator.serviceWorker.register(SW_URL, { scope: "/" });
    // Check for updates when the app comes back to the screen, so an old version is never kept for long.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") reg.update().catch(() => undefined);
    });
  } catch (e) {
    console.warn("[pwa] service worker not registered", e);
  }
}

// ---------- "Install app" prompt ----------
type BIPEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
let deferred: BIPEvent | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BIPEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    try {
      localStorage.setItem("cu-installed", "1");
    } catch {
      /* ignore */
    }
    emit();
  });
}

export function subscribeInstall(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
export const canPromptInstall = () => deferred !== null;

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  const ev = deferred;
  deferred = null;
  emit();
  await ev.prompt();
  const choice = await ev.userChoice;
  return choice.outcome === "accepted";
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
}

export function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}
