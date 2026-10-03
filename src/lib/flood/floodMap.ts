import maplibregl, { type GeoJSONSource, type Map as MlMap } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { cellAt, cellCenter, gridCorners, pxToLat, pxToLng, type Grid } from './grid'
import { isRidGauge, type FloodFeeds } from './feeds'

/**
 * The 3D city for the flood simulator: OpenFreeMap vector tiles (OpenStreetMap buildings extruded to
 * their mapped height), Terrarium terrain, the model's depth grid draped over the terrain, live gauges,
 * and in street walk mode the water as 3D blocks around you.
 */

type GridMeta = Omit<Grid, 'z' | 'river'>

const STYLE = {
  light: 'https://tiles.openfreemap.org/styles/positron',
  dark: 'https://tiles.openfreemap.org/styles/dark',
}
export const styleUrl = (theme: 'light' | 'dark') => STYLE[theme]
const TERRAIN_TILES = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'
const TERRAIN_ATTRIBUTION =
  '<a href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noreferrer">Terrain Tiles (SRTM)</a>'

/** Depth classes for the water, m, with their colours. Shared with the legend on the page. */
export const DEPTH_CLASSES: { min: number; color: [number, number, number] }[] = [
  { min: 0.1, color: [150, 205, 255] },
  { min: 0.3, color: [70, 160, 255] },
  { min: 0.5, color: [10, 100, 240] },
  { min: 1, color: [20, 50, 190] },
  { min: 2, color: [95, 30, 170] },
]

/** Thai Meteorological Department classes for 24-hour rain, mm: light, moderate, heavy, very heavy. */
export const RAIN_CLASSES: { min: number; color: string }[] = [
  { min: 0.1, color: '#7dd3fc' },
  { min: 10.1, color: '#0ea5e9' },
  { min: 35.1, color: '#f59e0b' },
  { min: 90.1, color: '#ef4444' },
]

export const GAUGE_COLORS = { over: '#ff3b30', near: '#ff9f0a', ok: '#30d158', none: '#8e8e93' }

const WALK_RADIUS_M = 450
const rgb = ([r, g, b]: [number, number, number]) => `rgb(${r},${g},${b})`

export function createFloodMap(container: HTMLElement, theme: 'light' | 'dark') {
  const map = new maplibregl.Map({
    container,
    style: STYLE[theme],
    center: [99.0, 18.788],
    zoom: 12.7,
    pitch: 55,
    bearing: -20,
    maxPitch: 85,
    attributionControl: { compact: true },
  })
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right')
  return map
}

/** (Re)add our sources and layers; call on every `style.load`, since a style switch drops them. */
export function addFloodLayers(map: MlMap, theme: 'light' | 'dark', canvas: HTMLCanvasElement, grid: GridMeta | null) {
  if (!map.getSource('terrain')) {
    map.addSource('terrain', {
      type: 'raster-dem',
      tiles: [TERRAIN_TILES],
      encoding: 'terrarium',
      tileSize: 256,
      // The model runs on zoom-12 terrain; drawing the same tiles keeps the water on the ground it was computed for.
      maxzoom: 12,
      attribution: TERRAIN_ATTRIBUTION,
    })
  }
  // This runs again when the grid arrives; no need to rebuild the terrain then.
  if (!map.getTerrain()) map.setTerrain({ source: 'terrain', exaggeration: 1 })

  if (grid && !map.getSource('flood')) {
    map.addSource('flood', { type: 'canvas', canvas, coordinates: gridCorners(grid), animate: true })
    // The grid often arrives after the other layers: keep the water under the buildings and markers.
    map.addLayer(
      {
        id: 'flood-depth',
        type: 'raster',
        source: 'flood',
        paint: { 'raster-opacity': 0.85, 'raster-resampling': 'nearest', 'raster-fade-duration': 0 },
      },
      map.getLayer('city-buildings') ? 'city-buildings' : undefined,
    )
  }

  if (!map.getLayer('city-buildings')) {
    map.addLayer({
      id: 'city-buildings',
      type: 'fill-extrusion',
      source: 'openmaptiles',
      'source-layer': 'building',
      minzoom: 13,
      paint: {
        'fill-extrusion-color': theme === 'dark' ? '#3a3a3c' : '#e5e5ea',
        'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 6],
        'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
        'fill-extrusion-opacity': 0.9,
      },
    })
  }

  if (!map.getSource('walk-water')) {
    map.addSource('walk-water', { type: 'geojson', data: EMPTY })
    map.addLayer({
      id: 'walk-water',
      type: 'fill-extrusion',
      source: 'walk-water',
      paint: {
        'fill-extrusion-color': ['get', 'color'],
        'fill-extrusion-height': ['get', 'depth'],
        'fill-extrusion-base': 0,
        'fill-extrusion-opacity': 0.6,
      },
    })
  }

  const textColor = theme === 'dark' ? '#f5f5f7' : '#1d1d1f'
  const halo = theme === 'dark' ? '#000000' : '#ffffff'
  for (const id of ['rain', 'gauges', 'needs']) {
    if (!map.getSource(id)) map.addSource(id, { type: 'geojson', data: EMPTY })
  }
  if (!map.getLayer('rain')) {
    map.addLayer({
      id: 'rain',
      type: 'circle',
      source: 'rain',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 9, 3, 14, 7],
        'circle-color': ['get', 'color'],
        'circle-stroke-color': halo,
        'circle-stroke-width': 1,
        'circle-opacity': 0.9,
      },
    })
  }
  if (!map.getLayer('gauges')) {
    map.addLayer({
      id: 'gauges',
      type: 'circle',
      source: 'gauges',
      paint: {
        'circle-radius': ['case', ['get', 'rid'], 8, 5.5],
        'circle-color': ['get', 'color'],
        'circle-stroke-color': halo,
        'circle-stroke-width': ['case', ['get', 'rid'], 2.5, 1.5],
      },
    })
    map.addLayer({
      id: 'gauge-labels',
      type: 'symbol',
      source: 'gauges',
      minzoom: 10,
      filter: ['get', 'rid'],
      layout: {
        'text-field': ['get', 'code'],
        'text-font': ['Noto Sans Bold'],
        'text-size': 12,
        'text-offset': [0, 1.3],
        'text-anchor': 'top',
      },
      paint: { 'text-color': textColor, 'text-halo-color': halo, 'text-halo-width': 1.5 },
    })
  }
  if (!map.getLayer('needs')) {
    map.addLayer({
      id: 'needs',
      type: 'circle',
      source: 'needs',
      paint: {
        'circle-radius': 7,
        'circle-color': ['case', ['get', 'atRisk'], '#ff3b30', '#ff9f0a'],
        'circle-stroke-color': '#ffffff',
        'circle-stroke-width': 2,
      },
    })
  }
}

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] }

/** Paint the depth grid into the canvas the map drapes over the terrain. */
export function paintDepth(canvas: HTMLCanvasElement, grid: GridMeta, depth: Float32Array) {
  if (canvas.width !== grid.nx || canvas.height !== grid.ny) {
    canvas.width = grid.nx
    canvas.height = grid.ny
  }
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(grid.nx, grid.ny)
  const px = img.data
  for (let k = 0; k < depth.length; k++) {
    const d = depth[k]
    if (d < DEPTH_CLASSES[0].min) continue
    let c = DEPTH_CLASSES[0].color
    for (const cls of DEPTH_CLASSES) if (d >= cls.min) c = cls.color
    px[k * 4] = c[0]
    px[k * 4 + 1] = c[1]
    px[k * 4 + 2] = c[2]
    px[k * 4 + 3] = 220
  }
  ctx.putImageData(img, 0, 0)
}

/** Water as 3D blocks, one per cell, around the map centre (street walk mode). */
export function setWalkWater(map: MlMap, grid: GridMeta | null, depth: Float32Array | null, on: boolean) {
  const src = map.getSource('walk-water') as GeoJSONSource | undefined
  if (!src) return
  if (!on || !grid || !depth) return src.setData(EMPTY)
  const c = map.getCenter()
  const k0 = cellAt(grid, c.lng, c.lat)
  if (k0 < 0) return src.setData(EMPTY)
  const r = Math.ceil(WALK_RADIUS_M / grid.dx)
  const i0 = k0 % grid.nx
  const j0 = (k0 - i0) / grid.nx
  const features: GeoJSON.Feature[] = []
  for (let j = Math.max(0, j0 - r); j <= Math.min(grid.ny - 1, j0 + r); j++) {
    for (let i = Math.max(0, i0 - r); i <= Math.min(grid.nx - 1, i0 + r); i++) {
      const d = depth[j * grid.nx + i]
      if (d < 0.05) continue
      const w = pxToLng(grid.px0 + i, grid.zoom)
      const e = pxToLng(grid.px0 + i + 1, grid.zoom)
      const n = pxToLat(grid.py0 + j, grid.zoom)
      const s = pxToLat(grid.py0 + j + 1, grid.zoom)
      let color = DEPTH_CLASSES[0].color
      for (const cls of DEPTH_CLASSES) if (d >= cls.min) color = cls.color
      features.push({
        type: 'Feature',
        properties: { depth: d, color: rgb(color) },
        geometry: { type: 'Polygon', coordinates: [[[w, n], [e, n], [e, s], [w, s], [w, n]]] },
      })
    }
  }
  src.setData({ type: 'FeatureCollection', features })
}

/** Live gauges and rain on the map. */
export function setFeeds(map: MlMap, feeds: FloodFeeds | null) {
  const rain = map.getSource('rain') as GeoJSONSource | undefined
  const gauges = map.getSource('gauges') as GeoJSONSource | undefined
  if (!rain || !gauges || !feeds) return
  rain.setData({
    type: 'FeatureCollection',
    features: (feeds.rain ?? []).map((r) => {
      let color = GAUGE_COLORS.none
      for (const cls of RAIN_CLASSES) if ((r.rain24h ?? 0) >= cls.min) color = cls.color
      return { type: 'Feature', properties: { ...r, color }, geometry: { type: 'Point', coordinates: [r.lng, r.lat] } }
    }),
  })
  gauges.setData({
    type: 'FeatureCollection',
    features: (feeds.gauges ?? []).map((g) => ({
      type: 'Feature',
      properties: { ...g, rid: isRidGauge(g), color: GAUGE_COLORS[gaugeStatus(g.levelMsl, g.bankMsl)] },
      geometry: { type: 'Point', coordinates: [g.lng, g.lat] },
    })),
  })
}

/** Over the bank, within a metre of it, below that, or unknown. */
function gaugeStatus(levelMsl: number | null, bankMsl: number | null): keyof typeof GAUGE_COLORS {
  if (levelMsl === null || bankMsl === null) return 'none'
  if (levelMsl >= bankMsl) return 'over'
  return bankMsl - levelMsl < 1 ? 'near' : 'ok'
}

export function setNeeds(map: MlMap, needs: { id: string; lat: number; lng: number; title: string; atRisk: boolean }[]) {
  const src = map.getSource('needs') as GeoJSONSource | undefined
  src?.setData({
    type: 'FeatureCollection',
    features: needs.map((n) => ({
      type: 'Feature',
      properties: n,
      geometry: { type: 'Point', coordinates: [n.lng, n.lat] },
    })),
  })
}

/** Depth and ground height at a point, from the latest frame. */
export function sampleAt(grid: GridMeta | null, z: Float32Array | null, depth: Float32Array | null, lng: number, lat: number) {
  if (!grid || !z || !depth) return null
  const k = cellAt(grid, lng, lat)
  if (k < 0) return null
  return { depth: depth[k], ground: z[k], center: cellCenter(grid, k) }
}
