import { useEffect, useRef, useState } from 'react'
import type { MapMode } from '../../lib/map/modes'
import { PROVINCES, type Province } from '../../data/provinces'
import { ProvinceSheet } from '../province/ProvinceSheet'
import { useI18n } from '../../i18n'
import { api, useApi } from '../../lib/api'
import { href, navigate, provinceByCode } from '../../lib/router'
import { clock } from '../../lib/time'
import { Icon } from '../Icon'
import { EmergencyNumbers, SectionTitle, inputCls } from '../kit'
import { provinceName, useLocale } from '../../lib/ui'
import { ExternalLinks } from '../province/Hub'
import { Button } from '../ui'
import { NationalMap } from './NationalMap'

/** Full-screen national map. */
export function MapPage({ mode, province }: { mode?: MapMode; province?: Province }) {
  const [selected, setSelected] = useState<Province | null>(province ?? null)
  return (
    <div className="relative h-[calc(100dvh-7.5rem)] md:h-[calc(100dvh-6.5rem)]">
      <NationalMap
        key={mode ?? 'water'}
        full
        initialMode={mode}
        onProvince={(code) => setSelected(provinceByCode.get(code) ?? null)}
        selected={selected?.code ?? null}
      />
      <MapSearch onPick={setSelected} />
      {selected && <ProvinceSheet province={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

/** A search button over the map that opens into a province search, like Maps. */
function MapSearch({ onPick }: { onPick: (p: Province) => void }) {
  const { m, lang } = useI18n()
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const matches = q.trim()
    ? PROVINCES.filter((p) => p.th.includes(q.trim()) || p.en.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 6)
    : []
  if (!open)
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label={m.provinceSheet.search}
        className="press glass absolute left-3 top-3 z-10 flex h-11 items-center gap-2 rounded-full px-3.5 text-[15px] font-semibold shadow-lg ring-1 ring-black/5"
      >
        <Icon name="search" size={19} />
        <span className="hidden lg:inline">{m.provinceSheet.search}</span>
      </button>
    )
  return (
    <div className="pop-in absolute left-3 top-3 z-30 w-[min(320px,calc(100%-1.5rem))]">
      <div className="glass flex items-center gap-2 rounded-[18px] px-3 shadow-lg ring-1 ring-black/5">
        <Icon name="search" size={19} className="text-muted" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false)
            if (e.key === 'Enter' && matches[0]) {
              onPick(matches[0])
              setOpen(false)
              setQ('')
            }
          }}
          placeholder={m.provinceSheet.search}
          className="min-h-11 flex-1 bg-transparent text-[16px] outline-none"
        />
        <button onClick={() => setOpen(false)} aria-label={m.assistant.close} className="text-muted">
          <Icon name="close" size={17} />
        </button>
      </div>
      {matches.length > 0 && (
        <ul className="glass mt-1.5 overflow-hidden rounded-[16px] shadow-lg ring-1 ring-black/5">
          {matches.map((p) => (
            <li key={p.code}>
              <button
                onClick={() => {
                  onPick(p)
                  setOpen(false)
                  setQ('')
                }}
                className="flex min-h-11 w-full items-center gap-2 px-4 text-left hover:bg-paper/70"
              >
                <b>{provinceName(p, lang)}</b>
                <span className="text-muted">{lang === 'th' ? p.en : p.th}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const STEPS = ['new', 'assigned', 'on_the_way', 'done'] as const

/** Progress on a help request, for whoever has its code. */
export function HelpStatus({ code }: { code: string }) {
  const { m } = useI18n()
  const locale = useLocale()
  const status = useApi<{ status: string; createdAt: number; updatedAt: number; team: string | null }>(code ? `/help/${code}` : null, 30_000)
  const [input, setInput] = useState(code)
  const step = status.data ? STEPS.indexOf(status.data.status as (typeof STEPS)[number]) : -1
  return (
    <div className="mx-auto w-full flex max-w-xl flex-col gap-5 px-4 py-6">
      <h1 className="text-[30px] font-bold">{m.helpStatus.title(code)}</h1>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          if (input.trim()) navigate({ name: 'helpStatus', code: input.trim().toUpperCase() })
        }}
      >
        <input className={inputCls} value={input} onChange={(e) => setInput(e.target.value)} placeholder={m.helpStatus.lookup} />
        <Button>{m.common.search}</Button>
      </form>
      {status.error && <p className="rounded-[16px] bg-card p-5 text-urgent">{m.helpStatus.notFound}</p>}
      {status.data && (
        <section className="flex flex-col gap-4 rounded-[22px] bg-card p-6">
          <p className="text-[24px] font-bold">{m.helpStatus.statuses[status.data.status]}</p>
          {status.data.status !== 'cancelled' && (
            <ol className="flex gap-1.5">
              {STEPS.map((s, i) => (
                <li key={s} className={`h-2 flex-1 rounded-full ${i <= step ? 'bg-[#34c759]' : 'bg-line'}`} />
              ))}
            </ol>
          )}
          {status.data.team && <p className="text-lg">{m.helpStatus.team(status.data.team)}</p>}
          <p className="text-muted">
            {m.helpStatus.sent(clock(status.data.createdAt, locale))} · {m.common.updated(clock(status.data.updatedAt, locale))}
          </p>
          <p className="text-sm text-faint">{m.helpStatus.refresh}</p>
        </section>
      )}
      <EmergencyNumbers />
    </div>
  )
}

/** A rescue team's phone: share its location with the command centre while this page is open. */
export function Track({ token }: { token: string }) {
  const { m } = useI18n()
  const locale = useLocale()
  const team = useApi<{ name: string; kind: string }>(`/track/${token}`, 0)
  const [sharing, setSharing] = useState(false)
  const [last, setLast] = useState<number | null>(null)
  const [denied, setDenied] = useState(false)
  const lastSent = useRef(0)
  useEffect(() => {
    if (!sharing) return
    // Wake lock where supported, so the phone keeps sending.
    let lock: { release: () => Promise<void> } | null = null
    ;(navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }).wakeLock
      ?.request('screen')
      .then((l) => (lock = l))
      .catch(() => {})
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        // At most every 20 seconds.
        if (Date.now() - lastSent.current < 20_000) return
        lastSent.current = Date.now()
        api(`/track/${token}`, { body: { lng: pos.coords.longitude, lat: pos.coords.latitude } })
          .then(() => setLast(Date.now()))
          .catch(() => {})
      },
      () => setDenied(true),
      { enableHighAccuracy: true, maximumAge: 10_000 },
    )
    return () => {
      navigator.geolocation.clearWatch(id)
      lock?.release().catch(() => {})
    }
  }, [sharing, token])

  return (
    <div className="mx-auto w-full flex max-w-md flex-col gap-5 px-4 py-8">
      <h1 className="text-[30px] font-bold">{m.track.title}</h1>
      {team.error ? (
        <p className="rounded-[16px] bg-card p-5 text-urgent">{m.track.invalid}</p>
      ) : team.data ? (
        <>
          <p className="text-lg">{m.track.team(team.data.name)}</p>
          <Button main variant={sharing ? 'ask' : 'go'} icon="locate" onClick={() => setSharing(!sharing)}>
            {sharing ? m.track.stop : m.track.start}
          </Button>
          {sharing && <p className="font-semibold text-[#34c759]">{m.track.sharing}</p>}
          {last && <p className="text-muted">{m.track.lastSent(clock(last, locale))}</p>}
          {denied && <p className="text-urgent">{m.track.denied}</p>}
        </>
      ) : (
        <p className="text-muted">{m.common.loading}</p>
      )}
    </div>
  )
}

export function Sources() {
  const { m } = useI18n()
  return (
    <div className="mx-auto w-full flex max-w-3xl flex-col gap-6 px-4 py-6">
      <div>
        <h1 className="text-[34px] font-bold leading-tight">{m.sources.title}</h1>
        <p className="mt-1 text-lg text-muted">{m.sources.sub}</p>
      </div>
      <section className="flex flex-col gap-3">
        <SectionTitle icon="check" hue="green">
          {m.sources.live}
        </SectionTitle>
        <ul className="flex flex-col gap-2">
          {m.sources.items.map(([name, what]) => (
            <li key={name} className="rounded-[16px] bg-card p-4">
              <p className="font-semibold">{name}</p>
              <p className="text-muted">{what}</p>
            </li>
          ))}
        </ul>
      </section>
      <section className="flex flex-col gap-3">
        <SectionTitle icon="clock" hue="gray">
          {m.sources.pending}
        </SectionTitle>
        <ul className="flex flex-col gap-2">
          {m.sources.pendingItems.map(([name, why]) => (
            <li key={name} className="rounded-[16px] bg-card p-4">
              <p className="font-semibold">{name}</p>
              <p className="text-muted">{why}</p>
            </li>
          ))}
        </ul>
      </section>
      <section className="flex flex-col gap-3">
        <SectionTitle icon="bell" hue="red">
          {m.alerts.rules.title}
        </SectionTitle>
        <ul className="flex list-disc flex-col gap-1.5 rounded-[16px] bg-card p-5 pl-9 text-[15px] text-muted">
          {m.alerts.rules.items.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </section>
      <ExternalLinks />
    </div>
  )
}

export function About() {
  const { m } = useI18n()
  return (
    <div className="mx-auto w-full flex max-w-3xl flex-col gap-5 px-4 py-6">
      <img src="/logo-full.png" alt="Jaidee CM" width={549} height={440} className="h-28 w-auto self-start dark:rounded-[20px] dark:bg-white dark:p-3" />
      <h1 className="text-[34px] font-bold">{m.about.title}</h1>
      {m.about.body.map((p) => (
        <p key={p} className="text-lg">
          {p}
        </p>
      ))}
      <div className="flex flex-wrap gap-2">
        <a href={href({ name: 'sources' })} className="inline-flex min-h-11 items-center gap-1 rounded-full bg-card px-4 font-semibold text-link">
          {m.nav.sources} <Icon name="forward" size={16} />
        </a>
        <a href={href({ name: 'command' })} className="inline-flex min-h-11 items-center gap-1 rounded-full bg-card px-4 font-semibold text-link">
          {m.nav.command} <Icon name="forward" size={16} />
        </a>
      </div>
      <EmergencyNumbers social rid />
    </div>
  )
}
