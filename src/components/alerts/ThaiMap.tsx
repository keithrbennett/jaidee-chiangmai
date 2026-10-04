import { useMemo, useState } from 'react'
import { useI18n } from '../../i18n'
import { loadProvinceShapes, useGeo } from '../../lib/geo'
import { provinceByCode } from '../../lib/router'
import { provinceName } from '../../lib/ui'
import { ALERT_COLOR } from '../../lib/water'

// A flat map of Thailand in SVG: each province filled by its highest alert level. Light enough to sit beside
// a list (no WebGL), drawn from the same outlines as the 3D maps, simplified for the screen.
const WEST = 97.2
const NORTH = 20.6
const SCALE = 40
const COS = Math.cos((13.5 * Math.PI) / 180)
const WIDTH = Math.ceil((105.8 - WEST) * COS * SCALE)
const HEIGHT = Math.ceil((NORTH - 5.5) * SCALE)
type Pt = [number, number]

/** Douglas–Peucker on projected points (tolerance in px): the outlines have far more detail than a 300 px map shows. */
function simplify(points: Pt[], tol: number): Pt[] {
  if (points.length < 4) return points
  const keep = new Uint8Array(points.length)
  keep[0] = keep[points.length - 1] = 1
  const stack: [number, number][] = [[0, points.length - 1]]
  while (stack.length) {
    const [a, b] = stack.pop()!
    const [ax, ay] = points[a]
    const [bx, by] = points[b]
    const len = Math.hypot(bx - ax, by - ay) || 1
    let far = -1
    let farD = tol
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((bx - ax) * (ay - points[i][1]) - (ax - points[i][0]) * (by - ay)) / len
      if (d > farD) {
        farD = d
        far = i
      }
    }
    if (far > 0) {
      keep[far] = 1
      stack.push([a, far], [far, b])
    }
  }
  return points.filter((_, i) => keep[i])
}

function pathOf(geometry: GeoJSON.Geometry) {
  const polygons = geometry.type === 'MultiPolygon' ? geometry.coordinates : geometry.type === 'Polygon' ? [geometry.coordinates] : []
  let d = ''
  for (const polygon of polygons) {
    const pts = simplify(
      polygon[0].map(([lng, lat]) => [(lng - WEST) * COS * SCALE, (NORTH - lat) * SCALE] as Pt),
      0.5,
    )
    if (pts.length >= 3) d += `M${pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join('L')}Z`
  }
  return d
}

/** Thailand with each province coloured by its highest alert level; tap one to open it. */
export function ThaiMap({ levels, onPick }: { levels: Record<string, number>; onPick?: (code: string) => void }) {
  const { m, lang } = useI18n()
  const shapes = useGeo(loadProvinceShapes)
  const paths = useMemo(() => (shapes?.features ?? []).map((f) => ({ code: String(f.properties?.code), d: pathOf(f.geometry) })), [shapes])
  const [hover, setHover] = useState<string | null>(null)
  const hovered = hover ? provinceByCode.get(hover) : undefined
  if (!shapes) return <div className="skeleton mx-auto aspect-[334/604] max-h-[520px] w-full max-w-[290px]" />
  return (
    <figure className="relative mx-auto w-full max-w-[290px]">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="h-auto w-full" role="img" aria-label={m.alerts.mapLabel}>
        {paths.map((p) => {
          const level = levels[p.code] ?? 0
          return (
            <path
              key={p.code}
              d={p.d}
              fill={level ? ALERT_COLOR[level] : 'var(--hairline)'}
              fillOpacity={level ? 0.92 : 0.55}
              stroke="var(--tile)"
              strokeWidth={hover === p.code ? 2 : 0.7}
              className="cursor-pointer transition-[fill-opacity] duration-200 hover:fill-opacity-70"
              onMouseEnter={() => setHover(p.code)}
              onMouseLeave={() => setHover((h) => (h === p.code ? null : h))}
              onClick={() => onPick?.(p.code)}
            >
              <title>{provinceByCode.get(p.code) ? provinceName(provinceByCode.get(p.code)!, lang) : p.code}</title>
            </path>
          )
        })}
      </svg>
      {hovered && (
        <figcaption className="pointer-events-none absolute left-0 top-0 rounded-full bg-card/95 px-3 py-1 text-[13px] font-semibold shadow-md">
          {provinceName(hovered, lang)} · <span style={{ color: ALERT_COLOR[levels[hovered.code] ?? 0] }}>{m.hazard.levels[levels[hovered.code] ?? 0]}</span>
        </figcaption>
      )}
    </figure>
  )
}
