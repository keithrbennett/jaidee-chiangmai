import { useCallback, useMemo, useState } from 'react'
import { useI18n } from '../../i18n'
import { api, type Report } from '../../lib/api'
import { loadDistricts, loadTambons, useGeo } from '../../lib/geo'
import { provinceByCode, provinceHref } from '../../lib/router'
import { clock } from '../../lib/time'
import { LEVEL_COLOR, isReceded, reportOpacity } from '../../lib/water'
import { Icon } from '../Icon'
import { Ago, inputCls } from '../kit'
import { provinceName, useLocale, useNow } from '../../lib/ui'
import { SectionPage, type ProvinceProps } from './ProvincePage'

export function Updates({ province, reports, reloadReports }: ProvinceProps) {
  const { m, lang } = useI18n()
  const districts = useGeo(useCallback(() => loadDistricts(province.code), [province.code]))
  const [district, setDistrict] = useState('')
  const list = (reports ?? []).filter((r) => !district || r.district === district)
  const counts = m.levels.short.map((_, i) => list.filter((r) => r.level === i).length)

  return (
    <SectionPage province={province} title={m.updates.title(provinceName(province, lang))}>
      <div className="flex flex-wrap items-center gap-3">
        <select className={`${inputCls} w-auto`} value={district} onChange={(e) => setDistrict(e.target.value)}>
          <option value="">{m.updates.allDistricts}</option>
          {(districts?.features ?? [])
            .map((f) => f.properties as { pcode: string; th: string; en: string })
            .sort((a, b) => a.th.localeCompare(b.th, 'th'))
            .map((d) => (
              <option key={d.pcode} value={d.pcode}>
                {lang === 'th' ? `อ.${d.th}` : d.en}
              </option>
            ))}
        </select>
        <a href={provinceHref(province, 'report')} className="inline-flex min-h-12 items-center gap-2 rounded-full bg-go px-5 font-medium text-white">
          <Icon name="plus" size={20} /> {m.province.report}
        </a>
      </div>
      <p className="font-semibold">{m.updates.showing(list.length)}</p>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {counts.map((n, i) => (
          <div key={i} className="flex flex-col items-center rounded-[14px] bg-card p-2">
            <b className="text-[22px] tabular-nums" style={{ color: LEVEL_COLOR[i] }}>
              {n}
            </b>
            <span className="text-center text-xs text-muted">{m.levels.short[i]}</span>
          </div>
        ))}
      </div>
      {list.length ? (
        <ul className="flex flex-col gap-2">
          {list.map((r) => (
            <ReportItem key={r.id} r={r} onVoted={reloadReports} />
          ))}
        </ul>
      ) : (
        <p className="rounded-[16px] bg-card p-5 text-muted">{m.updates.none}</p>
      )}
      <p className="text-sm text-faint">{m.updates.fadeNote}</p>
    </SectionPage>
  )
}

/** One report: level, where, when, details, photo, and "still flooded" / "gone down" buttons. */
export function ReportItem({ r, onVoted }: { r: Report; onVoted: () => void }) {
  const { m, lang } = useI18n()
  const locale = useLocale()
  const tambons = useGeo(useMemo(() => () => loadTambons(r.province), [r.province]))
  const districts = useGeo(useMemo(() => () => loadDistricts(r.province), [r.province]))
  const [msg, setMsg] = useState<string | null>(null)
  const t = tambons?.find((x) => x[0] === r.tambon)
  const d = districts?.features.find((f) => f.properties?.pcode === r.district)?.properties as { th: string; en: string } | undefined
  const where = [t && (lang === 'th' ? `ต.${t[1]}` : t[2]), d && (lang === 'th' ? `อ.${d.th}` : d.en)].filter(Boolean).join(' ')
  const receded = isReceded(r)
  const now = useNow()
  const prov = provinceByCode.get(r.province)

  async function vote(v: 'still' | 'receded') {
    try {
      await api(`/reports/${r.id}/vote`, { body: { vote: v } })
      setMsg(m.updates.voted)
      onVoted()
    } catch {
      setMsg(m.updates.alreadyVoted)
    }
  }

  return (
    <li className="flex gap-3 rounded-[16px] bg-card p-4" style={{ opacity: Math.max(0.55, reportOpacity(r)) }}>
      <span
        className="mt-1 h-4 w-4 shrink-0 rounded-full"
        style={receded ? { border: `3px solid ${LEVEL_COLOR[r.level]}`, background: 'var(--tile)' } : { background: LEVEL_COLOR[r.level] }}
      />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">
          {m.levels.names[r.level]}
          {now - r.createdAt < 3600_000 && <span className="ml-2 rounded-full bg-go-soft px-2 py-0.5 text-xs text-go">{m.updates.new}</span>}
        </p>
        <p className="text-[15px] text-muted">
          {where || (prov ? provinceName(prov, lang) : '')} · {clock(r.createdAt, locale)} · <Ago when={r.createdAt} />
        </p>
        <p className="text-[15px]">
          {[r.trend && m.report.trend[r.trend], r.passable && m.report.passable[r.passable]].filter(Boolean).join(' · ')}
        </p>
        {r.note && <p className="mt-1">{r.note}</p>}
        {r.photo && <img src={r.photo} alt="" loading="lazy" className="mt-2 max-h-56 rounded-[12px]" />}
        <p className="mt-1 text-sm text-faint">
          {r.stillCount > 0 && m.updates.confirmedStill(r.stillCount)}
          {receded && ` · ${m.updates.recededMark}`}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button onClick={() => vote('still')} className="min-h-10 rounded-full bg-paper px-4 text-[15px] font-semibold">
            {m.updates.stillFlooded}
          </button>
          <button onClick={() => vote('receded')} className="min-h-10 rounded-full bg-paper px-4 text-[15px] font-semibold">
            {m.updates.receded}
          </button>
          {msg && <span className="self-center text-sm text-muted">{msg}</span>}
        </div>
      </div>
    </li>
  )
}
