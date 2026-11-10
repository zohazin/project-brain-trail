import { createFileRoute, Link, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search, Package, ListChecks, MessageCircle, UserRound, ShieldCheck } from "lucide-react";
import { Logo } from "@/components/app/Logo";
import { NotificationBell, OfflineBanner } from "@/components/app/AppBars";
import { activityQuery, profileQuery, rolesQuery, unreadQuery } from "@/lib/queries";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/_tabs")({
  beforeLoad: async ({ context }) => {
    const profile = await context.queryClient.ensureQueryData(profileQuery(context.userId));
    if (!profile.onboarded) throw redirect({ to: "/welcome" });
  },
  component: TabsLayout,
});

const TABS = [
  { to: "/find", label: "Find", icon: Search },
  { to: "/my-items", label: "My Items", icon: Package },
  { to: "/activity", label: "Activity", icon: ListChecks },
  { to: "/inbox", label: "Inbox", icon: MessageCircle },
] as const;

function TabsLayout() {
  const { userId } = Route.useRouteContext();
  const { data: roles } = useQuery(rolesQuery(userId));
  const { data: act } = useQuery(activityQuery(userId));
  const { data: unread } = useQuery(unreadQuery(userId));
  const { data: me } = useQuery(profileQuery(userId));
  const isAdmin = (roles ?? []).some((r) => r.role === "area_admin");
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const wide = pathname === "/find";
  const unreadChats = Array.from(unread?.values() ?? []).reduce((s, n) => s + n, 0);

  const needsMe =
    (act?.requests ?? []).filter((r) => r.owner_id === userId && r.status === "requested").length +
    (act?.requests ?? []).filter(
      (r) => r.owner_id === userId && r.status === "confirmed" && (Number(r.borrower_picked_qty) > Number(r.picked_up_qty) || Number(r.borrower_returned_qty) > Number(r.returned_qty)),
    ).length +
    (act?.wants ?? []).filter((w) => w.pending_plan && (w.pending_plan as { lines?: unknown[] }).lines?.length).length;
  const badge = (to: string) => (to === "/activity" ? needsMe : to === "/inbox" ? unreadChats : 0);

  return (
    <div className="min-h-screen bg-background md:flex">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded-xl focus:bg-card focus:p-3">
        Skip to content
      </a>
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r bg-sidebar p-4 md:flex">
        <Link to="/find" className="px-2 py-2">
          <Logo />
        </Link>
        {me?.is_demo && (
          <p className="mx-2 mt-2 rounded-lg bg-attention-soft px-2 py-1 text-xs font-semibold text-attention-foreground">
            Demo account — made-up people and items only
          </p>
        )}
        <nav className="mt-6 flex flex-1 flex-col gap-1" aria-label="Main">
          {TABS.map((t) => (
            <Link
              key={t.to}
              to={t.to}
              className="flex h-12 items-center gap-3 rounded-xl px-3 text-base font-semibold text-sidebar-foreground hover:bg-sidebar-accent"
              activeProps={{ className: "bg-sidebar-accent text-primary" }}
            >
              <t.icon className="h-5 w-5" aria-hidden />
              {t.label}
              {badge(t.to) > 0 && <Badge n={badge(t.to)} />}
            </Link>
          ))}
          <NotificationBell userId={userId} withLabel className="h-12 px-3 text-base text-sidebar-foreground hover:bg-sidebar-accent" />
          {isAdmin && (
            <Link
              to="/admin"
              className="flex h-12 items-center gap-3 rounded-xl px-3 text-base font-semibold hover:bg-sidebar-accent"
              activeProps={{ className: "bg-sidebar-accent text-primary" }}
            >
              <ShieldCheck className="h-5 w-5" aria-hidden /> Area cases
            </Link>
          )}
        </nav>
        <Link
          to="/profile"
          className="flex h-12 items-center gap-3 rounded-xl px-3 text-base font-semibold hover:bg-sidebar-accent"
          activeProps={{ className: "bg-sidebar-accent text-primary" }}
        >
          <UserRound className="h-5 w-5" aria-hidden /> My profile
        </Link>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <OfflineBanner />
        {/* Mobile header */}
        <header className="sticky top-0 z-20 flex items-center justify-between border-b bg-background/95 px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur md:hidden">
          <Link to="/find" className="flex min-w-0 items-center gap-2">
            <Logo />
            {me?.is_demo && <DemoTag />}
          </Link>
          <div className="flex items-center gap-1">
            {isAdmin && (
              <Link to="/admin" className="rounded-xl p-3 hover:bg-accent" aria-label="Area cases">
                <ShieldCheck className="h-6 w-6" />
              </Link>
            )}
            <NotificationBell userId={userId} />
            <Link to="/profile" className="flex items-center gap-1.5 rounded-xl border px-3 py-2 font-semibold hover:bg-accent" aria-label="Profile and settings">
              <UserRound className="h-5 w-5" aria-hidden /> <span className="text-sm max-[359px]:sr-only">Profile</span>
            </Link>
          </div>
        </header>

        <main
          id="main"
          className={cn(
            "mx-auto w-full flex-1",
            wide ? "max-w-5xl" : "max-w-3xl",
            "px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-5 md:px-8 md:pb-10 md:pt-8",
          )}
        >
          <Outlet />
        </main>

        {/* Mobile bottom bar */}
        <nav
          className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
          aria-label="Main"
        >
          {TABS.map((t) => (
            <Link
              key={t.to}
              to={t.to}
              className={cn("relative flex h-16 flex-col items-center justify-center gap-1 text-xs font-semibold text-muted-foreground")}
              activeProps={{ className: "text-primary" }}
            >
              <t.icon className="h-6 w-6" aria-hidden />
              {t.label}
              {badge(t.to) > 0 && (
                <span className="absolute right-[22%] top-2">
                  <Badge n={badge(t.to)} />
                </span>
              )}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}

function DemoTag() {
  return <span className="rounded-md bg-attention-soft px-1.5 py-0.5 text-xs font-bold text-attention-foreground">Demo</span>;
}

function Badge({ n }: { n: number }) {
  return (
    <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-attention px-1.5 text-xs font-bold text-foreground">
      {n}
    </span>
  );
}
