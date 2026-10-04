import { useMemo } from 'react'
import { useI18n } from '../../i18n'
import { HAZARD } from '../../lib/alerts'
import { useApi, type Alert, type Hazards, type National } from '../../lib/api'
import { provinceAt } from '../../lib/geo'
import { href, navigate, type Section } from '../../lib/router'
import { clock } from '../../lib/time'
import { useGeolocation, useLocale } from '../../lib/ui'
import { ALERT_COLOR, STATUS_COLOR, damColor, quakeColor, stationStatus } from '../../lib/water'
import { AlertList } from '../alerts/Alerts'
import { Icon } from '../Icon'
import { EmergencyNumbers, GeoMessage, ProvinceSearch, SectionTitle, Tile } from '../kit'
import { NationalMap } from './NationalMap'

const HAZARDS = Object.keys(HAZARD) as Alert['hazard'][]

/** "How is Thailand today?": hazards at a glance, the hazard map, what needs attention, and what you can do. */
export function Home({ alerts }: { alerts: Alert[] | null }) {
  const { m } = useI18n()
  const locale = useLocale()
  const national = useApi<National>('/national')
  const hazards = useApi<Hazards>('/hazards')
  const geo = useGeolocation()

  const worst = (h: Alert['hazard']) => Math.max(0, ...(alerts ?? []).filter((a) => a.hazard === h).map((a) => a.level))
  const count = (h: Alert['hazard']) => (alerts ?? []).filter((a) => a.hazard === h).length
  const top = (alerts ?? []).filter((a) => a.level >= 2).slice(0, 6)

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

  return (
    <div className="mx-auto w-full flex max-w-6xl flex-col gap-7 px-4 py-6 md:px-6 md:py-8">
      <header className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl">
          <p className="text-[15px] font-semibold uppercase tracking-wide text-muted">{today}</p>
          <h1 className="mt-1 text-[34px] font-bold leading-tight md:text-[44px]">{m.home.title}</h1>
          <p className="mt-2 text-lg text-muted">{m.home.sub}</p>
        </div>
        <div className="flex w-full flex-col gap-2 md:w-[340px]">
          <ProvinceSearch onPick={(p) => navigate({ name: 'province', province: p, section: null })} />
          <button onClick={() => goNearMe()} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-go px-5 font-medium text-white hover:bg-go-hover">
            <Icon name="locate" size={20} />
            {m.home.nearMe}
          </button>
          <GeoMessage state={geo.state} />
        </div>
      </header>

      {/* One chip per hazard: its colour is the highest alert level anywhere in the country. */}
      <nav className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0" aria-label={m.alerts.title}>
        {HAZARDS.map((h) => {
          const lvl = worst(h)
          return (
            <a key={h} href={href({ name: 'alerts' })} className="flex shrink-0 items-center gap-2 rounded-full bg-card py-1.5 pl-1.5 pr-4 shadow-sm">
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

      <NationalMap />

      <div className="grid gap-7 lg:grid-cols-[1.25fr_1fr]">
        <section className="flex flex-col gap-3">
          <SectionTitle icon="bell" hue="red" action={<a href={href({ name: 'alerts' })} className="text-[15px] font-semibold text-link">{m.alerts.seeAll}</a>}>
            {m.alerts.title}
          </SectionTitle>
          {alerts ? <AlertList alerts={top} /> : <p className="text-muted">{m.common.loading}</p>}
        </section>

        <section className="grid grid-cols-2 content-start gap-3">
          <Stat icon="flood" color={STATUS_COLOR.over} label={m.tiles.rivers} value={String(over)} sub={`${m.tiles.riversOver(over)} · ${m.tiles.riversHigh(high)}`} />
          <Stat icon="dam" color={damColor(85)} label={m.layers.dams} value={String(fullDams.length)} sub={m.home.damsHigh} />
          <Stat icon="fire" color="#ff3b30" label={m.tiles.fire} value={String(firesTh)} sub={m.tiles.fireSub} />
          <Stat
            icon="quake"
            color={quake ? quakeColor(quake.at) : '#8e8e93'}
            label={m.tiles.quake}
            value={quake?.mag ? `M${quake.mag}` : '–'}
            sub={quake ? `${quake.place ?? ''} · ${clock(quake.at, locale)}` : m.tiles.quakeNone}
          />
          <Stat icon="wave" color="#64d2ff" label={m.tiles.satFlood} value={satKm2 ? m.tiles.satFloodValue(satKm2) : m.tiles.satFloodNone} sub={m.tiles.satFloodSub} />
          <Stat icon="lifebuoy" color="#34c759" label={m.nav.command} value={String(national.data?.commandCenters.length ?? 0)} sub={m.home.commandCenters} />
        </section>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile icon="pin" hue="blue" title={m.home.actions.report} sub={m.home.actions.reportSub} onClick={() => goNearMe('report')} />
        <Tile icon="lifebuoy" hue="red" title={m.home.actions.help} sub={m.home.actions.helpSub} onClick={() => goNearMe('help')} />
        <Tile icon="heart" hue="green" title={m.home.actions.volunteer} sub={m.home.actions.volunteerSub} href={href({ name: 'volunteer' })} />
        <Tile icon="globe3d" hue="purple" title={m.home.actions.simulator} sub={m.home.actions.simulatorSub} href={href({ name: 'flood' })} />
      </section>

      <EmergencyNumbers social rid />
      <p className="text-sm text-faint">
        {m.home.sourcesLine}
        {national.data?.updatedAt ? ` · ${m.common.updated(clock(national.data.updatedAt, locale))}` : ''}
      </p>
    </div>
  )
}

function Stat({ icon, color, label, value, sub }: { icon: Parameters<typeof Icon>[0]['name']; color: string; label: string; value: string; sub: string }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-[18px] bg-card p-4">
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
