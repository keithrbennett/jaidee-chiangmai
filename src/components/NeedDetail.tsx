import { useState } from 'react'
import { useI18n } from '../i18n'
import { CATEGORY_ICONS, VERIFICATION_TTL_DAYS } from '../lib/categories'
import { distanceKm, formatKm, type LatLng } from '../lib/geo'
import { isPending, spotsLeft, spotsTaken, verifiedLabel } from '../lib/needs'
import type { Commitment, Need } from '../types'
import { Icon } from './Icon'
import { BackLink, Button, Card, Pill } from './ui'

interface Props {
  need: Need
  userLocation: LatLng
  commitments: Commitment[]
  backHref: string
  onCommit: (need: Need, slotId: string) => void
  onCancel: (needId: string) => void
}

export function NeedDetail({ need, userLocation, commitments, backHref, onCommit, onCancel }: Props) {
  const { m } = useI18n()
  const catLabel = m.categories[need.category]
  const mine = commitments.find((c) => c.needId === need.id)
  const [slotId, setSlotId] = useState(need.slots[0]?.id ?? '')
  const left = spotsLeft(need, commitments)
  const taken = spotsTaken(need, commitments)
  const pending = isPending(need)

  return (
    <div className="flex flex-col gap-5 p-6">
      <div className="flex items-center justify-between">
        <BackLink href={backHref}>{m.detail.back}</BackLink>
        <ShareButton title={need.title.en} />
      </div>

      <div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Pill tone="neutral" icon={CATEGORY_ICONS[need.category]}>
            {catLabel}
          </Pill>
          {need.urgent && (
            <Pill tone="urgent" icon="alert">
              {m.list.urgent}
            </Pill>
          )}
        </div>
        <h2 className="text-[34px] font-bold leading-tight">{need.title.en}</h2>
        <p className="text-lg text-muted">{need.title.th}</p>
      </div>

      <div
        className="flex gap-3 rounded-[18px] bg-card p-5"
      >
        <Icon name={pending ? 'clock' : 'shield'} size={28} className={pending ? 'text-muted' : 'text-go'} />
        <div>
          <div className={`font-bold ${pending ? '' : 'text-go'}`}>
            {verifiedLabel(need, m)}
            {!pending && <span className="font-normal"> ({need.partner})</span>}
          </div>
          <p className="text-base text-muted">
            {pending
              ? m.detail.pendingExplainer
              : m.detail.verifiedExplainer(need.partner, VERIFICATION_TTL_DAYS - need.verifiedDaysAgo, need.hostContact)}
          </p>
        </div>
      </div>

      <section>
        <p>{need.description.en}</p>
        <details className="mt-2 text-muted" open>
          <summary className="cursor-pointer text-base font-medium">{m.detail.thaiOriginal}</summary>
          <p className="mt-1">{need.description.th}</p>
        </details>
      </section>

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
        <dt className="inline-flex items-center gap-1 text-muted">
          <Icon name="pin" size={20} /> {m.detail.where}
        </dt>
        <dd>
          {need.place} · {m.detail.away(formatKm(distanceKm(userLocation, need)))}
        </dd>
        <dt className="inline-flex items-center gap-1 text-muted">
          <Icon name="sparkle" size={20} /> {m.detail.skills}
        </dt>
        <dd>{need.skills.join(', ')}</dd>
        <dt className="inline-flex items-center gap-1 text-muted">
          <Icon name="users" size={20} /> {m.detail.spots}
        </dt>
        <dd>{m.detail.filled(taken, need.spotsTotal)}</dd>
      </dl>

      {need.impact && (
        <section>
          <div className="mb-2 flex justify-between gap-4">
            <span className="font-bold">{m.detail.impactSoFar}</span>
            <span>
              {need.impact.done.toLocaleString()} / {need.impact.target.toLocaleString()} {need.impact.metric}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-line/70">
            <div
              className="h-full bg-go"
              style={{ width: `${Math.min(100, (100 * need.impact.done) / need.impact.target)}%` }}
            />
          </div>
          <p className="mt-1 text-base text-muted">{m.detail.impactNote}</p>
        </section>
      )}

      <Card className="!p-4">
        <div className="mb-1 flex items-center gap-2 font-bold">
          <Icon name="alert" className="text-urgent" /> {m.detail.safetyTitle}
        </div>
        <ul className="list-disc pl-6">
          {m.safety[need.category].map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
        <p className="mt-1 text-base text-muted">{m.detail.safetyNote(catLabel)}</p>
      </Card>

      {mine ? (
        <div className="rounded-[18px] bg-card p-6 text-center">
          <div className="inline-flex items-center gap-2 text-[34px] font-bold text-go">
            <Icon name={mine.waitlist ? 'clock' : 'check'} size={30} />
            {mine.waitlist ? m.detail.waitlisted : m.detail.joined}
          </div>
          <div className="text-lg">{need.slots.find((s) => s.id === mine.slotId)?.label}</div>
          <div className="my-2 text-muted">{mine.waitlist ? m.detail.waitlistNote : m.detail.codeNote}</div>
          <div className="font-mono text-4xl font-bold tracking-widest">{mine.code}</div>
          <Button variant="danger" onClick={() => onCancel(need.id)} className="mt-4">
            {m.detail.cancel}
          </Button>
        </div>
      ) : pending ? null : (
        <section className="flex flex-col gap-3">
          <h3 className="text-xl font-bold">{m.detail.pickTime}</h3>
          {need.slots.map((s) => (
            <label
              key={s.id}
              className={`flex min-h-14 cursor-pointer items-center gap-3 rounded-[14px] border bg-card px-4 ${
                slotId === s.id ? 'border-go ring-1 ring-go' : 'border-line hover:border-faint'
              }`}
            >
              <input
                type="radio"
                name="slot"
                checked={slotId === s.id}
                onChange={() => setSlotId(s.id)}
                className="h-5 w-5 accent-[var(--accent)]"
              />
              <span className="flex-1 font-semibold">{s.label}</span>
              <span className="text-muted">{m.detail.hours(s.hours)}</span>
            </label>
          ))}
          <Button main icon="check" onClick={() => onCommit(need, slotId)}>
            {left === 0 ? m.detail.joinWaitlist : m.detail.imIn}
          </Button>
        </section>
      )}
    </div>
  )
}

/** Every need has its own URL, so a volunteer can send it to a friend or a partner can share it. */
function ShareButton({ title }: { title: string }) {
  const { m } = useI18n()
  const [copied, setCopied] = useState(false)
  async function share() {
    const url = window.location.href
    if (navigator.share) {
      await navigator.share({ title, url }).catch(() => {})
      return
    }
    await navigator.clipboard?.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  return (
    <Button variant="secondary" icon={copied ? 'check' : 'share'} onClick={share}>
      {copied ? m.detail.copied : m.detail.share}
    </Button>
  )
}
