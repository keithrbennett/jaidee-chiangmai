/**
 * The simulation grid: one cell per Web Mercator pixel of the terrain tiles at `zoom` (about 36 m in
 * Chiang Mai at zoom 12, which is also the real resolution of the SRTM data behind those tiles).
 * Aligning cells with tile pixels means the depth raster drops straight onto the map with no resampling.
 *
 * Everything here is plain arithmetic on typed arrays, so it runs in the worker and in Node tests alike.
 */

export interface Bounds {
  west: number
  south: number
  east: number
  north: number
}

export interface Grid {
  nx: number
  ny: number
  /** Cell size in metres. */
  dx: number
  zoom: number
  /** Mercator pixel (at `zoom`) of the top-left corner of cell 0. */
  px0: number
  py0: number
  /** Ground elevation in DEM metres, row-major from the north-west corner. River cells hold the bank crest. */
  z: Float32Array
  /** 1 for river channel cells. */
  river: Uint8Array
}

/** The river channel and its reference gauge. */
export interface RiverCalibration {
  /** Ping River centre line, upstream first, [lng, lat]. */
  line: [number, number][]
  /** Reference gauge (P.1) and the real height of its lowest bank, m above mean sea level. */
  ref: { lat: number; lng: number; bankMsl: number }
}

/** How the river was fitted to the terrain, for tests and the notes on the page. */
export interface RiverFit {
  /** Bank height the DEM gives at the reference gauge minus its real bank height. Informational. */
  bias: number
  riverCells: number
}

const TILE = 256
const EARTH_CIRCUMFERENCE = 40075016.686
/** Cells whose centre is this close to the centre line are channel. Over half a cell diagonal, so the channel has no gaps. */
const CHANNEL_HALF_WIDTH_M = 30
/** Banks are read per stretch of river this long… */
const BANK_STRETCH_M = 250
/** …from land within this distance of the channel… */
const BANK_RADIUS_M = 110
/** …taking this percentile (low, so a row of buildings on the bank doesn't count as levee)… */
const BANK_PERCENTILE = 0.3
/** …and averaging over this many stretches either side. */
const BANK_SMOOTH = 2
/** Opening radius in cells for groundFromSurface (2 cells ≈ 70 m either side). */
const OPEN_RADIUS = 2

export const lngToPx = (lng: number, zoom: number) => ((lng + 180) / 360) * TILE * 2 ** zoom
export const latToPx = (lat: number, zoom: number) => {
  const r = (lat * Math.PI) / 180
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * TILE * 2 ** zoom
}
export const pxToLng = (px: number, zoom: number) => (px / (TILE * 2 ** zoom)) * 360 - 180
export const pxToLat = (py: number, zoom: number) => {
  const n = Math.PI - (2 * Math.PI * py) / (TILE * 2 ** zoom)
  return (Math.atan(Math.sinh(n)) * 180) / Math.PI
}

/** Pixel window and cell size covering `bounds` at `zoom`. */
export function gridFrame(bounds: Bounds, zoom: number) {
  const px0 = Math.floor(lngToPx(bounds.west, zoom))
  const py0 = Math.floor(latToPx(bounds.north, zoom))
  const nx = Math.ceil(lngToPx(bounds.east, zoom)) - px0
  const ny = Math.ceil(latToPx(bounds.south, zoom)) - py0
  const midLat = (bounds.north + bounds.south) / 2
  const dx = (EARTH_CIRCUMFERENCE * Math.cos((midLat * Math.PI) / 180)) / (TILE * 2 ** zoom)
  return { px0, py0, nx, ny, dx }
}

/** Corners of the grid as [lng, lat], clockwise from the north-west, as MapLibre image sources want them. */
export function gridCorners(
  g: Pick<Grid, 'px0' | 'py0' | 'nx' | 'ny' | 'zoom'>,
): [[number, number], [number, number], [number, number], [number, number]] {
  const w = pxToLng(g.px0, g.zoom)
  const e = pxToLng(g.px0 + g.nx, g.zoom)
  const n = pxToLat(g.py0, g.zoom)
  const s = pxToLat(g.py0 + g.ny, g.zoom)
  return [
    [w, n],
    [e, n],
    [e, s],
    [w, s],
  ]
}

/** Cell index under a point, or -1 outside the grid. */
export function cellAt(g: Pick<Grid, 'px0' | 'py0' | 'nx' | 'ny' | 'zoom'>, lng: number, lat: number) {
  const i = Math.floor(lngToPx(lng, g.zoom) - g.px0)
  const j = Math.floor(latToPx(lat, g.zoom) - g.py0)
  return i < 0 || j < 0 || i >= g.nx || j >= g.ny ? -1 : j * g.nx + i
}

/** Centre of a cell as [lng, lat]. */
export function cellCenter(g: Pick<Grid, 'px0' | 'py0' | 'nx' | 'zoom'>, k: number): [number, number] {
  const i = k % g.nx
  const j = (k - i) / g.nx
  return [pxToLng(g.px0 + i + 0.5, g.zoom), pxToLat(g.py0 + j + 0.5, g.zoom)]
}

/**
 * Mark the river channel and set each channel cell to the height of its banks, in DEM terms: a low
 * percentile of the land within BANK_RADIUS_M of the channel at that point, smoothed along the river.
 * Taking the banks from the terrain beside the river (rather than one straight line from the gauge)
 * keeps the floodplain from sitting metres below the river where the DEM drifts.
 *
 * The flood model then holds the river at `crest + (P.1 level − critical level)`, so by construction the
 * Ping starts to spill at the gauge's real critical level, and the terrain decides where the water goes.
 * Mutates `z` and `river`.
 */
export function fitRiver(grid: Grid, cal: RiverCalibration): RiverFit {
  const { nx, ny, dx, zoom, px0, py0, z, river } = grid
  const chain = new Float32Array(nx * ny).fill(NaN)
  const best = new Float32Array(nx * ny).fill(Infinity)
  const pts = cal.line.map(([lng, lat]) => [lngToPx(lng, zoom) - px0, latToPx(lat, zoom) - py0])
  const reach = CHANNEL_HALF_WIDTH_M / dx

  let s0 = 0 // chainage at the start of the segment, metres
  for (let p = 0; p + 1 < pts.length; p++) {
    const [ax, ay] = pts[p]
    const [bx, by] = pts[p + 1]
    const len2 = (bx - ax) ** 2 + (by - ay) ** 2
    const len = Math.sqrt(len2)
    const i0 = Math.max(0, Math.floor(Math.min(ax, bx) - reach))
    const i1 = Math.min(nx - 1, Math.ceil(Math.max(ax, bx) + reach))
    const j0 = Math.max(0, Math.floor(Math.min(ay, by) - reach))
    const j1 = Math.min(ny - 1, Math.ceil(Math.max(ay, by) + reach))
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const cx = i + 0.5
        const cy = j + 0.5
        const t = len2 ? Math.max(0, Math.min(1, ((cx - ax) * (bx - ax) + (cy - ay) * (by - ay)) / len2)) : 0
        const d = Math.hypot(cx - (ax + t * (bx - ax)), cy - (ay + t * (by - ay)))
        const k = j * nx + i
        if (d <= reach && d < best[k]) {
          best[k] = d
          chain[k] = s0 + t * len * dx
          river[k] = 1
        }
      }
    }
    s0 += len * dx
  }

  // Bank height per stretch of river: low percentile of the land within BANK_RADIUS_M of the channel.
  const stretches = Math.ceil(s0 / BANK_STRETCH_M) + 1
  const samples: number[][] = Array.from({ length: stretches }, () => [])
  const r = Math.ceil(BANK_RADIUS_M / dx)
  for (let k = 0; k < nx * ny; k++) {
    if (!river[k]) continue
    const i = k % nx
    const j = (k - i) / nx
    const bucket = samples[Math.floor(chain[k] / BANK_STRETCH_M)]
    for (let v = Math.max(0, j - r); v <= Math.min(ny - 1, j + r); v++) {
      for (let u = Math.max(0, i - r); u <= Math.min(nx - 1, i + r); u++) {
        const n = v * nx + u
        if (!river[n]) bucket.push(z[n])
      }
    }
  }
  const raw = samples.map((b) => {
    if (!b.length) return NaN
    b.sort((x, y) => x - y)
    return b[Math.floor(b.length * BANK_PERCENTILE)]
  })
  // Fill gaps, then smooth along the river so one odd stretch doesn't make a hole in the bank.
  for (let q = 0; q < raw.length; q++) if (Number.isNaN(raw[q])) raw[q] = raw[q - 1] ?? raw.find((x) => !Number.isNaN(x)) ?? 0
  const crest = raw.map((_, q) => {
    let sum = 0
    let n = 0
    for (let w = Math.max(0, q - BANK_SMOOTH); w <= Math.min(raw.length - 1, q + BANK_SMOOTH); w++) {
      sum += raw[w]
      n++
    }
    return sum / n
  })
  const crestAt = (s: number) => {
    const f = Math.max(0, Math.min(crest.length - 1, s / BANK_STRETCH_M - 0.5))
    const q = Math.floor(f)
    return crest[q] + (crest[Math.min(q + 1, crest.length - 1)] - crest[q]) * (f - q)
  }

  let riverCells = 0
  for (let k = 0; k < nx * ny; k++) {
    if (!river[k]) continue
    riverCells++
    z[k] = crestAt(chain[k])
  }
  const sRef = chainageOf(cal.line, cal.ref, zoom, dx)
  return { bias: crestAt(sRef) - cal.ref.bankMsl, riverCells }
}

/**
 * Take roofs and trees out of a surface model so it reads closer to the ground: a grey-scale opening
 * (minimum, then maximum, over a square window) removes bumps narrower than the window; a small closing
 * then fills single-cell pits, which in SRTM are noise rather than real hollows. Returns a new array.
 */
export function groundFromSurface(z: Float32Array, nx: number, ny: number): Float32Array {
  const opened = morph(morph(z, nx, ny, OPEN_RADIUS, Math.min), nx, ny, OPEN_RADIUS, Math.max)
  return morph(morph(opened, nx, ny, 1, Math.max), nx, ny, 1, Math.min)
}

/** Separable square min or max filter of the given radius. */
function morph(src: Float32Array, nx: number, ny: number, radius: number, pick: (a: number, b: number) => number) {
  const tmp = new Float32Array(src.length)
  const out = new Float32Array(src.length)
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      let v = src[j * nx + i]
      for (let u = Math.max(0, i - radius); u <= Math.min(nx - 1, i + radius); u++) v = pick(v, src[j * nx + u])
      tmp[j * nx + i] = v
    }
  }
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      let v = tmp[j * nx + i]
      for (let w = Math.max(0, j - radius); w <= Math.min(ny - 1, j + radius); w++) v = pick(v, tmp[w * nx + i])
      out[j * nx + i] = v
    }
  }
  return out
}

/** Distance along the line (metres) of the point on it closest to `p`. */
function chainageOf(line: [number, number][], p: { lat: number; lng: number }, zoom: number, dx: number) {
  const px = lngToPx(p.lng, zoom)
  const py = latToPx(p.lat, zoom)
  let bestD = Infinity
  let bestS = 0
  let s0 = 0
  for (let k = 0; k + 1 < line.length; k++) {
    const ax = lngToPx(line[k][0], zoom)
    const ay = latToPx(line[k][1], zoom)
    const bx = lngToPx(line[k + 1][0], zoom)
    const by = latToPx(line[k + 1][1], zoom)
    const len2 = (bx - ax) ** 2 + (by - ay) ** 2
    const t = len2 ? Math.max(0, Math.min(1, ((px - ax) * (bx - ax) + (py - ay) * (by - ay)) / len2)) : 0
    const d = Math.hypot(px - (ax + t * (bx - ax)), py - (ay + t * (by - ay)))
    const len = Math.sqrt(len2)
    if (d < bestD) {
      bestD = d
      bestS = s0 + t * len * dx
    }
    s0 += len * dx
  }
  return bestS
}

/** Decode one Terrarium-encoded pixel (Mapzen / AWS Terrain Tiles) to metres. */
export const terrarium = (r: number, g: number, b: number) => r * 256 + g + b / 256 - 32768
