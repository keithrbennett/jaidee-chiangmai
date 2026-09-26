import { CATEGORIES } from '../lib/categories'
import type { Commitment, Need } from '../types'

interface Props {
  commitments: Commitment[]
  needs: Need[]
  onOpen: (needId: string) => void
  onCancel: (needId: string) => void
}

export function MyTasks({ commitments, needs, onOpen, onCancel }: Props) {
  const rows = commitments
    .map((c) => ({ c, need: needs.find((n) => n.id === c.needId) }))
    .filter((r): r is { c: Commitment; need: Need } => r.need !== undefined)
  const confirmed = rows.filter((r) => !r.c.waitlist)
  const hours = confirmed.reduce((sum, r) => sum + r.c.hours, 0)

  if (rows.length === 0) {
    return (
      <div className="p-6 text-center text-slate-500">
        <div className="text-4xl">🗺️</div>
        <p className="mt-2">You haven't joined anything yet.</p>
        <p className="text-sm">Pick a need on the map and tap “I'm in”.</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="rounded-xl bg-gradient-to-br from-emerald-600 to-teal-700 p-4 text-white shadow">
        <div className="text-xs uppercase tracking-wide opacity-80">Your impact receipt (pledged)</div>
        <div className="mt-1 text-3xl font-bold">{hours} hours</div>
        <div className="text-sm opacity-90">
          across {confirmed.length} verified need{confirmed.length === 1 ? '' : 's'} in Chiang Mai
        </div>
        <div className="mt-2 text-xs opacity-80">Hours become confirmed impact once the host checks you in and signs off.</div>
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
                  <button onClick={() => onOpen(need.id)} className="text-left font-semibold hover:underline">
                    {need.title.en}
                  </button>
                  <div className="text-sm text-slate-600">
                    {slot?.label} · {need.place}
                  </div>
                  <div className="text-sm">
                    {c.waitlist ? '⏳ Waitlist' : '✅ Confirmed'} · check-in code{' '}
                    <span className="font-mono font-bold">{c.code}</span>
                  </div>
                </div>
                <button onClick={() => onCancel(c.needId)} className="text-sm text-red-700 hover:underline">
                  Cancel
                </button>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
