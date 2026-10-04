/**
 * Runs the flood model off the main thread, for any place in Thailand. On `init` it builds the grid: terrain
 * from Terrarium tiles, and the rivers, canals, sea and lakes from the same OpenStreetMap vector tiles the map
 * draws. Then the page sends the scenario (rain, drains, river head and how it changes, speed); the worker
 * steps the solver as fast as the chosen speed asks, and posts a copy of the depth grid a few times a second.
 */
import { VectorTile } from '@mapbox/vector-tile'
import Pbf from 'pbf'
import { fitBanks, gridFrame, groundFromSurface, latToPx, lngToPx, rasterizeWater, terrarium, type Bounds, type Grid, type WaterShapes } from './grid'
import { FloodSolver, type SimStats } from './solver'

/** The scenario, set from the page. River levels are metres against the reference gauge's bank. */
export interface Scenario {
  /** Rain in mm/h for each simulated hour from the start; the last value holds after that. */
  rain: number[]
  drain: number
  /** River level against the bank at the start (m, + over / − below) and how fast it changes, m per hour. */
  headStart: number
  headRise: number
  /** Simulated seconds per real second. */
  speed: number
  running: boolean
}

export type ToWorker = { type: 'init'; bounds: Bounds; zoom: number } | { type: 'scenario'; scenario: Scenario } | { type: 'reset' }

export interface Frame {
  type: 'frame'
  time: number
  /** Depth per cell in metres; river, sea and lake cells are 0. */
  depth: Float32Array
  stats: SimStats
  /** River level against the bank now, m. */
  head: number
  rain: number
  /** Speed actually reached (the solver may not keep up with the fastest setting). */
  speed: number
}

export type FromWorker =
  | { type: 'ready'; grid: Omit<Grid, 'z' | 'river' | 'sea' | 'lake'>; z: Float32Array; river: Uint8Array; channelCells: number; waterFound: boolean }
  | Frame
  | { type: 'error'; message: string }

const SIM_END = 48 * 3600
const FRAME_MS = 200
const TERRAIN_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium'
const VECTOR_TILEJSON = 'https://tiles.openfreemap.org/planet'
/** Vector tiles at this zoom carry rivers and canals at street detail. */
const WATER_ZOOM = 13

// The project compiles with the DOM library, where `self` is a Window; in a worker it is the worker scope.
const post = (msg: FromWorker, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(msg, transfer)

let solver: FloodSolver | null = null
let scenario: Scenario | null = null
let timer: ReturnType<typeof setTimeout> | null = null
let lastTick = 0
let lastFrame = 0
let measured = { real: 0, sim: 0 }

self.onmessage = async (e: MessageEvent<ToWorker>) => {
  const msg = e.data
  try {
    if (msg.type === 'init') {
      const grid = await loadGrid(msg.bounds, msg.zoom)
      const water = await loadWater(grid).catch(() => null)
      if (water) rasterizeWater(grid, water)
      const { channelCells } = fitBanks(grid)
      solver = new FloodSolver(grid)
      const { z, river, sea: _sea, lake: _lake, ...meta } = grid
      post({ type: 'ready', grid: meta, z: z.slice(), river: river.slice(), channelCells, waterFound: !!water && channelCells > 0 })
      sendFrame()
    } else if (msg.type === 'scenario') {
      scenario = msg.scenario
      if (scenario.running && !timer) {
        lastTick = performance.now()
        measured = { real: 0, sim: 0 }
        tick()
      }
      if (!scenario.running) sendFrame()
    } else if (msg.type === 'reset') {
      solver?.reset()
      sendFrame()
    }
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}

/** Terrain for the bounds from Terrarium tiles, with roofs and trees filtered out. */
async function loadGrid(bounds: Bounds, zoom: number): Promise<Grid> {
  const f = gridFrame(bounds, zoom)
  const surface = new Float32Array(f.nx * f.ny)
  const tiles = new Map<string, Promise<Uint8ClampedArray>>()
  const tile = (tx: number, ty: number) => {
    const key = `${tx}/${ty}`
    if (!tiles.has(key)) tiles.set(key, fetchTile(`${TERRAIN_URL}/${zoom}/${key}.png`))
    return tiles.get(key)!
  }
  for (let ty = f.py0 >> 8; ty <= (f.py0 + f.ny - 1) >> 8; ty++) for (let tx = f.px0 >> 8; tx <= (f.px0 + f.nx - 1) >> 8; tx++) tile(tx, ty)
  for (let j = 0; j < f.ny; j++) {
    for (let i = 0; i < f.nx; i++) {
      const px = f.px0 + i
      const py = f.py0 + j
      const data = await tile(px >> 8, py >> 8)
      const o = ((py & 255) * 256 + (px & 255)) * 4
      surface[j * f.nx + i] = terrarium(data[o], data[o + 1], data[o + 2])
    }
  }
  const n = f.nx * f.ny
  return { ...f, zoom, z: groundFromSurface(surface, f.nx, f.ny), river: new Uint8Array(n), sea: new Uint8Array(n), lake: new Uint8Array(n) }
}

async function fetchTile(url: string) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Terrain tile ${url} answered ${res.status}`)
  // No colour management or premultiplying: the RGB values are the elevation.
  const bitmap = await createImageBitmap(await res.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' })
  const ctx = new OffscreenCanvas(256, 256).getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(bitmap, 0, 0)
  return ctx.getImageData(0, 0, 256, 256).data
}

/**
 * Rivers, canals, sea and lakes over the grid from OpenFreeMap's vector tiles (OpenMapTiles schema):
 * `waterway` lines of class river and canal (not tunnels), and `water` areas: river, ocean, lake.
 */
async function loadWater(grid: Grid): Promise<WaterShapes> {
  const tilejson = (await (await fetch(VECTOR_TILEJSON)).json()) as { tiles: string[] }
  const template = tilejson.tiles[0]
  const scale = 2 ** (WATER_ZOOM - grid.zoom)
  // Grid pixels at grid.zoom → vector tiles at WATER_ZOOM.
  const tx0 = Math.floor((grid.px0 * scale) / 256)
  const tx1 = Math.floor(((grid.px0 + grid.nx) * scale) / 256)
  const ty0 = Math.floor((grid.py0 * scale) / 256)
  const ty1 = Math.floor(((grid.py0 + grid.ny) * scale) / 256)
  const out: WaterShapes = { lines: [], rivers: [], sea: [], lakes: [] }
  const toGrid = ([lng, lat]: number[]): [number, number] => [lngToPx(lng, grid.zoom) - grid.px0, latToPx(lat, grid.zoom) - grid.py0]
  const jobs: Promise<void>[] = []
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      jobs.push(
        (async () => {
          const res = await fetch(template.replace('{z}', String(WATER_ZOOM)).replace('{x}', String(tx)).replace('{y}', String(ty)))
          if (!res.ok) return
          const vt = new VectorTile(new Pbf(new Uint8Array(await res.arrayBuffer())))
          const ways = vt.layers.waterway
          for (let k = 0; ways && k < ways.length; k++) {
            const f = ways.feature(k)
            const cls = f.properties.class
            if ((cls !== 'river' && cls !== 'canal') || f.properties.brunnel === 'tunnel') continue
            const g = f.toGeoJSON(tx, ty, WATER_ZOOM).geometry
            const lines = g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : []
            for (const l of lines) out.lines.push(l.map(toGrid))
          }
          const water = vt.layers.water
          for (let k = 0; water && k < water.length; k++) {
            const f = water.feature(k)
            const cls = f.properties.class
            const into = cls === 'river' ? out.rivers : cls === 'ocean' ? out.sea : cls === 'lake' || cls === 'pond' ? out.lakes : null
            if (!into) continue
            const g = f.toGeoJSON(tx, ty, WATER_ZOOM).geometry
            const polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []
            for (const p of polys) into.push(p.map((ring) => ring.map(toGrid)))
          }
        })(),
      )
    }
  }
  await Promise.all(jobs)
  return out
}

/** Scenario values at simulated time t. */
function inputsAt(s: Scenario, t: number) {
  const hour = Math.floor(t / 3600)
  const rain = s.rain[Math.min(hour, s.rain.length - 1)] ?? 0
  const head = s.headStart + (s.headRise * t) / 3600
  return { rain, drain: s.drain, head }
}

function tick() {
  timer = null
  if (!solver || !scenario?.running) return
  const now = performance.now()
  const real = Math.min(0.25, (now - lastTick) / 1000) // don't try to catch up after the tab was hidden
  lastTick = now
  const target = Math.min(SIM_END, solver.time + real * scenario.speed)
  const start = solver.time
  const deadline = now + 40
  while (solver.time < target && performance.now() < deadline) {
    const { rain, drain, head } = inputsAt(scenario, solver.time)
    solver.step({ rain, drain, riverHead: head }, target - solver.time)
  }
  measured.real += real
  measured.sim += solver.time - start
  if (now - lastFrame >= FRAME_MS) sendFrame()
  if (solver.time >= SIM_END) {
    scenario = { ...scenario, running: false }
    sendFrame()
    return
  }
  timer = setTimeout(tick, 0)
}

function sendFrame() {
  if (!solver) return
  lastFrame = performance.now()
  const { river, sea, lake } = solver.grid
  const depth = solver.h.slice()
  for (let k = 0; k < depth.length; k++) if (river[k] || sea[k] || lake[k]) depth[k] = 0
  const at = scenario ? inputsAt(scenario, solver.time) : { head: 0, rain: 0 }
  const speed = measured.real > 0.5 ? measured.sim / measured.real : (scenario?.speed ?? 0)
  if (measured.real > 3) measured = { real: 0, sim: 0 } // a rolling-ish window
  post({ type: 'frame', time: solver.time, depth, stats: solver.stats(), head: at.head, rain: at.rain, speed }, [depth.buffer])
}
