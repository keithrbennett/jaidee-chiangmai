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
 * What people report: 0 dry or below the ankle (<10 cm), 1 ankle–knee (10–50), 2 knee–waist (50–100),
 * 3 waist–chest (100–130), 4 chest and up (130–180), 5 over the head / roof (>180).
 */
export const LEVELS = [0, 1, 2, 3, 4, 5] as const
export const LEVEL_COLOR = ['#34c759', '#ffcc00', '#ff9500', '#ff3b30', '#af52de', '#5e2a84']
export const LEVEL_CM = ['< 10', '10–50', '50–100', '100–130', '130–180', '> 180']

/** Reports fade at 12 and 24 hours and leave the map at 36 (counting from the last "still flooded"). */
export function reportAge(r: Report) {
  const last = Math.max(r.createdAt, r.lastStillAt ?? 0)
  return (Date.now() - last) / 3600_000
}
export const reportOpacity = (r: Report) => {
  const h = reportAge(r)
  return h < 12 ? 1 : h < 24 ? 0.6 : 0.35
}
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
