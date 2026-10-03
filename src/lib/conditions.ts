import { useEffect, useState } from 'react'
import { LANGUAGES, type Lang } from '../i18n'

/** Air quality in Chiang Mai from Air4Thai, on the Thai AQI scale. Shape matches GET /api/conditions. */
export interface AirReading {
  aqi: number
  pm25: number | null
  station: { en: string; th: string }
  /** ISO time of the reading (Bangkok). */
  observedAt: string
  source: string
}

/** Ping River level at gauge P.1 (Nawarat Bridge), in metres on the gauge's own scale. */
export interface RiverReading {
  level: number
  /** Level at which the river starts to flood the city; 3.7 m at P.1. */
  critical: number
  observedAt: string
  source: string
}

/** Each reading is null when its source is down and the server has nothing cached. */
export interface Conditions {
  air: AirReading | null
  river: RiverReading | null
}

const REFRESH_MS = 10 * 60 * 1000 // the server caches for 10 minutes too

/**
 * Band on the Thai AQI scale (Pollution Control Department), 0 = very good … 4 = affects health.
 * Bands: 0–25, 26–50, 51–100, 101–200, 201+.
 */
export type AqiBand = 0 | 1 | 2 | 3 | 4

export function aqiBand(aqi: number): AqiBand {
  if (aqi <= 25) return 0
  if (aqi <= 50) return 1
  if (aqi <= 100) return 2
  if (aqi <= 200) return 3
  return 4
}

/** Live air and river readings, refreshed every 10 minutes. `null` until the first answer, or if the API is unreachable. */
export function useConditions() {
  const [conditions, setConditions] = useState<Conditions | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = () =>
      fetch('/api/conditions')
        .then((res) => (res.ok ? (res.json() as Promise<Conditions>) : null))
        .catch(() => null)
        .then((c) => {
          // Keep the last good answer if a refresh fails.
          if (!cancelled && c) setConditions(c)
        })
    load()
    const timer = setInterval(load, REFRESH_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [])

  return conditions
}

/** "23:00" for a reading from today, "3 Oct 23:00" for an older one; always Chiang Mai time. */
export function formatObserved(iso: string, lang: Lang) {
  const tz = 'Asia/Bangkok'
  const locale = LANGUAGES.find((l) => l.code === lang)?.htmlLang
  const date = new Date(iso)
  const day = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: tz })
  const today = day(date) === day(new Date())
  return date.toLocaleString(locale, {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    ...(today ? {} : { day: 'numeric', month: 'short' }),
  })
}
