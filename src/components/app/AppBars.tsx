import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bell, WifiOff } from "lucide-react";
import { useOnline } from "@/hooks/use-app";
import { notificationsQuery } from "@/lib/queries";
import { cn } from "@/lib/utils";

/** Shown at the top of every main screen while there is no connection. */
export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div role="status" className="sticky top-0 z-40 flex items-center justify-center gap-2 bg-attention px-4 py-2 text-center text-sm font-semibold text-foreground">
      <WifiOff className="h-4 w-4 shrink-0" aria-hidden />
      You're offline. You can keep typing — sending, answering and handovers wait until you're back online.
    </div>
  );
}

export function NotificationBell({ userId, className, withLabel }: { userId: string; className?: string; withLabel?: boolean }) {
  const { data } = useQuery(notificationsQuery(userId));
  const unread = (data ?? []).filter((n) => !n.read_at).length;
  return (
    <Link
      to="/notifications"
      className={cn("relative flex items-center gap-3 rounded-xl p-3 font-semibold hover:bg-accent", className)}
      activeProps={{ className: "bg-sidebar-accent text-primary" }}
      aria-label={unread ? `Notifications, ${unread} new` : "Notifications"}
    >
      <Bell className="h-6 w-6 md:h-5 md:w-5" aria-hidden />
      {withLabel && <span>Notifications</span>}
      {unread > 0 && (
        <span
          className={cn(
            "inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-attention px-1.5 text-xs font-bold text-foreground",
            withLabel ? "ml-auto" : "absolute right-1 top-1",
          )}
        >
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </Link>
  );
}
