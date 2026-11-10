import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { Bell, CheckCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Card, Empty, PageTitle } from "@/components/app/bits";
import { notificationsQuery } from "@/lib/queries";
import { fmtShort } from "@/lib/format";
import { cn } from "@/lib/utils";

type Note = Database["public"]["Tables"]["notifications"]["Row"];

export const Route = createFileRoute("/_authenticated/_tabs/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications — Cheez Udhaar" },
      { name: "description", content: "Requests, answers, reminders and late items in one place." },
      { property: "og:title", content: "Notifications — Cheez Udhaar" },
      { property: "og:description", content: "Requests, answers, reminders and late items in one place." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(notificationsQuery(context.userId)),
  component: Notifications,
});

function Notifications() {
  const { userId } = Route.useRouteContext();
  const { data } = useSuspenseQuery(notificationsQuery(userId));
  const qc = useQueryClient();
  const navigate = useNavigate();
  const unread = data.filter((n) => !n.read_at);

  async function open(n: Note) {
    if (!n.read_at) {
      await supabase.rpc("mark_notifications_read", { _ids: [n.id] });
      void qc.invalidateQueries({ queryKey: ["notifications", userId] });
    }
    if (n.kind === "request") navigate({ to: "/activity" });
    else if (n.want_id && n.kind !== "message") navigate({ to: "/need/$wantId", params: { wantId: n.want_id } });
    else if (n.request_id) navigate({ to: "/inbox/$requestId", params: { requestId: n.request_id } });
    else navigate({ to: "/activity" });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageTitle sub="Requests, answers, reminders and messages.">Notifications</PageTitle>
        {unread.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              await supabase.rpc("mark_notifications_read", { _ids: null as unknown as string[] });
              await qc.invalidateQueries({ queryKey: ["notifications", userId] });
            }}
          >
            <CheckCheck /> Mark all read
          </Button>
        )}
      </div>
      {data.length === 0 && <Empty>Nothing yet. When someone answers or sends you a request, it shows up here.</Empty>}
      <ul className="space-y-2">
        {data.map((n) => (
          <li key={n.id}>
            <button type="button" onClick={() => void open(n)} className="block w-full text-left">
              <Card tone={!n.read_at && (n.kind === "overdue" || n.kind === "confirm" || n.kind === "request" || n.kind === "replacement") ? "attention" : undefined} className="flex items-start gap-3">
                <Bell className={cn("mt-1 h-5 w-5 shrink-0", n.read_at ? "text-muted-foreground" : "text-primary")} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className={cn("font-semibold", n.read_at && "font-normal")}>
                    {n.title}
                    {!n.read_at && <span className="sr-only"> (new)</span>}
                  </p>
                  <p className="text-sm text-muted-foreground">{n.body}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{fmtShort(n.created_at)}</p>
                </div>
                {!n.read_at && <span className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-attention" aria-hidden />}
              </Card>
            </button>
          </li>
        ))}
      </ul>
      <p className="text-sm text-muted-foreground">
        These appear inside the app. Phone lock-screen alerts are not set up yet.
      </p>
    </div>
  );
}
