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

// Live conditions for the header badge: air quality from Air4Thai (Pollution Control Department) and the
// Ping River level at gauge P.1 (Nawarat Bridge) from Thaiwater. Both are public and need no key. Each
// source is cached for 10 minutes; if a refresh fails we keep serving the last good reading.
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

async function fetchRiver() {
  const body = await fetchJson('https://api-v3.thaiwater.net/api/v1/thaiwater30/public/waterlevel_load')
  const row = body.waterlevel_data?.data?.find((r) => r.station?.tele_station_oldcode === RIVER_STATION)
  if (!row) throw new Error(`Gauge ${RIVER_STATION} not in Thaiwater data`)
  // Readings are metres above mean sea level; the P.1 gauge reads from its own zero (`offset`), which is
  // the scale the 3.7 m critical level is quoted in.
  const { offset, critical_level_m: critical } = row.station
  const [date, time] = row.waterlevel_datetime.split(' ')
  return {
    level: Math.round((Number(row.waterlevel_msl) - offset) * 100) / 100,
    critical: critical ?? 3.7,
    observedAt: bangkokIso(date, time),
    source: 'Thaiwater (RID)',
  }
}

const conditions = {
  air: { value: null, fetchedAt: 0, pending: null, load: fetchAir },
  river: { value: null, fetchedAt: 0, pending: null, load: fetchRiver },
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
      console.error('conditions refresh failed:', err.message)
      entry.fetchedAt = Date.now() - CONDITIONS_TTL_MS + 60_000 // try again in a minute, not on every request
    })
    .finally(() => {
      entry.pending = null
    })
  await entry.pending
  return entry.value
}

app.get('/api/conditions', async (_req, res) => {
  const [air, river] = await Promise.all([reading(conditions.air), reading(conditions.river)])
  res.set('Cache-Control', 'public, max-age=60').json({ air, river })
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
