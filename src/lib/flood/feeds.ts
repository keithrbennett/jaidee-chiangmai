import { useEffect, useState } from 'react'

/** One water-level station from GET /api/flood (Thaiwater). */
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
  /** Reading on the gauge's own scale, for gauges that have one (e.g. P.1). */
  level: number | null
  critical: number | null
  observedAt: string
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
  /** Hourly rain forecast for the city centre, mm per hour. */
  forecast: { time: string; mm: number }[] | null
}

/** The Ping River gauge at Nawarat Bridge, the city's reference for floods (RID). */
export const P1 = { code: 'P.1', lat: 18.786961, lng: 99.005089, bankMsl: 304.2, critical: 3.7 }

/** RID river gauges have codes like P.1, P.67; the rest are other agencies' telemetry stations. */
export const isRidGauge = (g: Gauge) => /^P\.\d/.test(g.code)

const REFRESH_MS = 10 * 60 * 1000

/** Live gauges, rain and forecast for the flood page, refreshed every 10 minutes. */
export function useFloodFeeds() {
  const [feeds, setFeeds] = useState<FloodFeeds | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    const load = () =>
      fetch('/api/flood')
        .then((res) => (res.ok ? (res.json() as Promise<FloodFeeds>) : null))
        .catch(() => null)
        .then((f) => {
          if (cancelled) return
          if (f) {
            // Keep the forecast from the current hour on.
            const hourAgo = Date.now() - 3600_000
            setFeeds({ ...f, forecast: f.forecast?.filter((h) => new Date(h.time).getTime() > hourAgo) ?? null })
          }
          setFailed(!f)
        })
    load()
    const timer = setInterval(load, REFRESH_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [])

  return { feeds, failed }
}
