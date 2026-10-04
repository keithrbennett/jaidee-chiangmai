import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import type { Province } from '../../data/provinces'
import { useI18n } from '../../i18n'
import { HAZARD } from '../../lib/alerts'
import { useApi, type Alert, type Hazards, type National } from '../../lib/api'
import { provinceAt } from '../../lib/geo'
import type { IconName } from '../../lib/icons'
import { openQuickReport } from '../../lib/report'
import { href, navigate, provinceByCode, type Section } from '../../lib/router'
import { clock } from '../../lib/time'
import { useGeolocation, useLocale } from '../../lib/ui'
import { ALERT_COLOR, STATUS_COLOR, damColor, quakeColor, stationStatus } from '../../lib/water'
import { AlertList } from '../alerts/Alerts'
import { AskBar } from '../assistant/AskBar'
import { Icon } from '../Icon'
import { AnimatedNumber, EmergencyNumbers, GeoMessage, ProvinceSearch, SectionTitle, Tile } from '../kit'
import { ProvinceSheet } from '../province/ProvinceSheet'
import { NationalMap } from './NationalMap'

const HAZARDS = Object.keys(HAZARD) as Alert['hazard'][]

/**
 * The front page puts first what people come for in a crisis: asking for help, reporting what they see,
 * who to call, and how it is where they are. Then the country's state in one sentence, น้องใจดี, the map,
 * the alerts and the numbers.
 */
export function Home({ alerts }: { alerts: Alert[] | null }) {
  const { m } = useI18n()
  const H = m.home
  const locale = useLocale()
  const national = useApi<National>('/national')
  const hazards = useApi<Hazards>('/hazards')
  const geo = useGeolocation()
  const [picker, setPicker] = useState<'help' | 'contacts' | null>(null)
  const [sheet, setSheet] = useState<Province | null>(null)

  const worst = (h: Alert['hazard']) => Math.max(0, ...(alerts ?? []).filter((a) => a.hazard === h).map((a) => a.level))
  const count = (h: Alert['hazard']) => (alerts ?? []).filter((a) => a.hazard === h).length
  const top = (alerts ?? []).filter((a) => a.level >= 2).slice(0, 6)
  // Provinces in danger (level 3) and those with a warning, for the sentence under the title.
  const dangerProvinces = new Set((alerts ?? []).filter((a) => a.level === 3).flatMap((a) => a.provinces))
  const warnProvinces = new Set((alerts ?? []).filter((a) => a.level === 2).flatMap((a) => a.provinces).filter((c) => !dangerProvinces.has(c)))
  const mainHazards = HAZARDS.filter((h) => worst(h) >= 2)
    .sort((a, b) => worst(b) - worst(a) || count(b) - count(a))
    .slice(0, 3)

  const stations = useMemo(() => national.data?.stations ?? [], [national.data])
  const over = stations.filter((s) => stationStatus(s) === 'over').length
  const high = stations.filter((s) => stationStatus(s) === 'high').length
  const firesTh = (hazards.data?.hotspots ?? []).filter((h) => h[6] === 'Thailand').length
  const quake = [...(hazards.data?.quakes ?? [])].sort((a, b) => (b.mag ?? 0) - (a.mag ?? 0))[0]
  const fullDams = (national.data?.dams ?? []).filter((d) => (d.storagePct ?? 0) >= 80)
  const satKm2 = Math.round(Object.values(hazards.data?.satFlood ?? {}).reduce((a, b) => a + b, 0) * 0.056)

  async function goNearMe(section: Section | null = null) {
    const p = await geo.locate()
    const prov = p ? await provinceAt(p[0], p[1]) : null
    if (prov) navigate({ name: 'province', province: prov, section })
    else if (p) navigate({ name: 'provinces' })
  }

  const today = new Date().toLocaleDateString(locale, { timeZone: 'Asia/Bangkok', weekday: 'long', day: 'numeric', month: 'long' })
  const actions: { icon: IconName; title: string; sub: string; color: string; onClick: () => void }[] = [
    { icon: 'lifebuoy', title: H.actions.help, sub: H.actions.helpSub, color: '#e5332a', onClick: () => setPicker('help') },
    { icon: 'camera', title: m.report.open, sub: m.report.openSub, color: '#0a7cff', onClick: () => openQuickReport() },
    { icon: 'phone', title: m.contacts.open, sub: m.contacts.openSub, color: '#2a9d4b', onClick: () => setPicker('contacts') },
    { icon: 'locate', title: H.near, sub: H.nearSub, color: '#5856d6', onClick: () => goNearMe() },
  ]

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-7 px-4 py-6 md:px-6 md:py-8">
      <header className="grid gap-5 md:grid-cols-[1fr_420px] md:items-end">
        <div className="rise max-w-2xl">
          <p className="text-[15px] font-semibold uppercase tracking-wide text-muted">{today}</p>
          <h1 className="mt-1 text-[34px] font-bold leading-[1.1] md:text-[46px]">{H.title}</h1>
          {alerts && (
            <p className="mt-3 text-[18px] leading-snug">
              {dangerProvinces.size ? (
                <>
                  <b style={{ color: ALERT_COLOR[3] }}>{H.statusDanger(dangerProvinces.size)}</b>
                  {warnProvinces.size > 0 && <span className="text-muted"> · {H.statusWarn(warnProvinces.size)}</span>}
                  {mainHazards.length > 0 && <span className="text-muted"> · {H.statusMostly(mainHazards.map((h) => m.hazard.names[h]).join(', '))}</span>}
                </>
              ) : warnProvinces.size ? (
                <b style={{ color: ALERT_COLOR[2] }}>{H.statusWarn(warnProvinces.size)}</b>
              ) : (
                <span className="text-[#1f7a35] dark:text-[#30d158]">{H.statusCalm}</span>
              )}
            </p>
          )}
        </div>
        <div className="rise" style={{ '--i': 1 } as CSSProperties}>
          <AskBar />
        </div>
      </header>

      {/* What people come for in a crisis, first. */}
      <section className="grid grid-cols-3 gap-3 md:grid-cols-4" aria-label={H.actionsTitle}>
        {actions.map((a, i) => (
          <button
            key={a.title}
            onClick={a.onClick}
            className={`press lift rise flex flex-col justify-between gap-3 overflow-hidden rounded-[24px] p-4 text-left text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.22),0_10px_28px_rgb(0_0_0/0.12)] ${
              i === 0 ? 'col-span-3 min-h-[128px] md:col-span-1 md:min-h-[150px]' : 'min-h-[118px] md:min-h-[150px]'
            }`}
            style={{ background: a.color, '--i': i + 2 } as CSSProperties}
          >
            <span className="grid h-11 w-11 place-items-center rounded-full bg-white/20">
              <Icon name={a.icon} size={23} />
            </span>
            <span>
              <b className={`block leading-tight ${i === 0 ? 'text-[22px]' : 'text-[16px] md:text-[19px]'}`}>{a.title}</b>
              <span className={`mt-0.5 block text-[13px] leading-snug text-white/85 md:text-[14px] ${i === 0 ? '' : 'hidden sm:block'}`}>{a.sub}</span>
            </span>
          </button>
        ))}
      </section>
      <GeoMessage state={geo.state} />

      {/* One chip per hazard: its colour is the highest alert level anywhere in the country. */}
      <nav className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0" aria-label={m.alerts.title}>
        {HAZARDS.map((h, i) => {
          const lvl = worst(h)
          return (
            <a
              key={h}
              href={href({ name: 'alerts' })}
              className="press rise flex shrink-0 items-center gap-2 rounded-full bg-card py-1.5 pl-1.5 pr-4 shadow-sm"
              style={{ '--i': i + 6 } as CSSProperties}
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full text-white" style={{ background: HAZARD[h].color }}>
                <Icon name={HAZARD[h].icon} size={18} />
              </span>
              <span className="font-semibold">{m.hazard.names[h]}</span>
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: ALERT_COLOR[lvl] }} />
              <span className="text-sm text-muted">{lvl ? `${m.hazard.levels[lvl]} · ${count(h)}` : m.hazard.levels[0]}</span>
            </a>
          )
        })}
      </nav>

      <div className="rise" style={{ '--i': 8 } as CSSProperties}>
        <NationalMap onProvince={(code) => setSheet(provinceByCode.get(code) ?? null)} />
      </div>

      <div className="grid gap-7 lg:grid-cols-[1.25fr_1fr]">
        <section className="flex flex-col gap-3">
          <SectionTitle icon="bell" hue="red" action={<a href={href({ name: 'alerts' })} className="text-[15px] font-semibold text-link">{m.alerts.seeAll}</a>}>
            {m.alerts.title}
          </SectionTitle>
          {alerts ? <AlertList alerts={top} /> : <p className="text-muted">{m.common.loading}</p>}
        </section>

        <section className="grid grid-cols-2 content-start gap-3">
          <Stat icon="flood" color={STATUS_COLOR.over} label={m.tiles.rivers} value={<AnimatedNumber value={over} />} sub={`${m.tiles.riversOver(over)} · ${m.tiles.riversHigh(high)}`} />
          <Stat icon="dam" color={damColor(85)} label={m.layers.dams} value={<AnimatedNumber value={fullDams.length} />} sub={H.damsHigh} />
          <Stat icon="fire" color="#ff3b30" label={m.tiles.fire} value={<AnimatedNumber value={firesTh} />} sub={m.tiles.fireSub} />
          <Stat
            icon="quake"
            color={quake ? quakeColor(quake.at) : '#8e8e93'}
            label={m.tiles.quake}
            value={quake?.mag ? `M${quake.mag}` : '–'}
            sub={quake ? `${quake.place ?? ''} · ${clock(quake.at, locale)}` : m.tiles.quakeNone}
          />
          <Stat icon="wave" color="#64d2ff" label={m.tiles.satFlood} value={satKm2 ? m.tiles.satFloodValue(satKm2) : m.tiles.satFloodNone} sub={m.tiles.satFloodSub} />
          <Stat icon="lifebuoy" color="#34c759" label={m.nav.command} value={<AnimatedNumber value={national.data?.commandCenters.length ?? 0} />} sub={H.commandCenters} />
        </section>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile icon="book" hue="orange" title={H.actions.guide} sub={H.actions.guideSub} href={href({ name: 'guide', topic: null })} />
        <Tile icon="bell" hue="red" title={m.subscribe.title} sub={H.subscribeSub} href={href({ name: 'alerts' })} />
        <Tile icon="heart" hue="green" title={H.actions.volunteer} sub={H.actions.volunteerSub} href={href({ name: 'volunteer' })} />
        <Tile icon="globe3d" hue="purple" title={H.actions.simulator} sub={H.actions.simulatorSub} href={href({ name: 'flood' })} />
      </section>

      <EmergencyNumbers social rid />
      <p className="text-sm text-faint">
        {H.sourcesLine}
        {national.data?.updatedAt ? ` · ${m.common.updated(clock(national.data.updatedAt, locale))}` : ''}
      </p>

      {picker && <ProvincePicker mode={picker} onClose={() => setPicker(null)} />}
      {sheet && <ProvinceSheet province={sheet} modal onClose={() => setSheet(null)} />}
    </div>
  )
}

/**
 * "I need help" / "emergency numbers": calls first (a life at risk shouldn't wait for a form), then the
 * province, from the location or by name, to open its help form or its numbers.
 */
function ProvincePicker({ mode, onClose }: { mode: 'help' | 'contacts'; onClose: () => void }) {
  const { m } = useI18n()
  const P = m.home.picker
  const geo = useGeolocation()
  const go = (p: Province) => {
    onClose()
    navigate({ name: 'province', province: p, section: mode === 'help' ? 'help' : 'contacts' })
  }
  return (
    <div className="fixed inset-0 z-[1150] flex items-end justify-center md:items-center">
      <div className="fade-in absolute inset-0 bg-black/40" onClick={onClose} />
      <section
        role="dialog"
        aria-label={mode === 'help' ? P.helpTitle : P.contactsTitle}
        className="jd-sheet relative flex w-full flex-col gap-5 rounded-t-[26px] bg-page p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-2xl md:max-w-[480px] md:rounded-[28px]"
      >
        <header className="flex items-start gap-3">
          <div className="flex-1">
            <h2 className="text-[24px] font-bold leading-tight">{mode === 'help' ? P.helpTitle : P.contactsTitle}</h2>
            <p className="mt-1 text-[15px] text-muted">{P.callFirst}</p>
          </div>
          <button onClick={onClose} aria-label={m.assistant.close} className="press grid h-9 w-9 place-items-center rounded-full bg-paper text-muted">
            <Icon name="close" size={18} />
          </button>
        </header>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              ['1669', '#ff3b30', m.contacts.kinds.medical],
              ['1784', '#ff9500', m.contacts.kinds.disaster],
              ['191', '#0a84ff', m.contacts.kinds.police],
            ] as const
          ).map(([n, color, label]) => (
            <a key={n} href={`tel:${n}`} className="press flex flex-col gap-1 rounded-[18px] p-3 text-white" style={{ background: color }}>
              <span className="text-[26px] font-bold leading-none tabular-nums">{n}</span>
              <span className="text-[12px] leading-tight text-white/90">{label}</span>
            </a>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          <p className="font-semibold">{mode === 'help' ? P.helpOnline : P.contactsWhere}</p>
          <button
            onClick={async () => {
              const pt = await geo.locate()
              const prov = pt ? await provinceAt(pt[0], pt[1]) : null
              if (prov) go(prov)
            }}
            className="press inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-go px-5 font-semibold text-white"
          >
            <Icon name="locate" size={20} /> {geo.state === 'locating' ? m.common.locating : m.home.nearMe}
          </button>
          <GeoMessage state={geo.state === 'locating' ? 'idle' : geo.state} />
          <ProvinceSearch onPick={go} />
        </div>
      </section>
    </div>
  )
}

function Stat({ icon, color, label, value, sub }: { icon: IconName; color: string; label: string; value: ReactNode; sub: string }) {
  return (
    <div className="rise flex flex-col gap-1.5 rounded-[18px] bg-card p-4">
      <span className="flex items-center gap-2 text-[15px] font-semibold text-muted">
        <span className="flex h-7 w-7 items-center justify-center rounded-[8px] text-white" style={{ background: color }}>
          <Icon name={icon} size={16} />
        </span>
        {label}
      </span>
      <b className="text-[28px] font-bold leading-tight tabular-nums" style={{ color }}>
        {value}
      </b>
      <span className="line-clamp-2 text-sm leading-snug text-muted">{sub}</span>
    </div>
  )
}
