import { useEffect, useRef } from "react";

type Props = {
  lat: number;
  lng: number;
  onPick: (lat: number, lng: number) => void;
};

/**
 * Tap the map to drop a pin. Leaflet is loaded only in the browser after the component mounts,
 * so nothing here runs during server rendering.
 */
export function MapPinPicker({ lat, lng, onPick }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const pickRef = useRef(onPick);
  pickRef.current = onPick;

  useEffect(() => {
    let cancelled = false;
    let cleanup = () => {};
    (async () => {
      const L = (await import("leaflet")).default;
      await import("leaflet/dist/leaflet.css");
      if (cancelled || !box.current) return;
      const map = L.map(box.current, { zoomControl: true, attributionControl: true }).setView([lat, lng], 13);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "© OpenStreetMap",
      }).addTo(map);
      const icon = L.divIcon({
        className: "",
        html: '<div style="width:22px;height:22px;border-radius:9999px;background:var(--color-primary);border:3px solid var(--color-card);box-shadow:0 2px 6px rgba(0,0,0,.35)"></div>',
        iconSize: [22, 22],
        iconAnchor: [11, 11],
      });
      const marker = L.marker([lat, lng], { icon, draggable: true }).addTo(map);
      marker.on("dragend", () => {
        const p = marker.getLatLng();
        pickRef.current(p.lat, p.lng);
      });
      map.on("click", (e: { latlng: { lat: number; lng: number } }) => {
        marker.setLatLng(e.latlng);
        pickRef.current(e.latlng.lat, e.latlng.lng);
      });
      cleanup = () => map.remove();
    })();
    return () => {
      cancelled = true;
      cleanup();
    };
    // The map is created once; later pin moves come from the map itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={box} className="h-72 w-full overflow-hidden rounded-xl border" role="application" aria-label="Map. Tap to drop a pin." />;
}
