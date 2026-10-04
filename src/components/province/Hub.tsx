import { useMemo, useState, type CSSProperties } from 'react'
import { useI18n } from '../../i18n'
import type { Station } from '../../lib/api'
import { aqiBand } from '../../lib/conditions'
import { next24 } from '../../lib/forecast'
import { loadTambons, useGeo, type Tambon } from '../../lib/geo'
import type { IconName } from '../../lib/icons'
import { href, provinceHref } from '../../lib/router'
import { clock } from '../../lib/time'
import { useGeolocation, useLocale } from '../../lib/ui'
import { ALERT_COLOR, AQI_COLOR, LEVEL_COLOR, RAIN_CLASSES, STATUS_COLOR, STATUS_ORDER, damColor, isReceded, km, quakeColor, rainClass, stationStatus } from '../../lib/water'
import { AlertList, AlertSubscribe } from '../alerts/Alerts'
import { Icon } from '../Icon'
import { Disclosure, EmergencyNumbers, GeoMessage, ListRow, Loading, SectionTitle, StationRow, inputCls } from '../kit'
import { ProvinceHeader, type ProvinceProps } from './ProvincePage'

const NEAR_KM = 3

/**
 * A province's overview: today's alerts, one card per hazard, what to do, then the detail. Each hazard card
 * leads to the tab where it lives.
 */
export function Hub({ province, data, dataError, reports }: ProvinceProps) {
  const { m, lang } = useI18n()
  const locale = useLocale()
  const center = data?.commandCenter
  const stations = useMemo(
    () => [...(data?.stations ?? [])].sort((a, b) => STATUS_ORDER.indexOf(stationStatus(a)) - STATUS_ORDER.indexOf(stationStatus(b)) || (b.pct ?? 0) - (a.pct ?? 0)),
    [data],
  )
  const [showAll, setShowAll] = useState(false)
  const p = (s: Parameters<typeof provinceHref>[1]) => provinceHref(province, s)

  // Card values.
  const over = stations.filter((s) => stationStatus(s) === 'over').length
  const high = stations.filter((s) => stationStatus(s) === 'high').length
  const rain24 = data?.forecast ? next24(data.forecast) : null
  const wettest = Math.max(0, ...(data?.rain ?? []).map((r) => r[2] ?? 0))
  const worstAir = [...(data?.air ?? [])].sort((a, b) => b.aqi - a.aqi)[0]
  const tomorrowPm = data?.airForecast?.[1]?.mean
  const fires = data?.hotspots ?? []
  const quake = [...(data?.quakes ?? [])].sort((a, b) => (b.mag ?? 0) / Math.max(1, (b.distance ?? 1) / 100) - (a.mag ?? 0) / Math.max(1, (a.distance ?? 1) / 100))[0]
  const satKm2 = Math.round((data?.satFloodCells ?? 0) * 0.056)
  const alertLevel = (h: string) => Math.max(0, ...(data?.alerts ?? []).filter((a) => a.hazard === h).map((a) => a.level))

  return (
    <div className="mx-auto w-full flex max-w-5xl flex-col gap-7 px-4 py-5 md:px-6">
      <ProvinceHeader province={province} section={null} />

      {data && data.alerts.length > 0 && <AlertList alerts={data.alerts} showProvinces={false} />}

      {!data ? (
        <Loading error={dataError} />
      ) : (
        <section className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <HazardCard
            href={p('map')}
            i={1}
            icon="flood"
            color={over ? STATUS_COLOR.over : high ? STATUS_COLOR.high : STATUS_COLOR.normal}
            level={alertLevel('flood')}
            title={m.tiles.rivers}
            value={over ? m.tiles.riversOver(over) : high ? m.tiles.riversHigh(high) : m.tiles.riversOk(stations.length)}
            sub={stations[0] ? `${stations[0].name}${stations[0].over !== null ? ` · ${stations[0].over > 0 ? '+' : ''}${stations[0].over.toFixed(2)} ${m.common.m}` : ''}` : m.tiles.noData}
          />
          <HazardCard
            href={p('weather')}
            i={2}
            icon="cloud"
            color={RAIN_CLASSES[Math.max(0, rainClass(rain24?.total ?? 0))].color}
            level={Math.max(alertLevel('rain'), alertLevel('landslide'))}
            title={m.tiles.rain}
            value={rain24 ? (rainClass(rain24.total) < 0 ? m.rain.none : m.rain.classes[rainClass(rain24.total)]) : m.tiles.noData}
            sub={`${rain24 ? m.tiles.rainNext(rain24.total.toFixed(0)) : ''}${wettest ? ` · ${m.tiles.rainPast(wettest)}` : ''}`}
          />
          <HazardCard
            href={p('weather')}
            i={3}
            icon="air"
            color={worstAir ? AQI_COLOR[aqiBand(worstAir.aqi)] : '#8e8e93'}
            level={alertLevel('air')}
            title={m.tiles.air}
            value={worstAir ? `AQI ${worstAir.aqi}` : m.tiles.noData}
            sub={`${worstAir ? m.air.bands[aqiBand(worstAir.aqi)] : ''}${tomorrowPm !== undefined ? ` · ${m.tiles.airTomorrow(tomorrowPm)}` : ''}`}
          />
          <HazardCard
            href={p('map')}
            i={4}
            icon="fire"
            color={fires.length >= 40 ? '#ff3b30' : fires.length >= 10 ? '#ff9500' : fires.length ? '#ffcc00' : '#34c759'}
            level={alertLevel('fire')}
            title={m.tiles.fire}
            value={m.tiles.fireCount(fires.length)}
            sub={m.tiles.fireSub}
          />
          <HazardCard
            href={p('map')}
            i={5}
            icon="quake"
            color={quake ? quakeColor(quake.at) : '#34c759'}
            level={Math.max(alertLevel('quake'), alertLevel('tsunami'))}
            title={m.tiles.quake}
            value={quake?.mag ? `M${quake.mag}` : m.tiles.quakeNone}
            sub={quake ? m.tiles.quakeSub(quake.distance ?? 0, clock(quake.at, locale)) : ''}
          />
          <HazardCard
            href={p('map')}
            i={6}
            icon="wave"
            color={satKm2 ? '#0a84ff' : '#34c759'}
            level={0}
            title={m.tiles.satFlood}
            value={satKm2 ? m.tiles.satFloodValue(satKm2) : m.tiles.satFloodNone}
            sub={m.tiles.satFloodSub}
          />
        </section>
      )}

      <section className="grid gap-3 md:grid-cols-2">
        {center?.active ? (
          <div className="rise flex flex-col gap-3 rounded-[22px] bg-[#34c759]/12 p-5">
            <p className="flex items-center gap-2 text-lg font-bold text-[#248a3d]">
              <Icon name="lifebuoy" />
              {center.name ? m.province.centerOpen(center.name) : m.province.centerOpenDefault}
            </p>
            {center.hotline && (
              <a href={`tel:${center.hotline}`} className="font-semibold text-link">
                {m.province.centerHotline(center.hotline)}
              </a>
            )}
            <div className="flex flex-wrap gap-2">
              <a href={p('help')} className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full bg-urgent px-5 font-semibold text-white">
                <Icon name="lifebuoy" size={20} /> {m.province.askHelp}
              </a>
              <a href={p('missing')} className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full bg-card px-5 font-semibold">
                <Icon name="person" size={20} /> {m.province.findPerson}
              </a>
            </div>
          </div>
        ) : (
          <div className="rise flex flex-col gap-2 rounded-[22px] bg-card p-5">
            <p className="text-lg font-bold">{m.province.centerClosed}</p>
            <p className="text-muted">{m.province.centerClosedSub}</p>
            <div className="mt-1 flex flex-wrap gap-2">
              {['1784', '1669', '191'].map((n) => (
                <a key={n} href={`tel:${n}`} className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-urgent px-4 font-bold text-white">
                  <Icon name="phone" size={16} /> {n}
                </a>
              ))}
            </div>
            <a href={p('open')} className="mt-1 text-[15px] font-semibold text-link">
              {m.province.agencies}
            </a>
          </div>
        )}
        <a href={p('report')} className="rise press lift group flex flex-col justify-between gap-3 rounded-[22px] bg-gradient-to-br from-[#30b0c7] to-[#0a84ff] p-5 text-white" style={{ '--i': 1 } as CSSProperties}>
          <span className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-[13px] bg-white/20">
              <Icon name="camera" size={24} />
            </span>
            <b className="text-xl">{m.province.report}</b>
          </span>
          <span className="text-white/90">{m.province.reportSub}</span>
          <span className="inline-flex items-center gap-1 font-semibold">
            {m.province.sections.updates} <Icon name="forward" size={18} className="transition-transform group-hover:translate-x-1" />
          </span>
        </a>
      </section>

      <NearMe stations={data?.stations ?? []} reports={reports ?? []} shelters={data?.shelters ?? []} provinceCode={province.code} />

      <section className="flex flex-col gap-3">
        <SectionTitle icon="flood" hue="blue" action={<a href={p('map')} className="text-[15px] font-semibold text-link">{m.common.seeMap}</a>}>
          {m.province.rivers}
        </SectionTitle>
        {!data ? (
          <Loading error={dataError} />
        ) : stations.length ? (
          <>
            <ul className="flex flex-col gap-2">
              {(showAll ? stations : stations.slice(0, 5)).map((s) => (
                <StationRow key={s.code} s={s} />
              ))}
            </ul>
            {stations.length > 5 && !showAll && (
              <button onClick={() => setShowAll(true)} className="self-start font-semibold text-link">
                {m.common.seeAll} ({stations.length})
              </button>
            )}
          </>
        ) : (
          <p className="rounded-[16px] bg-card p-5 text-muted">{m.province.riversNone}</p>
        )}
        {(data?.dams.length ?? 0) > 0 && (
          <ul className="grid gap-2 sm:grid-cols-2">
            {data!.dams.map((d) => (
              <li key={d.id} className="flex items-center gap-3 rounded-[16px] bg-card p-4">
                <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-[10px] bg-paper">
                  <div className="absolute inset-x-0 bottom-0" style={{ height: `${Math.min(100, d.storagePct ?? 0)}%`, background: damColor(d.storagePct) }} />
                </div>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{lang === 'th' ? `เขื่อน${d.th}` : d.en}</span>
                  <span className="block text-sm text-muted">{m.home.damFlow(String(d.inflow ?? '–'), String(d.released ?? '–'))}</span>
                </span>
                <b className="text-lg tabular-nums" style={{ color: damColor(d.storagePct) }}>
                  {Math.round(d.storagePct ?? 0)}%
                </b>
              </li>
            ))}
          </ul>
        )}
        <p className="text-sm text-faint">{m.common.source('RID SWOC · Thaiwater (HII)')}</p>
      </section>

      <section className="flex flex-col gap-3">
        <SectionTitle icon="list" hue="gray">
          {m.titles.more}
        </SectionTitle>
        <ul className="overflow-hidden rounded-[20px] bg-card">
          <ListRow href={p('area')} icon="pin" hue="green" title={m.province.sections.area} sub={m.province.sections.areaSub} />
          <ListRow href={p('cctv')} icon="camera" hue="indigo" title={m.province.sections.cctv} sub={m.province.sections.cctvSub} />
          <ListRow href={p('lost-found')} icon="box" hue="pink" title={m.province.sections.lostFound} sub={m.province.sections.lostFoundSub} />
          <ListRow href={p('missing')} icon="person" hue="purple" title={m.province.sections.missing} sub={m.province.sections.missingSub} />
          <ListRow href={href({ name: 'guide', topic: null })} icon="book" hue="orange" title={m.home.actions.guide} sub={m.home.actions.guideSub} />
        </ul>
        <Disclosure icon="bell" hue="red" title={m.subscribe.title} sub={m.subscribe.intro}>
          <AlertSubscribe province={province.code} bare />
        </Disclosure>
        <Disclosure icon="external" hue="gray" title={m.province.moreData} sub={m.province.links.external}>
          <ExternalLinks bare />
        </Disclosure>
      </section>

      <EmergencyNumbers social rid />
    </div>
  )
}

function HazardCard({ href, icon, color, level, title, value, sub, i = 0 }: { href: string; icon: IconName; color: string; level: number; title: string; value: string; sub: string; i?: number }) {
  return (
    <a href={href} className="rise press lift relative flex min-h-36 flex-col gap-1.5 overflow-hidden rounded-[20px] bg-card p-4" style={{ '--i': i } as CSSProperties}>
      <span className="absolute inset-x-0 top-0 h-1" style={{ background: color }} />
      <span className="flex items-center gap-2 text-[15px] font-semibold text-muted">
        <span className="flex h-7 w-7 items-center justify-center rounded-[8px] text-white" style={{ background: color }}>
          <Icon name={icon} size={16} />
        </span>
        {title}
        {level > 0 && <span className="ml-auto h-2.5 w-2.5 rounded-full" style={{ background: ALERT_COLOR[level] }} />}
      </span>
      <b className="text-[22px] font-bold leading-tight md:text-[26px]">{value}</b>
      <span className="line-clamp-2 text-sm leading-snug text-muted">{sub}</span>
    </a>
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

export function ExternalLinks({ bare = false }: { bare?: boolean }) {
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
  ]
  return (
    <section className="flex flex-col gap-3">
      {!bare && (
        <SectionTitle icon="external" hue="gray">
          {m.province.moreData}
        </SectionTitle>
      )}
      <ul className="grid gap-2 sm:grid-cols-2">
        {links.map(([url, title, sub]) => (
          <li key={url}>
            <a href={url} target="_blank" rel="noreferrer" className={`press flex min-h-14 items-center gap-3 rounded-[16px] p-3.5 ${bare ? 'bg-paper/70 hover:bg-paper' : 'bg-card'}`}>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{title}</span>
                <span className="block text-sm text-muted">{sub}</span>
              </span>
              <Icon name="external" size={18} className="text-faint" />
            </a>
          </li>
        ))}
      </ul>
      {!bare && <p className="text-sm text-faint">{m.province.links.external}</p>}
    </section>
  )
}
