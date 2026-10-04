// What the public sends in: water level reports, lost and found, missing people, help requests, volunteer
// needs, and agencies asking for a command centre. Nothing here needs an account.
import express from 'express'
import { randomInt, randomUUID } from 'node:crypto'
import { existsSync, writeFileSync } from 'node:fs'
import { UPLOAD_DIR, all, get, run } from '../db.js'
import { isProvince } from '../feeds.js'
import { tokenHash, newToken } from '../lib/auth.js'
import { nearestTambon, provinceAt } from '../lib/geo.js'
import { BadInput, int, ipHash, lngLat, oneOf, rateLimit, route, sendJson, str } from '../lib/util.js'

export const community = express.Router()

/** Reports older than this (from the last "still flooded") drop off the map; the client fades them as they age. */
const REPORT_HOURS = 48
const TRENDS = ['rising', 'steady', 'falling']
const PASSABLE = ['car', 'high', 'boat']
const LOST_KINDS = ['lost', 'found']
const LOST_CATEGORIES = ['pet', 'livestock', 'document', 'valuables', 'phone', 'vehicle', 'other']
const VULNERABLE = ['elderly', 'children', 'disabled', 'sick', 'pregnant', 'bedridden']
const HELP_NEEDS = ['evacuate', 'food', 'water', 'medicine', 'medical']

const provinceParam = (v) => {
  if (!isProvince(v)) throw new BadInput('province')
  return v
}

/** Where a point is: province from the boundary, then the nearest sub-district for labels and area colours. */
function place(lng, lat) {
  const province = provinceAt(lng, lat)
  if (!province) throw new BadInput('location')
  return { province, ...nearestTambon(province, lng, lat) }
}

/** Photos arrive as JPEG data URLs, already shrunk and stripped of EXIF (incl. GPS) in the browser. */
function savePhoto(dataUrl) {
  if (!dataUrl) return null
  const m = typeof dataUrl === 'string' && dataUrl.match(/^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/)
  if (!m) throw new BadInput('photo')
  const buf = Buffer.from(m[1], 'base64')
  if (buf.length > 1_500_000 || buf[0] !== 0xff || buf[1] !== 0xd8) throw new BadInput('photo')
  const name = `${randomUUID()}.jpg`
  writeFileSync(`${UPLOAD_DIR}/${name}`, buf)
  return name
}

const commandCenter = (province) => get('SELECT active, name, hotline FROM command_centers WHERE province = ?', province)
const requireOpenCenter = (province) => {
  if (!commandCenter(province)?.active) throw new BadInput('command_center_closed')
}
const list = (v, field, options) => {
  if (v === undefined || v === null) return []
  if (!Array.isArray(v) || v.some((x) => !options.includes(x))) throw new BadInput(field)
  return [...new Set(v)]
}

// ---- Water level reports ---------------------------------------------------------------------------

const publicReport = (r) => ({
  id: r.id,
  createdAt: r.created_at,
  province: r.province,
  district: r.district,
  tambon: r.tambon,
  lat: r.lat,
  lng: r.lng,
  level: r.level,
  trend: r.trend,
  passable: r.passable,
  note: r.note,
  photo: r.photo ? `/api/photos/${r.photo}` : null,
  stillCount: r.still_count,
  recededCount: r.receded_count,
  lastStillAt: r.last_still_at,
  recededAt: r.receded_at,
})

community.get(
  '/reports',
  route(async (req, res) => {
    const since = Date.now() - REPORT_HOURS * 3600_000
    const rows = req.query.province
      ? all('SELECT * FROM reports WHERE hidden = 0 AND province = ? AND MAX(created_at, COALESCE(last_still_at, 0)) > ? ORDER BY created_at DESC', provinceParam(req.query.province), since)
      : all('SELECT * FROM reports WHERE hidden = 0 AND MAX(created_at, COALESCE(last_still_at, 0)) > ? ORDER BY created_at DESC LIMIT 5000', since)
    sendJson(req, res, rows.map(publicReport), { maxAge: 15 })
  }),
)

community.post(
  '/reports',
  rateLimit('report', 8, 10 * 60_000),
  route(async (req, res) => {
    const b = req.body ?? {}
    const [lng, lat] = lngLat(b.lng, b.lat)
    const where = place(lng, lat)
    const row = {
      id: randomUUID(),
      level: int(b.level, 'level', { min: 0, max: 5, required: true }),
      trend: oneOf(b.trend, 'trend', TRENDS),
      passable: oneOf(b.passable, 'passable', PASSABLE),
      note: str(b.note, 'note', { max: 280 }),
      photo: savePhoto(b.photo),
    }
    run(
      `INSERT INTO reports (id, created_at, province, district, tambon, lat, lng, level, trend, passable, note, photo, ip_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      row.id, Date.now(), where.province, where.district, where.tambon, lat, lng, row.level, row.trend, row.passable, row.note, row.photo, ipHash(req),
    )
    res.status(201).json(publicReport(get('SELECT * FROM reports WHERE id = ?', row.id)))
  }),
)

/** "Still flooded" keeps a report on the map; "water has gone down" marks it receded. One vote per person. */
community.post(
  '/reports/:id/vote',
  rateLimit('vote', 30, 10 * 60_000),
  route(async (req, res) => {
    const vote = oneOf(req.body?.vote, 'vote', ['still', 'receded'], { required: true })
    const report = get('SELECT id FROM reports WHERE id = ? AND hidden = 0', req.params.id)
    if (!report) return res.status(404).json({ error: 'not_found' })
    const voter = ipHash(req)
    if (get('SELECT 1 FROM report_votes WHERE report_id = ? AND ip_hash = ?', report.id, voter)) {
      return res.status(409).json({ error: 'already_voted' })
    }
    const now = Date.now()
    run('INSERT INTO report_votes (report_id, ip_hash, vote, created_at) VALUES (?, ?, ?, ?)', report.id, voter, vote, now)
    if (vote === 'still') run('UPDATE reports SET still_count = still_count + 1, last_still_at = ?, receded_at = NULL WHERE id = ?', now, report.id)
    else run('UPDATE reports SET receded_count = receded_count + 1, receded_at = ? WHERE id = ?', now, report.id)
    res.json(publicReport(get('SELECT * FROM reports WHERE id = ?', report.id)))
  }),
)

// ---- Lost and found ----------------------------------------------------------------------------------

const publicLost = (r) => ({
  id: r.id,
  createdAt: r.created_at,
  province: r.province,
  kind: r.kind,
  category: r.category,
  title: r.title,
  description: r.description,
  place: r.place,
  contact: r.contact,
  photo: r.photo ? `/api/photos/${r.photo}` : null,
  status: r.status,
})

community.get(
  '/lost-found',
  route(async (req, res) => {
    const rows = all('SELECT * FROM lost_found WHERE hidden = 0 AND province = ? ORDER BY created_at DESC LIMIT 500', provinceParam(req.query.province))
    sendJson(req, res, rows.map(publicLost), { maxAge: 15 })
  }),
)

community.post(
  '/lost-found',
  rateLimit('lost', 6, 30 * 60_000),
  route(async (req, res) => {
    const b = req.body ?? {}
    const { token, hash } = newToken()
    const id = randomUUID()
    run(
      `INSERT INTO lost_found (id, created_at, province, kind, category, title, description, place, contact, photo, token_hash, ip_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      Date.now(),
      provinceParam(b.province),
      oneOf(b.kind, 'kind', LOST_KINDS, { required: true }),
      oneOf(b.category, 'category', LOST_CATEGORIES, { required: true }),
      str(b.title, 'title', { max: 120, required: true }),
      str(b.description, 'description', { max: 1000 }),
      str(b.place, 'place', { max: 200 }),
      str(b.contact, 'contact', { max: 120, required: true }),
      savePhoto(b.photo),
      hash,
      ipHash(req),
    )
    // The token is shown once to the poster; with it they can mark the post resolved.
    res.status(201).json({ ...publicLost(get('SELECT * FROM lost_found WHERE id = ?', id)), token })
  }),
)

community.post(
  '/lost-found/:id/resolve',
  route(async (req, res) => {
    const row = get('SELECT id, token_hash FROM lost_found WHERE id = ?', req.params.id)
    if (!row || typeof req.body?.token !== 'string' || tokenHash(req.body.token) !== row.token_hash) {
      return res.status(403).json({ error: 'wrong_token' })
    }
    run("UPDATE lost_found SET status = 'resolved' WHERE id = ?", row.id)
    res.json({ ok: true })
  }),
)

// ---- Missing people (private) --------------------------------------------------------------------------

community.post(
  '/missing',
  rateLimit('missing', 5, 60 * 60_000),
  route(async (req, res) => {
    const b = req.body ?? {}
    const province = provinceParam(b.province)
    requireOpenCenter(province)
    const point = b.lat !== undefined && b.lat !== null ? lngLat(b.lng, b.lat) : [null, null]
    const now = Date.now()
    run(
      `INSERT INTO missing_persons (id, created_at, updated_at, province, name, age, description, last_seen_place, last_seen_at,
         lat, lng, reporter_name, reporter_phone, relation, ip_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      randomUUID(),
      now,
      now,
      province,
      str(b.name, 'name', { max: 120, required: true }),
      int(b.age, 'age', { min: 0, max: 120 }),
      str(b.description, 'description', { max: 1000 }),
      str(b.lastSeenPlace, 'lastSeenPlace', { max: 300 }),
      str(b.lastSeenAt, 'lastSeenAt', { max: 60 }),
      point[1],
      point[0],
      str(b.reporterName, 'reporterName', { max: 120, required: true }),
      str(b.reporterPhone, 'reporterPhone', { max: 40, required: true }),
      str(b.relation, 'relation', { max: 60 }),
      ipHash(req),
    )
    // Nothing comes back: the report is for the command centre only.
    res.status(201).json({ ok: true })
  }),
)

// ---- Help requests -------------------------------------------------------------------------------------

const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const helpCode = () => Array.from({ length: 6 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join('')

community.post(
  '/help',
  rateLimit('help', 5, 30 * 60_000),
  route(async (req, res) => {
    const b = req.body ?? {}
    const [lng, lat] = lngLat(b.lng, b.lat)
    const where = place(lng, lat)
    requireOpenCenter(where.province)
    let code = helpCode()
    while (get('SELECT 1 FROM help_requests WHERE code = ?', code)) code = helpCode()
    const now = Date.now()
    run(
      `INSERT INTO help_requests (id, code, created_at, updated_at, province, district, tambon, lat, lng, name, phone, people,
         vulnerable, needs, water_level, note, ip_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      randomUUID(),
      code,
      now,
      now,
      where.province,
      where.district,
      where.tambon,
      lat,
      lng,
      str(b.name, 'name', { max: 120 }),
      str(b.phone, 'phone', { max: 40, required: true }),
      int(b.people, 'people', { min: 1, max: 500, required: true }),
      JSON.stringify(list(b.vulnerable, 'vulnerable', VULNERABLE)),
      JSON.stringify(list(b.needs, 'needs', HELP_NEEDS)),
      int(b.waterLevel, 'waterLevel', { min: 0, max: 5 }),
      str(b.note, 'note', { max: 1000 }),
      ipHash(req),
    )
    res.status(201).json({ code, province: where.province })
  }),
)

/** Progress on a help request, for whoever holds its code. No personal details. */
community.get(
  '/help/:code',
  route(async (req, res) => {
    const r = get(
      `SELECT h.status, h.created_at, h.updated_at, h.province, t.name AS team, t.kind AS team_kind
       FROM help_requests h LEFT JOIN teams t ON t.id = h.team_id WHERE h.code = ?`,
      String(req.params.code).toUpperCase(),
    )
    if (!r) return res.status(404).json({ error: 'not_found' })
    sendJson(req, res, { status: r.status, createdAt: r.created_at, updatedAt: r.updated_at, province: r.province, team: r.team, teamKind: r.team_kind }, { maxAge: 0 })
  }),
)

// ---- Command centres, shelters, agency requests ------------------------------------------------------

community.get(
  '/command-center/:province',
  route(async (req, res) => sendJson(req, res, commandCenter(provinceParam(req.params.province)) ?? { active: 0 }, { maxAge: 30 })),
)

community.get(
  '/shelters',
  route(async (req, res) => {
    const rows = req.query.province
      ? all("SELECT * FROM shelters WHERE province = ? AND status != 'closed'", provinceParam(req.query.province))
      : all("SELECT * FROM shelters WHERE status != 'closed'")
    sendJson(req, res, rows, { maxAge: 30 })
  }),
)

community.post(
  '/open-request',
  rateLimit('open', 3, 60 * 60_000),
  route(async (req, res) => {
    const b = req.body ?? {}
    run(
      `INSERT INTO open_requests (id, created_at, province, name, position, phone, agency, line_id, details, ip_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      randomUUID(),
      Date.now(),
      provinceParam(b.province),
      str(b.name, 'name', { max: 120, required: true }),
      str(b.position, 'position', { max: 120 }),
      str(b.phone, 'phone', { max: 40, required: true }),
      str(b.agency, 'agency', { max: 200, required: true }),
      str(b.lineId, 'lineId', { max: 60 }),
      str(b.details, 'details', { max: 2000 }),
      ipHash(req),
    )
    res.status(201).json({ ok: true })
  }),
)

// ---- Volunteer needs -----------------------------------------------------------------------------------

community.get(
  '/needs',
  route(async (req, res) => {
    const rows = all("SELECT id, card, verified_at FROM needs WHERE status = 'verified' ORDER BY verified_at DESC")
    sendJson(req, res, rows.map((r) => ({ ...JSON.parse(r.card), id: r.id, verifiedAt: r.verified_at })), { maxAge: 30 })
  }),
)

community.post(
  '/needs',
  rateLimit('need', 5, 60 * 60_000),
  route(async (req, res) => {
    const b = req.body ?? {}
    const point = b.lat !== undefined && b.lat !== null ? lngLat(b.lng, b.lat) : null
    const province = point ? place(point[0], point[1]).province : provinceParam(b.province)
    run(
      'INSERT INTO needs (id, created_at, province, text, contact, lat, lng, ip_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      randomUUID(),
      Date.now(),
      province,
      str(b.text, 'text', { max: 3000, required: true }),
      str(b.contact, 'contact', { max: 120, required: true }),
      point ? point[1] : null,
      point ? point[0] : null,
      ipHash(req),
    )
    res.status(201).json({ ok: true })
  }),
)

// ---- Photos ----------------------------------------------------------------------------------------------

community.get('/photos/:file', (req, res) => {
  if (!/^[0-9a-f-]{36}\.jpg$/.test(req.params.file)) return res.status(404).end()
  const path = `${UPLOAD_DIR}/${req.params.file}`
  if (!existsSync(path)) return res.status(404).end()
  res.set('Cache-Control', 'public, max-age=86400, immutable')
  res.sendFile(path)
})
