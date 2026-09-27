import { useEffect, useMemo, useRef, useState } from 'react'
import { About } from './components/About'
import { Icon } from './components/Icon'
import { BackLink } from './components/ui'
import { BottomNav, Header } from './components/Header'
import { Home } from './components/Home'
import { MyTasks } from './components/MyTasks'
import { NeedDetail } from './components/NeedDetail'
import { NeedList } from './components/NeedList'
import { NeedMap } from './components/NeedMap'
import { PostNeed } from './components/PostNeed'
import { SEED_NEEDS } from './data/needs'
import { useI18n } from './i18n'
import { CATEGORY_ICONS } from './lib/categories'
import { CHIANG_MAI_CENTER, DEFAULT_LOCATION, distanceKm, type LatLng } from './lib/geo'
import { isStale, newCheckInCode, spotsLeft, visibleInMode } from './lib/needs'
import { href, navigate, tabOf, useRoute } from './lib/router'
import { useLocalStorage } from './lib/useLocalStorage'
import type { Category, Commitment, Mode, Need } from './types'

export default function App() {
  const { m } = useI18n()
  const [mode, setMode] = useLocalStorage<Mode>('jaidee.mode', 'normal')
  const [commitments, setCommitments] = useLocalStorage<Commitment[]>('jaidee.commitments', [])
  const [postedNeeds, setPostedNeeds] = useLocalStorage<Need[]>('jaidee.postedNeeds', [])
  const route = useRoute()
  const tab = tabOf(route)
  const selectedId = route.name === 'need' ? route.id : null
  // The list filter lives in the URL; remember it while a need is open so "Back" returns to the same filter.
  const [listCategory, setListCategory] = useState<Category | 'all'>('all')
  const category = route.name === 'map' ? route.category : listCategory
  const [userLocation, setUserLocation] = useState<LatLng>(DEFAULT_LOCATION)
  const [locationIsDefault, setLocationIsDefault] = useState(true)
  const [mapCenter, setMapCenter] = useState<LatLng>(CHIANG_MAI_CENTER)
  const sidebarRef = useRef<HTMLElement>(null)

  if (route.name === 'map' && route.category !== listCategory) setListCategory(route.category)

  // Start each view at the top of the sidebar instead of keeping the previous scroll position.
  useEffect(() => {
    sidebarRef.current?.scrollTo({ top: 0 })
  }, [selectedId, tab, mode])

  // Use the real location if the browser shares it; otherwise stay on Nimman.
  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        const here = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        // Only use it if the device is actually around Chiang Mai (e.g. not the hackathon organiser's laptop abroad).
        if (distanceKm(here, CHIANG_MAI_CENTER) < 60) {
          setUserLocation(here)
          setLocationIsDefault(false)
        }
      },
      () => {},
      { timeout: 5000 },
    )
  }, [])

  const allNeeds = useMemo(() => [...SEED_NEEDS, ...postedNeeds], [postedNeeds])
  const inMode = useMemo(() => allNeeds.filter((n) => visibleInMode(n, mode)), [allNeeds, mode])
  const fresh = useMemo(() => inMode.filter((n) => !isStale(n)), [inMode])
  const categoriesInMode = useMemo(
    () => (Object.keys(CATEGORY_ICONS) as Category[]).filter((c) => fresh.some((n) => n.category === c)),
    [fresh],
  )
  const activeCategory = category !== 'all' && categoriesInMode.includes(category) ? category : 'all'

  const visible = useMemo(() => {
    const list = fresh.filter((n) => activeCategory === 'all' || n.category === activeCategory)
    const dist = (n: Need) => distanceKm(userLocation, n)
    return list.sort((a, b) => {
      if (mode !== 'normal' && !!a.urgent !== !!b.urgent) return a.urgent ? -1 : 1
      return dist(a) - dist(b)
    })
  }, [fresh, activeCategory, userLocation, mode])

  // A need opened from a link, a pin or My tasks may belong to another mode or category: switch so it shows.
  // (Adjusting state during render, as React recommends, instead of in an effect.)
  const routeNeed = selectedId ? allNeeds.find((n) => n.id === selectedId) : undefined
  if (routeNeed && !visibleInMode(routeNeed, mode)) setMode(routeNeed.modes[0])
  if (routeNeed && listCategory !== 'all' && listCategory !== routeNeed.category) setListCategory('all')
  const selected = routeNeed && visibleInMode(routeNeed, mode) && !isStale(routeNeed) ? routeNeed : null

  useEffect(() => {
    const page = route.name === 'need' ? routeNeed?.title.en : tab === 'home' ? undefined : m.titles[tab]
    document.title = page ? `${page} · ${m.appName}` : `${m.appName} · ${m.appSubtitle}`
  }, [route, routeNeed, tab, m])

  const stats = useMemo(() => {
    const myHours = commitments.filter((c) => !c.waitlist).reduce((s, c) => s + c.hours, 0)
    const seedHours = allNeeds.reduce((s, n) => s + n.spotsTaken * (n.slots[0]?.hours ?? 0), 0)
    const seedVolunteers = allNeeds.reduce((s, n) => s + n.spotsTaken, 0)
    return {
      hours: seedHours + myHours,
      volunteers: seedVolunteers + commitments.filter((c) => !c.waitlist).length,
      myHours,
    }
  }, [allNeeds, commitments])

  function commit(need: Need, slotId: string) {
    const slot = need.slots.find((s) => s.id === slotId) ?? need.slots[0]
    const waitlist = spotsLeft(need, commitments) === 0
    setCommitments((prev) => [
      ...prev.filter((c) => c.needId !== need.id),
      { needId: need.id, slotId: slot.id, hours: slot.hours, code: newCheckInCode(), at: new Date().toISOString(), waitlist },
    ])
  }

  function cancel(needId: string) {
    setCommitments((prev) => prev.filter((c) => c.needId !== needId))
  }

  function openNeed(id: string) {
    navigate({ name: 'need', id })
  }

  const listRoute = { name: 'map', category: activeCategory } as const
  // One decision per screen: screens that don't use the map get the whole width.
  const fullWidth = tab === 'home' || tab === 'tasks' || tab === 'about'

  return (
    <div className="flex h-full flex-col bg-paper text-ink">
      <Header
        mode={mode}
        onModeChange={(m) => {
          setMode(m)
          if (route.name === 'need') navigate(listRoute)
        }}
        tab={tab}
        stats={stats}
        myTaskCount={commitments.length}
      />
      <div className="border-b-2 border-line bg-card px-4 py-1 text-center text-base text-muted">
        {m.demoBanner}
      </div>

      <main className="flex min-h-0 flex-1 flex-col md:flex-row">
        <aside
          ref={sidebarRef}
          className={`order-2 min-h-0 flex-1 overflow-y-auto md:order-1 ${
            fullWidth ? '' : 'md:w-[520px] md:flex-none md:border-r-2 md:border-line'
          }`}
        >
          <div className={tab === 'home' ? 'mx-auto max-w-6xl' : fullWidth ? 'mx-auto max-w-3xl' : ''}>
          {route.name === 'home' && (
            <Home
              mode={mode}
              openCount={fresh.length}
              urgentCount={fresh.filter((n) => n.urgent).length}
              myTaskCount={commitments.length}
            />
          )}
          {route.name === 'need' &&
            (selected ? (
              <NeedDetail
                key={selected.id}
                need={selected}
                userLocation={userLocation}
                commitments={commitments}
                backHref={href(listRoute)}
                onCommit={commit}
                onCancel={cancel}
              />
            ) : (
              <NeedNotFound listHref={href(listRoute)} expired={!!routeNeed && isStale(routeNeed)} />
            ))}
          {route.name === 'map' && (
              <NeedList
                needs={visible}
                mode={mode}
                userLocation={userLocation}
                locationIsDefault={locationIsDefault}
                commitments={commitments}
                category={activeCategory}
                categories={categoriesInMode}
                onCategoryChange={(c) => navigate({ name: 'map', category: c }, { replace: true })}
                hiddenStaleCount={inMode.length - fresh.length}
              />
          )}
          {tab === 'tasks' && (
            <MyTasks commitments={commitments} needs={allNeeds} onCancel={cancel} />
          )}
          {tab === 'post' && <PostNeed mapCenter={mapCenter} onAdd={(n) => setPostedNeeds((prev) => [...prev, n])} />}
          {tab === 'about' && <About />}
          </div>
        </aside>

        {/* The map only shows where it's useful: finding needs and placing a new one. */}
        <section className={`order-1 h-[42vh] md:order-2 md:h-auto md:flex-1 ${fullWidth ? 'hidden' : ''}`}>
          <NeedMap
            needs={visible}
            selectedId={selected?.id ?? null}
            onSelect={openNeed}
            userLocation={userLocation}
            onCenterChange={setMapCenter}
          />
        </section>
      </main>

      <BottomNav tab={tab} myTaskCount={commitments.length} />
    </div>
  )
}

function NeedNotFound({ listHref, expired }: { listHref: string; expired: boolean }) {
  const { m } = useI18n()
  return (
    <div className="flex flex-col gap-5 p-6">
      <BackLink href={listHref}>{m.notFound.seeAll}</BackLink>
      <div className="flex flex-col items-center gap-3 rounded-2xl border-2 border-line bg-card p-8 text-center">
        <Icon name={expired ? 'clock' : 'search'} size={48} className="text-muted" />
        <p className="text-[26px] font-bold">{expired ? m.notFound.expiredTitle : m.notFound.missingTitle}</p>
        <p className="text-muted">{expired ? m.notFound.expiredBody : m.notFound.missingBody}</p>
      </div>
    </div>
  )
}
