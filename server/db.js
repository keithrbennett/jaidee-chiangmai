// SQLite through Node's built-in node:sqlite: one file, no service to run. The file lives in data/
// (git-ignored); set DATA_DIR to put it elsewhere. Moving to Postgres later means porting these tables.
import { mkdirSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'

export const DATA_DIR = process.env.DATA_DIR ?? fileURLToPath(new URL('../data/', import.meta.url))
export const UPLOAD_DIR = `${DATA_DIR.replace(/\/$/, '')}/uploads`
mkdirSync(UPLOAD_DIR, { recursive: true })

export const db = new DatabaseSync(process.env.DATABASE_FILE ?? `${DATA_DIR.replace(/\/$/, '')}/jaidee.db`)
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;')

db.exec(`
-- Water level reports from the public: what people see where they are.
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  province TEXT NOT NULL,
  district TEXT,
  tambon TEXT,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  level INTEGER NOT NULL,          -- 0 dry … 5 over head (see LEVELS in src/lib/community.ts)
  trend TEXT,                      -- rising | steady | falling
  passable TEXT,                   -- car | high | boat
  note TEXT,
  photo TEXT,
  still_count INTEGER NOT NULL DEFAULT 0,
  receded_count INTEGER NOT NULL DEFAULT 0,
  last_still_at INTEGER,
  receded_at INTEGER,
  ip_hash TEXT,
  hidden INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS reports_province_time ON reports (province, created_at);

CREATE TABLE IF NOT EXISTS report_votes (
  report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  ip_hash TEXT NOT NULL,
  vote TEXT NOT NULL,              -- still | receded
  created_at INTEGER NOT NULL,
  PRIMARY KEY (report_id, ip_hash)
);

-- Lost and found board (public). The poster gets a private token to mark it resolved.
CREATE TABLE IF NOT EXISTS lost_found (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  province TEXT NOT NULL,
  kind TEXT NOT NULL,              -- lost | found
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  place TEXT,
  contact TEXT NOT NULL,
  photo TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  token_hash TEXT NOT NULL,
  ip_hash TEXT,
  hidden INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS lost_found_province ON lost_found (province, created_at);

-- Missing people. Never public: only staff of the province's command centre (and admins) can read these.
CREATE TABLE IF NOT EXISTS missing_persons (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  province TEXT NOT NULL,
  name TEXT NOT NULL,
  age INTEGER,
  description TEXT,
  last_seen_place TEXT,
  last_seen_at TEXT,
  lat REAL,
  lng REAL,
  reporter_name TEXT NOT NULL,
  reporter_phone TEXT NOT NULL,
  relation TEXT,
  status TEXT NOT NULL DEFAULT 'open', -- open | found | closed
  staff_note TEXT,
  ip_hash TEXT
);

-- Requests for rescue or supplies. Accepted only where a command centre is open; the requester gets a code
-- to check progress.
CREATE TABLE IF NOT EXISTS help_requests (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  province TEXT NOT NULL,
  district TEXT,
  tambon TEXT,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  name TEXT,
  phone TEXT NOT NULL,
  people INTEGER NOT NULL,
  vulnerable TEXT NOT NULL DEFAULT '[]', -- JSON: elderly, children, disabled, sick, pregnant, bedridden
  needs TEXT NOT NULL DEFAULT '[]',      -- JSON: evacuate, food, water, medicine, medical
  water_level INTEGER,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'new',    -- new | assigned | on_the_way | done | cancelled
  team_id TEXT REFERENCES teams(id),
  staff_note TEXT,
  ip_hash TEXT
);
CREATE INDEX IF NOT EXISTS help_province ON help_requests (province, status);

CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  province TEXT NOT NULL,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,              -- boat | truck | medical | volunteer
  phone TEXT,
  status TEXT NOT NULL DEFAULT 'available', -- available | busy | offline
  lat REAL,
  lng REAL,
  located_at INTEGER,
  track_token_hash TEXT,           -- the team's phone shares its location with this link
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS shelters (
  id TEXT PRIMARY KEY,
  province TEXT NOT NULL,
  name TEXT NOT NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  capacity INTEGER,
  occupancy INTEGER,
  contact TEXT,
  status TEXT NOT NULL DEFAULT 'open', -- open | full | closed
  note TEXT,
  updated_at INTEGER NOT NULL
);

-- A province's command centre: when active, the site takes help requests and missing-person reports there.
CREATE TABLE IF NOT EXISTS command_centers (
  province TEXT PRIMARY KEY,
  active INTEGER NOT NULL DEFAULT 0,
  name TEXT,
  hotline TEXT,
  opened_at INTEGER,
  updated_at INTEGER NOT NULL
);

-- Agencies asking to have a command centre opened for their province.
CREATE TABLE IF NOT EXISTS open_requests (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  province TEXT NOT NULL,
  name TEXT NOT NULL,
  position TEXT,
  phone TEXT NOT NULL,
  agency TEXT NOT NULL,
  line_id TEXT,
  details TEXT,
  status TEXT NOT NULL DEFAULT 'new', -- new | approved | declined
  ip_hash TEXT
);

CREATE TABLE IF NOT EXISTS staff (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,              -- admin | staff
  province TEXT,                   -- null for admins
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  staff_id TEXT NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

-- Volunteer needs (Jaidee). Posted by anyone, shown once a staff member has checked them.
CREATE TABLE IF NOT EXISTS needs (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  province TEXT NOT NULL,
  text TEXT NOT NULL,              -- what the poster wrote
  contact TEXT NOT NULL,
  lat REAL,
  lng REAL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | verified | rejected | closed
  card TEXT,                       -- JSON need card filled in by staff when verifying
  verified_by TEXT,
  verified_at INTEGER,
  ip_hash TEXT
);
`)

/** Run a statement and return all rows as plain objects. */
export const all = (sql, ...params) => db.prepare(sql).all(...params).map((r) => ({ ...r }))
export const get = (sql, ...params) => {
  const r = db.prepare(sql).get(...params)
  return r ? { ...r } : null
}
export const run = (sql, ...params) => db.prepare(sql).run(...params)
