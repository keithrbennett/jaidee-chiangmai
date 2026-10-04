// Snapshot of each province's hospitals, police and fire stations (and DDPM offices) from OpenStreetMap,
// with the phone numbers mappers recorded: public/geo/p/<code>/places.json. The server serves this and
// refreshes it from Overpass in the background (server/contacts.js). Data © OpenStreetMap contributors, ODbL.
//
//   node scripts/build_osm_places.mjs            all provinces
//   node scripts/build_osm_places.mjs 50 51      just these
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { compactPlaces, fetchPlaces } from '../server/osm.js'

const provinces = JSON.parse(readFileSync(new URL('../public/geo/provinces.geojson', import.meta.url), 'utf8')).features.map((f) => f.properties.code)
const only = process.argv.slice(2)
for (const code of only.length ? only : provinces) {
  const file = new URL(`../public/geo/p/${code}/places.json`, import.meta.url)
  if (!only.length && existsSync(file) && Date.now() - JSON.parse(readFileSync(file, 'utf8')).at < 864e5) continue
  // One server, politely: when it is busy or rate-limits us, wait and ask again rather than hang on mirrors.
  for (let attempt = 1; attempt <= 6; attempt++) {
    try {
      const places = await fetchPlaces(code, { servers: ['https://overpass-api.de/api/interpreter'], timeoutMs: 45_000 })
      writeFileSync(file, JSON.stringify({ at: Date.now(), places: compactPlaces(places) }))
      console.log(code, places.length, 'places,', places.filter((p) => p.phone).length, 'with phones')
      break
    } catch (err) {
      console.error(code, `attempt ${attempt} failed:`, err.message)
      await new Promise((r) => setTimeout(r, 15_000 * attempt))
    }
  }
  await new Promise((r) => setTimeout(r, 2000))
}
