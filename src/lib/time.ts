import type { Messages } from '../i18n'

/** "2 h 5 min ago" style, from a timestamp (ms or ISO). */
export function ago(when: number | string, m: Messages) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(when).getTime()) / 60_000))
  if (minutes < 1) return m.common.justNow
  if (minutes < 60) return m.common.ago(m.common.minutes(minutes))
  const hours = Math.floor(minutes / 60)
  if (hours < 48) {
    const rest = minutes % 60
    return m.common.ago(rest && hours < 6 ? `${m.common.hours(hours)} ${m.common.minutes(rest)}` : m.common.hours(hours))
  }
  return m.common.ago(m.common.days(Math.floor(hours / 24)))
}

/** Clock time (or day and time when not today), always Thailand time. */
export function clock(when: number | string, locale: string) {
  const tz = 'Asia/Bangkok'
  const d = new Date(when)
  const day = (x: Date) => x.toLocaleDateString('en-CA', { timeZone: tz })
  return d.toLocaleString(locale, {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    ...(day(d) === day(new Date()) ? {} : { day: 'numeric', month: 'short' }),
  })
}
