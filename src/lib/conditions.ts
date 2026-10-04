import { LANGUAGES, type Lang } from '../i18n'

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
