import { useState } from "react";
import { Check, Crosshair, MapPin, MapPinned } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MapPinPicker } from "@/components/app/MapPinPicker";
import { CITY, MULTAN_AREAS, kmBetween, nearestArea } from "@/lib/areas";
import { cn } from "@/lib/utils";

export type PickedPlace = { area_name: string; lat: number; lng: number };

const CITY_CENTRE = { lat: 30.2, lng: 71.475 };

function accuracyWords(m: number): string {
  if (m <= 100) return `Your phone says this is accurate to about ${Math.round(m)} m.`;
  if (m <= 1500) return `Your phone says this is accurate to about ${(m / 1000).toFixed(1)} km.`;
  return `This is only a rough guess (about ${Math.round(m / 1000)} km). Please check the area or drop a pin.`;
}

export function LocationPicker({ value, onPick }: { value: PickedPlace | null; onPick: (p: PickedPlace) => void }) {
  const [mode, setMode] = useState<"none" | "list" | "map">("none");
  const [status, setStatus] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [locating, setLocating] = useState(false);
  const [found, setFound] = useState<(PickedPlace & { accuracy: number }) | null>(null);

  // Location is asked for only after the person taps "Use my location".
  function useMine() {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setStatus("Location is not available on this device. Please choose your area or drop a pin on the map.");
      setMode("list");
      return;
    }
    setLocating(true);
    setFound(null);
    setStatus("Finding you… this can take a few seconds.");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        const { latitude, longitude, accuracy } = pos.coords;
        const area = nearestArea(latitude, longitude);
        if (kmBetween(area, { lat: latitude, lng: longitude }) > 30) {
          setStatus(`You seem to be outside ${CITY}. We are starting in ${CITY} only — please choose your area.`);
          setMode("list");
          return;
        }
        setStatus(null);
        setMode("none");
        // Ask the person to confirm before using it.
        setFound({ area_name: area.name, lat: latitude, lng: longitude, accuracy });
      },
      (err) => {
        setLocating(false);
        setStatus(
          err.code === err.PERMISSION_DENIED
            ? "Location permission was not given. That's fine — choose your area below or drop a pin on the map."
            : err.code === err.TIMEOUT
              ? "Finding your location took too long. Try again outside or near a window, or choose your area below."
              : "Your location isn't available right now. Please choose your area below or drop a pin on the map.",
        );
        setMode("list");
      },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 5 * 60_000 },
    );
  }

  const areas = MULTAN_AREAS.filter((a) => a.name.toLowerCase().includes(filter.toLowerCase()));
  const start = value ?? CITY_CENTRE;

  return (
    <div className="space-y-4">
      <p className="text-lg">We use your area to find things near you.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Button type="button" size="lg" onClick={useMine} disabled={locating} aria-busy={locating}>
          <Crosshair className={locating ? "animate-spin" : undefined} /> {locating ? "Finding you…" : "Use my location"}
        </Button>
        <Button type="button" size="lg" variant={mode === "list" ? "secondary" : "outline"} onClick={() => setMode("list")}>
          <MapPin /> Choose my area
        </Button>
        <Button type="button" size="lg" variant={mode === "map" ? "secondary" : "outline"} onClick={() => setMode("map")}>
          <MapPinned /> Drop a pin
        </Button>
      </div>
      {status && (
        <p className="rounded-xl bg-attention-soft p-3 text-attention-foreground" role="status">
          {status}
        </p>
      )}
      {found && (
        <div className="space-y-2 rounded-xl border-2 border-primary bg-card p-3" role="status">
          <p>
            It looks like you're in <strong>{found.area_name}</strong>, {CITY}. Is that right?
          </p>
          <p className="text-sm text-muted-foreground">{accuracyWords(found.accuracy)} Others only ever see your area, never the exact spot.</p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => {
                onPick({ area_name: found.area_name, lat: found.lat, lng: found.lng });
                setFound(null);
              }}
            >
              <Check /> Yes, use {found.area_name}
            </Button>
            <Button type="button" variant="outline" onClick={() => { setFound(null); setMode("list"); }}>
              No, choose another
            </Button>
          </div>
        </div>
      )}
      {value && !found && (
        <p className="rounded-xl bg-success-soft p-3">
          Your area: <strong>{value.area_name}</strong>, {CITY}
        </p>
      )}
      {mode === "map" && (
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">Tap the map or drag the pin. We only show your area to others, never the exact spot.</p>
          <MapPinPicker
            lat={start.lat}
            lng={start.lng}
            onPick={(lat, lng) => {
              const area = nearestArea(lat, lng);
              if (kmBetween(area, { lat, lng }) > 30) {
                setStatus(`That pin is outside ${CITY}. We are starting in ${CITY} only.`);
                return;
              }
              setStatus(null);
              onPick({ area_name: area.name, lat, lng });
            }}
          />
        </div>
      )}
      {mode === "list" && (
        <div className="space-y-2">
          <Input placeholder="Type to search areas" value={filter} onChange={(e) => setFilter(e.target.value)} className="h-12 text-base" aria-label="Search areas" />
          <ul className="grid max-h-72 gap-2 overflow-y-auto sm:grid-cols-2">
            {areas.map((a) => (
              <li key={a.name}>
                <button
                  type="button"
                  onClick={() => {
                    onPick({ area_name: a.name, lat: a.lat, lng: a.lng });
                    setMode("none");
                    setStatus(null);
                  }}
                  className={cn("w-full rounded-xl border px-4 py-3 text-left text-base transition-colors hover:bg-accent", value?.area_name === a.name && "border-primary bg-accent")}
                >
                  {a.name}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
