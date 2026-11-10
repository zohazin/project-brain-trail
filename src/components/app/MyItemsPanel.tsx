import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ImagePlus, Plus } from "lucide-react";
import type { Database } from "@/integrations/supabase/types";
import { Button } from "@/components/ui/button";
import { Card, ItemThumb } from "@/components/app/bits";
import { myItemsQuery } from "@/lib/queries";
import { fmtQty } from "@/lib/format";
import { ownPhotoUrl } from "@/lib/upload";

type Item = Database["public"]["Tables"]["items"]["Row"];

/** Small desktop panel next to search: photos of the things I lend. */
export function MyItemsPanel({ userId }: { userId: string }) {
  const items = useQuery(myItemsQuery(userId));
  const list = items.data ?? [];
  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-bold">My items</h2>
        <Link to="/my-items" className="text-sm font-semibold text-primary underline">
          See all
        </Link>
      </div>
      <Button asChild className="w-full">
        <Link to="/my-items/new">
          <Plus /> Add item
        </Link>
      </Button>
      {items.isPending && <p className="text-sm text-muted-foreground">Loading…</p>}
      {items.data && list.length === 0 && <p className="text-sm text-muted-foreground">You haven't listed anything yet. Neighbours can borrow what you add.</p>}
      <ul className="grid grid-cols-3 gap-2">
        {list.slice(0, 9).map((it) => (
          <PanelThumb key={it.id} item={it} />
        ))}
      </ul>
    </Card>
  );
}

function PanelThumb({ item }: { item: Item }) {
  const cover = item.photo_paths?.[0] ?? item.photo_path;
  const photo = useQuery({
    queryKey: ["own-photo", cover],
    queryFn: () => ownPhotoUrl(cover),
    enabled: Boolean(cover),
    staleTime: 30 * 60_000,
  });
  return (
    <li>
      <Link to="/my-items/$itemId" params={{ itemId: item.id }} className="block" title={item.name}>
        {cover ? (
          <ItemThumb url={photo.data} name={item.name} className={item.status === "paused" ? "w-full opacity-50" : "w-full"} />
        ) : (
          <span className="flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-primary/40 bg-muted text-center text-[11px] font-semibold text-primary">
            <ImagePlus className="h-5 w-5" aria-hidden /> Add a photo
          </span>
        )}
        <span className="mt-1 block truncate text-xs font-semibold">{item.name}</span>
        <span className="block text-xs text-muted-foreground">
          {item.status === "paused" ? "Paused" : `${fmtQty(Number(item.quantity), item.unit)} listed`}
        </span>
      </Link>
    </li>
  );
}
