// Claude for น้องใจดี: the chat assistant, checks on what the public sends, and translation. Needs
// ANTHROPIC_API_KEY on the server (it never reaches the browser). Without it everything still works on
// rules alone, and the chat runs in basic mode.
import Anthropic from '@anthropic-ai/sdk'

export const MODEL = process.env.CLAUDE_MODEL || 'claude-opus-5-5'
export const aiEnabled = () => !!process.env.ANTHROPIC_API_KEY

let client = null
/** The shared client. Tests can swap it with `setClient`. */
export const anthropic = () => (client ??= new Anthropic({ maxRetries: 2, timeout: 60_000 }))
export const setClient = (c) => {
  client = c
}

// A public service can't let a busy day run up an open-ended bill: past this many calls in a day (Bangkok
// time), the chat drops to basic mode and checks run on rules only until midnight.
const DAILY_LIMIT = Number(process.env.AI_DAILY_LIMIT ?? 3000)
const usage = { day: '', calls: 0 }
const today = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10)
/** Count one call; false when today's budget is spent. */
export function takeBudget() {
  if (usage.day !== today()) Object.assign(usage, { day: today(), calls: 0 })
  if (usage.calls >= DAILY_LIMIT) return false
  usage.calls++
  return true
}
export const aiAvailable = () => aiEnabled() && (usage.day !== today() || usage.calls < DAILY_LIMIT)

/**
 * One structured answer: Claude fills `schema` (JSON Schema) from `content` (text, or text and images).
 * Returns the parsed object, or throws.
 */
export async function askJson({ system, content, schema, maxTokens = 1024 }) {
  if (!takeBudget()) throw new Error('daily AI budget used up')
  const message = await anthropic().messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content }],
    output_config: { format: { type: 'json_schema', schema } },
  })
  const block = message.content.find((b) => b.type === 'text')
  if (!block) throw new Error('Claude returned no text')
  return JSON.parse(block.text)
}

/** Three short strings for the three interface languages. */
export const TRI = {
  type: 'object',
  additionalProperties: false,
  required: ['th', 'en', 'zh'],
  properties: {
    th: { type: 'string', description: 'Thai, at most 140 characters' },
    en: { type: 'string', description: 'English, at most 140 characters' },
    zh: { type: 'string', description: 'Simplified Chinese, at most 80 characters' },
  },
}
