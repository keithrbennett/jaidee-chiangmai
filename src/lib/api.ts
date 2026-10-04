import { useCallback, useEffect, useState } from 'react'

/** One river or canal gauge (RID SWOC or Thaiwater). See server/feeds.js. */
export interface Station {
  code: string
  name: string
  river: string | null
  province: string | null
  lat: number
  lng: number
  agency: string
  levelMsl: number | null
  bankMsl: number | null
  /** Metres above (+) or below (−) the lowest bank, as the agency publishes it. */
  over: number | null
  /** Level as % of bank-full. */
  pct: number | null
  trend: 'up' | 'down' | 'steady' | null
  flow: number | null
  /** Reading on the gauge's own scale and its critical level, where published (P.1: 3.7 m). */
  gauge: { level: number | null; critical: number | null } | null
  observedAt: string
  source: 'rid' | 'thaiwater'
}

export interface Dam {
  id: number
  th: string
  en: string
  lat: number
  lng: number
  province: string | null
  storage: number | null
  storagePct: number | null
  usablePct: number | null
  capacity: number | null
  inflow: number | null
  released: number | null
  spilled: number | null
  date: string
  agency: string
}

/** Compact rain gauge: [lng, lat, rain24h, rain1h, province, name, agency, observedAt]. */
export type RainRow = [number, number, number | null, number | null, string | null, string, string, string]

export interface AirStation {
  id: string
  th: string
  en: string
  lat: number
  lng: number
  province: string | null
  aqi: number
  pm25: number | null
  observedAt: string
}

export interface Forecast {
  /** [time ISO, mm, chance %] for the next 48 hours. */
  hourly: [string, number, number][]
  daily: { date: string; rain: number; chance: number; code: number; wind: number }[]
}

export interface Camera {
  id: number
  title: string
  description: string
  lat: number
  lng: number
  province: string | null
  kind: 'image' | 'link'
  url: string
  agency: string
}

export interface Shelter {
  id: string
  name: string
  lat: number
  lng: number
  capacity: number | null
  occupancy: number | null
  contact: string | null
  status: 'open' | 'full' | 'closed'
  note: string | null
  updated_at: number
}

export interface CommandCenter {
  active: number
  name?: string | null
  hotline?: string | null
}

export interface National {
  stations: Station[]
  dams: Dam[]
  storms: { name: string; lat: number | null; lng: number | null; at: string | null; wind: number | null }[]
  commandCenters: { province: string; name: string | null; hotline: string | null }[]
  updatedAt: number | null
}

/** One alert from the warning engine (server/alerts.js). Level 1 watch, 2 warning, 3 danger. */
export interface Alert {
  id: string
  hazard: 'flood' | 'rain' | 'landslide' | 'air' | 'fire' | 'quake' | 'tsunami'
  kind?: 'river' | 'satellite'
  level: 1 | 2 | 3
  provinces: string[]
  data: Record<string, unknown>
  at: string
  source: string
  url?: string
}

export interface Quake {
  id: string
  place: string | null
  near: string | null
  lat: number
  lng: number
  depth: number | null
  mag: number | null
  at: string
  tsunami: boolean
  url: string | null
  source: 'tmd' | 'usgs'
  distance?: number
}

/** Compact fire hotspot: [lng, lat, province, land use, fire power MW, time ISO, country]. */
export type HotspotRow = [number, number, string | null, string | null, number | null, string, string | null]

export interface Hazards {
  hotspots: HotspotRow[]
  quakes: Quake[]
  /** Flooded H3 cells (about 0.06 km² of water each on average) per province, past 7 days. */
  satFlood: Record<string, number>
}

export interface ProvinceData {
  alerts: Alert[]
  hotspots: HotspotRow[]
  quakes: Quake[]
  satFloodCells: number
  airForecast: { date: string; mean: number; max: number }[] | null
  stations: Station[]
  rain: RainRow[]
  dams: Dam[]
  air: AirStation[]
  forecast: Forecast | null
  cctv: Camera[]
  commandCenter: CommandCenter
  shelters: Shelter[]
}

/** A water level report from the public. Levels: 0 dry … 5 over head. */
export interface Report {
  id: string
  createdAt: number
  province: string
  district: string | null
  tambon: string | null
  lat: number
  lng: number
  level: number
  trend: 'rising' | 'steady' | 'falling' | null
  passable: 'car' | 'high' | 'boat' | null
  note: string | null
  photo: string | null
  stillCount: number
  recededCount: number
  lastStillAt: number | null
  recededAt: number | null
}

export interface LostFound {
  id: string
  createdAt: number
  province: string
  kind: 'lost' | 'found'
  category: string
  title: string
  description: string | null
  place: string | null
  contact: string
  photo: string | null
  status: 'open' | 'resolved'
}

/** A volunteer need card, as published by command centre staff. */
export interface NeedCard {
  id: string
  title: string
  description: string
  category: string
  urgent: boolean
  place: string
  partner: string
  contact: string
  when: string
  hours: number
  spots: number
  skills: string[]
  province: string
  lat: number
  lng: number
  verifiedBy: string
  verifiedAt: number
}

export class ApiError extends Error {
  status: number
  field?: string
  constructor(status: number, code: string, field?: string) {
    super(code)
    this.status = status
    this.field = field
  }
}

export async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: init?.method ?? (init?.body ? 'POST' : 'GET'),
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    body: init?.body ? JSON.stringify(init.body) : undefined,
    credentials: 'same-origin',
  })
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new ApiError(res.status, data?.error ?? 'error', data?.field)
  return data as T
}

/**
 * Load an API path, refresh it every `refreshMs` (0 = never), keep the last good answer if a refresh fails.
 * `reload` fetches again now (after the person posts something, say).
 */
export function useApi<T>(path: string | null, refreshMs = 10 * 60_000) {
  const [state, setState] = useState<{ path: string | null; data: T | null; error: boolean }>({ path, data: null, error: false })
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (!path) return
    let cancelled = false
    const load = () =>
      api<T>(path)
        .then((data) => !cancelled && setState({ path, data, error: false }))
        .catch(() => !cancelled && setState((s) => ({ path, data: s.path === path ? s.data : null, error: true })))
    load()
    const timer = refreshMs ? setInterval(load, refreshMs) : undefined
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [path, refreshMs, tick])
  const reload = useCallback(() => setTick((t) => t + 1), [])
  const current = state.path === path
  return { data: current ? state.data : null, error: current && state.error, loading: current ? !state.data && !state.error : !!path, reload }
}
