// น้องใจดี checks what the public sends, so staff and readers can tell what is backed up:
//   - water reports, against gauges, rain, satellite flood and other reports nearby (and the photo, with AI)
//   - lost-and-found posts, for scams (asking for transfers, short links) and ID numbers
//   - help requests: how urgent, a one-line summary, and a Thai translation for staff
//   - missing-person reports: a Thai translation; volunteer needs: a draft card and a scam check
// Rules run first and alone when there is no API key, so the site never depends on the model. The model
// never deletes anything: at most it holds a post for staff to look at (hidden = 2).
import { existsSync, readFileSync } from 'node:fs'
import { UPLOAD_DIR, all, get, run } from '../db.js'
import { feeds } from '../feeds.js'
import { hazards, satFlood } from '../hazards.js'
import { alerts } from '../push.js'
import { MODEL, TRI, aiAvailable, askJson } from './claude.js'
import { bkk, km, levelName, placeAt, stationStatus, within } from './context.js'

// ---- Storage --------------------------------------------------------------------------------------------------

function save(kind, id, { verdict, score = null, summary = null, details = null, translation = null, byAi = false }) {
  run(
    `INSERT INTO ai_checks (kind, ref_id, verdict, score, summary, details, translation, by_ai, checked_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(kind, ref_id) DO UPDATE SET verdict = excluded.verdict, score = excluded.score, summary = excluded.summary,
       details = excluded.details, translation = COALESCE(excluded.translation, ai_checks.translation), by_ai = excluded.by_ai,
       checked_at = excluded.checked_at`,
    kind,
    id,
    verdict,
    score,
    summary && JSON.stringify(summary),
    details && JSON.stringify(details),
    translation && JSON.stringify(translation),
    byAi ? 1 : 0,
    Date.now(),
  )
}

const parse = (s) => (s ? JSON.parse(s) : null)
/** A check as staff see it. */
export const staffCheck = (row) =>
  row && { verdict: row.verdict, score: row.score, summary: parse(row.summary), details: parse(row.details), translation: parse(row.translation), byAi: !!row.by_ai, checkedAt: row.checked_at }
/** A check as the public sees it: the verdict and one neutral sentence. */
export const publicCheck = (row) => row && { verdict: row.verdict, reason: parse(row.summary), ai: !!row.by_ai }

/** Checks of one kind for some ids: Map(id → row). */
export function checksFor(kind, ids) {
  if (!ids.length) return new Map()
  const rows = []
  for (let i = 0; i < ids.length; i += 500) {
    const part = ids.slice(i, i + 500)
    rows.push(...all(`SELECT * FROM ai_checks WHERE kind = ? AND ref_id IN (${part.map(() => '?').join(',')})`, kind, ...part))
  }
  return new Map(rows.map((r) => [r.ref_id, r]))
}

// ---- Queue ----------------------------------------------------------------------------------------------------

const queue = []
let running = 0
/** Check something soon, in the background. Two at a time; the same item is never queued twice. */
export function scheduleCheck(kind, id) {
  if (queue.some((q) => q.kind === kind && q.id === id)) return
  queue.push({ kind, id })
  pump()
}
function pump() {
  while (running < 2 && queue.length) {
    const job = queue.shift()
    running++
    runCheck(job.kind, job.id)
      .catch((err) => console.error(`check ${job.kind} failed:`, err.message))
      .finally(() => {
        running--
        pump()
      })
  }
}

export async function runCheck(kind, id) {
  if (kind === 'report') return checkReport(id)
  if (kind === 'lost') return checkLost(id)
  if (kind === 'help') return checkHelp(id)
  if (kind === 'missing') return checkMissing(id)
  if (kind === 'need') return checkNeed(id)
}

/** After a restart, check what came in during the last two days and wasn't checked yet. */
export function startChecks() {
  const since = Date.now() - 48 * 3600_000
  for (const [kind, table] of [
    ['report', 'reports'],
    ['lost', 'lost_found'],
    ['help', 'help_requests'],
    ['missing', 'missing_persons'],
    ['need', 'needs'],
  ]) {
    for (const r of all(`SELECT t.id FROM ${table} t LEFT JOIN ai_checks c ON c.kind = ? AND c.ref_id = t.id WHERE t.created_at > ? AND c.ref_id IS NULL`, kind, since)) {
      scheduleCheck(kind, r.id)
    }
  }
}

/** The model's part of a check: skipped (null) without a key, past the day's budget, or on error. */
async function maybeAi(label, fn) {
  if (!aiAvailable()) return null
  try {
    return await fn()
  } catch (err) {
    console.error(`AI ${label} failed:`, err.message)
    return null
  }
}

const THAI = /[฀-๿]/g
/** Mostly Thai script (or empty): no translation needed. */
const isThai = (text) => {
  const t = String(text ?? '').replace(/[\s\d\p{P}\p{S}]/gu, '')
  return !t || (t.match(THAI)?.length ?? 0) / t.length > 0.5
}

function photoBlock(photo) {
  if (!photo) return null
  const path = `${UPLOAD_DIR}/${photo}`
  if (!existsSync(path)) return null
  return { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: readFileSync(path).toString('base64') } }
}

// ---- Water reports ----------------------------------------------------------------------------------------------

/** What the measurements around a report say: gauges, rain, satellite, other reports, votes, alerts. */
async function reportEvidence(r) {
  const here = [r.lng, r.lat]
  const [stations, rain, satCounts, alertList] = await within(
    Promise.all([feeds.stations.get(), feeds.rain.get(), hazards.satFlood.get(), alerts.get()]),
    20_000,
    [feeds.stations.peek(), feeds.rain.peek(), hazards.satFlood.peek(), alerts.peek()],
  )
  const gauges = (stations ?? [])
    .map((s) => ({ s, d: km(here, [s.lng, s.lat]) }))
    .filter((x) => x.d <= 10)
    .sort((a, b) => a.d - b.d)
    .slice(0, 3)
    .map(({ s, d }) => ({ name: s.name, river: s.river, status: stationStatus(s), over: s.over, pct: s.pct === null ? null : Math.round(s.pct), trend: s.trend, km: Math.round(d * 10) / 10, measured: bkk(s.observedAt) }))
  const rainNear = (rain ?? []).filter((x) => x[2] !== null && km(here, [x[0], x[1]]) <= 15)
  let satCells = null
  if (satCounts?.[r.province]) {
    const cells = await within(satFlood(r.province), 25_000)
    if (cells) satCells = cells.filter((c) => km(here, [c[0], c[1]]) <= 1).length
  }
  const others = all(
    'SELECT level, created_at, lat, lng FROM reports WHERE id != ? AND hidden = 0 AND created_at BETWEEN ? AND ? AND lat BETWEEN ? AND ? AND lng BETWEEN ? AND ?',
    r.id,
    r.created_at - 12 * 3600_000,
    r.created_at + 12 * 3600_000,
    r.lat - 0.01,
    r.lat + 0.01,
    r.lng - 0.011,
    r.lng + 0.011,
  ).filter((o) => km(here, [o.lng, o.lat]) <= 1)
  return {
    gauges,
    rainMax24h: rainNear.length ? Math.max(...rainNear.map((x) => x[2])) : null,
    rainGauges: rainNear.length,
    satCellsWithin1km: satCells,
    otherReports: { count: others.length, wet: others.filter((o) => o.level >= 1).length, maxLevel: others.length ? Math.max(...others.map((o) => o.level)) : null },
    votes: { still: r.still_count, receded: r.receded_count },
    floodAlertInProvince: (alertList ?? []).some((a) => (a.hazard === 'flood' || a.hazard === 'rain') && a.provinces.includes(r.province)),
  }
}

// Short public sentences, in the three interface languages.
const SAY = {
  gauge: (g) => ({ th: `สถานีวัดน้ำห่าง ${g.km} กม. ${g.status === 'over' ? 'ล้นตลิ่ง' : 'น้ำมาก'}`, en: `Gauge ${g.km} km away is ${g.status === 'over' ? 'over its bank' : 'running high'}`, zh: `${g.km} 公里外的水位站${g.status === 'over' ? '已漫堤' : '水位偏高'}` }),
  sat: (n) => ({ th: 'ดาวเทียมพบน้ำท่วมในรัศมี 1 กม.', en: `Satellite sees flooding within 1 km (${n} cells)`, zh: '卫星在 1 公里内发现洪水' }),
  rain: (mm) => ({ th: `ฝนแถวนี้ ${Math.round(mm)} มม. ใน 24 ชม.`, en: `${Math.round(mm)} mm of rain nearby in 24 h`, zh: `附近 24 小时降雨 ${Math.round(mm)} 毫米` }),
  others: (n) => ({ th: `มีรายงานอื่นใกล้ ๆ ${n} รายการ`, en: `${n} other report${n > 1 ? 's' : ''} nearby`, zh: `附近另有 ${n} 条报告` }),
  votes: (n) => ({ th: `${n} คนยืนยันว่ายังท่วม`, en: `${n} people confirm it's still flooded`, zh: `${n} 人确认仍有积水` }),
  calm: () => ({ th: 'สถานีวัดน้ำและฝนแถวนี้ยังปกติ และยังไม่มีรายงานอื่นยืนยัน', en: 'Gauges and rain nearby are normal and no one else has reported it yet', zh: '附近水位和降雨正常，暂无其他报告' }),
  none: () => ({ th: 'ยังไม่มีข้อมูลรอบข้างยืนยัน', en: 'Nothing nearby confirms it yet', zh: '附近暂无数据可以证实' }),
  dry: () => ({ th: 'ไม่พบสัญญาณน้ำท่วมรอบข้าง', en: 'No signs of flooding nearby', zh: '附近没有洪水迹象' }),
}
const join = (parts) => ({ th: parts.map((p) => p.th).join(' · '), en: parts.map((p) => p.en).join(' · '), zh: parts.map((p) => p.zh).join(' · ') })

/** Rules: support from measurements and people, or strong signs against. Rivers alone never sink a report. */
export function judgeReport(r, e) {
  const reasons = []
  let support = 0
  const wet = e.gauges.find((g) => g.status === 'over' || g.status === 'high')
  if (wet) {
    support += wet.km <= 5 ? 2 : 1
    reasons.push(SAY.gauge(wet))
  }
  if (e.satCellsWithin1km) {
    support += e.satCellsWithin1km >= 3 ? 2 : 1
    reasons.push(SAY.sat(e.satCellsWithin1km))
  }
  if (e.rainMax24h !== null && e.rainMax24h >= (r.level <= 1 ? 10 : 35)) {
    support += e.rainMax24h >= 90 ? 2 : 1
    reasons.push(SAY.rain(e.rainMax24h))
  }
  if (e.otherReports.wet) {
    support += e.otherReports.wet >= 2 ? 2 : 1
    reasons.push(SAY.others(e.otherReports.wet))
  }
  if (e.votes.still >= 2) {
    support += 1
    reasons.push(SAY.votes(e.votes.still))
  }
  if (r.level === 0) return { verdict: 'consistent', support, summary: SAY.dry() }
  const calmRivers = e.gauges.length > 0 && e.gauges.every((g) => ['normal', 'low', 'veryLow'].includes(g.status))
  const quiet = (e.rainMax24h ?? 0) < 10 && !e.satCellsWithin1km && !e.otherReports.wet && !e.floodAlertInProvince && e.votes.still === 0
  if (support >= 2) return { verdict: 'consistent', support, summary: join(reasons.slice(0, 2)) }
  if (r.level >= 2 && calmRivers && quiet) return { verdict: 'inconsistent', support, summary: SAY.calm() }
  return { verdict: 'unclear', support, summary: reasons.length ? join(reasons.slice(0, 2)) : SAY.none() }
}

const REPORT_SYSTEM = `You help the moderators of Jaidee (ใจดี), a Thai public flood information site, check water-level reports sent in by the public.
You get the report (the depth the person picked, trend, whether vehicles can pass, their note, when and where) and evidence from around the spot: nearest river gauges and their status against the bank, rain gauges, flooding seen by radar satellite in the last 7 days, other reports within 1 km, and "still flooded" votes. There may be a photo.
Decide:
- consistent: the evidence or the photo supports the report.
- unclear: not enough to say either way. This is the usual answer when little is known.
- inconsistent: there is clear evidence against it, e.g. the photo shows a dry street for a deep-flood report, or deep flooding is reported where rivers are low, no rain fell and nobody else reports anything.
Streets can flood from blocked drains and local downpours while rivers stay normal, so normal rivers alone never make a report inconsistent.
For a photo: does it show floodwater; does the depth fit the level (people, cars, kerbs and walls give scale); does it look like a screenshot, a news or stock image, or clearly from another place or season (watermarks, captions, UI overlays)?
Flags (for staff review, not for the public): abusive (insults, hate, sexual content), spam (ads, unrelated content), personal_info (ID card or document numbers, a private person's phone number or home address with their name). Faces of people at a flood are normal and are not personal_info.
Never accuse anyone. The public reason is one neutral sentence about what the data shows, not about the reporter.`

const REPORT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['verdict', 'confidence', 'photo', 'flags', 'public_reason', 'staff_note'],
  properties: {
    verdict: { type: 'string', enum: ['consistent', 'unclear', 'inconsistent'] },
    confidence: { type: 'number', description: '0 to 1' },
    photo: {
      type: 'object',
      additionalProperties: false,
      required: ['shows_water', 'matches_level', 'looks_reused'],
      properties: {
        shows_water: { type: 'string', enum: ['yes', 'no', 'unclear', 'no_photo'] },
        matches_level: { type: 'string', enum: ['yes', 'no', 'unclear', 'no_photo'] },
        looks_reused: { type: 'string', enum: ['yes', 'no', 'unclear', 'no_photo'] },
      },
    },
    flags: {
      type: 'object',
      additionalProperties: false,
      required: ['abusive', 'spam', 'personal_info'],
      properties: { abusive: { type: 'boolean' }, spam: { type: 'boolean' }, personal_info: { type: 'boolean' } },
    },
    public_reason: TRI,
    staff_note: { type: 'string', description: 'Thai, for staff: what you checked and why, at most 300 characters' },
  },
}

const TRENDS = { rising: 'rising', steady: 'steady', falling: 'falling' }
const PASSABLE = { car: 'cars can pass', high: 'only high vehicles', boat: 'boats only' }

async function checkReport(id) {
  const r = get('SELECT * FROM reports WHERE id = ?', id)
  if (!r) return
  const evidence = await reportEvidence(r)
  const rules = judgeReport(r, evidence)
  save('report', id, { verdict: rules.verdict, score: rules.support, summary: rules.summary, details: { evidence } })

  const ai = await maybeAi('report', () => {
    const where = placeAt(r.lng, r.lat)
    const photo = photoBlock(r.photo)
    const text = [
      `Report: ${levelName(r.level)} (level ${r.level} of 0-5).`,
      r.trend && `Trend: ${TRENDS[r.trend]}.`,
      r.passable && `Vehicles: ${PASSABLE[r.passable]}.`,
      r.note && `Note from the reporter: """${r.note}"""`,
      `Sent: ${bkk(r.created_at)} Bangkok time, at ${where?.name_en ?? `${r.lat}, ${r.lng}`}.`,
      `Evidence: ${JSON.stringify(evidence)}`,
      `Rules-only verdict: ${rules.verdict}.`,
      photo ? 'The photo they attached follows.' : 'No photo.',
    ]
      .filter(Boolean)
      .join('\n')
    return askJson({ system: REPORT_SYSTEM, content: photo ? [{ type: 'text', text }, photo] : text, schema: REPORT_SCHEMA, maxTokens: 900 })
  })
  if (!ai) return
  const verdict = ai.photo.looks_reused === 'yes' && ai.confidence >= 0.7 ? 'inconsistent' : ai.verdict
  save('report', id, { verdict, score: ai.confidence, summary: ai.public_reason, details: { evidence, rules: rules.verdict, ai, model: MODEL }, byAi: true })
  if (ai.flags.abusive || ai.flags.spam || ai.flags.personal_info) run('UPDATE reports SET hidden = 2 WHERE id = ? AND hidden = 0', id)
}

// ---- Lost and found -----------------------------------------------------------------------------------------------

// Common scam patterns on Thai lost-and-found boards: fees before handing over, transfers, short links.
const MONEY = /(โอนเงิน|โอนมา|โอนก่อน|มัดจำ|ค่าเสียเวลา|ค่าส่ง|ค่าดำเนินการ|ค่าไถ่|ค่าตอบแทนก่อน|พร้อมเพย์|promptpay|transfer|deposit|fee|western union|bitcoin|usdt|crypto|转账|定金|手续费|汇款)/i
const SHORT_LINK = /(bit\.ly|tinyurl|cutt\.ly|shorturl|goo\.gl|is\.gd|rebrand\.ly|s\.id\/|t\.co\/)/i
const BANK_ACCOUNT = /\b\d{3}-\d-\d{5}-\d\b/
const THAI_ID = /\b\d[- ]?\d{4}[- ]?\d{5}[- ]?\d{2}[- ]?\d\b/

const CAUTION = {
  money: { th: 'ระวัง: โพสต์นี้พูดถึงการโอนเงิน ใจดีไม่มีการเก็บเงิน อย่าโอนก่อนได้เห็นของจริง', en: 'Careful: this post mentions paying money. Jaidee never charges; never pay before you see the item.', zh: '注意：此帖提到付款。Jaidee 从不收费；见到实物前不要付款。' },
  link: { th: 'ระวัง: โพสต์นี้มีลิงก์ย่อ อย่ากดลิงก์หรือกรอกข้อมูลส่วนตัว', en: 'Careful: this post has a short link. Do not open it or enter personal details.', zh: '注意：此帖含短链接。不要点击或填写个人信息。' },
}

const LOST_SYSTEM = `You help the moderators of Jaidee, a Thai public site, screen lost-and-found posts made during floods for scams and privacy problems.
Scams on Thai boards: asking for a transfer, fee, deposit or "reward first" before returning something; pretending to have found a pet or phone to get money; short links or links to fake login pages; pressure to move to private chat to pay.
Hold a post for staff (hold = true) only for: a Thai ID number or a full document number, a private person's home address with their name, insults or sexual content.
Write the public warning only when the risk is medium or high; otherwise use empty strings.`
const LOST_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['risk', 'hold', 'public_warning', 'staff_note'],
  properties: {
    risk: { type: 'string', enum: ['low', 'medium', 'high'] },
    hold: { type: 'boolean' },
    public_warning: TRI,
    staff_note: { type: 'string', description: 'Thai, for staff, at most 200 characters' },
  },
}

async function checkLost(id) {
  const p = get('SELECT * FROM lost_found WHERE id = ?', id)
  if (!p) return
  const text = [p.title, p.description, p.place, p.contact].filter(Boolean).join('\n')
  const flags = { money: MONEY.test(text) || BANK_ACCOUNT.test(text), link: SHORT_LINK.test(text), idNumber: THAI_ID.test(text) }
  const verdict = flags.idNumber ? 'hold' : flags.money || flags.link ? 'caution' : 'ok'
  const summary = flags.money ? CAUTION.money : flags.link ? CAUTION.link : null
  save('lost', id, { verdict, summary, details: { flags } })
  if (verdict === 'hold') run('UPDATE lost_found SET hidden = 2 WHERE id = ? AND hidden = 0', id)

  const ai = await maybeAi('lost-found', () =>
    askJson({
      system: LOST_SYSTEM,
      content: `Post (${p.kind}, category ${p.category}):\nTitle: ${p.title}\nDescription: ${p.description ?? ''}\nPlace: ${p.place ?? ''}\nContact: ${p.contact}\nRule flags: ${JSON.stringify(flags)}`,
      schema: LOST_SCHEMA,
      maxTokens: 600,
    }),
  )
  if (!ai) return
  const aiVerdict = ai.hold || verdict === 'hold' ? 'hold' : ai.risk !== 'low' || verdict === 'caution' ? 'caution' : 'ok'
  const aiSummary = ai.risk !== 'low' && ai.public_warning.th ? ai.public_warning : summary
  save('lost', id, { verdict: aiVerdict, summary: aiSummary, details: { flags, ai, model: MODEL }, byAi: true })
  if (aiVerdict === 'hold') run('UPDATE lost_found SET hidden = 2 WHERE id = ? AND hidden = 0', id)
}

// ---- Help requests --------------------------------------------------------------------------------------------------

const URGENT_WORDS =
  /(ติดอยู่|ติดค้าง|จมน้ำ|หมดสติ|ไม่หายใจ|หายใจไม่ออก|เลือดออก|ชัก|จะคลอด|เจ็บท้อง|ขึ้นหลังคา|บนหลังคา|trapped|drown|unconscious|not breathing|can't breathe|bleeding|in labou?r|on the roof|被困|溺水|昏迷|出血|屋顶)/i
const VULN_TH = { elderly: 'ผู้สูงอายุ', children: 'เด็ก', disabled: 'คนพิการ', sick: 'ผู้ป่วย', pregnant: 'คนท้อง', bedridden: 'ผู้ป่วยติดเตียง' }
const NEED_TH = { evacuate: 'อพยพ', food: 'อาหาร', water: 'น้ำดื่ม', medicine: 'ยา', medical: 'การรักษา' }

/** Urgency 1-3 from the form alone: who is there, what they need, how deep, and alarm words in the note. */
export function helpUrgency(h) {
  const v = JSON.parse(h.vulnerable)
  const n = JSON.parse(h.needs)
  const depth = h.water_level ?? 0
  if (n.includes('medical') || depth >= 4 || URGENT_WORDS.test(h.note ?? '')) return 3
  if (v.some((x) => ['bedridden', 'sick', 'pregnant', 'disabled'].includes(x)) && (n.includes('evacuate') || depth >= 3)) return 3
  if (n.includes('evacuate') || v.length || depth >= 2) return 2
  return 1
}

const HELP_SYSTEM = `You help the dispatchers of a provincial disaster coordination centre in Thailand triage help requests.
Urgency: 3 = life at risk now or soon (trapped, water at chest height or rising inside with people who can't move, medical emergency, labour, someone missing in water); 2 = needs evacuation or care today (older people, children, sick or disabled people, water at knee or waist height, no food or water); 1 = supplies can wait a day.
Write summary_th as one line a dispatcher reads at a glance, in Thai.
The note may be in any language (Thai, Burmese, Shan, Karen, Lao, Khmer, Chinese, English …). If it is not Thai, translate it faithfully into Thai and English; keep names, numbers and places exactly. If it is Thai, leave note_th and note_en empty.`
const HELP_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['urgency', 'reason_th', 'summary_th', 'language', 'language_th', 'is_thai', 'note_th', 'note_en'],
  properties: {
    urgency: { type: 'integer', enum: [1, 2, 3] },
    reason_th: { type: 'string', description: 'Why this urgency, Thai, at most 120 characters' },
    summary_th: { type: 'string', description: 'One line for the dispatcher, Thai, at most 160 characters' },
    language: { type: 'string', description: 'Language of the note in English, e.g. "Burmese", or "none" if there is no note' },
    language_th: { type: 'string', description: 'The same in Thai, e.g. "ภาษาพม่า"' },
    is_thai: { type: 'boolean' },
    note_th: { type: 'string' },
    note_en: { type: 'string' },
  },
}

async function checkHelp(id) {
  const h = get('SELECT * FROM help_requests WHERE id = ?', id)
  if (!h) return
  const rules = helpUrgency(h)
  const v = JSON.parse(h.vulnerable)
  const n = JSON.parse(h.needs)
  const line = [`${h.people} คน`, v.length && v.map((x) => VULN_TH[x]).join(' '), n.length && `ต้องการ${n.map((x) => NEED_TH[x]).join(' ')}`].filter(Boolean).join(' · ')
  save('help', id, { verdict: String(rules), score: rules, summary: { th: line, en: '', zh: '' }, details: { rules } })

  const ai = await maybeAi('help', () =>
    askJson({
      system: HELP_SYSTEM,
      content: `People: ${h.people}. Vulnerable: ${v.join(', ') || 'none'}. Needs: ${n.join(', ') || 'not given'}. Water: ${h.water_level === null ? 'not given' : levelName(h.water_level)}.\nNote: """${h.note ?? ''}"""\nRules-only urgency: ${rules}.`,
      schema: HELP_SCHEMA,
      maxTokens: 900,
    }),
  )
  if (!ai) return
  // The model may raise urgency but never lower what the form itself says.
  const urgency = Math.max(rules, ai.urgency)
  const translation = !ai.is_thai && h.note && ai.note_th ? { language: ai.language, languageTh: ai.language_th, th: ai.note_th, en: ai.note_en } : null
  save('help', id, { verdict: String(urgency), score: urgency, summary: { th: ai.summary_th, en: '', zh: '' }, details: { rules, ai, model: MODEL }, translation, byAi: true })
}

// ---- Missing people (staff only) ------------------------------------------------------------------------------------

const MISSING_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['language', 'language_th', 'description_th', 'place_th', 'description_en'],
  properties: {
    language: { type: 'string' },
    language_th: { type: 'string' },
    description_th: { type: 'string' },
    place_th: { type: 'string' },
    description_en: { type: 'string' },
  },
}

async function checkMissing(id) {
  const p = get('SELECT * FROM missing_persons WHERE id = ?', id)
  if (!p) return
  const text = [p.description, p.last_seen_place].filter(Boolean).join('\n')
  if (isThai(text)) return save('missing', id, { verdict: 'ok' })
  const ai = await maybeAi('missing', () =>
    askJson({
      system: 'Translate a missing-person report for Thai rescue staff. Keep names, ages, clothing, numbers and places exactly. Translate into Thai, and the description into English.',
      content: `Description: """${p.description ?? ''}"""\nLast seen at: """${p.last_seen_place ?? ''}"""`,
      schema: MISSING_SCHEMA,
      maxTokens: 900,
    }),
  )
  save('missing', id, {
    verdict: 'ok',
    translation: ai && { language: ai.language, languageTh: ai.language_th, th: [ai.description_th, ai.place_th && `พบครั้งสุดท้าย: ${ai.place_th}`].filter(Boolean).join('\n'), en: ai.description_en },
    byAi: !!ai,
  })
}

// ---- Volunteer needs ----------------------------------------------------------------------------------------------------

export const NEED_CATEGORIES = ['flood', 'haze', 'school', 'temple', 'animals', 'elderly', 'environment']
const NEED_SYSTEM = `You help staff of a Thai disaster coordination centre check volunteer requests posted by the public, and draft the card volunteers will see.
Caution when the post asks volunteers for money, deposits or transfers, collects personal data, or looks like an advert or a scam.
Draft the card from the post only; never invent details. If the time or number of volunteers is missing, leave "when" empty and pick a modest guess (2 hours, 4 people). Write title and description in Thai, plain and friendly. Leave out children's names and private phone numbers.`
const NEED_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['verdict', 'caution_th', 'title', 'description', 'category', 'urgent', 'place', 'partner', 'when', 'hours', 'spots', 'skills'],
  properties: {
    verdict: { type: 'string', enum: ['ok', 'caution'] },
    caution_th: { type: 'string', description: 'Why caution, Thai; empty when ok' },
    title: { type: 'string', description: 'Thai, action first, at most 60 characters' },
    description: { type: 'string', description: 'Thai, 1-3 sentences' },
    category: { type: 'string', enum: NEED_CATEGORIES },
    urgent: { type: 'boolean' },
    place: { type: 'string' },
    partner: { type: 'string', description: 'The school, temple, community or agency asking, if named' },
    when: { type: 'string', description: 'When, as written, e.g. "เสาร์ 12 ต.ค. 09:00–12:00"' },
    hours: { type: 'number' },
    spots: { type: 'integer' },
    skills: { type: 'string', description: 'Comma-separated, Thai' },
  },
}

async function checkNeed(id) {
  const n = get('SELECT * FROM needs WHERE id = ?', id)
  if (!n) return
  const money = MONEY.test(n.text) || BANK_ACCOUNT.test(n.text)
  save('need', id, { verdict: money ? 'caution' : 'ok', summary: money ? { th: 'โพสต์นี้พูดถึงการโอนเงิน ตรวจให้ดีก่อนเผยแพร่', en: '', zh: '' } : null, details: { money } })
  const ai = await maybeAi('need', () => askJson({ system: NEED_SYSTEM, content: `Post: """${n.text}"""\nContact: ${n.contact}`, schema: NEED_SCHEMA, maxTokens: 900 }))
  if (!ai) return
  const { verdict, caution_th, ...draft } = ai
  const v = money || verdict === 'caution' ? 'caution' : 'ok'
  save('need', id, { verdict: v, summary: v === 'caution' ? { th: caution_th || 'โพสต์นี้พูดถึงการโอนเงิน ตรวจให้ดีก่อนเผยแพร่', en: '', zh: '' } : null, details: { money, draft, model: MODEL }, byAi: true })
}
