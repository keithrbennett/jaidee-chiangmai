import { useI18n } from '../i18n'
import type { IconName } from '../lib/icons'
import { href } from '../lib/router'
import { Icon } from './Icon'
import { BackLink, Button, ScreenTitle } from './ui'

const STEP_ICONS: IconName[] = ['shield', 'users', 'check', 'heart']

export function About() {
  const { m } = useI18n()
  return (
    <div className="flex flex-col gap-5 p-6">
      <BackLink href={href({ name: 'home' })}>{m.backHome}</BackLink>
      <ScreenTitle sub={m.about.intro}>{m.about.title}</ScreenTitle>

      <ol className="flex flex-col gap-3">
        {m.about.steps.map((s, i) => (
          <li key={i} className="flex gap-5 rounded-[18px] bg-card p-6">
            <span className="w-10 shrink-0 text-[44px] font-bold leading-none text-go tabular-nums">{i + 1}</span>
            <div>
              <div className="flex items-center gap-2 text-[21px] font-semibold">
                <Icon name={STEP_ICONS[i]} size={22} className="text-go" />
                {s.title}
              </div>
              <p className="mt-1 text-muted">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <section className="flex gap-3 rounded-[18px] bg-inverse p-6 text-on-inverse">
        <Icon name="alert" size={26} className="text-[#ff453a]" />
        <div>
          <div className="text-[21px] font-semibold">{m.about.modesTitle}</div>
          <p className="text-on-inverse-2">{m.about.modesBody}</p>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        <Button main icon="users" href={href({ name: 'map', category: 'all' })}>
          {m.about.help}
        </Button>
        <Button main variant="ask" icon="post" href={href({ name: 'post' })}>
          {m.about.needHelp}
        </Button>
      </div>
    </div>
  )
}
