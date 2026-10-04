import type { GeoJSONSource, LayerSpecification, Map as MlMap, SourceSpecification } from 'maplibre-gl'
import type { AirStation, Camera, Dam, HotspotRow, Quake, RainRow, Report, Shelter, Station } from '../api'
import { AQI_COLOR, LEVEL_COLOR, RAIN_CLASSES, STATUS_COLOR, damColor, isReceded, quakeColor, reportOpacity, stationStatus } from '../water'

/**
 * Data layers for our maps. Each `show…` adds its sources and layers the first time and only updates the
 * data after that, so it is safe to call on every style load and every refresh. Markers are plain dots
 * with short labels, coloured by status, so the map reads at a glance.
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

// ---- River gauges --------------------------------------------------------------------------------------

/**
 * Gauges as dots: red and bigger when over the bank, orange when high, small and quiet otherwise. Zoomed
 * out, only the ones that matter (over or high) show, so the map reads at a glance. Zoomed in, each gets a
 * short label: how far over or under the bank.
 */
export function showStations(map: MlMap, stations: Station[], label: (s: Station) => string) {
  setSource(map, 'jd-st', {
    type: 'FeatureCollection',
    features: stations.map((s) => {
      const status = stationStatus(s)
      const rank = status === 'over' ? 0 : status === 'high' ? 1 : 2
      return point(s.lng, s.lat, { code: s.code, color: STATUS_COLOR[status], rank, label: rank < 2 ? label(s) : '' , short: label(s) })
    }),
  })
  addLayer(
    map,
    {
      id: 'jd-st',
      type: 'circle',
      source: 'jd-st',
      // Zoomed out, hide the normal ones.
      filter: ['any', ['<', ['get', 'rank'], 2], ['>=', ['zoom'], 8]],
      layout: { 'circle-sort-key': ['-', 3, ['get', 'rank']] },
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, ['match', ['get', 'rank'], 0, 6, 1, 4.5, 3], 12, ['match', ['get', 'rank'], 0, 11, 1, 9, 7]],
        'circle-color': ['get', 'color'],
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': ['interpolate', ['linear'], ['zoom'], 5, 1.2, 12, 2.5],
      },
    },
    undefined,
  )
  addLayer(
    map,
    {
      id: 'jd-st-label',
      type: 'symbol',
      source: 'jd-st',
      minzoom: 7,
      filter: ['any', ['<', ['get', 'rank'], 2], ['>=', ['zoom'], 11]],
      layout: {
        'text-field': ['get', 'short'],
        'text-font': ['Noto Sans Bold'],
        'text-size': 11,
        'text-offset': [0, 1.25],
        'text-anchor': 'top',
        'symbol-sort-key': ['get', 'rank'],
      },
      paint: { 'text-color': ['get', 'color'], 'text-halo-color': '#ffffff', 'text-halo-width': 1.8 },
    },
    undefined,
  )
}

// ---- Dams ------------------------------------------------------------------------------------------------

/** Dams as a blue dot with how full they are written beside it. */
export function showDams(map: MlMap, dams: Dam[], label: (d: Dam) => string) {
  setSource(map, 'jd-dam', { type: 'FeatureCollection', features: dams.map((d) => point(d.lng, d.lat, { id: d.id, label: label(d), color: damColor(d.storagePct) })) })
  addLayer(
    map,
    {
      id: 'jd-dam',
      type: 'circle',
      source: 'jd-dam',
      paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 5, 12, 10], 'circle-color': ['get', 'color'], 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 },
    },
    undefined,
  )
  addLayer(
    map,
    {
      id: 'jd-dam-label',
      type: 'symbol',
      source: 'jd-dam',
      minzoom: 6,
      layout: { 'text-field': ['get', 'label'], 'text-font': ['Noto Sans Bold'], 'text-size': 11, 'text-offset': [0.9, 0], 'text-anchor': 'left' },
      paint: { 'text-color': ['get', 'color'], 'text-halo-color': '#ffffff', 'text-halo-width': 1.8 },
    },
    undefined,
  )
}

// ---- Fire, earthquakes, dust, satellite flooding --------------------------------------------------------

/** Fire hotspots: a warm glow zoomed out, then dots by age (newest brightest), the way fire maps show them. */
export function showHotspots(map: MlMap, rows: HotspotRow[]) {
  const now = Date.now()
  setSource(map, 'jd-fire', {
    type: 'FeatureCollection',
    features: rows.map((r) => point(r[0], r[1], { age: (now - new Date(r[5]).getTime()) / 3600_000, frp: r[4] ?? 1 })),
  })
  addLayer(map, {
    id: 'jd-fire-heat',
    type: 'heatmap',
    source: 'jd-fire',
    maxzoom: 9,
    paint: {
      'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 4, 6, 9, 18],
      'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 4, 0.8, 9, 1.5],
      'heatmap-opacity': ['interpolate', ['linear'], ['zoom'], 7, 0.8, 9, 0],
      'heatmap-color': ['interpolate', ['linear'], ['heatmap-density'], 0, 'rgba(0,0,0,0)', 0.2, 'rgba(255,214,10,0.5)', 0.5, 'rgba(255,149,0,0.75)', 1, 'rgba(255,59,48,0.9)'],
    },
  })
  addLayer(
    map,
    {
      id: 'jd-fire',
      type: 'circle',
      source: 'jd-fire',
      minzoom: 6.5,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 7, 3, 13, 7],
        'circle-color': ['step', ['get', 'age'], '#ff3b30', 12, '#ff9500', 18, '#ffcc00'],
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 1,
      },
    },
    undefined,
  )
}

/** Earthquakes: circle size by magnitude, colour by how recent; magnitude written on the bigger ones. */
export function showQuakes(map: MlMap, quakes: Quake[]) {
  setSource(map, 'jd-quake', {
    type: 'FeatureCollection',
    features: quakes.map((q) => point(q.lng, q.lat, { id: q.id, mag: q.mag ?? 0, color: quakeColor(q.at), label: q.mag !== null && q.mag >= 4 ? `M${q.mag}` : '' })),
  })
  addLayer(
    map,
    {
      id: 'jd-quake',
      type: 'circle',
      source: 'jd-quake',
      layout: { 'circle-sort-key': ['get', 'mag'] },
      paint: {
        'circle-radius': ['interpolate', ['exponential', 1.6], ['get', 'mag'], 3, 4, 5, 10, 7, 24],
        'circle-color': ['get', 'color'],
        'circle-opacity': 0.75,
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 1.5,
      },
    },
    undefined,
  )
  addLayer(
    map,
    {
      id: 'jd-quake-label',
      type: 'symbol',
      source: 'jd-quake',
      layout: { 'text-field': ['get', 'label'], 'text-font': ['Noto Sans Bold'], 'text-size': 11, 'text-allow-overlap': true },
      paint: { 'text-color': '#ffffff', 'text-halo-color': 'rgba(0,0,0,0.45)', 'text-halo-width': 1 },
    },
    undefined,
  )
}

/** Air stations as coloured circles with the AQI number in them, the way air-quality maps show it. */
export function showAirStations(map: MlMap, stations: AirStation[]) {
  setSource(map, 'jd-air', {
    type: 'FeatureCollection',
    features: stations.map((a) => point(a.lng, a.lat, { id: a.id, aqi: a.aqi, color: AQI_COLOR[aqiBandOf(a.aqi)] })),
  })
  addLayer(
    map,
    {
      id: 'jd-air',
      type: 'circle',
      source: 'jd-air',
      layout: { 'circle-sort-key': ['get', 'aqi'] },
      paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 9, 10, 15], 'circle-color': ['get', 'color'], 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 },
    },
    undefined,
  )
  addLayer(
    map,
    {
      id: 'jd-air-label',
      type: 'symbol',
      source: 'jd-air',
      layout: { 'text-field': ['to-string', ['get', 'aqi']], 'text-font': ['Noto Sans Bold'], 'text-size': ['interpolate', ['linear'], ['zoom'], 5, 9, 10, 13], 'text-allow-overlap': true },
      paint: { 'text-color': '#1d1d1f' },
    },
    undefined,
  )
}
const aqiBandOf = (aqi: number) => (aqi <= 25 ? 0 : aqi <= 50 ? 1 : aqi <= 100 ? 2 : aqi <= 200 ? 3 : 4)

/** Flooded cells seen by satellite in a province: soft blue dots, one per cell (~0.12 km²). */
export function showSatFloodCells(map: MlMap, cells: [number, number, number][]) {
  setSource(map, 'jd-satflood', { type: 'FeatureCollection', features: cells.map(([lng, lat, area]) => point(lng, lat, { area })) })
  addLayer(map, {
    id: 'jd-satflood',
    type: 'circle',
    source: 'jd-satflood',
    paint: {
      'circle-radius': ['interpolate', ['exponential', 2], ['zoom'], 8, 1.5, 12, 6, 15, 40],
      'circle-color': '#0a84ff',
      'circle-opacity': ['interpolate', ['linear'], ['get', 'area'], 0, 0.25, 120000, 0.7],
      'circle-blur': 0.3,
    },
  })
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
