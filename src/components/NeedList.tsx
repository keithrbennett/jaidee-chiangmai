import type { ReactNode } from 'react'
import { CATEGORIES } from '../lib/categories'
import { distanceKm, formatKm, type LatLng } from '../lib/geo'
import { isPending, spotsLeft, verifiedLabel } from '../lib/needs'
import type { Category, Commitment, Mode, Need } from '../types'

interface Props {
  needs: Need[]
  mode: Mode
  userLocation: LatLng
  locationIsDefault: boolean
  commitments: Commitment[]
  category: Category | 'all'
  categories: Category[]
  onCategoryChange: (c: Category | 'all') => void
  onSelect: (id: string) => void
  hiddenStaleCount: number
}

export function NeedList(props: Props) {
  const { needs, mode, userLocation, locationIsDefault, commitments, category, categories } = props
  return (
    <div className="flex flex-col gap-3 p-4">
      {mode !== 'normal' && (
        <div
          className={`rounded-lg p-3 text-sm ${mode === 'haze' ? 'bg-red-50 text-red-900' : 'bg-blue-50 text-blue-900'}`}
        >
          <b>{mode === 'haze' ? '🔴 Haze emergency mode' : '🔵 Flood emergency mode'}</b> — showing only urgent,
          partner-verified needs for this crisis. Switched on by Chiang Mai Municipality.
        </div>
      )}

      <div className="flex flex-wrap gap-1.5">
        <Chip active={category === 'all'} onClick={() => props.onCategoryChange('all')}>
          All
        </Chip>
        {categories.map((c) => (
          <Chip key={c} active={category === c} onClick={() => props.onCategoryChange(c)}>
            {CATEGORIES[c].emoji} {CATEGORIES[c].label.en}
          </Chip>
        ))}
      </div>

      <h2 className="text-sm font-semibold text-slate-700">
        {needs.length} needs near you
        <span className="font-normal text-slate-500">
          {' '}
          · sorted by {mode === 'normal' ? 'distance' : 'urgency, then distance'}
          {locationIsDefault && ' from Nimman (location not shared)'}
        </span>
      </h2>

      {needs.length === 0 && <p className="text-sm text-slate-500">No needs match this filter.</p>}

      <ul className="flex flex-col gap-2">
        {needs.map((n) => {
          const cat = CATEGORIES[n.category]
          const left = spotsLeft(n, commitments)
          const mine = commitments.some((c) => c.needId === n.id)
          return (
            <li key={n.id}>
              <button
                onClick={() => props.onSelect(n.id)}
                className="w-full rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm hover:border-slate-400"
              >
                <div className="flex items-start gap-3">
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-lg"
                    style={{ background: cat.color }}
                  >
                    {cat.emoji}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {n.urgent && <span className="rounded bg-red-600 px-1.5 text-xs font-bold text-white">URGENT</span>}
                      {mine && <span className="rounded bg-emerald-600 px-1.5 text-xs font-bold text-white">YOU'RE IN</span>}
                      <span className="font-semibold">{n.title.en}</span>
                    </div>
                    <div className="text-sm text-slate-500">{n.title.th}</div>
                    <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-slate-600">
                      <span>📍 {formatKm(distanceKm(userLocation, n))}</span>
                      <span className={left === 0 ? 'text-red-600' : ''}>
                        👥 {left === 0 ? 'Full (waitlist)' : `${left} of ${n.spotsTotal} spots left`}
                      </span>
                      <span className={isPending(n) ? 'text-amber-700' : 'text-emerald-700'}>
                        {isPending(n) ? '⏳' : '✅'} {verifiedLabel(n)}
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            </li>
          )
        })}
      </ul>

      {props.hiddenStaleCount > 0 && (
        <p className="text-xs text-slate-500">
          {props.hiddenStaleCount} need{props.hiddenStaleCount > 1 ? 's' : ''} hidden because verification is older than
          14 days. Partners get a reminder to re-check.
        </p>
      )}
    </div>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-sm ${
        active ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-300 bg-white hover:bg-slate-100'
      }`}
    >
      {children}
    </button>
  )
}
