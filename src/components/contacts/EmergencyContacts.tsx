import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import type { Province } from '../../data/provinces'
import { useI18n } from '../../i18n'
import { useApi, type ContactPlace, type Contacts } from '../../lib/api'
import type { IconName } from '../../lib/icons'
import { directionsHref, formatPhone, telHref, useGeolocation } from '../../lib/ui'
import { km } from '../../lib/water'
import { Icon } from '../Icon'

/** The four lines everyone should know, as big tiles; the rest as a list. */
const BIG: Record<string, string> = { '1669': '#ff3b30', '1784': '#ff9500', '191': '#0a84ff', '199': '#d70015' }
const PLACE_ICON: Record<ContactPlace['kind'], IconName> = { hospital: 'heart', police: 'shield', fire: 'fire', ddpm: 'lifebuoy' }
const PLACE_COLOR: Record<ContactPlace['kind'], string> = { hospital: '#ff3b30', police: '#0a84ff', fire: '#ff9500', ddpm: '#34c759' }

/**
 * Who to call in a province: national lines (they put you through to the local office), the coordination
 * centre, numbers staff added, then the nearest hospitals, police and fire stations from OpenStreetMap,
 * each with a call button where a number is known and directions always.
 */
export function EmergencyContacts({ province, compact = false }: { province: Province; compact?: boolean }) {
  const { m, lang } = useI18n()
  const C = m.contacts
  const data = useApi<Contacts>(`/contacts/${province.code}`, 0)
  const geo = useGeolocation()
  const [here, setHere] = useState<{ lat: number; lng: number } | null>(null)
  const [kind, setKind] = useState<ContactPlace['kind']>('hospital')
  const [all, setAll] = useState(false)
  const [q, setQ] = useState('')

  // On a cold server the OpenStreetMap part may still be on its way: ask again shortly.
  const { reload } = data
  const waiting = !!data.data && !data.data.places
  useEffect(() => {
    if (!waiting) return
    const t = setTimeout(reload, 12_000)
    return () => clearTimeout(t)
  }, [waiting, reload])

  const from = useMemo(() => here ?? { lat: province.center[1], lng: province.center[0] }, [here, province])
  const places = useMemo(() => {
    const list = (data.data?.places ?? []).filter((p) => p.kind === kind)
    const needle = q.trim().toLowerCase()
    return list
      .filter((p) => !needle || `${p.th ?? ''} ${p.en ?? ''}`.toLowerCase().includes(needle))
      .map((p) => ({ p, d: km(from, p) }))
      .sort((a, b) => a.d - b.d)
  }, [data.data, kind, q, from])
  const counts = (k: ContactPlace['kind']) => (data.data?.places ?? []).filter((p) => p.kind === k).length
  const shown = all ? places.slice(0, 60) : places.slice(0, compact ? 3 : 6)
  const national = data.data?.national ?? []
  const name = (p: ContactPlace) => (lang === 'th' ? (p.th ?? p.en) : (p.en ?? p.th)) ?? C.placeKinds[p.kind]

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div>
          <h3 className="text-[19px] font-bold">{C.callNow}</h3>
          <p className="text-[14px] text-muted">{C.callNowSub}</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(national.length ? national.filter((n) => BIG[n.number]) : Object.keys(BIG).map((number) => ({ number, kind: '' }))).map((n, i) => (
            <a
              key={n.number}
              href={`tel:${n.number}`}
              className="press rise flex min-h-[88px] flex-col justify-between rounded-[20px] p-3.5 text-white shadow-[0_8px_22px_rgb(0_0_0/0.12)]"
              style={{ background: BIG[n.number], '--i': i } as CSSProperties}
            >
              <span className="flex items-center justify-between">
                <span className="text-[30px] font-bold leading-none tabular-nums">{n.number}</span>
                <Icon name="phone" size={20} className="opacity-85" />
              </span>
              <span className="text-[13px] font-medium leading-tight text-white/90">{C.kinds[n.kind] ?? ''}</span>
            </a>
          ))}
        </div>
      </div>

      {data.data?.centre && (
        <a href={telHref(data.data.centre.hotline)} className="press flex items-center gap-3 rounded-[18px] bg-[#34c759]/14 p-4">
          <span className="grid h-11 w-11 place-items-center rounded-full bg-[#34c759] text-white">
            <Icon name="lifebuoy" size={22} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-semibold text-[#1f7a35] dark:text-[#30d158]">{C.centre}</span>
            <span className="block font-semibold">{data.data.centre.name ?? C.centre}</span>
          </span>
          <span className="text-[19px] font-bold tabular-nums">{formatPhone(data.data.centre.hotline)}</span>
        </a>
      )}

      {(data.data?.local.length ?? 0) > 0 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-[17px] font-bold">{C.local}</h3>
          <ul className="overflow-hidden rounded-[18px] bg-card">
            {data.data!.local.map((c) => (
              <li key={c.id} className="border-b border-line/60 last:border-0">
                <a href={telHref(c.phone)} className="press flex min-h-14 items-center gap-3 px-4 py-2.5 hover:bg-paper/60">
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold leading-snug">{c.name}</span>
                    <span className="block text-[13px] text-muted">
                      {C.localKinds[c.kind] ?? c.kind}
                      {c.note && ` · ${c.note}`}
                    </span>
                  </span>
                  <span className="font-semibold tabular-nums text-link">{formatPhone(c.phone)}</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="mr-auto text-[17px] font-bold">{here ? C.near : C.inProvince}</h3>
          {!here && (
            <button
              onClick={async () => {
                const p = await geo.locate()
                if (p) setHere({ lng: p[0], lat: p[1] })
              }}
              className="press inline-flex min-h-9 items-center gap-1.5 rounded-full bg-go-soft px-3.5 text-[14px] font-semibold text-go"
            >
              <Icon name="locate" size={16} /> {geo.state === 'locating' ? m.common.locating : C.nearMe}
            </button>
          )}
        </div>
        <div role="group" className="flex self-start rounded-full bg-paper p-1">
          {(['hospital', 'police', 'fire'] as const).map((k) => (
            <button
              key={k}
              onClick={() => {
                setKind(k)
                setAll(false)
              }}
              aria-pressed={kind === k}
              className={`inline-flex min-h-9 items-center gap-1.5 rounded-full px-3.5 text-[14px] font-semibold transition ${kind === k ? 'bg-card text-ink shadow-sm' : 'text-muted'}`}
            >
              {C.placeKinds[k]}
              <span className="text-[12px] font-medium text-faint tabular-nums">{counts(k) || ''}</span>
            </button>
          ))}
        </div>
        {all && <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={C.search} className="min-h-11 rounded-[12px] border border-line bg-page px-3.5" />}
        {!data.data || !data.data.places ? (
          <div className="flex flex-col gap-2" role="status" aria-label={C.loading}>
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton h-16" />
            ))}
            <p className="text-[13px] text-faint">{C.loading}</p>
          </div>
        ) : shown.length ? (
          <ul className="overflow-hidden rounded-[18px] bg-card">
            {shown.map(({ p, d }) => (
              <li key={`${p.lng},${p.lat},${p.th}`} className="flex items-center gap-3 border-b border-line/60 px-4 py-3 last:border-0">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-white" style={{ background: PLACE_COLOR[p.kind] }}>
                  <Icon name={PLACE_ICON[p.kind]} size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold leading-snug">
                    {name(p)}
                    {p.emergency && <span className="ml-1.5 rounded-full bg-urgent-soft px-1.5 py-px text-[11px] font-bold text-urgent">{C.er}</span>}
                  </span>
                  <span className="block text-[13px] text-muted tabular-nums">
                    {m.common.km(d.toFixed(1))}
                    {p.phone ? ` · ${formatPhone(p.phone)}` : ` · ${C.noPhone}`}
                  </span>
                </span>
                <a href={directionsHref(p.lat, p.lng)} target="_blank" rel="noreferrer" aria-label={C.directions} title={C.directions} className="press grid h-9 w-9 place-items-center rounded-full bg-paper text-link">
                  <Icon name="pin" size={17} />
                </a>
                {p.phone && (
                  <a href={telHref(p.phone)} aria-label={`${C.call} ${p.phone}`} className="press grid h-9 w-9 place-items-center rounded-full bg-[#34c759] text-white">
                    <Icon name="phone" size={17} />
                  </a>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-[16px] bg-card p-4 text-muted">{C.none}</p>
        )}
        {!all && places.length > shown.length && (
          <button onClick={() => setAll(true)} className="self-start text-[15px] font-semibold text-link">
            {C.showAll(places.length)}
          </button>
        )}
        <p className="text-[12px] leading-snug text-faint">{C.osmNote}</p>
      </div>

      {!compact && national.length > 4 && (
        <div className="flex flex-col gap-2">
          <h3 className="text-[17px] font-bold">{C.more}</h3>
          <ul className="grid overflow-hidden rounded-[18px] bg-card sm:grid-cols-2">
            {national
              .filter((n) => !BIG[n.number])
              .map((n) => (
                <li key={n.number} className="border-b border-line/60 sm:odd:border-r">
                  <a href={`tel:${n.number}`} className="press flex min-h-14 items-center gap-3 px-4 py-2.5 hover:bg-paper/60">
                    <b className="w-14 text-[19px] tabular-nums">{n.number}</b>
                    <span className="flex-1 text-[14px] leading-snug">{C.kinds[n.kind] ?? n.kind}</span>
                    <Icon name="phone" size={16} className="text-faint" />
                  </a>
                </li>
              ))}
          </ul>
        </div>
      )}
    </section>
  )
}
