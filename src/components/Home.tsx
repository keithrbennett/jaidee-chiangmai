import type { ReactNode } from 'react'
import { useI18n } from '../i18n'
import type { IconName } from '../lib/icons'
import { href } from '../lib/router'
import type { Mode } from '../types'
import { Icon } from './Icon'

interface Props {
  mode: Mode
  openCount: number
  urgentCount: number
  myTaskCount: number
}

/**
 * The first screen: one question, three big choices. Each whole card is the button, so there is
 * nothing else to find. Green = helping, orange-red = asking for help (the design rules' colours).
 */
export function Home({ mode, openCount, urgentCount, myTaskCount }: Props) {
  const { m } = useI18n()
  const find = href({ name: 'map', category: 'all' })
  return (
    <div className="flex flex-col gap-5 px-5 py-6 md:gap-6 md:px-6 md:py-10">
      <div className="text-center">
        <h1 className="text-[32px] font-bold leading-tight md:text-[40px]">{m.home.title}</h1>
        <p className="mt-2 text-xl text-muted">{m.home.sub}</p>
      </div>

      {mode !== 'normal' && (
        <a
          href={find}
          className="flex min-h-16 flex-wrap items-center gap-3 rounded-2xl border-2 border-urgent bg-urgent-soft px-5 py-3 text-urgent hover:bg-[#f8dcdc]"
        >
          <Icon name="alert" size={28} />
          <b className="mr-auto text-xl">{(mode === 'haze' ? m.home.hazeUrgent : m.home.floodUrgent)(urgentCount)}</b>
          <span className="inline-flex items-center gap-1 text-lg font-bold">
            {m.home.helpNow} <Icon name="forward" />
          </span>
        </a>
      )}

      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        <RoleCard
          href={find}
          tone="go"
          icon="heart"
          title={m.home.help.title}
          who={m.home.help.who}
          body={m.home.help.body}
          meta={m.home.open(openCount)}
          cta={m.home.help.cta}
        />
        <RoleCard
          href={href({ name: 'post' })}
          tone="ask"
          icon="post"
          title={m.home.ask.title}
          who={m.home.ask.who}
          body={m.home.ask.body}
          cta={m.home.ask.cta}
        />
        <RoleCard
          href={href({ name: 'tasks' })}
          tone="plain"
          icon="tasks"
          title={m.home.tasks.title}
          who={m.home.tasks.who}
          body={m.home.tasks.body}
          meta={m.home.joined(myTaskCount)}
          cta={m.home.tasks.cta}
        />
      </div>

      <a
        href={href({ name: 'about' })}
        className="inline-flex min-h-11 items-center gap-2 self-center rounded-lg px-2 text-lg font-semibold text-ink underline underline-offset-4 hover:text-go"
      >
        <Icon name="about" />
        {m.home.howItWorks}
      </a>
    </div>
  )
}

const TONES = {
  go: {
    card: 'border-go bg-go text-white hover:bg-[#0b4a3c]',
    badge: 'bg-white/15 text-white',
    sub: 'text-white/85',
    cta: 'bg-white text-go',
  },
  ask: {
    card: 'border-ask bg-ask text-white hover:bg-[#962f17]',
    badge: 'bg-white/15 text-white',
    sub: 'text-white/85',
    cta: 'bg-white text-ask',
  },
  plain: {
    card: 'border-ink bg-card text-ink hover:bg-paper',
    badge: 'bg-go-soft text-go',
    sub: 'text-muted',
    cta: 'bg-ink text-white',
  },
}

interface RoleCardProps {
  href: string
  tone: keyof typeof TONES
  icon: IconName
  title: string
  who: string
  body: string
  meta?: ReactNode
  cta: string
}

function RoleCard({ href, tone, icon, title, who, body, meta, cta }: RoleCardProps) {
  const t = TONES[tone]
  return (
    <a
      href={href}
      className={`group flex flex-col gap-4 rounded-2xl border-2 p-5 shadow-sm transition-colors md:min-h-[380px] md:p-6 ${t.card}`}
    >
      {/* Phones: icon beside the title and no description, so all three choices fit on one screen. */}
      <span className="flex items-center gap-4 md:flex-col md:items-start">
        <span className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl md:h-16 md:w-16 ${t.badge}`}>
          <Icon name={icon} size={34} />
        </span>
        <span>
          <span className="block text-[26px] font-bold leading-tight md:text-[30px]">{title}</span>
          <span className={`mt-1 block text-lg font-semibold ${t.sub}`}>{who}</span>
        </span>
      </span>
      <span className="hidden text-lg md:block">{body}</span>
      {meta && <span className={`hidden text-base font-semibold md:block ${t.sub}`}>{meta}</span>}
      <span
        className={`mt-auto inline-flex min-h-16 w-full items-center justify-center gap-2 rounded-2xl px-5 text-xl font-bold ${t.cta}`}
      >
        {cta}
        <Icon name="forward" size={26} className="transition-transform group-hover:translate-x-1" />
      </span>
    </a>
  )
}
