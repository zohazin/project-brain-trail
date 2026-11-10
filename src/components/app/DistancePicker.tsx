import { useState } from "react";
import { Input } from "@/components/ui/input";
import { DISTANCE_CHOICES } from "@/lib/areas";
import { cn } from "@/lib/utils";

export function DistancePicker({
  value,
  onChange,
  choices = DISTANCE_CHOICES,
}: {
  value: number;
  onChange: (km: number) => void;
  choices?: number[];
}) {
  const isOther = !choices.includes(value);
  const [other, setOther] = useState(isOther);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2" role="radiogroup">
        {choices.map((km) => (
          <button
            key={km}
            type="button"
            role="radio"
            aria-checked={!other && value === km}
            onClick={() => {
              setOther(false);
              onChange(km);
            }}
            className={cn(
              "h-12 min-w-20 rounded-xl border px-4 text-base font-semibold transition-colors",
              !other && value === km ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-accent",
            )}
          >
            {km} km
          </button>
        ))}
        <button
          type="button"
          role="radio"
          aria-checked={other}
          onClick={() => setOther(true)}
          className={cn(
            "h-12 rounded-xl border px-4 text-base font-semibold transition-colors",
            other ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-accent",
          )}
        >
          Other
        </button>
      </div>
      {other && (
        <label className="flex items-center gap-2 text-base">
          <Input
            type="number"
            min={0.5}
            max={100}
            step={0.5}
            value={value}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (n > 0 && n <= 100) onChange(n);
            }}
            className="h-12 w-28 text-base"
            aria-label="Distance in km"
          />
          km
        </label>
      )}
    </div>
  );
}
