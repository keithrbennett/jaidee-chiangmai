import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { PROVINCES, type Province } from '../../data/provinces'
import { useI18n } from '../../i18n'
import { HAZARD, OFFICIAL, alertText } from '../../lib/alerts'
import type { Alert } from '../../lib/api'
import { currentSubscription, needsHomeScreen, pushSupported, subscribe, unsubscribe, type AlertPrefs } from '../../lib/push'
import { provinceByCode, provinceHref } from '../../lib/router'
import { useLocalStorage } from '../../lib/useLocalStorage'
import { provinceName } from '../../lib/ui'
import { ALERT_COLOR } from '../../lib/water'
import { Icon } from '../Icon'
import { Ago, Choices, Disclosure } from '../kit'
import { ProvinceSheet } from '../province/ProvinceSheet'
import { ThaiMap } from './ThaiMap'
import { Button } from '../ui'

const HAZARDS = Object.keys(HAZARD) as Alert['hazard'][]

/** One alert: a coloured edge for the level, the hazard, one plain sentence, where, when, and the source. */
export function AlertCard({ a, showProvinces = true }: { a: Alert; showProvinces?: boolean }) {
  const { m, lang } = useI18n()
  const h = HAZARD[a.hazard]
  const provs = a.provinces.map((c) => provinceByCode.get(c)).filter(Boolean)
  return (
    <li className="rise flex overflow-hidden rounded-[18px] bg-card">
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
export function AlertSubscribe({ province, bare = false }: { province?: string; bare?: boolean }) {
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
    <section className={bare ? 'flex flex-col gap-4' : 'flex flex-col gap-4 rounded-[22px] bg-card p-5'}>
      {!bare && (
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-[12px] bg-[#ff3b30] text-white">
            <Icon name="bell" size={22} />
          </span>
          <div>
            <h2 className="text-[20px] font-bold">{S.title}</h2>
            <p className="text-[15px] text-muted">{S.intro}</p>
          </div>
        </div>
      )}
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

/**
 * #/alerts: how bad, where, and what. A bar of provinces by level, the map coloured the same way, then the
 * alerts as compact rows grouped by hazard, the reader's own provinces first. Subscribing and the rules sit
 * beside the list, folded away.
 */
export function AlertsPage({ alerts }: { alerts: Alert[] | null }) {
  const { m } = useI18n()
  const A = m.alerts
  const [hazard, setHazard] = useState<string>('all')
  const [minLevel, setMinLevel] = useState<number>(1)
  const [sheet, setSheet] = useState<Province | null>(null)
  const [prefs] = useLocalStorage<AlertPrefs>('jaidee.alertPrefs', { provinces: [], hazards: [...HAZARDS], minLevel: 2 })
  const all = alerts ?? []
  const list = all.filter((a) => (hazard === 'all' || a.hazard === hazard) && a.level >= minLevel)
  const counts = (h: string) => all.filter((a) => a.hazard === h).length

  // Each province's highest level, for the bar and the map.
  const levels: Record<string, number> = {}
  for (const a of all) for (const c of a.provinces) levels[c] = Math.max(levels[c] ?? 0, a.level)
  const byLevel = [0, 0, 0, 0]
  for (const l of Object.values(levels)) byLevel[l]++
  const total = byLevel[1] + byLevel[2] + byLevel[3]

  const mine = prefs.provinces.length ? list.filter((a) => a.provinces.some((c) => prefs.provinces.includes(c))) : []
  const groups = HAZARDS.map((h) => [h, list.filter((a) => a.hazard === h)] as const).filter(([, l]) => l.length)

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 md:px-6 md:py-8">
      <header className="rise max-w-3xl">
        <h1 className="text-[34px] font-bold leading-tight md:text-[44px]">{A.title}</h1>
        <p className="mt-2 text-lg text-muted">{A.sub}</p>
      </header>

      {alerts && (
        <section className="rise flex flex-col gap-2" aria-label={A.byLevel}>
          <div className="flex h-3 overflow-hidden rounded-full bg-paper">
            {[3, 2, 1].map((l) =>
              byLevel[l] ? <span key={l} style={{ width: `${(byLevel[l] / 77) * 100}%`, background: ALERT_COLOR[l] }} className="transition-[width] duration-700" /> : null,
            )}
          </div>
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-[15px]">
            {[3, 2, 1].map((l) => (
              <span key={l} className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: ALERT_COLOR[l] }} />
                <b className="tabular-nums">{byLevel[l]}</b> {m.hazard.levels[l]}
              </span>
            ))}
            <span className="text-muted">{A.ofProvinces(total)}</span>
          </p>
        </section>
      )}

      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
        <div className="flex min-w-0 flex-col gap-6">
          <div className="flex flex-col gap-3">
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
              {(['all', ...HAZARDS.filter((h) => counts(h))] as string[]).map((h) => {
                const on = hazard === h
                const meta = h === 'all' ? null : HAZARD[h as Alert['hazard']]
                return (
                  <button
                    key={h}
                    onClick={() => setHazard(h)}
                    aria-pressed={on}
                    className={`press inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full pl-2 pr-4 text-[15px] font-semibold ${on ? 'bg-ink text-page' : 'bg-card'}`}
                  >
                    {meta ? (
                      <span className="grid h-7 w-7 place-items-center rounded-full text-white" style={{ background: meta.color }}>
                        <Icon name={meta.icon} size={16} />
                      </span>
                    ) : (
                      <span className="w-1" />
                    )}
                    {h === 'all' ? A.all : m.hazard.names[h]}
                    <span className={`tabular-nums ${on ? 'text-page/70' : 'text-faint'}`}>{h === 'all' ? all.length : counts(h)}</span>
                  </button>
                )
              })}
            </div>
            <div role="group" className="flex self-start rounded-full bg-paper p-1">
              {[1, 2, 3].map((l) => (
                <button
                  key={l}
                  onClick={() => setMinLevel(l)}
                  aria-pressed={minLevel === l}
                  className={`inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 text-[14px] font-semibold transition ${minLevel === l ? 'bg-card text-ink shadow-sm' : 'text-muted'}`}
                >
                  <span className="h-2 w-2 rounded-full" style={{ background: ALERT_COLOR[l] }} />
                  {l === 1 ? A.allLevels : A.fromLevel(m.hazard.levels[l])}
                </button>
              ))}
            </div>
          </div>

          {!alerts ? (
            <div className="flex flex-col gap-2">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="skeleton h-20" />
              ))}
            </div>
          ) : !list.length ? (
            <p className="rounded-[18px] bg-card p-5 text-muted">{A.none}</p>
          ) : (
            <>
              {mine.length > 0 && (
                <section className="flex flex-col gap-2">
                  <h2 className="flex items-center gap-2 text-[20px] font-bold">
                    <Icon name="pin" size={20} className="text-go" /> {A.yours}
                    <span className="text-[15px] font-semibold text-faint tabular-nums">{mine.length}</span>
                  </h2>
                  <AlertRows alerts={mine} onProvince={setSheet} />
                </section>
              )}
              {groups.map(([h, l]) => (
                <section key={h} className="flex flex-col gap-2">
                  <h2 className="flex items-center gap-2 text-[20px] font-bold">
                    <span className="grid h-7 w-7 place-items-center rounded-[8px] text-white" style={{ background: HAZARD[h].color }}>
                      <Icon name={HAZARD[h].icon} size={16} />
                    </span>
                    {m.hazard.names[h]}
                    <span className="text-[15px] font-semibold text-faint tabular-nums">{l.length}</span>
                  </h2>
                  <AlertRows alerts={l} onProvince={setSheet} />
                </section>
              ))}
            </>
          )}
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-[24px] bg-card p-4">
            <ThaiMap levels={levels} onPick={(code) => setSheet(provinceByCode.get(code) ?? null)} />
            <p className="mt-2 text-center text-[13px] text-faint">{A.mapHint}</p>
          </div>
          <Disclosure icon="bell" hue="red" title={m.subscribe.title} sub={m.subscribe.intro}>
            <AlertSubscribe bare />
          </Disclosure>
          <Disclosure icon="about" hue="gray" title={A.rules.title}>
            <ul className="flex list-disc flex-col gap-1.5 pl-5 text-[14px] text-muted">
              {A.rules.items.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </Disclosure>
        </aside>
      </div>
      {sheet && <ProvinceSheet province={sheet} modal onClose={() => setSheet(null)} />}
          </div>
  )
}

/** Alerts as compact rows in one card: the level as a coloured edge, where, what, when, and the source. */
function AlertRows({ alerts, onProvince }: { alerts: Alert[]; onProvince: (p: Province) => void }) {
  const { m, lang } = useI18n()
  return (
    <ul className="overflow-hidden rounded-[18px] bg-card">
      {alerts.map((a, i) => {
        const provs = a.provinces.map((c) => provinceByCode.get(c)).filter(Boolean) as Province[]
        return (
          <li key={a.id} className="rise flex gap-3 border-b border-line/60 px-4 py-3 last:border-0" style={{ '--i': Math.min(i, 8) } as CSSProperties}>
            <span className="mt-1 w-1 shrink-0 self-stretch rounded-full" style={{ background: ALERT_COLOR[a.level] }} />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-baseline gap-x-2">
                {provs.length === 1 ? (
                  <button onClick={() => onProvince(provs[0])} className="text-[17px] font-bold hover:text-link">
                    {provinceName(provs[0], lang)}
                  </button>
                ) : (
                  <b className="text-[17px]">{m.alerts.provinces(provs.length)}</b>
                )}
                <span className="text-[12px] font-bold uppercase tracking-wide" style={{ color: a.level === 1 ? '#a37f00' : ALERT_COLOR[a.level] }}>
                  {m.hazard.levels[a.level]}
                </span>
              </p>
              <p className="text-[15px] leading-snug">{alertText(a, m)}</p>
              {provs.length > 1 && <p className="mt-0.5 line-clamp-1 text-[13px] text-muted">{provs.map((p) => provinceName(p, lang)).join(' · ')}</p>}
              <p className="mt-1 flex flex-wrap gap-x-2 text-[13px] text-faint">
                <Ago when={a.at} />
                <span>· {m.alerts.source(a.source)}</span>
                <a href={a.url ?? OFFICIAL[a.hazard]} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-semibold text-link">
                  {m.alerts.official} <Icon name="external" size={12} />
                </a>
              </p>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
