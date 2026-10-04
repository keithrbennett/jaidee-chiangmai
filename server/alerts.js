// The warning engine: turns the live feeds into alerts per province, at three levels (1 watch, 2 warning,
// 3 danger). These are our own rules on public data, written out here and on the data-sources page; official
// warnings come from TMD, DDPM, NDWC and RID, and every alert links back to them.
import { PROVINCES } from './lib/geo.js'
import { feeds } from './feeds.js'
import { hazards } from './hazards.js'

const byCode = new Map(PROVINCES.map((p) => [p.code, p]))
const km = (a, b) => {
  const k = Math.cos(((a[1] + b[1]) / 2) * (Math.PI / 180))
  return Math.hypot((a[0] - b[0]) * k, a[1] - b[1]) * 111.2
}

/** Andaman coast and Gulf of Thailand coast, for tsunami alerts. */
const ANDAMAN = ['85', '82', '83', '81', '92', '91']
const GULF = ['23', '22', '21', '20', '24', '11', '10', '74', '75', '76', '77', '86', '84', '80', '93', '90', '94', '96']

/** How far a quake of magnitude M may be felt, roughly (km): our threshold for telling a province. */
const feltRadius = (m) => (m < 4.5 ? 100 : m < 5.5 ? 300 : m < 6.5 ? 600 : 1000)

/**
 * @returns {Promise<{ id: string, hazard: string, level: 1|2|3, provinces: string[], data: object, at: string, source: string, url?: string }[]>}
 */
export async function computeAlerts() {
  const [stations, rain, forecast, air, hotspots, satFlood, quakes, airForecast] = await Promise.all([
    feeds.stations.get(),
    feeds.rain.get(),
    feeds.forecast.get(),
    feeds.air.get(),
    hazards.hotspots.get(),
    hazards.satFlood.get(),
    hazards.quakes.get(),
    hazards.airForecast.get(),
  ])
  const alerts = []
  const now = Date.now()
  const today = new Date(now + 7 * 3600_000).toISOString().slice(0, 10) // Bangkok date: ids change daily
  const push = (a) => alerts.push({ ...a, id: a.id ?? `${a.hazard}-${a.kind ?? ''}-${a.provinces[0]}-${today}` })

  for (const p of PROVINCES) {
    const code = p.code
    // Rivers: any gauge over its lowest bank.
    const st = (stations ?? []).filter((s) => s.province === code)
    const over = st.filter((s) => (s.over ?? -1) > 0).sort((a, b) => b.over - a.over)
    if (over.length) {
      push({ hazard: 'flood', kind: 'river', level: over[0].over >= 0.5 || over.length >= 3 ? 3 : 2, provinces: [code], data: { count: over.length, maxOver: over[0].over, station: over[0].name, river: over[0].river }, at: over[0].observedAt, source: 'RID / HII' })
    } else {
      const high = st.filter((s) => (s.pct ?? 0) >= 90)
      if (high.length) push({ hazard: 'flood', kind: 'river', level: 1, provinces: [code], data: { count: high.length, station: high[0].name, river: high[0].river }, at: high[0].observedAt, source: 'RID / HII' })
    }
    // Flooded land seen by satellite in the last 7 days.
    const cells = satFlood?.[code] ?? 0
    if (cells >= 50) push({ hazard: 'flood', kind: 'satellite', level: cells >= 1000 ? 2 : 1, provinces: [code], data: { cells, km2: Math.round(cells * 0.056) }, at: new Date(now).toISOString(), source: 'GISTDA' })

    // Rain measured in the last 24 h, and forecast for the next 24 h.
    const r = (rain ?? []).filter((x) => x[4] === code).sort((a, b) => (b[2] ?? 0) - (a[2] ?? 0))[0]
    const measured = r?.[2] ?? 0
    const next = (forecast?.[code]?.hourly ?? []).filter((h) => new Date(h[0]).getTime() >= now - 3600_000).slice(0, 24).reduce((s, h) => s + (h[1] ?? 0), 0)
    if (measured >= 90.1 || next >= 35.1) {
      push({ hazard: 'rain', level: measured >= 90.1 || next >= 90.1 ? 2 : 1, provinces: [code], data: { measured, place: r?.[5] ?? null, next: Math.round(next) }, at: r?.[7] ?? new Date(now).toISOString(), source: measured >= 90.1 ? 'Thaiwater' : 'Open-Meteo' })
    }
    // Landslides and flash floods follow very heavy rain on slopes: 100 mm in 24 h is the usual trigger.
    if (measured >= 100 || next >= 100) {
      push({ hazard: 'landslide', level: measured >= 100 ? 2 : 1, provinces: [code], data: { measured, place: r?.[5] ?? null, next: Math.round(next) }, at: r?.[7] ?? new Date(now).toISOString(), source: 'Thaiwater / Open-Meteo' })
    }

    // Air: worst station now (Thai AQI), and tomorrow's PM2.5 forecast.
    const worst = (air ?? []).filter((a) => a.province === code).sort((a, b) => b.aqi - a.aqi)[0]
    const tomorrow = airForecast?.[code]?.[1]
    if ((worst && worst.aqi > 100) || (tomorrow && tomorrow.mean >= 37.6)) {
      const aqi = worst?.aqi ?? 0
      push({ hazard: 'air', level: aqi > 200 ? 3 : aqi > 100 ? 2 : 1, provinces: [code], data: { aqi, pm25: worst?.pm25 ?? null, station: worst?.th ?? null, forecastPm25: tomorrow?.mean ?? null }, at: worst?.observedAt ?? new Date(now).toISOString(), source: 'Air4Thai / CAMS' })
    }

    // Fires: satellite hotspots in the province in the last 24 h.
    const fires = (hotspots ?? []).filter((h) => h.province === code)
    if (fires.length >= 10) push({ hazard: 'fire', level: fires.length >= 40 ? 2 : 1, provinces: [code], data: { count: fires.length, forest: fires.filter((f) => /ป่า/.test(f.landuse ?? '')).length }, at: new Date(now).toISOString(), source: 'GISTDA (VIIRS)' })
  }

  // Earthquakes in the last 24 h that may be felt in a province.
  for (const q of quakes ?? []) {
    if (now - new Date(q.at).getTime() > 864e5 || (q.mag ?? 0) < 3.5) continue
    const reach = PROVINCES.map((p) => ({ code: p.code, d: km(p.center, [q.lng, q.lat]) })).filter((x) => x.d <= feltRadius(q.mag))
    if (!reach.length) continue
    const nearest = Math.min(...reach.map((x) => x.d))
    const level = q.mag >= 6.5 && nearest <= 300 ? 3 : q.mag >= 5.5 && nearest <= 300 ? 2 : 1
    alerts.push({ id: `quake-${q.id}`, hazard: 'quake', level, provinces: reach.map((x) => x.code), data: { mag: q.mag, depth: q.depth, place: q.place, near: q.near, distance: Math.round(nearest) }, at: q.at, source: q.source === 'tmd' ? 'TMD' : 'USGS', url: q.url })
  }

  // Tsunami: a heads-up, not NDWC's warning (we link to them). Only shallow quakes in seas that can send a wave
  // to our coasts count. The Andaman coast faces the Sunda trench (2004); the Gulf is shallow and sheltered, so only
  // a very large quake on the Manila trench gets a watch there. A tsunami flag (USGS sets it for any large quake at
  // sea) is not a forecast, so it only lowers the bar to a watch.
  for (const q of quakes ?? []) {
    if (now - new Date(q.at).getTime() > 864e5) continue
    const mag = q.mag ?? 0
    if ((q.depth ?? 999) > 70) continue
    const andaman = q.lng >= 88 && q.lng <= 100 && q.lat >= -6 && q.lat <= 16
    const manila = q.lng >= 114 && q.lng <= 123 && q.lat >= 10 && q.lat <= 22
    const level = andaman ? (mag >= 7.5 ? 3 : mag >= 7 ? 2 : mag >= 6.5 && q.tsunami ? 1 : 0) : manila && mag >= 7.5 ? 1 : 0
    if (!level) continue
    const coast = andaman ? ANDAMAN : GULF
    alerts.push({ id: `tsunami-${q.id}`, hazard: 'tsunami', level, provinces: coast, data: { mag: q.mag, depth: q.depth, place: q.place, sea: andaman ? 'andaman' : 'scs', flagged: q.tsunami }, at: q.at, source: q.source === 'tmd' ? 'TMD' : 'USGS', url: 'https://ndwc.disaster.go.th/' })
  }

  return alerts.sort((a, b) => b.level - a.level || new Date(b.at) - new Date(a.at))
}

export const provinceExists = (code) => byCode.has(code)
