import type { Map as MlMap } from 'maplibre-gl'
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { PROVINCES } from '../../data/provinces'
import { useI18n } from '../../i18n'
import { ApiError, api, type ReportCheck, type Tri } from '../../lib/api'
import { addLayer, setSource } from '../../lib/map/layers'
import { clock } from '../../lib/time'
import { LEVEL_COLOR } from '../../lib/water'
import { Icon } from '../Icon'
import { Button } from '../ui'
import { Ago, CheckBadge, Choices, Field, LocationPicker, MapBox, inputCls } from '../kit'
import { Orb } from '../assistant/Orb'
import { MapView, errorText, provinceName, useLocale } from '../../lib/ui'

interface Staff {
  id: string
  username: string
  name: string
  role: 'admin' | 'staff'
  province: string | null
}
interface HelpRow {
  id: string
  code: string
  created_at: number
  updated_at: number
  lat: number
  lng: number
  name: string | null
  phone: string
  people: number
  vulnerable: string[]
  needs: string[]
  water_level: number | null
  note: string | null
  status: string
  team_id: string | null
  staff_note: string | null
}
interface Team {
  id: string
  name: string
  kind: string
  phone: string | null
  status: string
  lat: number | null
  lng: number | null
  located_at: number | null
}
/** What น้องใจดี found about one item (server/ai/checks.js, staffCheck). */
interface StaffCheck {
  verdict: string | null
  score: number | null
  summary: Tri | null
  details: {
    evidence?: { gauges: { name: string; status: string; km: number }[]; rainMax24h: number | null; satCellsWithin1km: number | null; otherReports: { wet: number } }
    ai?: { staff_note?: string; flags?: Record<string, boolean>; reason_th?: string }
    draft?: Partial<NeedDraft>
    flags?: Record<string, boolean>
  } | null
  translation: { language: string; languageTh?: string; th: string; en: string } | null
  byAi: boolean
  checkedAt: number
}
interface NeedDraft {
  title: string
  description: string
  category: string
  urgent: boolean
  place: string
  partner: string
  when: string
  hours: number
  spots: number
  skills: string
}
type Checks = Record<'help' | 'missing' | 'need' | 'report' | 'lost', Record<string, StaffCheck>>

interface Overview {
  province: string
  commandCenter: { active: number; name: string | null; hotline: string | null }
  help: HelpRow[]
  teams: Team[]
  missing: Record<string, string | number | null>[]
  shelters: Record<string, string | number | null>[]
  needs: { id: string; created_at: number; text: string; contact: string; lat: number | null; lng: number | null }[]
  reports: { id: string; created_at: number; level: number; note: string | null; hidden: number; photo: string | null }[]
  lostHeld: { id: string; created_at: number; kind: string; title: string; description: string | null; contact: string; photo: string | null }[]
  contacts: { id: string; name: string; phone: string; kind: string; note: string | null }[]
  checks: Checks
}
type Tab = 'help' | 'teams' | 'missing' | 'shelters' | 'needs' | 'reports' | 'settings' | 'admin' | 'account'

const HELP_COLORS: Record<string, string> = { new: '#ff3b30', assigned: '#ff9500', on_the_way: '#0a84ff', done: '#34c759', cancelled: '#8e8e93' }

export function Command() {
  const { m } = useI18n()
  const [me, setMe] = useState<Staff | null | undefined>(undefined)
  useEffect(() => {
    api<Staff>('/staff/me')
      .then(setMe)
      .catch(() => setMe(null))
  }, [])
  if (me === undefined) return <div className="p-6 text-muted">{m.common.loading}</div>
  if (!me) return <Login onIn={setMe} />
  return <Dashboard me={me} onOut={() => setMe(null)} />
}

function Login({ onIn }: { onIn: (s: Staff) => void }) {
  const { m } = useI18n()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(false)
  return (
    <form
      className="mx-auto w-full flex max-w-sm flex-col gap-4 px-4 py-10"
      onSubmit={async (e) => {
        e.preventDefault()
        try {
          onIn(await api<Staff>('/staff/login', { body: { username, password } }))
        } catch {
          setError(true)
        }
      }}
    >
      <h1 className="text-[30px] font-bold">{m.command.title}</h1>
      <Field label={m.command.username}>
        <input className={inputCls} autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
      </Field>
      <Field label={m.command.password}>
        <input className={inputCls} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      {error && <p className="font-semibold text-urgent">{m.command.wrong}</p>}
      <Button main>{m.command.signIn}</Button>
    </form>
  )
}

function Dashboard({ me, onOut }: { me: Staff; onOut: () => void }) {
  const { m, lang } = useI18n()
  const [province, setProvince] = useState(me.province ?? '10')
  const [tab, setTab] = useState<Tab>('help')
  const [data, setData] = useState<Overview | null>(null)
  const load = useCallback(() => {
    api<Overview>(`/staff/overview?province=${province}`)
      .then(setData)
      .catch((err) => err instanceof ApiError && err.status === 401 && onOut())
  }, [province, onOut])
  useEffect(() => {
    load()
    const t = setInterval(load, 20_000)
    return () => clearInterval(t)
  }, [load])
  const tabs: Tab[] = ['help', 'teams', 'missing', 'shelters', 'needs', 'reports', 'settings', ...(me.role === 'admin' ? (['admin'] as Tab[]) : []), 'account']
  const counts: Partial<Record<Tab, number>> = {
    help: data?.help.filter((h) => h.status === 'new').length,
    missing: data?.missing.filter((x) => x.status === 'open').length,
    needs: data?.needs.length,
  }
  return (
    <div className="mx-auto w-full flex max-w-6xl flex-col gap-5 px-4 py-5 md:px-6">
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-[28px] font-bold">{m.command.title}</h1>
        {me.role === 'admin' ? (
          <select className={`${inputCls} w-auto`} value={province} onChange={(e) => setProvince(e.target.value)} aria-label={m.command.province}>
            {[...PROVINCES]
              .sort((a, b) => provinceName(a, lang).localeCompare(provinceName(b, lang), lang))
              .map((p) => (
                <option key={p.code} value={p.code}>
                  {provinceName(p, lang)}
                </option>
              ))}
          </select>
        ) : (
          <b>{provinceName(PROVINCES.find((p) => p.code === province)!, lang)}</b>
        )}
        <span className="text-sm text-muted">{m.command.signedInAs(me.name)}</span>
        <button
          onClick={async () => {
            await api('/staff/logout', { body: {} }).catch(() => {})
            onOut()
          }}
          className="rounded-full border border-line px-4 py-2 font-medium"
        >
          {m.command.signOut}
        </button>
      </header>
      {data && (
        <p className={`rounded-[14px] px-4 py-3 font-semibold ${data.commandCenter.active ? 'bg-[#34c759]/15 text-[#248a3d]' : 'bg-paper text-muted'}`}>
          {data.commandCenter.active ? m.command.center.active : m.command.center.inactive}
        </p>
      )}
      <nav className="flex flex-wrap gap-1.5">
        {tabs.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`inline-flex min-h-10 items-center gap-1.5 rounded-full px-4 font-medium ${tab === t ? 'bg-go text-white' : 'bg-card'}`}>
            {m.command.tabs[t]}
            {!!counts[t] && <span className="rounded-full bg-urgent px-1.5 text-xs font-bold text-white">{counts[t]}</span>}
          </button>
        ))}
      </nav>
      {!data ? (
        <p className="text-muted">{m.common.loading}</p>
      ) : (
        <>
          {tab === 'help' && <HelpTab data={data} reload={load} />}
          {tab === 'teams' && <TeamsTab data={data} reload={load} />}
          {tab === 'missing' && <MissingTab data={data} reload={load} />}
          {tab === 'shelters' && <SheltersTab data={data} reload={load} />}
          {tab === 'needs' && <NeedsTab data={data} reload={load} />}
          {tab === 'reports' && <ReportsTab data={data} reload={load} />}
          {tab === 'settings' && <SettingsTab data={data} reload={load} />}
          {tab === 'admin' && <AdminTab />}
          {tab === 'account' && <AccountTab />}
        </>
      )}
    </div>
  )
}

function Card({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-2 rounded-[16px] bg-card p-4">{children}</div>
}

const patch = (path: string, body: unknown) => api(path, { method: 'PATCH', body })

function HelpTab({ data, reload }: { data: Overview; reload: () => void }) {
  const { m } = useI18n()
  const mapRef = useRef<MlMap | null>(null)
  const draw = useCallback(
    (map: MlMap) => {
      if (!map.getSource('osm')) return
      setSource(map, 'jd-help', {
        type: 'FeatureCollection',
        features: data.help.map((h) => ({ type: 'Feature', properties: { color: HELP_COLORS[h.status] }, geometry: { type: 'Point', coordinates: [h.lng, h.lat] } })),
      })
      setSource(map, 'jd-teams', {
        type: 'FeatureCollection',
        features: data.teams.filter((t) => t.lat !== null).map((t) => ({ type: 'Feature', properties: { name: t.name }, geometry: { type: 'Point', coordinates: [t.lng!, t.lat!] } })),
      })
      addLayer(map, { id: 'jd-help', type: 'circle', source: 'jd-help', paint: { 'circle-radius': 9, 'circle-color': ['get', 'color'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 2.5 } }, undefined)
      addLayer(map, { id: 'jd-teams', type: 'circle', source: 'jd-teams', paint: { 'circle-radius': 7, 'circle-color': '#5856d6', 'circle-stroke-color': '#fff', 'circle-stroke-width': 3 } }, undefined)
      addLayer(
        map,
        {
          id: 'jd-teams-label',
          type: 'symbol',
          source: 'jd-teams',
          layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Bold'], 'text-size': 12, 'text-offset': [0, 1.2], 'text-anchor': 'top' },
          paint: { 'text-color': '#5856d6', 'text-halo-color': '#fff', 'text-halo-width': 1.5 },
        },
        undefined,
      )
    },
    [data],
  )
  const drawRef = useRef(draw)
  useEffect(() => {
    drawRef.current = draw
    if (mapRef.current) draw(mapRef.current)
  }, [draw])
  const prov = PROVINCES.find((p) => p.code === data.province)!
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.1fr]">
      <MapBox className="h-[50vh] min-h-[340px] lg:sticky lg:top-24">
        <MapView bounds={prov.bbox as [number, number, number, number]} pitch={30} onMap={(map) => (mapRef.current = map)} onStyle={(map) => drawRef.current(map)} />
      </MapBox>
      <div className="flex flex-col gap-3">
        {!data.help.length && <p className="text-muted">{m.command.help.none}</p>}
        {[...data.help]
          // New requests: the most urgent first (น้องใจดี's triage), then oldest first as the server sends them.
          .sort((a, b) => (a.status === 'new' && b.status === 'new' ? (data.checks.help[b.id]?.score ?? 0) - (data.checks.help[a.id]?.score ?? 0) : 0))
          .map((h) => (
            <HelpCard key={h.id} h={h} check={data.checks.help[h.id]} teams={data.teams} reload={reload} onFocus={() => mapRef.current?.flyTo({ center: [h.lng, h.lat], zoom: 15 })} />
          ))}
      </div>
    </div>
  )
}

const URGENCY_COLOR = ['', '#8e8e93', '#ff9500', '#ff3b30']

function HelpCard({ h, check, teams, reload, onFocus }: { h: HelpRow; check?: StaffCheck; teams: Team[]; reload: () => void; onFocus: () => void }) {
  const { m } = useI18n()
  const [note, setNote] = useState(h.staff_note ?? '')
  const urgency = check?.score ?? 0
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full px-2.5 py-0.5 text-sm font-bold text-white" style={{ background: HELP_COLORS[h.status] }}>
          {m.helpStatus.statuses[h.status]}
        </span>
        {urgency > 0 && h.status === 'new' && (
          <span className={`rounded-full px-2.5 py-0.5 text-sm font-bold text-white ${urgency === 3 ? 'ring-pulse' : ''}`} style={{ background: URGENCY_COLOR[urgency] }}>
            {m.command.ai.urgency[urgency]}
          </span>
        )}
        <b>{h.code}</b>
        <span className="text-sm text-muted">
          <Ago when={h.created_at} />
        </span>
        <button onClick={onFocus} className="ml-auto text-sm font-semibold text-link">
          {m.common.seeMap}
        </button>
      </div>
      <p className="text-lg font-semibold">
        {m.command.help.people(h.people)}
        {h.water_level !== null && (
          <span className="ml-2 inline-flex items-center gap-1 text-[15px]">
            <span className="h-3 w-3 rounded-full" style={{ background: LEVEL_COLOR[h.water_level] }} />
            {m.levels.short[h.water_level]}
          </span>
        )}
      </p>
      {(h.vulnerable.length > 0 || h.needs.length > 0) && (
        <p>
          {[...h.vulnerable.map((v) => m.help.vulnerable[v]), ...h.needs.map((n) => m.help.needs[n])].join(' · ')}
        </p>
      )}
      {check?.byAi && check.summary?.th && <AiNote>{check.summary.th}</AiNote>}
      {h.note && <p className="text-muted">{h.note}</p>}
      {check?.translation && <Translation t={check.translation} />}
      <div className="flex flex-wrap gap-2">
        <a href={`tel:${h.phone}`} className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-[#34c759] px-4 font-semibold text-white">
          <Icon name="phone" size={18} /> {h.name ? `${h.name} · ` : ''}
          {h.phone}
        </a>
        <a
          href={`https://www.google.com/maps/dir/?api=1&destination=${h.lat},${h.lng}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-paper px-4 font-semibold"
        >
          <Icon name="pin" size={18} /> {m.command.help.directions}
        </a>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <select className={inputCls} value={h.status} onChange={(e) => patch(`/staff/help/${h.id}`, { status: e.target.value }).then(reload)} aria-label={m.command.help.setStatus}>
          {Object.entries(m.helpStatus.statuses).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <select
          className={inputCls}
          value={h.team_id ?? ''}
          onChange={(e) => patch(`/staff/help/${h.id}`, { teamId: e.target.value || null, ...(e.target.value && h.status === 'new' ? { status: 'assigned' } : {}) }).then(reload)}
          aria-label={m.command.help.assign}
        >
          <option value="">{m.command.help.noTeam}</option>
          {teams.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} · {m.command.teams.statuses[t.status]}
            </option>
          ))}
        </select>
      </div>
      <div className="flex gap-2">
        <input className={inputCls} placeholder={m.command.help.note} value={note} onChange={(e) => setNote(e.target.value)} />
        <Button variant="secondary" onClick={() => patch(`/staff/help/${h.id}`, { staffNote: note }).then(reload)}>
          {m.common.save}
        </Button>
      </div>
    </Card>
  )
}

function TeamsTab({ data, reload }: { data: Overview; reload: () => void }) {
  const { m } = useI18n()
  const [name, setName] = useState('')
  const [kind, setKind] = useState('boat')
  const [phone, setPhone] = useState('')
  const [link, setLink] = useState<{ team: string; url: string } | null>(null)
  const showLink = (team: string, token: string) => setLink({ team, url: `${window.location.origin}/#/track/${token}` })
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <b>{m.command.teams.add}</b>
        <div className="grid gap-2 sm:grid-cols-3">
          <input className={inputCls} placeholder={m.command.teams.name} value={name} onChange={(e) => setName(e.target.value)} />
          <select className={inputCls} value={kind} onChange={(e) => setKind(e.target.value)}>
            {Object.entries(m.command.teams.kinds).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <input className={inputCls} placeholder={m.command.teams.phone} value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <Button
          disabled={!name.trim()}
          onClick={async () => {
            const res = await api<{ trackToken: string }>('/staff/teams', { body: { province: data.province, name, kind, phone: phone || null } })
            showLink(name, res.trackToken)
            setName('')
            setPhone('')
            reload()
          }}
        >
          {m.command.teams.add}
        </Button>
      </Card>
      {link && (
        <Card>
          <b>
            {m.command.teams.link}: {link.team}
          </b>
          <input readOnly className={inputCls} value={link.url} onFocus={(e) => e.target.select()} />
          <p className="text-sm text-muted">{m.command.teams.linkNote}</p>
        </Card>
      )}
      {data.teams.map((t) => (
        <Card key={t.id}>
          <div className="flex flex-wrap items-center gap-2">
            <b className="text-lg">{t.name}</b>
            <span className="text-muted">{m.command.teams.kinds[t.kind]}</span>
            {t.phone && (
              <a href={`tel:${t.phone}`} className="text-link">
                {t.phone}
              </a>
            )}
            <span className="ml-auto text-sm text-muted">{t.located_at ? m.command.teams.lastSeen(agoShort(t.located_at, m)) : m.command.teams.noLocation}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Choices options={Object.entries(m.command.teams.statuses)} value={t.status} onChange={(v) => patch(`/staff/teams/${t.id}`, { status: v }).then(reload)} />
            <Button
              variant="secondary"
              onClick={async () => {
                const res = await api<{ trackToken: string }>(`/staff/teams/${t.id}/link`, { body: {} })
                showLink(t.name, res.trackToken)
              }}
            >
              {m.command.teams.newLink}
            </Button>
            <Button variant="danger" onClick={() => api(`/staff/teams/${t.id}`, { method: 'DELETE' }).then(reload)}>
              {m.command.teams.remove}
            </Button>
          </div>
        </Card>
      ))}
    </div>
  )
}

function agoShort(ts: number, m: ReturnType<typeof useI18n>['m']) {
  const min = Math.round((Date.now() - ts) / 60_000)
  return min < 60 ? m.common.minutes(min) : m.common.hours(Math.round(min / 60))
}

function MissingTab({ data, reload }: { data: Overview; reload: () => void }) {
  const { m } = useI18n()
  const f = m.missing.form
  if (!data.missing.length) return <p className="text-muted">{m.command.missing.none}</p>
  return (
    <div className="flex flex-col gap-3">
      {data.missing.map((x) => (
        <Card key={String(x.id)}>
          <div className="flex flex-wrap items-center gap-2">
            <b className="text-lg">
              {x.name}
              {x.age !== null && `, ${x.age}`}
            </b>
            <span className="ml-auto text-sm text-muted">
              <Ago when={Number(x.created_at)} />
            </span>
          </div>
          {x.description && <p>{x.description}</p>}
          {data.checks.missing[String(x.id)]?.translation && <Translation t={data.checks.missing[String(x.id)].translation!} />}
          <p className="text-muted">
            {f.lastSeenPlace}: {x.last_seen_place ?? '–'} · {f.lastSeenAt}: {x.last_seen_at ?? '–'}
          </p>
          <p>
            {m.command.missing.reporter}: {x.reporter_name} ({x.relation ?? '–'}) ·{' '}
            <a href={`tel:${x.reporter_phone}`} className="font-semibold text-link">
              {x.reporter_phone}
            </a>
          </p>
          <Choices options={Object.entries(m.command.missing.statuses)} value={String(x.status)} onChange={(v) => patch(`/staff/missing/${x.id}`, { status: v }).then(reload)} />
        </Card>
      ))}
    </div>
  )
}

function SheltersTab({ data, reload }: { data: Overview; reload: () => void }) {
  const { m } = useI18n()
  const s = m.command.shelters
  const prov = PROVINCES.find((p) => p.code === data.province)!
  const [where, setWhere] = useState<[number, number] | null>(null)
  const [v, setV] = useState({ name: '', capacity: '', contact: '' })
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <b>{s.add}</b>
        <input className={inputCls} placeholder={s.name} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
        <div className="grid gap-2 sm:grid-cols-2">
          <input className={inputCls} placeholder={s.capacity} inputMode="numeric" value={v.capacity} onChange={(e) => setV({ ...v, capacity: e.target.value.replace(/\D/g, '') })} />
          <input className={inputCls} placeholder={s.contact} value={v.contact} onChange={(e) => setV({ ...v, contact: e.target.value })} />
        </div>
        <LocationPicker value={where} onChange={setWhere} center={prov.center} />
        <Button
          disabled={!v.name.trim() || !where}
          onClick={async () => {
            await api('/staff/shelters', { body: { province: data.province, name: v.name, lng: where![0], lat: where![1], capacity: v.capacity ? Number(v.capacity) : null, contact: v.contact || null } })
            setV({ name: '', capacity: '', contact: '' })
            setWhere(null)
            reload()
          }}
        >
          {s.add}
        </Button>
      </Card>
      {data.shelters.map((x) => (
        <Card key={String(x.id)}>
          <b className="text-lg">{x.name}</b>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-2">
              {s.occupancy}
              <input
                className={`${inputCls} w-28`}
                inputMode="numeric"
                defaultValue={x.occupancy === null ? '' : String(x.occupancy)}
                onBlur={(e) => patch(`/staff/shelters/${x.id}`, { occupancy: e.target.value ? Number(e.target.value) : null }).then(reload)}
              />
              / {x.capacity ?? '–'}
            </label>
            <Choices options={Object.entries(s.statuses)} value={String(x.status)} onChange={(st) => patch(`/staff/shelters/${x.id}`, { status: st }).then(reload)} />
          </div>
        </Card>
      ))}
    </div>
  )
}

function NeedsTab({ data, reload }: { data: Overview; reload: () => void }) {
  const { m } = useI18n()
  if (!data.needs.length) return <p className="text-muted">{m.command.needs.none}</p>
  return (
    <div className="flex flex-col gap-3">
      {data.needs.map((n) => (
        <NeedCheck key={`${n.id}-${data.checks.need[n.id]?.checkedAt ?? 0}`} n={n} check={data.checks.need[n.id]} province={data.province} reload={reload} />
      ))}
    </div>
  )
}

function NeedCheck({ n, check, province, reload }: { n: Overview['needs'][number]; check?: StaffCheck; province: string; reload: () => void }) {
  const { m } = useI18n()
  const F = m.command.needs.fields
  const prov = PROVINCES.find((p) => p.code === province)!
  const [where, setWhere] = useState<[number, number] | null>(n.lat !== null && n.lng !== null ? [n.lng, n.lat] : null)
  // น้องใจดี drafts the card from the post (server/ai/checks.js); staff check and edit it before publishing.
  const d = check?.details?.draft
  const [c, setC] = useState({
    title: d?.title ?? '',
    description: d?.description || n.text,
    category: d?.category ?? 'flood',
    urgent: d?.urgent ?? false,
    place: d?.place ?? '',
    partner: d?.partner ?? '',
    contact: n.contact,
    when: d?.when ?? '',
    hours: String(d?.hours ?? 2),
    spots: String(d?.spots ?? 4),
    skills: d?.skills ?? '',
  })
  const [error, setError] = useState<string | null>(null)
  const set = (k: keyof typeof c) => (e: { target: { value: string } }) => setC({ ...c, [k]: e.target.value })
  return (
    <Card>
      <p className="text-sm font-semibold text-muted">
        {m.command.needs.posted} · <Ago when={n.created_at} />
      </p>
      <p className="whitespace-pre-wrap rounded-[12px] bg-paper p-3">{n.text}</p>
      {check?.verdict === 'caution' && check.summary?.th && <p className="rounded-[12px] bg-[#ffcc00]/22 px-3 py-2 font-medium text-[#7a5a00]">{m.command.ai.caution}: {check.summary.th}</p>}
      {d && <AiNote>{m.command.ai.draftReady}</AiNote>}
      <div className="grid gap-2 sm:grid-cols-2">
        <input className={inputCls} placeholder={F.title} value={c.title} onChange={set('title')} />
        <select className={inputCls} value={c.category} onChange={set('category')} aria-label={F.category}>
          {Object.entries(m.categories).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <input className={inputCls} placeholder={F.place} value={c.place} onChange={set('place')} />
        <input className={inputCls} placeholder={F.partner} value={c.partner} onChange={set('partner')} />
        <input className={inputCls} placeholder={F.contact} value={c.contact} onChange={set('contact')} />
        <input className={inputCls} placeholder={F.when} value={c.when} onChange={set('when')} />
        <input className={inputCls} placeholder={F.hours} inputMode="decimal" value={c.hours} onChange={set('hours')} />
        <input className={inputCls} placeholder={F.spots} inputMode="numeric" value={c.spots} onChange={set('spots')} />
      </div>
      <textarea className={`${inputCls} min-h-24 py-2`} placeholder={F.description} value={c.description} onChange={set('description')} />
      <input className={inputCls} placeholder={F.skills} value={c.skills} onChange={set('skills')} />
      <label className="flex items-center gap-2">
        <input type="checkbox" checked={c.urgent} onChange={(e) => setC({ ...c, urgent: e.target.checked })} /> {F.urgent}
      </label>
      <LocationPicker value={where} onChange={setWhere} center={prov.center} />
      {error && <p className="font-semibold text-urgent">{error}</p>}
      <div className="flex gap-2">
        <Button
          onClick={async () => {
            setError(null)
            try {
              await patch(`/staff/needs/${n.id}`, {
                status: 'verified',
                card: { ...c, hours: Number(c.hours), spots: Number(c.spots), skills: c.skills.split(',').map((x) => x.trim()).filter(Boolean), lng: where?.[0], lat: where?.[1] },
              })
              reload()
            } catch (err) {
              setError(errorText(err, m))
            }
          }}
        >
          {m.command.needs.publish}
        </Button>
        <Button variant="danger" onClick={() => patch(`/staff/needs/${n.id}`, { status: 'rejected' }).then(reload)}>
          {m.command.needs.reject}
        </Button>
      </div>
    </Card>
  )
}

function ReportsTab({ data, reload }: { data: Overview; reload: () => void }) {
  const { m } = useI18n()
  const locale = useLocale()
  const A = m.command.ai
  const [busy, setBusy] = useState<string | null>(null)
  const recheck = async (kind: string, id: string) => {
    setBusy(id)
    await api(`/staff/checks/${kind}/${id}`, { body: {} }).catch(() => {})
    setBusy(null)
    reload()
  }
  return (
    <div className="flex flex-col gap-4">
      {data.lostHeld.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-lg font-bold">{A.heldLost}</h2>
          {data.lostHeld.map((p) => {
            const c = data.checks.lost[p.id]
            return (
              <Card key={p.id}>
                <p className="font-semibold">{p.title}</p>
                {p.description && <p className="text-muted">{p.description}</p>}
                {c?.details?.ai?.staff_note && <AiNote>{c.details.ai.staff_note}</AiNote>}
                <div className="flex gap-2">
                  <button onClick={() => patch(`/staff/lost/${p.id}`, { hidden: false }).then(reload)} className="rounded-full bg-go px-4 py-1.5 text-sm font-semibold text-white">
                    {A.publish}
                  </button>
                  <button onClick={() => patch(`/staff/lost/${p.id}`, { hidden: true }).then(reload)} className="rounded-full bg-paper px-4 py-1.5 text-sm font-semibold">
                    {A.keepHidden}
                  </button>
                </div>
              </Card>
            )
          })}
        </section>
      )}
      <ul className="flex flex-col gap-2">
        {data.reports.map((r) => {
          const c = data.checks.report[r.id]
          const check: ReportCheck | null = c?.verdict ? { verdict: c.verdict as ReportCheck['verdict'], reason: c.summary, ai: c.byAi } : null
          const ev = c?.details?.evidence
          const held = r.hidden === 2
          return (
            <li key={r.id} className={`flex flex-col gap-2 rounded-[14px] bg-card p-3 ${r.hidden === 1 ? 'opacity-50' : ''} ${held ? 'ring-2 ring-[#ff9500]' : ''}`}>
              <div className="flex items-center gap-3">
                <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: LEVEL_COLOR[r.level] }} />
                <span className="min-w-0 flex-1">
                  {m.levels.names[r.level]} · {clock(r.created_at, locale)}
                  {r.note && <span className="block text-sm text-muted">{r.note}</span>}
                </span>
                {r.photo && <img src={`/api/photos/${r.photo}`} alt="" className="h-14 w-14 rounded-lg object-cover" />}
              </div>
              {held && <p className="text-sm font-semibold text-[#a64b00]">{A.held}</p>}
              <div className="flex flex-wrap items-center gap-2">
                <CheckBadge check={check} reason />
              </div>
              {c?.details?.ai?.staff_note && <AiNote>{c.details.ai.staff_note}</AiNote>}
              {ev && (
                <p className="text-[13px] text-faint">
                  {A.evidence}:{' '}
                  {[
                    ...ev.gauges.slice(0, 2).map((g) => `${g.name} ${m.status[g.status as 'over'] ?? g.status} (${g.km} km)`),
                    ev.rainMax24h !== null && A.rain(ev.rainMax24h),
                    ev.satCellsWithin1km ? A.sat(ev.satCellsWithin1km) : null,
                    ev.otherReports.wet ? A.others(ev.otherReports.wet) : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  {!c?.byAi && ` · ${A.rulesOnly}`}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <button onClick={() => patch(`/staff/reports/${r.id}`, { hidden: r.hidden === 0 }).then(reload)} className="rounded-full bg-paper px-3 py-1.5 text-sm font-semibold">
                  {r.hidden ? m.command.reports.show : m.command.reports.hide}
                </button>
                <button onClick={() => recheck('report', r.id)} disabled={busy === r.id} className="rounded-full bg-paper px-3 py-1.5 text-sm font-semibold text-link">
                  {busy === r.id ? A.checking : A.recheck}
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** A note from น้องใจดี: its face, then the text. */
function AiNote({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-[12px] bg-go-soft/70 px-3 py-2 text-[15px] leading-snug">
      <Orb size={20} className="mt-0.5" />
      <span>{children}</span>
    </p>
  )
}

/** A translation for staff (the original stays above it, as sent): Thai first, then English. */
function Translation({ t }: { t: NonNullable<StaffCheck['translation']> }) {
  const { m, lang } = useI18n()
  return (
    <div className="rounded-[12px] border border-go/25 bg-card px-3 py-2 text-[15px]">
      <p className="text-[13px] font-semibold text-go">{m.command.ai.translated(lang === 'th' ? (t.languageTh ?? t.language) : t.language)}</p>
      <p>{t.th}</p>
      {t.en && <p className="text-[14px] text-muted">{t.en}</p>}
    </div>
  )
}

function SettingsTab({ data, reload }: { data: Overview; reload: () => void }) {
  const { m } = useI18n()
  const C = m.command.center
  const [name, setName] = useState(data.commandCenter.name ?? '')
  const [hotline, setHotline] = useState(data.commandCenter.hotline ?? '')
  const [saved, setSaved] = useState(false)
  const save = async (active: boolean) => {
    await api(`/staff/command-center/${data.province}`, { method: 'PUT', body: { active, name: name || null, hotline: hotline || null } })
    setSaved(true)
    reload()
  }
  return (
    <>
    <Card>
      <Field label={C.name}>
        <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label={C.hotline}>
        <input className={inputCls} value={hotline} onChange={(e) => setHotline(e.target.value)} />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => save(!!data.commandCenter.active)}>{m.common.save}</Button>
        {data.commandCenter.active ? (
          <Button variant="danger" onClick={() => save(false)}>
            {C.close}
          </Button>
        ) : (
          <Button variant="ask" onClick={() => save(true)}>
            {C.open}
          </Button>
        )}
      </div>
      {saved && <p className="text-[#248a3d]">{C.saved}</p>}
    </Card>
    <ContactsEditor data={data} reload={reload} />
    </>
  )
}

const CONTACT_KINDS = ['ddpm', 'hospital', 'police', 'fire', 'rescue', 'local', 'other']

/** Numbers this province publishes on its "emergency numbers" page, next to the national lines. */
function ContactsEditor({ data, reload }: { data: Overview; reload: () => void }) {
  const { m } = useI18n()
  const K = m.contacts
  const E = m.command.contacts
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [kind, setKind] = useState('ddpm')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  return (
    <Card>
      <h2 className="text-lg font-bold">{E.title}</h2>
      <p className="text-[15px] text-muted">{E.intro}</p>
      {data.contacts.length > 0 && (
        <ul className="flex flex-col divide-y divide-line/60 rounded-[12px] bg-paper">
          {data.contacts.map((c) => (
            <li key={c.id} className="flex items-center gap-3 px-3 py-2">
              <span className="min-w-0 flex-1">
                <b>{c.name}</b> <span className="text-muted">· {K.localKinds[c.kind] ?? c.kind}</span>
                {c.note && <span className="block text-sm text-muted">{c.note}</span>}
              </span>
              <span className="tabular-nums">{c.phone}</span>
              <button onClick={() => api(`/staff/contacts/${c.id}`, { method: 'DELETE' }).then(reload)} className="rounded-full bg-card px-3 py-1 text-sm font-semibold text-urgent">
                {E.remove}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        <input className={inputCls} placeholder={E.name} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
        <input className={inputCls} placeholder={E.phone} value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={40} inputMode="tel" />
        <select className={inputCls} value={kind} onChange={(e) => setKind(e.target.value)} aria-label={E.kind}>
          {CONTACT_KINDS.map((k) => (
            <option key={k} value={k}>
              {K.localKinds[k]}
            </option>
          ))}
        </select>
        <input className={inputCls} placeholder={E.note} value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} />
      </div>
      {error && <p className="font-semibold text-urgent">{error}</p>}
      <div>
        <Button
          disabled={!name.trim() || !phone.trim()}
          onClick={async () => {
            setError(null)
            try {
              await api('/staff/contacts', { body: { province: data.province, name, phone, kind, note: note || null } })
              setName('')
              setPhone('')
              setNote('')
              reload()
            } catch (err) {
              setError(errorText(err, m))
            }
          }}
        >
          {E.add}
        </Button>
      </div>
    </Card>
  )
}

function AdminTab() {
  const { m, lang } = useI18n()
  const A = m.command.admin
  const [data, setData] = useState<{ staff: Staff[]; openRequests: Record<string, string | number | null>[] } | null>(null)
  const load = useCallback(() => {
    api<typeof data>('/staff/admin').then(setData)
  }, [])
  useEffect(load, [load])
  const [v, setV] = useState({ username: '', name: '', role: 'staff', province: '50' })
  const [created, setCreated] = useState<{ username: string; password: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <b>{A.newAccount}</b>
        <div className="grid gap-2 sm:grid-cols-2">
          <input className={inputCls} placeholder={m.command.username} value={v.username} onChange={(e) => setV({ ...v, username: e.target.value })} />
          <input className={inputCls} placeholder={m.open.form.name} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />
          <select className={inputCls} value={v.role} onChange={(e) => setV({ ...v, role: e.target.value })} aria-label={A.role}>
            {Object.entries(A.roles).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
          {v.role === 'staff' && (
            <select className={inputCls} value={v.province} onChange={(e) => setV({ ...v, province: e.target.value })} aria-label={m.command.province}>
              {[...PROVINCES]
                .sort((a, b) => provinceName(a, lang).localeCompare(provinceName(b, lang), lang))
                .map((p) => (
                  <option key={p.code} value={p.code}>
                    {provinceName(p, lang)}
                  </option>
                ))}
            </select>
          )}
        </div>
        {error && <p className="text-urgent">{error}</p>}
        <Button
          disabled={!v.username.trim() || !v.name.trim()}
          onClick={async () => {
            setError(null)
            try {
              setCreated(await api('/staff/accounts', { body: v }))
              load()
            } catch (err) {
              setError(errorText(err, m))
            }
          }}
        >
          {A.newAccount}
        </Button>
        {created && (
          <div className="rounded-[12px] bg-[#ffcc00]/20 p-3">
            <p className="font-semibold">{A.created(created.username, created.password)}</p>
            <p className="text-sm">{A.createdNote}</p>
          </div>
        )}
      </Card>
      <Card>
        <b>{A.accounts}</b>
        <ul>
          {data?.staff.map((s) => (
            <li key={s.id} className="py-1">
              {s.username} · {s.name} · {A.roles[s.role]}
              {s.province && ` · ${provinceName(PROVINCES.find((p) => p.code === s.province)!, lang)}`}
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <b>{A.requests}</b>
        {!data?.openRequests.length && <p className="text-muted">{A.noRequests}</p>}
        {data?.openRequests.map((r) => (
          <div key={String(r.id)} className="flex flex-col gap-1 border-t border-line py-2">
            <p>
              <b>{r.agency}</b> · {provinceName(PROVINCES.find((p) => p.code === r.province)!, lang)} · {String(r.status)}
            </p>
            <p>
              {r.name} {r.position && `(${r.position})`} ·{' '}
              <a href={`tel:${r.phone}`} className="text-link">
                {r.phone}
              </a>
              {r.line_id && ` · LINE ${r.line_id}`}
            </p>
            {r.details && <p className="text-muted">{r.details}</p>}
            {r.status === 'new' && (
              <div className="flex gap-2">
                <Button onClick={() => patch(`/staff/open-requests/${r.id}`, { status: 'approved' }).then(load)}>{A.approve}</Button>
                <Button variant="secondary" onClick={() => patch(`/staff/open-requests/${r.id}`, { status: 'declined' }).then(load)}>
                  {A.decline}
                </Button>
              </div>
            )}
          </div>
        ))}
      </Card>
    </div>
  )
}

function AccountTab() {
  const { m } = useI18n()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  return (
    <Card>
      <b>{m.command.account.change}</b>
      <input className={inputCls} type="password" autoComplete="current-password" placeholder={m.command.account.current} value={current} onChange={(e) => setCurrent(e.target.value)} />
      <input className={inputCls} type="password" autoComplete="new-password" placeholder={m.command.account.next} value={next} onChange={(e) => setNext(e.target.value)} />
      <Button
        disabled={next.length < 10}
        onClick={async () => {
          try {
            await api('/staff/password', { body: { current, next } })
            setMsg(m.command.account.changed)
            setCurrent('')
            setNext('')
          } catch (err) {
            setMsg(err instanceof ApiError && err.status === 401 ? m.command.wrong : errorText(err, m))
          }
        }}
      >
        {m.command.account.change}
      </Button>
      {msg && <p>{msg}</p>}
    </Card>
  )
}
