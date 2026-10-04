import type { Map as MlMap } from 'maplibre-gl'
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { PROVINCES } from '../../data/provinces'
import { useI18n } from '../../i18n'
import { api, useApi, type NeedCard } from '../../lib/api'
import { CATEGORY_ICONS } from '../../lib/categories'
import type { IconName } from '../../lib/icons'
import { openQuickReport } from '../../lib/report'
import { addLayer, setSource } from '../../lib/map/layers'
import { clickable } from '../../lib/map/popup'
import { href, navigate, provinceByCode } from '../../lib/router'
import { useLocalStorage } from '../../lib/useLocalStorage'
import { km } from '../../lib/water'
import type { Category } from '../../types'
import { Icon } from '../Icon'
import { Button, Pill } from '../ui'
import { Choices, Field, Loading, LocationPicker, MapBox, inputCls } from '../kit'
import { MapView, errorText, provinceName, useGeolocation } from '../../lib/ui'

const SAVED = 'jaidee.savedNeeds'

export function VolunteerList() {
  const { m, lang } = useI18n()
  const V = m.volunteer
  const needs = useApi<NeedCard[]>('/needs', 5 * 60_000)
  const [category, setCategory] = useState<string>('all')
  const [view, setView] = useState<'all' | 'urgent' | 'near'>('all')
  const geo = useGeolocation()
  const [here, setHere] = useState<{ lat: number; lng: number } | null>(null)
  const mapRef = useRef<MlMap | null>(null)
  const all = needs.data ?? []
  const list = all
    .filter((n) => (category === 'all' || n.category === category) && (view !== 'urgent' || n.urgent))
    .sort((a, b) => (view === 'near' && here ? km(here, a) - km(here, b) : Number(b.urgent) - Number(a.urgent) || b.verifiedAt - a.verifiedAt))
  const categories = [...new Set(all.map((n) => n.category))]
  const people = all.reduce((sum, n) => sum + (n.spots || 0), 0)

  const draw = useCallback(
    (map: MlMap) => {
      if (!map.getSource('osm')) return
      setSource(map, 'jd-needs', {
        type: 'FeatureCollection',
        features: list.map((n) => ({ type: 'Feature', properties: { id: n.id, urgent: n.urgent }, geometry: { type: 'Point', coordinates: [n.lng, n.lat] } })),
      })
      addLayer(
        map,
        {
          id: 'jd-needs',
          type: 'circle',
          source: 'jd-needs',
          paint: { 'circle-radius': 9, 'circle-color': ['case', ['get', 'urgent'], '#ff3b30', '#34c759'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 2.5 },
        },
        undefined,
      )
    },
    [list],
  )
  const drawRef = useRef(draw)
  useEffect(() => {
    drawRef.current = draw
    if (mapRef.current) draw(mapRef.current)
  }, [draw])

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 md:px-6 md:py-8">
      <header className="rise flex flex-col gap-4 md:flex-row md:items-end">
        <div className="mr-auto max-w-2xl">
          <h1 className="text-[34px] font-bold leading-tight md:text-[44px]">{V.title}</h1>
          <p className="mt-2 text-lg text-muted">{V.sub}</p>
          {all.length > 0 && (
            <p className="mt-3 text-[18px]">
              <b className="text-[#1f7a35] dark:text-[#30d158]">{V.countTasks(all.length)}</b>
              <span className="text-muted"> · {V.countPeople(people)}</span>
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button href={href({ name: 'post' })} icon="post" variant="ask">
            {V.post}
          </Button>
          <Button href={href({ name: 'tasks' })} icon="tasks" variant="secondary">
            {V.myTasks}
          </Button>
        </div>
      </header>

      {needs.loading ? (
        <Loading />
      ) : all.length === 0 ? (
        <HelpNow />
      ) : (
        <>
          <div className="flex flex-col gap-3">
            <div role="group" className="flex self-start rounded-full bg-paper p-1">
              {(['all', 'urgent', 'near'] as const).map((v) => (
                <button
                  key={v}
                  onClick={async () => {
                    if (v === 'near' && !here) {
                      const p = await geo.locate()
                      if (!p) return
                      setHere({ lng: p[0], lat: p[1] })
                    }
                    setView(v)
                  }}
                  aria-pressed={view === v}
                  className={`inline-flex min-h-9 items-center gap-1.5 rounded-full px-4 text-[15px] font-semibold transition ${view === v ? 'bg-card text-ink shadow-sm' : 'text-muted'}`}
                >
                  {v === 'near' && <Icon name="locate" size={15} />}
                  {v === 'all' ? V.all : v === 'urgent' ? V.urgent : V.near}
                </button>
              ))}
            </div>
            {categories.length > 1 && (
              <Choices
                options={[['all', V.allKinds], ...categories.map((c) => [c, m.categories[c as Category] ?? c] as [string, string])]}
                value={category}
                onChange={setCategory}
              />
            )}
          </div>
          <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
            {list.length ? (
              <ul className="flex flex-col gap-3">
                {list.map((n, i) => {
                  const prov = provinceByCode.get(n.province)
                  return (
                    <li key={n.id} className="rise" style={{ '--i': Math.min(i, 8) } as CSSProperties}>
                      <a href={href({ name: 'need', id: n.id })} className="press lift flex gap-4 rounded-[22px] bg-card p-4">
                        <span className="flex w-14 shrink-0 flex-col items-center gap-1.5">
                          <span className={`grid h-12 w-12 place-items-center rounded-full text-white ${n.urgent ? 'bg-urgent' : 'bg-[#34c759]'}`}>
                            <Icon name={CATEGORY_ICONS[n.category as Category] ?? 'heart'} size={24} />
                          </span>
                          {n.urgent && <span className="text-[11px] font-bold uppercase tracking-wide text-urgent">{V.urgent}</span>}
                        </span>
                        <span className="min-w-0 flex-1">
                          <b className="block text-[18px] leading-snug">{n.title}</b>
                          <span className="mt-1 flex items-center gap-1.5 text-[15px] text-muted">
                            <Icon name="pin" size={15} className="shrink-0" />
                            <span className="truncate">
                              {n.place}
                              {prov && ` · ${provinceName(prov, lang)}`}
                            </span>
                          </span>
                          {n.when && (
                            <span className="mt-0.5 flex items-center gap-1.5 text-[15px] text-muted">
                              <Icon name="clock" size={15} className="shrink-0" />
                              {n.when}
                              {n.hours ? ` · ${m.common.hours(n.hours)}` : ''}
                            </span>
                          )}
                          <span className="mt-2 flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center gap-1 rounded-full bg-go-soft px-2.5 py-0.5 text-[13px] font-semibold text-go">
                              <Icon name="users" size={14} /> {V.spots(n.spots)}
                            </span>
                            {here && <span className="text-[13px] text-faint">{V.distance(m.common.km(km(here, n).toFixed(1)))}</span>}
                          </span>
                        </span>
                      </a>
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="rounded-[18px] bg-card p-6 text-muted">{V.noneFiltered}</p>
            )}
            <MapBox className="h-[60vh] min-h-[360px] lg:sticky lg:top-24">
              <MapView
                center={[100.6, 14.5]}
                zoom={5}
                pitch={35}
                onMap={(map) => {
                  mapRef.current = map
                  clickable(map, ['jd-needs'])
                  map.on('click', 'jd-needs', (e) => {
                    const id = e.features?.[0]?.properties?.id
                    if (id) navigate({ name: 'need', id: String(id) })
                  })
                }}
                onStyle={(map) => drawRef.current(map)}
              />
            </MapBox>
          </div>
        </>
      )}
    </div>
  )
}

/** No checked tasks yet: ways to help that don't wait for one. */
function HelpNow() {
  const { m } = useI18n()
  const V = m.volunteer
  const ways: { icon: IconName; color: string; title: string; sub: string; href?: string; onClick?: () => void }[] = [
    { icon: 'camera', color: '#0a84ff', title: V.now.report, sub: V.now.reportSub, onClick: () => openQuickReport() },
    { icon: 'bell', color: '#ff3b30', title: V.now.alerts, sub: V.now.alertsSub, href: href({ name: 'alerts' }) },
    { icon: 'post', color: '#34c759', title: V.now.post, sub: V.now.postSub, href: href({ name: 'post' }) },
    { icon: 'book', color: '#ff9500', title: V.now.guide, sub: V.now.guideSub, href: href({ name: 'guide', topic: null }) },
  ]
  return (
    <section className="flex flex-col gap-4">
      <div className="rounded-[24px] bg-card p-6">
        <h2 className="text-[22px] font-bold">{V.noneTitle}</h2>
        <p className="mt-1 text-[16px] text-muted">{V.none}</p>
      </div>
      <h3 className="text-[19px] font-bold">{V.now.title}</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {ways.map((w, i) => {
          const inner = (
            <>
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full text-white" style={{ background: w.color }}>
                <Icon name={w.icon} size={24} />
              </span>
              <span className="min-w-0 flex-1">
                <b className="block text-[17px] leading-snug">{w.title}</b>
                <span className="block text-[15px] leading-snug text-muted">{w.sub}</span>
              </span>
              <Icon name="forward" size={19} className="text-faint" />
            </>
          )
          const cls = 'press lift rise flex items-center gap-4 rounded-[22px] bg-card p-4 text-left'
          return w.href ? (
            <a key={w.title} href={w.href} className={cls} style={{ '--i': i } as CSSProperties}>
              {inner}
            </a>
          ) : (
            <button key={w.title} onClick={w.onClick} className={cls} style={{ '--i': i } as CSSProperties}>
              {inner}
            </button>
          )
        })}
      </div>
    </section>
  )
}

export function NeedPage({ id }: { id: string }) {
  const { m, lang } = useI18n()
  const needs = useApi<NeedCard[]>('/needs', 5 * 60_000)
  const [saved, setSaved] = useLocalStorage<string[]>(SAVED, [])
  const n = needs.data?.find((x) => x.id === id)
  const back = (
    <a href={href({ name: 'volunteer' })} className="inline-flex min-h-11 items-center gap-0.5 self-start text-link">
      <Icon name="back" size={20} /> {m.volunteer.back}
    </a>
  )
  if (needs.loading) return <div className="mx-auto w-full max-w-3xl px-4 py-6"><Loading /></div>
  if (!n)
    return (
      <div className="mx-auto w-full flex max-w-3xl flex-col gap-4 px-4 py-6">
        {back}
        <p className="rounded-[18px] bg-card p-6 text-lg">{m.volunteer.notFound}</p>
      </div>
    )
  const prov = provinceByCode.get(n.province)
  const isSaved = saved.includes(n.id)
  const rules = m.safety[n.category as Category] ?? []
  return (
    <div className="mx-auto w-full flex max-w-3xl flex-col gap-5 px-4 py-6">
      {back}
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone="go" icon={CATEGORY_ICONS[n.category as Category] ?? 'heart'}>
          {m.categories[n.category as Category] ?? n.category}
        </Pill>
        {n.urgent && <Pill tone="urgent">{m.volunteer.urgent}</Pill>}
      </div>
      <h1 className="text-[32px] font-bold leading-tight">{n.title}</h1>
      <p className="text-lg">{n.description}</p>
      <dl className="grid gap-3 sm:grid-cols-2">
        {(
          [
            [m.volunteer.when, `${n.when} · ${m.common.hours(n.hours)}`],
            [m.volunteer.where, `${n.place}${prov ? ` · ${provinceName(prov, lang)}` : ''}`],
            [m.volunteer.partner, n.partner],
            [m.volunteer.spots(n.spots), n.skills.length ? `${m.volunteer.skills}: ${n.skills.join(', ')}` : ''],
          ] as [string, string][]
        ).map(([k, v]) => (
          <div key={k} className="rounded-[16px] bg-card p-4">
            <dt className="text-sm font-semibold text-muted">{k}</dt>
            <dd className="text-lg">{v}</dd>
          </div>
        ))}
      </dl>
      <section className="flex flex-col gap-2 rounded-[18px] bg-card p-5">
        <p className="font-semibold">{m.volunteer.contact}</p>
        <p className="text-[22px] font-bold">{n.contact}</p>
        {/^[0-9+\-\s]{8,}$/.test(n.contact) && (
          <Button href={`tel:${n.contact.replace(/[^0-9+]/g, '')}`} icon="phone">
            {m.command.help.call}
          </Button>
        )}
      </section>
      {rules.length > 0 && (
        <section className="flex flex-col gap-2 rounded-[18px] bg-[#ffcc00]/15 p-5">
          <p className="flex items-center gap-2 font-semibold">
            <Icon name="shield" size={20} /> {m.volunteer.safety}
          </p>
          <ul className="list-disc pl-6">
            {rules.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </section>
      )}
      <MapBox className="h-72">
        <MapView
          center={[n.lng, n.lat]}
          zoom={15}
          pitch={55}
          onStyle={(map) => {
            setSource(map, 'jd-need', { type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [n.lng, n.lat] } }] })
            addLayer(map, { id: 'jd-need', type: 'circle', source: 'jd-need', paint: { 'circle-radius': 10, 'circle-color': '#ff3b30', 'circle-stroke-color': '#fff', 'circle-stroke-width': 3 } }, undefined)
          }}
        />
      </MapBox>
      <Button main variant={isSaved ? 'secondary' : 'go'} icon={isSaved ? 'check' : 'heart'} onClick={() => setSaved(isSaved ? saved.filter((x) => x !== n.id) : [...saved, n.id])}>
        {isSaved ? m.volunteer.saved : m.volunteer.save}
      </Button>
      <p className="text-sm text-faint">{m.volunteer.verified(n.verifiedBy)}</p>
    </div>
  )
}

export function MyTasks() {
  const { m } = useI18n()
  const needs = useApi<NeedCard[]>('/needs', 5 * 60_000)
  const [saved, setSaved] = useLocalStorage<string[]>(SAVED, [])
  const list = (needs.data ?? []).filter((n) => saved.includes(n.id))
  return (
    <div className="mx-auto w-full flex max-w-3xl flex-col gap-5 px-4 py-6">
      <h1 className="text-[34px] font-bold">{m.volunteer.myTasks}</h1>
      {list.length ? (
        <ul className="flex flex-col gap-3">
          {list.map((n) => (
            <li key={n.id} className="flex items-center gap-3 rounded-[18px] bg-card p-4">
              <a href={href({ name: 'need', id: n.id })} className="min-w-0 flex-1">
                <b className="block text-lg">{n.title}</b>
                <span className="block text-muted">
                  {n.when} · {n.contact}
                </span>
              </a>
              <button onClick={() => setSaved(saved.filter((x) => x !== n.id))} className="rounded-full bg-paper px-4 py-2 font-semibold">
                {m.volunteer.unsave}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-[18px] bg-card p-6 text-muted">{needs.loading ? m.common.loading : m.volunteer.savedNone}</p>
      )}
    </div>
  )
}

export function PostNeed() {
  const { m, lang } = useI18n()
  const [where, setWhere] = useState<[number, number] | null>(null)
  const [province, setProvince] = useState('')
  const [text, setText] = useState('')
  const [contact, setContact] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [error, setError] = useState<string | null>(null)
  if (state === 'sent')
    return (
      <div className="mx-auto w-full flex max-w-3xl flex-col gap-4 px-4 py-6">
        <h1 className="text-[34px] font-bold">{m.postNeed.title}</h1>
        <p className="rounded-[18px] bg-[#34c759]/15 p-5 text-lg font-semibold text-[#248a3d]">{m.postNeed.sent}</p>
        <Button
          variant="secondary"
          onClick={() => {
            setText('')
            setState('idle')
          }}
        >
          {m.postNeed.another}
        </Button>
      </div>
    )
  return (
    <div className="mx-auto w-full flex max-w-3xl flex-col gap-5 px-4 py-6">
      <h1 className="text-[34px] font-bold">{m.postNeed.title}</h1>
      <p className="text-lg text-muted">{m.postNeed.intro}</p>
      <section className="flex flex-col gap-2">
        <h2 className="font-semibold">{m.postNeed.where}</h2>
        <LocationPicker value={where} onChange={setWhere} center={[100.6, 14.5]} />
      </section>
      {!where && (
        <Field label={m.postNeed.province}>
          <select className={inputCls} value={province} onChange={(e) => setProvince(e.target.value)}>
            <option value="" />
            {[...PROVINCES]
              .sort((a, b) => provinceName(a, lang).localeCompare(provinceName(b, lang), lang))
              .map((p) => (
                <option key={p.code} value={p.code}>
                  {provinceName(p, lang)}
                </option>
              ))}
          </select>
        </Field>
      )}
      <Field label={m.postNeed.text}>
        <textarea className={`${inputCls} min-h-36 py-2`} value={text} onChange={(e) => setText(e.target.value)} maxLength={3000} />
      </Field>
      <Field label={m.postNeed.contact}>
        <input className={inputCls} value={contact} onChange={(e) => setContact(e.target.value)} maxLength={120} />
      </Field>
      {error && <p className="font-semibold text-urgent">{error}</p>}
      <Button
        main
        disabled={!text.trim() || !contact.trim() || (!where && !province) || state === 'sending'}
        onClick={async () => {
          setState('sending')
          setError(null)
          try {
            await api('/needs', { body: { text, contact, province: province || undefined, lng: where?.[0], lat: where?.[1] } })
            setState('sent')
          } catch (err) {
            setError(errorText(err, m))
            setState('idle')
          }
        }}
      >
        {state === 'sending' ? m.common.sending : m.postNeed.send}
      </Button>
    </div>
  )
}
