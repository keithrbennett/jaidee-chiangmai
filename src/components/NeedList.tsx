import type { ReactNode } from 'react'
import { useI18n } from '../i18n'
import { CATEGORY_ICONS } from '../lib/categories'
import { distanceKm, formatKm, type LatLng } from '../lib/geo'
import { isPending, spotsLeft, verifiedLabel } from '../lib/needs'
import { href } from '../lib/router'
import type { Category, Commitment, Mode, Need } from '../types'
import { Icon } from './Icon'
import { BackLink, Pill } from './ui'

interface Props {
  needs: Need[]
  mode: Mode
  userLocation: LatLng
  locationIsDefault: boolean
  commitments: Commitment[]
  category: Category | 'all'
  categories: Category[]
  onCategoryChange: (c: Category | 'all') => void
  hiddenStaleCount: number
}

export function NeedList(props: Props) {
  const { needs, mode, userLocation, locationIsDefault, commitments, category, categories } = props
  const { m } = useI18n()
  return (
    <div className="flex flex-col gap-4 p-6">
      <BackLink href={href({ name: 'home' })}>{m.backHome}</BackLink>
      {mode !== 'normal' && (
        <div className="flex gap-3 rounded-2xl border-2 border-urgent bg-urgent-soft p-4 text-urgent">
          <Icon name="alert" size={28} />
          <div>
            <b className="text-lg">{mode === 'haze' ? m.list.hazeBanner : m.list.floodBanner}</b>
            <p className="text-base">{m.list.emergencyExplainer}</p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Chip active={category === 'all'} onClick={() => props.onCategoryChange('all')}>
          {m.list.all}
        </Chip>
        {categories.map((c) => (
          <Chip key={c} active={category === c} onClick={() => props.onCategoryChange(c)}>
            <Icon name={CATEGORY_ICONS[c]} size={20} />
            {m.categories[c]}
          </Chip>
        ))}
      </div>

      <div>
        <h2 className="text-[26px] font-bold leading-tight">{m.list.count(needs.length)}</h2>
        <p className="text-base text-muted">
          {mode === 'normal' ? m.list.sortedByDistance : m.list.sortedByUrgency}
          {locationIsDefault && ` · ${m.list.fromNimman}`}
        </p>
      </div>

      {needs.length === 0 && (
        <p className="text-muted">
          {m.list.noMatch}{' '}
          {category !== 'all' && (
            <button onClick={() => props.onCategoryChange('all')} className="font-semibold text-go underline">
              {m.list.showAll}
            </button>
          )}
        </p>
      )}

      <ul className="flex flex-col gap-3">
        {needs.map((n) => {
          const left = spotsLeft(n, commitments)
          const mine = commitments.some((c) => c.needId === n.id)
          return (
            <li key={n.id}>
              <a
                href={href({ name: 'need', id: n.id })}
                className={`flex gap-4 rounded-2xl border-2 bg-card p-4 hover:border-muted ${
                  n.urgent ? 'border-urgent' : 'border-line'
                }`}
              >
                <span
                  className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${
                    n.urgent ? 'bg-urgent-soft text-urgent' : 'bg-go-soft text-go'
                  }`}
                >
                  <Icon name={CATEGORY_ICONS[n.category]} size={28} />
                </span>
                <span className="min-w-0 flex-1">
                  {(n.urgent || mine) && (
                    <span className="mb-1 flex flex-wrap gap-2">
                      {n.urgent && <Pill tone="urgent" icon="alert">{m.list.urgent}</Pill>}
                      {mine && <Pill tone="go" icon="check">{m.list.youreIn}</Pill>}
                    </span>
                  )}
                  <span className="block text-lg font-bold leading-snug">{n.title.en}</span>
                  <span className="block text-base text-muted">{n.title.th}</span>
                  <span className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-base text-muted">
                    <span className="inline-flex items-center gap-1">
                      <Icon name="pin" size={18} /> {formatKm(distanceKm(userLocation, n))}
                    </span>
                    <span className={`inline-flex items-center gap-1 ${left === 0 ? 'font-semibold text-urgent' : ''}`}>
                      <Icon name="users" size={18} />
                      {left === 0 ? m.list.full : m.list.spotsLeft(left, n.spotsTotal)}
                    </span>
                    <span className={`inline-flex items-center gap-1 ${isPending(n) ? '' : 'text-go'}`}>
                      <Icon name={isPending(n) ? 'clock' : 'shield'} size={18} />
                      {verifiedLabel(n, m)}
                    </span>
                  </span>
                </span>
                <Icon name="forward" size={24} className="self-center text-muted" />
              </a>
            </li>
          )
        })}
      </ul>

      {props.hiddenStaleCount > 0 && <p className="text-base text-muted">{m.list.hiddenStale(props.hiddenStaleCount)}</p>}
    </div>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex min-h-11 items-center gap-2 rounded-xl border-2 px-4 text-base font-semibold ${
        active ? 'border-ink bg-ink text-white' : 'border-line bg-card text-ink hover:border-muted'
      }`}
    >
      {children}
    </button>
  )
}
