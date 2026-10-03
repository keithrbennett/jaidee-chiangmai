/**
 * Runs the flood model off the main thread. The page sends the scenario (rain, drains, river level and
 * how it changes, speed); the worker steps the solver as fast as the chosen speed asks, and posts a
 * copy of the depth grid a few times a second.
 */
import { PING_RIVER } from '../../data/pingRiver'
import { fitRiver, gridFrame, groundFromSurface, terrarium, type Bounds, type Grid } from './grid'
import { FloodSolver, type SimStats } from './solver'

/** The scenario, set from the page. Levels are on the P.1 gauge scale (metres). */
export interface Scenario {
  /** Rain in mm/h for each simulated hour from the start; the last value holds after that. */
  rain: number[]
  drain: number
  /** P.1 level at the start and how fast it changes, m per hour. */
  p1Start: number
  p1Rise: number
  p1Critical: number
  /** Simulated seconds per real second. */
  speed: number
  running: boolean
}

export type ToWorker =
  | { type: 'init'; bounds: Bounds; zoom: number; p1: { lat: number; lng: number; bankMsl: number } }
  | { type: 'scenario'; scenario: Scenario }
  | { type: 'reset' }

export interface Frame {
  type: 'frame'
  time: number
  /** Depth per cell in metres; river cells are 0. */
  depth: Float32Array
  stats: SimStats
  p1Level: number
  rain: number
  /** Speed actually reached (the solver may not keep up with the fastest setting). */
  speed: number
}

export type FromWorker =
  | { type: 'ready'; grid: Omit<Grid, 'z' | 'river'>; z: Float32Array; river: Uint8Array; bias: number }
  | Frame
  | { type: 'error'; message: string }

const SIM_END = 48 * 3600
const FRAME_MS = 200
const TERRAIN_URL = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium'

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
      const fit = fitRiver(grid, { line: PING_RIVER, ref: msg.p1 })
      solver = new FloodSolver(grid)
      const { z, river, ...meta } = grid
      post({ type: 'ready', grid: meta, z: z.slice(), river: river.slice(), bias: fit.bias })
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
  for (let ty = f.py0 >> 8; ty <= (f.py0 + f.ny - 1) >> 8; ty++)
    for (let tx = f.px0 >> 8; tx <= (f.px0 + f.nx - 1) >> 8; tx++) tile(tx, ty)
  for (let j = 0; j < f.ny; j++) {
    for (let i = 0; i < f.nx; i++) {
      const px = f.px0 + i
      const py = f.py0 + j
      const data = await tile(px >> 8, py >> 8)
      const o = ((py & 255) * 256 + (px & 255)) * 4
      surface[j * f.nx + i] = terrarium(data[o], data[o + 1], data[o + 2])
    }
  }
  return { ...f, zoom, z: groundFromSurface(surface, f.nx, f.ny), river: new Uint8Array(f.nx * f.ny) }
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

/** Scenario values at simulated time t. */
function inputsAt(s: Scenario, t: number) {
  const hour = Math.floor(t / 3600)
  const rain = s.rain[Math.min(hour, s.rain.length - 1)] ?? 0
  const p1Level = Math.max(0, s.p1Start + (s.p1Rise * t) / 3600)
  return { rain, drain: s.drain, p1Level, riverHead: p1Level - s.p1Critical }
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
    const { rain, drain, riverHead } = inputsAt(scenario, solver.time)
    solver.step({ rain, drain, riverHead }, target - solver.time)
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
  const { river } = solver.grid
  const depth = solver.h.slice()
  for (let k = 0; k < depth.length; k++) if (river[k]) depth[k] = 0
  const at = scenario ? inputsAt(scenario, solver.time) : { p1Level: 0, rain: 0 }
  const speed = measured.real > 0.5 ? measured.sim / measured.real : (scenario?.speed ?? 0)
  if (measured.real > 3) measured = { real: 0, sim: 0 } // a rolling-ish window
  post(
    { type: 'frame', time: solver.time, depth, stats: solver.stats(), p1Level: at.p1Level, rain: at.rain, speed },
    [depth.buffer],
  )
}
