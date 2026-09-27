import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n'
import type { IconName } from '../lib/icons'
import { THEMES, useTheme, type Theme } from '../lib/theme'
import { Icon } from './Icon'

const THEME_ICONS: Record<Theme, IconName> = { system: 'display', light: 'sun', dark: 'moon' }

/** Appearance menu: match the device, or pin this screen to light or dark. Saved per device. */
export function ThemeSwitcher() {
  const { m } = useI18n()
  const { theme, setTheme, resolved } = useTheme()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`${m.theme.title}: ${m.theme[theme]}`}
        title={m.theme.title}
        className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full px-2 text-ink/80 hover:bg-paper hover:text-ink"
      >
        {/* On "system" show what the device currently gives, so the button reads as the state. */}
        <Icon name={theme === 'system' ? THEME_ICONS[resolved] : THEME_ICONS[theme]} size={20} />
      </button>
      {open && (
        <ul
          role="listbox"
          aria-label={m.theme.title}
          className="absolute right-0 z-[1100] mt-2 w-56 overflow-hidden rounded-[14px] border border-line bg-card py-1 shadow-xl"
        >
          {THEMES.map((t) => (
            <li key={t} role="option" aria-selected={t === theme}>
              <button
                onClick={() => {
                  setTheme(t)
                  setOpen(false)
                }}
                className={`flex min-h-11 w-full items-center gap-3 px-4 text-left text-[17px] hover:bg-paper ${
                  t === theme ? 'font-semibold' : ''
                }`}
              >
                <Icon name={THEME_ICONS[t]} size={20} />
                <span className="flex-1">{m.theme[t]}</span>
                {t === theme && <Icon name="check" className="text-go" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
