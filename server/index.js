// Tiny API server. Keeps ANTHROPIC_API_KEY on the server; the browser only talks to /api/*.
// Dev: `npm run dev` runs this alongside Vite (which proxies /api here).
// Demo: `npm run build && npm start` serves the built app and the API on one port.
import Anthropic from '@anthropic-ai/sdk'
import express from 'express'
import { existsSync, readFileSync } from 'node:fs'
import https from 'node:https'
import { rootCertificates } from 'node:tls'
import { fileURLToPath } from 'node:url'

// Load .env if present. (Not using `node --env-file-if-exists` because it crashes `node --watch` when .env is missing.)
try {
  process.loadEnvFile()
} catch {
  // No .env file; rely on the real environment.
}

const PORT = Number(process.env.PORT ?? 8787)
const MODEL = process.env.CLAUDE_MODEL ?? 'claude-sonnet-4-5'
const CATEGORIES = ['haze', 'flood', 'school', 'temple', 'animals', 'elderly', 'environment']

const DRAFT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    'title_en',
    'title_th',
    'description_en',
    'description_th',
    'category',
    'skills',
    'place',
    'slot_label',
    'hours',
    'spots_total',
  ],
  properties: {
    title_en: { type: 'string', description: 'Short, action-first English title, max 60 characters' },
    title_th: { type: 'string', description: 'Short Thai title' },
    description_en: {
      type: 'string',
      description: 'Clear English description for foreign volunteers, 1-3 sentences',
    },
    description_th: { type: 'string', description: 'Tidied Thai description, faithful to the original' },
    category: { type: 'string', enum: CATEGORIES },
    skills: { type: 'array', items: { type: 'string' }, description: 'Skills needed, English, 1-3 items' },
    place: { type: 'string', description: 'Place name in English, or empty string if not given' },
    slot_label: { type: 'string', description: 'When, e.g. "Sat 13 Dec · 09:00–12:00"' },
    hours: { type: 'number', description: 'Length of the slot in hours' },
    spots_total: { type: 'integer', description: 'Number of volunteers needed' },
  },
}

const SYSTEM_PROMPT = `You turn volunteer requests from Thai community partners (schools, temples, shelters, municipality staff) in Chiang Mai into bilingual job cards for foreign volunteers.
Be faithful: never invent details that are not in the request. If the number of volunteers or time is missing, make a sensible conservative guess (e.g. 4 volunteers, 2 hours) and keep it plausible.
Do not include children's names or personal phone numbers in the card.`

const app = express()
app.use(express.json({ limit: '32kb' }))

app.post('/api/translate-need', async (req, res) => {
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : ''
  if (text.length < 10) return res.status(400).json({ error: 'Please write at least a sentence about the need.' })
  if (!process.env.ANTHROPIC_API_KEY) {
    return res
      .status(503)
      .json({ error: 'ANTHROPIC_API_KEY is not set on the server. Copy .env.example to .env and add a key.' })
  }

  try {
    const client = new Anthropic()
    const message = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: text }],
      output_config: { format: { type: 'json_schema', schema: DRAFT_SCHEMA } },
    })
    const block = message.content.find((b) => b.type === 'text')
    if (!block) throw new Error('Claude returned no text')
    res.json(JSON.parse(block.text))
  } catch (err) {
    console.error('translate-need failed:', err)
    res.status(502).json({ error: `Claude request failed: ${err instanceof Error ? err.message : String(err)}` })
  }
})

// Live data: air quality from Air4Thai (Pollution Control Department); river levels and rain gauges from
// Thaiwater; a rain forecast from Open-Meteo. All public, no keys. Each source is cached for 10 minutes;
// if a refresh fails we keep serving the last good reading.
const CONDITIONS_TTL_MS = 10 * 60 * 1000
const AIR_STATIONS = ['36t', '35t'] // Yupparaj Wittayalai School (city centre), then City Hall as a fallback
const RIVER_STATION = 'P.1'

// Both sources report Bangkok local time without a zone, e.g. "2026-10-03 23:00".
const bangkokIso = (date, time) => `${date}T${time}:00+07:00`

// air4thai.pcd.go.th serves the wrong intermediates for its Let's Encrypt certificate, so Node can't verify it
// on its own. We add the right ones (see the comment in the .pem) for that host only; verification stays on.
const AIR4THAI_CA = [...rootCertificates, readFileSync(new URL('./certs/air4thai-intermediates.pem', import.meta.url))]

function fetchJson(url, { ca } = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { ca, timeout: 15_000, headers: { 'User-Agent': 'jaidee-chiangmai' } }, (res) => {
      if (res.statusCode !== 200) {
        res.resume()
        return reject(new Error(`${url} answered ${res.statusCode}`))
      }
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => (body += chunk))
      res.on('end', () => {
        try {
          resolve(JSON.parse(body))
        } catch (err) {
          reject(err)
        }
      })
    })
    req.on('timeout', () => req.destroy(new Error(`${url} timed out`)))
    req.on('error', reject)
  })
}

async function fetchAir() {
  for (const id of AIR_STATIONS) {
    const s = await fetchJson(`https://air4thai.pcd.go.th/services/getNewAQI_JSON.php?stationID=${id}`, {
      ca: AIR4THAI_CA,
    })
    const aqi = Number(s.AQILast?.AQI?.aqi)
    if (!(aqi >= 0)) continue // the station reports -1 when it has no reading
    const pm25 = Number(s.AQILast.PM25?.value)
    return {
      aqi,
      pm25: pm25 >= 0 ? pm25 : null,
      station: { en: s.nameEN.trim(), th: s.nameTH.trim() },
      observedAt: bangkokIso(s.AQILast.date, s.AQILast.time),
      source: 'Air4Thai (PCD)',
    }
  }
  throw new Error('No Chiang Mai air station has a current reading')
}

const CHIANG_MAI_PROVINCE = '50'
const round2 = (x) => Math.round(x * 100) / 100
const num = (x) => (x === null || x === undefined || x === '' ? null : Number(x))

/** Every water-level station in Chiang Mai province from Thaiwater: RID gauges (P.*) and other agencies' telemetry. */
async function fetchGauges() {
  const body = await fetchJson('https://api-v3.thaiwater.net/api/v1/thaiwater30/public/waterlevel_load')
  const rows = body.waterlevel_data?.data?.filter((r) => r.geocode?.province_code === CHIANG_MAI_PROVINCE) ?? []
  if (!rows.length) throw new Error('No Chiang Mai water-level stations in Thaiwater data')
  return rows.map((r) => {
    const s = r.station
    const msl = num(r.waterlevel_msl)
    const [date, time] = r.waterlevel_datetime.split(' ')
    return {
      code: s.tele_station_oldcode || String(s.id),
      name: s.tele_station_name?.th?.trim() ?? '',
      river: r.river_name ?? '',
      agency: r.agency?.agency_shortname?.en ?? '',
      lat: s.tele_station_lat,
      lng: s.tele_station_long,
      /** Water surface and lowest bank, metres above mean sea level. */
      levelMsl: msl,
      bankMsl: num(s.min_bank),
      // Gauges with their own zero (`offset`, e.g. P.1) also read in metres on that scale, which is the
      // scale their critical level (3.7 m at P.1) is quoted in.
      level: msl !== null && s.offset ? round2(msl - s.offset) : null,
      critical: num(s.critical_level_m),
      observedAt: bangkokIso(date, time),
    }
  })
}

/** Rain gauges in Chiang Mai province from Thaiwater: last hour and last 24 hours, in mm. */
async function fetchRain() {
  const body = await fetchJson('https://api-v3.thaiwater.net/api/v1/thaiwater30/public/rain_24h')
  const rows = body.data?.filter((r) => r.geocode?.province_code === CHIANG_MAI_PROVINCE) ?? []
  if (!rows.length) throw new Error('No Chiang Mai rain stations in Thaiwater data')
  return rows.map((r) => {
    const [date, time] = r.rainfall_datetime.split(' ')
    return {
      name: r.station.tele_station_name?.th?.trim() ?? '',
      agency: r.agency?.agency_shortname?.en ?? '',
      lat: r.station.tele_station_lat,
      lng: r.station.tele_station_long,
      rain1h: num(r.rain_1h),
      rain24h: num(r.rain_24h),
      observedAt: bangkokIso(date, time),
    }
  })
}

/** Hourly rain forecast for the city centre from Open-Meteo, next 48 hours, in mm per hour. */
async function fetchForecast() {
  const body = await fetchJson(
    'https://api.open-meteo.com/v1/forecast?latitude=18.79&longitude=98.99&hourly=precipitation&forecast_hours=48&timezone=Asia%2FBangkok',
  )
  return body.hourly.time.map((t, i) => ({ time: `${t}:00+07:00`, mm: body.hourly.precipitation[i] }))
}

const feeds = {
  air: { value: null, fetchedAt: 0, pending: null, load: fetchAir },
  gauges: { value: null, fetchedAt: 0, pending: null, load: fetchGauges },
  rain: { value: null, fetchedAt: 0, pending: null, load: fetchRain },
  forecast: { value: null, fetchedAt: 0, pending: null, load: fetchForecast },
}

/** Cached reading for one source; refreshes when stale and falls back to the last good value (or null). */
async function reading(entry) {
  if (Date.now() - entry.fetchedAt < CONDITIONS_TTL_MS) return entry.value
  entry.pending ??= entry
    .load()
    .then((value) => {
      entry.value = value
      entry.fetchedAt = Date.now()
    })
    .catch((err) => {
      console.error('feed refresh failed:', err.message)
      entry.fetchedAt = Date.now() - CONDITIONS_TTL_MS + 60_000 // try again in a minute, not on every request
    })
    .finally(() => {
      entry.pending = null
    })
  await entry.pending
  return entry.value
}

app.get('/api/conditions', async (_req, res) => {
  const [air, gauges] = await Promise.all([reading(feeds.air), reading(feeds.gauges)])
  const p1 = gauges?.find((g) => g.code === RIVER_STATION)
  const river =
    p1 && p1.level !== null
      ? { level: p1.level, critical: p1.critical ?? 3.7, observedAt: p1.observedAt, source: 'Thaiwater (RID)' }
      : null
  res.set('Cache-Control', 'public, max-age=60').json({ air, river })
})

// Everything the flood simulator page shows live: river gauges, rain gauges and the rain forecast.
app.get('/api/flood', async (_req, res) => {
  const [gauges, rain, forecast] = await Promise.all([
    reading(feeds.gauges),
    reading(feeds.rain),
    reading(feeds.forecast),
  ])
  res.set('Cache-Control', 'public, max-age=60').json({ gauges, rain, forecast })
})

// Serve the production build if it exists (npm run build && npm start).
const dist = fileURLToPath(new URL('../dist', import.meta.url))
if (existsSync(dist)) {
  app.use(express.static(dist))
  app.get('/{*path}', (_req, res) => res.sendFile('index.html', { root: dist }))
}

app.listen(PORT, (err) => {
  // Express 5 passes listen errors (e.g. EADDRINUSE) here instead of throwing.
  if (err) {
    console.error(
      err.code === 'EADDRINUSE'
        ? `Port ${PORT} is already in use. Is another copy of the server running? Stop it or set PORT.`
        : err,
    )
    process.exit(1)
  }
  console.log(`API listening on http://localhost:${PORT} (model: ${MODEL}, key ${process.env.ANTHROPIC_API_KEY ? 'set' : 'MISSING'})`)
})
