import { useMemo, useState, type CSSProperties } from 'react'
import { useI18n } from '../../i18n'
import type { Station } from '../../lib/api'
import { openAssistant } from '../../lib/assistant'
import { aqiBand } from '../../lib/conditions'
import { next24 } from '../../lib/forecast'
import { loadTambons, useGeo, type Tambon } from '../../lib/geo'
import { href, provinceHref } from '../../lib/router'
import { clock } from '../../lib/time'
import { provinceName, useGeolocation, useLocale } from '../../lib/ui'
import { LEVEL_COLOR, STATUS_COLOR, STATUS_ORDER, damColor, isReceded, km, quakeColor, stationStatus } from '../../lib/water'
import { AlertList, AlertSubscribe } from '../alerts/Alerts'
import { Orb } from '../assistant/Orb'
import { Icon } from '../Icon'
import { Disclosure, GeoMessage, ListRow, Loading, SectionTitle, StationRow, inputCls } from '../kit'
import { ProvinceActions } from './ProvinceActions'
import { ProvinceHeader, type ProvinceProps } from './ProvincePage'
import { AqiArc, RainBars, StatusStrip, Widget } from './Widgets'

const NEAR_KM = 3

/**
 * A province's overview. First the day in one sentence and what you can do; then each hazard as a small
 * picture of its numbers; what people on the ground photographed; around you; the rivers; and the rest.
 */
export function Hub({ province, data, dataError, reports }: ProvinceProps) {
  const { m, lang } = useI18n()
  const P = m.province
  const T = m.tiles
  const locale = useLocale()
  const center = data?.commandCenter
  const stations = useMemo(
    () => [...(data?.stations ?? [])].sort((a, b) => STATUS_ORDER.indexOf(stationStatus(a)) - STATUS_ORDER.indexOf(stationStatus(b)) || (b.pct ?? 0) - (a.pct ?? 0)),
    [data],
  )
  const [showAll, setShowAll] = useState(false)
  const p = (s: Parameters<typeof provinceHref>[1]) => provinceHref(province, s)

  const statuses = stations.map(stationStatus)
  const over = statuses.filter((s) => s === 'over').length
  const high = statuses.filter((s) => s === 'high').length
  const rain24 = data?.forecast ? next24(data.forecast) : null
  const wettest = Math.max(0, ...(data?.rain ?? []).map((r) => r[2] ?? 0))
  const worstAir = [...(data?.air ?? [])].sort((a, b) => b.aqi - a.aqi)[0]
  const tomorrowPm = data?.airForecast?.[1]?.mean
  const fires = data?.hotspots ?? []
  const forestFires = fires.filter((h) => /forest|ป่า/i.test(String(h[3] ?? ''))).length
  const quake = [...(data?.quakes ?? [])].sort((a, b) => (b.mag ?? 0) / Math.max(1, (b.distance ?? 1) / 100) - (a.mag ?? 0) / Math.max(1, (a.distance ?? 1) / 100))[0]
  const satKm2 = Math.round((data?.satFloodCells ?? 0) * 0.056)
  const alertLevel = (h: string) => Math.max(0, ...(data?.alerts ?? []).filter((a) => a.hazard === h).map((a) => a.level))
  const photos = (reports ?? []).filter((r) => r.photo && !isReceded(r)).slice(0, 12)

  // The day in one sentence, from what matters most down.
  const S = P.say
  const sentence = data
    ? [
        over ? S.riversOver(over) : high ? S.riversHigh(high) : stations.length ? S.riversOk : null,
        rain24 ? (rain24.total >= 0.5 ? S.rain(Math.round(rain24.total)) : S.noRain) : null,
        worstAir ? S.air(m.air.bands[aqiBand(worstAir.aqi)], worstAir.aqi) : null,
        fires.length >= 10 ? S.fires(fires.length) : null,
        quake?.mag && quake.mag >= 4 && (quake.distance ?? 9999) <= 400 ? S.quake(quake.mag, quake.distance ?? 0) : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : null

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-7 px-4 py-5 md:px-6">
      <ProvinceHeader province={province} section={null} />

      <section className="rise flex flex-col gap-4 rounded-[26px] bg-card p-5 md:flex-row md:items-center md:gap-6">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-bold uppercase tracking-wide text-muted">{P.today}</p>
          {sentence ? <p className="mt-1 text-[21px] font-semibold leading-snug md:text-[24px]">{sentence}</p> : <div className="skeleton mt-2 h-14" />}
          <p className="mt-2 text-[14px] text-muted">
            {center?.active ? (
              <span className="font-semibold text-[#1f7a35] dark:text-[#30d158]">
                {center.name ? P.centerOpen(center.name) : P.centerOpenDefault}
                {center.hotline && ` · ${center.hotline}`}
              </span>
            ) : (
              P.centerClosedShort
            )}
          </p>
          <button
            onClick={() => openAssistant({ text: m.assistant.suggestions.province(provinceName(province, lang)), lang })}
            className="press mt-3 inline-flex min-h-9 items-center gap-2 rounded-full bg-paper pl-1 pr-3.5 text-[14px] font-semibold"
          >
            <Orb size={26} /> {m.assistant.askAbout(provinceName(province, lang))}
          </button>
        </div>
        <ProvinceActions province={province} />
      </section>

      {data && data.alerts.length > 0 && <AlertList alerts={data.alerts} showProvinces={false} />}

      {!data ? (
        <Loading error={dataError} />
      ) : (
        <section className="grid grid-cols-2 gap-3 md:grid-cols-3">
          <Widget
            href={p('map')}
            i={1}
            icon="flood"
            color={over ? STATUS_COLOR.over : high ? STATUS_COLOR.high : STATUS_COLOR.normal}
            level={alertLevel('flood')}
            title={T.rivers}
            footer={stations[0] ? `${stations[0].name}${stations[0].over !== null ? ` · ${stations[0].over > 0 ? '+' : ''}${stations[0].over.toFixed(2)} ${m.common.m}` : ''}` : T.noData}
          >
            <b className="text-[22px] font-bold leading-tight">{over ? T.riversOver(over) : high ? T.riversHigh(high) : T.riversOk(stations.length)}</b>
            <span className="mt-2">
              <StatusStrip statuses={statuses} />
            </span>
          </Widget>
          <Widget
            href={p('weather')}
            i={2}
            icon="cloud"
            color="#0a84ff"
            level={Math.max(alertLevel('rain'), alertLevel('landslide'))}
            title={T.rain}
            footer={`${rain24 ? T.rainNext(rain24.total.toFixed(0)) : ''}${wettest ? ` · ${T.rainPast(wettest)}` : ''}`}
          >
            <b className="text-[22px] font-bold leading-tight">{rain24 ? `${rain24.total.toFixed(0)} ${m.common.mm('').trim()}` : '–'}</b>
            {rain24 && (
              <span className="mt-1.5">
                <RainBars hours={rain24.hours.map((h) => h[1])} />
              </span>
            )}
          </Widget>
          <Widget
            href={p('weather')}
            i={3}
            icon="air"
            color={worstAir ? '#ff9500' : '#8e8e93'}
            level={alertLevel('air')}
            title={T.air}
            footer={`${worstAir ? m.air.bands[aqiBand(worstAir.aqi)] : T.noData}${tomorrowPm !== undefined ? ` · ${T.airTomorrow(tomorrowPm)}` : ''}`}
          >
            {worstAir ? <AqiArc aqi={worstAir.aqi} band={aqiBand(worstAir.aqi)} /> : <b className="text-[22px]">–</b>}
          </Widget>
          <Widget
            href={p('map')}
            i={4}
            icon="fire"
            color={fires.length >= 40 ? '#ff3b30' : fires.length >= 10 ? '#ff9500' : '#8e8e93'}
            level={alertLevel('fire')}
            title={T.fire}
            footer={forestFires ? T.fireForest(forestFires) : T.fireSub}
          >
            <b className="text-[30px] font-bold leading-none tabular-nums">{fires.length}</b>
            <span className="mt-2 flex flex-wrap gap-[3px]" aria-hidden="true">
              {Array.from({ length: Math.min(fires.length, 24) }, (_, k) => (
                <span key={k} className="h-1.5 w-1.5 rounded-full bg-[#ff6b35]" />
              ))}
            </span>
          </Widget>
          <Widget
            href={p('map')}
            i={5}
            icon="quake"
            color={quake ? quakeColor(quake.at) : '#8e8e93'}
            level={Math.max(alertLevel('quake'), alertLevel('tsunami'))}
            title={T.quake}
            footer={quake ? T.quakeSub(quake.distance ?? 0, clock(quake.at, locale)) : ''}
          >
            <b className="text-[30px] font-bold leading-none tabular-nums">{quake?.mag ? `M${quake.mag}` : '–'}</b>
            {!quake && <span className="mt-1 text-[14px] text-muted">{T.quakeNone}</span>}
          </Widget>
          <Widget href={p('map')} i={6} icon="wave" color={satKm2 ? '#0a84ff' : '#8e8e93'} title={T.satFlood} footer={T.satFloodSub}>
            <b className="text-[22px] font-bold leading-tight">{satKm2 ? T.satFloodValue(satKm2) : T.satFloodNone}</b>
          </Widget>
        </section>
      )}

      {photos.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionTitle icon="camera" hue="indigo" action={<a href={p('updates')} className="text-[15px] font-semibold text-link">{P.photosAll}</a>}>
            {P.photos}
          </SectionTitle>
          <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 md:mx-0 md:px-0">
            {photos.map((r, k) => (
              <a key={r.id} href={p('updates')} className="press rise relative block h-40 w-40 shrink-0 overflow-hidden rounded-[18px] bg-paper" style={{ '--i': k } as CSSProperties}>
                <img src={r.photo!} alt="" loading="lazy" className="h-full w-full object-cover" />
                <span className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-gradient-to-t from-black/70 to-transparent p-2 pt-6 text-[13px] font-semibold text-white">
                  <span className="h-2.5 w-2.5 rounded-full ring-2 ring-white/70" style={{ background: LEVEL_COLOR[r.level] }} />
                  {m.levels.short[r.level]}
                </span>
              </a>
            ))}
          </div>
        </section>
      )}

      <NearMe stations={data?.stations ?? []} reports={reports ?? []} shelters={data?.shelters ?? []} provinceCode={province.code} />

      <section className="flex flex-col gap-3">
        <SectionTitle icon="flood" hue="blue" action={<a href={p('map')} className="text-[15px] font-semibold text-link">{m.common.seeMap}</a>}>
          {P.rivers}
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
          <p className="rounded-[16px] bg-card p-5 text-muted">{P.riversNone}</p>
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
          <ListRow href={p('contacts')} icon="phone" hue="red" title={m.contacts.titleIn(provinceName(province, lang))} sub={m.contacts.openSub} />
          <ListRow href={p('area')} icon="pin" hue="green" title={P.sections.area} sub={P.sections.areaSub} />
          <ListRow href={p('cctv')} icon="camera" hue="indigo" title={P.sections.cctv} sub={P.sections.cctvSub} />
          <ListRow href={p('lost-found')} icon="box" hue="pink" title={P.sections.lostFound} sub={P.sections.lostFoundSub} />
          <ListRow href={p('missing')} icon="person" hue="purple" title={P.sections.missing} sub={P.sections.missingSub} />
          <ListRow href={href({ name: 'guide', topic: null })} icon="book" hue="orange" title={m.home.actions.guide} sub={m.home.actions.guideSub} />
        </ul>
        <Disclosure icon="bell" hue="red" title={m.subscribe.title} sub={m.subscribe.intro}>
          <AlertSubscribe province={province.code} bare />
        </Disclosure>
        <Disclosure icon="external" hue="gray" title={P.moreData} sub={P.links.external}>
          <ExternalLinks bare />
        </Disclosure>
      </section>
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
