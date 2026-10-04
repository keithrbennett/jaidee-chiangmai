import type { Map as MlMap } from 'maplibre-gl'
import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { PROVINCES, type Province } from '../data/provinces'
import { useI18n } from '../i18n'
import type { ReportCheck, Station, Tri } from '../lib/api'
import type { IconName } from '../lib/icons'
import { clock, ago } from '../lib/time'
import { STALE_HOURS, STATUS_COLOR, ageHours, stationStatus, type StationStatus } from '../lib/water'
import { MapView, parseLocation, provinceName, shrinkPhoto, trendIcon, useCountUp, useGeolocation, useLocale } from '../lib/ui'
import { Icon } from './Icon'

export function MapBox({ className = '', children }: { className?: string; children: ReactNode }) {
  return (
    <div className={`relative overflow-hidden rounded-[22px] bg-paper ${className}`}>
      <Suspense fallback={<div className="flex h-full items-center justify-center text-muted">…</div>}>{children}</Suspense>
    </div>
  )
}



/** Colours for section icons, Apple-style: each kind of thing has its own hue. */
const HUES = {
  blue: 'bg-[#0a84ff]',
  teal: 'bg-[#30b0c7]',
  green: 'bg-[#34c759]',
  orange: 'bg-[#ff9500]',
  red: 'bg-[#ff3b30]',
  pink: 'bg-[#ff2d55]',
  purple: 'bg-[#af52de]',
  indigo: 'bg-[#5856d6]',
  yellow: 'bg-[#ffcc00]',
  gray: 'bg-[#8e8e93]',
} as const
export type Hue = keyof typeof HUES

export function IconBadge({ icon, hue, size = 'md' }: { icon: IconName; hue: Hue; size?: 'sm' | 'md' | 'lg' }) {
  const box = size === 'lg' ? 'h-14 w-14 rounded-[16px]' : size === 'sm' ? 'h-8 w-8 rounded-[9px]' : 'h-10 w-10 rounded-[12px]'
  return (
    <span className={`inline-flex shrink-0 items-center justify-center text-white shadow-sm ${box} ${HUES[hue]}`}>
      <Icon name={icon} size={size === 'lg' ? 30 : size === 'sm' ? 18 : 22} />
    </span>
  )
}

export function SectionTitle({ icon, hue, children, action }: { icon?: IconName; hue?: Hue; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      {icon && hue && <IconBadge icon={icon} hue={hue} size="sm" />}
      <h2 className="mr-auto text-[22px] font-bold leading-tight">{children}</h2>
      {action}
    </div>
  )
}

/** A colourful link tile: icon, title, one line. */
export function Tile({ href, icon, hue, title, sub, onClick }: { href?: string; icon: IconName; hue: Hue; title: string; sub?: string; onClick?: () => void }) {
  const inner = (
    <>
      <IconBadge icon={icon} hue={hue} />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold leading-snug">{title}</span>
        {sub && <span className="block text-[15px] leading-snug text-muted">{sub}</span>}
      </span>
      <Icon name="forward" size={20} className="text-faint" />
    </>
  )
  const cls = 'press lift flex min-h-16 items-center gap-3 rounded-[18px] bg-card p-4 text-left'
  return href ? (
    <a href={href} className={cls}>
      {inner}
    </a>
  ) : (
    <button onClick={onClick} className={`${cls} w-full`}>
      {inner}
    </button>
  )
}

export function StatusChip({ status, children }: { status: StationStatus; children?: ReactNode }) {
  const { m } = useI18n()
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-sm font-semibold text-white" style={{ background: STATUS_COLOR[status] }}>
      {children ?? m.status[status]}
    </span>
  )
}


/** One gauge: status, name, river, metres against the bank, trend, when and by whom. */
export function StationRow({ s, distance }: { s: Station; distance?: number }) {
  const { m } = useI18n()
  const locale = useLocale()
  const status = stationStatus(s)
  const hours = ageHours(s.observedAt)
  return (
    <li className="flex gap-3 rounded-[16px] bg-card p-4">
      <span className="mt-1 h-10 w-1.5 shrink-0 rounded-full" style={{ background: STATUS_COLOR[status] }} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <StatusChip status={status} />
          <span className="font-semibold">{s.name}</span>
          {s.river && <span className="text-muted">· {s.river}</span>}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          {s.over !== null && (
            <b className="text-[19px] tabular-nums" style={{ color: status === 'over' ? STATUS_COLOR.over : undefined }}>
              {s.over > 0 ? m.status.overBy(s.over.toFixed(2)) : m.status.belowBy(Math.abs(s.over).toFixed(2))}
            </b>
          )}
          {s.trend && (
            <span className={`inline-flex items-center gap-0.5 text-[15px] font-medium ${s.trend === 'up' ? 'text-urgent' : 'text-muted'}`}>
              <Icon name={trendIcon(s.trend)} size={16} />
              {m.status.trend[s.trend]}
            </span>
          )}
          {s.pct !== null && <span className="text-[15px] text-muted">{m.status.ofBank(Math.round(s.pct))}</span>}
        </div>
        {s.pct !== null && (
          // Level against the bank: the bar fills to 100% at the bank (the tick) and runs on past it when over.
          <div className="relative mt-2 h-1.5 max-w-sm rounded-full bg-paper" aria-hidden="true">
            <span className="block h-full rounded-full transition-[width] duration-700" style={{ width: `${Math.min(100, (s.pct / 120) * 100)}%`, background: STATUS_COLOR[status] }} />
            <span className="absolute -top-0.5 h-2.5 w-0.5 rounded-full bg-ink/45" style={{ left: `${(100 / 120) * 100}%` }} />
          </div>
        )}
        <p className="mt-1 text-sm text-faint">
          {s.code} · {m.common.measured(clock(s.observedAt, locale))} · {m.status.agency[s.agency] ?? s.agency}
          {distance !== undefined && ` · ${m.common.km(distance.toFixed(1))}`}
          {hours > STALE_HOURS && <span className="text-[#ff9500]"> · {m.common.oldData(Math.round(hours))}</span>}
        </p>
      </div>
    </li>
  )
}

export function EmergencyNumbers({ social = false, rid = false }: { social?: boolean; rid?: boolean }) {
  const { m } = useI18n()
  const rows: [string, string, Hue][] = [
    ['1784', m.emergency.ddpm, 'red'],
    ['1669', m.emergency.medical, 'pink'],
    ['191', m.emergency.police, 'blue'],
    ...(social ? ([['1300', m.emergency.social, 'purple']] as [string, string, Hue][]) : []),
    ...(rid ? ([['1460', m.emergency.rid, 'teal']] as [string, string, Hue][]) : []),
  ]
  return (
    <section className="flex flex-col gap-3">
      <SectionTitle icon="phone" hue="red">
        {m.emergency.title}
      </SectionTitle>
      <ul className="grid gap-2 sm:grid-cols-2">
        {rows.map(([num, label, hue]) => (
          <li key={num}>
            <a href={`tel:${num}`} className="press lift flex min-h-16 items-center gap-3 rounded-[16px] bg-card p-3">
              <span className={`inline-flex h-12 min-w-16 items-center justify-center rounded-[12px] px-2 text-[22px] font-bold text-white ${HUES[hue]}`}>{num}</span>
              <span className="text-[15px] leading-snug">{label}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  )
}

// ---- Forms ----------------------------------------------------------------------------------------------

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-semibold">{label}</span>
      {children}
      {hint && <span className="text-sm text-faint">{hint}</span>}
    </label>
  )
}

export const inputCls =
  'min-h-12 w-full rounded-[12px] border border-line bg-page px-3.5 text-[17px] text-ink placeholder:text-faint focus:border-go focus:outline-none focus:ring-2 focus:ring-go/25'

export function Choices<T extends string | number>({
  options,
  value,
  onChange,
  multi = false,
  colors,
}: {
  options: [T, string][]
  value: T | T[] | null
  onChange: (v: T) => void
  multi?: boolean
  colors?: Record<string, string>
}) {
  const selected = (v: T) => (multi ? (value as T[]).includes(v) : value === v)
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(([v, label]) => {
        const on = selected(v)
        const c = colors?.[String(v)]
        return (
          <button
            type="button"
            key={String(v)}
            onClick={() => onChange(v)}
            aria-pressed={on}
            className={`press inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-[15px] font-medium ${
              on ? 'border-transparent bg-go text-white' : 'border-line bg-card text-ink hover:border-go'
            }`}
            style={on && c ? { background: c } : undefined}
          >
            {c && !on && <span className="h-3 w-3 rounded-full" style={{ background: c }} />}
            {label}
          </button>
        )
      })}
    </div>
  )
}



export function PhotoInput({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const { m } = useI18n()
  return (
    <div className="flex flex-col gap-2">
      <label className="inline-flex min-h-11 w-fit cursor-pointer items-center gap-2 rounded-full border border-line bg-card px-4 font-medium hover:border-go">
        <Icon name="camera" size={20} />
        {m.report.photo}
        <input
          type="file"
          accept="image/*"
          className="sr-only"
          onChange={async (e) => {
            const f = e.target.files?.[0]
            if (f) onChange(await shrinkPhoto(f))
          }}
        />
      </label>
      {value && (
        <div className="relative w-fit">
          <img src={value} alt="" className="max-h-48 rounded-[12px]" />
          <button type="button" onClick={() => onChange(null)} className="absolute right-2 top-2 rounded-full bg-black/60 px-2 py-1 text-sm text-white">
            {m.common.cancel}
          </button>
        </div>
      )}
      <span className="text-sm text-faint">{m.report.photoNote}</span>
    </div>
  )
}

// ---- Location ---------------------------------------------------------------------------------------------



export function GeoMessage({ state }: { state: ReturnType<typeof useGeolocation>['state'] }) {
  const { m } = useI18n()
  if (state === 'idle') return null
  const text = state === 'locating' ? m.common.locating : state === 'denied' ? m.common.locationDenied : m.common.outsideThailand
  return <p className={`text-[15px] ${state === 'locating' ? 'text-muted' : 'text-urgent'}`}>{text}</p>
}

/** Where something is: my location, a pin on the map, or a pasted link. */
export function LocationPicker({ value, onChange, center }: { value: [number, number] | null; onChange: (v: [number, number]) => void; center: [number, number] }) {
  const { m } = useI18n()
  const geo = useGeolocation()
  const [picking, setPicking] = useState(false)
  const [paste, setPaste] = useState('')
  const [pasteBad, setPasteBad] = useState(false)
  const mapRef = useRef<MlMap | null>(null)
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={async () => {
            const p = await geo.locate()
            if (p) {
              onChange(p)
              setPicking(false)
            }
          }}
          className="inline-flex min-h-12 items-center gap-2 rounded-full bg-go px-5 font-medium text-white hover:bg-go-hover"
        >
          <Icon name="locate" size={20} />
          {m.report.useLocation}
        </button>
        <button
          type="button"
          onClick={() => setPicking(!picking)}
          className="inline-flex min-h-12 items-center gap-2 rounded-full border border-line bg-card px-5 font-medium hover:border-go"
        >
          <Icon name="pin" size={20} />
          {m.report.pickOnMap}
        </button>
      </div>
      <GeoMessage state={geo.state} />
      {picking && (
        <div className="flex flex-col gap-2">
          <MapBox className="h-72">
            <MapView
              center={value ?? center}
              zoom={value ? 15 : 11}
              pitch={0}
              bearing={0}
              onMap={(map) => {
                mapRef.current = map
                map.on('moveend', () => {
                  const c = map.getCenter()
                  onChange([c.lng, c.lat])
                })
              }}
            />
            <span className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full text-urgent drop-shadow">
              <Icon name="pin" size={40} />
            </span>
          </MapBox>
          <span className="text-sm text-faint">{m.report.pickHint}</span>
        </div>
      )}
      <input
        className={inputCls}
        placeholder={m.report.paste}
        value={paste}
        onChange={(e) => {
          setPaste(e.target.value)
          const p = parseLocation(e.target.value)
          setPasteBad(!!e.target.value.trim() && !p)
          if (p) onChange(p)
        }}
      />
      {pasteBad && <span className="text-sm text-urgent">{m.report.pasteBad}</span>}
      {value && (
        <span className="inline-flex items-center gap-1.5 text-[15px] font-medium text-[#34c759]">
          <Icon name="check" size={18} />
          {m.report.located(value[1].toFixed(5), value[0].toFixed(5))}
        </span>
      )}
    </div>
  )
}

// ---- Provinces -------------------------------------------------------------------------------------------

export function ProvinceSearch({ onPick, autoFocus = false }: { onPick: (p: Province) => void; autoFocus?: boolean }) {
  const { m, lang } = useI18n()
  const [q, setQ] = useState('')
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return []
    return PROVINCES.filter((p) => p.th.includes(s) || p.en.toLowerCase().includes(s)).slice(0, 8)
  }, [q])
  return (
    <div className="relative">
      <Icon name="search" size={20} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint" />
      <input
        className={`${inputCls} pl-11`}
        placeholder={m.provinces.search}
        value={q}
        autoFocus={autoFocus}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && matches[0]) onPick(matches[0])
        }}
      />
      {q.trim() && (
        <ul className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-[14px] border border-line bg-card shadow-lg">
          {matches.length ? (
            matches.map((p) => (
              <li key={p.code}>
                <button className="flex min-h-12 w-full items-center gap-2 px-4 text-left hover:bg-paper" onClick={() => onPick(p)}>
                  <b>{provinceName(p, lang)}</b>
                  <span className="text-muted">{lang === 'th' ? p.en : p.th}</span>
                </button>
              </li>
            ))
          ) : (
            <li className="px-4 py-3 text-muted">{m.provinces.noMatch}</li>
          )}
        </ul>
      )}
    </div>
  )
}

/** Live "x min ago" that keeps itself fresh. */
export function Ago({ when }: { when: number | string }) {
  const { m } = useI18n()
  const [, tick] = useState(0)
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 60_000)
    return () => clearInterval(t)
  }, [])
  return <>{ago(when, m)}</>
}

/** Grey shapes shimmering where content is coming (or the error, if it isn't). */
export function Loading({ error, rows = 3 }: { error?: boolean; rows?: number }) {
  const { m } = useI18n()
  if (error) return <p className="rounded-[16px] bg-card p-5 text-urgent">{m.common.loadFailed}</p>
  return (
    <div className="flex flex-col gap-2" role="status" aria-label={m.common.loading}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton h-16" style={{ opacity: 1 - i * 0.2 }} />
      ))}
    </div>
  )
}

/** A number that counts up to its value when it appears or changes. */
export function AnimatedNumber({ value, format = (n) => String(Math.round(n)) }: { value: number; format?: (n: number) => string }) {
  return <>{format(useCountUp(value))}</>
}

/** One row of an iOS-style grouped list: coloured icon, title, a line under it, chevron. */
export function ListRow({ href, onClick, icon, hue, title, sub, external = false }: { href?: string; onClick?: () => void; icon: IconName; hue: Hue; title: string; sub?: string; external?: boolean }) {
  const inner = (
    <>
      <IconBadge icon={icon} hue={hue} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold leading-snug">{title}</span>
        {sub && <span className="block text-[14px] leading-snug text-muted">{sub}</span>}
      </span>
      <Icon name={external ? 'external' : 'forward'} size={external ? 17 : 19} className="text-faint" />
    </>
  )
  const cls = 'press flex min-h-14 w-full items-center gap-3 px-4 py-3 text-left hover:bg-paper/60'
  return (
    <li className="border-b border-line/60 last:border-0">
      {href ? (
        <a href={href} className={cls} {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}>
          {inner}
        </a>
      ) : (
        <button onClick={onClick} className={cls}>
          {inner}
        </button>
      )}
    </li>
  )
}

/** A row that opens to show more, with the content sliding open (grid-rows 0fr → 1fr). */
export function Disclosure({ icon, hue, title, sub, children, defaultOpen = false }: { icon: IconName; hue: Hue; title: string; sub?: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <section className="overflow-hidden rounded-[20px] bg-card">
      <button onClick={() => setOpen(!open)} aria-expanded={open} className="press flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left">
        <IconBadge icon={icon} hue={hue} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold leading-snug">{title}</span>
          {sub && <span className="block text-[14px] leading-snug text-muted">{sub}</span>}
        </span>
        <Icon name="down" size={20} className={`text-faint transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
      </button>
      <div className={`grid transition-[grid-template-rows] duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className="min-h-0 overflow-hidden">
          <div className="border-t border-line/60 p-4">{children}</div>
        </div>
      </div>
    </section>
  )
}

const CHECK_STYLE: Record<ReportCheck['verdict'], { icon: IconName; cls: string }> = {
  consistent: { icon: 'verified', cls: 'bg-[#34c759]/14 text-[#1f7a35] dark:text-[#30d158]' },
  unclear: { icon: 'question', cls: 'bg-paper text-muted' },
  inconsistent: { icon: 'alert', cls: 'bg-[#ff9500]/16 text-[#a64b00] dark:text-[#ff9f0a]' },
}

/** What น้องใจดี's check found about a report: a small label, and the reason under it if asked for. */
export function CheckBadge({ check, reason = false }: { check: ReportCheck | null; reason?: boolean }) {
  const { m, lang } = useI18n()
  if (!check) return null
  const st = CHECK_STYLE[check.verdict]
  const why = check.reason?.[lang] || check.reason?.th
  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[12px] font-semibold ${st.cls}`} title={m.checks.about}>
        <Icon name={st.icon} size={13} />
        {m.checks[check.verdict]}
      </span>
      {reason && why && <span className="text-[13px] leading-snug text-faint">{why}</span>}
    </span>
  )
}

/** The scam warning on a lost-and-found post. */
export function CautionNote({ text }: { text: Tri | null }) {
  const { lang } = useI18n()
  const t = text?.[lang] || text?.th
  if (!t) return null
  return (
    <p className="flex items-start gap-2 rounded-[12px] bg-[#ffcc00]/22 px-3 py-2 text-[14px] font-medium leading-snug text-[#7a5a00] dark:text-[#ffd60a]">
      <Icon name="alert" size={17} className="mt-0.5 shrink-0" />
      {t}
    </p>
  )
}
