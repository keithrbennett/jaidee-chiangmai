import { useMemo } from 'react'
import { PROVINCES } from '../../data/provinces'
import { useI18n } from '../../i18n'
import { useApi, type National } from '../../lib/api'
import { provinceAt } from '../../lib/geo'
import { href, navigate, provinceHref, type Section } from '../../lib/router'
import { clock } from '../../lib/time'
import { STATUS_COLOR, damColor, stationStatus } from '../../lib/water'
import { Icon } from '../Icon'
import { EmergencyNumbers, GeoMessage, IconBadge, ProvinceSearch, SectionTitle, StationRow, Tile } from '../kit'
import { provinceName, useGeolocation, useLocale } from '../../lib/ui'
import { NationalMap } from './NationalMap'

const byCode = new Map(PROVINCES.map((p) => [p.code, p]))

/** Thailand at a glance: live numbers, the 3D map, rivers over the bank, dams, and what you can do. */
export function Home() {
  const { m, lang } = useI18n()
  const locale = useLocale()
  const national = useApi<National>('/national')
  const geo = useGeolocation()
  const stations = useMemo(() => national.data?.stations ?? [], [national.data])

  const over = useMemo(
    () => stations.filter((s) => stationStatus(s) === 'over').sort((a, b) => (b.over ?? 0) - (a.over ?? 0)),
    [stations],
  )
  const high = stations.filter((s) => stationStatus(s) === 'high').length
  const dams = [...(national.data?.dams ?? [])].sort((a, b) => (b.storagePct ?? 0) - (a.storagePct ?? 0))

  /** Find the visitor's province, then open a page in it (or the province list if we can't). */
  async function goNearMe(section: Section | null = null) {
    const p = await geo.locate()
    const prov = p ? await provinceAt(p[0], p[1]) : null
    if (prov) navigate({ name: 'province', province: prov, section })
    else if (!p) return
    else navigate({ name: 'provinces' })
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-6 md:px-6 md:py-8">
      <header className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div className="max-w-2xl">
          <h1 className="text-[34px] font-bold leading-tight md:text-[44px]">{m.home.title}</h1>
          <p className="mt-2 text-lg text-muted md:text-xl">{m.home.sub}</p>
        </div>
        <div className="flex w-full flex-col gap-2 md:w-[360px]">
          <ProvinceSearch onPick={(p) => navigate({ name: 'province', province: p, section: null })} />
          <button
            onClick={() => goNearMe()}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-go px-5 font-medium text-white hover:bg-go-hover"
          >
            <Icon name="locate" size={20} />
            {m.home.nearMe}
          </button>
          <GeoMessage state={geo.state} />
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat value={over.length} label={m.home.overBank} color={STATUS_COLOR.over} icon="flood" />
        <Stat value={high} label={m.home.high} color={STATUS_COLOR.high} icon="up" />
        <Stat value={dams.filter((d) => (d.storagePct ?? 0) > 80).length} label={m.home.damsHigh} color="#0a84ff" icon="dam" />
        <Stat value={national.data?.commandCenters.length ?? 0} label={m.home.commandCenters} color="#34c759" icon="lifebuoy" />
      </section>

      <section className="flex flex-col gap-3">
        <NationalMap />
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-faint">
          <span>
            {m.home.sourcesLine}
            {national.data?.updatedAt ? ` · ${m.common.updated(clock(national.data.updatedAt, locale))}` : ''}
          </span>
          <a href={href({ name: 'map' })} className="inline-flex items-center gap-1 font-semibold text-link">
            {m.home.openMap} <Icon name="forward" size={16} />
          </a>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile icon="flood" hue="blue" title={m.home.actions.report} sub={m.home.actions.reportSub} onClick={() => goNearMe('report')} />
        <Tile icon="lifebuoy" hue="red" title={m.home.actions.help} sub={m.home.actions.helpSub} onClick={() => goNearMe('help')} />
        <Tile icon="heart" hue="green" title={m.home.actions.volunteer} sub={m.home.actions.volunteerSub} href={href({ name: 'volunteer' })} />
        <Tile icon="globe3d" hue="purple" title={m.home.actions.simulator} sub={m.home.actions.simulatorSub} href={href({ name: 'flood' })} />
      </section>

      <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        <section className="flex flex-col gap-3">
          <SectionTitle icon="alert" hue="red">
            {m.home.overList}
          </SectionTitle>
          {national.loading ? (
            <p className="text-muted">{m.common.loading}</p>
          ) : over.length ? (
            <div className="flex flex-col gap-2">
              {over.slice(0, 12).map((s) => (
                <a key={s.code} href={s.province && byCode.get(s.province) ? provinceHref(byCode.get(s.province)!) : undefined}>
                  <StationRowWithProvince s={s} />
                </a>
              ))}
            </div>
          ) : (
            <p className="rounded-[16px] bg-card p-5 text-muted">{m.home.overNone}</p>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <SectionTitle icon="dam" hue="blue">
            {m.home.dams}
          </SectionTitle>
          <ul className="flex flex-col gap-2">
            {dams.slice(0, 12).map((d) => (
              <li key={d.id} className="flex items-center gap-3 rounded-[16px] bg-card p-3">
                <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-[10px] bg-paper">
                  <div className="absolute inset-x-0 bottom-0" style={{ height: `${Math.min(100, d.storagePct ?? 0)}%`, background: damColor(d.storagePct) }} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{lang === 'th' ? `เขื่อน${d.th}` : d.en}</p>
                  <p className="truncate text-sm text-muted">
                    {d.province && byCode.get(d.province) ? provinceName(byCode.get(d.province)!, lang) : ''} ·{' '}
                    {m.home.damFlow(String(d.inflow ?? '–'), String(d.released ?? '–'))}
                  </p>
                </div>
                <b className="text-lg tabular-nums" style={{ color: damColor(d.storagePct) }}>
                  {Math.round(d.storagePct ?? 0)}%
                </b>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <EmergencyNumbers social rid />
    </div>
  )
}

function StationRowWithProvince({ s }: { s: Parameters<typeof StationRow>[0]['s'] }) {
  const { lang } = useI18n()
  const p = s.province ? byCode.get(s.province) : undefined
  return (
    <div className="flex flex-col">
      {p && <span className="mb-1 ml-1 text-sm font-semibold text-muted">{provinceName(p, lang)}</span>}
      <ul>
        <StationRow s={s} />
      </ul>
    </div>
  )
}

function Stat({ value, label, color, icon }: { value: number; label: string; color: string; icon: Parameters<typeof IconBadge>[0]['icon'] }) {
  return (
    <div className="flex flex-col gap-2 rounded-[18px] bg-card p-4">
      <span className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] text-white" style={{ background: color }}>
        <Icon name={icon} size={20} />
      </span>
      <b className="text-[34px] font-bold leading-none tabular-nums" style={{ color }}>
        {value}
      </b>
      <span className="text-[15px] leading-snug text-muted">{label}</span>
    </div>
  )
}

