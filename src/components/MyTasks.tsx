import { useI18n } from '../i18n'
import { CATEGORIES } from '../lib/categories'
import { href } from '../lib/router'
import type { Commitment, Need } from '../types'

interface Props {
  commitments: Commitment[]
  needs: Need[]
  onCancel: (needId: string) => void
}

export function MyTasks({ commitments, needs, onCancel }: Props) {
  const { m } = useI18n()
  const rows = commitments
    .map((c) => ({ c, need: needs.find((n) => n.id === c.needId) }))
    .filter((r): r is { c: Commitment; need: Need } => r.need !== undefined)
  const confirmed = rows.filter((r) => !r.c.waitlist)
  const hours = confirmed.reduce((sum, r) => sum + r.c.hours, 0)

  if (rows.length === 0) {
    return (
      <div className="p-6 text-center text-slate-500">
        <div className="text-4xl">🗺️</div>
        <p className="mt-2">{m.tasks.emptyTitle}</p>
        <p className="text-sm">{m.tasks.emptyBody}</p>
        <a
          href={href({ name: 'map', category: 'all' })}
          className="mt-4 inline-block rounded-xl bg-emerald-600 px-4 py-2 font-semibold text-white hover:bg-emerald-700"
        >
          {m.tasks.findNeed}
        </a>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="rounded-xl bg-gradient-to-br from-emerald-600 to-teal-700 p-4 text-white shadow">
        <div className="text-xs uppercase tracking-wide opacity-80">{m.tasks.receiptTitle}</div>
        <div className="mt-1 text-3xl font-bold">{m.tasks.hours(hours)}</div>
        <div className="text-sm opacity-90">{m.tasks.across(confirmed.length)}</div>
        <div className="mt-2 text-xs opacity-80">{m.tasks.receiptNote}</div>
      </div>

      <ul className="flex flex-col gap-2">
        {rows.map(({ c, need }) => {
          const cat = CATEGORIES[need.category]
          const slot = need.slots.find((s) => s.id === c.slotId)
          return (
            <li key={c.needId} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <div className="flex items-start gap-3">
                <span className="text-2xl">{cat.emoji}</span>
                <div className="flex-1">
                  <a href={href({ name: 'need', id: need.id })} className="font-semibold hover:underline">
                    {need.title.en}
                  </a>
                  <div className="text-sm text-slate-600">
                    {slot?.label} · {need.place}
                  </div>
                  <div className="text-sm">
                    {c.waitlist ? m.tasks.waitlist : m.tasks.confirmed} · {m.tasks.checkInCode}{' '}
                    <span className="font-mono font-bold">{c.code}</span>
                  </div>
                </div>
                <button onClick={() => onCancel(c.needId)} className="text-sm text-red-700 hover:underline">
                  {m.tasks.cancel}
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
