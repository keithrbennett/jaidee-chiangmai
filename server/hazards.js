// Hazards beyond rivers: fire hotspots and flooded areas seen by satellite (GISTDA), earthquakes (TMD and
// USGS), and the PM2.5 forecast (Open-Meteo / CAMS). The GISTDA key stays here: its responses echo the key in
// their links, so nothing from GISTDA goes to the browser unfiltered.
import { PROVINCES, provinceAt, provinceFromThai } from './lib/geo.js'
import { cached, fetchJson, num } from './lib/util.js'

const GISTDA = 'https://api-gateway.gistda.or.th/api/2.0/resources/features'
const gistdaKey = () => process.env.GISTDA_API_KEY
const gistda = (path) => {
  if (!gistdaKey()) throw new Error('GISTDA_API_KEY is not set')
  return fetchJson(`${GISTDA}/${path}`, { headers: { 'API-Key': gistdaKey() } })
}

/** Every feature of a GISTDA collection (it pages 1,000 at a time), up to `max`. */
async function gistdaAll(path, max = 20_000) {
  const out = []
  for (let offset = 0; offset < max; offset += 1000) {
    const body = await gistda(`${path}${path.includes('?') ? '&' : '?'}limit=1000&offset=${offset}`)
    out.push(...(body.features ?? []))
    if ((body.numberReturned ?? 0) < 1000) break
  }
  return out
}

/** Thailand and its neighbours: smoke from Myanmar, Laos and Cambodia reaches the North and Northeast. */
const REGION_BBOX = '92,5,110,24'

/** VIIRS fire hotspots in the last 24 h (GISTDA). Land use tells forest from farmland. */
async function loadHotspots() {
  const features = await gistdaAll(`viirs/1day?bbox=${REGION_BBOX}`)
  return features.map((f) => {
    const p = f.properties
    const [lng, lat] = f.geometry.coordinates
    const t = String(p.acq_time ?? '0000').padStart(4, '0')
    return {
      lat,
      lng,
      country: p.ct_en ?? null,
      province: p.ct_en === 'Thailand' ? (provinceFromThai(p.pv_tn) ?? provinceAt(lng, lat)) : null,
      landuse: p.lu_name ?? null,
      confidence: p.confidence ?? null,
      frp: num(p.frp),
      // Acquisition time is UTC.
      at: `${String(p.acq_date).slice(0, 10)}T${t.slice(0, 2)}:${t.slice(2)}:00Z`,
    }
  })
}

/**
 * Flooded area seen by satellite in the last 7 days (GISTDA, Sentinel-1 radar), as counts of H3 cells per
 * province. GISTDA can't return counts without geometry, so we ask for one feature per province and read
 * numberMatched; the cells themselves are fetched per province on demand.
 */
async function loadSatFloodCounts() {
  const out = {}
  for (const p of PROVINCES) {
    const body = await gistda(`flood/7days?pv_idn=${Number(p.code)}&limit=1`)
    if (body.numberMatched) out[p.code] = body.numberMatched
  }
  return out
}

const satFloodCache = new Map()
/**
 * Flood cells of one province for the map: centre [lng, lat] and flooded m² of each H3 cell (about 0.12 km²).
 * The traced outlines are heavy (12,000 cells in Nakhon Sawan at times), so we send centres only.
 */
export function satFlood(code) {
  if (!satFloodCache.has(code)) {
    satFloodCache.set(
      code,
      cached(
        `satflood-${code}`,
        async () => {
          const features = await gistdaAll(`flood/7days?pv_idn=${Number(code)}`)
          return features.map((f) => {
            const ring = f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates[0][0] : f.geometry.coordinates[0]
            const lng = ring.reduce((a, c) => a + c[0], 0) / ring.length
            const lat = ring.reduce((a, c) => a + c[1], 0) / ring.length
            return [Math.round(lng * 1e5) / 1e5, Math.round(lat * 1e5) / 1e5, Math.round(num(f.properties.f_area) ?? 0)]
          })
        },
        3 * 3600_000,
      ),
    )
  }
  return satFloodCache.get(code).get()
}

/** Earthquakes: TMD (Thai official, last ~10 in the region) and USGS (magnitude 3+, 7 days, with tsunami flag). */
async function loadQuakes() {
  const [tmd, usgs] = await Promise.allSettled([loadTmdQuakes(), loadUsgsQuakes()])
  const list = [...(tmd.status === 'fulfilled' ? tmd.value : []), ...(usgs.status === 'fulfilled' ? usgs.value : [])]
  if (!list.length && tmd.status === 'rejected' && usgs.status === 'rejected') throw new Error('no earthquake source answered')
  // The same quake from both: keep TMD's (Thai description), take USGS's tsunami flag.
  const out = []
  for (const q of list.sort((a, b) => (a.source === 'tmd' ? -1 : 1) - (b.source === 'tmd' ? -1 : 1))) {
    const twin = out.find((o) => Math.abs(new Date(o.at) - new Date(q.at)) < 120_000 && Math.hypot(o.lat - q.lat, o.lng - q.lng) < 1)
    if (twin) twin.tsunami ||= q.tsunami
    else out.push(q)
  }
  return out.sort((a, b) => new Date(b.at) - new Date(a.at))
}

async function loadTmdQuakes() {
  const res = await fetch('https://earthquake.tmd.go.th/feed/rss_tmd.xml', { signal: AbortSignal.timeout(20_000) })
  if (!res.ok) throw new Error(`TMD earthquakes answered ${res.status}`)
  const xml = await res.text()
  const tag = (s, t) => s.match(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`))?.[1]?.trim() ?? null
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, s]) => ({
    id: `tmd-${tag(s, 'link')?.match(/earthquake=(\d+)/)?.[1] ?? tag(s, 'tmd:time')}`,
    place: tag(s, 'title'),
    near: tag(s, 'comments'),
    lat: Number(tag(s, 'geo:lat')),
    lng: Number(tag(s, 'geo:long')),
    depth: num(tag(s, 'tmd:depth')),
    mag: num(tag(s, 'tmd:magnitude')),
    at: new Date(`${tag(s, 'tmd:time')?.replace(' UTC', 'Z').replace(' ', 'T')}`).toISOString(),
    tsunami: false,
    url: tag(s, 'link'),
    source: 'tmd',
  }))
}

async function loadUsgsQuakes() {
  const since = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10)
  const body = await fetchJson(
    `https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&minlatitude=-12&maxlatitude=32&minlongitude=82&maxlongitude=128&minmagnitude=3&starttime=${since}`,
  )
  return body.features.map((f) => ({
    id: `usgs-${f.id}`,
    place: f.properties.place,
    near: null,
    lat: f.geometry.coordinates[1],
    lng: f.geometry.coordinates[0],
    depth: f.geometry.coordinates[2],
    mag: f.properties.mag,
    at: new Date(f.properties.time).toISOString(),
    tsunami: f.properties.tsunami === 1,
    url: f.properties.url,
    source: 'usgs',
  }))
}

/** PM2.5 forecast (CAMS via Open-Meteo) for all 77 province centres: daily mean and max for 4 days. */
async function loadAirForecast() {
  const lat = PROVINCES.map((p) => p.center[1]).join(',')
  const lng = PROVINCES.map((p) => p.center[0]).join(',')
  const body = await fetchJson(
    `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lng}&hourly=pm2_5&forecast_days=4&timezone=Asia%2FBangkok`,
  )
  const list = Array.isArray(body) ? body : [body]
  return Object.fromEntries(
    list.map((f, i) => {
      const days = {}
      f.hourly.time.forEach((t, k) => {
        const d = t.slice(0, 10)
        const v = f.hourly.pm2_5[k]
        if (v === null) return
        days[d] ??= []
        days[d].push(v)
      })
      return [
        PROVINCES[i].code,
        Object.entries(days).map(([date, v]) => ({
          date,
          mean: Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10,
          max: Math.round(Math.max(...v) * 10) / 10,
        })),
      ]
    }),
  )
}

export const hazards = {
  hotspots: cached('hotspots', loadHotspots, 30 * 60_000),
  satFlood: cached('satflood', loadSatFloodCounts, 3 * 3600_000),
  quakes: cached('quakes', loadQuakes, 5 * 60_000),
  airForecast: cached('airforecast', loadAirForecast, 60 * 60_000),
}
