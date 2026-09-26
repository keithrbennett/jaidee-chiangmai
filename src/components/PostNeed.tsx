import { useState } from 'react'
import { useI18n } from '../i18n'
import { CATEGORIES } from '../lib/categories'
import type { LatLng } from '../lib/geo'
import { href } from '../lib/router'
import type { Category, Need } from '../types'

/** Shape returned by POST /api/translate-need (see server/index.js). */
interface NeedDraft {
  title_en: string
  title_th: string
  description_en: string
  description_th: string
  category: Category
  skills: string[]
  place: string
  slot_label: string
  hours: number
  spots_total: number
}

const SAMPLE_TH =
  'สวัสดีค่ะ ครูน้อยจากโรงเรียนบ้านป่าแดดนะคะ ช่วงนี้ฝุ่นเยอะมาก ห้องสมุดของโรงเรียนอยากทำเป็นห้องปลอดฝุ่นให้เด็ก ๆ อ่านหนังสือตอนพักกลางวัน ต้องการคนช่วยติดเทปหน้าต่างกับย้ายชั้นหนังสือประมาณ 5 คน วันเสาร์ที่ 13 ธันวาคม ช่วงเช้า 9 โมงถึงเที่ยงค่ะ'

interface Props {
  mapCenter: LatLng
  onAdd: (need: Need) => void
}

export function PostNeed({ mapCenter, onAdd }: Props) {
  const { m } = useI18n()
  const [text, setText] = useState('')
  const [draft, setDraft] = useState<NeedDraft | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [addedId, setAddedId] = useState<string | null>(null)

  async function generate() {
    setLoading(true)
    setError(null)
    setDraft(null)
    setAddedId(null)
    try {
      const res = await fetch('/api/translate-need', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      const body = await res.json().catch(() => ({ error: m.post.serverError(res.status) }))
      if (!res.ok) throw new Error(body.error ?? m.post.serverError(res.status))
      setDraft(body as NeedDraft)
    } catch (e) {
      setError(
        e instanceof TypeError ? m.post.apiUnreachable : (e as Error).message,
      )
    } finally {
      setLoading(false)
    }
  }

  function addToMap() {
    if (!draft) return
    const id = `posted-${Date.now()}`
    onAdd({
      id,
      title: { en: draft.title_en, th: draft.title_th },
      description: { en: draft.description_en, th: draft.description_th },
      category: draft.category,
      modes: ['normal', 'haze', 'flood'],
      lat: mapCenter.lat,
      lng: mapCenter.lng,
      place: draft.place || m.post.placeTbc,
      partner: m.post.demoPartner,
      verifiedBy: '',
      verifiedDaysAgo: 0,
      hostContact: '—',
      skills: draft.skills,
      slots: [{ id: 's1', label: draft.slot_label, hours: draft.hours }],
      spotsTotal: draft.spots_total,
      spotsTaken: 0,
    })
    setAddedId(id)
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      <div>
        <h2 className="text-lg font-bold">{m.post.title}</h2>
        <p className="text-sm text-slate-600">{m.post.intro}</p>
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={6}
        placeholder={m.post.placeholder}
        className="rounded-lg border border-slate-300 p-2 text-sm"
      />
      <div className="flex gap-2">
        <button
          onClick={() => setText(SAMPLE_TH)}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100"
        >
          {m.post.useSample}
        </button>
        <button
          onClick={generate}
          disabled={loading || text.trim().length < 10}
          className="flex-1 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          {loading ? m.post.drafting : m.post.draft}
        </button>
      </div>

      {error && <div className="rounded-lg bg-red-50 p-3 text-sm text-red-800">⚠️ {error}</div>}

      {draft && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-1 text-sm">
            <span
              className="rounded-full px-2 py-0.5 text-white"
              style={{ background: CATEGORIES[draft.category]?.color ?? '#64748b' }}
            >
              {CATEGORIES[draft.category]?.emoji} {m.categories[draft.category] ?? draft.category}
            </span>
          </div>
          <h3 className="text-lg font-bold">{draft.title_en}</h3>
          <p className="text-slate-500">{draft.title_th}</p>
          <p className="mt-2 text-sm">{draft.description_en}</p>
          <p className="mt-1 text-sm text-slate-500">{draft.description_th}</p>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 text-sm">
            <dt className="text-slate-500">{m.post.where}</dt>
            <dd>{draft.place || '—'}</dd>
            <dt className="text-slate-500">{m.post.when}</dt>
            <dd>
              {draft.slot_label} ({m.detail.hours(draft.hours)})
            </dd>
            <dt className="text-slate-500">{m.post.volunteers}</dt>
            <dd>{draft.spots_total}</dd>
            <dt className="text-slate-500">{m.post.skills}</dt>
            <dd>{draft.skills.join(', ')}</dd>
          </dl>
          <p className="mt-2 text-xs text-slate-500">
            {m.post.draftNote}
          </p>
          {addedId ? (
            <div className="mt-3 rounded-lg bg-emerald-50 p-2 text-sm text-emerald-800">
              ✅ {m.post.added}{' '}
              <a href={href({ name: 'need', id: addedId })} className="font-semibold underline">
                {m.post.seeIt}
              </a>
            </div>
          ) : (
            <button
              onClick={addToMap}
              className="mt-3 w-full rounded-lg bg-emerald-600 py-2 font-semibold text-white hover:bg-emerald-700"
            >
              {m.post.addToMap}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
