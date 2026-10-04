import { useEffect, useRef, type ReactNode } from 'react'
import type { Province } from '../../data/provinces'
import { useI18n } from '../../i18n'
import { useApi, type ProvinceData, type Report } from '../../lib/api'
import { aqiBand } from '../../lib/conditions'
import { next24 } from '../../lib/forecast'
import { provinceHref } from '../../lib/router'
import { provinceName } from '../../lib/ui'
import { ALERT_COLOR, AQI_COLOR, STATUS_COLOR, stationStatus } from '../../lib/water'
import { AlertList } from '../alerts/Alerts'
import { EmergencyContacts } from '../contacts/EmergencyContacts'
import { Icon } from '../Icon'
import { ProvinceActions } from './ProvinceActions'
import { ProvinceMapView } from './ProvinceMap'

/**
 * A province at a glance, over the national map: its own map, what to do, today's state, alerts and who to
 * call. A panel on the right on wide screens, a sheet from the bottom on phones. `modal` puts it over the
 * whole page (for maps that are only part of a page).
 */
export function ProvinceSheet({ province, onClose, modal = false }: { province: Province; onClose: () => void; modal?: boolean }) {
  const { m, lang } = useI18n()
  const S = m.provinceSheet
  const data = useApi<ProvinceData>(`/province/${province.code}`)
  const reports = useApi<Report[]>(`/reports?province=${province.code}`, 60_000)
  const scroller = useRef<HTMLDivElement>(null)
  const d = data.data
  const level = Math.max(0, ...(d?.alerts ?? []).map((a) => a.level))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  // A new province starts at the top.
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 })
  }, [province.code])

  const stations = d?.stations ?? []
  const over = stations.filter((s) => stationStatus(s) === 'over').length
  const high = stations.filter((s) => stationStatus(s) === 'high').length
  const rain = d?.forecast ? next24(d.forecast) : null
  const air = [...(d?.air ?? [])].sort((a, b) => b.aqi - a.aqi)[0]
  const fires = d?.hotspots.length ?? 0
  const quake = [...(d?.quakes ?? [])].sort((a, b) => (b.mag ?? 0) - (a.mag ?? 0))[0]
  const sat = Math.round((d?.satFloodCells ?? 0) * 0.056)
  const T = m.tiles

  const panel = (
    <section
      role="dialog"
      aria-label={provinceName(province, lang)}
      className={`jd-sheet glass pointer-events-auto flex w-full flex-col overflow-hidden rounded-t-[26px] shadow-[0_-10px_40px_rgb(0_0_0/0.2)] ring-1 ring-black/5 md:rounded-[26px] md:shadow-[0_20px_60px_rgb(0_0_0/0.25)] ${
        modal ? 'max-h-[90dvh] md:max-h-[86dvh] md:w-[560px]' : 'max-h-[86%] md:m-3 md:max-h-[calc(100%-1.5rem)] md:w-[500px]'
      }`}
    >
      <header className="flex items-start gap-3 px-5 pb-3 pt-4">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold tracking-wide text-muted">{m.regions[province.region]}</p>
          <h2 className="truncate text-[28px] font-bold leading-tight">{provinceName(province, lang)}</h2>
          {d && (
            <span className="mt-1 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[13px] font-bold" style={{ background: `${ALERT_COLOR[level]}24`, color: level === 1 ? '#8a6d00' : ALERT_COLOR[level] }}>
              <span className="h-2 w-2 rounded-full" style={{ background: ALERT_COLOR[level] }} />
              {m.province.overall}: {m.hazard.levels[level]}
            </span>
          )}
        </div>
        <a href={provinceHref(province)} className="press inline-flex min-h-9 shrink-0 items-center gap-1 rounded-full bg-go-soft px-3.5 text-[14px] font-semibold text-go">
          {S.open} <Icon name="forward" size={16} />
        </a>
        <button onClick={onClose} aria-label={m.assistant.close} className="press grid h-9 w-9 shrink-0 place-items-center rounded-full bg-paper text-muted">
          <Icon name="close" size={18} />
        </button>
      </header>

      <div ref={scroller} className="flex flex-col gap-5 overflow-y-auto overscroll-contain px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
        <ProvinceActions province={province} onCall={() => document.getElementById(`contacts-${province.code}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })} />

        <ProvinceMapView province={province} data={d} reports={reports.data} reloadReports={reports.reload} className="h-72 md:h-80" />

        <div className="flex flex-col gap-2">
          <h3 className="text-[17px] font-bold">{S.now}</h3>
          {!d ? (
            <div className="flex flex-col gap-1.5">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="skeleton h-11" />
              ))}
            </div>
          ) : (
            <ul className="overflow-hidden rounded-[18px] bg-card">
              <Row color={over ? STATUS_COLOR.over : high ? STATUS_COLOR.high : STATUS_COLOR.normal} label={T.rivers}>
                {over ? T.riversOver(over) : high ? T.riversHigh(high) : stations.length ? T.riversOk(stations.length) : T.noData}
              </Row>
              <Row color={rain && rain.total >= 35 ? '#ff9500' : '#0a84ff'} label={T.rain}>
                {rain ? T.rainNext(rain.total.toFixed(0)) : T.noData}
              </Row>
              <Row color={air ? AQI_COLOR[aqiBand(air.aqi)] : '#8e8e93'} label={T.air}>
                {air ? `AQI ${air.aqi} · ${m.air.bands[aqiBand(air.aqi)]}` : T.noData}
              </Row>
              <Row color={fires >= 40 ? '#ff3b30' : fires >= 10 ? '#ff9500' : fires ? '#ffcc00' : '#34c759'} label={T.fire}>
                {T.fireCount(fires)}
              </Row>
              <Row color={quake ? '#af52de' : '#34c759'} label={T.quake}>
                {quake?.mag ? `M${quake.mag} · ${m.common.km(String(quake.distance ?? 0))}` : T.quakeNone}
              </Row>
              <Row color={sat ? '#64d2ff' : '#34c759'} label={T.satFlood}>
                {sat ? T.satFloodValue(sat) : T.satFloodNone}
              </Row>
            </ul>
          )}
        </div>

        {d && d.alerts.length > 0 && (
          <div className="flex flex-col gap-2">
            <h3 className="text-[17px] font-bold">{m.alerts.title}</h3>
            <AlertList alerts={d.alerts.slice(0, 3)} showProvinces={false} />
          </div>
        )}

        <div id={`contacts-${province.code}`} className="scroll-mt-4">
          <EmergencyContacts province={province} compact />
        </div>
      </div>
    </section>
  )

  if (modal) {
    return (
      <div className="fixed inset-0 z-[1150] flex items-end justify-center md:items-center">
        <div className="fade-in absolute inset-0 bg-black/40" onClick={onClose} />
        {panel}
      </div>
    )
  }
  return <div className="pointer-events-none absolute inset-0 z-20 flex items-end md:items-stretch md:justify-end">{panel}</div>
}

function Row({ color, label, children }: { color: string; label: string; children: ReactNode }) {
  return (
    <li className="flex min-h-11 items-center gap-3 border-b border-line/60 px-4 py-2 last:border-0">
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
      <span className="w-24 shrink-0 text-[14px] text-muted">{label}</span>
      <span className="min-w-0 flex-1 text-[15px] font-semibold">{children}</span>
    </li>
  )
}
