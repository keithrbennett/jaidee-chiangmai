import type { Map as MlMap, MapLayerMouseEvent } from 'maplibre-gl'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useI18n } from '../../i18n'
import { api, type Report } from '../../lib/api'
import { loadProvinceShapes, loadTambons, useGeo } from '../../lib/geo'
import { showAreas, showCameras, showDams, showRain, showReports, showShelters, showStations } from '../../lib/map/layers'
import { clickable, openPopup } from '../../lib/map/popup'
import { clock } from '../../lib/time'
import { LEVEL_COLOR, STATUS_COLOR, damColor, stationStatus } from '../../lib/water'
import { Icon } from '../Icon'
import { GeoMessage, MapBox, inputCls } from '../kit'
import { MapView, provinceName, useGeolocation, useLocale } from '../../lib/ui'
import { SectionPage, type ProvinceProps } from './ProvincePage'

/** The province in 3D: gauges as columns, rain, people's reports (tap to confirm), shelters, cameras. */
export function ProvinceMap({ province, data, reports, reloadReports }: ProvinceProps) {
  const { m, lang } = useI18n()
  return (
    <SectionPage province={province} title={m.province.sections.map} wide>
      <ProvinceMapView province={province} data={data} reports={reports} reloadReports={reloadReports} className="h-[68vh] min-h-[440px]" />
      <p className="text-sm text-faint">{m.updates.fadeNote}</p>
      <p className="text-sm text-faint">
        {provinceName(province, lang)} · {m.common.source('RID SWOC · Thaiwater · OpenStreetMap')}
      </p>
    </SectionPage>
  )
}

export function ProvinceMapView({
  province,
  data,
  reports,
  reloadReports,
  className = '',
  focus,
}: Pick<ProvinceProps, 'province' | 'data' | 'reports' | 'reloadReports'> & { className?: string; focus?: [number, number] | null }) {
  const { m, lang } = useI18n()
  const locale = useLocale()
  const shapes = useGeo(loadProvinceShapes)
  const geo = useGeolocation()
  const [picking, setPicking] = useState(false)
  const tambons = useGeo(useMemo(() => (picking ? () => loadTambons(province.code) : null), [picking, province.code]))
  const [q, setQ] = useState('')
  const mapRef = useRef<MlMap | null>(null)
  const latest = useRef({ data, reports, m, locale })
  useEffect(() => {
    latest.current = { data, reports, m, locale }
  })

  const draw = useCallback(
    (map: MlMap) => {
      if (!map.getSource('osm')) return
      if (shapes) {
        const own = { ...shapes, features: shapes.features.filter((f) => f.properties?.code === province.code) }
        showAreas(map, 'jd-prov', own, {}, 'code', 'rgba(94,92,230,0.7)')
      }
      if (data) {
        showStations(map, data.stations, { radius: 1600, perPct: 140, maxzoom: 11 }, (s) =>
          s.over === null ? '' : s.over > 0 ? m.status.overBy(s.over.toFixed(2)) : m.status.belowBy(Math.abs(s.over).toFixed(2)),
        )
        showDams(map, data.dams, { radius: 3000, perPct: 140 }, (d) => `${lang === 'th' ? d.th : d.en} ${Math.round(d.storagePct ?? 0)}%`)
        showRain(map, data.rain)
        showShelters(map, data.shelters)
        showCameras(map, data.cctv)
      }
      if (reports) showReports(map, reports)
    },
    [shapes, data, reports, province.code, m, lang],
  )
  const drawRef = useRef(draw)
  useEffect(() => {
    drawRef.current = draw
    if (mapRef.current) draw(mapRef.current)
  }, [draw])

  useEffect(() => {
    if (focus && mapRef.current) mapRef.current.flyTo({ center: focus, zoom: 14, pitch: 60 })
  }, [focus])

  const vote = useCallback(
    async (r: Report, v: 'still' | 'receded') => {
      try {
        await api(`/reports/${r.id}/vote`, { body: { vote: v } })
        reloadReports()
        alert(latest.current.m.updates.voted)
      } catch {
        alert(latest.current.m.updates.alreadyVoted)
      }
    },
    [reloadReports],
  )

  const onMap = useCallback(
    (map: MlMap) => {
      mapRef.current = map
      clickable(map, ['jd-st-col', 'jd-st-pt', 'jd-dam-col', 'jd-rep', 'jd-shelter', 'jd-cam', 'jd-rain-pt'])
      map.on('click', (e: MapLayerMouseEvent) => {
        const { data: d, reports: reps, m: mm, locale: loc } = latest.current
        const layers = ['jd-rep', 'jd-shelter', 'jd-cam', 'jd-st-pt', 'jd-st-col', 'jd-dam-col', 'jd-rain-pt'].filter((l) => map.getLayer(l))
        const f = map.queryRenderedFeatures(e.point, { layers })[0]
        if (!f) return
        const p = f.properties as Record<string, unknown>
        const id = f.layer.id
        if (id === 'jd-rep') {
          const r = reps?.find((x) => x.id === p.id)
          if (!r) return
          openPopup(map, [r.lng, r.lat], {
            badge: { text: mm.levels.short[r.level], color: LEVEL_COLOR[r.level] },
            title: mm.levels.names[r.level],
            lines: [
              r.note,
              r.trend && mm.report.trend[r.trend],
              r.passable && mm.report.passable[r.passable],
              clock(r.createdAt, loc),
              r.stillCount > 0 && mm.updates.confirmedStill(r.stillCount),
              r.recededAt ? mm.updates.recededMark : null,
            ],
            image: r.photo ?? undefined,
            actions: [
              { text: mm.updates.stillFlooded, onClick: () => vote(r, 'still') },
              { text: mm.updates.receded, onClick: () => vote(r, 'receded') },
            ],
          })
        } else if (id === 'jd-st-pt' || id === 'jd-st-col') {
          const s = d?.stations.find((x) => x.code === p.code)
          if (!s) return
          const st = stationStatus(s)
          openPopup(map, [s.lng, s.lat], {
            badge: { text: mm.status[st], color: STATUS_COLOR[st] },
            title: `${s.name}${s.river ? ` · ${s.river}` : ''}`,
            lines: [
              s.over !== null && (s.over > 0 ? mm.status.overBy(s.over.toFixed(2)) : mm.status.belowBy(Math.abs(s.over).toFixed(2))),
              s.pct !== null && mm.status.ofBank(Math.round(s.pct)),
              s.trend && mm.status.trend[s.trend],
              `${s.code} · ${mm.common.measured(clock(s.observedAt, loc))} · ${mm.status.agency[s.agency] ?? s.agency}`,
            ],
          })
        } else if (id === 'jd-dam-col') {
          const dam = d?.dams.find((x) => x.id === p.id)
          if (dam)
            openPopup(map, [dam.lng, dam.lat], {
              badge: { text: `${Math.round(dam.storagePct ?? 0)}%`, color: damColor(dam.storagePct) },
              title: dam.th,
              lines: [mm.home.damFlow(String(dam.inflow ?? '–'), String(dam.released ?? '–')), dam.date],
            })
        } else if (id === 'jd-shelter') {
          const s = d?.shelters.find((x) => x.id === p.id)
          if (s)
            openPopup(map, [s.lng, s.lat], {
              badge: { text: s.status === 'full' ? mm.shelters.full : mm.shelters.open, color: s.status === 'full' ? '#8e8e93' : '#30b0c7' },
              title: s.name,
              lines: [mm.shelters.capacity(s.occupancy, s.capacity), s.contact, s.note],
            })
        } else if (id === 'jd-cam') {
          const c = d?.cctv.find((x) => x.id === p.id)
          if (c)
            openPopup(map, [c.lng, c.lat], {
              title: c.title,
              lines: [c.description],
              image: c.kind === 'image' ? `${c.url}?t=${Date.now()}` : undefined,
              link: c.kind === 'link' ? { href: c.url, text: mm.cctv.openViewer, external: true } : undefined,
            })
        } else if (id === 'jd-rain-pt') {
          openPopup(map, e.lngLat, { title: String(p.name), lines: [`${mm.rain.last24}: ${mm.common.mm(String(p.mm))}`, String(p.agency)] })
        }
      })
    },
    [vote],
  )

  const matches = (tambons ?? []).filter((t) => !q || t[1].includes(q) || t[2].toLowerCase().includes(q.toLowerCase())).slice(0, 30)
  return (
    <div className="flex flex-col gap-2">
      <MapBox className={className}>
        <MapView bounds={province.bbox as [number, number, number, number]} pitch={55} bearing={-12} onMap={onMap} onStyle={(map) => drawRef.current(map)} />
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          <button
            onClick={async () => {
              const pt = await geo.locate()
              if (pt) mapRef.current?.flyTo({ center: pt, zoom: 14.5, pitch: 60 })
            }}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-card/95 px-3.5 text-[14px] font-semibold shadow backdrop-blur"
          >
            <Icon name="locate" size={18} /> {m.common.nearMe}
          </button>
          <button onClick={() => setPicking(!picking)} className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-card/95 px-3.5 text-[14px] font-semibold shadow backdrop-blur">
            <Icon name="pin" size={18} /> {m.common.chooseTambon}
          </button>
        </div>
        {picking && (
          <div className="absolute left-3 top-16 z-10 flex w-72 flex-col gap-2 rounded-[16px] bg-card p-3 shadow-lg">
            <input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder={m.common.search} autoFocus />
            <ul className="max-h-60 overflow-y-auto">
              {matches.map((t) => (
                <li key={t[0]}>
                  <button
                    className="flex min-h-10 w-full items-center rounded-lg px-2 text-left hover:bg-paper"
                    onClick={() => {
                      mapRef.current?.flyTo({ center: [t[4], t[5]], zoom: 14, pitch: 60 })
                      setPicking(false)
                    }}
                  >
                    {lang === 'th' ? `ต.${t[1]}` : t[2]}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </MapBox>
      <GeoMessage state={geo.state} />
    </div>
  )
}

