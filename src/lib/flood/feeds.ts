import { useEffect, useState } from 'react'
import type { Station } from '../api'

/** One water-level station as the simulator uses it. */
export interface Gauge {
  code: string
  name: string
  river: string
  agency: string
  lat: number
  lng: number
  /** Water surface and lowest bank, m above mean sea level. */
  levelMsl: number | null
  bankMsl: number | null
  /** Metres above (+) or below (−) the bank, as the agency publishes it. */
  over: number | null
  /** Reading on the gauge's own scale, for gauges that have one (e.g. P.1). */
  level: number | null
  critical: number | null
  observedAt: string
}

/** A place to simulate: a gauge with a bank level (the river is held at bank + how far it is over). */
export interface Spot {
  code: string
  name: string
  river: string | null
  lng: number
  lat: number
  over: number
  observedAt: string
  /** Distance from the provincial city, km. */
  km: number
}

export interface RainGauge {
  name: string
  agency: string
  lat: number
  lng: number
  rain1h: number | null
  rain24h: number | null
  observedAt: string
}

export interface FloodFeeds {
  gauges: Gauge[] | null
  rain: RainGauge[] | null
  /** Hourly rain forecast for the province centre, mm per hour. */
  forecast: { time: string; mm: number }[] | null
  /** The provincial city, [lng, lat]. */
  city: [number, number] | null
  /** Gauges to simulate around, nearest the city first. */
  spots: Spot[]
}

/** RID's own river gauges (P.1, C.2, Y.1C …) stand out on the map; the rest are other agencies' telemetry. */
export const isRidGauge = (g: Gauge) => g.agency === 'RID' || /^[A-Z]{1,2}\.\d/.test(g.code)

const REFRESH_MS = 10 * 60 * 1000

/** What GET /api/flood/:code sends: gauges in the shared station shape (see src/lib/api.ts). */
interface FloodResponse {
  gauges: Station[] | null
  rain: RainGauge[] | null
  forecast: { time: string; mm: number }[] | null
  city: [number, number] | null
  spots: Spot[]
}

const toGauge = (s: Station): Gauge => ({
  code: s.code,
  name: s.name,
  river: s.river ?? '',
  agency: s.agency,
  lat: s.lat,
  lng: s.lng,
  levelMsl: s.levelMsl,
  bankMsl: s.bankMsl,
  over: s.over,
  level: s.gauge?.level ?? null,
  critical: s.gauge?.critical ?? null,
  observedAt: s.observedAt,
})

/** Live gauges, rain, forecast and spots for a province, refreshed every 10 minutes. */
export function useFloodFeeds(code: string) {
  const [feeds, setFeeds] = useState<FloodFeeds | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = () =>
      fetch(`/api/flood/${code}`)
        .then((res) => (res.ok ? (res.json() as Promise<FloodResponse>) : null))
        .catch(() => null)
        .then((f) => {
          if (cancelled) return
          if (f) {
            // Keep the forecast from the current hour on.
            const hourAgo = Date.now() - 3600_000
            setFeeds({
              gauges: f.gauges?.map(toGauge) ?? null,
              rain: f.rain,
              forecast: f.forecast?.filter((h) => new Date(h.time).getTime() > hourAgo) ?? null,
              city: f.city,
              spots: f.spots ?? [],
            })
          }
          setFailed(!f)
        })
    load()
    const timer = setInterval(load, REFRESH_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [code])

  return { feeds, failed }
}
