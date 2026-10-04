// Small helpers shared by the server modules: outbound JSON fetches, a last-good cache, gzip responses,
// rate limiting and input checks. No dependencies beyond Node.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import https from 'node:https'
import { rootCertificates } from 'node:tls'
import { gzipSync } from 'node:zlib'

/** Thai sources report Bangkok local time without a zone, e.g. "2026-10-03 23:00". */
export const bangkokIso = (date, time) => `${date}T${time.length === 5 ? `${time}:00` : time}+07:00`
export const round2 = (x) => Math.round(x * 100) / 100
export const num = (x) => (x === null || x === undefined || x === '' || Number.isNaN(Number(x)) ? null : Number(x))

// air4thai.pcd.go.th serves the wrong intermediates for its Let's Encrypt certificate, so Node can't verify it
// on its own. We add the right ones (see the comment in the .pem) for that host only; verification stays on.
export const AIR4THAI_CA = [
  ...rootCertificates,
  readFileSync(new URL('../certs/air4thai-intermediates.pem', import.meta.url)),
]

/** GET (or POST) a URL and parse JSON. Rejects on non-200, bad JSON or after 30 s. */
export function fetchJson(url, { ca, method = 'GET', body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method,
        ca,
        timeout: 30_000,
        headers: { 'User-Agent': 'jaidee (Thailand flood information)', Accept: 'application/json', ...headers },
      },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume()
          return reject(new Error(`${url} answered ${res.statusCode}`))
        }
        let text = ''
        res.setEncoding('utf8')
        res.on('data', (chunk) => (text += chunk))
        res.on('end', () => {
          try {
            resolve(JSON.parse(text))
          } catch (err) {
            reject(err)
          }
        })
      },
    )
    req.on('timeout', () => req.destroy(new Error(`${url} timed out`)))
    req.on('error', reject)
    if (body) req.write(body)
    req.end()
  })
}

/**
 * A value loaded from outside, cached for `ttlMs`. `get()` refreshes when stale and keeps serving the last
 * good value if a refresh fails (retrying a minute later rather than on every request).
 */
export function cached(name, load, ttlMs = 10 * 60 * 1000) {
  const entry = { value: null, fetchedAt: 0, pending: null }
  return {
    async get() {
      if (Date.now() - entry.fetchedAt < ttlMs) return entry.value
      entry.pending ??= load()
        .then((value) => {
          entry.value = value
          entry.fetchedAt = Date.now()
        })
        .catch((err) => {
          console.error(`feed ${name} failed:`, err.message)
          entry.fetchedAt = Date.now() - ttlMs + 60_000
        })
        .finally(() => {
          entry.pending = null
        })
      await entry.pending
      return entry.value
    },
    /** The last good value without fetching (null if never loaded): for quick checks that must not wait on a feed. */
    peek() {
      return entry.value
    },
    /** When the cached value was fetched (ms), or 0. */
    get fetchedAt() {
      return entry.fetchedAt
    },
  }
}

/** JSON response, gzipped when the client takes it and it's worth it (station lists run to hundreds of kB). */
export function sendJson(req, res, data, { maxAge = 60 } = {}) {
  const text = JSON.stringify(data)
  res.set('Content-Type', 'application/json; charset=utf-8')
  res.set('Cache-Control', maxAge ? `public, max-age=${maxAge}` : 'no-store')
  res.set('Vary', 'Accept-Encoding')
  if (text.length > 2048 && /\bgzip\b/.test(req.headers['accept-encoding'] ?? '')) {
    res.set('Content-Encoding', 'gzip')
    return res.send(gzipSync(text))
  }
  res.send(text)
}

const SALT = process.env.IP_HASH_SALT || 'jaidee'
/** We never store IP addresses: only a salted hash, to rate-limit and to stop one person voting twice. */
export const ipHash = (req) => createHash('sha256').update(`${SALT}:${req.ip}`).digest('hex').slice(0, 32)

/** In-memory rate limit: at most `max` calls per `windowMs` per IP for a given key. */
export function rateLimit(key, max, windowMs) {
  const hits = new Map()
  return (req, res, next) => {
    const id = `${key}:${ipHash(req)}`
    const now = Date.now()
    const recent = (hits.get(id) ?? []).filter((t) => now - t < windowMs)
    if (recent.length >= max) return res.status(429).json({ error: 'too_many_requests' })
    recent.push(now)
    hits.set(id, recent)
    if (hits.size > 50_000) hits.clear() // crude bound on memory
    next()
  }
}

/** Input checks that throw a 400 with a field name the client can show. */
export class BadInput extends Error {
  constructor(field) {
    super(field)
    this.field = field
  }
}
export function str(v, field, { max = 500, required = false } = {}) {
  if (v === undefined || v === null || v === '') {
    if (required) throw new BadInput(field)
    return null
  }
  if (typeof v !== 'string') throw new BadInput(field)
  const s = v.trim()
  if (!s && required) throw new BadInput(field)
  if (s.length > max) throw new BadInput(field)
  return s || null
}
export function int(v, field, { min, max, required = false } = {}) {
  if (v === undefined || v === null || v === '') {
    if (required) throw new BadInput(field)
    return null
  }
  const n = Number(v)
  if (!Number.isInteger(n) || n < min || n > max) throw new BadInput(field)
  return n
}
export function oneOf(v, field, options, { required = false } = {}) {
  if (v === undefined || v === null || v === '') {
    if (required) throw new BadInput(field)
    return null
  }
  if (!options.includes(v)) throw new BadInput(field)
  return v
}
/** A point inside Thailand's bounding box. */
export function lngLat(lng, lat) {
  const x = Number(lng)
  const y = Number(lat)
  if (!(x >= 97.3 && x <= 105.7 && y >= 5.6 && y <= 20.5)) throw new BadInput('location')
  return [x, y]
}

/** Wrap an async route so thrown BadInput becomes a 400 and anything else a 500. */
export const route = (fn) => async (req, res) => {
  try {
    await fn(req, res)
  } catch (err) {
    if (err instanceof BadInput) return res.status(400).json({ error: 'bad_input', field: err.field })
    console.error(req.method, req.path, err)
    res.status(500).json({ error: 'server_error' })
  }
}
