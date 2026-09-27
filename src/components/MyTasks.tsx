import { useI18n } from '../i18n'
import { CATEGORY_ICONS } from '../lib/categories'
import { href } from '../lib/router'
import type { Commitment, Need } from '../types'
import { Icon } from './Icon'
import { BackLink, Button, ScreenTitle } from './ui'

interface Props {
  commitments: Commitment[]
  needs: Need[]
  onCancel: (needId: string) => void
}

const MAP_HREF = href({ name: 'map', category: 'all' })

export function MyTasks({ commitments, needs, onCancel }: Props) {
  const { m } = useI18n()
  const rows = commitments
    .map((c) => ({ c, need: needs.find((n) => n.id === c.needId) }))
    .filter((r): r is { c: Commitment; need: Need } => r.need !== undefined)
  const confirmed = rows.filter((r) => !r.c.waitlist)
  const hours = confirmed.reduce((sum, r) => sum + r.c.hours, 0)

  return (
    <div className="flex flex-col gap-5 p-6">
      <BackLink href={href({ name: 'home' })}>{m.backHome}</BackLink>
      <ScreenTitle>{m.tabs.tasks}</ScreenTitle>

      {rows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-line bg-card p-8 text-center">
          <Icon name="map" size={48} className="text-muted" />
          <p className="text-xl font-bold">{m.tasks.emptyTitle}</p>
          <p className="text-muted">{m.tasks.emptyBody}</p>
          <Button main icon="search" href={MAP_HREF} className="mt-2">
            {m.tasks.findNeed}
          </Button>
        </div>
      ) : (
        <>
          <div className="rounded-2xl border-2 border-go bg-go p-5 text-white">
            <div className="text-base font-semibold uppercase tracking-wide opacity-90">{m.tasks.receiptTitle}</div>
            <div className="mt-1 text-4xl font-bold">{m.tasks.hours(hours)}</div>
            <div className="text-lg">{m.tasks.across(confirmed.length)}</div>
            <div className="mt-2 text-base opacity-90">{m.tasks.receiptNote}</div>
          </div>

          <ul className="flex flex-col gap-3">
            {rows.map(({ c, need }) => {
              const slot = need.slots.find((s) => s.id === c.slotId)
              return (
                <li key={c.needId} className="flex items-start gap-4 rounded-2xl border-2 border-line bg-card p-4">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-go-soft text-go">
                    <Icon name={CATEGORY_ICONS[need.category]} size={28} />
                  </span>
                  <div className="flex-1">
                    <a href={href({ name: 'need', id: need.id })} className="text-lg font-bold hover:underline">
                      {need.title.en}
                    </a>
                    <div className="text-muted">
                      {slot?.label} · {need.place}
                    </div>
                    <div className={`mt-1 inline-flex items-center gap-1 ${c.waitlist ? 'text-muted' : 'font-semibold text-go'}`}>
                      <Icon name={c.waitlist ? 'clock' : 'check'} size={20} />
                      {c.waitlist ? m.tasks.waitlist : m.tasks.confirmed} · {m.tasks.checkInCode}{' '}
                      <span className="whitespace-nowrap font-mono font-bold text-ink">{c.code}</span>
                    </div>
                  </div>
                  <Button variant="danger" onClick={() => onCancel(c.needId)}>
                    {m.tasks.cancel}
                  </Button>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}
