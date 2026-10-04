import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useI18n, type Lang } from '../../i18n'
import {
  buttonHref,
  checkAssistantMode,
  closeAssistant,
  openDraft,
  plainText,
  resetChat,
  sendMessage,
  setAssistantLocation,
  stopReply,
  useAssistant,
  type ChatButton,
  type ChatMessage,
  type HelpDraft,
  type ReportDraft,
} from '../../lib/assistant'
import { guideById } from '../../lib/guides'
import type { IconName } from '../../lib/icons'
import { provinceByCode } from '../../lib/router'
import { openQuickReport } from '../../lib/report'
import { provinceName, shrinkPhoto, useGeolocation } from '../../lib/ui'
import { LEVEL_COLOR } from '../../lib/water'
import { LevelFigure } from '../report/LevelFigure'
import { Icon } from '../Icon'
import { Orb } from './Orb'
import { Rich } from './Rich'

const SPEECH_LANG: Record<Lang, string> = { th: 'th-TH', en: 'en-US', zh: 'zh-CN' }
const EMERGENCY = ['1669', '1784', '191', '199']
const isPhone = () => window.innerWidth < 768

/**
 * The chat with น้องใจดี: a sheet from the bottom on phones (drag it down to close), a floating panel on
 * larger screens. Text, voice in, voice out; replies stream in with buttons, guide cards and help drafts.
 */
export default function Panel() {
  const { m, lang } = useI18n()
  const A = m.assistant
  const s = useAssistant()
  const [text, setText] = useState('')
  const [photo, setPhoto] = useState<string | null>(null)
  const photoInput = useRef<HTMLInputElement>(null)
  const [drag, setDrag] = useState<{ start: number; dy: number } | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)
  const geo = useGeolocation()
  const dictation = useDictation(lang, setText)
  const speech = useSpeech()

  useEffect(() => {
    void checkAssistantMode()
    if (!isPhone()) input.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeAssistant()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Follow the reply as it streams in.
  useEffect(() => {
    const el = scroller.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [s.messages, s.status])

  // Grow the box with the text, up to about five lines.
  useEffect(() => {
    const el = input.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 132)}px`
  }, [text])

  const ask = (q: string) => {
    if ((!q.trim() && !photo) || s.busy) return
    setText('')
    setPhoto(null)
    dictation.stop()
    void sendMessage(q, lang, photo)
  }
  const askNearMe = async (q: string) => {
    if (!s.location) {
      const p = await geo.locate()
      if (!p) return
      setAssistantLocation(p)
    }
    ask(q)
  }
  const toggleLocation = async () => {
    if (s.location) return setAssistantLocation(null)
    const p = await geo.locate()
    if (p) setAssistantLocation(p)
  }

  const here = s.province ? provinceByCode.get(s.province) : undefined
  const suggestions: { icon: IconName; text: string; near?: boolean }[] = [
    here ? { icon: 'pin', text: A.suggestions.province(provinceName(here, lang)) } : { icon: 'locate', text: A.suggestions.near, near: true },
    { icon: 'lifebuoy', text: A.suggestions.help },
    { icon: 'flood', text: A.suggestions.prepare },
    { icon: 'air', text: A.suggestions.dust },
    { icon: 'quake', text: A.suggestions.quake },
    { icon: 'camera', text: A.suggestions.report },
  ]

  const sheetStyle: CSSProperties | undefined = drag && drag.dy > 0 ? { transform: `translateY(${drag.dy}px)`, transition: 'none' } : undefined
  const last = s.messages[s.messages.length - 1]

  return (
    <div className="fixed inset-0 z-[1200] flex items-end md:inset-auto md:bottom-6 md:right-6 md:block">
      <div className="fade-in absolute inset-0 bg-black/35 md:hidden" onClick={closeAssistant} />
      <section
        role="dialog"
        aria-label={A.name}
        className="jd-sheet glass relative flex h-[92dvh] w-full flex-col overflow-hidden rounded-t-[26px] shadow-[0_-12px_40px_rgb(0_0_0/0.18)] ring-1 ring-black/5 transition-transform duration-300 md:h-[min(720px,calc(100dvh-7.5rem))] md:w-[420px] md:rounded-[28px] md:shadow-[0_24px_80px_rgb(0_0_0/0.28)]"
        style={sheetStyle}
      >
        <header
          className="relative flex touch-none items-center gap-3 border-b border-line/60 px-4 pb-3 pt-4 md:touch-auto md:pt-3"
          onPointerDown={(e) => isPhone() && setDrag({ start: e.clientY, dy: 0 })}
          onPointerMove={(e) => drag && setDrag({ ...drag, dy: Math.max(0, e.clientY - drag.start) })}
          onPointerUp={() => {
            if (drag && drag.dy > 110) closeAssistant()
            setDrag(null)
          }}
          onPointerCancel={() => setDrag(null)}
        >
          <span className="absolute left-1/2 top-1.5 h-1.5 w-10 -translate-x-1/2 rounded-full bg-line md:hidden" />
          <Orb size={38} busy={s.busy} />
          <div className="min-w-0 flex-1">
            <p className="font-semibold leading-tight">{A.name}</p>
            <p className="truncate text-[13px] text-muted">{s.ai === false ? A.basicMode : A.role}</p>
          </div>
          {s.messages.length > 0 && <RoundButton icon="compose" label={A.newChat} onClick={resetChat} />}
          <RoundButton icon="close" label={A.close} onClick={closeAssistant} />
        </header>

        <div ref={scroller} className="flex-1 overflow-y-auto overscroll-contain px-4 py-4" aria-live="polite">
          {s.messages.length === 0 ? (
            <div className="flex flex-col items-center gap-2 pt-4 text-center">
              <span className="rise">
                <Orb size={78} />
              </span>
              <h2 className="rise mt-2 text-[22px] font-bold" style={{ '--i': 1 } as CSSProperties}>
                {A.hello}
              </h2>
              <p className="rise max-w-[30ch] text-[15px] leading-snug text-muted" style={{ '--i': 2 } as CSSProperties}>
                {A.helloSub}
              </p>
              <div className="mt-4 grid w-full grid-cols-2 gap-2">
                {suggestions.map((sg, i) => (
                  <button
                    key={sg.text}
                    onClick={() => (sg.near ? askNearMe(sg.text) : ask(sg.text))}
                    className="rise press flex min-h-16 items-start gap-2 rounded-[16px] bg-card p-3 text-left text-[14px] font-medium leading-snug shadow-[0_1px_3px_rgb(0_0_0/0.06)] ring-1 ring-line/60 hover:ring-go/40"
                    style={{ '--i': i + 3 } as CSSProperties}
                  >
                    <Icon name={sg.icon} size={18} className="mt-0.5 text-go" />
                    {sg.text}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {s.messages.map((msg) =>
                msg.role === 'user' ? (
                  <div key={msg.id} className="rise flex flex-col items-end gap-1">
                    {msg.image && <img src={msg.image} alt="" className="max-h-52 max-w-[70%] rounded-[18px] rounded-br-[6px] object-cover" />}
                    {msg.text && <p className="max-w-[85%] whitespace-pre-wrap break-words rounded-[20px] rounded-br-[6px] bg-go px-3.5 py-2 text-[16px] leading-snug text-white">{msg.text}</p>}
                  </div>
                ) : (
                  <Reply
                    key={msg.id}
                    msg={msg}
                    photo={s.messages[s.messages.indexOf(msg) - 1]?.image ?? null}
                    thinking={s.busy && msg === last}
                    status={msg === last ? s.status : null}
                    speech={speech}
                  />
                ),
              )}
            </div>
          )}
        </div>

        <footer className="border-t border-line/60 px-3 pb-[calc(0.6rem+env(safe-area-inset-bottom))] pt-2">
          <div className="mb-2 flex items-center gap-2">
            <button
              onClick={toggleLocation}
              className={`press inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold ${s.location ? 'bg-[#34c759]/15 text-[#248a3d] dark:text-[#30d158]' : 'bg-paper text-muted hover:text-ink'}`}
              title={A.locationNote}
            >
              <Icon name="locate" size={15} />
              {s.location ? A.locationOn : A.useLocation}
              {s.location && <Icon name="close" size={13} />}
            </button>
            {geo.state === 'locating' && <span className="shimmer-text text-[13px]">{m.common.locating}</span>}
            {(geo.state === 'denied' || geo.state === 'outside') && <span className="text-[13px] text-urgent">{geo.state === 'denied' ? m.common.locationDenied : m.common.outsideThailand}</span>}
          </div>
          {photo && (
            <div className="fade-in relative mb-2 inline-block">
              <img src={photo} alt="" className="h-20 w-20 rounded-[14px] object-cover ring-1 ring-line" />
              <button onClick={() => setPhoto(null)} aria-label={A.removePhoto} className="absolute -right-2 -top-2 grid h-6 w-6 place-items-center rounded-full bg-ink text-page shadow">
                <Icon name="close" size={13} />
              </button>
            </div>
          )}
          <input
            ref={photoInput}
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={async (e) => {
              const f = e.target.files?.[0]
              if (f) setPhoto(await shrinkPhoto(f))
              e.target.value = ''
            }}
          />
          <form
            onSubmit={(e) => {
              e.preventDefault()
              ask(text)
            }}
            className="flex items-end gap-1.5 rounded-[22px] bg-card p-1.5 ring-1 ring-line focus-within:ring-2 focus-within:ring-go/40"
          >
            <button type="button" onClick={() => photoInput.current?.click()} aria-label={A.photo} title={A.photo} className="press grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted hover:bg-paper hover:text-ink">
              <Icon name="camera" size={19} />
            </button>
            <textarea
              ref={input}
              rows={1}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && !isPhone()) {
                  e.preventDefault()
                  ask(text)
                }
              }}
              enterKeyHint="send"
              maxLength={2000}
              placeholder={dictation.on ? A.listening : A.placeholder}
              aria-label={A.placeholder}
              className="min-h-9 flex-1 resize-none bg-transparent py-1.5 text-[16px] leading-snug outline-none placeholder:text-faint"
            />
            {dictation.supported && (
              <button
                type="button"
                onClick={dictation.on ? dictation.stop : dictation.start}
                aria-label={dictation.on ? A.stopListening : A.listen}
                className={`press grid h-9 w-9 shrink-0 place-items-center rounded-full ${dictation.on ? 'ring-pulse bg-urgent text-white' : 'text-muted hover:bg-paper hover:text-ink'}`}
              >
                <Icon name="mic" size={19} />
              </button>
            )}
            {s.busy ? (
              <button type="button" onClick={stopReply} aria-label={A.stop} className="press grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink text-page">
                <Icon name="stop" size={16} />
              </button>
            ) : (
              <button type="submit" disabled={!text.trim() && !photo} aria-label={A.send} className="press grid h-9 w-9 shrink-0 place-items-center rounded-full bg-go text-white disabled:bg-off">
                <Icon name="send" size={18} />
              </button>
            )}
          </form>
          <p className="mt-1.5 px-1 text-center text-[11px] leading-snug text-faint">{A.disclaimer}</p>
        </footer>
      </section>
    </div>
  )
}

function RoundButton({ icon, label, onClick }: { icon: IconName; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label={label} title={label} className="press grid h-9 w-9 shrink-0 place-items-center rounded-full bg-paper text-muted hover:text-ink">
      <Icon name={icon} size={18} />
    </button>
  )
}

function Reply({
  msg,
  photo,
  thinking,
  status,
  speech,
}: {
  msg: ChatMessage
  photo: string | null
  thinking: boolean
  status: { tool: string; province?: string } | null
  speech: ReturnType<typeof useSpeech>
}) {
  const { m, lang } = useI18n()
  const A = m.assistant
  const p = status?.province ? provinceByCode.get(status.province) : undefined
  const statusText = status
    ? status.tool === 'province_status' && p
      ? A.status.province(provinceName(p, lang))
      : (A.status as Record<string, string | ((x: string) => string)>)[status.tool]
    : null
  return (
    <div className="rise flex gap-2">
      <Orb size={26} busy={thinking} className="mt-1" />
      <div className="flex min-w-0 flex-1 flex-col items-start gap-2">
        {msg.text ? (
          <div className="max-w-full rounded-[20px] rounded-tl-[6px] bg-paper px-3.5 py-2.5 text-[16px] leading-relaxed">
            <Rich text={msg.text} />
          </div>
        ) : (
          !msg.error &&
          thinking && (
            <div className="flex items-center gap-2.5 rounded-[20px] rounded-tl-[6px] bg-paper px-3.5 py-3">
              <span className="jd-typing flex gap-1">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="h-2 w-2 rounded-full bg-faint" />
                ))}
              </span>
              <span className="shimmer-text text-[14px] font-medium">{typeof statusText === 'string' ? statusText : A.thinking}</span>
            </div>
          )
        )}
        {msg.text && thinking && statusText && typeof statusText === 'string' && <span className="shimmer-text pl-1 text-[13px] font-medium">{statusText}</span>}
        {msg.error && <p className="rounded-[14px] bg-urgent-soft px-3 py-2 text-[15px] text-urgent">{msg.error === 'busy' ? A.busyLimit : A.error}</p>}
        {msg.guides?.map((g) => (
          <GuideCard key={g} id={g} />
        ))}
        {msg.draft && <DraftCard d={msg.draft} />}
        {msg.report && <ReportCard r={msg.report} photo={msg.report.usePhoto ? photo : null} />}
        {msg.sources && msg.sources.length > 0 && (
          <div className="flex w-full flex-wrap items-center gap-1.5 text-[12px]">
            <span className="font-semibold text-faint">{A.sources}</span>
            {msg.sources.map((src, i) => (
              <a key={src.url} href={src.url} target="_blank" rel="noreferrer" title={src.title ?? src.url} className="press inline-flex max-w-[14rem] items-center gap-1 rounded-full bg-paper px-2.5 py-1 font-medium text-muted hover:text-ink">
                <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-card text-[10px] font-bold">{i + 1}</span>
                <span className="truncate">{new URL(src.url).hostname.replace(/^www\./, '')}</span>
              </a>
            ))}
          </div>
        )}
        {msg.buttons && msg.buttons.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {msg.buttons.map((b, i) => (
              <ActionButton key={`${b.label}${i}`} b={b} />
            ))}
          </div>
        )}
        {msg.done && msg.text && (
          <div className="flex items-center gap-3 pl-1 text-[12px] text-faint">
            {speech.supported && (
              <button onClick={() => speech.toggle(msg.id, plainText(msg.text))} className="inline-flex items-center gap-1 font-medium hover:text-ink">
                <Icon name={speech.speaking === msg.id ? 'stop' : 'speaker'} size={14} />
                {speech.speaking === msg.id ? A.stopSpeaking : A.speak}
              </button>
            )}
            {msg.basic && <span>{A.basicMode}</span>}
          </div>
        )}
      </div>
    </div>
  )
}

function ActionButton({ b }: { b: ChatButton }) {
  const target = buttonHref(b)
  if (!target) return null
  const call = b.action === 'call'
  const urgent = call && EMERGENCY.includes(b.number ?? '')
  return (
    <a
      href={target}
      onClick={() => !call && isPhone() && closeAssistant()}
      className={`press inline-flex min-h-10 items-center gap-1.5 rounded-full px-4 text-[15px] font-semibold ${call ? (urgent ? 'bg-urgent text-white' : 'bg-[#34c759] text-white') : 'bg-go-soft text-go'}`}
    >
      <Icon name={call ? 'phone' : 'forward'} size={16} />
      {b.label}
    </a>
  )
}

function GuideCard({ id }: { id: string }) {
  const { m, lang } = useI18n()
  const g = guideById(id)
  if (!g) return null
  return (
    <a href={`#/guide/${g.id}`} onClick={() => isPhone() && closeAssistant()} className="press block w-full rounded-[18px] bg-card p-3.5 ring-1 ring-line/70">
      <span className="flex items-center gap-2.5">
        <span className="grid h-8 w-8 place-items-center rounded-[10px] text-white" style={{ background: g.color }}>
          <Icon name={g.icon} size={18} />
        </span>
        <b className="leading-tight">{g.title[lang]}</b>
      </span>
      <ol className="mt-2.5 space-y-1.5 text-[14px] leading-snug">
        {g.steps.slice(0, 3).map((st, i) => (
          <li key={i} className="flex gap-2">
            <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white" style={{ background: g.color }}>
              {i + 1}
            </span>
            {st[lang]}
          </li>
        ))}
      </ol>
      <span className="mt-2 inline-flex items-center gap-1 text-[14px] font-semibold text-link">
        {m.assistant.guideMore} <Icon name="forward" size={15} />
      </span>
    </a>
  )
}

/** A water report น้องใจดี prepared from the chat: the level as a picture, then on to the report form. */
function ReportCard({ r, photo }: { r: ReportDraft; photo: string | null }) {
  const { m } = useI18n()
  const D = m.assistant.reportDraft
  return (
    <div className="w-full rounded-[18px] bg-card p-4 ring-1 ring-go/25">
      <p className="flex items-center gap-2 font-bold text-go">
        <Icon name="flood" size={18} /> {D.title}
      </p>
      <div className="mt-2 flex items-center gap-3">
        {photo && <img src={photo} alt="" className="h-16 w-16 rounded-[12px] object-cover" />}
        <span className="grid h-16 w-12 place-items-center rounded-[12px] text-white" style={{ background: LEVEL_COLOR[r.level] }}>
          <LevelFigure level={r.level} size={50} color="#ffffff" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-semibold">{m.levels.names[r.level]}</span>
          {r.confidence && <span className="block text-[13px] text-muted">{D.confidence[r.confidence]}</span>}
          {r.note && <span className="block text-[14px] text-muted">{r.note}</span>}
        </span>
      </div>
      <button
        onClick={() => {
          openQuickReport({ level: r.level, trend: r.trend, passable: r.passable, note: r.note, photo, location: r.location })
          if (isPhone()) closeAssistant()
        }}
        className="press mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-go font-semibold text-white"
      >
        {D.open} <Icon name="forward" size={18} />
      </button>
    </div>
  )
}

function DraftCard({ d }: { d: HelpDraft }) {
  const { m, lang } = useI18n()
  const D = m.assistant.draft
  const p = provinceByCode.get(d.province)
  const who = [D.people(d.people), ...d.vulnerable.map((v) => m.help.vulnerable[v])].join(' · ')
  return (
    <div className="w-full rounded-[18px] bg-card p-4 ring-1 ring-urgent/30">
      <p className="flex items-center gap-2 font-bold text-urgent">
        <Icon name="lifebuoy" size={18} /> {D.title}
        {p && <span className="font-semibold text-muted">· {provinceName(p, lang)}</span>}
      </p>
      <div className="mt-2 space-y-1 text-[15px]">
        <p className="font-semibold">{who}</p>
        {d.needs.length > 0 && (
          <p>
            <span className="text-muted">{D.needs}:</span> {d.needs.map((n) => m.help.needs[n]).join(' · ')}
          </p>
        )}
        {d.waterLevel !== null && (
          <p>
            <span className="text-muted">{D.water}:</span> {m.levels.names[d.waterLevel]}
          </p>
        )}
        {d.place && (
          <p>
            <span className="text-muted">{D.place}:</span> {d.place}
          </p>
        )}
        {d.phone && (
          <p>
            <span className="text-muted">{D.phone}:</span> {d.phone}
          </p>
        )}
      </div>
      <p className="mt-2 rounded-[12px] bg-paper p-2.5 text-[14px] leading-snug">{d.noteTh}</p>
      {d.language && d.noteOriginal && <p className="mt-1 text-[12px] text-faint">{D.translated(d.language)}</p>}
      {d.centerOpen ? (
        <button onClick={() => openDraft(d)} className="press mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-urgent font-semibold text-white">
          {D.open} <Icon name="forward" size={18} />
        </button>
      ) : (
        <>
          <p className="mt-2 text-[14px] text-muted">{D.closed}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {['1784', '1669', ...(d.hotline ? [d.hotline] : [])].map((n) => (
              <a key={n} href={`tel:${n}`} className="press inline-flex min-h-10 items-center gap-1.5 rounded-full bg-urgent px-4 font-semibold text-white">
                <Icon name="phone" size={16} /> {n}
              </a>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// ---- Voice ------------------------------------------------------------------------------------------------------

interface Recognition {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
  start: () => void
  stop: () => void
}
type RecognitionCtor = new () => Recognition

/** Speak instead of typing (Web Speech API, where the browser has it). */
function useDictation(lang: Lang, onText: (t: string) => void) {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition
  const [on, setOn] = useState(false)
  const rec = useRef<Recognition | null>(null)
  return {
    supported: !!Ctor,
    on,
    start: () => {
      if (!Ctor) return
      const r = new Ctor()
      r.lang = SPEECH_LANG[lang]
      r.interimResults = true
      r.continuous = false
      r.onresult = (e) => onText(Array.from(e.results, (x) => x[0].transcript).join(''))
      r.onend = () => setOn(false)
      r.onerror = () => setOn(false)
      rec.current = r
      r.start()
      setOn(true)
    },
    stop: () => {
      rec.current?.stop()
      setOn(false)
    },
  }
}

/** Read a reply aloud, in Thai, Chinese or English by its script. */
function useSpeech() {
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window
  const [speaking, setSpeaking] = useState<string | null>(null)
  useEffect(() => () => void (supported && speechSynthesis.cancel()), [supported])
  return {
    supported,
    speaking,
    toggle: (id: string, text: string) => {
      speechSynthesis.cancel()
      if (speaking === id) return setSpeaking(null)
      const u = new SpeechSynthesisUtterance(text)
      u.lang = /[฀-๿]/.test(text) ? 'th-TH' : /[一-鿿]/.test(text) ? 'zh-CN' : 'en-US'
      u.onend = () => setSpeaking(null)
      u.onerror = () => setSpeaking(null)
      speechSynthesis.speak(u)
      setSpeaking(id)
    },
  }
}
