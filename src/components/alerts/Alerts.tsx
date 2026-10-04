import { useEffect, useMemo, useState } from 'react'
import { PROVINCES } from '../../data/provinces'
import { useI18n } from '../../i18n'
import { HAZARD, OFFICIAL, alertText } from '../../lib/alerts'
import type { Alert } from '../../lib/api'
import { currentSubscription, needsHomeScreen, pushSupported, subscribe, unsubscribe, type AlertPrefs } from '../../lib/push'
import { provinceByCode, provinceHref } from '../../lib/router'
import { useLocalStorage } from '../../lib/useLocalStorage'
import { provinceName } from '../../lib/ui'
import { ALERT_COLOR } from '../../lib/water'
import { Icon } from '../Icon'
import { Ago, Choices } from '../kit'
import { Button } from '../ui'

const HAZARDS = Object.keys(HAZARD) as Alert['hazard'][]

/** One alert: a coloured edge for the level, the hazard, one plain sentence, where, when, and the source. */
export function AlertCard({ a, showProvinces = true }: { a: Alert; showProvinces?: boolean }) {
  const { m, lang } = useI18n()
  const h = HAZARD[a.hazard]
  const provs = a.provinces.map((c) => provinceByCode.get(c)).filter(Boolean)
  return (
    <li className="flex overflow-hidden rounded-[18px] bg-card">
      <span className="w-1.5 shrink-0" style={{ background: ALERT_COLOR[a.level] }} />
      <div className="flex min-w-0 flex-1 gap-3 p-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] text-white" style={{ background: h.color }}>
          <Icon name={h.icon} size={22} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2">
            <span className="rounded-full px-2 py-0.5 text-xs font-bold" style={{ background: ALERT_COLOR[a.level], color: a.level === 1 ? '#1d1d1f' : '#fff' }}>
              {m.hazard.levels[a.level]}
            </span>
            <b>{m.hazard.names[a.hazard]}</b>
            {showProvinces && provs.length === 1 && (
              <a href={provinceHref(provs[0]!)} className="font-semibold text-link">
                {provinceName(provs[0]!, lang)}
              </a>
            )}
            {showProvinces && provs.length > 1 && <span className="text-muted">{m.alerts.provinces(provs.length)}</span>}
          </p>
          <p className="mt-1 leading-snug">{alertText(a, m)}</p>
          <p className="mt-1 flex flex-wrap gap-x-2 text-sm text-faint">
            <Ago when={a.at} />
            <span>· {m.alerts.source(a.source)}</span>
            <a href={a.url ?? OFFICIAL[a.hazard]} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-semibold text-link">
              {m.alerts.official} <Icon name="external" size={13} />
            </a>
          </p>
        </div>
      </div>
    </li>
  )
}

export function AlertList({ alerts, empty, showProvinces = true }: { alerts: Alert[]; empty?: string; showProvinces?: boolean }) {
  const { m } = useI18n()
  if (!alerts.length) return <p className="rounded-[18px] bg-card p-5 text-muted">{empty ?? m.alerts.none}</p>
  return (
    <ul className="flex flex-col gap-2">
      {alerts.map((a) => (
        <AlertCard key={a.id} a={a} showProvinces={showProvinces} />
      ))}
    </ul>
  )
}

/** Pick provinces, hazards and a level; turn alerts on for this browser. */
export function AlertSubscribe({ province }: { province?: string }) {
  const { m, lang } = useI18n()
  const S = m.subscribe
  const [prefs, setPrefs] = useLocalStorage<AlertPrefs>('jaidee.alertPrefs', {
    provinces: province ? [province] : [],
    hazards: [...HAZARDS],
    minLevel: 2,
  })
  const [on, setOn] = useState(false)
  const [state, setState] = useState<'idle' | 'busy' | 'denied'>('idle')
  useEffect(() => {
    currentSubscription().then((s) => setOn(!!s))
  }, [])
  // Opening alerts from a province page puts that province in the list.
  const provinces = province && !prefs.provinces.includes(province) && !on ? [...prefs.provinces, province] : prefs.provinces
  const sorted = useMemo(() => [...PROVINCES].sort((a, b) => provinceName(a, lang).localeCompare(provinceName(b, lang), lang)), [lang])

  if (!pushSupported()) return <p className="text-muted">{S.unsupported}</p>
  return (
    <section className="flex flex-col gap-4 rounded-[22px] bg-card p-5">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-[#ff3b30] text-white">
          <Icon name="bell" size={22} />
        </span>
        <div>
          <h2 className="text-[20px] font-bold">{S.title}</h2>
          <p className="text-[15px] text-muted">{S.intro}</p>
        </div>
      </div>
      {needsHomeScreen() && <p className="rounded-[12px] bg-[#ffcc00]/20 p-3 text-[15px]">{S.ios}</p>}
      <div className="flex flex-col gap-2">
        <span className="font-semibold">{S.provinces}</span>
        <div className="flex flex-wrap gap-2">
          {provinces.map((c) => (
            <button
              key={c}
              onClick={() => setPrefs({ ...prefs, provinces: provinces.filter((x) => x !== c) })}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-go px-3.5 font-medium text-white"
            >
              {provinceName(provinceByCode.get(c)!, lang)} <span aria-hidden>×</span>
            </button>
          ))}
          <select
            className="min-h-10 rounded-full border border-line bg-page px-3"
            value=""
            onChange={(e) => e.target.value && setPrefs({ ...prefs, provinces: [...provinces, e.target.value] })}
            aria-label={S.addProvince}
          >
            <option value="">+ {S.addProvince}</option>
            {sorted
              .filter((p) => !provinces.includes(p.code))
              .map((p) => (
                <option key={p.code} value={p.code}>
                  {provinceName(p, lang)}
                </option>
              ))}
          </select>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <span className="font-semibold">{S.hazards}</span>
        <Choices
          multi
          options={HAZARDS.map((h) => [h, m.hazard.names[h]])}
          value={prefs.hazards}
          onChange={(h) => setPrefs({ ...prefs, hazards: prefs.hazards.includes(h) ? prefs.hazards.filter((x) => x !== h) : [...prefs.hazards, h] })}
        />
      </div>
      <div className="flex flex-col gap-2">
        <span className="font-semibold">{S.level}</span>
        <Choices
          options={([1, 2, 3] as const).map((l) => [l, m.hazard.levels[l]])}
          value={prefs.minLevel}
          onChange={(l) => setPrefs({ ...prefs, minLevel: l })}
          colors={{ 1: ALERT_COLOR[1], 2: ALERT_COLOR[2], 3: ALERT_COLOR[3] }}
        />
      </div>
      {state === 'denied' && <p className="text-urgent">{S.denied}</p>}
      {on && <p className="font-semibold text-[#248a3d]">{S.active}</p>}
      <div className="flex flex-wrap gap-2">
        <Button
          icon="bell"
          disabled={!provinces.length || !prefs.hazards.length || state === 'busy'}
          onClick={async () => {
            setState('busy')
            const ok = await subscribe({ ...prefs, provinces }, lang).catch(() => false)
            setPrefs({ ...prefs, provinces })
            setOn(ok || on)
            setState(ok ? 'idle' : 'denied')
          }}
        >
          {on ? S.update : S.on}
        </Button>
        {on && (
          <Button
            variant="secondary"
            onClick={async () => {
              await unsubscribe()
              setOn(false)
            }}
          >
            {S.off}
          </Button>
        )}
      </div>
    </section>
  )
}

/** #/alerts: everything flagged now, filterable by hazard, with the rules and the subscribe panel. */
export function AlertsPage({ alerts }: { alerts: Alert[] | null }) {
  const { m } = useI18n()
  const [hazard, setHazard] = useState<string>('all')
  const list = (alerts ?? []).filter((a) => hazard === 'all' || a.hazard === hazard)
  const counts = (h: string) => (alerts ?? []).filter((a) => a.hazard === h).length
  return (
    <div className="mx-auto w-full flex max-w-4xl flex-col gap-6 px-4 py-6 md:px-6">
      <header>
        <h1 className="text-[34px] font-bold leading-tight">{m.alerts.title}</h1>
        <p className="mt-1 text-lg text-muted">{m.alerts.sub}</p>
      </header>
      <Choices
        options={[['all', `${m.alerts.all} (${alerts?.length ?? 0})`], ...HAZARDS.filter((h) => counts(h)).map((h) => [h, `${m.hazard.names[h]} (${counts(h)})`] as [string, string])]}
        value={hazard}
        onChange={setHazard}
      />
      {alerts ? <AlertList alerts={list} /> : <p className="text-muted">{m.common.loading}</p>}
      <AlertSubscribe />
      <section className="flex flex-col gap-2 rounded-[18px] bg-card p-5">
        <h2 className="text-lg font-bold">{m.alerts.rules.title}</h2>
        <ul className="flex list-disc flex-col gap-1.5 pl-5 text-[15px] text-muted">
          {m.alerts.rules.items.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </section>
    </div>
  )
}
