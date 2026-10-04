// Thailand's provinces and sub-districts for the server: which province a point is in, and the nearest
// sub-district (tambon). Built from the files scripts/build_admin_geo.py writes into public/geo.
import { existsSync, readFileSync } from 'node:fs'

const GEO = new URL('../../public/geo/', import.meta.url)
const geojson = JSON.parse(readFileSync(new URL('provinces.geojson', GEO), 'utf8'))

/** [{ code, slug, th, en }] for the 77 provinces. */
export const PROVINCES = geojson.features.map((f) => f.properties)
export const provinceCodes = new Set(PROVINCES.map((p) => p.code))
const byThaiName = new Map(PROVINCES.map((p) => [p.th, p.code]))

/** Province code from a Thai province name as the agencies write it ("จ.เชียงใหม่", "กรุงเทพฯ" …). */
export function provinceFromThai(name) {
  if (!name) return null
  const clean = name.replace(/^จ(ังหวัด|\.)\s*/, '').trim()
  if (byThaiName.has(clean)) return byThaiName.get(clean)
  if (/^กรุงเทพ/.test(clean)) return '10'
  return null
}

const shapes = geojson.features.map((f) => {
  const polys = f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates]
  const outer = polys.map((p) => p[0])
  const xs = outer.flat().map((c) => c[0])
  const ys = outer.flat().map((c) => c[1])
  return { code: f.properties.code, outer, box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] }
})

function inRing([x, y], ring) {
  let hit = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit
  }
  return hit
}

/** Province code containing the point, or null (sea, neighbouring country). */
export function provinceAt(lng, lat) {
  for (const s of shapes) {
    const [w, south, e, n] = s.box
    if (lng < w || lng > e || lat < south || lat > n) continue
    if (s.outer.some((ring) => inRing([lng, lat], ring))) return s.code
  }
  return null
}

const tambonCache = new Map()
/** Sub-district centre points of a province: [pcode, th, en, districtPcode, lng, lat]. */
export function tambons(code) {
  if (!tambonCache.has(code)) {
    const file = new URL(`p/${code}/tambons.json`, GEO)
    tambonCache.set(code, existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : [])
  }
  return tambonCache.get(code)
}

/** The sub-district whose centre is closest: good enough to label a report "ต.หนองแก๋ว อ.หางดง". */
export function nearestTambon(code, lng, lat) {
  let best = null
  let bestD = Infinity
  const k = Math.cos((lat * Math.PI) / 180)
  for (const t of tambons(code)) {
    const d = ((t[4] - lng) * k) ** 2 + (t[5] - lat) ** 2
    if (d < bestD) {
      bestD = d
      best = t
    }
  }
  return best ? { tambon: best[0], district: best[3] } : { tambon: null, district: null }
}
