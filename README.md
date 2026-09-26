# Jaidee · แผนที่ช่วยกัน (Mutual Aid Map)

Hackathon MVP for Chiang Mai: partner-verified needs (schools, temples, shelters, haze and flood relief) on a map, matched with newcomers who want to help but don't know where to start or speak Thai.

**All data is fictional demo data** (`src/data/needs.ts`).

## Run it

```bash
npm install
cp .env.example .env      # optional: add ANTHROPIC_API_KEY for the Claude feature
npm run dev               # web on http://localhost:5173, API on :8787 (proxied as /api)
```

Single-port demo build:

```bash
npm run build && npm start   # http://localhost:8787 serves the app and the API
```

Everything except "Draft job card with Claude" works without an API key. If you create or edit `.env` while `npm run dev` is running, restart it.

## What's in the demo

| Screen | What it shows |
|---|---|
| **Find a need** | Map + list of verified needs sorted by distance (browser location if shared and near Chiang Mai, otherwise Nimman). Category filter chips. Needs whose verification is older than 14 days are hidden. |
| **Need detail** | Who verified it and when, English + Thai original, skills, spots left, host-confirmed impact progress, safety rules added automatically per category, slot picker, **I'm in** → check-in code (or waitlist when full). |
| **Emergency modes** | 🔴 Haze / 🔵 Flood toggle (admin-only in a real build). Shows only crisis needs, urgent first, with an AQI or Ping River P.1 badge (static demo values). |
| **My tasks** | Your commitments, check-in codes, cancel, and a pledged-hours impact receipt. |
| **Partner: post a need** | Paste Thai text as you'd write it in LINE → Claude drafts a bilingual job card → add it to the map as *pending verification* (volunteers can't join until a partner verifies). |

State (mode, commitments, posted needs) lives in `localStorage`. There is no database. To reset, clear site data in the browser.

## Stack

- Vite + React 19 + TypeScript, Tailwind CSS v4
- Leaflet / react-leaflet with OpenStreetMap tiles (no map API key)
- `server/index.js`: Express + `@anthropic-ai/sdk`, one endpoint `POST /api/translate-need` using structured JSON output. The API key stays on the server. Model defaults to `claude-sonnet-4-5`; override with `CLAUDE_MODEL`.

## Layout

```
src/
  App.tsx                 state, filtering, sorting, layout
  data/needs.ts           seed needs (edit here to change the demo)
  lib/categories.ts       category colours, emoji, auto safety rules, 14-day TTL
  lib/needs.ts            verification / spots helpers
  components/             Header, NeedMap, NeedList, NeedDetail, MyTasks, PostNeed
server/index.js           Claude endpoint + serves dist/ in production
```

## Deliberately out of scope for the hackathon

LINE login, Nostr-signed verify/check-in/confirm events, real accounts, QR scanning, live AQI and river-level feeds, PWA/offline, donations.
