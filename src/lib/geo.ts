import { useEffect, useState } from 'react'
import { PROVINCES, type Province } from '../data/provinces'

/** Province, district and sub-district geography from public/geo (built by scripts/build_admin_geo.py). */

type FC = GeoJSON.FeatureCollection
const cache = new Map<string, Promise<unknown>>()
function load<T>(path: string): Promise<T> {
  if (!cache.has(path)) cache.set(path, fetch(path).then((r) => (r.ok ? r.json() : Promise.reject(new Error(path)))))
  return cache.get(path) as Promise<T>
}

export const loadProvinceShapes = () => load<FC>('/geo/provinces.geojson')
export const loadDistricts = (code: string) => load<FC>(`/geo/p/${code}/districts.geojson`)
/** [pcode, th, en, district pcode, lng, lat] */
export type Tambon = [string, string, string, string, number, number]
export const loadTambons = (code: string) => load<Tambon[]>(`/geo/p/${code}/tambons.json`)

export function useGeo<T>(loader: (() => Promise<T>) | null) {
  const [data, setData] = useState<{ loader: typeof loader; value: T } | null>(null)
  useEffect(() => {
    if (!loader) return
    let live = true
    loader()
      .then((value) => live && setData({ loader, value }))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [loader])
  return data && data.loader === loader ? data.value : null
}

function inRing([x, y]: [number, number], ring: number[][]) {
  let hit = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit
  }
  return hit
}

export function inFeature(p: [number, number], f: GeoJSON.Feature) {
  const g = f.geometry
  const polys = g.type === 'MultiPolygon' ? g.coordinates : g.type === 'Polygon' ? [g.coordinates] : []
  return polys.some((poly) => inRing(p, poly[0] as number[][]))
}

/** The province a point is in (exact, from the outlines). */
export async function provinceAt(lng: number, lat: number): Promise<Province | null> {
  const shapes = await loadProvinceShapes()
  const hit = shapes.features.find((f) => {
    const b = f.properties?.bbox as number[]
    return lng >= b[0] && lng <= b[2] && lat >= b[1] && lat <= b[3] && inFeature([lng, lat], f)
  })
  return hit ? (PROVINCES.find((p) => p.code === hit.properties?.code) ?? null) : null
}

/** "ต.สุเทพ อ.เมืองเชียงใหม่ จ.เชียงใหม่" for a point: province by outline, then the nearest sub-district. */
export async function placeName(lng: number, lat: number, lang: string): Promise<{ province: Province; label: string } | null> {
  const province = await provinceAt(lng, lat)
  if (!province) return null
  const [tambons, districts] = await Promise.all([loadTambons(province.code).catch(() => []), loadDistricts(province.code).catch(() => null)])
  const k = Math.cos((lat * Math.PI) / 180)
  let best: Tambon | null = null
  let bestD = Infinity
  for (const t of tambons) {
    const d = ((t[4] - lng) * k) ** 2 + (t[5] - lat) ** 2
    if (d < bestD) {
      bestD = d
      best = t
    }
  }
  const d = best && districts?.features.find((f) => f.properties?.pcode === best![3])?.properties as { th: string; en: string } | undefined
  const th = [best && `ต.${best[1]}`, d && `อ.${d.th}`, `จ.${province.th}`].filter(Boolean).join(' ')
  const en = [best?.[2], d?.en, province.en].filter(Boolean).join(', ')
  return { province, label: lang === 'th' ? th : en }
}
