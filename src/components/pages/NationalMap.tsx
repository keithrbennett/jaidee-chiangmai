import type { Map as MlMap, MapLayerMouseEvent } from 'maplibre-gl'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PROVINCES } from '../../data/provinces'
import { useI18n } from '../../i18n'
import { useApi, type Camera, type National, type RainRow, type Report, type Shelter } from '../../lib/api'
import { loadProvinceShapes, useGeo } from '../../lib/geo'
import { hide, showAreas, showCameras, showDams, showRadar, showRain, showReports, showShelters, showStations } from '../../lib/map/layers'
import { clickable, openPopup } from '../../lib/map/popup'
import { useRadar } from '../../lib/radar'
import { provinceHref } from '../../lib/router'
import { clock } from '../../lib/time'
import { LEVEL_COLOR, RAIN_CLASSES, STATUS_COLOR, damColor, stationStatus } from '../../lib/water'
import { Icon } from '../Icon'
import { MapBox } from '../kit'
import { MapView, provinceName, useLocale } from '../../lib/ui'

export type LayerKey = 'stations' | 'rain' | 'radar' | 'dams' | 'reports' | 'shelters' | 'cameras'
const LAYER_IDS: Record<LayerKey, string[]> = {
  stations: ['jd-st-col', 'jd-st-pt', 'jd-st-label'],
  rain: ['jd-rain-heat', 'jd-rain-pt'],
  radar: ['jd-radar'],
  dams: ['jd-dam-col', 'jd-dam-label'],
  reports: ['jd-rep'],
  shelters: ['jd-shelter', 'jd-shelter-label'],
  cameras: ['jd-cam'],
}

const byCode = new Map(PROVINCES.map((p) => [p.code, p]))

/**
 * Thailand in 3D: every river gauge as a column (height = how full, colour = status), large dams, rain,
 * radar, people's reports, shelters and cameras. Provinces with rivers over the bank are tinted; click a
 * province to open it.
 */
export function NationalMap({ full = false }: { full?: boolean }) {
  const { m, lang } = useI18n()
  const locale = useLocale()
  const national = useApi<National>('/national')
  const rain = useApi<RainRow[]>('/rain')
  const reports = useApi<Report[]>('/reports', 2 * 60_000)
  const shelters = useApi<Shelter[]>('/shelters')
  const cameras = useApi<Camera[]>(full ? '/cctv' : null)
  const shapes = useGeo(loadProvinceShapes)
  const radar = useRadar()
  const [on, setOn] = useState<Record<LayerKey, boolean>>({
    stations: true,
    rain: true,
    radar: false,
    dams: true,
    reports: true,
    shelters: true,
    cameras: false,
  })
  const mapRef = useRef<MlMap | null>(null)

  // Provinces with a gauge over the bank (red) or high (orange).
  const provinceColors = useMemo(() => {
    const worst: Record<string, number> = {}
    for (const s of national.data?.stations ?? []) {
      if (!s.province) continue
      const st = stationStatus(s)
      const rank = st === 'over' ? 2 : st === 'high' ? 1 : 0
      worst[s.province] = Math.max(worst[s.province] ?? 0, rank)
    }
    return Object.fromEntries(Object.entries(worst).filter(([, r]) => r > 0).map(([code, r]) => [code, r === 2 ? STATUS_COLOR.over : STATUS_COLOR.high]))
  }, [national.data])

  const draw = useCallback(
    (map: MlMap) => {
      if (!map.isStyleLoaded() && !map.getSource('osm')) return
      if (shapes) showAreas(map, 'jd-prov', shapes, provinceColors, 'code', 'rgba(120,110,160,0.35)')
      if (national.data) {
        showStations(map, national.data.stations, { radius: 3500, perPct: 450, maxzoom: 9 }, (s) =>
          s.over === null ? '' : s.over > 0 ? m.status.overBy(s.over.toFixed(2)) : m.status.belowBy(Math.abs(s.over).toFixed(2)),
        )
        showDams(map, national.data.dams, { radius: 7000, perPct: 500 }, (d) => `${lang === 'th' ? d.th : d.en} ${Math.round(d.storagePct ?? 0)}%`)
      }
      if (rain.data) showRain(map, rain.data)
      showRadar(map, radar.path, on.radar)
      if (reports.data) showReports(map, reports.data)
      if (shelters.data) showShelters(map, shelters.data)
      if (cameras.data) showCameras(map, cameras.data, on.cameras)
      for (const k of Object.keys(LAYER_IDS) as LayerKey[]) hide(map, LAYER_IDS[k], !on[k])
    },
    [shapes, provinceColors, national.data, rain.data, radar.path, reports.data, shelters.data, cameras.data, on, m, lang],
  )
  const drawRef = useRef(draw)
  useEffect(() => {
    drawRef.current = draw
    if (mapRef.current?.getSource('osm')) draw(mapRef.current)
  }, [draw])

  // Latest data for the click handler, which outlives a render.
  const dataRef = useRef<PopupData>({ national: national.data, reports: reports.data, shelters: shelters.data, cameras: cameras.data, m, lang, locale })
  useEffect(() => {
    dataRef.current = { national: national.data, reports: reports.data, shelters: shelters.data, cameras: cameras.data, m, lang, locale }
  })

  const onMap = useCallback((map: MlMap) => {
    mapRef.current = map
    clickable(map, ['jd-st-col', 'jd-st-pt', 'jd-dam-col', 'jd-rep', 'jd-shelter', 'jd-cam', 'jd-rain-pt'])
    map.on('click', (e: MapLayerMouseEvent) => {
      const layers = ['jd-rep', 'jd-shelter', 'jd-cam', 'jd-st-pt', 'jd-st-col', 'jd-dam-col', 'jd-rain-pt', 'jd-prov-fill'].filter((l) => map.getLayer(l))
      const f = map.queryRenderedFeatures(e.point, { layers })[0]
      if (f) popupFor(map, dataRef.current, f.layer.id, f.properties as Record<string, unknown>, e.lngLat)
    })
  }, [])

  const toggles: [LayerKey, string, string][] = [
    ['stations', m.layers.stations, STATUS_COLOR.normal],
    ['rain', m.layers.rain, RAIN_CLASSES[1].color],
    ['radar', m.layers.radar, '#64d2ff'],
    ['dams', m.layers.dams, '#0a84ff'],
    ['reports', m.layers.reports, LEVEL_COLOR[2]],
    ['shelters', m.layers.shelters, '#30b0c7'],
    ...(full ? ([['cameras', m.layers.cameras, '#5856d6']] as [LayerKey, string, string][]) : []),
  ]

  return (
    <MapBox className={full ? 'h-full rounded-none' : 'h-[62vh] min-h-[420px]'}>
      <MapView center={[100.9, 13.4]} zoom={full ? 5.4 : 5.1} pitch={45} bearing={-8} onMap={onMap} onStyle={(map) => drawRef.current(map)} />
      <div className="absolute left-3 top-3 flex max-w-[calc(100%-5rem)] flex-wrap gap-1.5">
        {toggles.map(([k, label, color]) => (
          <button
            key={k}
            onClick={() => setOn((o) => ({ ...o, [k]: !o[k] }))}
            aria-pressed={on[k]}
            className={`inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-[14px] font-medium shadow backdrop-blur ${
              on[k] ? 'bg-card/95 text-ink' : 'bg-card/60 text-muted'
            }`}
          >
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: on[k] ? color : '#c7c7cc' }} />
            {label}
          </button>
        ))}
      </div>
      <Legend radarTime={on.radar && radar.time ? clock(radar.time * 1000, locale) : null} />
    </MapBox>
  )
}

interface PopupData {
  national: National | null
  reports: Report[] | null
  shelters: Shelter[] | null
  cameras: Camera[] | null
  m: ReturnType<typeof useI18n>['m']
  lang: string
  locale: string
}

function popupFor(map: MlMap, d: PopupData, layer: string, p: Record<string, unknown>, at: { lng: number; lat: number }) {
  const mm = d.m
  if (layer === 'jd-st-pt' || layer === 'jd-st-col') {
    const s = d.national?.stations.find((x) => x.code === p.code)
    if (!s) return
    const st = stationStatus(s)
    const prov = s.province ? byCode.get(s.province) : undefined
    openPopup(map, [s.lng, s.lat], {
      badge: { text: mm.status[st], color: STATUS_COLOR[st] },
      title: `${s.name}${s.river ? ` · ${s.river}` : ''}`,
      lines: [
        s.over !== null && (s.over > 0 ? mm.status.overBy(s.over.toFixed(2)) : mm.status.belowBy(Math.abs(s.over).toFixed(2))),
        s.pct !== null && mm.status.ofBank(Math.round(s.pct)),
        s.trend && mm.status.trend[s.trend],
        `${s.code} · ${mm.common.measured(clock(s.observedAt, d.locale))} · ${mm.status.agency[s.agency] ?? s.agency}`,
      ],
      link: prov ? { href: provinceHref(prov), text: provinceName(prov, d.lang) } : undefined,
    })
  } else if (layer === 'jd-dam-col') {
    const dam = d.national?.dams.find((x) => x.id === p.id)
    if (!dam) return
    openPopup(map, [dam.lng, dam.lat], {
      badge: { text: mm.home.damStorage(String(Math.round(dam.storagePct ?? 0))), color: damColor(dam.storagePct) },
      title: d.lang === 'th' ? `เขื่อน${dam.th}` : dam.en,
      lines: [mm.home.damFlow(String(dam.inflow ?? '–'), String(dam.released ?? '–')), `${dam.date} · ${dam.agency}`],
    })
  } else if (layer === 'jd-rep') {
    const r = d.reports?.find((x) => x.id === p.id)
    if (!r) return
    openPopup(map, [r.lng, r.lat], {
      badge: { text: mm.levels.short[r.level], color: LEVEL_COLOR[r.level] },
      title: mm.levels.names[r.level],
      lines: [r.note, r.trend && mm.report.trend[r.trend], r.passable && mm.report.passable[r.passable], clock(r.createdAt, d.locale)],
      image: r.photo ?? undefined,
      link: byCode.get(r.province) ? { href: provinceHref(byCode.get(r.province)!, 'updates'), text: mm.province.sections.updates } : undefined,
    })
  } else if (layer === 'jd-shelter') {
    const s = d.shelters?.find((x) => x.id === p.id)
    if (!s) return
    openPopup(map, [s.lng, s.lat], {
      badge: { text: s.status === 'full' ? mm.shelters.full : mm.shelters.open, color: s.status === 'full' ? '#8e8e93' : '#30b0c7' },
      title: s.name,
      lines: [mm.shelters.capacity(s.occupancy, s.capacity), s.contact, s.note],
    })
  } else if (layer === 'jd-cam') {
    const c = d.cameras?.find((x) => x.id === p.id)
    if (!c) return
    openPopup(map, [c.lng, c.lat], {
      title: c.title,
      lines: [c.description],
      image: c.kind === 'image' ? c.url : undefined,
      link: c.kind === 'link' ? { href: c.url, text: mm.cctv.openViewer, external: true } : undefined,
    })
  } else if (layer === 'jd-rain-pt') {
    openPopup(map, at, { title: String(p.name), lines: [`${mm.rain.last24}: ${mm.common.mm(String(p.mm))}`, String(p.agency)] })
  } else if (layer === 'jd-prov-fill') {
    const prov = byCode.get(String(p.code))
    if (prov) window.location.hash = provinceHref(prov).slice(1)
  }
}

function Legend({ radarTime }: { radarTime: string | null }) {
  const { m } = useI18n()
  const [open, setOpen] = useState(false)
  return (
    <div className="absolute bottom-3 left-3 max-w-[300px] rounded-[16px] bg-card/95 text-[13px] shadow-lg backdrop-blur">
      <button onClick={() => setOpen(!open)} className="flex min-h-10 w-full items-center gap-2 px-3 font-semibold">
        <Icon name="layers" size={18} />
        {m.layers.legend}
        {radarTime && <span className="font-normal text-muted">· {m.weather.radarTime(radarTime)}</span>}
        <Icon name={open ? 'down' : 'up'} size={16} className="ml-auto" />
      </button>
      {open && (
        <div className="flex flex-col gap-2 px-3 pb-3">
          <p className="text-muted">{m.layers.columnsNote}</p>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {(['over', 'high', 'normal', 'low', 'veryLow'] as const).map((s) => (
              <span key={s} className="inline-flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_COLOR[s] }} />
                {m.status[s]}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {m.rain.classes.map((c, i) => (
              <span key={c} className="inline-flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: RAIN_CLASSES[i].color }} />
                {c}
              </span>
            ))}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {m.levels.short.map((c, i) => (
              <span key={c} className="inline-flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: LEVEL_COLOR[i] }} />
                {c}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
