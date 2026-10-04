import type { Map as MlMap } from 'maplibre-gl'
import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { PROVINCES, type Province } from '../data/provinces'
import { useI18n } from '../i18n'
import type { Station } from '../lib/api'
import type { IconName } from '../lib/icons'
import { clock, ago } from '../lib/time'
import { STALE_HOURS, STATUS_COLOR, ageHours, stationStatus, type StationStatus } from '../lib/water'
import { MapView, parseLocation, provinceName, shrinkPhoto, trendIcon, useGeolocation, useLocale } from '../lib/ui'
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
  const cls = 'flex min-h-16 items-center gap-3 rounded-[18px] bg-card p-4 text-left transition hover:shadow-[0_4px_20px_rgb(0_0_0/0.08)]'
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
            <a href={`tel:${num}`} className="flex min-h-16 items-center gap-3 rounded-[16px] bg-card p-3 hover:shadow-[0_4px_20px_rgb(0_0_0/0.08)]">
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
            className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-[15px] font-medium transition ${
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

export function Loading({ error }: { error?: boolean }) {
  const { m } = useI18n()
  return <p className={`rounded-[16px] bg-card p-5 ${error ? 'text-urgent' : 'text-muted'}`}>{error ? m.common.loadFailed : m.common.loading}</p>
}
