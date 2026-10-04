# Jaidee · แผนที่ช่วยกัน

Thailand's public water and flood information in one place, on Apple Maps–style 3D maps: river gauges against their banks, rain and radar, large dams, cameras, a 3-day forecast for every province, and what people see on the ground. Every one of the 77 provinces has its own page. Where a province opens a command centre, people can ask for help and report missing relatives, and staff send rescue teams and follow them on the map. Volunteers find tasks that staff have checked, and the flood simulator shows which Chiang Mai streets go under first.

In danger? Call **1784** (disaster, DDPM) or **1669** (medical).

## Run it

Requires **Node.js 22.13 or newer** (built-in SQLite) and npm.

```bash
npm install
cp .env.example .env      # set ADMIN_USERNAME / ADMIN_PASSWORD (12+ chars) and IP_HASH_SALT
npm run dev               # web on http://localhost:5173, API on :8787 (proxied as /api)
```

One port for production: `npm run build && npm start` (http://localhost:8787). The database and uploaded photos live in `data/` (git-ignored; `DATA_DIR` moves it). Behind a reverse proxy set `TRUST_PROXY` so rate limits see real client addresses.

The first start creates the admin from `ADMIN_USERNAME` / `ADMIN_PASSWORD`. Sign in at `#/command`; create staff accounts (one province each) under Admin.

## What's in it

| Page | What it does |
|---|---|
| **Thailand** `#/` | Live counts (gauges over the bank, high, dams over 80 %, open command centres), the national 3D map, rivers over the bank now, large dams, and quick actions that find your province from your location. |
| **Map** `#/map` | Full-screen 3D globe: every gauge as a column (height = how full, colour = status), dams as columns, rain heatmap, radar, people's reports, shelters, cameras. Provinces with rivers over the bank are tinted; tap one to open it. |
| **Provinces** `#/provinces` | All 77, by region, with how many gauges are over the bank or high. |
| **Province** `#/p/<slug>` | Report the water level · command centre status (ask for help / find a person, or the emergency numbers) · *is there flooding near me?* (location or sub-district, computed on the device) · rain in the next 24 h · every gauge against its bank with trend and age · dams · air quality · links to agency sites. |
| `…/map` `…/weather` `…/area` | 3D province map with tap-to-confirm reports · 3-day forecast, 48-hour rain and radar (replay 2 h) · districts coloured by the highest level reported in 24 h. |
| `…/report` `…/updates` | Report a water level in 3 steps (GPS, a pin, or a pasted Google Maps / LINE link; 6 levels; trend; can vehicles pass; photo with location data stripped) · the feed, with "still flooded" / "gone down". Points fade at 12 and 24 h and leave the map at 36 h. |
| `…/lost-found` `…/missing` `…/help` `…/open` `…/cctv` | Lost and found board (scam warning; the poster can close it from their device) · missing people (to the command centre only, never published) · help requests with a code to follow progress · agencies asking for a command centre · agency camera stills. Help and missing-person forms only open where a command centre is active; elsewhere the page shows the emergency numbers, so no request waits unread. |
| **Command centre** `#/command` | Staff: help requests on a map with status and team assignment, teams with a tracking link for their phone (`#/track/<token>`), missing people, shelters, volunteer needs to check and publish, report moderation, opening or closing the centre. Admins: accounts and agency requests. |
| **Volunteer** `#/volunteer` | Needs that staff have checked, on a map; post a need (checked before it is listed). |
| **Flood simulator 3D** `#/flood` | See below. |
| **Data sources** `#/sources` | What comes from where, and what isn't connected yet. |

Thai, English and 简体中文 throughout (`src/i18n/`; `en.ts` is the source and `th.ts` / `zh.ts` must have every key or the build fails). Light and dark, on phones and desktops.

## Data

All public, no keys. Fetched by the server and cached (10 min for gauges and rain, 30 min for forecasts and dams); if a source is down, the last good reading is served.

| Source | Used for |
|---|---|
| RID SWOC (`bigdata-swoc.rid.go.th`) | River gauges vs bank: RID hydrology, RID telemetry and HII stations, with the agencies' own over/under-bank figures and trends |
| Thaiwater, HII (`api-v3.thaiwater.net`) | EGAT and National Parks gauges, ~4,600 rain gauges (incl. DWR), large dams, storms, CCTV list |
| Air4Thai, PCD | Air quality (Thai AQI). Their server sends the wrong certificate chain; `server/certs/` adds the right intermediates for that host only. |
| Open-Meteo | Hourly (48 h) and daily (3 days) forecast for each province centre. Free for non-commercial use; a commercial service needs their paid plan. |
| RainViewer | Radar tiles (free tiles stop at zoom 7) |
| OpenFreeMap (OpenStreetMap), AWS Terrain Tiles | Base map, 3D buildings, terrain and hillshade (`src/lib/map/style.ts`) |
| OCHA COD-AB (Royal Thai Survey Dept., CC BY-IGO), geoBoundaries (CC BY 4.0) | Province, district and sub-district names and outlines: `python3 scripts/build_admin_geo.py` writes `public/geo/` and `src/data/provinces.ts` |

Not connected yet: RID telerid live readings (need an account from RID), DWR telemetry (no published API), GISTDA satellite flood extent and TMD warnings (need API keys).

## Flood simulator

`#/flood`. A planning tool, not a forecast; the page says so.

- **Model:** the local inertial form of the shallow water (Saint-Venant) equations on a regular grid (Bates, Horritt & Fewtrell 2010, the scheme behind LISFLOOD-FP), with Manning friction, a Froude ≤ 1 limit and a no-overdraw limit for stability on noisy terrain. It runs in a Web Worker on about 135 000 cells of 36 m covering the city from Ring Road 3 to the edge of Saraphi (`src/lib/flood/solver.ts`). A typical run reaches ×400–×700 real time; the page shows the speed actually reached.
- **Ground:** Terrarium terrain tiles (SRTM) at zoom 12, with roofs and trees taken out by a morphological opening and single-cell pits filled (`groundFromSurface`). SRTM in town is still metres out, so depths are a guide to which streets flood first, not exact figures.
- **River:** the Ping centre line from OpenStreetMap (`src/data/pingRiver.ts`). Channel cells take the height of the land beside them (30th percentile within 110 m, smoothed along the river) as their bank; the river is held at that bank + (P.1 level − 3.7 m), so it spills where the terrain allows once P.1 passes its critical level. The river never runs out of water, so long runs show the most a level can flood. `BANK_PERCENTILE` in `grid.ts` is the main thing to tune against a real flood (October 2024).
- **Rain and drains:** rain falls evenly on the area; drains are one figure in mm per hour removed from any wet cell. There is no pipe network yet (no SWMM) because the drain data is not public.
- **Not here yet:** CCTV (needs a feed from the municipality), HEC-RAS or SWMM runs (would need a built model on a server), LiDAR terrain for real street-level depths.

`GET /api/flood` returns the gauges and rain gauges of Chiang Mai province and the city's hourly rain forecast.

## Layout

```
server/
  index.js                 app, routes, static files
  feeds.js                 external data, normalised and cached
  db.js                    SQLite schema (node:sqlite)
  lib/                     auth (scrypt, sessions), geography, fetch/cache/rate-limit helpers
  routes/data.js           /api/national, /api/province/:code, /api/rain, /api/air, /api/cctv, /api/flood
  routes/community.js      reports, lost and found, missing people, help requests, needs, shelters
  routes/command.js        staff API and team tracking
src/
  App.tsx, lib/router.ts   hash routes
  components/pages/        Thailand, map, provinces, volunteer, command centre, sources
  components/province/     the province pages
  components/map/MapView   MapLibre map (lazy-loaded) in our style
  lib/map/                 style, data layers (3D columns, heatmap, radar …), popups
  lib/flood/               flood simulator: grid, solver, worker, feeds, map
scripts/                   build_admin_geo.py
public/geo/                provinces, districts, sub-districts
```

## Privacy and safety

- No visitor IP is stored, only a salted hash for rate limits and one-vote-per-person.
- Report photos are re-encoded in the browser before upload, which drops EXIF (including GPS).
- Missing-person reports and help requests are visible only to staff of that province (and admins); the public help status page shows progress, not personal details.
- The camera proxy only fetches cameras on the agency list, and never private network addresses.
