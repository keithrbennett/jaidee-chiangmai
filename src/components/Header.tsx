import { useI18n } from '../i18n'
import type { IconName } from '../lib/icons'
import { href, type Route, type Tab } from '../lib/router'
import { Icon } from './Icon'
import { LanguageSwitcher } from './LanguageSwitcher'
import { ThemeSwitcher } from './ThemeSwitcher'

type NavTab = Exclude<Tab, 'more'>
const TABS: { id: NavTab; route: Route; icon: IconName; phone: boolean; desktop: boolean }[] = [
  { id: 'home', route: { name: 'home' }, icon: 'globe3d', phone: true, desktop: false },
  { id: 'map', route: { name: 'map' }, icon: 'map', phone: true, desktop: true },
  { id: 'alerts', route: { name: 'alerts' }, icon: 'bell', phone: true, desktop: true },
  { id: 'provinces', route: { name: 'provinces' }, icon: 'list', phone: true, desktop: true },
  { id: 'volunteer', route: { name: 'volunteer' }, icon: 'heart', phone: false, desktop: true },
  { id: 'flood', route: { name: 'flood' }, icon: 'flood', phone: true, desktop: true },
]

/** Red count of danger-level alerts on the alerts tab. */
function Badge({ n }: { n: number }) {
  return n ? <span className="ml-0.5 inline-flex min-w-5 items-center justify-center rounded-full bg-urgent px-1.5 text-[11px] font-bold leading-5 text-white">{n}</span> : null
}

/** Emergency numbers stay one tap away on every screen. */
export function EmergencyStrip() {
  const { m } = useI18n()
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-0.5 bg-inverse px-4 py-1.5 text-[13px] text-on-inverse-2">
      <span className="font-semibold text-on-inverse">{m.emergency.title}</span>
      {[
        ['1784', m.emergency.ddpm],
        ['1669', m.emergency.medical],
        ['191', m.emergency.police],
      ].map(([n, label]) => (
        <a key={n} href={`tel:${n}`} title={label} className="inline-flex items-center gap-1 hover:text-on-inverse">
          <Icon name="phone" size={13} />
          <b className="text-on-inverse">{n}</b>
          <span className="hidden sm:inline">{label.split(' (')[0]}</span>
        </a>
      ))}
    </div>
  )
}

export function Header({ tab, danger }: { tab: Tab; danger: number }) {
  const { m } = useI18n()
  return (
    <header className="sticky top-0 z-[1000]">
      <nav aria-label={m.nav.main} className="border-b border-line bg-[var(--nav)] backdrop-blur-xl backdrop-saturate-[1.8]">
        <div className="flex min-h-13 items-center gap-2 px-4 md:px-6">
          <a href={href({ name: 'home' })} className="mr-auto flex min-h-11 items-center gap-2">
            <img src="/logo-mark.png" alt="" width={36} height={36} className="h-9 w-9 rounded-[9px] ring-1 ring-line" />
            <span className="whitespace-nowrap text-[19px] font-semibold">
              {m.appName} <span className="hidden font-normal text-muted xl:inline">· {m.appSubtitle}</span>
            </span>
          </a>
          <div className="hidden items-center gap-1 md:flex">
            {TABS.filter((t) => t.desktop).map((t) => (
              <a
                key={t.id}
                href={href(t.route)}
                aria-current={tab === t.id ? 'page' : undefined}
                className={`inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[15px] ${
                  tab === t.id ? 'bg-paper font-semibold text-ink' : 'text-ink/80 hover:text-ink'
                }`}
              >
                <Icon name={t.icon} size={18} />
                {m.nav[t.id]}
                {t.id === 'alerts' && <Badge n={danger} />}
              </a>
            ))}
          </div>
          <ThemeSwitcher />
          <LanguageSwitcher />
        </div>
      </nav>
    </header>
  )
}

/** Tab bar for narrow screens; the header tabs take over from `md` up. */
export function BottomNav({ tab, danger }: { tab: Tab; danger: number }) {
  const { m } = useI18n()
  return (
    <nav aria-label={m.nav.main} className="grid grid-cols-5 border-t border-line bg-[var(--nav)] pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
      {TABS.filter((t) => t.phone).map((t) => (
        <a
          key={t.id}
          href={href(t.route)}
          aria-current={tab === t.id ? 'page' : undefined}
          className={`relative flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium ${tab === t.id ? 'text-go' : 'text-muted'}`}
        >
          <Icon name={t.icon} size={24} />
          {m.nav[t.id]}
          {t.id === 'alerts' && danger > 0 && (
            <span className="absolute right-[22%] top-1.5">
              <Badge n={danger} />
            </span>
          )}
        </a>
      ))}
    </nav>
  )
}

export function Footer() {
  const { m } = useI18n()
  return (
    <footer className="mt-6 border-t border-line px-4 py-6 text-sm text-muted md:px-6">
      <div className="mx-auto w-full flex max-w-6xl flex-wrap gap-x-5 gap-y-2">
        <a href={href({ name: 'sources' })} className="hover:text-ink">
          {m.nav.sources}
        </a>
        <a href={href({ name: 'about' })} className="hover:text-ink">
          {m.nav.about}
        </a>
        <a href={href({ name: 'command' })} className="hover:text-ink">
          {m.nav.command}
        </a>
        <span className="text-faint">{m.home.sourcesLine}</span>
      </div>
    </footer>
  )
}
