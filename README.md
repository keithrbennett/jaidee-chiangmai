# Jaidee · แผนที่ช่วยกัน

Thailand's public hazard information in one place, on colourful 3D maps: rivers against their banks, rain and radar, dust (PM2.5), fire hotspots from satellite, flooded areas seen by radar satellites, earthquakes and tsunami risk, and what people see on the ground. A warning engine turns those feeds into plain-language alerts for each province and can send them to your phone. Every one of the 77 provinces has its own page. Where a province opens a coordination centre, people can ask for help and report missing relatives, and staff send rescue teams and follow them on the map. Volunteers find tasks that staff have checked, and the flood simulator shows which Chiang Mai streets go under first.

In danger? Call **1784** (disaster, DDPM) or **1669** (medical).

## Run it

Requires **Node.js 22.13 or newer** (built-in SQLite) and npm.

```bash
npm install
cp .env.example .env      # set ADMIN_USERNAME / ADMIN_PASSWORD (12+ chars), IP_HASH_SALT and GISTDA_API_KEY
npm run dev               # web on http://localhost:5173, API on :8787 (proxied as /api)
```

One port for production: `npm run build && npm start` (http://localhost:8787). The database and uploaded photos live in `data/` (git-ignored; `DATA_DIR` moves it). Behind a reverse proxy set `TRUST_PROXY` so rate limits see real client addresses.

The first start creates the admin from `ADMIN_USERNAME` / `ADMIN_PASSWORD`. Sign in at `#/command`; create staff accounts (one province each) under Admin.

`GISTDA_API_KEY` (free from [api-gateway.gistda.or.th](https://api-gateway.gistda.or.th)) turns on fire hotspots and satellite flood areas; without it those parts stay empty and everything else works. It is used by the server only: GISTDA echoes the key in its response links, so raw GISTDA responses are never passed to browsers. Web Push needs VAPID keys; leave `VAPID_*` empty and the server creates `data/vapid.json` on first start.

## What's in it

| Page | What it does |
|---|---|
| **Thailand today** `#/` | One chip per hazard (flood, heavy rain, landslide, PM2.5, fire, earthquake, tsunami) coloured by the highest alert anywhere, the hazard map, the most serious alerts, headline numbers (rivers over the bank, full dams, fire hotspots, strongest quake, satellite flood area, coordination centres), and quick actions that find your province from your location. |
| **Map** `#/map` | Full-screen 3D globe with one hazard at a time, so it reads at a glance: **Water** (gauges as coloured dots, labels from zoom 8, dams, flooded cells from satellite, reports, shelters, cameras) · **Rain** (gauge heatmap and radar) · **Dust** (stations as AQI circles) · **Fire** (VIIRS hotspots, heat map plus dots that fade with age) · **Earthquake** (circles sized by magnitude, coloured by age; the view pulls back to the region). Provinces are tinted by what needs attention in that mode; tap one to open it. |
| **Alerts** `#/alerts` | Every alert now, by hazard, with the rule that raised it and a link to the official agency; turn on alerts for chosen provinces, hazards and level on this device. |
| **Provinces** `#/provinces` | All 77, by region, with how many gauges are over the bank or high. |
| **Province** `#/p/<slug>` | Tabs: Overview · Map · Rain & dust · From the ground · Get help. The overview shows the province's overall level, its alerts, six hazard cards (rivers, rain, dust, fire, earthquake, satellite flood), the coordination centre or the emergency numbers, *is there flooding near me?* (location or sub-district, computed on the device), every gauge against its bank, dams, alert sign-up and agency links. |
| `…/map` `…/weather` `…/area` | Province hazard map (same five modes; satellite flood cells in Water) · 3-day forecast, 48-hour rain with the heaviest hour spelled out, radar (replay 2 h), 4-day PM2.5 outlook and AQI stations · districts coloured by the highest level reported in 24 h. |
| `…/report` `…/updates` | Report a water level in 3 steps (GPS, a pin, or a pasted Google Maps / LINE link; 6 levels in cm; trend; can vehicles pass; photo with location data stripped) · the feed, with "still flooded" / "gone down". Points fade steadily and leave the map after 48 h. |
| `…/lost-found` `…/missing` `…/help` `…/open` `…/cctv` | Lost and found board (scam warning; the poster can close it from their device) · missing people (to the coordination centre only, never published) · help requests with a code to follow progress · agencies asking for a coordination centre · agency camera stills. Help and missing-person forms only open where a coordination centre is active; elsewhere the page shows the emergency numbers, so no request waits unread. |
| **Coordination centre** `#/command` | Staff: help requests on a map with status and team assignment, teams with a tracking link for their phone (`#/track/<token>`), missing people, shelters, volunteer needs to check and publish, report moderation, opening or closing the centre. Admins: accounts and agency requests. |
| **Volunteer** `#/volunteer` | Needs that staff have checked, on a map; post a need (checked before it is listed). |
| **Flood simulator 3D** `#/flood` | See below. |
| **Data sources** `#/sources` | What comes from where, and what isn't connected yet. |

Thai, English and 简体中文 throughout (`src/i18n/`; `en.ts` is the source and `th.ts` / `zh.ts` must have every key or the build fails). Light and dark, on phones and desktops.

## Data

All public; only GISTDA needs a (free) key. Fetched by the server and cached (5 min for earthquakes, 10 min for gauges and rain, 30 min for fire hotspots, forecasts and dams, 3 h for satellite flood); if a source is down, the last good reading is served.

| Source | Used for |
|---|---|
| RID SWOC (`bigdata-swoc.rid.go.th`) | River gauges vs bank: RID hydrology, RID telemetry and HII stations, with the agencies' own over/under-bank figures and trends |
| Thaiwater, HII (`api-v3.thaiwater.net`) | EGAT and National Parks gauges, ~4,600 rain gauges (incl. DWR), large dams, storms, CCTV list |
| Air4Thai, PCD | Air quality (Thai AQI). Their server sends the wrong certificate chain; `server/certs/` adds the right intermediates for that host only. |
| GISTDA API gateway (`api-gateway.gistda.or.th/api/2.0`) | Fire hotspots from VIIRS (past 24 h, Thailand and neighbours) and flooded areas from Sentinel-1 radar (past 7 days, per province) |
| TMD earthquake feed, USGS | Earthquakes: TMD's feed for the region, merged with USGS (same event within 2 min and 1° kept once, TMD first; a tsunami flag from either is kept) |
| Open-Meteo | Hourly (48 h) and daily (3 days) forecast, and the CAMS PM2.5 forecast (4 days), for each province centre. Free for non-commercial use; a commercial service needs their paid plan. |
| RainViewer | Radar tiles (free tiles stop at zoom 7) |
| OpenFreeMap (OpenStreetMap), AWS Terrain Tiles | Base map, 3D buildings, terrain and hillshade (`src/lib/map/style.ts`) |
| OCHA COD-AB (Royal Thai Survey Dept., CC BY-IGO), geoBoundaries (CC BY 4.0) | Province, district and sub-district names and outlines: `python3 scripts/build_admin_geo.py` writes `public/geo/` and `src/data/provinces.ts` |

Not connected yet: RID telerid live readings (need an account from RID), DWR telemetry (no published API), TMD weather warnings and DMR landslide warnings (no open feed), NDWC tsunami bulletins (no open feed; alerts link to ndwc.disaster.go.th).

## Alerts

`server/alerts.js` checks every province every 5 minutes. Levels: 1 watch (yellow), 2 warning (orange), 3 danger (red). These are our own rules on public data, not official warnings; every alert links to the agency that issues the official one (RID, TMD, PCD, GISTDA, DMR, NDWC).

| Hazard | Rule |
|---|---|
| Flood | A gauge over its bank: warning; 0.5 m over or 3+ gauges over: danger. A gauge 90 % full: watch. Satellite: 50+ flooded cells in 7 days watch, 1000+ warning. |
| Heavy rain | 90.1 mm+ measured in 24 h: warning. 35.1 mm+ forecast for the next 24 h: watch (warning at 90.1). |
| Landslide | 100 mm+ measured in 24 h: warning; forecast: watch. |
| Dust | AQI over 100: warning; over 200: danger. Tomorrow's PM2.5 forecast 37.6 µg/m³+: watch. |
| Fire | 10+ hotspots in 24 h: watch; 40+: warning. |
| Earthquake | M3.5+ in the past 24 h, for provinces within the distance it may be felt (under M4.5: 100 km, under M5.5: 300 km, under M6.5: 600 km, larger: 1000 km): watch; M5.5+ within 300 km: warning; M6.5+ within 300 km: danger. |
| Tsunami | Shallow quakes (70 km or less) only. Andaman Sea / off Sumatra, for the Andaman coast: M7.5+ danger, M7+ warning, M6.5+ with a tsunami flag watch. Manila trench M7.5+: watch for the Gulf coast, which is shallow and sheltered. USGS sets the tsunami flag for any large quake at sea, so on its own it is not treated as a tsunami. |

**Push:** `public/sw.js` and Web Push (`server/push.js`, VAPID). People pick provinces, hazards and a minimum level on `#/alerts` or a province page; the server sends each new alert once, in the language they chose, and drops subscriptions the browser has ended. On iPhone, Web Push works only after *Add to Home Screen* (iOS 16.4+); the page says so.

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
  hazards.js               GISTDA (fire, satellite flood), TMD + USGS earthquakes, PM2.5 forecast
  alerts.js                warning rules → alerts per province
  push.js                  Web Push: VAPID keys, sending new alerts every 5 min
  routes/data.js           /api/national, /api/province/:code, /api/rain, /api/air, /api/cctv, /api/flood
  routes/hazards.js        /api/alerts, /api/hazards, /api/satflood/:code, /api/push/*
  routes/community.js      reports, lost and found, missing people, help requests, needs, shelters
  routes/command.js        staff API and team tracking
src/
  App.tsx, lib/router.ts   hash routes
  components/pages/        Thailand today, map, provinces, volunteer, coordination centre, sources
  components/alerts/       alert cards, alerts page, subscribe panel
  components/province/     the province pages
  components/map/MapView   MapLibre map (lazy-loaded) in our style
  lib/map/                 style, data layers (dots, heatmaps, radar, hotspots, quakes …), hazard modes, popups
  lib/flood/               flood simulator: grid, solver, worker, feeds, map
scripts/                   build_admin_geo.py
public/geo/                provinces, districts, sub-districts
```

## Privacy and safety

- No visitor IP is stored, only a salted hash for rate limits and one-vote-per-person.
- Report photos are re-encoded in the browser before upload, which drops EXIF (including GPS).
- Missing-person reports and help requests are visible only to staff of that province (and admins); the public help status page shows progress, not personal details.
- The camera proxy only fetches cameras on the agency list, and never private network addresses.
- API keys (GISTDA, VAPID private key, Claude) stay on the server. Push subscriptions store only the browser's push endpoint and the chosen provinces, hazards and language.
