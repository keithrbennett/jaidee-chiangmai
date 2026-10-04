import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useI18n } from '../../i18n'
import { api, type Report, type Tri } from '../../lib/api'
import { checkAssistantMode, useAssistant } from '../../lib/assistant'
import { placeName } from '../../lib/geo'
import { closeQuickReport, useQuickReport, type ReportPrefill } from '../../lib/report'
import { provinceByCode, provinceHref } from '../../lib/router'
import { errorText, shrinkPhoto, useGeolocation } from '../../lib/ui'
import { LEVELS, LEVEL_CM, LEVEL_COLOR } from '../../lib/water'
import { Orb } from '../assistant/Orb'
import { Icon } from '../Icon'
import { CheckBadge, Choices, GeoMessage, LocationPicker, inputCls } from '../kit'
import { LevelFigure } from './LevelFigure'

type Estimate = { state: 'idle' | 'busy' | 'done' | 'failed'; level?: number; showsWater?: boolean; reason?: Tri }

/**
 * Report the water where you are: a photo first, the place found by GPS, the depth picked from pictures of
 * a person standing in it, and send. Extras (trend, passable, a note) stay folded away. After sending, the
 * page waits for น้องใจดี's check and shows it.
 */
export function QuickReportForm({ prefill, onClose, onSent }: { prefill: ReportPrefill; onClose?: () => void; onSent?: () => void }) {
  const { m, lang } = useI18n()
  const R = m.report
  const ai = useAssistant().ai
  const geo = useGeolocation()
  const [photo, setPhoto] = useState<string | null>(prefill.photo ?? null)
  const [where, setWhere] = useState<[number, number] | null>(prefill.location ?? null)
  const [place, setPlace] = useState<{ label: string; province: string } | null>(null)
  const [pick, setPick] = useState(false)
  const [level, setLevel] = useState<number | null>(prefill.level ?? null)
  const [trend, setTrend] = useState(prefill.trend ?? null)
  const [passable, setPassable] = useState(prefill.passable ?? null)
  const [note, setNote] = useState(prefill.note ?? '')
  const [more, setMore] = useState(!!(prefill.trend || prefill.passable || prefill.note))
  const [estimate, setEstimate] = useState<Estimate>({ state: 'idle' })
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<Report | null>(null)
  const file = useRef<HTMLInputElement>(null)
  const located = useRef(false)

  useEffect(() => {
    void checkAssistantMode()
  }, [])
  // Find the place on open, unless it came with the form.
  useEffect(() => {
    if (located.current || where) return
    located.current = true
    void geo.locate().then((p) => p && setWhere(p))
  }, [geo, where])
  useEffect(() => {
    if (!where) return
    let off = false
    void placeName(where[0], where[1], lang).then((r) => !off && setPlace(r ? { label: r.label, province: r.province.code } : null))
    return () => {
      off = true
    }
  }, [where, lang])

  // After sending: wait for the check (rules take a few seconds; the model up to half a minute).
  useEffect(() => {
    if (!sent || (sent.check && sent.check.ai) ) return
    let tries = 0
    const t = setInterval(async () => {
      tries++
      const r = await api<Report>(`/reports/${sent.id}`).catch(() => null)
      if (r?.check) setSent(r)
      if (tries > 20 || r?.check?.ai) clearInterval(t)
    }, 2500)
    return () => clearInterval(t)
  }, [sent])

  async function pickPhoto(f: File | undefined) {
    if (!f) return
    const data = await shrinkPhoto(f)
    setPhoto(data)
    setEstimate({ state: 'idle' })
  }

  async function askEstimate() {
    if (!photo) return
    setEstimate({ state: 'busy' })
    try {
      const r = await api<{ shows_water: boolean; level: number; reason: Tri }>('/assistant/estimate', { body: { photo } })
      setEstimate({ state: 'done', level: r.level, showsWater: r.shows_water, reason: r.reason })
      if (r.shows_water && level === null) setLevel(r.level)
    } catch {
      setEstimate({ state: 'failed' })
    }
  }

  async function send() {
    if (!where || level === null) return
    setSending(true)
    setError(null)
    try {
      const r = await api<Report>('/reports', { body: { lng: where[0], lat: where[1], level, trend, passable, note: note.trim() || null, photo } })
      setSent(r)
      onSent?.()
    } catch (err) {
      setError(errorText(err, m))
    } finally {
      setSending(false)
    }
  }

  if (sent) {
    const p = provinceByCode.get(sent.province)
    return (
      <div className="flex flex-col items-center gap-4 py-6 text-center">
        <span className="pop-in grid h-20 w-20 place-items-center rounded-full bg-[#34c759] text-white shadow-[0_12px_32px_rgb(52_199_89/0.35)]">
          <Icon name="check" size={44} />
        </span>
        <h2 className="text-[24px] font-bold">{R.sentTitle}</h2>
        <p className="max-w-[34ch] text-muted">{R.sent}</p>
        <div className="rise flex min-h-12 flex-col items-center gap-1" style={{ '--i': 2 } as CSSProperties}>
          {sent.check ? (
            <CheckBadge check={sent.check} reason />
          ) : (
            <span className="flex items-center gap-2 text-[15px]">
              <Orb size={22} busy />
              <span className="shimmer-text font-medium">{R.checking}</span>
            </span>
          )}
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          {p && (
            <a href={provinceHref(p, 'map')} onClick={onClose} className="press inline-flex min-h-11 items-center gap-2 rounded-full bg-go px-5 font-semibold text-white">
              <Icon name="map" size={18} /> {R.seeMap}
            </a>
          )}
          <button
            onClick={() => {
              setSent(null)
              setPhoto(null)
              setLevel(null)
              setNote('')
              setEstimate({ state: 'idle' })
            }}
            className="press inline-flex min-h-11 items-center gap-2 rounded-full bg-paper px-5 font-semibold"
          >
            {R.another}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {/* 1. The photo */}
      <input ref={file} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => pickPhoto(e.target.files?.[0])} />
      {photo ? (
        <div className="relative overflow-hidden rounded-[22px] bg-paper">
          <img src={photo} alt="" className="max-h-72 w-full object-cover" />
          <div className="absolute inset-x-0 bottom-0 flex flex-wrap gap-2 bg-gradient-to-t from-black/55 to-transparent p-3 pt-10">
            <button onClick={() => file.current?.click()} className="press glass inline-flex min-h-9 items-center gap-1.5 rounded-full px-3.5 text-[14px] font-semibold">
              <Icon name="camera" size={16} /> {R.retake}
            </button>
            <button onClick={() => setPhoto(null)} className="press glass inline-flex min-h-9 items-center gap-1.5 rounded-full px-3.5 text-[14px] font-semibold">
              <Icon name="close" size={15} /> {R.removePhoto}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => file.current?.click()}
          className="press flex min-h-40 flex-col items-center justify-center gap-2 rounded-[22px] border-2 border-dashed border-go/35 bg-go-soft/60 p-6 text-go hover:border-go/60"
        >
          <span className="grid h-14 w-14 place-items-center rounded-full bg-go text-white shadow-[0_8px_24px_rgb(10_132_255/0.35)]">
            <Icon name="camera" size={28} />
          </span>
          <span className="text-[18px] font-bold">{R.takePhoto}</span>
          <span className="text-[14px] text-go/80">{R.photoHint}</span>
        </button>
      )}
      {photo && ai && estimate.state !== 'done' && (
        <button onClick={askEstimate} disabled={estimate.state === 'busy'} className="press -mt-2 inline-flex min-h-11 items-center gap-2 self-start rounded-full bg-card px-4 text-[15px] font-semibold ring-1 ring-line">
          <Orb size={22} busy={estimate.state === 'busy'} />
          {estimate.state === 'busy' ? R.estimating : R.estimate}
        </button>
      )}
      {estimate.state === 'done' && (
        <p className="-mt-2 flex items-start gap-2 rounded-[14px] bg-go-soft/70 px-3 py-2 text-[15px]">
          <Orb size={20} className="mt-0.5" />
          <span>
            <b>{estimate.showsWater ? R.estimated(m.levels.names[estimate.level ?? 0]) : R.noWater}</b>
            {estimate.reason && <span className="block text-[14px] text-muted">{estimate.reason[lang] || estimate.reason.th}</span>}
          </span>
        </p>
      )}

      {/* 2. Where */}
      <section className="flex flex-col gap-2">
        <h3 className="text-[17px] font-bold">{R.step1}</h3>
        <div className="flex items-center gap-3 rounded-[16px] bg-card p-3 ring-1 ring-line/70">
          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-full ${where ? 'bg-[#34c759] text-white' : 'bg-paper text-muted'}`}>
            <Icon name={where ? 'pin' : 'locate'} size={20} />
          </span>
          <span className="min-w-0 flex-1 text-[15px] leading-snug">
            {where ? (place?.label ?? `${where[1].toFixed(5)}, ${where[0].toFixed(5)}`) : geo.state === 'locating' ? <span className="shimmer-text">{m.common.locating}</span> : R.noLocation}
          </span>
          <button onClick={() => setPick(!pick)} className="press shrink-0 rounded-full bg-paper px-3.5 py-2 text-[14px] font-semibold text-link">
            {where ? R.changeLocation : R.pickOnMap}
          </button>
        </div>
        <GeoMessage state={geo.state === 'locating' ? 'idle' : geo.state} />
        {pick && (
          <div className="fade-in">
            <LocationPicker value={where} onChange={setWhere} center={where ?? provinceByCode.get(prefill.province ?? place?.province ?? '')?.center ?? [100.5, 13.75]} />
          </div>
        )}
      </section>

      {/* 3. How deep */}
      <section className="flex flex-col gap-2">
        <h3 className="text-[17px] font-bold">{R.step2}</h3>
        <div className="grid grid-cols-3 gap-2">
          {LEVELS.map((l) => {
            const on = level === l
            return (
              <button
                key={l}
                type="button"
                onClick={() => setLevel(l)}
                aria-pressed={on}
                className={`press flex flex-col items-center gap-1 rounded-[18px] p-2.5 pb-3 text-center transition-colors ${on ? 'text-white shadow-[0_8px_22px_rgb(0_0_0/0.16)]' : 'bg-card ring-1 ring-line/70'}`}
                style={on ? { background: LEVEL_COLOR[l] } : undefined}
              >
                <span className={on ? 'text-white' : 'text-ink'}>
                  <LevelFigure level={l} size={58} color={on ? '#ffffff' : '#0a84ff'} />
                </span>
                <span className="text-[14px] font-semibold leading-tight">{m.levels.short[l]}</span>
                <span className={`text-[11px] ${on ? 'text-white/85' : 'text-faint'}`}>{LEVEL_CM[l]} cm</span>
              </button>
            )
          })}
        </div>
      </section>

      {/* 4. Extras, folded */}
      <section className="flex flex-col gap-3">
        <button onClick={() => setMore(!more)} className="inline-flex items-center gap-1 self-start text-[15px] font-semibold text-link" aria-expanded={more}>
          {R.optional}
          <Icon name="down" size={17} className={`transition-transform ${more ? 'rotate-180' : ''}`} />
        </button>
        {more && (
          <div className="fade-in flex flex-col gap-3">
            <Choices options={(['rising', 'steady', 'falling'] as const).map((k) => [k, R.trend[k]])} value={trend} onChange={(v) => setTrend(trend === v ? null : v)} />
            <Choices options={(['car', 'high', 'boat'] as const).map((k) => [k, R.passable[k]])} value={passable} onChange={(v) => setPassable(passable === v ? null : v)} />
            <textarea className={`${inputCls} min-h-20 py-2`} maxLength={280} value={note} onChange={(e) => setNote(e.target.value)} placeholder={R.note} />
          </div>
        )}
      </section>

      {error && <p className="font-semibold text-urgent">{error}</p>}
      <button
        onClick={send}
        disabled={!where || level === null || sending}
        className="press min-h-14 w-full rounded-full bg-go text-[18px] font-semibold text-white shadow-[0_10px_28px_rgb(10_132_255/0.3)] disabled:bg-off disabled:shadow-none"
      >
        {sending ? m.common.sending : R.send}
      </button>
      <p className="text-center text-[13px] text-faint">{R.privacy}</p>
    </div>
  )
}

/** The form as a sheet over any page (src/lib/report.ts opens it). */
export default function QuickReportSheet() {
  const { m } = useI18n()
  const q = useQuickReport()
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeQuickReport()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  if (!q.open) return null
  return (
    <div className="fixed inset-0 z-[1250] flex items-end justify-center md:items-center">
      <div className="fade-in absolute inset-0 bg-black/40" onClick={closeQuickReport} />
      <section role="dialog" aria-label={m.report.quickTitle} className="jd-sheet relative flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-[26px] bg-page shadow-2xl md:max-w-[520px] md:rounded-[28px]">
        <header className="flex items-center gap-3 border-b border-line/60 px-5 pb-3 pt-4">
          <h2 className="flex-1 text-[20px] font-bold">{m.report.quickTitle}</h2>
          <button onClick={closeQuickReport} aria-label={m.assistant.close} className="press grid h-9 w-9 place-items-center rounded-full bg-paper text-muted">
            <Icon name="close" size={18} />
          </button>
        </header>
        <div className="overflow-y-auto overscroll-contain px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-4">
          <QuickReportForm key={q.nonce} prefill={q.prefill} onClose={closeQuickReport} />
        </div>
      </section>
    </div>
  )
}
