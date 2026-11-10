// Areas of the first community (Multan). Coordinates are approximate area centres.
export type Area = { name: string; lat: number; lng: number };

export const CITY = "Multan";

export const MULTAN_AREAS: Area[] = [
  { name: "Gulgasht Colony", lat: 30.21, lng: 71.475 },
  { name: "Officers Colony", lat: 30.2244, lng: 71.475 },
  { name: "Bosan Road", lat: 30.235, lng: 71.482 },
  { name: "Model Town", lat: 30.1866, lng: 71.475 },
  { name: "Multan Cantt", lat: 30.185, lng: 71.438 },
  { name: "New Multan", lat: 30.205, lng: 71.43 },
  { name: "Shah Rukn-e-Alam Colony", lat: 30.166, lng: 71.488 },
  { name: "Mumtazabad", lat: 30.17, lng: 71.5 },
  { name: "Shalimar Colony", lat: 30.213, lng: 71.49 },
  { name: "Wapda Town", lat: 30.24, lng: 71.51 },
  { name: "DHA Multan", lat: 30.258, lng: 71.505 },
  { name: "Old City (Hussain Agahi)", lat: 30.198, lng: 71.472 },
];

export function kmBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = (x: number) => (x * Math.PI) / 180;
  const dLat = r(b.lat - a.lat);
  const dLng = r(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

export function nearestArea(lat: number, lng: number): Area {
  return MULTAN_AREAS.reduce((best, a) =>
    kmBetween(a, { lat, lng }) < kmBetween(best, { lat, lng }) ? a : best,
  );
}

export const DISTANCE_CHOICES = [1, 3, 5, 10];
