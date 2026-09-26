import { useI18n, type Messages } from '../i18n'
import type { IconName } from '../lib/icons'
import { href, type Route, type Tab } from '../lib/router'
import type { Mode } from '../types'
import { Icon } from './Icon'
import { LanguageSwitcher } from './LanguageSwitcher'

interface Props {
  mode: Mode
  onModeChange: (mode: Mode) => void
  tab: Tab
  stats: { hours: number; volunteers: number; myHours: number }
  myTaskCount: number
}

// Normal is green; both emergencies use the urgent red from the palette.
const MODES: { id: Mode; icon: IconName; activeClass: string }[] = [
  { id: 'normal', icon: 'sun', activeClass: 'border-go bg-go text-white' },
  { id: 'haze', icon: 'haze', activeClass: 'border-urgent bg-urgent text-white' },
  { id: 'flood', icon: 'flood', activeClass: 'border-urgent bg-urgent text-white' },
]

const TABS: { id: Tab; route: Route; icon: IconName }[] = [
  { id: 'map', route: { name: 'map', category: 'all' }, icon: 'map' },
  { id: 'tasks', route: { name: 'tasks' }, icon: 'tasks' },
  { id: 'post', route: { name: 'post' }, icon: 'post' },
  { id: 'about', route: { name: 'about' }, icon: 'about' },
]

const tabLabel = (m: Messages, tab: Tab) => m.tabs[tab]
const tabShort = (m: Messages, tab: Tab) => m.tabs[`${tab}Short`]

export function Header({ mode, onModeChange, tab, stats, myTaskCount }: Props) {
  const { m } = useI18n()
  return (
    <header className="border-b-2 border-line bg-card">
      <div className="flex items-center gap-6 px-6 py-3">
        <a href={href({ name: 'map', category: 'all' })} className="mr-auto flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-go text-white">
            <Icon name="heart" size={24} />
          </span>
          <span>
            <span className="block whitespace-nowrap text-2xl font-bold leading-tight">
              {m.appName} <span className="font-medium text-muted">· {m.appSubtitle}</span>
            </span>
            <span className="hidden text-base text-muted 2xl:block">{m.tagline}</span>
          </span>
        </a>

        <nav aria-label={m.tabs.mainNav} className="hidden gap-1 md:flex">
          {TABS.map((t) => (
            <a
              key={t.id}
              href={href(t.route)}
              aria-current={tab === t.id ? 'page' : undefined}
              className={`inline-flex min-h-12 items-center gap-2 whitespace-nowrap rounded-xl px-4 text-lg font-semibold ${
                tab === t.id ? 'bg-ink text-white' : 'text-ink hover:bg-paper'
              }`}
            >
              <Icon name={t.icon} />
              {tabLabel(m, t.id)}
              {t.id === 'tasks' && myTaskCount > 0 && <TaskBadge count={myTaskCount} />}
            </a>
          ))}
        </nav>

        <LanguageSwitcher />
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t-2 border-line bg-paper px-6 py-2">
        <div className="flex items-center gap-2" title={m.modes.hint}>
          <span className="flex items-center gap-1 text-base text-muted">
            <Icon name="lock" size={18} />
            {m.modes.title}
          </span>
          {MODES.map((md) => (
            <button
              key={md.id}
              onClick={() => onModeChange(md.id)}
              aria-pressed={mode === md.id}
              aria-label={m.modes.modeLabel(m.modes[md.id])}
              className={`inline-flex min-h-11 items-center gap-2 rounded-xl border-2 px-3 text-base font-semibold ${
                mode === md.id ? md.activeClass : 'border-line bg-card text-ink hover:border-muted'
              }`}
            >
              <Icon name={md.icon} size={20} />
              <span className="hidden sm:inline">{m.modes[md.id]}</span>
            </button>
          ))}
        </div>

        <StatusBadge mode={mode} />

        <div className="ml-auto hidden gap-6 text-base text-muted xl:flex">
          <span>
            <b className="text-lg text-ink">{stats.volunteers.toLocaleString()}</b> {m.stats.volunteers}
          </span>
          <span>
            <b className="text-lg text-ink">{stats.hours.toLocaleString()}</b> {m.stats.hours}
          </span>
          {stats.myHours > 0 && (
            <span className="inline-flex items-center gap-1 font-semibold text-go">
              <Icon name="heart" size={18} />
              <b>{stats.myHours}</b> {m.stats.mine}
            </span>
          )}
        </div>
      </div>
    </header>
  )
}

/** Tab bar for narrow screens; the header tabs take over from `md` up. */
export function BottomNav({ tab, myTaskCount }: { tab: Tab; myTaskCount: number }) {
  const { m } = useI18n()
  return (
    <nav
      aria-label={m.tabs.mainNav}
      className="grid grid-cols-4 border-t-2 border-line bg-card pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {TABS.map((t) => (
        <a
          key={t.id}
          href={href(t.route)}
          aria-current={tab === t.id ? 'page' : undefined}
          className={`flex min-h-16 flex-col items-center justify-center gap-0.5 text-sm font-semibold ${
            tab === t.id ? 'text-go' : 'text-muted'
          }`}
        >
          <span className="relative">
            <Icon name={t.icon} size={26} />
            {t.id === 'tasks' && myTaskCount > 0 && (
              <span className="absolute -right-4 -top-1">
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
  return (
    <span className="ml-1 inline-flex min-w-6 items-center justify-center rounded-full bg-ask px-1.5 text-sm font-bold text-white">
      {count}
    </span>
  )
}

function StatusBadge({ mode }: { mode: Mode }) {
  const { m } = useI18n()
  // Static demo values. A real build would pull AQI from Air4Thai / IQAir and river level from the P.1 gauge.
  const [tone, body] =
    mode === 'haze'
      ? ['urgent', <><b>AQI 187</b> · {m.status.haze} · PM2.5 112 µg/m³</>]
      : mode === 'flood'
        ? ['urgent', <><b>{m.status.riverGauge}: 4.2 m</b> · {m.status.flood}</>]
        : ['go', <><b>AQI 42</b> · {m.status.good}</>]
  return (
    <div
      className={`inline-flex min-h-11 items-center gap-2 rounded-xl border-2 px-3 text-base ${
        tone === 'urgent' ? 'border-urgent bg-urgent-soft text-urgent' : 'border-go bg-go-soft text-go'
      }`}
    >
      <Icon name={tone === 'urgent' ? 'alert' : 'check'} size={20} />
      <span>{body}</span>
      <span className="text-sm opacity-80">{m.status.demo}</span>
    </div>
  )
}
