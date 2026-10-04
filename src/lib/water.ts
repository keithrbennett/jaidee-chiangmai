import type { Report, Station } from './api'

/**
 * River status from % of bank-full, the classes Thaiwater uses: over 100 spilling, 70–100 high,
 * 30–70 normal, 10–30 low, under 10 very low.
 */
export type StationStatus = 'over' | 'high' | 'normal' | 'low' | 'veryLow' | 'unknown'

export function stationStatus(s: Pick<Station, 'pct' | 'over'>): StationStatus {
  if (s.over !== null && s.over > 0) return 'over'
  const p = s.pct
  if (p === null) return s.over === null ? 'unknown' : s.over > -0.5 ? 'high' : 'normal'
  if (p > 100) return 'over'
  if (p >= 70) return 'high'
  if (p >= 30) return 'normal'
  if (p >= 10) return 'low'
  return 'veryLow'
}

/** Colours shared by the map and the lists. Saturated, Apple-like system colours. */
export const STATUS_COLOR: Record<StationStatus, string> = {
  over: '#ff3b30',
  high: '#ff9500',
  normal: '#34c759',
  low: '#5ac8fa',
  veryLow: '#af8457',
  unknown: '#8e8e93',
}

export const STATUS_ORDER: StationStatus[] = ['over', 'high', 'normal', 'low', 'veryLow', 'unknown']

/** Readings older than this get a "data is old" note. */
export const STALE_HOURS = 6
export const ageHours = (iso: string | number) => (Date.now() - new Date(iso).getTime()) / 3600_000

/**
 * Our depth scale, by what the water does to people and cars: 0 no flooding (<10 cm), 1 ankle to mid-shin
 * (10–30, small cars struggle), 2 knee (30–60, cars stall), 3 waist (60–100, wading is dangerous),
 * 4 chest (100–150, boats only), 5 over head height (>150).
 */
export const LEVELS = [0, 1, 2, 3, 4, 5] as const
export const LEVEL_COLOR = ['#34c759', '#ffcc00', '#ff9500', '#ff3b30', '#af52de', '#5e2a84']
export const LEVEL_CM = ['< 10', '10–30', '30–60', '60–100', '100–150', '> 150']

/** Reports stay 48 hours from the last "still flooded", growing paler as they age. */
export const REPORT_HOURS = 48
export function reportAge(r: Report) {
  const last = Math.max(r.createdAt, r.lastStillAt ?? 0)
  return (Date.now() - last) / 3600_000
}
export const reportOpacity = (r: Report) => Math.max(0.3, 1 - (reportAge(r) / REPORT_HOURS) * 0.7)
/** Someone said the water has gone down since the last "still flooded". */
export const isReceded = (r: Report) => !!r.recededAt && r.recededAt >= (r.lastStillAt ?? 0)

/** Thai Meteorological Department classes for 24-hour rain, mm: light, moderate, heavy, very heavy. */
export const RAIN_CLASSES = [
  { min: 0.1, color: '#64d2ff' },
  { min: 10.1, color: '#0a84ff' },
  { min: 35.1, color: '#ff9f0a' },
  { min: 90.1, color: '#ff375f' },
]
export function rainClass(mm: number | null) {
  let k = -1
  RAIN_CLASSES.forEach((c, i) => {
    if ((mm ?? 0) >= c.min) k = i
  })
  return k
}

/** Dam storage colour: low is a worry for drought, high (over 80 %) for floods downstream. */
export function damColor(pct: number | null) {
  if (pct === null) return '#8e8e93'
  if (pct > 100) return '#ff3b30'
  if (pct >= 80) return '#ff9500'
  if (pct >= 50) return '#0a84ff'
  if (pct >= 30) return '#64d2ff'
  return '#af8457'
}

/** Rough distance in km, good enough for "nearest station". */
export function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const k = Math.cos(((a.lat + b.lat) / 2) * (Math.PI / 180))
  return Math.hypot((a.lng - b.lng) * k, a.lat - b.lat) * 111.2
}

/** Alert levels: 1 watch, 2 warning, 3 danger (0 = nothing). */
export const ALERT_COLOR = ['#34c759', '#ffcc00', '#ff9500', '#ff3b30']

/** Thai AQI band colours (blue, green, yellow, orange, red), as the Pollution Control Department uses them. */
export const AQI_COLOR = ['#3bccff', '#34c759', '#ffd60a', '#ff9500', '#ff3b30']
/** Thai PM2.5 bands in µg/m³ (24-hour average): 0–15, 15–25, 25–37.5, 37.5–75, 75+. */
export function pm25Band(v: number) {
  return v <= 15 ? 0 : v <= 25 ? 1 : v <= 37.5 ? 2 : v <= 75 ? 3 : 4
}

/** Earthquake colour by age: today red, this week orange, older yellow (as quake maps usually do). */
export function quakeColor(at: string) {
  const h = (Date.now() - new Date(at).getTime()) / 3600_000
  return h < 24 ? '#ff3b30' : h < 168 ? '#ff9500' : '#ffcc00'
}
