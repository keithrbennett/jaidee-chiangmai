import { useState } from 'react'
import { useI18n } from '../../i18n'
import { api } from '../../lib/api'
import { provinceHref } from '../../lib/router'
import { LEVELS, LEVEL_CM, LEVEL_COLOR } from '../../lib/water'
import { Button } from '../ui'
import { Choices, Field, LocationPicker, PhotoInput, inputCls } from '../kit'
import { errorText } from '../../lib/ui'
import { SectionPage, type ProvinceProps } from './ProvincePage'

export function ReportForm({ province, reloadReports }: ProvinceProps) {
  const { m } = useI18n()
  const [where, setWhere] = useState<[number, number] | null>(null)
  const [level, setLevel] = useState<number | null>(null)
  const [trend, setTrend] = useState<'rising' | 'steady' | 'falling' | null>(null)
  const [passable, setPassable] = useState<'car' | 'high' | 'boat' | null>(null)
  const [photo, setPhoto] = useState<string | null>(null)
  const [note, setNote] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [error, setError] = useState<string | null>(null)

  async function send() {
    if (!where || level === null) return
    setState('sending')
    setError(null)
    try {
      await api('/reports', { body: { lng: where[0], lat: where[1], level, trend, passable, note: note || null, photo } })
      setState('sent')
      reloadReports()
    } catch (err) {
      setError(errorText(err, m))
      setState('idle')
    }
  }

  if (state === 'sent') {
    return (
      <SectionPage province={province} title={m.report.title}>
        <p className="rounded-[18px] bg-[#34c759]/15 p-5 text-lg font-semibold text-[#248a3d]">{m.report.sent}</p>
        <div className="flex flex-wrap gap-2">
          <Button href={provinceHref(province, 'updates')}>{m.report.seeUpdates}</Button>
          <Button
            variant="secondary"
            onClick={() => {
              setState('idle')
              setLevel(null)
              setWhere(null)
              setPhoto(null)
              setNote('')
            }}
          >
            {m.report.another}
          </Button>
        </div>
      </SectionPage>
    )
  }

  return (
    <SectionPage province={province} title={m.report.title}>
      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">{m.report.step1}</h2>
        <LocationPicker value={where} onChange={setWhere} center={province.center} />
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">{m.report.step2}</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {LEVELS.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLevel(l)}
              aria-pressed={level === l}
              className={`flex min-h-20 flex-col items-start justify-center rounded-[16px] border-2 p-3 text-left transition ${level === l ? 'text-white' : 'border-line bg-card'}`}
              style={level === l ? { background: LEVEL_COLOR[l], borderColor: LEVEL_COLOR[l] } : undefined}
            >
              <span className="flex items-center gap-2 font-semibold">
                {level !== l && <span className="h-3 w-3 rounded-full" style={{ background: LEVEL_COLOR[l] }} />}
                {m.levels.names[l]}
              </span>
              <span className="text-sm opacity-80">{LEVEL_CM[l]} cm</span>
            </button>
          ))}
        </div>
      </section>
      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-bold">{m.report.step3}</h2>
        <Choices options={(['rising', 'steady', 'falling'] as const).map((k) => [k, m.report.trend[k]])} value={trend} onChange={(v) => setTrend(trend === v ? null : v)} />
        <Choices options={(['car', 'high', 'boat'] as const).map((k) => [k, m.report.passable[k]])} value={passable} onChange={(v) => setPassable(passable === v ? null : v)} />
      </section>
      <PhotoInput value={photo} onChange={setPhoto} />
      <Field label={m.report.note}>
        <textarea className={`${inputCls} min-h-24 py-2`} maxLength={280} value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      {error && <p className="font-semibold text-urgent">{error}</p>}
      <Button main onClick={send} disabled={!where || level === null || state === 'sending'}>
        {state === 'sending' ? m.common.sending : m.report.send}
      </Button>
      <p className="text-sm text-faint">{m.report.privacy}</p>
    </SectionPage>
  )
}
