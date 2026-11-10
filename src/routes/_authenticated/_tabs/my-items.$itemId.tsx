import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { ItemWizard } from "@/components/app/ItemWizard";
import { itemQuery, profileQuery } from "@/lib/queries";

export const Route = createFileRoute("/_authenticated/_tabs/my-items/$itemId")({
  head: () => ({
    meta: [
      { title: "Edit item — Cheez Udhaar" },
      { name: "description", content: "Change photos, price, stock or availability for one of your listings." },
      { property: "og:title", content: "Edit item — Cheez Udhaar" },
      { property: "og:description", content: "Change photos, price, stock or availability for one of your listings." },
    ],
  }),
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(profileQuery(context.userId)),
      context.queryClient.ensureQueryData(itemQuery(params.itemId)),
    ]);
  },
  component: EditItem,
});

function EditItem() {
  const { userId } = Route.useRouteContext();
  const { itemId } = Route.useParams();
  const { data: profile } = useSuspenseQuery(profileQuery(userId));
  const { data: item } = useSuspenseQuery(itemQuery(itemId));
  return (
    <div className="space-y-3">
      <Link to="/my-items" className="text-sm font-semibold text-primary">
        ← My Items
      </Link>
      <ItemWizard key={item.id} userId={userId} profile={profile} item={item} />
    </div>
  );
}
