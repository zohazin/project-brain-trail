import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ImagePlus, Pause, Pencil, Play, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Card, Empty, ItemThumb, PageTitle, Pill, Stars } from "@/components/app/bits";
import { myItemsQuery } from "@/lib/queries";
import { fmtQty, priceLabel } from "@/lib/format";
import { ownPhotoUrl } from "@/lib/upload";

type Item = Database["public"]["Tables"]["items"]["Row"];

export const Route = createFileRoute("/_authenticated/_tabs/my-items/")({
  head: () => ({
    meta: [
      { title: "My Items — Cheez Udhaar" },
      { name: "description", content: "The things you lend to neighbours: photos, prices, stock and pause." },
      { property: "og:title", content: "My Items — Cheez Udhaar" },
      { property: "og:description", content: "The things you lend to neighbours: photos, prices, stock and pause." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(myItemsQuery(context.userId)),
  component: MyItems,
});

function MyItems() {
  const { userId } = Route.useRouteContext();
  const { data: items } = useSuspenseQuery(myItemsQuery(userId));
  const ratings = useQuery({
    queryKey: ["item-ratings", items.map((i) => i.id).join(",")],
    queryFn: async () => {
      const { data } = await supabase.rpc("item_ratings", { _ids: items.map((i) => i.id) });
      return new Map((data ?? []).map((r) => [r.item_id, r]));
    },
    enabled: items.length > 0,
  });

  return (
    <div>
      <div className="flex items-start justify-between gap-3">
        <PageTitle sub="Things you lend to people nearby.">My Items</PageTitle>
        <Button asChild size="lg">
          <Link to="/my-items/new">
            <Plus /> Add item
          </Link>
        </Button>
      </div>
      {items.length === 0 ? (
        <Empty>You haven't listed anything yet. Tap “Add item” to add your first one.</Empty>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {items.map((it) => (
            <ItemCard key={it.id} item={it} rating={ratings.data?.get(it.id)} userId={userId} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ItemCard({ item, rating, userId }: { item: Item; rating?: { avg_rating: number; rating_count: number } | undefined; userId: string }) {
  const qc = useQueryClient();
  const cover = item.photo_paths?.[0] ?? item.photo_path;
  const photo = useQuery({
    queryKey: ["own-photo", cover],
    queryFn: () => ownPhotoUrl(cover),
    enabled: Boolean(cover),
    staleTime: 30 * 60_000,
  });
  const paused = item.status === "paused";

  async function toggle() {
    const { error } = await supabase
      .from("items")
      .update({ status: paused ? "active" : "paused" })
      .eq("id", item.id);
    if (error) { toast.error(error.message); return; }
    toast.success(paused ? "People can find it again." : "Paused. Nobody can request it now.");
    qc.invalidateQueries({ queryKey: ["my-items", userId] });
  }

  return (
    <li>
      <Card className="flex gap-3">
        {cover ? (
          <ItemThumb url={photo.data} name={item.name} className="h-24 w-24 shrink-0" />
        ) : (
          <Link
            to="/my-items/$itemId"
            params={{ itemId: item.id }}
            className="flex h-24 w-24 shrink-0 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-primary/40 bg-muted text-xs font-semibold text-primary"
          >
            <ImagePlus className="h-6 w-6" aria-hidden /> Add a photo
          </Link>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-lg font-semibold leading-tight">{item.name}</h2>
            <Pill tone={paused ? "attention" : "success"}>{paused ? "Paused" : "Active"}</Pill>
          </div>
          <p className="text-sm text-muted-foreground">
            {fmtQty(Number(item.quantity), item.unit)} {item.kind === "return" ? "· Bring it back" : "left · Use it up"}
          </p>
          <p className="text-sm font-semibold text-primary">{priceLabel(item.kind, Number(item.price_rs), Number(item.price_per), item.unit, item.price_period, Number(item.quantity))}</p>
          <Stars avg={rating?.avg_rating} count={rating?.rating_count} />
          <div className="mt-2 flex gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/my-items/$itemId" params={{ itemId: item.id }}>
                <Pencil /> Edit
              </Link>
            </Button>
            <Button variant="outline" size="sm" onClick={toggle}>
              {paused ? <Play /> : <Pause />} {paused ? "Resume" : "Pause"}
            </Button>
          </div>
        </div>
      </Card>
    </li>
  );
}
