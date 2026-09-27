import { useState } from 'react'
import { useI18n } from '../i18n'
import { CATEGORY_ICONS } from '../lib/categories'
import type { LatLng } from '../lib/geo'
import { href } from '../lib/router'
import type { Category, Need } from '../types'
import { Icon } from './Icon'
import { BackLink, Button, Card, Pill, ScreenTitle } from './ui'

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
    <div className="flex flex-col gap-5 p-6">
      <BackLink href={href({ name: 'home' })}>{m.backHome}</BackLink>
      <ScreenTitle sub={m.post.intro}>{m.post.title}</ScreenTitle>

      {/* One decision per screen: write the need, then check Claude's draft. */}
      {!draft && (
        <>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={7}
            placeholder={m.post.placeholder}
            className="rounded-2xl border-2 border-line bg-card p-4 text-lg placeholder:text-off focus:border-go"
          />
          <Button variant="secondary" onClick={() => setText(SAMPLE_TH)} className="self-start">
            {m.post.useSample}
          </Button>
          <Button main variant="ask" icon="sparkle" onClick={generate} disabled={loading || text.trim().length < 10}>
            {loading ? m.post.drafting : m.post.draft}
          </Button>
        </>
      )}

      {error && (
        <div className="flex gap-3 rounded-2xl border-2 border-urgent bg-urgent-soft p-4 text-urgent">
          <Icon name="alert" size={26} /> {error}
        </div>
      )}

      {draft && (
        <Card>
          <Pill tone="neutral" icon={CATEGORY_ICONS[draft.category] ?? 'about'}>
            {m.categories[draft.category] ?? draft.category}
          </Pill>
          <h3 className="mt-2 text-[26px] font-bold leading-tight">{draft.title_en}</h3>
          <p className="text-lg text-muted">{draft.title_th}</p>
          <p className="mt-3">{draft.description_en}</p>
          <p className="mt-1 text-muted">{draft.description_th}</p>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            <dt className="text-muted">{m.post.where}</dt>
            <dd>{draft.place || '—'}</dd>
            <dt className="text-muted">{m.post.when}</dt>
            <dd>
              {draft.slot_label} ({m.detail.hours(draft.hours)})
            </dd>
            <dt className="text-muted">{m.post.volunteers}</dt>
            <dd>{draft.spots_total}</dd>
            <dt className="text-muted">{m.post.skills}</dt>
            <dd>{draft.skills.join(', ')}</dd>
          </dl>
          <p className="mt-3 text-base text-muted">{m.post.draftNote}</p>
          {addedId ? (
            <div className="mt-4 flex flex-col gap-3 rounded-2xl border-2 border-go bg-go-soft p-4 text-go">
              <span className="inline-flex items-center gap-2 font-semibold">
                <Icon name="check" /> {m.post.added}
              </span>
              <Button main href={href({ name: 'need', id: addedId })} icon="map">
                {m.post.seeIt}
              </Button>
            </div>
          ) : (
            <div className="mt-4 flex flex-col gap-3">
              <Button main icon="check" onClick={addToMap}>
                {m.post.addToMap}
              </Button>
              <Button variant="secondary" icon="back" onClick={() => setDraft(null)} className="self-start">
                {m.post.edit}
              </Button>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
