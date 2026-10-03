# Jaidee · แผนที่ช่วยกัน (Mutual Aid Map)

Hackathon MVP for Chiang Mai: partner-verified needs (schools, temples, shelters, haze and flood relief) on a map, matched with newcomers who want to help but don't know where to start or speak Thai.

**All data is fictional demo data** (`src/data/needs.ts`).

## Run it

Requires **Node.js 22.12 or newer** (`node -v`; with nvm, `nvm install` picks up `.nvmrc`) and npm.

```bash
git clone git@github.com:keithrbennett/jaidee-chiangmai.git
cd jaidee-chiangmai
npm install
cp .env.example .env      # optional: ANTHROPIC_API_KEY for the server's Claude endpoint (not used by the demo UI yet)
npm run dev               # web on http://localhost:5173, API on :8787 (proxied as /api)
```

Single-port demo build:

```bash
npm run build && npm start   # http://localhost:8787 serves the app and the API
```

The whole demo works without an API key. If you create or edit `.env` while `npm run dev` is running, restart it.

## What's in the demo

| Screen | What it shows |
|---|---|
| **Home** | One question, "What would you like to do?", and three large cards that are the whole choice: **I want to help** (green, to the list and map), **I need help** (orange-red, to posting a need; for individuals as well as groups) and **My tasks**. During haze or flood mode a red bar above them links straight to the urgent needs. |
| **Find a need** | Map + list of verified needs sorted by distance (browser location if shared and near Chiang Mai, otherwise Nimman). Category filter chips. Needs whose verification is older than 14 days are hidden. |
| **Need detail** | Who verified it and when, English + Thai original, skills, spots left, host-confirmed impact progress, safety rules added automatically per category, slot picker, **I'm in** → check-in code (or waitlist when full). |
| **Emergency modes** | 🔴 Haze / 🔵 Flood toggle (admin-only in a real build). Shows only crisis needs, urgent first, with a live AQI or Ping River P.1 badge (see *Live conditions* below). |
| **My tasks** | Your commitments, check-in codes, cancel, and a pledged-hours impact receipt. |
| **Flood simulator 3D** | A 3D model of the city (OpenStreetMap buildings on terrain) with live river gauges, rain gauges and other water-level telemetry. Set rain (or use the 48-hour forecast), drain capacity, the P.1 level and how fast it rises; run at ×60 to ×3600 and watch where the water goes. **Street walk** drops the camera to street level with the water as 3D blocks and the depth under the crosshair. Jaidee needs in flooded streets turn red. See *Flood simulator* below. |
| **Post a need** | Describe the need in your own words, in any of the app's languages (**Use a sample** fills in an example in the selected language) → **Submit** → a *Submitted* confirmation. Demo only: nothing is sent yet, so no API key is needed. |

Every screen has its own URL (hash routes, so no server config is needed): `#/` home, `#/find` list + map, `#/find?cat=school` filtered list (older `#/?cat=school` links still work), `#/need/<id>` one need (with a Share button), `#/tasks`, `#/post`, `#/flood` (flood simulator), `#/about` (how it works). The browser back button works, and opening a need link switches to the mode it belongs to. On phones the tabs move to a bottom bar.

The interface is available in ไทย, English and 简体中文 (flag menu in the header; defaults to the browser language, remembered in `localStorage`). UI text lives in `src/i18n/` (`en.ts` is the source; `th.ts` and `zh.ts` must have every key or the build fails). The sample needs are content and are not translated yet.

Design: Apple-style, after the "Flood Help Desk" concept. Inter + Noto Sans Thai, white and #f5f5f7 surfaces, near-black ink, one blue accent (#0071e3), red only for urgent, pill buttons (44px minimum, 56px for the one main action on a screen), borderless 18px tiles, a frosted sticky nav, simple inline SVG line icons instead of emoji, and automatic dark mode (follows the system setting). Raw colour values are CSS variables in `src/index.css` (swapped for dark mode) behind Tailwind tokens (`bg-paper`, `bg-card`, `text-ink`, `bg-go`, `text-urgent` …); icons are in `src/lib/icons.ts`. The logo is `public/jaidee-chiangmai-logo.png`; the header mark, favicons, Apple touch icon, PWA icons (`manifest.webmanifest`) link-preview image (`og-image.png`) and home-page logo (`logo-full.png`, transparent) in `public/` are generated from it; shared buttons/cards are in `src/components/ui.tsx`.

State (mode, language, commitments, posted needs) lives in `localStorage`. There is no database. To reset, clear site data in the browser.

## Stack

- Vite + React 19 + TypeScript, Tailwind CSS v4
- Leaflet / react-leaflet with OpenStreetMap tiles (no map API key)
- MapLibre GL with OpenFreeMap vector tiles and AWS Terrain Tiles for the flood simulator (no keys; loaded only on that page)
- `server/index.js`: Express + `@anthropic-ai/sdk`, one endpoint `POST /api/translate-need` using structured JSON output (kept for later; the demo's **Submit** doesn't call it yet). The API key stays on the server. Model defaults to `claude-sonnet-4-5`; override with `CLAUDE_MODEL`.
- `GET /api/conditions` in the same server: live conditions for the header badge (see below)

## Live conditions

The status badge next to the mode switch shows real readings, fetched by the server and cached for 10 minutes (no API keys):

- **Air (Normal and Haze modes):** Air4Thai, Pollution Control Department, station 36t Yupparaj Wittayalai School (35t City Hall if 36t has no reading). Thai AQI scale and wording: 0–25 very good, 26–50 good, 51–100 moderate, 101–200 starting to affect health, 201+ affects health. Haze mode adds PM2.5.
- **River (Flood mode):** Thaiwater (data from the Royal Irrigation Department), gauge P.1 at Nawarat Bridge, in metres on the gauge's own scale, against its 3.7 m critical level.

The emergency modes still pick which needs are shown; the badge always shows the real reading, so Haze mode on a clear day shows good air. Hover the badge for the source, station and time. If the server can't reach a source it keeps the last good reading; if the browser can't reach the server at all, the badge falls back to fixed demo values marked *(demo)*.

`air4thai.pcd.go.th` sends the wrong intermediate certificates, so `server/certs/air4thai-intermediates.pem` adds the right Let's Encrypt ones for that host only (TLS verification stays on). If Air4Thai's certificate changes and the air reading starts failing, check the server log.

## Flood simulator

`#/flood`. A planning tool, not a forecast; the page says so.

- **Model:** the local inertial form of the shallow water (Saint-Venant) equations on a regular grid (Bates, Horritt & Fewtrell 2010, the scheme behind LISFLOOD-FP), with Manning friction, a Froude ≤ 1 limit and a no-overdraw limit for stability on noisy terrain. It runs in a Web Worker on about 135 000 cells of 36 m covering the city from Ring Road 3 to the edge of Saraphi (`src/lib/flood/solver.ts`). A typical run reaches ×400–×700 real time; the page shows the speed actually reached.
- **Ground:** Terrarium terrain tiles (SRTM) at zoom 12, with roofs and trees taken out by a morphological opening and single-cell pits filled (`groundFromSurface`). SRTM in town is still metres out, so depths are a guide to which streets flood first, not exact figures.
- **River:** the Ping centre line from OpenStreetMap (`src/data/pingRiver.ts`). Channel cells take the height of the land beside them (30th percentile within 110 m, smoothed along the river) as their bank; the river is held at that bank + (P.1 level − 3.7 m), so it spills where the terrain allows once P.1 passes its critical level. The river never runs out of water, so long runs show the most a level can flood. `BANK_PERCENTILE` in `grid.ts` is the main thing to tune against a real flood (October 2024).
- **Rain and drains:** rain falls evenly on the area; drains are one figure in mm per hour removed from any wet cell. There is no pipe network yet (no SWMM) because the drain data is not public.
- **Not here yet:** CCTV (needs a feed from the municipality), HEC-RAS or SWMM runs (would need a built model on a server), LiDAR terrain for real street-level depths.

`GET /api/flood` returns every Thaiwater water-level and rain gauge in Chiang Mai province plus the Open-Meteo hourly rain forecast, cached for 10 minutes like `/api/conditions`.

## Layout

```
src/
  App.tsx                 state, filtering, sorting, layout
  lib/router.ts           hash routes (#/need/<id>, #/tasks, …)
  i18n/                   UI text: en.ts (source), th.ts, zh.ts + useI18n()
  data/needs.ts           seed needs (edit here to change the demo)
  lib/categories.ts       category colours, emoji, 14-day TTL (names + safety rules are in i18n/)
  lib/needs.ts            verification / spots helpers
  components/             Header (+ mobile BottomNav), NeedMap, NeedList, NeedDetail, MyTasks, PostNeed, About
server/index.js           Claude endpoint, live conditions and flood feeds, serves dist/ in production
src/lib/conditions.ts     useConditions() + Thai AQI bands for the header badge
src/lib/flood/            flood simulator: grid + river fit, solver, Web Worker, live feeds, MapLibre layers
src/components/FloodSim   the flood simulator page (lazy-loaded)
src/data/pingRiver.ts     Ping River centre line through the city (OpenStreetMap)
```

## Deliberately out of scope for the hackathon

Social login, Nostr-signed verify/check-in/confirm events, real accounts, QR scanning, PWA/offline, donations.
