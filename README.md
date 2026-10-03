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
| **Post a need** | Describe the need in your own words, in any of the app's languages (**Use a sample** fills in an example in the selected language) → **Submit** → a *Submitted* confirmation. Demo only: nothing is sent yet, so no API key is needed. |

Every screen has its own URL (hash routes, so no server config is needed): `#/` home, `#/find` list + map, `#/find?cat=school` filtered list (older `#/?cat=school` links still work), `#/need/<id>` one need (with a Share button), `#/tasks`, `#/post`, `#/about` (how it works). The browser back button works, and opening a need link switches to the mode it belongs to. On phones the tabs move to a bottom bar.

The interface is available in ไทย, English and 简体中文 (flag menu in the header; defaults to the browser language, remembered in `localStorage`). UI text lives in `src/i18n/` (`en.ts` is the source; `th.ts` and `zh.ts` must have every key or the build fails). The sample needs are content and are not translated yet.

Design: Apple-style, after the "Flood Help Desk" concept. Inter + Noto Sans Thai, white and #f5f5f7 surfaces, near-black ink, one blue accent (#0071e3), red only for urgent, pill buttons (44px minimum, 56px for the one main action on a screen), borderless 18px tiles, a frosted sticky nav, simple inline SVG line icons instead of emoji, and automatic dark mode (follows the system setting). Raw colour values are CSS variables in `src/index.css` (swapped for dark mode) behind Tailwind tokens (`bg-paper`, `bg-card`, `text-ink`, `bg-go`, `text-urgent` …); icons are in `src/lib/icons.ts`. The logo is `public/jaidee-chiangmai-logo.png`; the header mark, favicons, Apple touch icon, PWA icons (`manifest.webmanifest`) link-preview image (`og-image.png`) and home-page logo (`logo-full.png`, transparent) in `public/` are generated from it; shared buttons/cards are in `src/components/ui.tsx`.

State (mode, language, commitments, posted needs) lives in `localStorage`. There is no database. To reset, clear site data in the browser.

## Stack

- Vite + React 19 + TypeScript, Tailwind CSS v4
- Leaflet / react-leaflet with OpenStreetMap tiles (no map API key)
- `server/index.js`: Express + `@anthropic-ai/sdk`, one endpoint `POST /api/translate-need` using structured JSON output (kept for later; the demo's **Submit** doesn't call it yet). The API key stays on the server. Model defaults to `claude-sonnet-4-5`; override with `CLAUDE_MODEL`.
- `GET /api/conditions` in the same server: live conditions for the header badge (see below)

## Live conditions

The status badge next to the mode switch shows real readings, fetched by the server and cached for 10 minutes (no API keys):

- **Air (Normal and Haze modes):** Air4Thai, Pollution Control Department, station 36t Yupparaj Wittayalai School (35t City Hall if 36t has no reading). Thai AQI scale and wording: 0–25 very good, 26–50 good, 51–100 moderate, 101–200 starting to affect health, 201+ affects health. Haze mode adds PM2.5.
- **River (Flood mode):** Thaiwater (data from the Royal Irrigation Department), gauge P.1 at Nawarat Bridge, in metres on the gauge's own scale, against its 3.7 m critical level.

The emergency modes still pick which needs are shown; the badge always shows the real reading, so Haze mode on a clear day shows good air. Hover the badge for the source, station and time. If the server can't reach a source it keeps the last good reading; if the browser can't reach the server at all, the badge falls back to fixed demo values marked *(demo)*.

`air4thai.pcd.go.th` sends the wrong intermediate certificates, so `server/certs/air4thai-intermediates.pem` adds the right Let's Encrypt ones for that host only (TLS verification stays on). If Air4Thai's certificate changes and the air reading starts failing, check the server log.

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
server/index.js           Claude endpoint, live conditions, serves dist/ in production
src/lib/conditions.ts     useConditions() + Thai AQI bands for the header badge
```

## Deliberately out of scope for the hackathon

Social login, Nostr-signed verify/check-in/confirm events, real accounts, QR scanning, PWA/offline, donations.
