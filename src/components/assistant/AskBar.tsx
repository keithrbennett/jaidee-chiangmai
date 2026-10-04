import { useMemo, useState, type CSSProperties } from 'react'
import { PROVINCES, type Province } from '../../data/provinces'
import { useI18n } from '../../i18n'
import { openAssistant, setAssistantLocation } from '../../lib/assistant'
import { navigate } from '../../lib/router'
import { provinceName, useGeolocation } from '../../lib/ui'
import { Icon } from '../Icon'
import { GeoMessage } from '../kit'
import { Orb } from './Orb'

/**
 * One box for everything, like Spotlight: type a province to jump to it, or anything else to ask น้องใจดี.
 * Suggestions underneath start a conversation in one tap.
 */
export function AskBar() {
  const { m, lang } = useI18n()
  const [q, setQ] = useState('')
  const [focus, setFocus] = useState(false)
  const geo = useGeolocation()
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (s.length < 2) return []
    return PROVINCES.filter((p) => p.th.includes(s) || p.en.toLowerCase().startsWith(s) || p.en.toLowerCase().includes(` ${s}`)).slice(0, 4)
  }, [q])
  const exact = matches.find((p) => p.th === q.trim() || p.en.toLowerCase() === q.trim().toLowerCase())
  const go = (p: Province) => navigate({ name: 'province', province: p, section: null })
  const ask = (text: string) => {
    setQ('')
    openAssistant({ text, lang })
  }
  const prompts = [m.assistant.suggestions.near, m.assistant.suggestions.help, m.assistant.suggestions.prepare]

  return (
    <div className="flex w-full flex-col gap-3">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (exact) go(exact)
          else if (q.trim()) ask(q)
          else openAssistant()
        }}
        className="relative"
      >
        <div className="flex items-center gap-3 rounded-[22px] bg-card p-2 pl-2.5 shadow-[0_10px_40px_rgb(0_0_0/0.07)] ring-1 ring-line/70 transition-shadow focus-within:shadow-[0_14px_44px_rgb(10_132_255/0.16)] focus-within:ring-2 focus-within:ring-go/40">
          <Orb size={40} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onFocus={() => setFocus(true)}
            onBlur={() => setTimeout(() => setFocus(false), 150)}
            placeholder={m.home.askPlaceholder}
            aria-label={m.home.askPlaceholder}
            enterKeyHint="go"
            className="min-w-0 flex-1 bg-transparent text-[17px] outline-none placeholder:text-faint"
          />
          <button type="submit" aria-label={m.assistant.send} className="press grid h-10 w-10 shrink-0 place-items-center rounded-full bg-go text-white">
            <Icon name="send" size={19} />
          </button>
        </div>
        {focus && q.trim().length >= 2 && (
          <ul className="fade-in absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-[18px] bg-card shadow-[0_18px_50px_rgb(0_0_0/0.16)] ring-1 ring-line/70">
            {matches.map((p) => (
              <li key={p.code}>
                <button type="button" onMouseDown={() => go(p)} className="flex min-h-12 w-full items-center gap-3 px-4 text-left hover:bg-paper">
                  <Icon name="pin" size={18} className="text-go" />
                  <b>{provinceName(p, lang)}</b>
                  <span className="text-muted">{lang === 'th' ? p.en : p.th}</span>
                  <Icon name="forward" size={16} className="ml-auto text-faint" />
                </button>
              </li>
            ))}
            <li>
              <button type="button" onMouseDown={() => ask(q)} className="flex min-h-12 w-full items-center gap-3 border-t border-line/60 px-4 text-left hover:bg-paper">
                <Orb size={22} />
                <span className="min-w-0 flex-1 truncate">{m.home.askAction(q.trim())}</span>
              </button>
            </li>
          </ul>
        )}
      </form>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0">
        <button
          onClick={async () => {
            const p = await geo.locate()
            if (!p) return
            setAssistantLocation(p)
            ask(prompts[0])
          }}
          className="press inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full bg-go-soft px-4 text-[15px] font-semibold text-go"
        >
          <Icon name="locate" size={17} /> {prompts[0]}
        </button>
        {prompts.slice(1).map((t, i) => (
          <button
            key={t}
            onClick={() => ask(t)}
            className="press rise inline-flex min-h-10 shrink-0 items-center rounded-full bg-card px-4 text-[15px] font-medium ring-1 ring-line/70 hover:ring-go/40"
            style={{ '--i': i + 1 } as CSSProperties}
          >
            {t}
          </button>
        ))}
      </div>
      <GeoMessage state={geo.state} />
    </div>
  )
}
