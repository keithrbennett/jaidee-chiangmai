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
      <BackLink href={href({ name: 'map', category: 'all' })}>{m.backToMap}</BackLink>
      <ScreenTitle sub={m.about.intro}>{m.about.title}</ScreenTitle>

      <ol className="flex flex-col gap-3">
        {m.about.steps.map((s, i) => (
          <li key={i} className="flex gap-4 rounded-2xl border-2 border-line bg-card p-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-go-soft text-go">
              <Icon name={STEP_ICONS[i]} size={28} />
            </span>
            <div>
              <div className="text-lg font-bold">
                {i + 1}. {s.title}
              </div>
              <p className="mt-1 text-muted">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <section className="flex gap-3 rounded-2xl border-2 border-urgent bg-urgent-soft p-4">
        <Icon name="alert" size={28} className="text-urgent" />
        <div>
          <div className="text-lg font-bold text-urgent">{m.about.modesTitle}</div>
          <p>{m.about.modesBody}</p>
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
