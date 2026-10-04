import { Suspense, lazy, useEffect } from 'react'
import { AlertsPage } from './components/alerts/Alerts'
import { AssistantLauncher } from './components/assistant/Launcher'
import { BottomNav, EmergencyStrip, Footer, Header } from './components/Header'
import { Command } from './components/pages/Command'
import { Home } from './components/pages/Home'
import { About, HelpStatus, MapPage, Sources, Track } from './components/pages/Misc'
import { Provinces } from './components/pages/Provinces'
import { MyTasks, NeedPage, PostNeed, VolunteerList } from './components/pages/Volunteer'
import { ProvincePage } from './components/province/ProvincePage'
import { useI18n } from './i18n'
import { useApi, type Alert } from './lib/api'
import { setAssistantContext } from './lib/assistant'
import { useQuickReport } from './lib/report'
import { tabOf, useRoute } from './lib/router'

// The flood model and its 3D city are big; load them only when someone opens the simulator.
const FloodSim = lazy(() => import('./components/FloodSim'))
const Guide = lazy(() => import('./components/pages/Guide'))
const QuickReportSheet = lazy(() => import('./components/report/QuickReport'))

export default function App() {
  const { m, lang } = useI18n()
  const route = useRoute()
  const tab = tabOf(route)
  // Alerts feed the home page, the alerts page and the badge on the nav.
  const alerts = useApi<Alert[]>('/alerts', 5 * 60_000)
  const danger = (alerts.data ?? []).filter((a) => a.level === 3).length
  const quickReport = useQuickReport()

  useEffect(() => {
    const page =
      route.name === 'province'
        ? lang === 'th'
          ? route.province.th
          : route.province.en
        : route.name === 'home'
          ? null
          : route.name === 'guide'
            ? m.titles.guide
            : tab === 'more'
              ? m.nav[route.name as 'sources' | 'about' | 'command'] ?? m.titles.more
              : m.titles[tab]
    document.title = page ? `${page} · ${m.appName}` : `${m.appName} · ${m.tagline}`
  }, [route, tab, m, lang])

  // น้องใจดี knows which province page the person is on, so "here" means something.
  useEffect(() => {
    setAssistantContext(route.name === 'province' ? route.province.code : null, route.name === 'province' ? route.section : null)
  }, [route])

  // Full-height screens (map, simulator) don't scroll or show the footer.
  const fullHeight = route.name === 'map' || route.name === 'flood'

  return (
    <div className="flex min-h-full flex-col bg-paper text-ink">
      <EmergencyStrip />
      <Header tab={tab} danger={danger} />
      <main className={`flex flex-1 flex-col ${fullHeight ? 'min-h-0' : ''}`}>
        {route.name === 'home' && <Home alerts={alerts.data} />}
        {route.name === 'alerts' && <AlertsPage alerts={alerts.data} />}
        {route.name === 'map' && <MapPage key={`${route.mode ?? ''}-${route.province?.code ?? ''}`} mode={route.mode} province={route.province} />}
        {route.name === 'provinces' && <Provinces />}
        {route.name === 'province' && <ProvincePage key={route.province.code} province={route.province} section={route.section} />}
        {route.name === 'helpStatus' && <HelpStatus code={route.code} />}
        {route.name === 'flood' && (
          <Suspense fallback={<p className="p-6 text-muted">{m.flood.loading}</p>}>
            <div className="flex h-[calc(100dvh-7.5rem)] min-h-0 md:h-[calc(100dvh-6.5rem)]">
              <FloodSim province={route.province} />
            </div>
          </Suspense>
        )}
        {route.name === 'guide' && (
          <Suspense fallback={<div className="mx-auto w-full max-w-6xl p-6"><div className="skeleton h-40" /></div>}>
            <Guide topic={route.topic} />
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
      {/* Staff screens and the simulator have their own tools; everywhere else น้องใจดี is one tap away. */}
      <AssistantLauncher hidden={route.name === 'flood' || route.name === 'command' || route.name === 'track'} />
      {quickReport.open && (
        <Suspense fallback={null}>
          <QuickReportSheet />
        </Suspense>
      )}
      <div className="sticky bottom-0 z-[1000]">
        <BottomNav tab={tab} danger={danger} />
      </div>
    </div>
  )
}
