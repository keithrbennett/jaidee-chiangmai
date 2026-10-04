// Who to call in a province: national lines that put you through to the office where you are, the province's
// coordination centre, numbers staff add, and hospitals, police and fire stations from OpenStreetMap.
// Nothing here is typed in by us: OSM places carry the phone number their mappers recorded, or none.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { ANDAMAN, GULF } from './alerts.js'
import { DATA_DIR, all, get } from './db.js'
import { compactPlaces, expandPlaces, fetchPlaces } from './osm.js'

const CACHE_DIR = `${DATA_DIR.replace(/\/$/, '')}/osm`
mkdirSync(CACHE_DIR, { recursive: true })
const REFRESH_MS = 7 * 864e5

/** Bangkok, Samut Prakan and Nonthaburi get power from MEA (1130); everywhere else from PEA (1129). */
const METRO = new Set(['10', '11', '12'])
const COAST = new Set([...ANDAMAN, ...GULF])

/** National numbers, in the order people need them. Each routes the call to the local office. */
export function nationalLines(code) {
  return [
    ['1669', 'medical'],
    ['1784', 'disaster'],
    ['191', 'police'],
    ['199', 'fire'],
    ['1567', 'damrongdham'],
    [METRO.has(code) ? '1130' : '1129', 'power'],
    ...(COAST.has(code) ? [['1860', 'tsunami']] : []),
    ['1362', 'forestfire'],
    ['1193', 'highway'],
    ['1155', 'tourist'],
    ['1300', 'social'],
    ['1323', 'mental'],
    ['1460', 'irrigation'],
  ].map(([number, kind]) => ({ number, kind }))
}

// Places per province: the snapshot in the repo (scripts/build_osm_places.mjs), or a newer copy the server
// fetched since (data/osm). Refreshed in the background once a week, one Overpass query at a time.
const memory = new Map()
const refreshing = new Set()
let queue = Promise.resolve()

function readFile(path) {
  try {
    const c = JSON.parse(readFileSync(path, 'utf8'))
    return { at: c.at, places: expandPlaces(c.places) }
  } catch {
    return null
  }
}
function load(code) {
  if (memory.has(code)) return memory.get(code)
  const cache = existsSync(`${CACHE_DIR}/${code}.json`) ? readFile(`${CACHE_DIR}/${code}.json`) : null
  const snapshot = readFile(new URL(`../public/geo/p/${code}/places.json`, import.meta.url))
  const best = [cache, snapshot].filter(Boolean).sort((a, b) => b.at - a.at)[0] ?? null
  if (best) memory.set(code, best)
  return best
}

function refresh(code) {
  if (refreshing.has(code)) return queue
  refreshing.add(code)
  queue = queue.then(async () => {
    try {
      const places = await fetchPlaces(code)
      const entry = { at: Date.now(), places }
      memory.set(code, entry)
      writeFileSync(`${CACHE_DIR}/${code}.json`, JSON.stringify({ at: entry.at, places: compactPlaces(places) }))
    } catch (err) {
      console.error(`OSM places for ${code} failed:`, err.message)
    } finally {
      refreshing.delete(code)
    }
  })
  return queue
}

/** Places for a province. Answers at once from what we have; only waits (up to waitMs) when we have nothing. */
export async function osmPlaces(code, waitMs = 25_000) {
  const have = load(code)
  if (!have || Date.now() - have.at > REFRESH_MS) {
    const job = refresh(code)
    if (!have) await Promise.race([job, new Promise((r) => setTimeout(r, waitMs))])
  }
  return memory.get(code) ?? have ?? null
}

/** Numbers the province's staff added (Settings in the coordination centre). */
export const localContacts = (code) => all('SELECT id, name, phone, kind, note, updated_at FROM contacts WHERE province = ? ORDER BY kind, name', code)

/** Everything for one province. */
export async function provinceContacts(code, { waitMs } = {}) {
  const centre = get('SELECT active, name, hotline FROM command_centers WHERE province = ?', code)
  const osm = await osmPlaces(code, waitMs)
  return {
    national: nationalLines(code),
    centre: centre?.active && centre.hotline ? { name: centre.name, hotline: centre.hotline } : null,
    local: localContacts(code),
    places: osm?.places ?? null,
    placesAt: osm?.at ?? null,
  }
}
