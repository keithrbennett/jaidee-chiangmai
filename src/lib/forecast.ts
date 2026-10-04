import type { Forecast } from './api'

/** The next 24 hours of a province's hourly forecast: total, peak chance, and when rain starts. */
export function next24(f: Forecast) {
  const from = Date.now() - 3600_000
  const hours = f.hourly.filter((h) => new Date(h[0]).getTime() >= from).slice(0, 24)
  const total = hours.reduce((s, h) => s + (h[1] ?? 0), 0)
  const chance = Math.max(0, ...hours.map((h) => h[2] ?? 0))
  const start = hours.find((h) => (h[1] ?? 0) >= 0.2 && (h[2] ?? 0) >= 30)?.[0] ?? null
  return { hours, total, chance, start }
}

/** WMO weather code to our short labels. */
export function weatherKind(code: number): 'clear' | 'cloudy' | 'fog' | 'drizzle' | 'rain' | 'showers' | 'thunder' {
  if (code === 0) return 'clear'
  if (code <= 3) return 'cloudy'
  if (code === 45 || code === 48) return 'fog'
  if (code >= 51 && code <= 57) return 'drizzle'
  if (code >= 80 && code <= 82) return 'showers'
  if (code >= 95) return 'thunder'
  return 'rain'
}
