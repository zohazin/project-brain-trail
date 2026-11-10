import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ItemWizard } from "@/components/app/ItemWizard";
import { profileQuery } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/_tabs/my-items/new")({
  head: () => ({
    meta: [
      { title: "Lend an item — Cheez Udhaar" },
      { name: "description", content: "List something neighbours can borrow or use up." },
      { property: "og:title", content: "Lend an item — Cheez Udhaar" },
      { property: "og:description", content: "List something neighbours can borrow or use up." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(profileQuery(context.userId)),
  component: NewItem,
});

function NewItem() {
  const { userId } = Route.useRouteContext();
  const { data: profile } = useSuspenseQuery(profileQuery(userId));
  return (
    <div className="space-y-3">
      <Link to="/my-items" className="text-sm font-semibold text-primary">
        ← My Items
      </Link>
      <ItemWizard userId={userId} profile={profile} />
    </div>
  );
}
