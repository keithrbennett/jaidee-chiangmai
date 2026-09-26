import type { Mode } from '../types'

export type Tab = 'map' | 'tasks' | 'post'

interface Props {
  mode: Mode
  onModeChange: (mode: Mode) => void
  tab: Tab
  onTabChange: (tab: Tab) => void
  stats: { hours: number; volunteers: number; myHours: number }
  myTaskCount: number
}

const MODES: { id: Mode; label: string; th: string; activeClass: string }[] = [
  { id: 'normal', label: '🟢 Normal', th: 'ปกติ', activeClass: 'bg-emerald-600 text-white' },
  { id: 'haze', label: '🔴 Haze', th: 'หมอกควัน', activeClass: 'bg-red-600 text-white' },
  { id: 'flood', label: '🔵 Flood', th: 'น้ำท่วม', activeClass: 'bg-blue-600 text-white' },
]

const TABS: { id: Tab; label: string }[] = [
  { id: 'map', label: 'Find a need' },
  { id: 'tasks', label: 'My tasks' },
  { id: 'post', label: 'Partner: post a need' },
]

export function Header({ mode, onModeChange, tab, onTabChange, stats, myTaskCount }: Props) {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2">
        <div className="mr-auto">
          <h1 className="text-lg font-bold leading-tight">
            Jaidee <span className="font-normal text-slate-500">· แผนที่ช่วยกัน</span>
          </h1>
          <p className="text-xs text-slate-500">Verified needs in Chiang Mai, matched with people who want to help</p>
        </div>

        <div className="flex items-center gap-1 text-sm" title="In production only the municipality / admins can switch modes">
          <span className="mr-1 text-xs text-slate-500">🔒 Mode (admin)</span>
          {MODES.map((m) => (
            <button
              key={m.id}
              onClick={() => onModeChange(m.id)}
              className={`rounded-full px-3 py-1 ${mode === m.id ? m.activeClass : 'bg-slate-100 hover:bg-slate-200'}`}
            >
              {m.label}
            </button>
          ))}
        </div>

        <StatusBadge mode={mode} />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-100 px-4 py-1.5 text-sm">
        <nav className="flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => onTabChange(t.id)}
              className={`rounded-md px-3 py-1 ${tab === t.id ? 'bg-slate-900 text-white' : 'hover:bg-slate-100'}`}
            >
              {t.label}
              {t.id === 'tasks' && myTaskCount > 0 && (
                <span className="ml-1 rounded-full bg-amber-400 px-1.5 text-xs text-slate-900">{myTaskCount}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex gap-4 text-slate-600">
          <span>
            <b className="text-slate-900">{stats.volunteers.toLocaleString()}</b> volunteers signed up
          </span>
          <span>
            <b className="text-slate-900">{stats.hours.toLocaleString()}</b> hours pledged
          </span>
          {stats.myHours > 0 && (
            <span className="text-emerald-700">
              <b>{stats.myHours}</b> of them yours 💚
            </span>
          )}
        </div>
      </div>
    </header>
  )
}

function StatusBadge({ mode }: { mode: Mode }) {
  // Static demo values. A real build would pull AQI from Air4Thai / IQAir and river level from the P.1 gauge.
  if (mode === 'haze') {
    return (
      <div className="rounded-lg bg-red-100 px-3 py-1 text-sm text-red-800">
        <b>AQI 187</b> · Unhealthy · PM2.5 112 µg/m³ <span className="text-xs text-red-600">(demo)</span>
      </div>
    )
  }
  if (mode === 'flood') {
    return (
      <div className="rounded-lg bg-blue-100 px-3 py-1 text-sm text-blue-800">
        <b>Ping River P.1: 4.2 m</b> · above 3.7 m warning <span className="text-xs text-blue-600">(demo)</span>
      </div>
    )
  }
  return (
    <div className="rounded-lg bg-emerald-50 px-3 py-1 text-sm text-emerald-800">
      <b>AQI 42</b> · Good <span className="text-xs text-emerald-600">(demo)</span>
    </div>
  )
}
