// Live data routes: national overview, a province's picture, rain, air, CCTV, and the flood simulator's feed.
import express from 'express'
import http from 'node:http'
import https from 'node:https'
import { all, get } from '../db.js'
import { feeds, isProvince } from '../feeds.js'
import { hazards } from '../hazards.js'
import { provinceContacts } from '../contacts.js'
import { alerts } from '../push.js'
import { PROVINCES } from '../lib/geo.js'
import { route, sendJson } from '../lib/util.js'

export const data = express.Router()

/** Who to call in a province (server/contacts.js). The OSM part can take a while the first time. */
data.get(
  '/contacts/:code',
  route(async (req, res) => {
    if (!isProvince(req.params.code)) return res.status(404).json({ error: 'no_such_province' })
    sendJson(req, res, await provinceContacts(req.params.code), { maxAge: 300 })
  }),
)

const inProvince = (code) => (x) => x.province === code
const PROVINCE_CENTER = new Map(PROVINCES.map((p) => [p.code, p.center]))
const km = (a, b) => {
  const k = Math.cos(((a[1] + b[1]) / 2) * (Math.PI / 180))
  return Math.hypot((a[0] - b[0]) * k, a[1] - b[1]) * 111.2
}

data.get(
  '/national',
  route(async (req, res) => {
    const [stations, national] = await Promise.all([feeds.stations.get(), feeds.national.get()])
    const active = all('SELECT province, name, hotline FROM command_centers WHERE active = 1')
    sendJson(req, res, {
      stations: stations ?? [],
      dams: national?.dams ?? [],
      storms: national?.storms ?? [],
      commandCenters: active,
      updatedAt: feeds.stations.fetchedAt || null,
    })
  }),
)

/** All rain gauges, compact: [lng, lat, rain24h, rain1h, province, name, agency, observedAt]. */
data.get(
  '/rain',
  route(async (req, res) => sendJson(req, res, (await feeds.rain.get()) ?? [])),
)

data.get(
  '/air',
  route(async (req, res) => sendJson(req, res, (await feeds.air.get()) ?? [])),
)

data.get(
  '/province/:code',
  route(async (req, res) => {
    const code = req.params.code
    if (!isProvince(code)) return res.status(404).json({ error: 'no_such_province' })
    const [stations, rain, national, air, forecast, cctv, hotspots, quakes, satFloodCounts, airForecast, alertList] = await Promise.all([
      feeds.stations.get(),
      feeds.rain.get(),
      feeds.national.get(),
      feeds.air.get(),
      feeds.forecast.get(),
      feeds.cctv.get(),
      hazards.hotspots.get(),
      hazards.quakes.get(),
      hazards.satFlood.get(),
      hazards.airForecast.get(),
      alerts.get(),
    ])
    const p = PROVINCE_CENTER.get(code)
    sendJson(req, res, {
      alerts: (alertList ?? []).filter((a) => a.provinces.includes(code)),
      hotspots: (hotspots ?? []).filter(inProvince(code)).map((h) => [h.lng, h.lat, h.province, h.landuse, h.frp, h.at, h.country]),
      // Earthquakes in the last 7 days within 1,000 km of the province centre.
      quakes: (quakes ?? []).filter((q) => km(p, [q.lng, q.lat]) <= 1000).map((q) => ({ ...q, distance: Math.round(km(p, [q.lng, q.lat])) })),
      satFloodCells: satFloodCounts?.[code] ?? 0,
      airForecast: airForecast?.[code] ?? null,
      stations: (stations ?? []).filter(inProvince(code)),
      rain: (rain ?? []).filter((r) => r[4] === code),
      dams: (national?.dams ?? []).filter(inProvince(code)),
      air: (air ?? []).filter(inProvince(code)),
      forecast: forecast?.[code] ?? null,
      cctv: (cctv ?? []).filter(inProvince(code)).map(publicCamera),
      commandCenter: get('SELECT active, name, hotline FROM command_centers WHERE province = ?', code) ?? { active: 0 },
      shelters: all('SELECT id, name, lat, lng, capacity, occupancy, contact, status, note, updated_at FROM shelters WHERE province = ? AND status != ?', code, 'closed'),
    })
  }),
)

// Cameras: still images go through our proxy (most agency cameras are plain http, which a https page can't
// load); the rest link to the agency's own viewer.
const publicCamera = (c) => ({ ...c, url: c.kind === 'link' ? c.url : `/api/cctv/${c.id}/image` })

data.get(
  '/cctv',
  route(async (req, res) => sendJson(req, res, ((await feeds.cctv.get()) ?? []).map(publicCamera), { maxAge: 600 })),
)

const MAX_IMAGE = 3 * 1024 * 1024

/** Belt and braces: even a listed camera may not point into private networks. */
function isPublicHost(url) {
  try {
    const { hostname, protocol } = new URL(url)
    if (!/^https?:$/.test(protocol)) return false
    return !/^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.|\[?::1\]?$|\[?f[cd])/i.test(hostname)
  } catch {
    return false
  }
}
data.get(
  '/cctv/:id/image',
  route(async (req, res) => {
    // Only cameras on the list, never an arbitrary URL: this must not become an open proxy.
    const cam = ((await feeds.cctv.get()) ?? []).find((c) => String(c.id) === req.params.id && c.kind === 'image')
    if (!cam || !isPublicHost(cam.url)) return res.status(404).end()
    const client = cam.url.startsWith('https:') ? https : http
    const upstream = client.get(cam.url, { timeout: 10_000, headers: { 'User-Agent': 'jaidee' } }, (up) => {
      const type = up.headers['content-type'] ?? ''
      if (up.statusCode !== 200 || !type.startsWith('image/')) {
        up.resume()
        return res.status(502).end()
      }
      let size = 0
      const chunks = []
      up.on('data', (c) => {
        size += c.length
        if (size > MAX_IMAGE) up.destroy()
        else chunks.push(c)
      })
      up.on('end', () => {
        res.set('Content-Type', type)
        res.set('Cache-Control', 'public, max-age=30')
        res.send(Buffer.concat(chunks))
      })
      up.on('error', () => res.headersSent || res.status(502).end())
    })
    upstream.on('timeout', () => upstream.destroy())
    upstream.on('error', () => res.headersSent || res.status(504).end())
  }),
)

// The flood simulator (Chiang Mai): gauges and rain in the province, and the city's hourly forecast.
data.get(
  '/flood',
  route(async (req, res) => {
    const [stations, rain, forecast] = await Promise.all([feeds.stations.get(), feeds.rain.get(), feeds.forecast.get()])
    sendJson(req, res, {
      gauges: stations ? stations.filter(inProvince('50')) : null,
      rain: rain
        ? rain.filter((r) => r[4] === '50').map((r) => ({ lng: r[0], lat: r[1], rain24h: r[2], rain1h: r[3], name: r[5], agency: r[6], observedAt: r[7] }))
        : null,
      forecast: forecast?.['50']?.hourly.map(([time, mm]) => ({ time, mm })) ?? null,
    })
  }),
)
