// Command centre API for agency staff: help requests, rescue teams and their live location, missing people,
// shelters, volunteer-need checks, report moderation; and for admins, accounts and agency requests.
import express from 'express'
import { randomBytes, randomUUID } from 'node:crypto'
import { all, get, run } from '../db.js'
import { isProvince } from '../feeds.js'
import { canAccess, changePassword, createStaff, login, logout, newToken, publicStaff, requireAdmin, requireStaff, tokenHash } from '../lib/auth.js'
import { BadInput, int, lngLat, oneOf, rateLimit, route, sendJson, str } from '../lib/util.js'

export const command = express.Router()

const HELP_STATUS = ['new', 'assigned', 'on_the_way', 'done', 'cancelled']
const TEAM_KINDS = ['boat', 'truck', 'medical', 'volunteer']
const TEAM_STATUS = ['available', 'busy', 'offline']
const MISSING_STATUS = ['open', 'found', 'closed']
const SHELTER_STATUS = ['open', 'full', 'closed']
const NEED_STATUS = ['pending', 'verified', 'rejected', 'closed']
const NEED_CATEGORIES = ['flood', 'haze', 'school', 'temple', 'animals', 'elderly', 'environment']

command.post('/staff/login', rateLimit('login', 10, 15 * 60_000), route(login))
command.post('/staff/logout', route(logout))
command.get('/staff/me', requireStaff, (req, res) => res.json(publicStaff(req.staff)))
command.post('/staff/password', requireStaff, rateLimit('password', 10, 15 * 60_000), route(changePassword))

/** The province a request is about, checked against what the staff member may see. */
function provinceFor(req, value) {
  if (!isProvince(value)) throw new BadInput('province')
  if (!canAccess(req.staff, value)) throw new Forbidden()
  return value
}
class Forbidden extends Error {}
const staffRoute = (fn) =>
  route(async (req, res) => {
    try {
      await fn(req, res)
    } catch (err) {
      if (err instanceof Forbidden) return res.status(403).json({ error: 'other_province' })
      throw err
    }
  })

/** Load a row and check the staff member's province. */
function owned(req, table, id) {
  const row = get(`SELECT * FROM ${table} WHERE id = ?`, id)
  if (!row) return null
  if (!canAccess(req.staff, row.province)) throw new Forbidden()
  return row
}

// Everything a province's dashboard shows, in one call.
command.get(
  '/staff/overview',
  requireStaff,
  staffRoute(async (req, res) => {
    const p = provinceFor(req, String(req.query.province ?? req.staff.province ?? ''))
    const dayAgo = Date.now() - 864e5
    sendJson(
      req,
      res,
      {
        province: p,
        commandCenter: get('SELECT * FROM command_centers WHERE province = ?', p) ?? { province: p, active: 0 },
        help: all(
          `SELECT * FROM help_requests WHERE province = ? AND (status IN ('new','assigned','on_the_way') OR updated_at > ?)
           ORDER BY CASE status WHEN 'new' THEN 0 WHEN 'assigned' THEN 1 WHEN 'on_the_way' THEN 2 ELSE 3 END, created_at`,
          p,
          dayAgo,
        ).map((h) => ({ ...h, vulnerable: JSON.parse(h.vulnerable), needs: JSON.parse(h.needs) })),
        teams: all('SELECT id, province, name, kind, phone, status, lat, lng, located_at, created_at FROM teams WHERE province = ? ORDER BY name', p),
        missing: all("SELECT * FROM missing_persons WHERE province = ? AND (status = 'open' OR updated_at > ?) ORDER BY created_at DESC", p, dayAgo),
        shelters: all('SELECT * FROM shelters WHERE province = ? ORDER BY name', p),
        needs: all("SELECT * FROM needs WHERE province = ? AND status = 'pending' ORDER BY created_at", p),
        reports: all('SELECT * FROM reports WHERE province = ? AND created_at > ? ORDER BY created_at DESC LIMIT 500', p, Date.now() - 36 * 3600_000),
      },
      { maxAge: 0 },
    )
  }),
)

command.put(
  '/staff/command-center/:province',
  requireStaff,
  staffRoute(async (req, res) => {
    const p = provinceFor(req, req.params.province)
    const b = req.body ?? {}
    const active = b.active ? 1 : 0
    const now = Date.now()
    const prev = get('SELECT * FROM command_centers WHERE province = ?', p)
    run(
      `INSERT INTO command_centers (province, active, name, hotline, opened_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(province) DO UPDATE SET active = excluded.active, name = excluded.name, hotline = excluded.hotline,
         opened_at = excluded.opened_at, updated_at = excluded.updated_at`,
      p,
      active,
      str(b.name, 'name', { max: 120 }),
      str(b.hotline, 'hotline', { max: 40 }),
      active ? (prev?.active ? prev.opened_at : now) : prev?.opened_at ?? null,
      now,
    )
    res.json(get('SELECT * FROM command_centers WHERE province = ?', p))
  }),
)

command.patch(
  '/staff/help/:id',
  requireStaff,
  staffRoute(async (req, res) => {
    const row = owned(req, 'help_requests', req.params.id)
    if (!row) return res.status(404).json({ error: 'not_found' })
    const b = req.body ?? {}
    const status = oneOf(b.status, 'status', HELP_STATUS) ?? row.status
    let team = row.team_id
    if (b.teamId !== undefined) {
      team = b.teamId === null ? null : get('SELECT id FROM teams WHERE id = ? AND province = ?', b.teamId, row.province)?.id
      if (b.teamId !== null && !team) throw new BadInput('teamId')
    }
    const note = b.staffNote !== undefined ? str(b.staffNote, 'staffNote', { max: 1000 }) : row.staff_note
    run('UPDATE help_requests SET status = ?, team_id = ?, staff_note = ?, updated_at = ? WHERE id = ?', status, team, note, Date.now(), row.id)
    // A team sent on a job is busy; finishing frees it unless it has another open job.
    if (team && ['assigned', 'on_the_way'].includes(status)) run("UPDATE teams SET status = 'busy' WHERE id = ?", team)
    if (team && ['done', 'cancelled'].includes(status)) {
      const open = get("SELECT 1 FROM help_requests WHERE team_id = ? AND status IN ('assigned','on_the_way')", team)
      if (!open) run("UPDATE teams SET status = 'available' WHERE id = ? AND status = 'busy'", team)
    }
    res.json({ ok: true })
  }),
)

// ---- Teams and live location ----------------------------------------------------------------------------

command.post(
  '/staff/teams',
  requireStaff,
  staffRoute(async (req, res) => {
    const b = req.body ?? {}
    const id = randomUUID()
    const { token, hash } = newToken()
    run(
      'INSERT INTO teams (id, province, name, kind, phone, track_token_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      id,
      provinceFor(req, b.province),
      str(b.name, 'name', { max: 80, required: true }),
      oneOf(b.kind, 'kind', TEAM_KINDS, { required: true }),
      str(b.phone, 'phone', { max: 40 }),
      hash,
      Date.now(),
    )
    // The tracking link is shown once; opening it on the team's phone shares that phone's location.
    res.status(201).json({ id, trackToken: token })
  }),
)

command.patch(
  '/staff/teams/:id',
  requireStaff,
  staffRoute(async (req, res) => {
    const row = owned(req, 'teams', req.params.id)
    if (!row) return res.status(404).json({ error: 'not_found' })
    const b = req.body ?? {}
    run(
      'UPDATE teams SET name = ?, kind = ?, phone = ?, status = ? WHERE id = ?',
      str(b.name, 'name', { max: 80 }) ?? row.name,
      oneOf(b.kind, 'kind', TEAM_KINDS) ?? row.kind,
      b.phone !== undefined ? str(b.phone, 'phone', { max: 40 }) : row.phone,
      oneOf(b.status, 'status', TEAM_STATUS) ?? row.status,
      row.id,
    )
    res.json({ ok: true })
  }),
)

command.post(
  '/staff/teams/:id/link',
  requireStaff,
  staffRoute(async (req, res) => {
    const row = owned(req, 'teams', req.params.id)
    if (!row) return res.status(404).json({ error: 'not_found' })
    const { token, hash } = newToken()
    run('UPDATE teams SET track_token_hash = ? WHERE id = ?', hash, row.id)
    res.json({ trackToken: token })
  }),
)

command.delete(
  '/staff/teams/:id',
  requireStaff,
  staffRoute(async (req, res) => {
    const row = owned(req, 'teams', req.params.id)
    if (!row) return res.status(404).json({ error: 'not_found' })
    run('UPDATE help_requests SET team_id = NULL WHERE team_id = ?', row.id)
    run('DELETE FROM teams WHERE id = ?', row.id)
    res.json({ ok: true })
  }),
)

/** The team's phone: who am I tracking for, and post my position. The link itself is the credential. */
command.get(
  '/track/:token',
  route(async (req, res) => {
    const t = get('SELECT name, kind, province FROM teams WHERE track_token_hash = ?', tokenHash(req.params.token))
    if (!t) return res.status(404).json({ error: 'not_found' })
    sendJson(req, res, t, { maxAge: 0 })
  }),
)
command.post(
  '/track/:token',
  rateLimit('track', 120, 10 * 60_000),
  route(async (req, res) => {
    const t = get('SELECT id FROM teams WHERE track_token_hash = ?', tokenHash(req.params.token))
    if (!t) return res.status(404).json({ error: 'not_found' })
    const [lng, lat] = lngLat(req.body?.lng, req.body?.lat)
    run('UPDATE teams SET lat = ?, lng = ?, located_at = ? WHERE id = ?', lat, lng, Date.now(), t.id)
    res.json({ ok: true })
  }),
)

// ---- Missing people, shelters, needs, reports ------------------------------------------------------------

command.patch(
  '/staff/missing/:id',
  requireStaff,
  staffRoute(async (req, res) => {
    const row = owned(req, 'missing_persons', req.params.id)
    if (!row) return res.status(404).json({ error: 'not_found' })
    const b = req.body ?? {}
    run(
      'UPDATE missing_persons SET status = ?, staff_note = ?, updated_at = ? WHERE id = ?',
      oneOf(b.status, 'status', MISSING_STATUS) ?? row.status,
      b.staffNote !== undefined ? str(b.staffNote, 'staffNote', { max: 1000 }) : row.staff_note,
      Date.now(),
      row.id,
    )
    res.json({ ok: true })
  }),
)

function shelterFields(b, prev = {}) {
  const [lng, lat] = b.lat !== undefined ? lngLat(b.lng, b.lat) : [prev.lng, prev.lat]
  return {
    name: str(b.name, 'name', { max: 120, required: !prev.name }) ?? prev.name,
    lat,
    lng,
    capacity: b.capacity !== undefined ? int(b.capacity, 'capacity', { min: 0, max: 100000 }) : prev.capacity,
    occupancy: b.occupancy !== undefined ? int(b.occupancy, 'occupancy', { min: 0, max: 100000 }) : prev.occupancy,
    contact: b.contact !== undefined ? str(b.contact, 'contact', { max: 120 }) : prev.contact,
    status: oneOf(b.status, 'status', SHELTER_STATUS) ?? prev.status ?? 'open',
    note: b.note !== undefined ? str(b.note, 'note', { max: 500 }) : prev.note,
  }
}

command.post(
  '/staff/shelters',
  requireStaff,
  staffRoute(async (req, res) => {
    const province = provinceFor(req, req.body?.province)
    const s = shelterFields(req.body ?? {})
    const id = randomUUID()
    run(
      'INSERT INTO shelters (id, province, name, lat, lng, capacity, occupancy, contact, status, note, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      id, province, s.name, s.lat, s.lng, s.capacity, s.occupancy, s.contact, s.status, s.note, Date.now(),
    )
    res.status(201).json({ id })
  }),
)

command.patch(
  '/staff/shelters/:id',
  requireStaff,
  staffRoute(async (req, res) => {
    const row = owned(req, 'shelters', req.params.id)
    if (!row) return res.status(404).json({ error: 'not_found' })
    const s = shelterFields(req.body ?? {}, row)
    run(
      'UPDATE shelters SET name = ?, lat = ?, lng = ?, capacity = ?, occupancy = ?, contact = ?, status = ?, note = ?, updated_at = ? WHERE id = ?',
      s.name, s.lat, s.lng, s.capacity, s.occupancy, s.contact, s.status, s.note, Date.now(), row.id,
    )
    res.json({ ok: true })
  }),
)

/** Check a posted volunteer need: publish it with a need card, or reject it. */
command.patch(
  '/staff/needs/:id',
  requireStaff,
  staffRoute(async (req, res) => {
    const row = owned(req, 'needs', req.params.id)
    if (!row) return res.status(404).json({ error: 'not_found' })
    const b = req.body ?? {}
    const status = oneOf(b.status, 'status', NEED_STATUS, { required: true })
    let card = row.card
    if (status === 'verified') {
      const c = b.card ?? {}
      const [lng, lat] = lngLat(c.lng ?? row.lng, c.lat ?? row.lat)
      card = JSON.stringify({
        title: str(c.title, 'title', { max: 120, required: true }),
        description: str(c.description, 'description', { max: 2000, required: true }),
        category: oneOf(c.category, 'category', NEED_CATEGORIES, { required: true }),
        urgent: !!c.urgent,
        place: str(c.place, 'place', { max: 200, required: true }),
        partner: str(c.partner, 'partner', { max: 120, required: true }),
        contact: str(c.contact, 'contact', { max: 120 }) ?? row.contact,
        when: str(c.when, 'when', { max: 120, required: true }),
        hours: Number(c.hours) > 0 && Number(c.hours) <= 24 ? Number(c.hours) : 2,
        spots: int(c.spots, 'spots', { min: 1, max: 500, required: true }),
        skills: Array.isArray(c.skills) ? c.skills.filter((x) => typeof x === 'string').slice(0, 5).map((x) => x.slice(0, 40)) : [],
        province: row.province,
        lat,
        lng,
        verifiedBy: req.staff.name,
      })
    }
    run('UPDATE needs SET status = ?, card = ?, verified_by = ?, verified_at = ? WHERE id = ?', status, card, req.staff.id, Date.now(), row.id)
    res.json({ ok: true })
  }),
)

command.patch(
  '/staff/reports/:id',
  requireStaff,
  staffRoute(async (req, res) => {
    const row = owned(req, 'reports', req.params.id)
    if (!row) return res.status(404).json({ error: 'not_found' })
    run('UPDATE reports SET hidden = ? WHERE id = ?', req.body?.hidden ? 1 : 0, row.id)
    res.json({ ok: true })
  }),
)

// ---- Admin: accounts and agency requests ----------------------------------------------------------------

command.get(
  '/staff/admin',
  requireStaff,
  requireAdmin,
  route(async (req, res) =>
    sendJson(
      req,
      res,
      {
        staff: all('SELECT id, username, name, role, province, created_at FROM staff ORDER BY role, province, username'),
        openRequests: all('SELECT * FROM open_requests ORDER BY created_at DESC LIMIT 200'),
        commandCenters: all('SELECT * FROM command_centers ORDER BY province'),
      },
      { maxAge: 0 },
    ),
  ),
)

command.post(
  '/staff/accounts',
  requireStaff,
  requireAdmin,
  route(async (req, res) => {
    const b = req.body ?? {}
    const role = oneOf(b.role, 'role', ['admin', 'staff'], { required: true })
    const province = role === 'staff' ? (isProvince(b.province) ? b.province : (() => { throw new BadInput('province') })()) : null
    const username = str(b.username, 'username', { max: 40, required: true })
    if (!/^[a-z0-9._-]{3,40}$/i.test(username)) throw new BadInput('username')
    if (get('SELECT 1 FROM staff WHERE username = ?', username)) return res.status(409).json({ error: 'username_taken' })
    // A one-time password the admin passes on; the account holder should change it.
    const password = randomBytes(12).toString('base64url')
    createStaff({ username, password, name: str(b.name, 'name', { max: 120, required: true }), role, province })
    res.status(201).json({ username, password })
  }),
)

command.patch(
  '/staff/open-requests/:id',
  requireStaff,
  requireAdmin,
  route(async (req, res) => {
    const status = oneOf(req.body?.status, 'status', ['new', 'approved', 'declined'], { required: true })
    run('UPDATE open_requests SET status = ? WHERE id = ?', status, req.params.id)
    res.json({ ok: true })
  }),
)
