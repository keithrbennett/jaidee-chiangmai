import type { GeoJSONSource, LayerSpecification, Map as MlMap, SourceSpecification } from 'maplibre-gl'
import type { Camera, Dam, RainRow, Report, Shelter, Station } from '../api'
import { LEVEL_COLOR, RAIN_CLASSES, STATUS_COLOR, damColor, isReceded, reportOpacity, stationStatus } from '../water'

/**
 * Data layers for our maps. Each `show…` adds its sources and layers the first time and only updates the
 * data after that, so it is safe to call on every style load and every refresh. River gauges and dams are
 * drawn as 3D columns: height = how full, colour = status.
 */

type FC = GeoJSON.FeatureCollection
const EMPTY: FC = { type: 'FeatureCollection', features: [] }

export function setSource(map: MlMap, id: string, data: FC, extra: Partial<SourceSpecification> = {}) {
  const src = map.getSource(id) as GeoJSONSource | undefined
  if (src) src.setData(data)
  else map.addSource(id, { type: 'geojson', data, ...extra } as SourceSpecification)
}

/** Add a layer once, under the map labels unless told otherwise. */
export function addLayer(map: MlMap, layer: LayerSpecification, before: string | undefined = firstLabel(map)) {
  if (!map.getLayer(layer.id)) map.addLayer(layer, before && map.getLayer(before) ? before : undefined)
}
const firstLabel = (map: MlMap) => map.getStyle().layers.find((l) => l.type === 'symbol' && !l.id.startsWith('jd-'))?.id

const point = (lng: number, lat: number, properties: Record<string, unknown>): GeoJSON.Feature => ({
  type: 'Feature',
  properties,
  geometry: { type: 'Point', coordinates: [lng, lat] },
})

/** A round column footprint: a polygon of `steps` sides, `radius` metres across. */
function disc(lng: number, lat: number, radius: number, properties: Record<string, unknown>, steps = 18): GeoJSON.Feature {
  const dLat = radius / 111_320
  const dLng = radius / (111_320 * Math.cos((lat * Math.PI) / 180))
  const ring = Array.from({ length: steps + 1 }, (_, i) => {
    const a = (i / steps) * 2 * Math.PI
    return [lng + dLng * Math.cos(a), lat + dLat * Math.sin(a)]
  })
  return { type: 'Feature', properties, geometry: { type: 'Polygon', coordinates: [ring] } }
}

export interface ColumnScale {
  /** Footprint radius in metres. */
  radius: number
  /** Column height in metres per percent of bank-full (or of dam capacity). */
  perPct: number
  /** Above this zoom the columns give way to flat dots. */
  maxzoom?: number
}

// ---- River gauges --------------------------------------------------------------------------------------

export function showStations(map: MlMap, stations: Station[], scale: ColumnScale, label: (s: Station) => string) {
  const props = (s: Station) => {
    const status = stationStatus(s)
    return { code: s.code, status, color: STATUS_COLOR[status], label: label(s), rank: status === 'over' ? 0 : status === 'high' ? 1 : 2 }
  }
  setSource(map, 'jd-st-col', {
    type: 'FeatureCollection',
    features: stations.map((s) => disc(s.lng, s.lat, scale.radius, { ...props(s), height: Math.min(160, Math.max(4, s.pct ?? 20)) * scale.perPct })),
  })
  setSource(map, 'jd-st-pt', { type: 'FeatureCollection', features: stations.map((s) => point(s.lng, s.lat, props(s))) })
  const maxzoom = scale.maxzoom ?? 12
  addLayer(map, {
    id: 'jd-st-col',
    type: 'fill-extrusion',
    source: 'jd-st-col',
    maxzoom,
    paint: {
      'fill-extrusion-color': ['get', 'color'],
      'fill-extrusion-height': ['get', 'height'],
      'fill-extrusion-opacity': 0.88,
      'fill-extrusion-vertical-gradient': true,
    },
  })
  addLayer(map, {
    id: 'jd-st-pt',
    type: 'circle',
    source: 'jd-st-pt',
    minzoom: maxzoom - 1,
    layout: { 'circle-sort-key': ['-', 3, ['get', 'rank']] },
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 5, 15, 9],
      'circle-color': ['get', 'color'],
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 2,
    },
  })
  addLayer(
    map,
    {
      id: 'jd-st-label',
      type: 'symbol',
      source: 'jd-st-pt',
      minzoom: Math.max(9, maxzoom - 2),
      layout: {
        'text-field': ['get', 'label'],
        'text-font': ['Noto Sans Bold'],
        'text-size': 11,
        'text-offset': [0, 1.2],
        'text-anchor': 'top',
        'symbol-sort-key': ['get', 'rank'],
      },
      paint: { 'text-color': ['get', 'color'], 'text-halo-color': '#ffffff', 'text-halo-width': 1.6 },
    },
    undefined,
  )
}

// ---- Dams ------------------------------------------------------------------------------------------------

export function showDams(map: MlMap, dams: Dam[], scale: ColumnScale, label: (d: Dam) => string) {
  setSource(map, 'jd-dam-col', {
    type: 'FeatureCollection',
    features: dams.map((d) => disc(d.lng, d.lat, scale.radius, { id: d.id, color: damColor(d.storagePct), height: Math.max(5, d.storagePct ?? 0) * scale.perPct }, 28)),
  })
  setSource(map, 'jd-dam-pt', { type: 'FeatureCollection', features: dams.map((d) => point(d.lng, d.lat, { id: d.id, label: label(d), color: damColor(d.storagePct) })) })
  addLayer(map, {
    id: 'jd-dam-col',
    type: 'fill-extrusion',
    source: 'jd-dam-col',
    paint: { 'fill-extrusion-color': ['get', 'color'], 'fill-extrusion-height': ['get', 'height'], 'fill-extrusion-opacity': 0.75 },
  })
  addLayer(
    map,
    {
      id: 'jd-dam-label',
      type: 'symbol',
      source: 'jd-dam-pt',
      minzoom: 5.5,
      layout: { 'text-field': ['get', 'label'], 'text-font': ['Noto Sans Bold'], 'text-size': 12, 'text-offset': [0, -1.4] },
      paint: { 'text-color': ['get', 'color'], 'text-halo-color': '#ffffff', 'text-halo-width': 1.8 },
    },
    undefined,
  )
}

// ---- Rain ------------------------------------------------------------------------------------------------

export function showRain(map: MlMap, rain: RainRow[]) {
  setSource(map, 'jd-rain', {
    type: 'FeatureCollection',
    features: rain.filter((r) => (r[2] ?? 0) > 0).map((r) => point(r[0], r[1], { mm: r[2], h1: r[3], name: r[5], agency: r[6], at: r[7] })),
  })
  addLayer(map, {
    id: 'jd-rain-heat',
    type: 'heatmap',
    source: 'jd-rain',
    maxzoom: 10,
    paint: {
      'heatmap-weight': ['interpolate', ['linear'], ['get', 'mm'], 0, 0, 10, 0.3, 35, 0.7, 90, 1],
      'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 4, 0.6, 9, 1.6],
      'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 4, 10, 9, 26],
      'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 8, 0.75, 10, 0],
      'heatmap-color': [
        'interpolate',
        ['linear'],
        ['heatmap-density'],
        0, 'rgba(0,0,0,0)',
        0.15, 'rgba(100,210,255,0.45)',
        0.4, 'rgba(10,132,255,0.6)',
        0.7, 'rgba(255,159,10,0.75)',
        1, 'rgba(255,55,95,0.85)',
      ],
    },
  })
  addLayer(map, {
    id: 'jd-rain-pt',
    type: 'circle',
    source: 'jd-rain',
    minzoom: 8,
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['get', 'mm'], 0, 3, 35, 6, 90, 9],
      'circle-color': ['step', ['get', 'mm'], RAIN_CLASSES[0].color, RAIN_CLASSES[1].min, RAIN_CLASSES[1].color, RAIN_CLASSES[2].min, RAIN_CLASSES[2].color, RAIN_CLASSES[3].min, RAIN_CLASSES[3].color],
      'circle-opacity': 0.85,
      'circle-stroke-color': '#ffffff',
      'circle-stroke-width': 1,
    },
  })
}

/** Latest RainViewer radar frame (free tiles go to zoom 7; MapLibre scales them up beyond that). */
export function showRadar(map: MlMap, path: string | null, visible: boolean) {
  if (!path) return
  const id = 'jd-radar'
  const tiles = [`https://tilecache.rainviewer.com${path}/256/{z}/{x}/{y}/2/1_1.png`]
  const src = map.getSource(id) as { tiles?: string[]; setTiles?: (t: string[]) => void } | undefined
  if (src?.setTiles) {
    if (src.tiles?.[0] !== tiles[0]) src.setTiles(tiles)
  } else {
    map.addSource(id, { type: 'raster', tiles, tileSize: 256, maxzoom: 7, attribution: '<a href="https://www.rainviewer.com/" target="_blank" rel="noreferrer">RainViewer</a>' })
  }
  addLayer(map, { id, type: 'raster', source: id, paint: { 'raster-opacity': 0.7, 'raster-fade-duration': 0 } })
  map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none')
}

// ---- People's reports, shelters, cameras ------------------------------------------------------------------

export function showReports(map: MlMap, reports: Report[]) {
  setSource(map, 'jd-rep', {
    type: 'FeatureCollection',
    features: reports.map((r) =>
      point(r.lng, r.lat, { id: r.id, color: LEVEL_COLOR[r.level], opacity: reportOpacity(r), receded: isReceded(r), level: r.level }),
    ),
  })
  addLayer(
    map,
    {
      id: 'jd-rep',
      type: 'circle',
      source: 'jd-rep',
      layout: { 'circle-sort-key': ['get', 'level'] },
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, 5, 14, 11],
        'circle-color': ['case', ['get', 'receded'], '#ffffff', ['get', 'color']],
        'circle-opacity': ['get', 'opacity'],
        'circle-stroke-color': ['case', ['get', 'receded'], ['get', 'color'], '#ffffff'],
        'circle-stroke-width': ['case', ['get', 'receded'], 3, 2],
        'circle-stroke-opacity': ['get', 'opacity'],
      },
    },
    undefined,
  )
}

export function showShelters(map: MlMap, shelters: Shelter[]) {
  setSource(map, 'jd-shelter', { type: 'FeatureCollection', features: shelters.map((s) => point(s.lng, s.lat, { id: s.id, name: s.name, full: s.status === 'full' })) })
  addLayer(
    map,
    {
      id: 'jd-shelter',
      type: 'circle',
      source: 'jd-shelter',
      paint: { 'circle-radius': 8, 'circle-color': ['case', ['get', 'full'], '#8e8e93', '#30b0c7'], 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2.5 },
    },
    undefined,
  )
  addLayer(
    map,
    {
      id: 'jd-shelter-label',
      type: 'symbol',
      source: 'jd-shelter',
      minzoom: 10,
      layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Bold'], 'text-size': 11, 'text-offset': [0, 1.3], 'text-anchor': 'top' },
      paint: { 'text-color': '#1f8ea3', 'text-halo-color': '#ffffff', 'text-halo-width': 1.6 },
    },
    undefined,
  )
}

export function showCameras(map: MlMap, cams: Camera[], visible = true) {
  setSource(map, 'jd-cam', { type: 'FeatureCollection', features: cams.map((c) => point(c.lng, c.lat, { id: c.id })) })
  addLayer(
    map,
    {
      id: 'jd-cam',
      type: 'circle',
      source: 'jd-cam',
      paint: { 'circle-radius': 6, 'circle-color': '#5856d6', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 },
    },
    undefined,
  )
  map.setLayoutProperty('jd-cam', 'visibility', visible ? 'visible' : 'none')
}

// ---- Areas -------------------------------------------------------------------------------------------------

/** Fill areas (provinces or districts) by a colour per feature id; others stay clear. */
export function showAreas(map: MlMap, id: string, data: FC, colors: Record<string, string>, key: string, outline: string) {
  const features = data.features.map((f) => ({ ...f, properties: { ...f.properties, fill: colors[String(f.properties?.[key])] ?? null } }))
  setSource(map, id, { type: 'FeatureCollection', features })
  addLayer(map, {
    id: `${id}-fill`,
    type: 'fill',
    source: id,
    paint: { 'fill-color': ['coalesce', ['get', 'fill'], 'rgba(0,0,0,0)'], 'fill-opacity': ['case', ['has', 'fill'], 0.28, 0] },
  })
  addLayer(map, {
    id: `${id}-line`,
    type: 'line',
    source: id,
    paint: { 'line-color': outline, 'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.6, 10, 1.8] },
  })
}

export const hide = (map: MlMap, ids: string[], hidden: boolean) =>
  ids.forEach((id) => map.getLayer(id) && map.setLayoutProperty(id, 'visibility', hidden ? 'none' : 'visible'))

export { EMPTY }
