// Tiny API server. Keeps ANTHROPIC_API_KEY on the server; the browser only talks to /api/*.
// Dev: `npm run dev` runs this alongside Vite (which proxies /api here).
// Demo: `npm run build && npm start` serves the built app and the API on one port.
import Anthropic from '@anthropic-ai/sdk'
import express from 'express'
import { existsSync } from 'node:fs'
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
