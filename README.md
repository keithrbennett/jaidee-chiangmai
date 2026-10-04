# Jaidee · แผนที่ช่วยกัน

Thailand's public hazard information in one place, on colourful 3D maps: rivers against their banks, rain and radar, dust (PM2.5), fire hotspots from satellite, flooded areas seen by radar satellites, earthquakes and tsunami risk, and what people see and photograph on the ground. A warning engine turns those feeds into plain-language alerts for each province and can send them to your phone. Every one of the 77 provinces has its own page with its emergency numbers, nearest hospitals and police. **น้องใจดี**, an AI helper, answers questions in any language, looks things up, checks what the public sends, and helps people ask for help. Where a province opens a coordination centre, people can ask for help and report missing relatives, and staff send rescue teams and follow them on the map. Volunteers find tasks that staff have checked, and the 3D flood simulator shows which streets go under first, in any province.

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

`ANTHROPIC_API_KEY` turns on น้องใจดี's AI (see below). Without it the chat answers in basic mode and the checks on public posts use rules only. `CLAUDE_MODEL` picks the model (default `claude-opus-5-5`; `claude-sonnet-5-5` or `claude-haiku-4-5` cost less), `AI_DAILY_LIMIT` caps calls per day (default 3000, then basic mode until midnight Bangkok time), `AI_WEB_SEARCH=0` turns off web search in the chat.

Keep the project out of folders that iCloud (or another cloud drive) syncs, such as Desktop and Documents with "Desktop & Documents Folders" on: offloaded files in `node_modules` stall the server and make git very slow.

## What's in it

| Page | What it does |
|---|---|
| **Thailand today** `#/` | First what people come for in a crisis: **ask for help** (call buttons first, then the province's help form), **report the water** with a photo, **emergency numbers**, **around me**. Then the day in one sentence ("danger in 19 provinces · mostly floods"), the box to ask น้องใจดี or find a province, a chip per hazard, the hazard map (tap a province for its pop-up), the most serious alerts and headline numbers. |
| **Map** `#/map` | Full-screen 3D globe with one hazard at a time: **Water** (gauges as coloured dots, dams, flooded cells from satellite, reports, shelters, cameras) · **Rain** (gauge heatmap and radar) · **Dust** (AQI circles) · **Fire** (VIIRS hotspots, fading with age) · **Earthquake** (circles by magnitude and age). Tap a province, or search, to open its panel: its own map, actions (help, report, call, 3D simulation), today's state, alerts and emergency numbers. `#/map?p=<slug>` opens a province. |
| **Alerts** `#/alerts` | Provinces by level as a bar and a map of Thailand, then every alert as a compact row grouped by hazard, your own provinces first; filter by hazard and level; alert sign-up and the rules beside. |
| **น้องใจดี** (every page) | The AI helper: a sheet on phones, a panel on desktops. See below. |
| **Report the water** (sheet) | Photo first (camera), the place from GPS with its sub-district name, the depth picked from pictures of a person standing in water, optional trend and note. With AI on, น้องใจดี can estimate the depth from the photo. After sending, the page shows what the check found. |
| **Be ready** `#/guide` | 14 safety guides (floods before, during and after; electricity; go-bag; evacuation; people who need extra care; health; landslides; PM2.5; wildfires; earthquakes; tsunamis; storms) from Thai government advice, with who to call. `src/data/guides.json`, shared with น้องใจดี. |
| **Provinces** `#/provinces` | All 77, by region, with how many gauges are over the bank or high. |
| **Province** `#/p/<slug>` | Tabs: Overview · Map · Rain & dust · From the ground · Emergency numbers · Get help. The overview opens with the day in one sentence and four actions, then the alerts, hazard tiles with small charts (gauges by status, the next 24 h of rain, an AQI dial), photos people sent, *is there flooding near me?*, every gauge drawn against its bank, dams, and the rest. |
| `…/contacts` | National lines that put you through to the local office (with the right power company and, on coasts, NDWC), the coordination centre, numbers the province's staff add, and the nearest hospitals, police and fire stations from OpenStreetMap with call and directions. |
| `…/map` `…/weather` `…/area` | Province hazard map (same five modes; satellite flood cells in Water) · 3-day forecast, 48-hour rain with the heaviest hour spelled out, radar (replay 2 h), 4-day PM2.5 outlook and AQI stations · districts coloured by the highest level reported in 24 h. |
| `…/report` `…/updates` | The photo-first report, starting in this province · the feed, with what each report's check found and "still flooded" / "gone down". Points fade steadily and leave the map after 48 h; reports that don't match the data around them are drawn fainter. |
| `…/lost-found` `…/missing` `…/help` `…/open` `…/cctv` | Lost and found board (scam warning; the poster can close it from their device) · missing people (to the coordination centre only, never published) · help requests with a code to follow progress · agencies asking for a coordination centre · agency camera stills. Help and missing-person forms only open where a coordination centre is active; elsewhere the page shows the emergency numbers, so no request waits unread. |
| **Coordination centre** `#/command` | Staff: help requests on a map with status, urgency and a Thai summary (and translation) from น้องใจดี, team assignment, teams with a tracking link for their phone (`#/track/<token>`), missing people (translated), shelters, volunteer needs (pre-drafted cards), reports with what the check found and posts held for review, the province's phone numbers, opening or closing the centre. Admins: accounts and agency requests. |
| **Volunteer** `#/volunteer` | Tasks that staff have checked, as cards and on a map (all, urgent, near me); post a need. With nothing listed, ways to help right now. |
| **Flood simulator 3D** `#/flood` | Any province. See below. |
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
| OpenStreetMap via Overpass (ODbL) | Hospitals, police and fire stations (and DDPM offices) per province with the phone numbers mappers recorded: snapshot in `public/geo/p/<code>/places.json` (`node scripts/build_osm_places.mjs`), refreshed by the server weekly (`server/contacts.js`) |
| OpenFreeMap vector tiles (OpenMapTiles schema) | Rivers, canals, sea and lakes for the flood simulator |
| Anthropic Claude (optional) | น้องใจดี: chat, photo reading, checks and translation |

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

## น้องใจดี (the AI helper)

`server/ai/`. A chat on every page, streamed (`POST /api/assistant`, server-sent events), in whatever language the person writes: Thai, English, Chinese, Burmese, Lao, Karen …

- **Tools over our own data** (`server/ai/assistant.js`): find a place (province, district, sub-district), a province's state (alerts, gauges, dams, rain and forecast, air and PM2.5 outlook, fires, quakes, satellite flood, the coordination centre, shelters, public reports), the area around a shared location, Thailand as a whole, emergency numbers and nearest hospitals, and the safety guides. It never guesses figures; it says how old a reading is.
- **Beyond the site**: everyday and general questions from its own knowledge (health basics, paperwork after a disaster, writing or translating a message …), and Claude's web search for current news and announcements (when the organisation has it on), with sources shown.
- **Photos**: people can send one; it judges water depth and danger, reads signs and documents, and can turn a flood photo into a water report for the map (`draft_report`).
- **Doing things**: one-tap buttons for pages and hotlines (only numbers it knows: national lines, a centre's hotline, numbers from the contacts tool), and help requests drafted in Thai for staff, which the person checks and sends.
- **Safety**: life-threatening situations get 1669 / 1784 / 191 first; it never tells anyone to wade through moving water; our alerts are not official warnings.
- **Basic mode** (`server/ai/basic.js`) answers from keywords in Thai, English and Chinese with live data and the guides when there is no key, the day's budget is spent, or Claude can't be reached.

**Checks on what the public sends** (`server/ai/checks.js`), rules first, then the model when on:

| What | Check |
|---|---|
| Water reports | Compared with the nearest gauges, rain, satellite flooding within 1 km, other reports within 1 km and "still flooded" votes: *matches data nearby* / *not confirmed yet* / *doesn't match*. Rivers alone never sink a report (streets flood from drains). The model also looks at the photo (water? depth fits? a screenshot or news photo?). Abuse, spam or personal data holds the report for staff. |
| Lost and found | Requests for transfers or deposits, short links, bank account formats: a warning on the post. ID numbers hold it for staff. |
| Help requests | Urgency 1-3 from the form (and the model may only raise it), a one-line Thai summary, and a Thai and English translation of notes in other languages. |
| Missing people | Translation into Thai for staff. |
| Volunteer needs | A drafted card for staff to check, and a warning on posts that ask for money. |

Nothing is deleted by the model: the most it does is hold a post (`hidden = 2`) for staff to look at.

## Flood simulator

`#/flood`, then a province. A planning tool, not a forecast; the page says so.

- **Where:** a square about 13 km across (about 130 000 cells of 36 m) around a river gauge in the province (nearest the provincial city first), the city centre, or the person's location. `GET /api/flood/:code` gives the province's gauges, rain, forecast, city and these spots.
- **Model:** the local inertial form of the shallow water (Saint-Venant) equations on a regular grid (Bates, Horritt & Fewtrell 2010, the scheme behind LISFLOOD-FP), with Manning friction, a Froude ≤ 1 limit and a no-overdraw limit for stability on noisy terrain. It runs in a Web Worker (`src/lib/flood/solver.ts`). A typical run reaches ×400–×700 real time; the page shows the speed actually reached.
- **Ground:** Terrarium terrain tiles (SRTM) at zoom 12, with roofs and trees taken out by a morphological opening and single-cell pits filled (`groundFromSurface`). SRTM in town is still metres out, so depths are a guide to which streets flood first, not exact figures.
- **Water:** rivers and canals (lines and areas), the sea and lakes from the OpenStreetMap vector tiles the map already uses (zoom 13), laid onto the grid (`rasterizeWater`). Channel cells take the height of the land beside them (30th percentile within 110 m, carried into wide rivers from their edges, smoothed along the network) as their bank; every channel is held at that bank + how far the chosen gauge is above its own bank, so rivers spill where the terrain allows once the gauge passes its bank. The sea takes whatever reaches it; lakes are not counted as flooding. The river never runs out of water, so long runs show the most a level can flood. One gauge drives all channels in the square. `BANK_PERCENTILE` in `grid.ts` is the main thing to tune against a real flood.
- **Rain and drains:** rain falls evenly on the area; drains are one figure in mm per hour removed from any wet cell. There is no pipe network yet (no SWMM) because the drain data is not public.
- **Not here yet:** CCTV (needs a feed from the municipality), HEC-RAS or SWMM runs (would need a built model on a server), LiDAR terrain for real street-level depths.

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
  contacts.js, osm.js      emergency numbers per province; OSM hospitals, police, fire stations
  ai/                      น้องใจดี: claude.js (client, budget), assistant.js (agent and tools), basic.js
                           (no-key answers), context.js (data for tools), checks.js (checks on public posts)
  routes/data.js           /api/national, /api/province/:code, /api/rain, /api/air, /api/cctv, /api/contacts/:code, /api/flood/:code
  routes/assistant.js      /api/assistant (chat, streamed), /api/assistant/estimate (depth from a photo)
  routes/hazards.js        /api/alerts, /api/hazards, /api/satflood/:code, /api/push/*
  routes/community.js      reports, lost and found, missing people, help requests, needs, shelters
  routes/command.js        staff API and team tracking
src/
  App.tsx, lib/router.ts   hash routes
  components/pages/        Thailand today, map, provinces, volunteer, coordination centre, sources
  components/alerts/       alert cards, alerts page, the SVG map of Thailand, subscribe panel
  components/assistant/    น้องใจดี: the launcher, chat panel, orb, ask box, message formatting
  components/report/       the photo-first water report
  components/contacts/     emergency numbers for a province
  components/province/     the province pages, the province pop-up (ProvinceSheet), hazard widgets
  components/map/MapView   MapLibre map (lazy-loaded) in our style
  lib/map/                 style, data layers (dots, heatmaps, radar, hotspots, quakes …), hazard modes, popups
  lib/flood/               flood simulator: grid, solver, worker, feeds, map
scripts/                   build_admin_geo.py, build_osm_places.mjs
public/geo/                provinces, districts, sub-districts, OSM emergency places
src/data/guides.json       the safety guides (shared with the server)
```

## Privacy and safety

- No visitor IP is stored, only a salted hash for rate limits and one-vote-per-person.
- Report photos are re-encoded in the browser before upload, which drops EXIF (including GPS).
- Missing-person reports and help requests are visible only to staff of that province (and admins); the public help status page shows progress, not personal details.
- The camera proxy only fetches cameras on the agency list, and never private network addresses.
- API keys (GISTDA, VAPID private key, Claude) stay on the server. Push subscriptions store only the browser's push endpoint and the chosen provinces, hazards and language.
- น้องใจดี: conversations are not stored or logged on our server; the browser keeps the chat for the tab only. A location is sent only after the person taps "use my location", and only with that question. What goes to Anthropic: the conversation, a shared location's place name, an attached photo; for checks, the text of reports and posts, report photos, and the evidence around a report. The model never sees reporters' IP hashes, and it never deletes anything.
