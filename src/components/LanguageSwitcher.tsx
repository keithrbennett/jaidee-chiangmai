import { useEffect, useRef, useState } from 'react'
import { LANGUAGES, useI18n } from '../i18n'

/** Flag button that opens a small menu of languages, each shown in its own language. */
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
        className="flex items-center gap-1 rounded-full border border-slate-300 bg-white px-2.5 py-1 text-sm hover:bg-slate-100"
      >
        <span className="text-base leading-none">{current.flag}</span>
        <span className="hidden sm:inline">{current.name}</span>
        <span className="text-xs text-slate-500">▾</span>
      </button>
      {open && (
        <ul
          role="listbox"
          aria-label={m.language}
          className="absolute right-0 z-[1100] mt-1 w-40 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 text-sm shadow-lg"
        >
          {LANGUAGES.map((l) => (
            <li key={l.code} role="option" aria-selected={l.code === lang} lang={l.htmlLang}>
              <button
                onClick={() => {
                  setLang(l.code)
                  setOpen(false)
                }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-slate-100 ${
                  l.code === lang ? 'font-semibold' : ''
                }`}
              >
                <span className="text-base leading-none">{l.flag}</span>
                <span className="flex-1">{l.name}</span>
                {l.code === lang && <span className="text-emerald-600">✓</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
