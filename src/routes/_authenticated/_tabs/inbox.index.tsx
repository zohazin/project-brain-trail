import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { ChevronRight, MessageCircle } from "lucide-react";
import { Card, Empty, PageTitle, Pill, statusTone } from "@/components/app/bits";
import { activityQuery, unreadQuery } from "@/lib/queries";
import { fmtQty, fmtShort } from "@/lib/format";
import { SimulatedOwnerLabel } from "@/components/app/DemoResults";

export const Route = createFileRoute("/_authenticated/_tabs/inbox/")({
  head: () => ({
    meta: [
      { title: "Inbox — Cheez Udhaar" },
      { name: "description", content: "Your confirmed bookings and private chats." },
      { property: "og:title", content: "Inbox — Cheez Udhaar" },
      { property: "og:description", content: "Your confirmed bookings and private chats." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(activityQuery(context.userId)),
  component: Inbox,
});

function Inbox() {
  const { userId } = Route.useRouteContext();
  const { data } = useSuspenseQuery(activityQuery(userId));
  const { data: unread } = useQuery(unreadQuery(userId));
  const chats = data.requests
    .filter((r) => r.status === "confirmed" || r.status === "completed")
    .sort((a, b) => (unread?.get(b.id) ?? 0) - (unread?.get(a.id) ?? 0));

  return (
    <div>
      <PageTitle sub="A private chat opens when an owner says yes.">Inbox</PageTitle>
      {chats.length === 0 && <Empty>No chats yet.</Empty>}
      <ul className="space-y-2">
        {chats.map((r) => {
          const iAmOwner = r.owner_id === userId;
          const other = iAmOwner ? (r.borrower_name ?? "Borrower") : r.owner_name;
          return (
            <li key={r.id}>
              <Link to="/inbox/$requestId" params={{ requestId: r.id }} {...(r.simulated && !iAmOwner ? { hash: "chat" } : {})} className="block">
                <Card className="flex items-center gap-3">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary text-lg font-bold text-secondary-foreground">
                    {other.charAt(0)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{other}</p>
                    {r.simulated && !iAmOwner && (
                      <p className="mt-0.5">
                        <SimulatedOwnerLabel />
                      </p>
                    )}
                    <p className="truncate text-sm text-muted-foreground">
                      {iAmOwner ? "Lending" : "Borrowing"} {fmtQty(Number(r.quantity), r.unit)} {r.item_name.toLowerCase()} · {fmtShort(r.pickup_at)}
                    </p>
                  </div>
                  {(unread?.get(r.id) ?? 0) > 0 && (
                    <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-attention px-2 text-sm font-bold text-foreground" aria-label={`${unread?.get(r.id)} unread`}>
                      {unread?.get(r.id)}
                    </span>
                  )}
                  <Pill tone={statusTone(r.status)}>{r.status === "completed" ? "Done" : "Active"}</Pill>
                  <MessageCircle className="sr-only" aria-hidden />
                  <ChevronRight className="h-5 w-5 text-muted-foreground" aria-hidden />
                </Card>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
