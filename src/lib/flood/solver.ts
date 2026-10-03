import type { Grid } from './grid'

/**
 * 2D flood model: the local inertial form of the shallow water (Saint-Venant) equations on a regular
 * grid, after Bates, Horritt & Fewtrell (2010), the scheme behind LISFLOOD-FP. Fluxes live on cell faces
 * and are updated explicitly with semi-implicit Manning friction; depths follow from mass balance.
 *
 * Inputs per step: rain on every land cell, a drainage loss standing in for the storm drains (we have
 * no pipe network, so no SWMM yet), and the river. River cells are a fixed-level boundary: they hold
 * water above the bank crest equal to how far P.1 is above its critical level, so the Ping spills where
 * the terrain lets it and takes water back where the town is higher than the river.
 *
 * Grid edges let water flow out freely.
 */

export interface StepInputs {
  /** Rain, mm per hour. */
  rain: number
  /** Storm-drain and soak-away capacity, mm per hour, taken from any land cell holding water. */
  drain: number
  /** Height of the river above its bank crest, m (P.1 level − 3.7 m). Negative means no spill. */
  riverHead: number
}

export interface SimStats {
  /** Land area with at least FLOODED_DEPTH of water, km². */
  floodedKm2: number
  /** Median depth over that area, m. (Not the maximum: the deepest cells are usually pits in the terrain data.) */
  typicalDepth: number
}

const G = 9.81
/** Faces with less flow depth than this carry no water. */
const DRY = 0.001
/** Courant number for the adaptive time step (Bates et al. suggest 0.7). */
const ALPHA = 0.7
const MAX_DT = 10
/** Manning's n for an urban floodplain. */
const MANNING = 0.04
/** Depth that counts as flooded for the area figure, m. */
export const FLOODED_DEPTH = 0.1

export class FloodSolver {
  readonly grid: Grid
  /** Water depth per cell, m. On river cells: depth above the bank crest. */
  readonly h: Float32Array
  /** Discharge per unit width across the west face of each cell, (nx + 1) × ny, m²/s. Positive eastward. */
  private qx: Float32Array
  /** Discharge per unit width across the north face of each cell, nx × (ny + 1), m²/s. Positive southward. */
  private qy: Float32Array
  /** Simulated seconds since the start. */
  time = 0
  private hmax = 0

  constructor(grid: Grid) {
    this.grid = grid
    const { nx, ny } = grid
    this.h = new Float32Array(nx * ny)
    this.qx = new Float32Array((nx + 1) * ny)
    this.qy = new Float32Array(nx * (ny + 1))
  }

  reset() {
    this.h.fill(0)
    this.qx.fill(0)
    this.qy.fill(0)
    this.time = 0
    this.hmax = 0
  }

  /** Advance by one stable time step (at most `maxDt` seconds). Returns the step taken. */
  step(inputs: StepInputs, maxDt = MAX_DT): number {
    const { nx, ny, dx, z, river } = this.grid
    const { h, qx, qy } = this
    const riverDepth = Math.max(0, inputs.riverHead)
    const dt = Math.min(maxDt, MAX_DT, (ALPHA * dx) / Math.sqrt(G * Math.max(this.hmax, riverDepth, 0.01)))
    const n2 = MANNING * MANNING
    const gdt = G * dt

    // Faces between cells a (west/north) and b (east/south); outside the grid is a dry cell at the same height.
    const volCap = dx / (4 * dt)
    const flux = (q: number, a: number, b: number, za: number, zb: number) => {
      const ha = a >= 0 ? h[a] : 0
      const hb = b >= 0 ? h[b] : 0
      const wa = za + ha
      const wb = zb + hb
      const hf = Math.max(wa, wb) - Math.max(za, zb)
      if (hf <= DRY) return 0
      q = (q - gdt * hf * ((wb - wa) / dx)) / (1 + (gdt * n2 * Math.abs(q)) / hf ** (7 / 3))
      // SRTM is noisy (metres between neighbouring cells), where this scheme oscillates. Two limiters keep it
      // stable: flow stays subcritical (Froude ≤ 1), and no cell sends out more than a quarter of its water
      // through one face in one step, so depths never go negative. River cells are an endless supply.
      let cap = hf * Math.sqrt(G * hf)
      const donor = q > 0 ? a : b
      if (donor >= 0 && !river[donor]) cap = Math.min(cap, (q > 0 ? ha : hb) * volCap)
      return q > cap ? cap : q < -cap ? -cap : q
    }

    for (let j = 0; j < ny; j++) {
      const row = j * nx
      const frow = j * (nx + 1)
      // West edge: water may only leave.
      qx[frow] = Math.min(0, flux(qx[frow], -1, row, z[row], z[row]))
      for (let i = 1; i < nx; i++) qx[frow + i] = flux(qx[frow + i], row + i - 1, row + i, z[row + i - 1], z[row + i])
      const last = row + nx - 1
      qx[frow + nx] = Math.max(0, flux(qx[frow + nx], last, -1, z[last], z[last]))
    }
    for (let i = 0; i < nx; i++) qy[i] = Math.min(0, flux(qy[i], -1, i, z[i], z[i]))
    for (let j = 1; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const b = j * nx + i
        qy[b] = flux(qy[b], b - nx, b, z[b - nx], z[b])
      }
    }
    for (let i = 0; i < nx; i++) {
      const a = (ny - 1) * nx + i
      qy[ny * nx + i] = Math.max(0, flux(qy[ny * nx + i], a, -1, z[a], z[a]))
    }

    const rain = (inputs.rain / 1000 / 3600) * dt
    const drain = (inputs.drain / 1000 / 3600) * dt
    let hmax = riverDepth
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i
        if (river[k]) {
          h[k] = riverDepth
          continue
        }
        const fx = j * (nx + 1) + i
        const net = (qx[fx] - qx[fx + 1] + qy[k] - qy[k + nx]) * (dt / dx)
        let d = h[k] + net + rain
        d = d > drain ? d - drain : 0
        h[k] = d
        if (d > hmax) hmax = d
      }
    }
    this.hmax = hmax
    this.time += dt
    return dt
  }

  stats(): SimStats {
    const { river, dx } = this.grid
    // Median from a 1 cm histogram: one pass, no sorting of 100 000+ values five times a second.
    const bins = new Uint32Array(1001)
    let wet = 0
    for (let k = 0; k < this.h.length; k++) {
      const d = this.h[k]
      if (river[k] || d < FLOODED_DEPTH) continue
      wet++
      bins[Math.min(1000, Math.round(d * 100))]++
    }
    let typicalDepth = 0
    for (let b = 0, seen = 0; b < bins.length && wet; b++) {
      seen += bins[b]
      if (seen * 2 >= wet) {
        typicalDepth = b / 100
        break
      }
    }
    return { floodedKm2: (wet * dx * dx) / 1e6, typicalDepth }
  }
}
