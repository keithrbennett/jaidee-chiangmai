import { useEffect, useRef, useState } from 'react'
import { LANGUAGES, useI18n, type Lang } from '../i18n'
import { Icon } from './Icon'

/** Small inline SVG flags (no emoji: emoji flags also don't render on Windows). */
function Flag({ lang }: { lang: Lang }) {
  const common = { width: 28, height: 20, viewBox: '0 0 30 20', className: 'rounded-sm border border-line shrink-0' }
  if (lang === 'th')
    return (
      <svg {...common} aria-hidden="true">
        <rect width="30" height="20" fill="#A51931" />
        <rect y="3.33" width="30" height="13.33" fill="#F4F5F8" />
        <rect y="6.67" width="30" height="6.67" fill="#2D2A4A" />
      </svg>
    )
  if (lang === 'zh')
    return (
      <svg {...common} aria-hidden="true">
        <rect width="30" height="20" fill="#DE2910" />
        <polygon fill="#FFDE00" points="5,2 6.2,5.6 10,5.6 6.9,7.8 8.1,11.4 5,9.2 1.9,11.4 3.1,7.8 0,5.6 3.8,5.6" />
      </svg>
    )
  return (
    <svg {...common} aria-hidden="true">
      <rect width="30" height="20" fill="#012169" />
      <path d="M0 0 30 20M30 0 0 20" stroke="#fff" strokeWidth="4" />
      <path d="M0 0 30 20M30 0 0 20" stroke="#C8102E" strokeWidth="1.6" />
      <path d="M15 0v20M0 10h30" stroke="#fff" strokeWidth="6" />
      <path d="M15 0v20M0 10h30" stroke="#C8102E" strokeWidth="3.4" />
    </svg>
  )
}

/** Flag button that opens a menu of languages, each shown in its own language. */
export function LanguageSwitcher() {
  const { lang, setLang, m } = useI18n()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const current = LANGUAGES.find((l) => l.code === lang)!

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
        aria-label={`${m.language}: ${current.name}`}
        title={m.language}
        className="inline-flex min-h-12 items-center gap-2 rounded-xl border-2 border-line bg-card px-3 text-lg font-semibold hover:border-muted"
      >
        <Flag lang={current.code} />
        <span className="hidden sm:inline">{current.name}</span>
        <Icon name="chevronDown" size={18} />
      </button>
      {open && (
        <ul
          role="listbox"
          aria-label={m.language}
          className="absolute right-0 z-[1100] mt-2 w-56 overflow-hidden rounded-2xl border-2 border-line bg-card py-1 shadow-lg"
        >
          {LANGUAGES.map((l) => (
            <li key={l.code} role="option" aria-selected={l.code === lang} lang={l.htmlLang}>
              <button
                onClick={() => {
                  setLang(l.code)
                  setOpen(false)
                }}
                className={`flex min-h-12 w-full items-center gap-3 px-4 text-left text-lg hover:bg-paper ${
                  l.code === lang ? 'font-bold' : ''
                }`}
              >
                <Flag lang={l.code} />
                <span className="flex-1">{l.name}</span>
                {l.code === lang && <Icon name="check" className="text-go" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
