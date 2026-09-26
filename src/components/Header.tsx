import { useI18n, type Messages } from '../i18n'
import { href, type Route, type Tab } from '../lib/router'
import type { Mode } from '../types'
import { LanguageSwitcher } from './LanguageSwitcher'

interface Props {
  mode: Mode
  onModeChange: (mode: Mode) => void
  tab: Tab
  stats: { hours: number; volunteers: number; myHours: number }
  myTaskCount: number
}

const MODES: { id: Mode; icon: string; activeClass: string }[] = [
  { id: 'normal', icon: '🟢', activeClass: 'bg-emerald-600 text-white' },
  { id: 'haze', icon: '🔴', activeClass: 'bg-red-600 text-white' },
  { id: 'flood', icon: '🔵', activeClass: 'bg-blue-600 text-white' },
]

const TABS: { id: Tab; route: Route; icon: string }[] = [
  { id: 'map', route: { name: 'map', category: 'all' }, icon: '🗺️' },
  { id: 'tasks', route: { name: 'tasks' }, icon: '📋' },
  { id: 'post', route: { name: 'post' }, icon: '📝' },
  { id: 'about', route: { name: 'about' }, icon: '💡' },
]

const tabLabel = (m: Messages, tab: Tab) => m.tabs[tab]
const tabShort = (m: Messages, tab: Tab) => m.tabs[`${tab}Short`]

export function Header({ mode, onModeChange, tab, stats, myTaskCount }: Props) {
  const { m } = useI18n()
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2 px-4 py-2 sm:gap-x-4">
        <a href={href({ name: 'map', category: 'all' })} className="mr-auto">
          <h1 className="text-lg font-bold leading-tight">
            {m.appName} <span className="font-normal text-slate-500">· {m.appSubtitle}</span>
          </h1>
          <p className="hidden text-xs text-slate-500 sm:block">{m.tagline}</p>
        </a>

        <div className="flex items-center gap-1 text-sm" title={m.modes.hint}>
          <span className="mr-1 hidden text-xs text-slate-500 sm:inline">{m.modes.title}</span>
          {MODES.map((md) => (
            <button
              key={md.id}
              onClick={() => onModeChange(md.id)}
              aria-pressed={mode === md.id}
              aria-label={m.modes.modeLabel(m.modes[md.id])}
              className={`rounded-full px-2.5 py-1 sm:px-3 ${mode === md.id ? md.activeClass : 'bg-slate-100 hover:bg-slate-200'}`}
            >
              {md.icon}
              <span className="hidden sm:inline"> {m.modes[md.id]}</span>
            </button>
          ))}
        </div>

        <LanguageSwitcher />
        <StatusBadge mode={mode} />
      </div>

      <div className="hidden flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-100 px-4 py-1.5 text-sm md:flex">
        <nav aria-label={m.tabs.mainNav} className="flex gap-1">
          {TABS.map((t) => (
            <a
              key={t.id}
              href={href(t.route)}
              aria-current={tab === t.id ? 'page' : undefined}
              className={`rounded-md px-3 py-1 ${tab === t.id ? 'bg-slate-900 text-white' : 'hover:bg-slate-100'}`}
            >
              {tabLabel(m, t.id)}
              {t.id === 'tasks' && myTaskCount > 0 && <TaskBadge count={myTaskCount} />}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex gap-4 text-slate-600">
          <span>
            <b className="text-slate-900">{stats.volunteers.toLocaleString()}</b> {m.stats.volunteers}
          </span>
          <span>
            <b className="text-slate-900">{stats.hours.toLocaleString()}</b> {m.stats.hours}
          </span>
          {stats.myHours > 0 && (
            <span className="text-emerald-700">
              <b>{stats.myHours}</b> {m.stats.mine}
            </span>
          )}
        </div>
      </div>
    </header>
  )
}

/** Thumb-reachable tab bar for phones; the header tabs take over from `md` up. */
export function BottomNav({ tab, myTaskCount }: { tab: Tab; myTaskCount: number }) {
  const { m } = useI18n()
  return (
    <nav
      aria-label={m.tabs.mainNav}
      className="grid grid-cols-4 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {TABS.map((t) => (
        <a
          key={t.id}
          href={href(t.route)}
          aria-current={tab === t.id ? 'page' : undefined}
          className={`flex flex-col items-center gap-0.5 py-1.5 text-xs ${
            tab === t.id ? 'font-semibold text-emerald-700' : 'text-slate-500'
          }`}
        >
          <span className="relative text-lg leading-none">
            {t.icon}
            {t.id === 'tasks' && myTaskCount > 0 && (
              <span className="absolute -right-3 -top-1">
                <TaskBadge count={myTaskCount} />
              </span>
            )}
          </span>
          {tabShort(m, t.id)}
        </a>
      ))}
    </nav>
  )
}

function TaskBadge({ count }: { count: number }) {
  return <span className="ml-1 rounded-full bg-amber-400 px-1.5 text-xs font-normal text-slate-900">{count}</span>
}

function StatusBadge({ mode }: { mode: Mode }) {
  const { m } = useI18n()
  // Static demo values. A real build would pull AQI from Air4Thai / IQAir and river level from the P.1 gauge.
  if (mode === 'haze') {
    return (
      <div className="rounded-lg bg-red-100 px-3 py-1 text-sm text-red-800">
        <b>AQI 187</b> · {m.status.haze} · PM2.5 112 µg/m³ <span className="text-xs text-red-600">{m.status.demo}</span>
      </div>
    )
  }
  if (mode === 'flood') {
    return (
      <div className="rounded-lg bg-blue-100 px-3 py-1 text-sm text-blue-800">
        <b>{m.status.riverGauge}: 4.2 m</b> · {m.status.flood} <span className="text-xs text-blue-600">{m.status.demo}</span>
      </div>
    )
  }
  return (
    <div className="rounded-lg bg-emerald-50 px-3 py-1 text-sm text-emerald-800">
      <b>AQI 42</b> · {m.status.good} <span className="text-xs text-emerald-600">{m.status.demo}</span>
    </div>
  )
}
