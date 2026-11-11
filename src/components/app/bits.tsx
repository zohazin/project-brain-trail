import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, ImageIcon, Package, RotateCw, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { ILLUSTRATIVE_LABEL, type SamplePhoto } from "@/lib/sample-photos";

/** Small "Illustrative photo" tag: shown on every stock photo used for a trial/demo listing without its own photo. */
export function IllustrativeTag({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5 text-xs font-semibold text-muted-foreground", className)}>
      <ImageIcon className="h-3 w-3" aria-hidden /> {ILLUSTRATIVE_LABEL}
    </span>
  );
}

/**
 * Item picture. Order: the owner's own photo → an illustrative stock photo (trial/demo only, always labelled) → plain placeholder.
 * Every image is lazy-loaded, square-cropped for phones, and falls back to the placeholder if it fails to load.
 */
export function ItemThumb({
  url,
  name,
  className,
  emptyText,
  sample,
  tag = "overlay",
}: {
  url: string | null | undefined;
  name: string;
  className?: string;
  emptyText?: string | undefined;
  sample?: SamplePhoto | null | undefined;
  /** "overlay": label on the photo; "none": the caller shows <IllustrativeTag /> itself (small thumbnails). */
  tag?: "overlay" | "none";
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const realUrl = url && failed !== url ? url : null;
  const sampleUrl = !url && sample && failed !== sample.url ? sample.url : null;
  if (realUrl) {
    return (
      <img
        src={realUrl}
        alt={name}
        width={640}
        height={640}
        className={cn("aspect-square rounded-xl bg-secondary object-cover", className)}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(realUrl)}
      />
    );
  }
  if (sampleUrl && sample) {
    return (
      <div className={cn("relative aspect-square overflow-hidden rounded-xl bg-secondary", className)}>
        <img
          src={sampleUrl}
          alt={`${ILLUSTRATIVE_LABEL} of ${sample.subject}${name ? ` for “${name}”` : ""}`}
          width={640}
          height={640}
          className="h-full w-full object-cover"
          loading="lazy"
          decoding="async"
          onError={() => setFailed(sampleUrl)}
        />
        {tag === "overlay" && <IllustrativeTag className="absolute bottom-1.5 left-1.5 bg-card/90 px-1.5 text-[11px] shadow-sm" />}
      </div>
    );
  }
  const text = (url || sample) && !emptyText ? "Photo unavailable" : emptyText;
  if (text) {
    return (
      <div className={cn("flex aspect-square flex-col items-center justify-center gap-1 rounded-xl bg-secondary p-1 text-center text-secondary-foreground", className)}>
        <Package className="h-1/3 w-1/3 opacity-60" aria-hidden />
        <span className="text-[11px] font-semibold leading-tight [overflow-wrap:anywhere]">{text}</span>
      </div>
    );
  }
  return (
    <div className={cn("flex aspect-square items-center justify-center rounded-xl bg-secondary text-secondary-foreground", className)} aria-hidden>
      <Package className="h-1/2 w-1/2 opacity-60" />
    </div>
  );
}

export function Stars({ avg, count }: { avg: number | null | undefined; count: number | null | undefined }) {
  if (!count) return <span className="text-sm text-muted-foreground">No reviews yet</span>;
  return (
    <span className="inline-flex items-center gap-1 text-sm">
      <Star className="h-4 w-4 fill-attention text-attention" aria-hidden />
      <strong>{Number(avg).toFixed(1)}</strong>
      <span className="text-muted-foreground">({count} {count === 1 ? "review" : "reviews"})</span>
    </span>
  );
}

export function PageTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="mb-5">
      <h1 className="text-3xl font-bold">{children}</h1>
      {sub && <p className="mt-1 text-muted-foreground">{sub}</p>}
    </div>
  );
}

export function Card({ children, className, tone, id }: { children: ReactNode; className?: string; tone?: "attention" | "success" | undefined; id?: string }) {
  return (
    <div
      id={id}
      className={cn(
        "rounded-2xl bg-card p-4 shadow-card",
        tone === "attention" && "border-2 border-attention bg-attention-soft",
        tone === "success" && "border border-success bg-success-soft",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function AiNotice({
  message,
  onRetry,
  retrying,
  retryAfter,
  next,
}: {
  message: string;
  onRetry?: () => void;
  retrying?: boolean;
  /** Seconds the helper asked us to wait; the Try again button stays off until then (no automatic retries). */
  retryAfter?: number | null | undefined;
  /** What the person can still do without the helper. */
  next?: ReactNode;
}) {
  const [wait, setWait] = useState(retryAfter ?? 0);
  useEffect(() => {
    setWait(retryAfter ?? 0);
    if (!retryAfter) return;
    const t = setInterval(() => setWait((w) => (w <= 1 ? (clearInterval(t), 0) : w - 1)), 1000);
    return () => clearInterval(t);
  }, [retryAfter, message]);
  return (
    <div className="flex gap-3 rounded-2xl border-2 border-attention bg-attention-soft p-4 text-attention-foreground" role="alert">
      <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
      <div className="flex-1 space-y-1">
        <p className="font-semibold">{message}</p>
        <p className="text-sm">Your text is saved and nothing was guessed for you.</p>
        {next && <div className="text-sm">{next}</div>}
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            disabled={retrying || wait > 0}
            className="mt-2 inline-flex h-11 items-center gap-2 rounded-xl border border-attention bg-card px-4 font-semibold text-foreground hover:bg-accent disabled:opacity-60"
          >
            <RotateCw className={cn("h-4 w-4", retrying && "animate-spin")} aria-hidden />{" "}
            {retrying ? "Trying again…" : wait > 0 ? `Try again in ${wait}s` : "Try again"}
          </button>
        )}
      </div>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border border-dashed p-6 text-center text-muted-foreground">{children}</div>;
}

export function Pill({ children, tone = "muted" }: { children: ReactNode; tone?: "muted" | "attention" | "success" | "primary" | "danger" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-semibold",
        tone === "muted" && "bg-muted text-muted-foreground",
        tone === "attention" && "bg-attention text-foreground",
        tone === "success" && "bg-success-soft text-success",
        tone === "primary" && "bg-secondary text-secondary-foreground",
        tone === "danger" && "bg-destructive/10 text-destructive",
      )}
    >
      {children}
    </span>
  );
}

type StatusReq = {
  status: string;
  owner_name: string;
  borrower_name?: string | null;
  kind?: string;
  picked_up_qty?: number | string;
  returned_qty?: number | string;
  quantity?: number | string;
  is_exception?: boolean;
  exception_status?: string | null;
};

/** Status in plain words, from the viewer's side. */
export function requestStatusWords(r: StatusReq, viewerIsOwner: boolean) {
  const other = viewerIsOwner ? r.borrower_name || "the borrower" : r.owner_name;
  const picked = Number(r.picked_up_qty ?? 0);
  const back = Number(r.returned_qty ?? 0);
  switch (r.status) {
    case "requested":
      if (r.is_exception && r.exception_status === "pending") return viewerIsOwner ? "Asks for a distance exception" : "Waiting for the owner (distance)";
      return viewerIsOwner ? "Waiting for your answer" : "Waiting for the owner";
    case "confirmed":
      if (picked === 0) return viewerIsOwner ? "Accepted · not collected yet" : "Ready to collect";
      if (r.kind === "return" && picked > back) return "Some items are still due";
      return "In progress";
    case "declined":
      return viewerIsOwner ? "You said no" : `${other} said no`;
    case "cancelled":
      return "Cancelled";
    case "expired":
      return "Expired — no answer in time";
    case "completed":
      return "Done";
    default:
      return r.status;
  }
}

export function statusTone(status: string): "muted" | "attention" | "success" | "primary" | "danger" {
  if (status === "requested") return "attention";
  if (status === "confirmed") return "primary";
  if (status === "completed") return "success";
  if (status === "declined") return "danger";
  return "muted";
}
