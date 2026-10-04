import type { Map as MlMap, MapLayerMouseEvent } from 'maplibre-gl'
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { PROVINCES } from '../../data/provinces'
import { useI18n } from '../../i18n'
import { useApi, type AirStation, type Camera, type Hazards, type National, type RainRow, type Report, type Shelter } from '../../lib/api'
import { aqiBand } from '../../lib/conditions'
import { loadProvinceShapes, useGeo } from '../../lib/geo'
import { MODE_LAYERS as LAYERS, type MapMode } from '../../lib/map/modes'
import { hide, showAirStations, showAreas, showCameras, showDams, showHotspots, showQuakes, showRadar, showRain, showReports, showShelters, showStations } from '../../lib/map/layers'
import { clickable, openPopup } from '../../lib/map/popup'
import { useRadar } from '../../lib/radar'
import { provinceHref } from '../../lib/router'
import { clock } from '../../lib/time'
import { MapView, provinceName, useLocale } from '../../lib/ui'
import { AQI_COLOR, LEVEL_COLOR, RAIN_CLASSES, STATUS_COLOR, damColor, quakeColor, stationStatus } from '../../lib/water'
import { Icon } from '../Icon'
import { MapBox } from '../kit'
import { ModeSwitcher } from '../map/ModeSwitcher'

const CLICKABLE = ['jd-rep', 'jd-shelter', 'jd-cam', 'jd-st', 'jd-dam', 'jd-rain-pt', 'jd-air', 'jd-quake', 'jd-fire', 'jd-prov-fill']
const byCode = new Map(PROVINCES.map((p) => [p.code, p]))

/**
 * Thailand by hazard: pick water, rain, dust, fire or earthquake and the map shows just that, with its own
 * legend and province shading. Tap a dot for details, or a shaded province to open it.
 */
export function NationalMap({ full = false, initialMode = 'water' }: { full?: boolean; initialMode?: MapMode }) {
  const { m, lang } = useI18n()
  const locale = useLocale()
  const [mode, setMode] = useState<MapMode>(initialMode)
  const national = useApi<National>('/national')
  const hazards = useApi<Hazards>('/hazards')
  const rain = useApi<RainRow[]>(mode === 'rain' ? '/rain' : null)
  const air = useApi<AirStation[]>(mode === 'air' ? '/air' : null)
  const reports = useApi<Report[]>('/reports', 2 * 60_000)
  const shelters = useApi<Shelter[]>('/shelters')
  const cameras = useApi<Camera[]>(full ? '/cctv' : null)
  const shapes = useGeo(loadProvinceShapes)
  const radar = useRadar()
  const mapRef = useRef<MlMap | null>(null)

  // Province shading for the mode: what needs attention, nothing else.
  const shading = useMemo(() => {
    const out: Record<string, string> = {}
    if (mode === 'water') {
      for (const [code, cells] of Object.entries(hazards.data?.satFlood ?? {})) if (cells >= 50) out[code] = '#64d2ff'
      for (const s of national.data?.stations ?? []) {
        if (!s.province) continue
        const st = stationStatus(s)
        if (st === 'over') out[s.province] = STATUS_COLOR.over
        else if (st === 'high' && out[s.province] !== STATUS_COLOR.over) out[s.province] = STATUS_COLOR.high
      }
    } else if (mode === 'air') {
      for (const a of air.data ?? []) {
        if (!a.province) continue
        const b = aqiBand(a.aqi)
        if (b >= 2 && (!out[a.province] || AQI_COLOR.indexOf(out[a.province]) < b)) out[a.province] = AQI_COLOR[b]
      }
    } else if (mode === 'fire') {
      const n: Record<string, number> = {}
      for (const h of hazards.data?.hotspots ?? []) if (h[2]) n[h[2]] = (n[h[2]] ?? 0) + 1
      for (const [code, c] of Object.entries(n)) out[code] = c >= 40 ? '#ff3b30' : c >= 10 ? '#ff9500' : '#ffcc00'
    }
    return out
  }, [mode, national.data, hazards.data, air.data])

  const draw = useCallback(
    (map: MlMap) => {
      if (!map.getSource('osm')) return
      if (shapes) showAreas(map, 'jd-prov', shapes, shading, 'code', 'rgba(120,110,160,0.3)')
      if (national.data) {
        showStations(map, national.data.stations, (s) =>
          s.over === null ? '' : s.over > 0 ? `+${s.over.toFixed(2)} ${m.common.m}` : `${s.over.toFixed(2)} ${m.common.m}`,
        )
        showDams(map, national.data.dams, (d) => `${lang === 'th' ? d.th : d.en} ${Math.round(d.storagePct ?? 0)}%`)
      }
      if (reports.data) showReports(map, reports.data)
      if (shelters.data) showShelters(map, shelters.data)
      if (cameras.data) showCameras(map, cameras.data)
      if (rain.data) showRain(map, rain.data)
      showRadar(map, radar.path, mode === 'rain')
      if (air.data) showAirStations(map, air.data)
      if (hazards.data) {
        showHotspots(map, hazards.data.hotspots)
        showQuakes(map, hazards.data.quakes)
      }
      for (const k of Object.keys(LAYERS) as MapMode[]) hide(map, LAYERS[k], k !== mode)
    },
    [shapes, shading, national.data, reports.data, shelters.data, cameras.data, rain.data, radar.path, air.data, hazards.data, mode, m, lang],
  )
  const drawRef = useRef(draw)
  useEffect(() => {
    drawRef.current = draw
    if (mapRef.current) draw(mapRef.current)
  }, [draw])

  // Earthquakes that matter to Thailand happen from Myanmar to Sumatra, so quake mode pulls back to show the region.
  const wasQuake = useRef(false)
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (mode === 'quake') map.easeTo({ center: [101, 12], zoom: full ? 4.2 : 3.7, pitch: 0, bearing: 0, duration: 900 })
    else if (wasQuake.current) map.easeTo({ center: [100.9, 13.4], zoom: full ? 5.4 : 5.1, pitch: 35, bearing: -6, duration: 900 })
    wasQuake.current = mode === 'quake'
  }, [mode, full])

  // Latest data for the click handler, which outlives a render.
  const dataRef = useRef<PopupData>({ national: national.data, hazards: hazards.data, air: air.data, reports: reports.data, shelters: shelters.data, cameras: cameras.data, m, lang, locale })
  useEffect(() => {
    dataRef.current = { national: national.data, hazards: hazards.data, air: air.data, reports: reports.data, shelters: shelters.data, cameras: cameras.data, m, lang, locale }
  })

  const onMap = useCallback((map: MlMap) => {
    mapRef.current = map
    clickable(map, CLICKABLE.filter((l) => l !== 'jd-prov-fill'))
    map.on('click', (e: MapLayerMouseEvent) => {
      const layers = CLICKABLE.filter((l) => map.getLayer(l) && map.getLayoutProperty(l, 'visibility') !== 'none')
      const f = map.queryRenderedFeatures(e.point, { layers })[0]
      if (f) popupFor(map, dataRef.current, f.layer.id, f.properties as Record<string, unknown>, e.lngLat)
    })
  }, [])

  return (
    <MapBox className={full ? 'h-full rounded-none' : 'h-[64vh] min-h-[440px]'}>
      <MapView center={[100.9, 13.4]} zoom={full ? 5.4 : 5.1} pitch={35} bearing={-6} onMap={onMap} onStyle={(map) => drawRef.current(map)} />
      <ModeSwitcher mode={mode} onChange={setMode} />
      <Legend mode={mode} radarTime={mode === 'rain' && radar.time ? clock(radar.time * 1000, locale) : null} />
    </MapBox>
  )
}

interface PopupData {
  national: National | null
  hazards: Hazards | null
  air: AirStation[] | null
  reports: Report[] | null
  shelters: Shelter[] | null
  cameras: Camera[] | null
  m: ReturnType<typeof useI18n>['m']
  lang: string
  locale: string
}

function popupFor(map: MlMap, d: PopupData, layer: string, p: Record<string, unknown>, at: { lng: number; lat: number }) {
  const mm = d.m
  const provLink = (code: string | null | undefined) => {
    const prov = code ? byCode.get(code) : undefined
    return prov ? { href: provinceHref(prov), text: provinceName(prov, d.lang) } : undefined
  }
  if (layer === 'jd-st') {
    const s = d.national?.stations.find((x) => x.code === p.code)
    if (!s) return
    const st = stationStatus(s)
    openPopup(map, [s.lng, s.lat], {
      badge: { text: mm.status[st], color: STATUS_COLOR[st] },
      title: `${s.name}${s.river ? ` · ${s.river}` : ''}`,
      lines: [
        s.over !== null && (s.over > 0 ? mm.status.overBy(s.over.toFixed(2)) : mm.status.belowBy(Math.abs(s.over).toFixed(2))),
        s.pct !== null && mm.status.ofBank(Math.round(s.pct)),
        s.trend && mm.status.trend[s.trend],
        `${mm.common.measured(clock(s.observedAt, d.locale))} · ${mm.status.agency[s.agency] ?? s.agency}`,
      ],
      link: provLink(s.province),
    })
  } else if (layer === 'jd-dam') {
    const dam = d.national?.dams.find((x) => x.id === p.id)
    if (!dam) return
    openPopup(map, [dam.lng, dam.lat], {
      badge: { text: mm.home.damStorage(String(Math.round(dam.storagePct ?? 0))), color: damColor(dam.storagePct) },
      title: d.lang === 'th' ? `เขื่อน${dam.th}` : dam.en,
      lines: [mm.home.damFlow(String(dam.inflow ?? '–'), String(dam.released ?? '–')), `${dam.date} · ${dam.agency}`],
      link: provLink(dam.province),
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
      image: c.kind === 'image' ? `${c.url}?t=${Date.now()}` : undefined,
      link: c.kind === 'link' ? { href: c.url, text: mm.cctv.openViewer, external: true } : undefined,
    })
  } else if (layer === 'jd-rain-pt') {
    openPopup(map, at, { title: String(p.name), lines: [`${mm.rain.last24}: ${mm.common.mm(String(p.mm))}`, String(p.agency)] })
  } else if (layer === 'jd-air') {
    const a = d.air?.find((x) => x.id === p.id)
    if (!a) return
    const b = aqiBand(a.aqi)
    openPopup(map, [a.lng, a.lat], {
      badge: { text: `AQI ${a.aqi} · ${mm.air.bands[b]}`, color: AQI_COLOR[b] },
      title: d.lang === 'th' ? a.th : a.en,
      lines: [a.pm25 !== null && mm.air.pm25(a.pm25), `${clock(a.observedAt, d.locale)} · Air4Thai`],
      link: provLink(a.province),
    })
  } else if (layer === 'jd-quake') {
    const q = d.hazards?.quakes.find((x) => x.id === p.id)
    if (!q) return
    openPopup(map, [q.lng, q.lat], {
      badge: { text: mm.quakes.mag(q.mag ?? 0), color: quakeColor(q.at) },
      title: q.place ?? '',
      lines: [q.near, q.depth !== null && mm.quakes.depth(q.depth), clock(q.at, d.locale), q.tsunami && mm.quakes.tsunami, q.source === 'tmd' ? 'TMD' : 'USGS'],
      link: q.url ? { href: q.url, text: mm.alerts.official, external: true } : undefined,
    })
  } else if (layer === 'jd-fire') {
    const h = d.hazards?.hotspots.find((x) => Math.abs(x[0] - at.lng) < 0.05 && Math.abs(x[1] - at.lat) < 0.05)
    openPopup(map, at, {
      badge: { text: mm.fires.title, color: '#ff3b30' },
      title: h?.[3] ?? h?.[6] ?? '',
      lines: [h && clock(h[5], d.locale), 'GISTDA · VIIRS'],
      link: provLink(h?.[2]),
    })
  } else if (layer === 'jd-prov-fill') {
    const prov = byCode.get(String(p.code))
    if (prov) window.location.hash = provinceHref(prov).slice(1)
  }
}

function Legend({ mode, radarTime }: { mode: MapMode; radarTime: string | null }) {
  const { m } = useI18n()
  const [open, setOpen] = useState(true)
  const dot = (color: string, label: string) => (
    <span key={label} className="inline-flex items-center gap-1.5">
      <span className="h-3 w-3 rounded-full" style={{ background: color }} />
      {label}
    </span>
  )
  const rows: Record<MapMode, ReactNode[]> = {
    water: [
      dot(STATUS_COLOR.over, m.status.over),
      dot(STATUS_COLOR.high, m.status.high),
      dot(STATUS_COLOR.normal, m.status.normal),
      dot('#64d2ff', m.tiles.satFlood),
      dot('#0a84ff', m.layers.dams),
      dot('#30b0c7', m.layers.shelters),
    ],
    rain: [...m.rain.classes.map((c, i) => dot(RAIN_CLASSES[i].color, c)), ...(radarTime ? [<span key="r">{m.weather.radarTime(radarTime)}</span>] : [])],
    air: m.air.bands.map((b, i) => dot(AQI_COLOR[i], b)),
    fire: [dot('#ff3b30', '< 12 h'), dot('#ff9500', '12–18 h'), dot('#ffcc00', '18–24 h')],
    quake: [dot('#ff3b30', m.weather.today), dot('#ff9500', m.quakes.thisWeek), <span key="q">{m.quakes.legend}</span>],
  }
  return (
    <div className="absolute bottom-3 left-3 max-w-[min(340px,calc(100%-1.5rem))] rounded-[16px] bg-card/95 text-[13px] shadow-lg backdrop-blur">
      <button onClick={() => setOpen(!open)} className="flex min-h-9 w-full items-center gap-2 px-3 font-semibold">
        <Icon name="layers" size={16} />
        {m.modes[mode]}
        <Icon name={open ? 'down' : 'up'} size={15} className="ml-auto" />
      </button>
      {open && <div className="flex flex-wrap gap-x-3 gap-y-1.5 px-3 pb-3">{rows[mode]}</div>}
    </div>
  )
}
