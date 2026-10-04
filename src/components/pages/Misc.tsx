import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../../i18n'
import { api, useApi } from '../../lib/api'
import { href, navigate } from '../../lib/router'
import { clock } from '../../lib/time'
import { Icon } from '../Icon'
import { EmergencyNumbers, SectionTitle, inputCls } from '../kit'
import { useLocale } from '../../lib/ui'
import { ExternalLinks } from '../province/Hub'
import { Button } from '../ui'
import { NationalMap } from './NationalMap'

/** Full-screen national map. */
export function MapPage() {
  return (
    <div className="h-[calc(100dvh-7.5rem)] md:h-[calc(100dvh-6.5rem)]">
      <NationalMap full />
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
    <div className="mx-auto flex max-w-xl flex-col gap-5 px-4 py-6">
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
    <div className="mx-auto flex max-w-md flex-col gap-5 px-4 py-8">
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
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6">
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
      <ExternalLinks />
    </div>
  )
}

export function About() {
  const { m } = useI18n()
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-6">
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
