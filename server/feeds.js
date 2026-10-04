// Live public data from Thai agencies and open services, normalised and cached. Every feed keeps its last
// good value if a refresh fails. Sources (all public, no keys):
//   RID SWOC   bigdata-swoc.rid.go.th   river stations of RID (hydrology + telemetry) and HII, with bank levels
//   Thaiwater  api-v3.thaiwater.net     HII national water archive: other agencies' stations, rain, dams, storms, CCTV
//   Air4Thai   air4thai.pcd.go.th       Pollution Control Department air quality
//   Open-Meteo api.open-meteo.com       rain forecast per province (free for non-commercial use)
import { PROVINCES, provinceAt, provinceCodes, provinceFromThai } from './lib/geo.js'
import { AIR4THAI_CA, bangkokIso, cached, fetchJson, num, round2 } from './lib/util.js'

const THAIWATER = 'https://api-v3.thaiwater.net/api/v1/thaiwater30'
const TREND = { เพิ่มขึ้น: 'up', ลดลง: 'down', คงที่: 'steady' }

/**
 * One river or canal gauge, whichever agency runs it.
 *   over: metres above (+) or below (−) the lowest bank, as the agency publishes it
 *   pct:  water level as % of bank-full (the agencies' "% ความจุลำน้ำ"); over 100 = spilling
 *   gauge: reading on the gauge's own scale and its critical level, where the agency publishes one (e.g. P.1)
 */
function station(s) {
  return {
    code: s.code,
    name: s.name,
    river: s.river || null,
    province: s.province,
    lat: s.lat,
    lng: s.lng,
    agency: s.agency,
    levelMsl: s.levelMsl,
    bankMsl: s.bankMsl,
    over: s.over,
    pct: s.pct,
    trend: s.trend ?? null,
    flow: s.flow ?? null,
    gauge: s.gauge ?? null,
    observedAt: s.observedAt,
    source: s.source,
  }
}

async function loadSwoc() {
  const body = await fetchJson('https://bigdata-swoc.rid.go.th/api/ma/pier/all/get_pier_data?date=&basin=&province=&region=&rid=')
  return (body.data ?? [])
    .filter((r) => r.wl_values_msl !== null && r.latitude && r.longitude)
    .map((r) => {
      const over = num(r.pier_diff)
      const levelMsl = round2(Number(r.wl_values_msl))
      return station({
        code: r.station_code,
        name: r.station_detail || r.name,
        river: r.river,
        province: provinceFromThai(r.province_t) ?? provinceAt(r.longitude, r.latitude),
        lat: r.latitude,
        lng: r.longitude,
        agency: r.agency_type === 'HII' ? 'HII' : 'RID',
        levelMsl,
        bankMsl: over === null ? num(r.brae_level_msl) : round2(levelMsl - over),
        over,
        pct: num(r.wl_percent),
        trend: TREND[r.wl_trend],
        flow: num(r.q_values),
        // RID gauges quoted on their own scale ("ม.รสม."), like P.1's 3.7 m critical level.
        gauge: r.use_msl === 0 ? { level: num(r.wl_values), critical: num(r.brae_level) } : null,
        observedAt: r.hourly_time_utc,
        source: 'rid',
      })
    })
}

async function loadThaiwaterLevels() {
  const body = await fetchJson(`${THAIWATER}/public/waterlevel_load`)
  return (body.waterlevel_data?.data ?? [])
    .filter((r) => r.waterlevel_msl !== null && r.station?.tele_station_lat)
    .map((r) => {
      const s = r.station
      const levelMsl = round2(Number(r.waterlevel_msl))
      const diff = num(r.diff_wl_bank)
      const over = diff === null ? null : /ล้น/.test(r.diff_wl_bank_text ?? '') ? diff : -diff
      const prev = num(r.waterlevel_msl_previous)
      const [date, time] = r.waterlevel_datetime.split(' ')
      return station({
        code: s.tele_station_oldcode || `TW${s.id}`,
        name: s.tele_station_name?.th?.trim() ?? '',
        river: r.river_name,
        province: r.geocode?.province_code ?? provinceAt(s.tele_station_long, s.tele_station_lat),
        lat: s.tele_station_lat,
        lng: s.tele_station_long,
        agency: r.agency?.agency_shortname?.en ?? '',
        levelMsl,
        bankMsl: num(s.min_bank),
        over,
        pct: num(r.storage_percent),
        trend: prev === null ? null : levelMsl > prev + 0.01 ? 'up' : levelMsl < prev - 0.01 ? 'down' : 'steady',
        gauge: s.offset && s.critical_level_m ? { level: round2(levelMsl - s.offset), critical: s.critical_level_m } : null,
        observedAt: bangkokIso(date, time),
        source: 'thaiwater',
      })
    })
}

/** RID SWOC first (RID's and HII's own figures), then Thaiwater for the agencies SWOC doesn't carry (EGAT, DNP …). */
async function loadStations() {
  const [swoc, tw] = await Promise.allSettled([loadSwoc(), loadThaiwaterLevels()])
  const out = new Map()
  for (const s of swoc.status === 'fulfilled' ? swoc.value : []) out.set(s.code, s)
  for (const s of tw.status === 'fulfilled' ? tw.value : []) if (!out.has(s.code)) out.set(s.code, s)
  if (!out.size) throw new Error('no station source answered')
  return [...out.values()]
}

/** Rain gauges nationwide: [lng, lat, rain24h, rain1h, province, name, agency, observedAt]. */
async function loadRain() {
  const body = await fetchJson(`${THAIWATER}/public/rain_24h`)
  return (body.data ?? [])
    .filter((r) => r.station?.tele_station_lat && r.rain_24h !== null)
    .map((r) => {
      const [date, time] = r.rainfall_datetime.split(' ')
      return [
        r.station.tele_station_long,
        r.station.tele_station_lat,
        num(r.rain_24h),
        num(r.rain_1h),
        r.geocode?.province_code ?? null,
        r.station.tele_station_name?.th?.trim() ?? '',
        r.agency?.agency_shortname?.en ?? '',
        bangkokIso(date, time),
      ]
    })
}

/** Large dams (RID and EGAT), daily. */
async function loadNational() {
  const body = await fetchJson(`${THAIWATER}/public/thailand`)
  const dams = (body.dam?.data?.data ?? []).map((r) => ({
    id: r.dam.id,
    th: r.dam.dam_name?.th ?? '',
    en: r.dam.dam_name?.en ?? '',
    lat: r.dam.dam_lat,
    lng: r.dam.dam_long,
    province: r.geocode?.province_code ?? provinceAt(r.dam.dam_long, r.dam.dam_lat),
    /** Water in the dam, million m³, and as % of normal capacity. */
    storage: num(r.dam_storage),
    storagePct: num(r.dam_storage_percent),
    /** Usable water (above dead storage), % of usable capacity. */
    usablePct: num(r.dam_uses_water_percent),
    capacity: num(r.dam.normal_storage),
    inflow: num(r.dam_inflow),
    released: num(r.dam_released),
    spilled: num(r.dam_spilled),
    date: r.dam_date,
    agency: r.agency?.agency_shortname?.en ?? '',
  }))
  const storms = (body.storm?.data?.data ?? []).map((s) => ({
    name: s.storm_name ?? s.name ?? '',
    lat: num(s.storm_lat ?? s.lat),
    lng: num(s.storm_long ?? s.long),
    at: s.storm_datetime ?? s.datetime ?? null,
    wind: num(s.storm_wind ?? s.wind),
  }))
  return { dams, storms }
}

/** Air quality stations nationwide (Air4Thai, Thai AQI). */
async function loadAir() {
  const body = await fetchJson('https://air4thai.pcd.go.th/services/getNewAQI_JSON.php', { ca: AIR4THAI_CA })
  return (body.stations ?? [])
    .map((s) => {
      const lat = Number(s.lat)
      const lng = Number(s.long)
      const aqi = Number(s.AQILast?.AQI?.aqi)
      const pm25 = Number(s.AQILast?.PM25?.value)
      return {
        id: s.stationID,
        th: s.nameTH.trim(),
        en: s.nameEN.trim(),
        lat,
        lng,
        province: provinceAt(lng, lat),
        aqi: aqi >= 0 ? aqi : null,
        pm25: pm25 >= 0 ? pm25 : null,
        observedAt: s.AQILast ? bangkokIso(s.AQILast.date, s.AQILast.time) : null,
      }
    })
    .filter((s) => s.aqi !== null)
}

/** Open-Meteo for all 77 province centres in one request: hourly rain for 48 h, daily for 3 days. */
async function loadForecast() {
  const lat = PROVINCES.map((p) => p.center[1]).join(',')
  const lng = PROVINCES.map((p) => p.center[0]).join(',')
  const body = await fetchJson(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}` +
      '&hourly=precipitation,precipitation_probability&forecast_hours=48' +
      '&daily=precipitation_sum,precipitation_probability_max,weather_code,wind_speed_10m_max&forecast_days=3' +
      '&timezone=Asia%2FBangkok',
  )
  const list = Array.isArray(body) ? body : [body]
  return Object.fromEntries(
    list.map((f, i) => [
      PROVINCES[i].code,
      {
        hourly: f.hourly.time.map((t, k) => [`${t}:00+07:00`, f.hourly.precipitation[k], f.hourly.precipitation_probability[k]]),
        daily: f.daily.time.map((d, k) => ({
          date: d,
          rain: f.daily.precipitation_sum[k],
          chance: f.daily.precipitation_probability_max[k],
          code: f.daily.weather_code[k],
          wind: f.daily.wind_speed_10m_max[k],
        })),
      },
    ]),
  )
}

/** Public CCTV cameras listed by Thaiwater (DWR, RID, HII and others). */
async function loadCctv() {
  const body = await fetchJson(`${THAIWATER}/analyst/cctv`)
  return (body.data ?? [])
    .filter((c) => c.is_active && c.cctv_url && Number(c.lat))
    .map((c) => ({
      id: c.id,
      title: c.title?.trim() ?? '',
      description: c.description?.trim() ?? '',
      lat: Number(c.lat),
      lng: Number(c.long),
      province: c.geocode?.province_code ?? provinceAt(Number(c.long), Number(c.lat)),
      /** "image": a still we proxy (many are plain http); "link": the agency's own viewer page. */
      kind: c.media_type === 'img' ? 'image' : 'link',
      url: c.cctv_url,
      agency: c.agency?.agency_shortname?.en ?? '',
    }))
}

export const feeds = {
  stations: cached('stations', loadStations),
  rain: cached('rain', loadRain),
  national: cached('national', loadNational, 30 * 60 * 1000),
  air: cached('air', loadAir),
  forecast: cached('forecast', loadForecast, 30 * 60 * 1000),
  cctv: cached('cctv', loadCctv, 6 * 60 * 60 * 1000),
}

export const isProvince = (code) => provinceCodes.has(code)
