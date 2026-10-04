import { Suspense, lazy, useEffect } from 'react'
import { BottomNav, EmergencyStrip, Footer, Header } from './components/Header'
import { Command } from './components/pages/Command'
import { Home } from './components/pages/Home'
import { About, HelpStatus, MapPage, Sources, Track } from './components/pages/Misc'
import { Provinces } from './components/pages/Provinces'
import { MyTasks, NeedPage, PostNeed, VolunteerList } from './components/pages/Volunteer'
import { ProvincePage } from './components/province/ProvincePage'
import { useI18n } from './i18n'
import { tabOf, useRoute } from './lib/router'

// The flood model and its 3D city are big; load them only when someone opens the simulator.
const FloodSim = lazy(() => import('./components/FloodSim'))

export default function App() {
  const { m, lang } = useI18n()
  const route = useRoute()
  const tab = tabOf(route)

  useEffect(() => {
    const page =
      route.name === 'province'
        ? lang === 'th'
          ? route.province.th
          : route.province.en
        : route.name === 'home'
          ? null
          : tab === 'more'
            ? m.nav[route.name as 'sources' | 'about' | 'command'] ?? m.titles.more
            : m.titles[tab]
    document.title = page ? `${page} · ${m.appName}` : `${m.appName} · ${m.tagline}`
  }, [route, tab, m, lang])

  // Full-height screens (map, simulator) don't scroll or show the footer.
  const fullHeight = route.name === 'map' || route.name === 'flood'

  return (
    <div className="flex min-h-full flex-col bg-paper text-ink">
      <EmergencyStrip />
      <Header tab={tab} />
      <main className={`flex flex-1 flex-col ${fullHeight ? 'min-h-0' : ''}`}>
        {route.name === 'home' && <Home />}
        {route.name === 'map' && <MapPage />}
        {route.name === 'provinces' && <Provinces />}
        {route.name === 'province' && <ProvincePage key={route.province.code} province={route.province} section={route.section} />}
        {route.name === 'helpStatus' && <HelpStatus code={route.code} />}
        {route.name === 'flood' && (
          <Suspense fallback={<p className="p-6 text-muted">{m.flood.loading}</p>}>
            <div className="flex h-[calc(100dvh-7.5rem)] min-h-0 md:h-[calc(100dvh-6.5rem)]">
              <FloodSim />
            </div>
          </Suspense>
        )}
        {route.name === 'volunteer' && <VolunteerList />}
        {route.name === 'need' && <NeedPage id={route.id} />}
        {route.name === 'tasks' && <MyTasks />}
        {route.name === 'post' && <PostNeed />}
        {route.name === 'command' && <Command />}
        {route.name === 'track' && <Track token={route.token} />}
        {route.name === 'sources' && <Sources />}
        {route.name === 'about' && <About />}
      </main>
      {!fullHeight && <Footer />}
      <div className="sticky bottom-0 z-[1000]">
        <BottomNav tab={tab} />
      </div>
    </div>
  )
}
