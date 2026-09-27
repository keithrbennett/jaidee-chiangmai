import { useEffect, useState } from 'react'
import { useLocalStorage } from './useLocalStorage'

/** What the person chose. "system" follows the device's light/dark setting, as before. */
export type Theme = 'system' | 'light' | 'dark'

export const THEMES: Theme[] = ['system', 'light', 'dark']

export const THEME_KEY = 'jaidee.theme'
const DARK_QUERY = '(prefers-color-scheme: dark)'

/** Colour of the phone browser bar per resolved theme; matches --nav in index.css. */
const BAR_COLOR: Record<'light' | 'dark', string> = { light: '#ffffff', dark: '#161617' }

/**
 * Put the resolved theme on <html data-theme>, which is what index.css keys off.
 * The same two lines run in the pre-paint script in index.html; keep them in step.
 */
function apply(resolved: 'light' | 'dark') {
  document.documentElement.dataset.theme = resolved
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', BAR_COLOR[resolved])
}

/**
 * The chosen theme, remembered per device. Called once, by ThemeSwitcher: the choice only
 * reaches the rest of the app through <html data-theme>, so it needs no context.
 */
export function useTheme() {
  const [stored, setTheme] = useLocalStorage<Theme>(THEME_KEY, 'system')
  const theme: Theme = THEMES.includes(stored) ? stored : 'system'
  const [systemDark, setSystemDark] = useState(() => window.matchMedia(DARK_QUERY).matches)

  // Follow the device while it is on "system", including a change made while the page is open.
  useEffect(() => {
    const mq = window.matchMedia(DARK_QUERY)
    const onChange = (e: MediaQueryListEvent) => setSystemDark(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const resolved = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme
  useEffect(() => apply(resolved), [resolved])

  return { theme, setTheme, resolved }
}
