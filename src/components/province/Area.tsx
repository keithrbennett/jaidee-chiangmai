import type { Map as MlMap } from 'maplibre-gl'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useI18n } from '../../i18n'
import { loadDistricts, useGeo } from '../../lib/geo'
import { showAreas, showReports } from '../../lib/map/layers'
import { LEVEL_COLOR, isReceded } from '../../lib/water'
import { MapBox } from '../kit'
import { MapView, provinceName, useNow } from '../../lib/ui'
import { SectionPage, type ProvinceProps } from './ProvincePage'
import { ReportItem } from './Updates'

/** Each district coloured by the highest level people reported there in 24 h (receded points don't count). */
export function Area({ province, reports, reloadReports }: ProvinceProps) {
  const { m, lang } = useI18n()
  const districts = useGeo(useCallback(() => loadDistricts(province.code), [province.code]))
  const [selected, setSelected] = useState<string | null>(null)
  const mapRef = useRef<MlMap | null>(null)

  const now = useNow()
  const recent = useMemo(() => (reports ?? []).filter((r) => now - r.createdAt < 864e5), [reports, now])
  const byDistrict = useMemo(() => {
    const out: Record<string, { max: number; count: number }> = {}
    for (const r of recent) {
      if (!r.district || isReceded(r)) continue
      out[r.district] ??= { max: -1, count: 0 }
      out[r.district].max = Math.max(out[r.district].max, r.level)
      out[r.district].count++
    }
    return out
  }, [recent])
  const colors = useMemo(() => Object.fromEntries(Object.entries(byDistrict).map(([k, v]) => [k, LEVEL_COLOR[v.max]])), [byDistrict])

  const draw = useCallback(
    (map: MlMap) => {
      if (!map.getSource('osm') || !districts) return
      showAreas(map, 'jd-dist', districts, colors, 'pcode', 'rgba(94,92,230,0.55)')
      showReports(map, selected ? recent.filter((r) => r.district === selected) : recent)
    },
    [districts, colors, recent, selected],
  )
  const drawRef = useRef(draw)
  useEffect(() => {
    drawRef.current = draw
    if (mapRef.current) draw(mapRef.current)
  }, [draw])

  const list = (districts?.features ?? [])
    .map((f) => ({ pcode: String(f.properties?.pcode), th: String(f.properties?.th), en: String(f.properties?.en), f }))
    .sort((a, b) => (byDistrict[b.pcode]?.max ?? -1) - (byDistrict[a.pcode]?.max ?? -1) || a.th.localeCompare(b.th, 'th'))

  function select(pcode: string | null) {
    setSelected(pcode)
    const f = list.find((d) => d.pcode === pcode)?.f
    const map = mapRef.current
    if (!map) return
    if (!f) return map.fitBounds(province.bbox as [number, number, number, number], { padding: 24 })
    const coords = (f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates.flat(2) : f.geometry.type === 'Polygon' ? f.geometry.coordinates.flat() : []) as number[][]
    const xs = coords.map((c) => c[0])
    const ys = coords.map((c) => c[1])
    map.fitBounds([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], { padding: 30, pitch: 45 })
  }

  const shown = selected ? recent.filter((r) => r.district === selected) : recent
  return (
    <SectionPage province={province} title={m.area.title(provinceName(province, lang))} wide>
      <p className="-mt-2 text-muted">{m.area.sub}</p>
      <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
        <ul className="flex max-h-[60vh] flex-col gap-1 overflow-y-auto rounded-[18px] bg-card p-2">
          <li>
            <button onClick={() => select(null)} className={`flex min-h-11 w-full items-center rounded-[12px] px-3 text-left font-semibold ${!selected ? 'bg-go text-white' : 'hover:bg-paper'}`}>
              {m.area.whole(list.length)}
            </button>
          </li>
          {list.map((d) => {
            const s = byDistrict[d.pcode]
            return (
              <li key={d.pcode}>
                <button
                  onClick={() => select(d.pcode)}
                  className={`flex min-h-11 w-full items-center gap-2 rounded-[12px] px-3 text-left ${selected === d.pcode ? 'bg-go text-white' : 'hover:bg-paper'}`}
                >
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: s ? LEVEL_COLOR[s.max] : 'var(--hairline)' }} />
                  <span className="flex-1">{lang === 'th' ? `อ.${d.th}` : d.en}</span>
                  {s && <span className="text-sm opacity-80">{s.count}</span>}
                </button>
              </li>
            )
          })}
        </ul>
        <MapBox className="h-[60vh] min-h-[380px]">
          <MapView bounds={province.bbox as [number, number, number, number]} pitch={40} bearing={-8} onMap={(map) => (mapRef.current = map)} onStyle={(map) => drawRef.current(map)} />
        </MapBox>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {m.levels.short.map((c, i) => (
          <span key={c} className="inline-flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full" style={{ background: LEVEL_COLOR[i] }} />
            {c}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5 text-muted">
          <span className="h-3 w-3 rounded-full border border-line" /> {m.area.noReports}
        </span>
      </div>
      <p className="text-sm text-faint">{m.area.note}</p>
      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold">{m.area.reports24(shown.length)}</h2>
        <ul className="flex flex-col gap-2">
          {shown.slice(0, 50).map((r) => (
            <ReportItem key={r.id} r={r} onVoted={reloadReports} />
          ))}
        </ul>
      </section>
    </SectionPage>
  )
}
