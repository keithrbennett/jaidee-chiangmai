// What น้องใจดี can look up: places, a province's picture, the area around someone, Thailand as a whole, and
// the safety guides. Plain data from the same feeds the pages use, made compact for a model to read. Also used
// by the checks in checks.js.
import { readFileSync } from 'node:fs'
import { all, get } from '../db.js'
import { feeds } from '../feeds.js'
import { hazards, satFlood } from '../hazards.js'
import { alerts, alertText } from '../push.js'
import { PROVINCES, nearestTambon, provinceAt, tambons } from '../lib/geo.js'

export const GUIDES = JSON.parse(readFileSync(new URL('../../src/data/guides.json', import.meta.url), 'utf8'))
export const TOPICS = GUIDES.topics.map((t) => t.id)
export const HOTLINES = Object.keys(GUIDES.hotlines)

const byCode = new Map(PROVINCES.map((p) => [p.code, p]))
export const provinceName = (code) => byCode.get(code) ?? null

/** Kilometres between [lng, lat] points (equirectangular: fine at these distances). */
export function km(a, b) {
  const k = Math.cos(((a[1] + b[1]) / 2) * (Math.PI / 180))
  return Math.hypot((a[0] - b[0]) * k, a[1] - b[1]) * 111.2
}

/** Same classes as src/lib/water.ts: % of bank-full, or metres against the bank. */
export function stationStatus(s) {
  if (s.over !== null && s.over > 0) return 'over'
  const p = s.pct
  if (p === null) return s.over === null ? 'unknown' : s.over > -0.5 ? 'high' : 'normal'
  if (p > 100) return 'over'
  if (p >= 70) return 'high'
  if (p >= 30) return 'normal'
  if (p >= 10) return 'low'
  return 'veryLow'
}

const LEVEL_NAMES = ['no flooding (under 10 cm)', 'ankle to mid-shin (10–30 cm)', 'knee (30–60 cm)', 'waist (60–100 cm)', 'chest (100–150 cm)', 'over head height (over 150 cm)']
export const levelName = (l) => LEVEL_NAMES[l] ?? String(l)

/** Bangkok wall-clock time for a model to read: "2026-10-04 14:05". */
export const bkk = (t) => new Date(new Date(t).getTime() + 7 * 3600_000).toISOString().slice(0, 16).replace('T', ' ')
const hoursAgo = (t) => Math.round(((Date.now() - new Date(t).getTime()) / 3600_000) * 10) / 10
const round = (x, d = 1) => (x === null || x === undefined ? null : Math.round(x * 10 ** d) / 10 ** d)

/** Settle a promise within `ms` or give up with `fallback`: a slow feed must not hold up an answer. */
export const within = (p, ms, fallback = null) => Promise.race([p, new Promise((r) => setTimeout(() => r(fallback), ms))])

// ---- Places ---------------------------------------------------------------------------------------------------

const ALIASES = { กทม: '10', กรุงเทพ: '10', bangkok: '10', bkk: '10', โคราช: '30', korat: '30', อยุธยา: '14', ayutthaya: '14', แปดริ้ว: '24', โคราด: '30' }
let placeIndex = null
/** Every district and sub-district, built once: [{ kind, th, en, province, lng, lat }]. */
function places() {
  if (placeIndex) return placeIndex
  placeIndex = []
  for (const p of PROVINCES) {
    const districts = new Map()
    for (const t of tambons(p.code)) {
      placeIndex.push({ kind: 'tambon', th: t[1], en: t[2], province: p.code, district: t[3], lng: t[4], lat: t[5] })
      const d = districts.get(t[3]) ?? { n: 0, lng: 0, lat: 0 }
      districts.set(t[3], { n: d.n + 1, lng: d.lng + t[4], lat: d.lat + t[5] })
    }
    let names = []
    try {
      const file = new URL(`../../public/geo/p/${p.code}/districts.geojson`, import.meta.url)
      names = JSON.parse(readFileSync(file, 'utf8')).features.map((f) => f.properties)
    } catch {
      // No district file for this province.
    }
    for (const d of names) {
      const c = districts.get(d.pcode)
      if (c) placeIndex.push({ kind: 'district', th: d.th, en: d.en, province: p.code, district: d.pcode, lng: c.lng / c.n, lat: c.lat / c.n })
    }
  }
  return placeIndex
}
const districtNames = new Map()
function districtName(provinceCode, pcode) {
  if (!districtNames.has(provinceCode)) {
    const m = new Map(places().filter((x) => x.kind === 'district' && x.province === provinceCode).map((x) => [x.district, x]))
    districtNames.set(provinceCode, m)
  }
  return districtNames.get(provinceCode).get(pcode) ?? null
}

const PREFIX = /^(จังหวัด|จ\.|อำเภอ|อ\.|ตำบล|ต\.|เขต|แขวง|province|district|amphoe|tambon)\s*/i

/**
 * Provinces, districts or sub-districts whose name matches, best first. Several words ("หางดง เชียงใหม่",
 * "ต.หนองแก๋ว อ.หางดง") are matched one by one, inside the province one of them names.
 */
export function findPlace(query, provinceHint = null) {
  const raw = String(query ?? '').trim().slice(0, 100)
  const whole = matchPlace(raw, provinceHint)
  const words = raw.split(/[\s,]+/).filter((w) => w.replace(PREFIX, '').length >= 2)
  // "Mae Sai" is one name; "หางดง เชียงใหม่" is two.
  if (words.length <= 1 || whole.some((r) => r.kind !== 'province' || r.exact)) return whole
  const named = words.map((w) => matchPlace(w, null).find((r) => r.kind === 'province' && r.exact)).find(Boolean)
  const hint = provinceHint ?? named?.province ?? null
  const seen = new Set()
  return words
    .flatMap((w) => matchPlace(w, hint))
    .filter((r) => (r.kind !== 'province' || !hint || r.province === hint) && !seen.has(r.name_en) && seen.add(r.name_en))
    .sort((a, b) => (a.kind === 'province') - (b.kind === 'province'))
    .slice(0, 6)
}

function matchPlace(raw, provinceHint) {
  const q = raw.replace(PREFIX, '').replace(/\s+/g, '').toLowerCase()
  if (!q) return []
  const out = []
  const alias = ALIASES[q]
  for (const p of PROVINCES) {
    const th = p.th.replace(/\s+/g, '')
    const en = p.en.replace(/\s+/g, '').toLowerCase()
    if (alias === p.code || th === q || en === q) out.push({ kind: 'province', score: 3, p, exact: true })
    else if (q.length >= 3 && (th.includes(q) || en.includes(q) || q.includes(th))) out.push({ kind: 'province', score: 2, p })
  }
  for (const x of places()) {
    if (provinceHint && x.province !== provinceHint) continue
    const th = x.th.replace(/\s+/g, '')
    const en = x.en.replace(/\s+/g, '').toLowerCase()
    const exact = th === q || en === q
    if (exact || (q.length >= 4 && (th.startsWith(q) || en.startsWith(q)))) out.push({ kind: x.kind, score: (exact ? 2.5 : 1.5) + (x.kind === 'district' ? 0.2 : 0), x })
  }
  return out
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map((r) => {
      if (r.kind === 'province') return { kind: 'province', province: r.p.code, name_th: r.p.th, name_en: r.p.en, lng: r.p.center[0], lat: r.p.center[1], ...(r.exact ? { exact: true } : {}) }
      const p = byCode.get(r.x.province)
      const d = r.x.kind === 'tambon' ? districtName(r.x.province, r.x.district) : null
      return {
        kind: r.x.kind,
        province: r.x.province,
        name_th: r.x.kind === 'tambon' ? `ต.${r.x.th}${d ? ` อ.${d.th}` : ''} จ.${p.th}` : `อ.${r.x.th} จ.${p.th}`,
        name_en: `${r.x.en}${d ? `, ${d.en}` : ''}, ${p.en}`,
        lng: round(r.x.lng, 4),
        lat: round(r.x.lat, 4),
      }
    })
}

/** Where a point is, in words: { province, district, tambon } names. */
export function placeAt(lng, lat) {
  const code = provinceAt(lng, lat)
  if (!code) return null
  const p = byCode.get(code)
  const { tambon, district } = nearestTambon(code, lng, lat)
  const t = tambons(code).find((x) => x[0] === tambon)
  const d = district ? districtName(code, district) : null
  return {
    province: code,
    name_th: [t && `ต.${t[1]}`, d && `อ.${d.th}`, `จ.${p.th}`].filter(Boolean).join(' '),
    name_en: [t?.[2], d?.en, p.en].filter(Boolean).join(', '),
  }
}

// ---- A province ---------------------------------------------------------------------------------------------

const center = (code) => get('SELECT active, name, hotline FROM command_centers WHERE province = ?', code) ?? { active: 0, name: null, hotline: null }

function stationLine(s, from) {
  return {
    name: s.name,
    river: s.river,
    status: stationStatus(s),
    metres_vs_bank: round(s.over, 2),
    percent_of_bank: s.pct === null ? null : Math.round(s.pct),
    trend: s.trend,
    measured: bkk(s.observedAt),
    hours_old: hoursAgo(s.observedAt),
    ...(from ? { km_away: round(km(from, [s.lng, s.lat])) } : {}),
  }
}

function reportStats(rows) {
  const checks = new Map(
    rows.length ? all(`SELECT ref_id, verdict FROM ai_checks WHERE kind = 'report' AND ref_id IN (${rows.map(() => '?').join(',')})`, ...rows.map((r) => r.id)).map((c) => [c.ref_id, c.verdict]) : [],
  )
  const byLevel = [0, 0, 0, 0, 0, 0]
  for (const r of rows) byLevel[r.level]++
  return {
    count: rows.length,
    by_level: Object.fromEntries(byLevel.map((n, i) => [levelName(i), n]).filter(([, n]) => n)),
    checked_consistent: rows.filter((r) => checks.get(r.id) === 'consistent').length,
    checked_inconsistent: rows.filter((r) => checks.get(r.id) === 'inconsistent').length,
    latest: rows[0] ? bkk(rows[0].created_at) : null,
  }
}

/** Everything about one province that an answer might need, compact. */
export async function provinceSummary(code) {
  const p = byCode.get(code)
  if (!p) return { error: 'no such province' }
  const [stations, rain, national, air, forecast, hotspots, quakes, satCounts, airForecast, alertList] = await within(
    Promise.all([
      feeds.stations.get(),
      feeds.rain.get(),
      feeds.national.get(),
      feeds.air.get(),
      feeds.forecast.get(),
      hazards.hotspots.get(),
      hazards.quakes.get(),
      hazards.satFlood.get(),
      hazards.airForecast.get(),
      alerts.get(),
    ]),
    12_000,
    [feeds.stations.peek(), feeds.rain.peek(), feeds.national.peek(), feeds.air.peek(), feeds.forecast.peek(), hazards.hotspots.peek(), hazards.quakes.peek(), hazards.satFlood.peek(), hazards.airForecast.peek(), alerts.peek()],
  )
  const st = (stations ?? []).filter((s) => s.province === code)
  const order = ['over', 'high', 'normal', 'low', 'veryLow', 'unknown']
  st.sort((a, b) => order.indexOf(stationStatus(a)) - order.indexOf(stationStatus(b)) || (b.pct ?? 0) - (a.pct ?? 0))
  const f = forecast?.[code]
  const next = (f?.hourly ?? []).filter((h) => new Date(h[0]).getTime() >= Date.now() - 3600_000).slice(0, 24)
  const rainRows = (rain ?? []).filter((r) => r[4] === code && r[2] !== null).sort((a, b) => b[2] - a[2])
  const worstAir = (air ?? []).filter((a) => a.province === code).sort((a, b) => b.aqi - a.aqi)[0]
  const fires = (hotspots ?? []).filter((h) => h.province === code)
  const nearQuakes = (quakes ?? [])
    .map((q) => ({ q, d: km(p.center, [q.lng, q.lat]) }))
    .filter(({ q, d }) => d <= 1000 && Date.now() - new Date(q.at).getTime() < 3 * 864e5)
    .sort((a, b) => (b.q.mag ?? 0) - (a.q.mag ?? 0))
    .slice(0, 3)
  const reports = all('SELECT id, level, created_at FROM reports WHERE province = ? AND hidden = 0 AND created_at > ? ORDER BY created_at DESC', code, Date.now() - 24 * 3600_000)
  const c = center(code)
  return {
    province: { code, name_th: p.th, name_en: p.en, region: p.region },
    now: bkk(Date.now()),
    jaidee_alerts: (alertList ?? []).filter((a) => a.provinces.includes(code)).map((a) => ({ hazard: a.hazard, level: ['', 'watch', 'warning', 'danger'][a.level], text: alertText(a, 'en'), source: a.source })),
    rivers: {
      gauges: st.length,
      over_bank: st.filter((s) => stationStatus(s) === 'over').length,
      high: st.filter((s) => stationStatus(s) === 'high').length,
      most_serious: st.slice(0, 5).map((s) => stationLine(s)),
    },
    dams: (national?.dams ?? []).filter((d) => d.province === code).map((d) => ({ name: d.en, name_th: d.th, percent_full: Math.round(d.storagePct ?? 0), inflow_mcm_day: d.inflow, released_mcm_day: d.released, date: d.date })),
    rain: {
      wettest_gauge_24h_mm: rainRows[0] ? { mm: rainRows[0][2], gauge: rainRows[0][5] } : null,
      gauges_over_35mm_24h: rainRows.filter((r) => r[2] >= 35.1).length,
      forecast_next_24h_mm: next.length ? round(next.reduce((s, h) => s + (h[1] ?? 0), 0)) : null,
      forecast_max_chance_pct: next.length ? Math.max(...next.map((h) => h[2] ?? 0)) : null,
      next_3_days: (f?.daily ?? []).map((d) => ({ date: d.date, mm: d.rain, chance_pct: d.chance, wind_kmh: d.wind })),
    },
    air: {
      worst_station: worstAir ? { name: worstAir.en, aqi: worstAir.aqi, pm25: worstAir.pm25, measured: bkk(worstAir.observedAt) } : null,
      pm25_outlook: (airForecast?.[code] ?? []).map((d) => ({ date: d.date, mean_ugm3: d.mean, max_ugm3: d.max })),
      note: 'Thai AQI: 0-25 very good, 26-50 good, 51-100 moderate, 101-200 unhealthy, 201+ very unhealthy. Thai PM2.5 24-h standard: 37.5 µg/m³.',
    },
    fire_hotspots_24h: { count: fires.length, in_forest: fires.filter((h) => /forest|ป่า/i.test(h.landuse ?? '')).length },
    earthquakes_3_days_within_1000km: nearQuakes.map(({ q, d }) => ({ magnitude: q.mag, place: q.place, km_from_province_centre: Math.round(d), depth_km: q.depth, time: bkk(q.at), source: q.source })),
    flood_from_satellite_7_days_km2: Math.round((satCounts?.[code] ?? 0) * 0.056),
    coordination_centre: { open: !!c.active, name: c.name, hotline: c.hotline, takes_help_requests_on_jaidee: !!c.active },
    shelters_open: all("SELECT name, capacity, occupancy, status, contact FROM shelters WHERE province = ? AND status != 'closed' ORDER BY name LIMIT 8", code),
    public_reports_24h: reportStats(reports),
  }
}

/** The area around a shared location. */
export async function nearbySummary(lng, lat) {
  const where = placeAt(lng, lat)
  if (!where) return { error: 'This location is outside Thailand.' }
  const here = [lng, lat]
  const [stations, rain, hotspots, satCounts] = await within(
    Promise.all([feeds.stations.get(), feeds.rain.get(), hazards.hotspots.get(), hazards.satFlood.get()]),
    10_000,
    [feeds.stations.peek(), feeds.rain.peek(), hazards.hotspots.peek(), hazards.satFlood.peek()],
  )
  const gauges = (stations ?? []).map((s) => ({ s, d: km(here, [s.lng, s.lat]) })).filter((x) => x.d <= 30).sort((a, b) => a.d - b.d).slice(0, 3)
  const rainNear = (rain ?? []).filter((r) => r[2] !== null && km(here, [r[0], r[1]]) <= 15)
  const reports = all(
    'SELECT id, level, created_at, lat, lng FROM reports WHERE hidden = 0 AND created_at > ? AND lat BETWEEN ? AND ? AND lng BETWEEN ? AND ? ORDER BY created_at DESC',
    Date.now() - 24 * 3600_000,
    lat - 0.03,
    lat + 0.03,
    lng - 0.03,
    lng + 0.03,
  ).filter((r) => km(here, [r.lng, r.lat]) <= 3)
  const shelter = all("SELECT name, lat, lng, capacity, occupancy, status, contact FROM shelters WHERE status != 'closed'")
    .map((s) => ({ ...s, d: km(here, [s.lng, s.lat]) }))
    .sort((a, b) => a.d - b.d)[0]
  let satCells = null
  if (satCounts?.[where.province]) {
    const cells = await within(satFlood(where.province), 6_000)
    if (cells) satCells = cells.filter((c) => km(here, [c[0], c[1]]) <= 1).length
  }
  return {
    place: where,
    nearest_gauges: gauges.map(({ s }) => stationLine(s, here)),
    rain_last_24h: rainNear.length ? { gauges_within_15km: rainNear.length, max_mm: Math.max(...rainNear.map((r) => r[2])) } : null,
    public_reports_within_3km_24h: reportStats(reports),
    nearest_open_shelter: shelter && shelter.d <= 40 ? { name: shelter.name, km_away: round(shelter.d), capacity: shelter.capacity, occupancy: shelter.occupancy, status: shelter.status, contact: shelter.contact } : null,
    fire_hotspots_within_10km_24h: (hotspots ?? []).filter((h) => km(here, [h.lng, h.lat]) <= 10).length,
    satellite_flood_cells_within_1km_7_days: satCells,
    coordination_centre: (({ active, name, hotline }) => ({ open: !!active, name, hotline }))(center(where.province)),
  }
}

/** Thailand as a whole. */
export async function nationalSummary() {
  const [alertList, quakes, stations] = await within(Promise.all([alerts.get(), hazards.quakes.get(), feeds.stations.get()]), 10_000, [alerts.peek(), hazards.quakes.peek(), feeds.stations.peek()])
  const list = alertList ?? []
  const counts = {}
  for (const a of list) {
    counts[a.hazard] ??= { watch: 0, warning: 0, danger: 0 }
    counts[a.hazard][['', 'watch', 'warning', 'danger'][a.level]]++
  }
  const top = [...list].sort((a, b) => b.level - a.level).slice(0, 12)
  const strongest = [...(quakes ?? [])].filter((q) => Date.now() - new Date(q.at).getTime() < 3 * 864e5).sort((a, b) => (b.mag ?? 0) - (a.mag ?? 0))[0]
  return {
    now: bkk(Date.now()),
    alert_counts: counts,
    most_serious: top.map((a) => ({
      hazard: a.hazard,
      level: ['', 'watch', 'warning', 'danger'][a.level],
      provinces: a.provinces.slice(0, 6).map((c) => byCode.get(c)?.th),
      text: alertText(a, 'en'),
    })),
    rivers_over_bank: (stations ?? []).filter((s) => stationStatus(s) === 'over').length,
    strongest_quake_3_days: strongest ? { magnitude: strongest.mag, place: strongest.place, time: bkk(strongest.at) } : null,
    coordination_centres_open: all('SELECT province FROM command_centers WHERE active = 1').map((r) => byCode.get(r.province)?.th),
  }
}

/** A guide in one language, for a model to summarise. */
export function guideText(id, lang = 'th') {
  const t = GUIDES.topics.find((x) => x.id === id)
  if (!t) return null
  const L = ['th', 'en', 'zh'].includes(lang) ? lang : 'en'
  return {
    topic: id,
    title: t.title[L],
    steps: t.steps.map((s) => s[L]),
    hotlines: t.hotlines.map((n) => `${n} ${GUIDES.hotlines[n][L]}`),
    sources: t.sources.map((s) => `${GUIDES.sources[s].name.en} ${GUIDES.sources[s].url}`),
  }
}
