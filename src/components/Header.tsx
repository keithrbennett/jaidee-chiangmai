import { useI18n, type Messages } from '../i18n'
import type { IconName } from '../lib/icons'
import { href, type Route, type Tab } from '../lib/router'
import type { Mode } from '../types'
import { Icon } from './Icon'
import { LanguageSwitcher } from './LanguageSwitcher'
import { ThemeSwitcher } from './ThemeSwitcher'

interface Props {
  mode: Mode
  onModeChange: (mode: Mode) => void
  tab: Tab
  stats: { hours: number; volunteers: number; myHours: number }
  myTaskCount: number
}

// Segmented control: the selected segment is a white pill; emergencies are red.
const MODES: { id: Mode; icon: IconName; activeClass: string }[] = [
  { id: 'normal', icon: 'sun', activeClass: 'bg-card text-ink shadow-sm' },
  { id: 'haze', icon: 'haze', activeClass: 'bg-urgent text-white shadow-sm' },
  { id: 'flood', icon: 'flood', activeClass: 'bg-urgent text-white shadow-sm' },
]

// Home is reached from the logo; it isn't a tab.
type NavTab = Exclude<Tab, 'home'>

const TABS: { id: NavTab; route: Route; icon: IconName }[] = [
  { id: 'map', route: { name: 'map', category: 'all' }, icon: 'map' },
  { id: 'tasks', route: { name: 'tasks' }, icon: 'tasks' },
  { id: 'post', route: { name: 'post' }, icon: 'post' },
  { id: 'about', route: { name: 'about' }, icon: 'about' },
]

const tabLabel = (m: Messages, tab: NavTab) => m.tabs[tab]
const tabShort = (m: Messages, tab: NavTab) => m.tabs[`${tab}Short`]

export function Header({ mode, onModeChange, tab, stats, myTaskCount }: Props) {
  const { m } = useI18n()
  return (
    <header className="sticky top-0 z-[1000]">
      <nav
        aria-label={m.tabs.mainNav}
        className="border-b border-line bg-[var(--nav)] backdrop-blur-xl backdrop-saturate-[1.8]"
      >
        <div className="flex min-h-13 items-center gap-2 px-6">
          <a href={href({ name: 'home' })} className="mr-auto flex min-h-11 items-center gap-2">
            {/* The name follows as text, so the logo image is decorative (empty alt). */}
            <img src="/logo-mark.png" alt="" width={36} height={36} className="h-9 w-9 rounded-[9px] ring-1 ring-line" />
            <span className="whitespace-nowrap text-[19px] font-semibold">
              {m.appName} <span className="font-normal text-muted">· {m.appSubtitle}</span>
            </span>
          </a>
          <div className="hidden items-center gap-1 md:flex">
            {TABS.map((t) => (
              <a
                key={t.id}
                href={href(t.route)}
                aria-current={tab === t.id ? 'page' : undefined}
                className={`inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[15px] ${
                  tab === t.id ? 'bg-paper font-semibold text-ink' : 'text-ink/80 hover:text-ink'
                }`}
              >
                <Icon name={t.icon} size={18} />
                {tabLabel(m, t.id)}
                {t.id === 'tasks' && myTaskCount > 0 && <TaskBadge count={myTaskCount} />}
              </a>
            ))}
          </div>
          <ThemeSwitcher />
          <LanguageSwitcher />
        </div>
      </nav>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-line bg-paper px-6 py-2">
        <div className="flex items-center gap-2" title={m.modes.hint}>
          <span className="hidden items-center gap-1 text-sm text-muted sm:flex">
            <Icon name="lock" size={16} />
            {m.modes.title}
          </span>
          <div role="group" className="flex rounded-full bg-line/60 p-0.5">
            {MODES.map((md) => (
              <button
                key={md.id}
                onClick={() => onModeChange(md.id)}
                aria-pressed={mode === md.id}
                aria-label={m.modes.modeLabel(m.modes[md.id])}
                className={`inline-flex min-h-11 items-center gap-1.5 rounded-full px-3.5 text-[15px] font-medium ${
                  mode === md.id ? md.activeClass : 'text-ink/80 hover:text-ink'
                }`}
              >
                <Icon name={md.icon} size={18} />
                <span className="hidden sm:inline">{m.modes[md.id]}</span>
              </button>
            ))}
          </div>
        </div>

        <StatusBadge mode={mode} />

        <div className="ml-auto hidden gap-5 text-[15px] text-muted xl:flex">
          <span>
            <b className="font-semibold text-ink tabular-nums">{stats.volunteers.toLocaleString()}</b> {m.stats.volunteers}
          </span>
          <span>
            <b className="font-semibold text-ink tabular-nums">{stats.hours.toLocaleString()}</b> {m.stats.hours}
          </span>
          {stats.myHours > 0 && (
            <span className="inline-flex items-center gap-1 font-semibold text-go">
              <Icon name="heart" size={16} />
              <b className="tabular-nums">{stats.myHours}</b> {m.stats.mine}
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
      className="grid grid-cols-4 border-t border-line bg-[var(--nav)] pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden"
    >
      {TABS.map((t) => (
        <a
          key={t.id}
          href={href(t.route)}
          aria-current={tab === t.id ? 'page' : undefined}
          className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium ${
            tab === t.id ? 'text-go' : 'text-muted'
          }`}
        >
          <span className="relative">
            <Icon name={t.icon} size={24} />
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
    <span className="ml-1 inline-flex min-w-5 items-center justify-center rounded-full bg-urgent px-1.5 text-xs font-semibold text-white">
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
  // Apple-style status: a coloured dot and plain text, no box.
  return (
    <div className="inline-flex min-h-10 items-center gap-2 text-[15px]">
      <span className={`h-2.5 w-2.5 rounded-full ${tone === 'urgent' ? 'bg-urgent' : 'bg-[#30d158]'}`} />
      <span className={tone === 'urgent' ? 'text-urgent' : 'text-ink'}>{body}</span>
      <span className="text-sm text-faint">{m.status.demo}</span>
    </div>
  )
}
