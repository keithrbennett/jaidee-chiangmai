import type { CSSProperties, ReactNode } from 'react'
import type { IconName } from '../../lib/icons'
import { ALERT_COLOR, AQI_COLOR, STATUS_COLOR, STATUS_ORDER, type StationStatus } from '../../lib/water'
import { Icon } from '../Icon'

/**
 * Small visual summaries for a province's hazards, in the manner of Apple Weather's tiles: a heading, the
 * number that matters with a picture of it, and one line.
 */
export function Widget({
  href,
  icon,
  color,
  title,
  level = 0,
  i = 0,
  children,
  footer,
}: {
  href: string
  icon: IconName
  color: string
  title: string
  level?: number
  i?: number
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <a href={href} className="press lift rise relative flex min-h-[156px] flex-col gap-2 overflow-hidden rounded-[22px] bg-card p-4" style={{ '--i': i } as CSSProperties}>
      <span className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wide text-muted">
        <Icon name={icon} size={15} className="shrink-0" />
        <span style={{ color }}>{title}</span>
        {level > 0 && <span className="ml-auto h-2.5 w-2.5 rounded-full ring-2 ring-card" style={{ background: ALERT_COLOR[level] }} />}
      </span>
      <div className="flex flex-1 flex-col justify-center">{children}</div>
      {footer && <span className="line-clamp-2 text-[13px] leading-snug text-muted">{footer}</span>}
    </a>
  )
}

/** Gauges by status as one bar: red over the bank, orange high, green normal, blue low. */
export function StatusStrip({ statuses }: { statuses: StationStatus[] }) {
  const total = statuses.length || 1
  return (
    <span className="flex h-2 w-full overflow-hidden rounded-full bg-paper">
      {STATUS_ORDER.filter((s) => s !== 'unknown').map((s) => {
        const n = statuses.filter((x) => x === s).length
        return n ? <span key={s} style={{ width: `${(n / total) * 100}%`, background: STATUS_COLOR[s] }} /> : null
      })}
    </span>
  )
}

/** The next 24 hours of rain as bars, tallest hour full height (at least 2 mm so a drizzle looks like one). */
export function RainBars({ hours }: { hours: (number | null)[] }) {
  const max = Math.max(2, ...hours.map((h) => h ?? 0))
  return (
    <span className="flex h-9 items-end gap-[2px]" aria-hidden="true">
      {hours.map((h, k) => (
        <span key={k} className="flex-1 rounded-t-[2px]" style={{ height: `${Math.max(6, ((h ?? 0) / max) * 100)}%`, background: (h ?? 0) >= 0.2 ? '#0a84ff' : 'var(--hairline)' }} />
      ))}
    </span>
  )
}

/** AQI on a half dial from 0 to 300, coloured by the Thai AQI band, the number in the middle. */
export function AqiArc({ aqi, band }: { aqi: number; band: number }) {
  const r = 30
  const len = Math.PI * r
  const frac = Math.min(1, aqi / 300)
  return (
    <span className="relative mx-auto block h-[46px] w-[84px]">
      <svg viewBox="0 0 84 46" className="h-full w-full" aria-hidden="true">
        <path d="M12 42 A30 30 0 0 1 72 42" fill="none" stroke="var(--hairline)" strokeWidth="7" strokeLinecap="round" />
        <path d="M12 42 A30 30 0 0 1 72 42" fill="none" stroke={AQI_COLOR[band]} strokeWidth="7" strokeLinecap="round" strokeDasharray={`${len * frac} ${len}`} />
      </svg>
      <b className="absolute inset-x-0 bottom-0 text-center text-[22px] leading-none tabular-nums">{aqi}</b>
    </span>
  )
}
