/**
 * The simulation grid: one cell per Web Mercator pixel of the terrain tiles at `zoom` (about 36 m in
 * Thailand at zoom 12, which is also the real resolution of the SRTM data behind those tiles).
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
  /** 1 for river and canal channel cells: held at bank + the river head. */
  river: Uint8Array
  /** 1 for sea: water that reaches it leaves the model. */
  sea: Uint8Array
  /** 1 for lakes, ponds and reservoirs: already water, so not counted or drawn as flooding. */
  lake: Uint8Array
}

/** Water from the map, in grid cell coordinates (x = pixel − px0, y = pixel − py0). */
export interface WaterShapes {
  /** River and canal centre lines. */
  lines: [number, number][][]
  /** River areas, sea and lakes as polygons: [outer ring, ...holes]. */
  rivers: [number, number][][][]
  sea: [number, number][][][]
  lakes: [number, number][][][]
}

const TILE = 256
const EARTH_CIRCUMFERENCE = 40075016.686
/** Cells whose centre is this close to a river or canal line are channel. Over half a cell diagonal, so there are no gaps. */
const CHANNEL_HALF_WIDTH_M = 30
/** Banks are read from land within this distance of each channel cell… */
const BANK_RADIUS_M = 110
/** …taking this percentile (low, so a row of buildings on the bank doesn't count as levee)… */
const BANK_PERCENTILE = 0.3
/** …then averaged along the channel network this many times (about 350 m either way). */
const BANK_SMOOTH_PASSES = 10
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

/** Lay the map's water onto the grid: river areas, sea and lakes filled, river and canal lines widened. */
export function rasterizeWater(grid: Grid, w: WaterShapes) {
  const { river, sea, lake, dx } = grid
  for (const p of w.rivers) fillPolygon(grid, p, river)
  for (const p of w.sea) fillPolygon(grid, p, sea)
  for (const p of w.lakes) fillPolygon(grid, p, lake)
  for (const line of w.lines) markLine(grid, line, CHANNEL_HALF_WIDTH_M / dx, river)
  for (let k = 0; k < river.length; k++) {
    // Where a river meets the sea, it is sea; a river through a lake is river.
    if (sea[k]) river[k] = lake[k] = 0
    else if (river[k]) lake[k] = 0
  }
}

/** Even–odd scanline fill of one polygon (outer ring and holes) by cell centres. */
function fillPolygon(grid: Grid, rings: [number, number][][], mask: Uint8Array) {
  const { nx, ny } = grid
  let y0 = Infinity
  let y1 = -Infinity
  for (const r of rings) {
    for (const [, y] of r) {
      if (y < y0) y0 = y
      if (y > y1) y1 = y
    }
  }
  const xs: number[] = []
  for (let j = Math.max(0, Math.floor(y0)); j <= Math.min(ny - 1, Math.ceil(y1)); j++) {
    const cy = j + 0.5
    xs.length = 0
    for (const r of rings) {
      for (let a = 0, b = r.length - 1; a < r.length; b = a++) {
        const [xa, ya] = r[a]
        const [xb, yb] = r[b]
        if (ya > cy !== yb > cy) xs.push(xa + ((cy - ya) * (xb - xa)) / (yb - ya))
      }
    }
    xs.sort((p, q) => p - q)
    for (let q = 0; q + 1 < xs.length; q += 2) {
      const i0 = Math.max(0, Math.ceil(xs[q] - 0.5))
      const i1 = Math.min(nx - 1, Math.floor(xs[q + 1] - 0.5))
      for (let i = i0; i <= i1; i++) mask[j * nx + i] = 1
    }
  }
}

/** Mark the cells within `reach` cells of a polyline. */
function markLine(grid: Grid, pts: [number, number][], reach: number, mask: Uint8Array) {
  const { nx, ny } = grid
  for (let p = 0; p + 1 < pts.length; p++) {
    const [ax, ay] = pts[p]
    const [bx, by] = pts[p + 1]
    const len2 = (bx - ax) ** 2 + (by - ay) ** 2
    const i0 = Math.max(0, Math.floor(Math.min(ax, bx) - reach))
    const i1 = Math.min(nx - 1, Math.ceil(Math.max(ax, bx) + reach))
    const j0 = Math.max(0, Math.floor(Math.min(ay, by) - reach))
    const j1 = Math.min(ny - 1, Math.ceil(Math.max(ay, by) + reach))
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const cx = i + 0.5
        const cy = j + 0.5
        const t = len2 ? Math.max(0, Math.min(1, ((cx - ax) * (bx - ax) + (cy - ay) * (by - ay)) / len2)) : 0
        if (Math.hypot(cx - (ax + t * (bx - ax)), cy - (ay + t * (by - ay))) <= reach) mask[j * nx + i] = 1
      }
    }
  }
}

/**
 * Set each channel cell to the height of its banks, in DEM terms: a low percentile of the land within
 * BANK_RADIUS_M, carried into wide rivers from their edges, then smoothed along the channel network. Taking
 * the banks from the terrain beside the river keeps the floodplain from sitting metres below the river where
 * the DEM drifts. The model then holds the river at `bank + head`, where head is how far the reference gauge
 * is above (+) or below (−) its bank, so the river spills where the terrain lets it. Mutates `z`.
 */
export function fitBanks(grid: Grid): { channelCells: number } {
  const { nx, ny, dx, z, river, sea, lake } = grid
  const n = nx * ny
  const r = Math.ceil(BANK_RADIUS_M / dx)
  const crest = new Float32Array(n).fill(NaN)
  const land = (k: number) => !river[k] && !sea[k] && !lake[k]
  const buf: number[] = []
  let channelCells = 0
  for (let k = 0; k < n; k++) {
    if (!river[k]) continue
    channelCells++
    const i = k % nx
    const j = (k - i) / nx
    buf.length = 0
    for (let v = Math.max(0, j - r); v <= Math.min(ny - 1, j + r); v++)
      for (let u = Math.max(0, i - r); u <= Math.min(nx - 1, i + r); u++) if (land(v * nx + u)) buf.push(z[v * nx + u])
    if (buf.length) {
      buf.sort((a, b) => a - b)
      crest[k] = buf[Math.floor(buf.length * BANK_PERCENTILE)]
    }
  }
  // The middle of a wide river (the Chao Phraya is 300 m) has no land in reach: take the nearest edge's value.
  const queue: number[] = []
  for (let k = 0; k < n; k++) if (river[k] && !Number.isNaN(crest[k])) queue.push(k)
  for (let q = 0; q < queue.length; q++) {
    const k = queue[q]
    const i = k % nx
    for (const nb of [k - 1, k + 1, k - nx, k + nx]) {
      if (nb < 0 || nb >= n || (nb === k - 1 && i === 0) || (nb === k + 1 && i === nx - 1)) continue
      if (river[nb] && Number.isNaN(crest[nb])) {
        crest[nb] = crest[k]
        queue.push(nb)
      }
    }
  }
  // Smooth along the network so one odd stretch doesn't make a hole in the bank.
  const next = new Float32Array(n)
  for (let pass = 0; pass < BANK_SMOOTH_PASSES; pass++) {
    for (let k = 0; k < n; k++) {
      if (!river[k] || Number.isNaN(crest[k])) continue
      const i = k % nx
      let sum = crest[k]
      let cnt = 1
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const u = i + di
          const nb = k + dj * nx + di
          if ((di === 0 && dj === 0) || u < 0 || u >= nx || nb < 0 || nb >= n || !river[nb] || Number.isNaN(crest[nb])) continue
          sum += crest[nb]
          cnt++
        }
      }
      next[k] = sum / cnt
    }
    for (let k = 0; k < n; k++) if (river[k] && !Number.isNaN(crest[k])) crest[k] = next[k]
  }
  for (let k = 0; k < n; k++) if (river[k] && !Number.isNaN(crest[k])) z[k] = crest[k]
  return { channelCells }
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

/** Decode one Terrarium-encoded pixel (Mapzen / AWS Terrain Tiles) to metres. */
export const terrarium = (r: number, g: number, b: number) => r * 256 + g + b / 256 - 32768
