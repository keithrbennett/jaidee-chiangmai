// น้องใจดี, the assistant: Claude with tools over Jaidee's live data. It answers in the person's language,
// looks things up instead of guessing, gives one-tap buttons for what to do on the site, and drafts help
// requests (in Thai for staff) that the person checks and sends themselves.
//
// runAssistant streams events through `emit`:
//   { type: 'text', delta }            part of the reply
//   { type: 'status', tool, province } a lookup in progress (the app words it)
//   { type: 'buttons', buttons }       one-tap actions under the reply
//   { type: 'guide', topic }           a safety guide card under the reply
//   { type: 'draft', draft }           a help request to check and send
//   { type: 'report', draft }          a water report (level, note, the photo) to check and send
//   { type: 'source', url, title }     a web page the reply used
//   { type: 'done' }
import { get } from '../db.js'
import { MODEL, anthropic } from './claude.js'
import { provinceContacts } from '../contacts.js'
import { GUIDES, HOTLINES, TOPICS, bkk, findPlace, guideText, km, nationalSummary, nearbySummary, placeAt, provinceName, provinceSummary } from './context.js'

export const PAGES = ['home', 'map', 'alerts', 'provinces', 'guide', 'volunteer', 'simulator', 'province', 'province_map', 'weather', 'report', 'updates', 'help', 'missing', 'lost_found', 'cctv', 'area']
export const MAP_MODES = ['water', 'rain', 'air', 'fire', 'quake']
export const VULNERABLE = ['elderly', 'children', 'disabled', 'sick', 'pregnant', 'bedridden']
export const HELP_NEEDS = ['evacuate', 'food', 'water', 'medicine', 'medical']

const hotlineList = HOTLINES.map((n) => `${n} ${GUIDES.hotlines[n].en}`).join('; ')

const SYSTEM = `You are น้องใจดี (Nong Jaidee), the assistant inside Jaidee (ใจดี), a free public website for everyone in Thailand. The site brings together the country's hazard information: rivers against their banks, rain and radar, dust (PM2.5), fire hotspots from satellite, flooding seen by satellite, earthquakes and tsunami risk, reports and photos from the public, safety guides, emergency numbers, and in provinces that open a coordination centre, requests for rescue or supplies that staff act on.

Who you help: anyone, including older people, farmers, migrant workers and tourists. Many are worried or in a hurry. Be calm, warm and clear, in plain words, like a knowledgeable friend.

What you help with: anything people ask.
- Your speciality is hazards and safety in Thailand: floods, heavy rain, landslides, dust and smoke, wildfires, earthquakes, tsunamis, storms and heat; getting ready, what to do now, what to do after.
- And everything else too: everyday questions, health and first-aid basics, money and paperwork after a disaster (government compensation, insurance claims, replacing lost ID cards or documents), safe food and water, cleaning and repairs, writing or translating a message or letter, explaining the weather or science, school work, phones and apps, travel. When a question doesn't depend on today's data, answer from your own knowledge.

Language: reply in the language the person writes in, whatever it is (Thai, English, Chinese, Burmese, Shan, Karen, Lao, Khmer, Japanese, Korean …). If unsure, use the interface language given below. In Thai, call yourself "น้องใจดี" (never ผม, ดิฉัน or ฉัน) and speak politely with ค่ะ / นะคะ.

Safety first:
- If someone's life may be in danger now (trapped by water, water rising fast inside, someone injured, unconscious, not breathing, in labour, swept away, fire, a snake bite), start by telling them to call 1669 (medical emergency) or 1784 (disaster) or 191 (police), and show call buttons. Then help further.
- Never tell anyone to wade or drive through moving water.
- For health questions give sound first-aid and self-care basics, and say when to see a doctor; you can't examine anyone.

Facts and tools:
- Live data on the site: province_status, nearby, national_overview, find_place, emergency_contacts. Use them for current conditions and local phone numbers. Never guess numbers, levels, phone numbers or places. Say how old a reading is when it matters, and say plainly when data is missing.
- web_search (when available): for current things the site doesn't cover, such as news, official announcements, road or school closures, aid programmes, or a particular office's phone number. Prefer official Thai sources (go.th, or.th, the province's own pages) and say where the information comes from. Don't search for what you already know well.
- Jaidee's alerts come from its own rules on public data; they are not official warnings. Official warnings come from the Thai Meteorological Department (TMD), the Royal Irrigation Department (RID), DDPM, the National Disaster Warning Center (NDWC) and the Department of Mineral Resources (DMR).
- For "what should I do" questions about a hazard, call safety_guide and summarise the points that fit their situation; the app shows the full guide card under your reply, so don't repeat every step.
- For rumours ("the dam broke", "a big flood comes tonight"), check the data, say what it shows, and point to the official source. Don't spread or confirm what the data doesn't show.

Photos: the person may send a photo. Look carefully and say what matters: how deep the water looks and whether it is safe to walk or drive there; damage that needs an expert (cracked walls, sagging ceilings, wires in water); an animal (treat any snake as venomous); a document or sign to read or translate. If the photo shows flooding where they are now, offer to send it to the public map as a water report: call draft_report.

Using the site for them: when the person should do something (ask for help, report the water level, find a missing person, post a lost item, get alerts, look at a map or a guide, run the 3D flood simulator), call show_buttons so they can do it in one tap instead of describing where to click. Phone buttons may only use these hotlines: ${hotlineList}; or a number that province_status or emergency_contacts returned.

Help requests: when someone needs rescue, evacuation, food, water, medicine or medical care for themselves or others:
1. If it is life-threatening, give the emergency numbers first (see above).
2. Find out where (shared location, or village / sub-district / district), how many people, who is vulnerable (older, children, disabled, sick, pregnant, bedridden), what they need, how deep the water is, and a phone number. Ask at most two short questions at a time; don't hold up urgent cases for details.
3. Check the province with province_status (or nearby). If its coordination centre is open, call draft_help_request: the person reviews it and sends it themselves. Write note_th in clear Thai for the staff, translating faithfully if they wrote in another language, and keep their own words in note_original. If the centre is not open, say so and give the hotlines and local numbers (emergency_contacts) instead.

Privacy and scams: ask only for what a request needs. Never ask for ID numbers, bank details or passwords. Jaidee never charges money; warn people who are asked to pay for help or for a found item.

Style: short paragraphs and bullet points where they help; **bold** only for the key action; no headings, tables or emoji. Usually under 150 words; longer only when the question really needs it (a letter, a step-by-step explanation).

Water depth levels used on the site: 0 no flooding (under 10 cm), 1 ankle to mid-shin (10-30 cm), 2 knee (30-60), 3 waist (60-100), 4 chest (100-150), 5 over head height (over 150 cm).`

const TOOLS = [
  {
    name: 'find_place',
    description: 'Find a Thai province, district (amphoe/khet) or sub-district (tambon/khwaeng) by name, in Thai or English. Returns codes and coordinates. Use when the person names a place.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The place name as written, e.g. "หางดง", "Hat Yai", "ต.หนองแก๋ว"' },
        province: { type: 'string', description: 'Province code, if already known, to search within it' },
      },
      required: ['query'],
    },
  },
  {
    name: 'province_status',
    description:
      'Current conditions in one province from live public data: Jaidee alerts, river gauges against their banks, dams, rain measured and forecast, air quality and the PM2.5 outlook, fire hotspots, nearby earthquakes, flooding seen by satellite, whether the coordination centre takes help requests (and its hotline), open shelters, and recent public reports.',
    input_schema: { type: 'object', properties: { province: { type: 'string', description: 'Province code, e.g. "50" Chiang Mai, "10" Bangkok' } }, required: ['province'] },
  },
  {
    name: 'nearby',
    description: "The area around the person's shared location: the place name, nearest river gauges, rain, public reports within 3 km, the nearest open shelter, fire hotspots and satellite flooding nearby. Only when they have shared their location.",
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'emergency_contacts',
    description:
      "Who to call in a province: national lines that route to the local office, the province's coordination centre hotline, numbers its staff added, and the nearest hospitals, police and fire stations from OpenStreetMap (with phone numbers where mapped, and how far they are from the person's shared location or the province centre).",
    input_schema: {
      type: 'object',
      properties: {
        province: { type: 'string', description: 'Province code' },
        kind: { type: 'string', enum: ['hospital', 'police', 'fire', 'all'], description: 'Which places to list; default all' },
      },
      required: ['province'],
    },
  },
  {
    name: 'national_overview',
    description: 'Thailand as a whole: alert counts by hazard and level, the most serious alerts, rivers over their banks, the strongest recent earthquake, and which provinces have a coordination centre open.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'safety_guide',
    description: 'Jaidee\'s safety guide on a topic, summarised from Thai government advice, with hotlines. Topics: flood-before, flood-during, flood-after, electricity, go-bag, evacuate, care (older, bedridden, children, pets), health (leptospirosis, snakebite, diarrhoea, stress), landslide, pm25, wildfire, earthquake, tsunami, storm.',
    input_schema: { type: 'object', properties: { topic: { type: 'string', enum: TOPICS } }, required: ['topic'] },
  },
  {
    name: 'show_buttons',
    description:
      'Show up to 4 one-tap buttons under your reply: call a hotline, or open a page of the site. Pages: home, map (with a mode: water, rain, air, fire, quake), alerts (and alert sign-up), provinces, guide (with a topic), volunteer, simulator (Chiang Mai 3D flood simulator), and for a province: province (overview), province_map, weather (rain and dust), report (send a water level), updates (reports from people), help (ask for help), missing (report a missing person), lost_found, cctv, area (districts).',
    input_schema: {
      type: 'object',
      properties: {
        buttons: {
          type: 'array',
          maxItems: 4,
          items: {
            type: 'object',
            properties: {
              label: { type: 'string', description: "Short label in the person's language, at most 32 characters" },
              action: { type: 'string', enum: ['call', 'page'] },
              number: { type: 'string', description: 'For call: the phone number' },
              page: { type: 'string', enum: PAGES },
              province: { type: 'string', description: 'Province code, for province pages' },
              topic: { type: 'string', enum: TOPICS },
              mode: { type: 'string', enum: MAP_MODES },
            },
            required: ['label', 'action'],
          },
        },
      },
      required: ['buttons'],
    },
  },
  {
    name: 'draft_help_request',
    description:
      "Prepare a help request for a province's coordination centre (rescue, evacuation, food, water, medicine, medical care). The app shows it to the person to check, add their location if needed, and send. Only when the centre is open (see province_status).",
    input_schema: {
      type: 'object',
      properties: {
        province: { type: 'string', description: 'Province code' },
        people: { type: 'integer', description: 'How many people need help (1-500)' },
        vulnerable: { type: 'array', items: { type: 'string', enum: VULNERABLE } },
        needs: { type: 'array', items: { type: 'string', enum: HELP_NEEDS } },
        water_level: { type: 'integer', description: '0-5 on the site scale, if known' },
        phone: { type: 'string', description: 'Phone number to call back, if given' },
        name: { type: 'string', description: 'Their name, if given' },
        place: { type: 'string', description: 'Where, in words: village, road, landmark, sub-district' },
        note_th: { type: 'string', description: 'Clear Thai summary for the staff (translate if needed), at most 600 characters' },
        note_original: { type: 'string', description: "The person's own words if not in Thai, else empty" },
        language: { type: 'string', description: 'Language they wrote in, in English, e.g. "Burmese"' },
        use_shared_location: { type: 'boolean', description: 'True if their shared location is where help is needed' },
      },
      required: ['province', 'people', 'needs', 'note_th'],
    },
  },
  {
    name: 'draft_report',
    description:
      "Prepare a water-level report for the public map from what the person told you or the photo they sent: only for flooding where they are now or very recently. The app shows it with their photo and location for them to check and send.",
    input_schema: {
      type: 'object',
      properties: {
        level: { type: 'integer', description: '0-5 on the site scale (0 no flooding … 5 over head height)' },
        trend: { type: 'string', enum: ['rising', 'steady', 'falling'] },
        passable: { type: 'string', enum: ['car', 'high', 'boat'], description: 'car: cars can pass; high: only high vehicles; boat: boats only' },
        note: { type: 'string', description: "A short note for the map in the person's language, at most 200 characters" },
        use_photo: { type: 'boolean', description: 'True to attach the photo they sent' },
        confidence: { type: 'string', enum: ['high', 'medium', 'low'], description: 'How sure you are about the level' },
      },
      required: ['level'],
    },
  },
]

// Web search is a server tool (Anthropic runs it). If the organisation hasn't enabled it, the first request
// fails and we carry on without it.
let webSearch = process.env.AI_WEB_SEARCH !== '0'
const webSearchTool = (city) => ({
  type: 'web_search_20250305',
  name: 'web_search',
  max_uses: 3,
  user_location: { type: 'approximate', country: 'TH', timezone: 'Asia/Bangkok', ...(city ? { city } : {}) },
})

const centerOf = (code) => get('SELECT active, name, hotline FROM command_centers WHERE province = ?', code) ?? { active: 0, hotline: null }
const digits = (s) => String(s ?? '').replace(/[^\d+]/g, '')

/** Check the model's buttons: known pages and provinces, and only phone numbers we know. */
function cleanButtons(list, ctx) {
  const out = []
  for (const b of Array.isArray(list) ? list.slice(0, 4) : []) {
    const label = String(b.label ?? '').trim().slice(0, 40)
    if (!label) continue
    if (b.action === 'call') {
      const n = digits(b.number)
      const centerLines = [ctx.province, ...ctx.provincesSeen].filter(Boolean).map((c) => digits(centerOf(c).hotline)).filter(Boolean)
      // National hotlines, a coordination centre, or a number a tool returned (OSM places, staff-added numbers).
      if (HOTLINES.includes(n) || centerLines.includes(n) || ctx.extraNumbers.has(n)) out.push({ label, action: 'call', number: n })
    } else if (b.action === 'page' && PAGES.includes(b.page)) {
      const province = b.province && provinceName(b.province) ? b.province : null
      const needsProvince = !['home', 'map', 'alerts', 'provinces', 'guide', 'volunteer', 'simulator'].includes(b.page)
      const p = province ?? (needsProvince ? ctx.province ?? ctx.locationProvince : null)
      if (needsProvince && !p) continue
      out.push({
        label,
        action: 'page',
        page: b.page,
        ...(p ? { province: p } : {}),
        ...(TOPICS.includes(b.topic) ? { topic: b.topic } : {}),
        ...(MAP_MODES.includes(b.mode) ? { mode: b.mode } : {}),
      })
    }
  }
  return out
}

function cleanDraft(input, ctx) {
  const province = provinceName(input.province) ? input.province : null
  if (!province) return { error: 'Unknown province code. Use find_place first.' }
  const center = centerOf(province)
  const people = Math.min(500, Math.max(1, Math.round(Number(input.people) || 1)))
  const level = Number.isInteger(input.water_level) && input.water_level >= 0 && input.water_level <= 5 ? input.water_level : null
  const location = input.use_shared_location && ctx.location && ctx.locationProvince === province ? ctx.location : null
  const draft = {
    province,
    people,
    vulnerable: (input.vulnerable ?? []).filter((v) => VULNERABLE.includes(v)),
    needs: (input.needs ?? []).filter((v) => HELP_NEEDS.includes(v)),
    waterLevel: level,
    phone: input.phone ? String(input.phone).slice(0, 40) : null,
    name: input.name ? String(input.name).slice(0, 120) : null,
    place: input.place ? String(input.place).slice(0, 200) : null,
    noteTh: String(input.note_th ?? '').slice(0, 700),
    noteOriginal: input.note_original ? String(input.note_original).slice(0, 700) : null,
    language: input.language ? String(input.language).slice(0, 40) : null,
    location,
    centerOpen: !!center.active,
    hotline: center.hotline ?? null,
  }
  return { draft }
}

async function runTool(name, input, ctx, emit) {
  switch (name) {
    case 'find_place': {
      emit({ type: 'status', tool: name })
      const found = findPlace(input.query, input.province)
      for (const f of found) ctx.provincesSeen.add(f.province)
      return found.length ? found : { none: true, hint: 'No match. Ask the person for the province or a nearby district.' }
    }
    case 'province_status': {
      if (!provinceName(input.province)) return { error: 'Unknown province code. Use find_place first.' }
      ctx.provincesSeen.add(input.province)
      emit({ type: 'status', tool: name, province: input.province })
      return provinceSummary(input.province)
    }
    case 'nearby': {
      if (!ctx.location) return { error: 'The person has not shared their location. Ask where they are, or suggest the "use my location" button above the message box.' }
      emit({ type: 'status', tool: name })
      return nearbySummary(ctx.location[0], ctx.location[1])
    }
    case 'emergency_contacts': {
      if (!provinceName(input.province)) return { error: 'Unknown province code. Use find_place first.' }
      ctx.provincesSeen.add(input.province)
      emit({ type: 'status', tool: name })
      const c = await provinceContacts(input.province, { waitMs: 15_000 })
      const from = ctx.location && ctx.locationProvince === input.province ? ctx.location : provinceName(input.province).center
      const places = (c.places ?? [])
        .filter((p) => !input.kind || input.kind === 'all' || p.kind === input.kind)
        .map((p) => ({ kind: p.kind, name: p.th ?? p.en, name_en: p.en, phone: p.phone, emergency_room: p.emergency || undefined, km: Math.round(km(from, [p.lng, p.lat]) * 10) / 10 }))
        .sort((a, b) => a.km - b.km)
      for (const p of places) if (p.phone) ctx.extraNumbers.add(p.phone.replace(/[^\d+]/g, ''))
      for (const l of c.local) ctx.extraNumbers.add(l.phone.replace(/[^\d+]/g, ''))
      return {
        national: c.national.map((n) => `${n.number} ${n.kind}`),
        coordination_centre: c.centre,
        added_by_province_staff: c.local.map((l) => ({ name: l.name, phone: l.phone, kind: l.kind, note: l.note })),
        nearest_places: places.slice(0, 10),
        distances_from: ctx.location && ctx.locationProvince === input.province ? 'their shared location' : 'the province centre',
        note: c.places ? 'Places and their numbers come from OpenStreetMap: say they may be incomplete. Many have no number mapped.' : 'OpenStreetMap places are not loaded yet; give the national lines.',
      }
    }
    case 'national_overview':
      emit({ type: 'status', tool: name })
      return nationalSummary()
    case 'safety_guide': {
      const g = guideText(input.topic, ctx.lang)
      if (!g) return { error: 'Unknown topic' }
      ctx.guides.add(input.topic)
      emit({ type: 'guide', topic: input.topic })
      return g
    }
    case 'show_buttons': {
      const buttons = cleanButtons(input.buttons, ctx)
      if (buttons.length) emit({ type: 'buttons', buttons })
      return { shown: buttons.length, note: buttons.length < (input.buttons?.length ?? 0) ? 'Some buttons were dropped: unknown page, missing province, or a phone number that is not an approved hotline.' : undefined }
    }
    case 'draft_help_request': {
      emit({ type: 'status', tool: name })
      const { draft, error } = cleanDraft(input, ctx)
      if (error) return { error }
      emit({ type: 'draft', draft })
      return draft.centerOpen
        ? { shown: true, note: 'The person now sees the draft with a button to check and send it. Tell them briefly to check it and press send; mention that they can call the hotlines if it is urgent.' }
        : { shown: true, center_open: false, note: 'This province has no coordination centre open on Jaidee, so the request cannot be sent here. Give the hotlines instead (1784, 1669) and the province hotline if any.', hotline: draft.hotline }
    }
    case 'draft_report': {
      const level = Number.isInteger(input.level) && input.level >= 0 && input.level <= 5 ? input.level : null
      if (level === null) return { error: 'level must be 0-5' }
      const draft = {
        level,
        trend: ['rising', 'steady', 'falling'].includes(input.trend) ? input.trend : null,
        passable: ['car', 'high', 'boat'].includes(input.passable) ? input.passable : null,
        note: input.note ? String(input.note).slice(0, 280) : null,
        usePhoto: !!input.use_photo && ctx.hasImage,
        confidence: ['high', 'medium', 'low'].includes(input.confidence) ? input.confidence : null,
        location: ctx.location,
      }
      emit({ type: 'report', draft })
      return { shown: true, note: 'The person now sees the report with a button to check it, add their location if needed, and send it. Tell them briefly.' }
    }
    default:
      return { error: `Unknown tool ${name}` }
  }
}

const LANG_NAMES = { th: 'Thai', en: 'English', zh: 'Simplified Chinese' }

function contextBlock(ctx, page) {
  const lines = [`Now: ${bkk(Date.now())} Bangkok time.`, `Interface language: ${LANG_NAMES[ctx.lang] ?? 'Thai'} (${ctx.lang}).`]
  const p = ctx.province && provinceName(ctx.province)
  if (p) lines.push(`They are on the page of ${p.th} / ${p.en} (province code ${ctx.province})${page ? `, section "${page}"` : ''}. "Here" may mean this province.`)
  if (ctx.location) {
    const where = placeAt(ctx.location[0], ctx.location[1])
    lines.push(where ? `They shared their location: ${where.name_th} (${where.name_en}), province code ${where.province}. Use nearby for "my area" questions.` : 'They shared a location outside Thailand.')
  } else {
    lines.push('Location not shared. If they ask about their own area and no place is known, ask where they are or suggest the "use my location" button.')
  }
  return lines.join('\n')
}

/**
 * Turns from the browser → Claude messages: user first, roles alternating. Only the newest user turn may
 * carry a photo (a JPEG data URL); older photos aren't sent again.
 */
export function toMessages(turns) {
  const out = []
  for (const t of turns) {
    const role = t.role === 'assistant' ? 'assistant' : 'user'
    const text = String(t.text ?? '').trim()
    if (!text && !t.image) continue
    if (!out.length && role === 'assistant') continue
    const last = out[out.length - 1]
    if (last?.role === role) last.text += `\n\n${text}`
    else out.push({ role, text, image: null })
    if (t.image) out[out.length - 1].image = t.image
  }
  while (out.length && out[out.length - 1].role !== 'user') out.pop()
  return out.map((m, i) => {
    const image = i === out.length - 1 && m.image ? m.image.match(/^data:image\/jpeg;base64,(.+)$/)?.[1] : null
    const text = m.text || '(photo)'
    return image
      ? { role: m.role, content: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } }, { type: 'text', text }] }
      : { role: m.role, content: m.image ? `${text}\n[sent a photo]` : text }
  })
}

/**
 * One reply, streamed. `turns`: [{ role, text }], last one from the user. Throws if Claude can't be reached
 * before anything was said (the route then answers in basic mode).
 */
export async function runAssistant({ turns, lang, province, location, page }, emit, signal) {
  const ctx = {
    lang,
    province: province && provinceName(province) ? province : null,
    location,
    locationProvince: location ? placeAt(location[0], location[1])?.province ?? null : null,
    provincesSeen: new Set(),
    guides: new Set(),
    extraNumbers: new Set(),
    hasImage: !!turns[turns.length - 1]?.image,
  }
  if (ctx.locationProvince) ctx.provincesSeen.add(ctx.locationProvince)
  const messages = toMessages(turns)
  if (!messages.length) throw new Error('no question')
  const system = [
    { type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } },
    { type: 'text', text: contextBlock(ctx, page) },
  ]
  const city = provinceName(ctx.locationProvince ?? ctx.province ?? '')?.en ?? null
  const sources = new Set()
  let said = false
  for (let step = 0; step < 8; step++) {
    const tools = webSearch ? [...TOOLS, webSearchTool(city)] : TOOLS
    let stepText = false
    let msg
    try {
      const stream = anthropic().messages.stream({ model: MODEL, max_tokens: 2000, system, tools, messages }, { signal })
      stream.on('text', (delta) => {
        if (!stepText && said) emit({ type: 'text', delta: '\n\n' })
        stepText = true
        said = true
        emit({ type: 'text', delta })
      })
      stream.on('citation', (c) => {
        if (c.type === 'web_search_result_location' && c.url && !sources.has(c.url)) {
          sources.add(c.url)
          emit({ type: 'source', url: c.url, title: c.title ?? null })
        }
      })
      stream.on('streamEvent', (ev) => {
        if (ev.type === 'content_block_start' && ev.content_block.type === 'server_tool_use') emit({ type: 'status', tool: 'web_search' })
      })
      msg = await stream.finalMessage()
    } catch (err) {
      // Web search not enabled for this organisation (or not for this model): drop it and try the step again.
      if (webSearch && !stepText && err.status === 400 && /web_search|server tool|tool/i.test(err.message)) {
        console.error('web search unavailable, carrying on without it:', err.message)
        webSearch = false
        step--
        continue
      }
      throw err
    }
    messages.push({ role: 'assistant', content: msg.content })
    // A long server-side search can pause the turn; send it back as it is to let Claude carry on.
    if (msg.stop_reason === 'pause_turn') continue
    if (msg.stop_reason !== 'tool_use') break
    const results = []
    for (const block of msg.content) {
      if (block.type !== 'tool_use') continue
      let out
      try {
        out = await runTool(block.name, block.input ?? {}, ctx, emit)
      } catch (err) {
        console.error(`tool ${block.name} failed:`, err.message)
        out = { error: 'That lookup failed. Say the data is not available right now.' }
      }
      results.push({ type: 'tool_result', tool_use_id: block.id, content: JSON.stringify(out ?? null) })
    }
    messages.push({ role: 'user', content: results })
  }
  emit({ type: 'done' })
  return { said }
}
