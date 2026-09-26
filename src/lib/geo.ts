export interface LatLng {
  lat: number
  lng: number
}

/** Nimmanhaemin — where many newcomers to Chiang Mai stay. Used when geolocation is unavailable. */
export const DEFAULT_LOCATION: LatLng = { lat: 18.7995, lng: 98.9675 }
export const CHIANG_MAI_CENTER: LatLng = { lat: 18.7883, lng: 98.9853 }

/** Great-circle distance in kilometres. */
export function distanceKm(a: LatLng, b: LatLng): number {
  const R = 6371
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

export function formatKm(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`
}
