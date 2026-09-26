import { useState } from 'react'
import { CATEGORIES, VERIFICATION_TTL_DAYS } from '../lib/categories'
import { distanceKm, formatKm, type LatLng } from '../lib/geo'
import { isPending, spotsLeft, spotsTaken, verifiedLabel } from '../lib/needs'
import type { Commitment, Need } from '../types'

interface Props {
  need: Need
  userLocation: LatLng
  commitments: Commitment[]
  onBack: () => void
  onCommit: (need: Need, slotId: string) => void
  onCancel: (needId: string) => void
}

export function NeedDetail({ need, userLocation, commitments, onBack, onCommit, onCancel }: Props) {
  const cat = CATEGORIES[need.category]
  const mine = commitments.find((c) => c.needId === need.id)
  const [slotId, setSlotId] = useState(need.slots[0]?.id ?? '')
  const left = spotsLeft(need, commitments)
  const taken = spotsTaken(need, commitments)

  return (
    <div className="flex flex-col gap-4 p-4">
      <button onClick={onBack} className="self-start text-sm text-slate-600 hover:underline">
        ← Back to list
      </button>

      <div>
        <div className="mb-1 flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-full px-2 py-0.5 text-white" style={{ background: cat.color }}>
            {cat.emoji} {cat.label.en} · {cat.label.th}
          </span>
          {need.urgent && <span className="rounded bg-red-600 px-1.5 text-xs font-bold text-white">URGENT</span>}
        </div>
        <h2 className="text-xl font-bold">{need.title.en}</h2>
        <p className="text-slate-500">{need.title.th}</p>
      </div>

      <div
        className={`rounded-lg border p-3 text-sm ${
          isPending(need) ? 'border-amber-300 bg-amber-50' : 'border-emerald-300 bg-emerald-50'
        }`}
      >
        <div className="font-semibold">
          {isPending(need) ? '⏳' : '✅'} {verifiedLabel(need)}
          {!isPending(need) && <span className="font-normal"> ({need.partner})</span>}
        </div>
        {isPending(need) ? (
          <div className="text-slate-600">A partner must visit and verify this need before volunteers can join.</div>
        ) : (
          <div className="text-slate-600">
            Someone from {need.partner} went and checked this in person. Verification expires in{' '}
            {VERIFICATION_TTL_DAYS - need.verifiedDaysAgo} days. Host contact: {need.hostContact}
          </div>
        )}
      </div>

      <section className="text-sm">
        <p>{need.description.en}</p>
        <details className="mt-2 text-slate-600" open>
          <summary className="cursor-pointer text-xs text-slate-500">Thai original (ต้นฉบับภาษาไทย)</summary>
          <p className="mt-1">{need.description.th}</p>
        </details>
      </section>

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-slate-500">Where</dt>
        <dd>
          {need.place} · {formatKm(distanceKm(userLocation, need))} away
        </dd>
        <dt className="text-slate-500">Skills</dt>
        <dd>{need.skills.join(', ')}</dd>
        <dt className="text-slate-500">Spots</dt>
        <dd>
          {taken} / {need.spotsTotal} filled
        </dd>
      </dl>

      {need.impact && (
        <section className="text-sm">
          <div className="mb-1 flex justify-between">
            <span className="font-semibold">Impact so far</span>
            <span>
              {need.impact.done.toLocaleString()} / {need.impact.target.toLocaleString()} {need.impact.metric}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded bg-slate-200">
            <div
              className="h-full bg-emerald-500"
              style={{ width: `${Math.min(100, (100 * need.impact.done) / need.impact.target)}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-slate-500">Numbers are confirmed by the host, not self-reported.</p>
        </section>
      )}

      <section className="rounded-lg bg-slate-50 p-3 text-sm">
        <div className="mb-1 font-semibold">⚠️ Safety rules</div>
        <ul className="list-disc pl-5">
          {cat.safety.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
        <p className="mt-1 text-xs text-slate-500">Added automatically for every {cat.label.en.toLowerCase()} need.</p>
      </section>

      {mine ? (
        <div className="rounded-xl border-2 border-emerald-500 bg-emerald-50 p-4 text-center">
          <div className="text-lg font-bold text-emerald-800">
            {mine.waitlist ? "You're on the waitlist ⏳" : "You're in! 🎉"}
          </div>
          <div className="text-sm">{need.slots.find((s) => s.id === mine.slotId)?.label}</div>
          <div className="my-2 text-sm text-slate-600">
            {mine.waitlist
              ? 'We will message you if a spot opens. Keep this code for check-in.'
              : 'Show this code to the host at check-in'}
          </div>
          <div className="font-mono text-3xl font-bold tracking-widest">{mine.code}</div>
          <button onClick={() => onCancel(need.id)} className="mt-3 text-sm text-red-700 hover:underline">
            Can't make it? Cancel and free the spot
          </button>
        </div>
      ) : isPending(need) ? null : (
        <section className="flex flex-col gap-2">
          <div className="text-sm font-semibold">Pick a time</div>
          {need.slots.map((s) => (
            <label key={s.id} className="flex cursor-pointer items-center gap-2 rounded-lg border p-2 text-sm">
              <input type="radio" name="slot" checked={slotId === s.id} onChange={() => setSlotId(s.id)} />
              <span className="flex-1">{s.label}</span>
              <span className="text-slate-500">{s.hours} h</span>
            </label>
          ))}
          <button
            onClick={() => onCommit(need, slotId)}
            className="mt-1 rounded-xl bg-emerald-600 py-3 text-lg font-bold text-white hover:bg-emerald-700"
          >
            {left === 0 ? 'Join the waitlist' : "I'm in"}
          </button>
        </section>
      )}
    </div>
  )
}
