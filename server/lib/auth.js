// Staff accounts for command centres. Passwords are scrypt-hashed; sessions are random tokens kept as
// SHA-256 hashes, sent as an HttpOnly, SameSite=Strict cookie. Admins see every province; staff only theirs.
import { createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto'
import { get, run } from '../db.js'

const SESSION_DAYS = 14
const COOKIE = 'jd_session'
const sha = (s) => createHash('sha256').update(s).digest('hex')

export function hashPassword(password) {
  const salt = randomBytes(16)
  return `scrypt:${salt.toString('hex')}:${scryptSync(password, salt, 64).toString('hex')}`
}

function checkPassword(password, stored) {
  const [, salt, hash] = stored.split(':')
  const got = scryptSync(password, Buffer.from(salt, 'hex'), 64)
  return timingSafeEqual(got, Buffer.from(hash, 'hex'))
}

export function createStaff({ username, password, name, role, province }) {
  const id = randomUUID()
  run(
    'INSERT INTO staff (id, username, password_hash, name, role, province, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    id,
    username,
    hashPassword(password),
    name,
    role,
    role === 'admin' ? null : province,
    Date.now(),
  )
  return id
}

/** First run: create the admin from ADMIN_USERNAME / ADMIN_PASSWORD if there is no admin yet. */
export function bootstrapAdmin() {
  const { ADMIN_USERNAME: username, ADMIN_PASSWORD: password } = process.env
  if (get("SELECT id FROM staff WHERE role = 'admin'")) return
  if (!username || !password) {
    console.warn('No admin account. Set ADMIN_USERNAME and ADMIN_PASSWORD (12+ characters) in .env and restart.')
    return
  }
  if (password.length < 12) return console.warn('ADMIN_PASSWORD must be at least 12 characters.')
  createStaff({ username, password, name: 'Admin', role: 'admin', province: null })
  console.log(`Created admin account "${username}".`)
}

function cookieHeader(value, maxAgeSec) {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : ''
  return `${COOKIE}=${value}; Path=/api; HttpOnly; SameSite=Strict; Max-Age=${maxAgeSec}${secure}`
}

export function login(req, res) {
  const { username, password } = req.body ?? {}
  const staff = typeof username === 'string' ? get('SELECT * FROM staff WHERE username = ?', username) : null
  // Same work whether or not the user exists, so timing doesn't reveal usernames.
  const ok = staff ? checkPassword(String(password ?? ''), staff.password_hash) : (scryptSync('x', 'y', 64), false)
  if (!ok) return res.status(401).json({ error: 'wrong_login' })
  const token = randomBytes(32).toString('base64url')
  const now = Date.now()
  run('INSERT INTO sessions (token_hash, staff_id, created_at, expires_at) VALUES (?, ?, ?, ?)', sha(token), staff.id, now, now + SESSION_DAYS * 864e5)
  res.set('Set-Cookie', cookieHeader(token, SESSION_DAYS * 86400))
  res.json(publicStaff(staff))
}

/** Replace a one-time password (or any password) with the holder's own; signs out other sessions. */
export function changePassword(req, res) {
  const { current, next } = req.body ?? {}
  if (typeof next !== 'string' || next.length < 10 || next.length > 200) return res.status(400).json({ error: 'bad_input', field: 'next' })
  if (!checkPassword(String(current ?? ''), req.staff.password_hash)) return res.status(401).json({ error: 'wrong_login' })
  run('UPDATE staff SET password_hash = ? WHERE id = ?', hashPassword(next), req.staff.id)
  const token = readCookie(req)
  run('DELETE FROM sessions WHERE staff_id = ? AND token_hash != ?', req.staff.id, sha(token ?? ''))
  res.json({ ok: true })
}

export function logout(req, res) {
  const token = readCookie(req)
  if (token) run('DELETE FROM sessions WHERE token_hash = ?', sha(token))
  res.set('Set-Cookie', cookieHeader('', 0))
  res.json({ ok: true })
}

function readCookie(req) {
  const m = (req.headers.cookie ?? '').match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`))
  return m ? m[1] : null
}

export const publicStaff = (s) => ({ id: s.id, username: s.username, name: s.name, role: s.role, province: s.province })

/** Middleware: the signed-in staff member on req.staff, or 401. */
export function requireStaff(req, res, next) {
  const token = readCookie(req)
  const row = token
    ? get(
        'SELECT staff.* FROM sessions JOIN staff ON staff.id = sessions.staff_id WHERE token_hash = ? AND expires_at > ?',
        sha(token),
        Date.now(),
      )
    : null
  if (!row) return res.status(401).json({ error: 'not_signed_in' })
  req.staff = row
  next()
}

export function requireAdmin(req, res, next) {
  if (req.staff?.role !== 'admin') return res.status(403).json({ error: 'admins_only' })
  next()
}

/** Can this staff member act for the province? */
export const canAccess = (staff, province) => staff.role === 'admin' || staff.province === province

/** A random secret for capability links (team tracking), and its stored hash. */
export function newToken() {
  const token = randomBytes(24).toString('base64url')
  return { token, hash: sha(token) }
}
export const tokenHash = sha
