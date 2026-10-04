// น้องใจดี over HTTP: POST /api/assistant streams the reply as server-sent events (one JSON object per
// event, see server/ai/assistant.js). Nothing of the conversation is stored or logged.
import express from 'express'
import { TRI, aiAvailable, aiEnabled, askJson, takeBudget } from '../ai/claude.js'
import { runAssistant } from '../ai/assistant.js'
import { runBasic } from '../ai/basic.js'
import { isProvince } from '../feeds.js'
import { BadInput, lngLat, oneOf, rateLimit, route } from '../lib/util.js'

export const assistantRoutes = express.Router()

assistantRoutes.get('/assistant/status', (_req, res) => {
  res.set('Cache-Control', 'no-store')
  res.json({ ai: aiAvailable(), configured: aiEnabled() })
})

/** A photo sent with a question: a JPEG data URL as shrinkPhoto makes it (≤ 1280 px), at most ~1.5 MB. */
const PHOTO = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/
const PHOTO_DATA = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/
function readTurns(v) {
  if (!Array.isArray(v) || !v.length || v.length > 30) throw new BadInput('messages')
  let total = 0
  const turns = v.map((t, i) => {
    if (!t || (t.role !== 'user' && t.role !== 'assistant') || typeof t.text !== 'string') throw new BadInput('messages')
    const text = t.text.slice(0, t.role === 'user' ? 2000 : 6000)
    total += text.length
    // Only the newest question may carry a photo.
    const image = i === v.length - 1 && typeof t.image === 'string' && t.image.length < 2_000_000 && PHOTO.test(t.image) ? t.image : null
    return { role: t.role, text, image, hadImage: !!t.hadImage }
  })
  const last = turns[turns.length - 1]
  if (total > 40_000 || last.role !== 'user' || (!last.text.trim() && !last.image)) throw new BadInput('messages')
  return turns.slice(-16)
}

assistantRoutes.post(
  '/assistant',
  rateLimit('assistant', 30, 10 * 60_000),
  route(async (req, res) => {
    const b = req.body ?? {}
    const input = {
      turns: readTurns(b.messages),
      lang: oneOf(b.lang, 'lang', ['th', 'en', 'zh']) ?? 'th',
      province: b.province && isProvince(b.province) ? b.province : null,
      location: Array.isArray(b.location) ? lngLat(b.location[0], b.location[1]) : null,
      page: typeof b.page === 'string' ? b.page.slice(0, 20) : null,
    }

    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no', Connection: 'keep-alive' })
    let sent = 0
    const emit = (ev) => {
      if (res.writableEnded) return
      if (ev.type !== 'status') sent++
      res.write(`data: ${JSON.stringify(ev)}\n\n`)
    }
    const abort = new AbortController()
    res.on('close', () => abort.abort())

    const basic = async () => {
      emit({ type: 'mode', ai: false })
      await runBasic(input, emit)
    }
    try {
      if (aiEnabled() && takeBudget()) {
        emit({ type: 'mode', ai: true })
        sent = 0
        try {
          await runAssistant(input, emit, abort.signal)
        } catch (err) {
          if (abort.signal.aborted) return
          console.error('assistant failed:', err.status ?? '', err.message)
          // Nothing said yet: answer in basic mode instead of leaving the person with an error.
          if (!sent) await basic()
          else emit({ type: 'error' })
        }
      } else {
        await basic()
      }
    } catch (err) {
      console.error('assistant (basic) failed:', err.message)
      emit({ type: 'error' })
    } finally {
      res.end()
    }
  }),
)

const ESTIMATE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['shows_water', 'level', 'confidence', 'reason'],
  properties: {
    shows_water: { type: 'boolean', description: 'The photo shows standing or flowing floodwater' },
    level: { type: 'integer', enum: [0, 1, 2, 3, 4, 5] },
    confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
    reason: TRI,
  },
}

/** Guess the water depth in a photo for the report form: a suggestion the person can change. */
assistantRoutes.post(
  '/assistant/estimate',
  rateLimit('estimate', 12, 10 * 60_000),
  route(async (req, res) => {
    const photo = typeof req.body?.photo === 'string' && req.body.photo.length < 2_000_000 ? req.body.photo.match(PHOTO_DATA)?.[1] : null
    if (!photo) throw new BadInput('photo')
    if (!aiAvailable()) return res.status(503).json({ error: 'ai_off' })
    const out = await askJson({
      system:
        'You estimate floodwater depth from a photo for a Thai flood map. Scale: 0 no flooding (under 10 cm), 1 ankle to mid-shin (10-30 cm), 2 knee (30-60 cm), 3 waist (60-100 cm), 4 chest (100-150 cm), 5 over head height (over 150 cm). Use people, cars (wheels about 60 cm), kerbs, doors, walls and fences for scale. Say what you used, in one short sentence per language. If you cannot tell, say so with low confidence.',
      content: [
        { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: photo } },
        { type: 'text', text: 'How deep is the water here?' },
      ],
      schema: ESTIMATE_SCHEMA,
      maxTokens: 400,
    }).catch((err) => {
      console.error('estimate failed:', err.message)
      return null
    })
    if (!out) return res.status(502).json({ error: 'ai_failed' })
    res.json(out)
  }),
)
