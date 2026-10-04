import { useMemo, useState } from 'react'
import { useI18n } from '../../i18n'
import type { Station } from '../../lib/api'
import { aqiBand } from '../../lib/conditions'
import { next24 } from '../../lib/forecast'
import { loadTambons, useGeo, type Tambon } from '../../lib/geo'
import { href, provinceHref } from '../../lib/router'
import { clock } from '../../lib/time'
import { LEVEL_COLOR, RAIN_CLASSES, damColor, isReceded, km, rainClass, stationStatus, STATUS_ORDER } from '../../lib/water'
import { Icon } from '../Icon'
import { EmergencyNumbers, GeoMessage, IconBadge, Loading, SectionTitle, StationRow, Tile, inputCls } from '../kit'
import { provinceName, useGeolocation, useLocale } from '../../lib/ui'
import type { ProvinceProps } from './ProvincePage'

const NEAR_KM = 3

/** A province at a glance, modelled on what people need in a flood: am I at risk, what's coming, what can I do. */
export function Hub({ province, data, dataError, reports }: ProvinceProps) {
  const { m, lang } = useI18n()
  const locale = useLocale()
  const name = provinceName(province, lang)
  const center = data?.commandCenter
  const stations = useMemo(
    () => [...(data?.stations ?? [])].sort((a, b) => STATUS_ORDER.indexOf(stationStatus(a)) - STATUS_ORDER.indexOf(stationStatus(b)) || (b.pct ?? 0) - (a.pct ?? 0)),
    [data],
  )
  const [showAll, setShowAll] = useState(false)
  const rain24 = data?.forecast ? next24(data.forecast) : null
  const worstAir = [...(data?.air ?? [])].sort((a, b) => b.aqi - a.aqi)[0]
  const wettest = [...(data?.rain ?? [])].sort((a, b) => (b[2] ?? 0) - (a[2] ?? 0))[0]
  const p = (s: Parameters<typeof provinceHref>[1]) => provinceHref(province, s)

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-7 px-4 py-5 md:px-6">
      <header className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <p className="text-[15px] font-semibold text-muted">{m.regions[province.region]}</p>
          <h1 className="text-[32px] font-bold leading-tight md:text-[40px]">{m.province.title(name)}</h1>
        </div>
        <a href={href({ name: 'provinces' })} className="inline-flex min-h-11 items-center gap-1 rounded-full border border-line px-4 font-medium text-link">
          {m.province.change}
        </a>
      </header>

      <a href={p('report')} className="group flex items-center gap-4 rounded-[22px] bg-gradient-to-br from-[#0a84ff] to-[#5e5ce6] p-5 text-white shadow-lg md:p-6">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[16px] bg-white/20">
          <Icon name="flood" size={32} />
        </span>
        <span className="flex-1">
          <span className="block text-[24px] font-bold leading-tight">{m.province.report}</span>
          <span className="block text-white/85">{m.province.reportSub}</span>
        </span>
        <Icon name="forward" size={28} className="transition-transform group-hover:translate-x-1" />
      </a>

      {center?.active ? (
        <section className="flex flex-col gap-3 rounded-[22px] border-2 border-[#34c759] bg-card p-5">
          <p className="flex items-center gap-2 text-lg font-bold text-[#34c759]">
            <Icon name="lifebuoy" />
            {center.name ? m.province.centerOpen(center.name) : m.province.centerOpenDefault}
          </p>
          {center.hotline && (
            <a href={`tel:${center.hotline}`} className="font-semibold text-link">
              {m.province.centerHotline(center.hotline)}
            </a>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            <a href={p('help')} className="inline-flex min-h-14 items-center justify-center gap-2 rounded-full bg-urgent px-5 text-lg font-semibold text-white">
              <Icon name="lifebuoy" /> {m.province.askHelp}
            </a>
            <a href={p('missing')} className="inline-flex min-h-14 items-center justify-center gap-2 rounded-full border-2 border-ink px-5 text-lg font-semibold">
              <Icon name="person" /> {m.province.findPerson}
            </a>
          </div>
        </section>
      ) : (
        <section className="flex flex-col gap-2 rounded-[22px] bg-card p-5">
          <p className="text-lg font-bold">{m.province.centerClosed}</p>
          <p className="text-muted">{m.province.centerClosedSub}</p>
          <a href={p('open')} className="mt-1 inline-flex items-center gap-1 self-start text-[15px] font-semibold text-link">
            {m.province.agencies} <Icon name="forward" size={16} />
          </a>
        </section>
      )}

      <NearMe stations={data?.stations ?? []} reports={reports ?? []} shelters={data?.shelters ?? []} provinceCode={province.code} />

      <section className="flex flex-col gap-3">
        <SectionTitle icon="cloud" hue="blue" action={<a href={p('weather')} className="text-[15px] font-semibold text-link">{m.province.sections.weather}</a>}>
          {m.rain.next24}
        </SectionTitle>
        {rain24 ? (
          <div className="rounded-[18px] bg-card p-5">
            <p className="text-[24px] font-bold" style={{ color: RAIN_CLASSES[Math.max(0, rainClass(rain24.total))].color }}>
              {rainClass(rain24.total) < 0 ? m.rain.none : m.rain.classes[rainClass(rain24.total)]}
            </p>
            <p className="text-muted">
              {m.rain.summary(rain24.total.toFixed(1), rain24.chance)}
              {rain24.start && ` · ${m.rain.startsAround(clock(rain24.start, locale))}`}
            </p>
            <RainBars hours={rain24.hours} />
          </div>
        ) : (
          <Loading error={dataError} />
        )}
        {wettest && (wettest[2] ?? 0) > 0 && <p className="text-[15px] text-muted">{m.rain.last24}: {m.rain.wettest(wettest[2] ?? 0, wettest[5])}</p>}
      </section>

      <section className="flex flex-col gap-3">
        <SectionTitle icon="flood" hue="teal" action={<a href={p('map')} className="text-[15px] font-semibold text-link">{m.common.seeMap}</a>}>
          {m.province.rivers}
        </SectionTitle>
        {!data ? (
          <Loading error={dataError} />
        ) : stations.length ? (
          <>
            <ul className="flex flex-col gap-2">
              {(showAll ? stations : stations.slice(0, 6)).map((s) => (
                <StationRow key={s.code} s={s} />
              ))}
            </ul>
            {stations.length > 6 && !showAll && (
              <button onClick={() => setShowAll(true)} className="self-start font-semibold text-link">
                {m.common.seeAll} ({stations.length})
              </button>
            )}
          </>
        ) : (
          <p className="rounded-[16px] bg-card p-5 text-muted">{m.province.riversNone}</p>
        )}
        <p className="text-sm text-faint">{m.common.source('RID SWOC · Thaiwater (HII)')}</p>
      </section>

      {(data?.dams.length ?? 0) > 0 && (
        <section className="flex flex-col gap-3">
          <SectionTitle icon="dam" hue="blue">
            {m.province.dams}
          </SectionTitle>
          <ul className="grid gap-2 sm:grid-cols-2">
            {data!.dams.map((d) => (
              <li key={d.id} className="flex items-center gap-3 rounded-[16px] bg-card p-4">
                <b className="text-[26px] tabular-nums" style={{ color: damColor(d.storagePct) }}>
                  {Math.round(d.storagePct ?? 0)}%
                </b>
                <span>
                  <span className="block font-semibold">{lang === 'th' ? `เขื่อน${d.th}` : d.en}</span>
                  <span className="block text-sm text-muted">{m.home.damFlow(String(d.inflow ?? '–'), String(d.released ?? '–'))}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="grid gap-3 sm:grid-cols-2">
        <Tile href={p('map')} icon="map" hue="teal" title={m.province.sections.map} sub={m.province.sections.mapSub} />
        <Tile href={p('area')} icon="pin" hue="green" title={m.province.sections.area} sub={m.province.sections.areaSub} />
        <Tile href={p('weather')} icon="cloud" hue="blue" title={m.province.sections.weather} sub={m.province.sections.weatherSub} />
        <Tile href={p('updates')} icon="list" hue="orange" title={m.province.sections.updates} sub={m.province.sections.updatesSub} />
        <Tile href={p('cctv')} icon="camera" hue="indigo" title={m.province.sections.cctv} sub={m.province.sections.cctvSub} />
        <Tile href={p('lost-found')} icon="box" hue="pink" title={m.province.sections.lostFound} sub={m.province.sections.lostFoundSub} />
        <Tile href={p('missing')} icon="person" hue="purple" title={m.province.sections.missing} sub={m.province.sections.missingSub} />
        <Tile href={p('help')} icon="lifebuoy" hue="red" title={m.province.askHelp} sub={m.home.actions.helpSub} />
      </section>

      {worstAir && (
        <section className="flex items-center gap-4 rounded-[18px] bg-card p-4">
          <IconBadge icon="air" hue={aqiBand(worstAir.aqi) >= 3 ? 'orange' : 'green'} />
          <div>
            <p className="font-semibold">
              {m.province.air}: AQI {worstAir.aqi} · {m.air.bands[aqiBand(worstAir.aqi)]}
            </p>
            <p className="text-sm text-muted">
              {m.air.worst(lang === 'th' ? worstAir.th : worstAir.en)}
              {worstAir.pm25 !== null && ` · ${m.air.pm25(worstAir.pm25)}`} · Air4Thai
            </p>
          </div>
        </section>
      )}

      <ExternalLinks />
      <EmergencyNumbers social rid />
    </div>
  )
}

function RainBars({ hours }: { hours: [string, number, number][] }) {
  const locale = useLocale()
  const max = Math.max(2, ...hours.map((h) => h[1] ?? 0))
  return (
    <div className="mt-4">
      <div className="flex h-20 items-end gap-[3px]">
        {hours.map(([t, mm, chance]) => (
          <span
            key={t}
            title={`${clock(t, locale)} · ${mm} mm · ${chance}%`}
            className="flex-1 rounded-t-[3px]"
            style={{ height: `${Math.max(2, ((mm ?? 0) / max) * 100)}%`, background: (mm ?? 0) > 0 ? RAIN_CLASSES[Math.max(0, rainClass((mm ?? 0) * 6))].color : 'var(--hairline)', opacity: 0.4 + (chance ?? 0) / 170 }}
          />
        ))}
      </div>
      <div className="mt-1 flex justify-between text-xs text-faint">
        {[0, 6, 12, 18].map((i) => (
          <span key={i}>{hours[i] ? clock(hours[i][0], locale) : ''}</span>
        ))}
      </div>
    </div>
  )
}

function NearMe({ stations, reports, shelters, provinceCode }: { stations: Station[]; reports: ProvinceProps['reports'] & object; shelters: { name: string; lat: number; lng: number; status: string }[]; provinceCode: string }) {
  const { m, lang } = useI18n()
  const geo = useGeolocation()
  const [here, setHere] = useState<{ lat: number; lng: number } | null>(null)
  const [picking, setPicking] = useState(false)
  const tambons = useGeo(useMemo(() => (picking ? () => loadTambons(provinceCode) : null), [picking, provinceCode]))
  const [q, setQ] = useState('')
  const near = here
    ? {
        stations: stations.map((s) => ({ s, d: km(here, s) })).sort((a, b) => a.d - b.d).slice(0, 3),
        reports: reports.filter((r) => !isReceded(r) && km(here, r) <= NEAR_KM),
        shelter: shelters.filter((s) => s.status !== 'closed').map((s) => ({ s, d: km(here, s) })).sort((a, b) => a.d - b.d)[0],
      }
    : null
  const worst = near ? Math.max(-1, ...near.reports.map((r) => r.level)) : -1
  const matches = (tambons ?? []).filter((t: Tambon) => !q || t[1].includes(q) || t[2].toLowerCase().includes(q.toLowerCase())).slice(0, 30)

  return (
    <section className="flex flex-col gap-3 rounded-[22px] bg-card p-5">
      <SectionTitle icon="locate" hue="green">
        {m.province.nearTitle}
      </SectionTitle>
      <p className="text-muted">{m.province.nearIntro}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <button
          onClick={async () => {
            const p = await geo.locate()
            if (p) setHere({ lng: p[0], lat: p[1] })
          }}
          className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-go px-5 font-medium text-white hover:bg-go-hover"
        >
          <Icon name="locate" size={20} /> {m.common.nearMe}
        </button>
        <button onClick={() => setPicking(!picking)} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-line px-5 font-medium hover:border-go">
          <Icon name="pin" size={20} /> {m.common.chooseTambon}
        </button>
      </div>
      <GeoMessage state={geo.state} />
      {picking && (
        <div className="flex flex-col gap-2">
          <input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder={m.common.search} autoFocus />
          <ul className="max-h-60 overflow-y-auto rounded-[12px] border border-line">
            {matches.map((t) => (
              <li key={t[0]}>
                <button
                  className="flex min-h-11 w-full items-center px-3 text-left hover:bg-paper"
                  onClick={() => {
                    setHere({ lng: t[4], lat: t[5] })
                    setPicking(false)
                  }}
                >
                  {lang === 'th' ? `ต.${t[1]}` : t[2]}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-sm text-faint">{m.common.locationNote}</p>
      {near && (
        <div className="flex flex-col gap-3">
          <p className="flex items-center gap-2 text-lg font-semibold">
            {worst >= 0 && <span className="h-3 w-3 rounded-full" style={{ background: LEVEL_COLOR[worst] }} />}
            {near.reports.length ? m.province.nearbyReports(near.reports.length, NEAR_KM) : m.province.noNearbyReports(NEAR_KM)}
            {worst >= 0 && <span className="text-muted">· {m.levels.short[worst]}</span>}
          </p>
          <p className="font-semibold">{m.province.nearestStations}</p>
          <ul className="flex flex-col gap-2">
            {near.stations.map(({ s, d }) => (
              <StationRow key={s.code} s={s} distance={d} />
            ))}
          </ul>
          {near.shelter && (
            <p>
              <b>{m.province.nearestShelter}:</b> {near.shelter.s.name} · {m.common.km(near.shelter.d.toFixed(1))}
            </p>
          )}
        </div>
      )}
    </section>
  )
}

export function ExternalLinks() {
  const { m } = useI18n()
  const L = m.province.links
  const links: [string, string, string][] = [
    ['https://bigdata-swoc.rid.go.th/pier/all', L.ridBank, L.ridBankSub],
    ['https://telerid.rid.go.th/#/', L.ridTele, L.ridTeleSub],
    ['https://telemetry.dwr.go.th/home?layerMapType=BASIN', L.dwr, L.dwrSub],
    ['https://www.thaiwater.net/', L.thaiwater, L.thaiwaterSub],
    ['https://flood.gistda.or.th/', L.gistda, L.gistdaSub],
    ['https://www.tmd.go.th/', L.tmd, L.tmdSub],
    ['https://world.tehx.dyndns.info/flood#tab=map', L.tehx, L.tehxSub],
    ['https://cctv.maholan.net/', L.cctv, L.cctvSub],
    ['https://www.floodthai.org/provinces', L.floodthai, L.floodthaiSub],
  ]
  return (
    <section className="flex flex-col gap-3">
      <SectionTitle icon="external" hue="gray">
        {m.province.moreData}
      </SectionTitle>
      <ul className="grid gap-2 sm:grid-cols-2">
        {links.map(([url, title, sub]) => (
          <li key={url}>
            <a href={url} target="_blank" rel="noreferrer" className="flex min-h-14 items-center gap-3 rounded-[16px] bg-card p-3.5 hover:shadow-[0_4px_20px_rgb(0_0_0/0.08)]">
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{title}</span>
                <span className="block text-sm text-muted">{sub}</span>
              </span>
              <Icon name="external" size={18} className="text-faint" />
            </a>
          </li>
        ))}
      </ul>
      <p className="text-sm text-faint">{m.province.links.external}</p>
    </section>
  )
}
