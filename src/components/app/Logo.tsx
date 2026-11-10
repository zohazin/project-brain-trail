export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <svg viewBox="0 0 40 40" className="h-9 w-9" aria-hidden>
        <rect width="40" height="40" rx="11" className="fill-primary" />
        <path
          d="M11 22c3-6 7-6 9-3s6 3 9-3"
          className="stroke-primary-foreground"
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
        />
        <circle cx="12" cy="27" r="2.5" className="fill-attention" />
        <circle cx="28" cy="13" r="2.5" className="fill-attention" />
      </svg>
      {!compact && (
        <span className="font-display text-xl font-bold tracking-tight">
          Cheez <span className="text-primary">Udhaar</span>
        </span>
      )}
    </div>
  );
}
