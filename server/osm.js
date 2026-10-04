// Hospitals, police and fire stations (and DDPM offices) from OpenStreetMap via Overpass, for a province.
// Shared by the server (server/contacts.js) and the snapshot script (scripts/build_osm_places.mjs).
import { PROVINCES, provinceAt } from './lib/geo.js'

// The public servers are often busy; try them in turn.
const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
]
const UA = 'jaidee (Thailand hazard information hub; github.com/keithrbennett/jaidee-chiangmai)'
const KINDS = { hospital: 'hospital', police: 'police', fire_station: 'fire' }
const LETTER = { hospital: 'h', police: 'p', fire: 'f', ddpm: 'd' }
const FROM_LETTER = { h: 'hospital', p: 'police', f: 'fire', d: 'ddpm' }
const isLatin = (s) => !!s && /^[\x20-\x7E]+$/.test(s)

function toPlace(e) {
  const t = e.tags ?? {}
  const lat = e.lat ?? e.center?.lat
  const lng = e.lon ?? e.center?.lon
  if (lat == null || lng == null) return null
  const phone = String(t.phone ?? t['contact:phone'] ?? t['contact:mobile'] ?? '').split(/[;,]/)[0].trim() || null
  const th = t['name:th'] ?? (isLatin(t.name) ? null : t.name) ?? null
  const en = t['name:en'] ?? (isLatin(t.name) ? t.name : null)
  if (!th && !en && !phone) return null
  return { kind: KINDS[t.amenity] ?? 'ddpm', th, en, phone, lng: Math.round(lng * 1e5) / 1e5, lat: Math.round(lat * 1e5) / 1e5, emergency: t.emergency === 'yes' }
}

/**
 * One query over the province's bounding box (area queries are much slower on the public servers), then
 * only the places inside the province's outline.
 */
export async function fetchPlaces(code, { servers = OVERPASS, timeoutMs = 100_000 } = {}) {
  const p = PROVINCES.find((x) => x.code === code)
  if (!p) throw new Error(`no province ${code}`)
  const [w, s, e, n] = p.bbox
  const box = `${s},${w},${n},${e}`
  const query = `[out:json][timeout:90];(nwr["amenity"~"^(hospital|police|fire_station)$"](${box});nwr["name"~"ป้องกันและบรรเทาสาธารณภัย"](${box}););out center tags;`
  let lastErr
  for (const url of servers) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'User-Agent': UA, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (!res.ok) throw new Error(`${new URL(url).host} answered ${res.status}`)
      const body = await res.json()
      if (body.remark && /runtime error|timed out/i.test(body.remark)) throw new Error(`${new URL(url).host}: ${body.remark}`)
      return body.elements.map(toPlace).filter((x) => x && provinceAt(x.lng, x.lat) === code)
    } catch (err) {
      lastErr = err
    }
  }
  throw lastErr
}

/** Some clinics are mapped as hospitals; an emergency list should only send people to real hospitals. */
const CLINIC = /clinic|คลินิก|สหคลินิก|ทันตกรรม|dental|beauty|ความงาม/i
const keep = (p) => !(p.kind === 'hospital' && CLINIC.test(`${p.th ?? ''} ${p.en ?? ''}`))

/** [kind letter, th, en, phone, lng, lat, emergency 0/1]: about a third of the size of objects. */
export const compactPlaces = (places) => places.filter(keep).map((p) => [LETTER[p.kind], p.th, p.en, p.phone, p.lng, p.lat, p.emergency ? 1 : 0])
export const expandPlaces = (rows) => rows.map(([k, th, en, phone, lng, lat, em]) => ({ kind: FROM_LETTER[k], th, en, phone, lng, lat, emergency: !!em })).filter(keep)
