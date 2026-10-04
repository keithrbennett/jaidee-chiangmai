import type { CSSProperties } from 'react'
import { useI18n } from '../../i18n'
import { openAssistant } from '../../lib/assistant'
import { FLOOD_GUIDES, GUIDES, GUIDE_MODE, GUIDE_SOURCES, HOTLINES, OTHER_GUIDES, guideById, type Guide as GuideT } from '../../lib/guides'
import { href } from '../../lib/router'
import { Icon } from '../Icon'
import { Orb } from '../assistant/Orb'

/** #/guide: every safety guide as a card. #/guide/<topic>: one guide, step by step, with who to call. */
export default function Guide({ topic }: { topic: string | null }) {
  const g = topic ? guideById(topic) : null
  return g ? <GuideDetail g={g} /> : <GuideList />
}

function GuideList() {
  const { m, lang } = useI18n()
  const G = m.guide
  const group = (title: string, ids: string[], offset: number) => (
    <section className="flex flex-col gap-3">
      <h2 className="text-[22px] font-bold">{title}</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {ids.map((id, i) => {
          const t = GUIDES.find((x) => x.id === id)!
          return (
            <a
              key={id}
              href={href({ name: 'guide', topic: id })}
              className="rise press lift flex flex-col gap-3 rounded-[22px] bg-card p-5"
              style={{ '--i': offset + i } as CSSProperties}
            >
              <span className="grid h-12 w-12 place-items-center rounded-[14px] text-white shadow-sm" style={{ background: t.color }}>
                <Icon name={t.icon} size={26} />
              </span>
              <span>
                <span className="block text-[17px] font-semibold leading-snug">{t.title[lang]}</span>
                <span className="mt-0.5 block text-[15px] leading-snug text-muted">{t.sub[lang]}</span>
              </span>
            </a>
          )
        })}
      </div>
    </section>
  )
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-6 md:px-6 md:py-8">
      <header className="rise max-w-2xl">
        <h1 className="text-[34px] font-bold leading-tight md:text-[44px]">{G.title}</h1>
        <p className="mt-2 text-lg text-muted">{G.sub}</p>
      </header>
      {group(G.flood, FLOOD_GUIDES, 1)}
      {group(G.other, OTHER_GUIDES, FLOOD_GUIDES.length + 1)}
      <AskCard text={G.askGeneral} />
    </div>
  )
}

function GuideDetail({ g }: { g: GuideT }) {
  const { m, lang } = useI18n()
  const G = m.guide
  const mode = GUIDE_MODE[g.id]
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-7 px-4 py-6 md:px-6 md:py-8">
      <a href={href({ name: 'guide', topic: null })} className="inline-flex min-h-11 items-center gap-0.5 self-start text-[17px] text-link">
        <Icon name="back" size={20} /> {G.all}
      </a>
      <header className="rise flex items-start gap-4">
        <span className="grid h-16 w-16 shrink-0 place-items-center rounded-[18px] text-white shadow-md" style={{ background: g.color }}>
          <Icon name={g.icon} size={34} />
        </span>
        <div>
          <h1 className="text-[32px] font-bold leading-tight md:text-[40px]">{g.title[lang]}</h1>
          <p className="mt-1 text-lg text-muted">{g.sub[lang]}</p>
        </div>
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-[22px] font-bold">{G.steps}</h2>
        <ol className="flex flex-col gap-2.5">
          {g.steps.map((s, i) => (
            <li key={i} className="rise flex gap-4 rounded-[20px] bg-card p-4 md:p-5" style={{ '--i': i + 1 } as CSSProperties}>
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[17px] font-bold text-white" style={{ background: g.color }}>
                {i + 1}
              </span>
              <p className="self-center text-[17px] leading-relaxed">{s[lang]}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-[22px] font-bold">{G.hotlines}</h2>
        <ul className="overflow-hidden rounded-[20px] bg-card">
          {g.hotlines.map((n) => (
            <li key={n} className="border-b border-line/60 last:border-0">
              <a href={`tel:${n}`} className="press flex min-h-16 items-center gap-4 px-4 hover:bg-paper/60">
                <span className="grid h-11 min-w-16 place-items-center rounded-[12px] bg-urgent px-2 text-[20px] font-bold text-white">{n}</span>
                <span className="flex-1 text-[16px] leading-snug">{HOTLINES[n][lang]}</span>
                <Icon name="phone" size={20} className="text-go" />
              </a>
            </li>
          ))}
        </ul>
      </section>

      <div className="flex flex-wrap gap-2">
        {mode && (
          <a href={href({ name: 'map', mode: mode as never })} className="press inline-flex min-h-11 items-center gap-2 rounded-full bg-go-soft px-5 font-semibold text-go">
            <Icon name="map" size={18} /> {G.map}
          </a>
        )}
      </div>

      <AskCard text={G.askAbout(g.title[lang])} />

      <p className="text-sm leading-relaxed text-faint">
        {G.sources}:{' '}
        {g.sources.map((s, i) => (
          <span key={s}>
            {i > 0 && ' · '}
            <a href={GUIDE_SOURCES[s].url} target="_blank" rel="noreferrer" className="hover:text-link">
              {GUIDE_SOURCES[s].name[lang]}
            </a>
          </span>
        ))}
      </p>
    </div>
  )
}

/** "Still unsure? Ask น้องใจดี" */
function AskCard({ text }: { text: string }) {
  const { m, lang } = useI18n()
  return (
    <button
      onClick={() => openAssistant({ text, lang })}
      className="press lift flex items-center gap-4 rounded-[22px] bg-gradient-to-br from-[#0a84ff] to-[#5e5ce6] p-5 text-left text-white shadow-[0_12px_36px_rgb(10_132_255/0.3)]"
    >
      <Orb size={52} />
      <span className="flex-1">
        <span className="block text-[18px] font-bold">{m.guide.ask}</span>
        <span className="block text-[15px] text-white/85">{m.guide.askSub}</span>
      </span>
      <Icon name="forward" size={22} />
    </button>
  )
}
