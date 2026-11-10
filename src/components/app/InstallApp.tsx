import { useEffect, useState, useSyncExternalStore } from "react";
import { Download, Share, SquarePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/app/bits";
import { canPromptInstall, isIos, isStandalone, promptInstall, subscribeInstall } from "@/lib/pwa";

const DISMISS_KEY = "cu-install-dismissed";

function useInstallState() {
  const can = useSyncExternalStore(subscribeInstall, canPromptInstall, () => false);
  const [env, setEnv] = useState({ standalone: false, ios: false, dismissed: true });
  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = Boolean(localStorage.getItem(DISMISS_KEY)) || Boolean(localStorage.getItem("cu-installed"));
    } catch {
      /* ignore */
    }
    setEnv({ standalone: isStandalone(), ios: isIos(), dismissed });
  }, []);
  return { can, ...env, dismiss: () => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
    setEnv((e) => ({ ...e, dismissed: true }));
  } };
}

/** Short "Install app" card. Shown once until dismissed; never inside the installed app. */
export function InstallBanner() {
  const s = useInstallState();
  if (s.standalone || s.dismissed || (!s.can && !s.ios)) return null;
  return (
    <Card className="flex items-start gap-3">
      <Download className="mt-1 h-5 w-5 shrink-0 text-primary" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">Install Cheez Udhaar on your phone</p>
        {s.can ? (
          <p className="text-sm text-muted-foreground">Opens like an app from your home screen.</p>
        ) : (
          <IosSteps />
        )}
        {s.can && (
          <Button className="mt-2" size="sm" onClick={() => void promptInstall().then((ok) => ok && s.dismiss())}>
            <Download /> Install app
          </Button>
        )}
      </div>
      <button type="button" onClick={s.dismiss} className="rounded-lg p-2 hover:bg-accent" aria-label="Not now">
        <X className="h-4 w-4" />
      </button>
    </Card>
  );
}

/** Always-available version for the profile page. */
export function InstallSection() {
  const s = useInstallState();
  if (s.standalone) return <p className="text-sm text-muted-foreground">You're using the installed app.</p>;
  if (s.can)
    return (
      <Button variant="outline" onClick={() => void promptInstall()}>
        <Download /> Install app
      </Button>
    );
  if (s.ios) return <IosSteps />;
  return <p className="text-sm text-muted-foreground">Open this page in Chrome on Android or Safari on iPhone to add it to your home screen.</p>;
}

function IosSteps() {
  return (
    <ol className="mt-1 space-y-1 text-sm text-muted-foreground">
      <li className="flex items-center gap-1">
        1. In Safari, tap <Share className="h-4 w-4" aria-label="Share" /> Share.
      </li>
      <li className="flex items-center gap-1">
        2. Tap <SquarePlus className="h-4 w-4" aria-hidden /> “Add to Home Screen”.
      </li>
      <li>3. Tap “Add”.</li>
    </ol>
  );
}
