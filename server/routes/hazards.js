// Multi-hazard routes: alerts, fire hotspots, earthquakes, flooded areas by satellite, PM2.5 forecast, and
// subscribing a browser to alerts.
import express from 'express'
import { run } from '../db.js'
import { isProvince } from '../feeds.js'
import { hazards, satFlood } from '../hazards.js'
import { HAZARDS, alerts, vapidPublicKey } from '../push.js'
import { BadInput, int, rateLimit, route, sendJson } from '../lib/util.js'

export const hazardRoutes = express.Router()

hazardRoutes.get(
  '/alerts',
  route(async (req, res) => {
    const list = (await alerts.get()) ?? []
    const p = req.query.province
    sendJson(req, res, p ? list.filter((a) => a.provinces.includes(String(p))) : list, { maxAge: 60 })
  }),
)

/** National hazard layers. Hotspots compact: [lng, lat, province, landuse, frp, at, country]. */
hazardRoutes.get(
  '/hazards',
  route(async (req, res) => {
    const [hotspots, quakes, satFloodCounts] = await Promise.all([hazards.hotspots.get(), hazards.quakes.get(), hazards.satFlood.get()])
    sendJson(req, res, {
      hotspots: (hotspots ?? []).map((h) => [h.lng, h.lat, h.province, h.landuse, h.frp, h.at, h.country]),
      quakes: quakes ?? [],
      satFlood: satFloodCounts ?? {},
    })
  }),
)

/** Flooded cells seen by satellite in a province (7 days): [lng, lat, flooded m²]. */
hazardRoutes.get(
  '/satflood/:code',
  route(async (req, res) => {
    if (!isProvince(req.params.code)) return res.status(404).json({ error: 'no_such_province' })
    sendJson(req, res, (await satFlood(req.params.code)) ?? [], { maxAge: 600 })
  }),
)

hazardRoutes.get('/push/key', (_req, res) => res.json({ key: vapidPublicKey }))

hazardRoutes.post(
  '/push/subscribe',
  rateLimit('push', 20, 60 * 60_000),
  route(async (req, res) => {
    const { subscription: s, provinces, hazards: hz, minLevel, lang } = req.body ?? {}
    if (!s || typeof s.endpoint !== 'string' || !/^https:\/\//.test(s.endpoint) || s.endpoint.length > 1000) throw new BadInput('subscription')
    if (!s.keys || typeof s.keys.p256dh !== 'string' || typeof s.keys.auth !== 'string') throw new BadInput('subscription')
    if (!Array.isArray(provinces) || !provinces.length || provinces.length > 77 || !provinces.every(isProvince)) throw new BadInput('provinces')
    if (!Array.isArray(hz) || !hz.length || !hz.every((h) => HAZARDS.includes(h))) throw new BadInput('hazards')
    run(
      `INSERT INTO push_subscriptions (endpoint, keys, provinces, hazards, min_level, lang, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET keys = excluded.keys, provinces = excluded.provinces, hazards = excluded.hazards,
         min_level = excluded.min_level, lang = excluded.lang`,
      s.endpoint,
      JSON.stringify({ p256dh: s.keys.p256dh, auth: s.keys.auth }),
      JSON.stringify([...new Set(provinces)]),
      JSON.stringify([...new Set(hz)]),
      int(minLevel, 'minLevel', { min: 1, max: 3 }) ?? 2,
      ['th', 'en', 'zh'].includes(lang) ? lang : 'th',
      Date.now(),
    )
    res.json({ ok: true })
  }),
)

hazardRoutes.post(
  '/push/unsubscribe',
  route(async (req, res) => {
    if (typeof req.body?.endpoint === 'string') run('DELETE FROM push_subscriptions WHERE endpoint = ?', req.body.endpoint)
    res.json({ ok: true })
  }),
)
