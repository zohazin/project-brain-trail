import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";

// ---------- connection ----------
function subscribeOnline(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

/** True while the browser says it's online. On the server it is always true. */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

/**
 * Sending requests, answering bookings, stock changes, messages and handovers need a connection.
 * Returns false (and tells the person) when offline, so nothing is half-saved.
 */
export function ensureOnline(): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    toast.error("You're offline. Your text is kept — try again when you're connected.");
    return false;
  }
  return true;
}

// ---------- drafts kept on this device ----------
function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

/**
 * Like useState, but the value is saved on this device under `key`, so typed text survives
 * a failed send, going offline, a reload or going back and forth between screens.
 */
export function useDraft<T>(key: string, initial: T): [T, (v: T | ((p: T) => T)) => void, () => void] {
  const [value, setValue] = useState<T>(() => read(key, initial));
  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage full or blocked: keep it in memory */
    }
  }, [key, value]);
  const clear = useCallback(() => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
    setValue(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return [value, setValue, clear];
}
