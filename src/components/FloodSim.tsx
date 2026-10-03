import maplibregl, { type Map as MlMap, type MapGeoJSONFeature } from 'maplibre-gl'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useI18n, type Lang, type Messages } from '../i18n'
import { formatObserved } from '../lib/conditions'
import { P1, isRidGauge, useFloodFeeds } from '../lib/flood/feeds'
import {
  DEPTH_CLASSES,
  GAUGE_COLORS,
  RAIN_CLASSES,
  addFloodLayers,
  createFloodMap,
  paintDepth,
  sampleAt,
  setFeeds,
  setNeeds,
  setWalkWater,
  styleUrl,
} from '../lib/flood/floodMap'
import { FLOODED_DEPTH } from '../lib/flood/solver'
import type { Frame, FromWorker, Scenario, ToWorker } from '../lib/flood/sim.worker'
import type { Grid } from '../lib/flood/grid'
import { href } from '../lib/router'
import type { Need } from '../types'
import { Icon } from './Icon'
import { Button, Card, Pill, ScreenTitle } from './ui'

/** The modelled area: Chiang Mai city on both banks of the Ping, from Ring Road 3 in the north to Saraphi's edge. */
const BOUNDS = { west: 98.95, south: 18.72, east: 99.05, north: 18.87 }
const ZOOM = 12
const SPEEDS = [60, 600, 3600]
const RAIN_PRESETS = [10, 30, 60, 100]
const WALK_STEP_M = 15
const WALK_TURN_DEG = 15

type GridMeta = Omit<Grid, 'z' | 'river'>
type NeedPoint = { id: string; lat: number; lng: number; title: string; atRisk: boolean; depth: number }

/** The flood simulator page. Loaded on demand, so MapLibre only downloads when someone opens it. */
export default function FloodSim({ needs }: { needs: Need[] }) {
  const { m, lang } = useI18n()
  const f = m.flood
  const theme = useResolvedTheme()
  const { feeds, failed } = useFloodFeeds()

  const mapEl = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MlMap | null>(null)
  const workerRef = useRef<Worker | null>(null)
  const canvas = useMemo(() => document.createElement('canvas'), [])
  const [grid, setGrid] = useState<{ meta: GridMeta; z: Float32Array } | null>(null)
  const [frame, setFrame] = useState<Frame | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Latest values for map callbacks that outlive a render (style reloads, clicks, key handlers).
  const latest = useRef({ grid, frame, feeds, needs: [] as NeedPoint[], theme, popup: f.popup, lang, walking: false })

  const p1Live = feeds?.gauges?.find((g) => g.code === P1.code) ?? null
  const critical = p1Live?.critical ?? P1.critical
  const [rainMode, setRainMode] = useState<'manual' | 'forecast'>('manual')
  const [rainManual, setRainManual] = useState(60)
  const [drain, setDrain] = useState(20)
  const [p1Start, setP1Start] = useState<number | null>(null)
  const [p1Rise, setP1Rise] = useState(0)
  const [speed, setSpeed] = useState(600)
  const [running, setRunning] = useState(false)
  const [walking, setWalking] = useState(false)
  const [here, setHere] = useState<ReturnType<typeof sampleAt>>(null)

  // Start from the live P.1 reading once it arrives (until the person moves the slider).
  const startLevel = p1Start ?? p1Live?.level ?? 1
  const forecastRain = useMemo(() => (feeds?.forecast ?? []).map((h) => h.mm), [feeds])

  // Worker: build the grid once, then stream frames.
  useEffect(() => {
    const worker = new Worker(new URL('../lib/flood/sim.worker.ts', import.meta.url), { type: 'module' })
    workerRef.current = worker
    worker.onmessage = (e: MessageEvent<FromWorker>) => {
      const msg = e.data
      if (msg.type === 'ready') setGrid({ meta: msg.grid, z: msg.z })
      else if (msg.type === 'frame') setFrame(msg)
      else setError(msg.message)
    }
    worker.onerror = (e) => setError(e.message)
    worker.postMessage({ type: 'init', bounds: BOUNDS, zoom: ZOOM, p1: P1 } satisfies ToWorker)
    return () => worker.terminate()
  }, [])

  useEffect(() => {
    if (!grid) return
    const scenario: Scenario = {
      rain: rainMode === 'forecast' ? (forecastRain.length ? forecastRain : [0]) : [rainManual],
      drain,
      p1Start: startLevel,
      p1Rise,
      p1Critical: critical,
      speed,
      running,
    }
    workerRef.current?.postMessage({ type: 'scenario', scenario } satisfies ToWorker)
  }, [grid, rainMode, forecastRain, rainManual, drain, startLevel, p1Rise, critical, speed, running])

  // Map: created once; layers come back after every style switch (light / dark).
  useEffect(() => {
    const map = createFloodMap(mapEl.current!, latest.current.theme)
    mapRef.current = map
    map.on('click', (e) => {
      const hit = map.queryRenderedFeatures(e.point, { layers: ['needs', 'gauges', 'rain'].filter((l) => map.getLayer(l)) })[0]
      // In street walk, tapping the ground walks there (there's no keyboard on a phone).
      if (!hit && latest.current.walking) return map.easeTo({ center: e.lngLat, duration: 800 })
      if (!hit) return
      const content = buildPopup(hit, latest.current.popup, latest.current.lang)
      new maplibregl.Popup({ maxWidth: '280px' }).setLngLat(e.lngLat).setDOMContent(content).addTo(map)
    })
    for (const layer of ['needs', 'gauges', 'rain']) {
      map.on('mouseenter', layer, () => (map.getCanvas().style.cursor = 'pointer'))
      map.on('mouseleave', layer, () => (map.getCanvas().style.cursor = ''))
    }
    return () => map.remove()
    // Made once: the theme is applied by the effect below.
  }, [])

  // Whether our layers are on the current style. (Not map.isStyleLoaded(): that stays false while any tile
  // is still loading, so updates gated on it get dropped on a slow connection.)
  const layersReady = useRef(false)
  const styleTheme = useRef(theme)
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const onStyle = () => {
      addFloodLayers(map, theme, canvas, latest.current.grid?.meta ?? null)
      setFeeds(map, latest.current.feeds)
      setNeeds(map, latest.current.needs)
      layersReady.current = true
    }
    map.on('style.load', onStyle)
    if (styleTheme.current !== theme) {
      styleTheme.current = theme
      layersReady.current = false
      map.setStyle(styleUrl(theme), { diff: false })
    }
    return () => {
      map.off('style.load', onStyle)
    }
  }, [theme, canvas])

  useEffect(() => {
    const map = mapRef.current
    if (map && layersReady.current) setFeeds(map, feeds)
  }, [feeds])

  // Once the grid is in, the depth layer can be added (the style may have loaded first).
  useEffect(() => {
    const map = mapRef.current
    if (!grid || !map) return
    paintDepth(canvas, grid.meta, new Float32Array(grid.meta.nx * grid.meta.ny))
    if (layersReady.current) addFloodLayers(map, theme, canvas, grid.meta)
  }, [grid, canvas, theme])

  useEffect(() => {
    if (grid && frame) paintDepth(canvas, grid.meta, frame.depth)
  }, [grid, frame, canvas])

  // Jaidee needs on the map, red where the model puts water around them.
  const needPoints = useMemo<NeedPoint[]>(
    () =>
      needs.map((n) => {
        const s = sampleAt(grid?.meta ?? null, grid?.z ?? null, frame?.depth ?? null, n.lng, n.lat)
        return {
          id: n.id,
          lat: n.lat,
          lng: n.lng,
          title: lang === 'th' ? n.title.th : n.title.en,
          atRisk: !!s && s.depth >= FLOODED_DEPTH,
          depth: s?.depth ?? 0,
        }
      }),
    [needs, grid, frame, lang],
  )
  useEffect(() => {
    latest.current = { grid, frame, feeds, needs: needPoints, theme, popup: f.popup, lang, walking }
  })
  useEffect(() => {
    const map = mapRef.current
    if (map && layersReady.current) setNeeds(map, needPoints)
  }, [needPoints])
  const atRisk = needPoints.filter((n) => n.atRisk).sort((a, b) => b.depth - a.depth)

  // Street walk: low camera, keyboard to move, water as 3D blocks around you, depth under the crosshair.
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const update = () => {
      const c = map.getCenter()
      setHere(sampleAt(latest.current.grid?.meta ?? null, latest.current.grid?.z ?? null, latest.current.frame?.depth ?? null, c.lng, c.lat))
    }
    const water = () => setWalkWater(map, latest.current.grid?.meta ?? null, latest.current.frame?.depth ?? null, walking)
    if (!walking) {
      map.keyboard.enable()
      water()
      if (map.getPitch() > 70) map.easeTo({ pitch: 55, zoom: 14, duration: 1000 })
      return
    }
    map.keyboard.disable()
    map.easeTo({ zoom: 18.6, pitch: 80, duration: 1200 })
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('input, select, textarea, button') || e.metaKey || e.ctrlKey || e.altKey) return
      const k = e.key.toLowerCase()
      const bearing = map.getBearing()
      const move = (deg: number) => {
        const c = map.getCenter()
        const rad = ((bearing + deg) * Math.PI) / 180
        const dLat = (WALK_STEP_M * Math.cos(rad)) / 111320
        const dLng = (WALK_STEP_M * Math.sin(rad)) / (111320 * Math.cos((c.lat * Math.PI) / 180))
        map.easeTo({ center: [c.lng + dLng, c.lat + dLat], duration: 150, easing: (t) => t })
      }
      const turn = (deg: number) => map.easeTo({ bearing: bearing + deg, duration: 150 })
      const actions: Record<string, () => void> = {
        w: () => move(0),
        arrowup: () => move(0),
        s: () => move(180),
        arrowdown: () => move(180),
        a: () => move(-90),
        d: () => move(90),
        q: () => turn(-WALK_TURN_DEG),
        arrowleft: () => turn(-WALK_TURN_DEG),
        e: () => turn(WALK_TURN_DEG),
        arrowright: () => turn(WALK_TURN_DEG),
      }
      if (actions[k]) {
        e.preventDefault()
        actions[k]()
      }
    }
    window.addEventListener('keydown', onKey)
    map.on('move', update)
    map.on('moveend', water)
    update()
    water()
    return () => {
      window.removeEventListener('keydown', onKey)
      map.off('move', update)
      map.off('moveend', water)
    }
  }, [walking])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !walking) return
    setWalkWater(map, grid?.meta ?? null, frame?.depth ?? null, true)
    const c = map.getCenter()
    setHere(sampleAt(grid?.meta ?? null, grid?.z ?? null, frame?.depth ?? null, c.lng, c.lat))
  }, [frame, grid, walking])

  // Live summaries.
  const inTown = (p: { lat: number; lng: number }) =>
    p.lat >= BOUNDS.south && p.lat <= BOUNDS.north && p.lng >= BOUNDS.west && p.lng <= BOUNDS.east
  const townRain = (feeds?.rain ?? []).filter(inTown)
  const rain1h = Math.max(0, ...townRain.map((r) => r.rain1h ?? 0))
  const rain24h = Math.max(0, ...townRain.map((r) => r.rain24h ?? 0))
  const sensors = (feeds?.gauges ?? []).filter((g) => !isRidGauge(g) && g.levelMsl !== null)
  const time = frame?.time ?? 0
  const hours = Math.floor(time / 3600)
  const minutes = Math.floor((time % 3600) / 60)

  return (
    <div className="flex min-h-0 flex-1 flex-col md:flex-row">
      <aside className="order-2 min-h-0 flex-1 overflow-y-auto md:order-1 md:w-[420px] md:flex-none md:border-r md:border-line">
        <div className="flex flex-col gap-5 p-5">
          <ScreenTitle sub={f.sub}>{f.title}</ScreenTitle>
          <div>
            <Pill tone="urgent" icon="alert">
              {f.modelBadge}
            </Pill>
          </div>

          <Card className="flex flex-col gap-3 !p-5">
            <h3 className="text-[19px] font-semibold">{f.live.title}</h3>
            {failed && !feeds && <p className="text-muted">{f.live.unavailable}</p>}
            <LiveRow icon="flood" title={f.live.river} live={!!p1Live}>
              {p1Live?.level != null ? f.live.riverP1(p1Live.level.toFixed(2), critical.toFixed(1)) : '–'}
              {p1Live && <span className="text-faint"> · {f.live.asOf(formatObserved(p1Live.observedAt, lang))}</span>}
            </LiveRow>
            <LiveRow icon="haze" title={f.live.rain} live={townRain.length > 0}>
              {townRain.length ? (
                <>
                  {f.live.rainNow(rain1h)} · {f.live.rainWettest(rain24h)}
                </>
              ) : (
                '–'
              )}
            </LiveRow>
            <LiveRow icon="display" title={f.live.sensors} live={sensors.length > 0}>
              {feeds ? f.live.sensorsCount(sensors.length) : '–'}
            </LiveRow>
            <LiveRow icon="search" title={f.live.cctv} live={false}>
              {f.live.cctvOff}
            </LiveRow>
          </Card>

          <Card className="flex flex-col gap-4 !p-5">
            <h3 className="text-[19px] font-semibold">{f.scenario.title}</h3>

            <Field label={f.scenario.rain}>
              <Segmented
                value={rainMode}
                options={[
                  ['manual', f.scenario.manual],
                  ['forecast', f.scenario.forecast],
                ]}
                onChange={(v) => setRainMode(v as 'manual' | 'forecast')}
              />
              {rainMode === 'manual' ? (
                <>
                  <Slider label={f.scenario.rain} value={rainManual} min={0} max={150} step={5} onChange={setRainManual} unit={f.scenario.mmPerHour} />
                  <div className="flex flex-wrap gap-2">
                    {RAIN_PRESETS.map((mm) => (
                      <button
                        key={mm}
                        onClick={() => setRainManual(mm)}
                        className={`min-h-9 rounded-full px-3 text-sm ${rainManual === mm ? 'bg-go text-white' : 'bg-paper text-ink'}`}
                      >
                        {mm} {f.scenario.mmPerHour}
                      </button>
                    ))}
                  </div>
                </>
              ) : (
                <ForecastBars mm={forecastRain} unit={f.scenario.mmPerHour} empty={f.scenario.forecastNone} />
              )}
            </Field>

            <Field label={f.scenario.drain} hint={f.scenario.drainHint}>
              <Slider label={f.scenario.drain} value={drain} min={0} max={60} step={5} onChange={setDrain} unit={f.scenario.mmPerHour} />
            </Field>

            <Field
              label={f.scenario.p1Start}
              action={
                p1Live?.level != null && p1Start !== null ? (
                  <button className="text-sm text-link" onClick={() => setP1Start(null)}>
                    {f.scenario.useLive}
                  </button>
                ) : undefined
              }
            >
              <Slider label={f.scenario.p1Start} value={startLevel} min={0} max={7} step={0.05} onChange={setP1Start} unit="m" digits={2} mark={critical} />
            </Field>

            <Field label={f.scenario.p1Rise}>
              <Slider label={f.scenario.p1Rise} value={p1Rise} min={-0.2} max={0.5} step={0.01} onChange={setP1Rise} unit={f.scenario.perHour} digits={2} />
            </Field>

            <div className="flex flex-wrap items-center gap-2">
              <Button icon={running ? 'clock' : 'forward'} onClick={() => setRunning(!running)} disabled={!grid}>
                {running ? f.pause : f.run}
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setRunning(false)
                  workerRef.current?.postMessage({ type: 'reset' } satisfies ToWorker)
                }}
                disabled={!grid}
              >
                {f.reset}
              </Button>
            </div>
            <Field label={f.speed}>
              <Segmented
                value={String(speed)}
                options={SPEEDS.map((s) => [String(s), `×${s}`])}
                onChange={(v) => setSpeed(Number(v))}
              />
              {running && frame && <p className="text-sm text-faint">{f.speedActual(Math.round(frame.speed))}</p>}
            </Field>
          </Card>

          <Card className="flex flex-col gap-3 !p-5">
            <div className="flex items-baseline justify-between">
              <h3 className="text-[19px] font-semibold">{f.results.title}</h3>
              <span className="tabular-nums text-muted">{f.clock(hours, minutes)}</span>
            </div>
            <dl className="grid grid-cols-2 gap-3">
              <Stat label={f.results.flooded} value={`${(frame?.stats.floodedKm2 ?? 0).toFixed(2)} km²`} />
              <Stat label={f.results.typicalDepth} value={`${(frame?.stats.typicalDepth ?? 0).toFixed(2)} m`} />
              <Stat label={f.results.p1Now} value={`${(frame?.p1Level ?? startLevel).toFixed(2)} m`} urgent={(frame?.p1Level ?? startLevel) >= critical} />
              <Stat label={f.results.rainNow} value={`${frame?.rain ?? 0} ${f.scenario.mmPerHour}`} />
            </dl>
            <div>
              <p className="font-medium">{f.results.needs}</p>
              {atRisk.length ? (
                <ul className="mt-1 flex flex-col gap-1">
                  {atRisk.map((n) => (
                    <li key={n.id}>
                      <a href={href({ name: 'need', id: n.id })} className="text-link hover:underline">
                        {n.title}
                      </a>{' '}
                      <span className="text-urgent tabular-nums">~{n.depth.toFixed(1)} m</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-muted">{f.results.needsNone}</p>
              )}
            </div>
          </Card>

          <Card className="flex flex-col gap-3 !p-5 text-[15px]">
            <h3 className="text-[19px] font-semibold">{f.legend.depth}</h3>
            <ul className="flex flex-col gap-1.5">
              {DEPTH_CLASSES.map((c, i) => (
                <li key={c.min} className="flex items-center gap-2">
                  <span className="h-3.5 w-6 rounded-sm" style={{ background: `rgb(${c.color.join(',')})` }} />
                  {f.legend.depthClasses[i]}
                </li>
              ))}
            </ul>
            <h3 className="mt-2 font-semibold">{f.legend.gauges}</h3>
            <ul className="flex flex-col gap-1.5">
              {(['over', 'near', 'ok', 'none'] as const).map((s) => (
                <li key={s} className="flex items-center gap-2">
                  <span className="h-3.5 w-3.5 rounded-full border-2 border-white" style={{ background: GAUGE_COLORS[s] }} />
                  {f.legend.gaugeStatus[s]}
                </li>
              ))}
              <li className="text-faint">
                {f.legend.gaugeRid} ● · {f.legend.gaugeOther} •
              </li>
            </ul>
            <h3 className="mt-2 font-semibold">{f.legend.rain}</h3>
            <ul className="flex flex-wrap gap-x-4 gap-y-1.5">
              {RAIN_CLASSES.map((c, i) => (
                <li key={c.min} className="flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded-full" style={{ background: c.color }} />
                  {f.legend.rainClasses[i]}
                </li>
              ))}
            </ul>
            <p className="mt-2 flex items-center gap-2">
              <span className="h-3.5 w-3.5 rounded-full bg-[#ff3b30] ring-2 ring-white" />
              {f.legend.needs}
            </p>
          </Card>

          <Card className="flex flex-col gap-2 !p-5 text-[15px] text-muted">
            <h3 className="text-[19px] font-semibold text-ink">{f.notes.title}</h3>
            {f.notes.body.map((p) => (
              <p key={p}>{p}</p>
            ))}
            <p className="text-faint">{f.notes.sources}</p>
          </Card>
        </div>
      </aside>

      <section className="relative order-1 h-[55vh] md:order-2 md:h-auto md:flex-1">
        <div ref={mapEl} className="h-full w-full" />
        {!grid && !error && (
          <div className="pointer-events-none absolute left-3 top-3 rounded-full bg-card/90 px-4 py-2 text-[15px] shadow">
            {f.loading}
          </div>
        )}
        {error && (
          <div className="absolute left-3 top-3 max-w-sm rounded-[14px] bg-urgent-soft px-4 py-3 text-[15px] text-urgent shadow">
            {f.loadError(error)}
          </div>
        )}
        {grid && (
          <div className="absolute left-3 top-3 flex flex-col items-start gap-2">
            <div className="pointer-events-none flex flex-col gap-1 rounded-[14px] bg-card/90 px-4 py-2 text-[15px] shadow backdrop-blur">
              <span className="font-semibold tabular-nums">{f.clock(hours, minutes)}</span>
              <span className="text-muted tabular-nums">
                P.1 {(frame?.p1Level ?? startLevel).toFixed(2)} m · {frame?.rain ?? 0} {f.scenario.mmPerHour}
              </span>
            </div>
            <Button icon={walking ? 'back' : 'users'} variant={walking ? 'ask' : 'go'} onClick={() => setWalking(!walking)}>
              {walking ? f.walk.exit : f.walk.enter}
            </Button>
          </div>
        )}
        {walking && (
          <div className="absolute bottom-14 left-1/2 -translate-x-1/2">
            <WalkHud here={here} />
          </div>
        )}
        {walking && (
          <div className="pointer-events-none absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_2px_rgba(0,0,0,0.5)]" />
        )}
      </section>
    </div>
  )
}

/** Popup contents built as DOM nodes: station names come from outside, so nothing goes in as HTML. */
function buildPopup(feature: MapGeoJSONFeature, t: Messages['flood']['popup'], lang: Lang) {
  const p = feature.properties
  const lines: [string, string][] = []
  let title = String(p.name ?? p.title ?? '')
  if (feature.layer.id === 'gauges') {
    title = `${p.code} ${p.name}`
    if (p.levelMsl != null) lines.push([t.water, `${Number(p.levelMsl).toFixed(2)} m MSL`])
    if (p.bankMsl != null) lines.push([t.bank, `${Number(p.bankMsl).toFixed(2)} m MSL`])
    if (p.levelMsl != null && p.bankMsl != null) {
      const diff = Number(p.bankMsl) - Number(p.levelMsl)
      lines.push(['', diff >= 0 ? t.below(diff.toFixed(2)) : t.over((-diff).toFixed(2))])
    }
    lines.push(['', `${p.river || ''} · ${p.agency} · ${formatObserved(String(p.observedAt), lang)}`])
  } else if (feature.layer.id === 'rain') {
    lines.push([t.rain1h, `${p.rain1h ?? '–'} mm`], [t.rain24h, `${p.rain24h ?? '–'} mm`])
    lines.push(['', `${p.agency} · ${formatObserved(String(p.observedAt), lang)}`])
  }
  const root = document.createElement('div')
  root.className = 'text-[13px] leading-snug text-[#1d1d1f]'
  const h = document.createElement('div')
  h.className = 'mb-1 font-semibold'
  h.textContent = title
  root.append(h)
  for (const [label, value] of lines) {
    const row = document.createElement('div')
    row.textContent = label ? `${label}: ${value}` : value
    root.append(row)
  }
  if (feature.layer.id === 'needs') {
    const a = document.createElement('a')
    a.href = href({ name: 'need', id: String(p.id) })
    a.className = 'text-[#0066cc] underline'
    a.textContent = t.open
    root.append(a)
  }
  return root
}

function WalkHud({ here }: { here: ReturnType<typeof sampleAt> }) {
  const { m } = useI18n()
  const w = m.flood.walk
  const depth = here?.depth ?? 0
  // A 1.7 m person for scale.
  const pct = Math.min(100, (depth / 1.7) * 100)
  return (
    <div className="flex max-w-[320px] gap-3 rounded-[14px] bg-card/95 p-3 text-[15px] shadow backdrop-blur">
      <div className="relative h-20 w-6 shrink-0 overflow-hidden rounded-md bg-paper ring-1 ring-line">
        <div className="absolute inset-x-0 bottom-0 bg-[rgb(10,100,240)]" style={{ height: `${pct}%` }} />
      </div>
      <div className="flex flex-col gap-0.5">
        {here ? (
          <>
            <span className="text-muted">{w.here}</span>
            <span className={`text-[28px] font-bold tabular-nums ${depth >= 0.5 ? 'text-urgent' : ''}`}>
              {depth >= 0.05 ? `~${depth.toFixed(1)} m` : w.dry}
            </span>
            <span className="text-sm text-faint">{w.ground(here.ground.toFixed(0))}</span>
          </>
        ) : (
          <span className="text-muted">{w.outside}</span>
        )}
        <span className="text-xs text-faint">{w.approx}</span>
        <span className="hidden text-xs text-faint md:inline">{w.keys}</span>
        <span className="text-xs text-faint">{w.tap}</span>
      </div>
    </div>
  )
}

function LiveRow({ icon, title, live, children }: { icon: 'flood' | 'haze' | 'display' | 'search'; title: string; live: boolean; children: ReactNode }) {
  const { m } = useI18n()
  return (
    <div className="flex gap-3">
      <Icon name={icon} size={22} className="mt-0.5 text-muted" />
      <div className="min-w-0">
        <p className="flex items-center gap-2 font-medium">
          {title}
          <span className={`inline-flex items-center gap-1 text-xs font-semibold ${live ? 'text-[#30d158]' : 'text-faint'}`}>
            <span className={`h-2 w-2 rounded-full ${live ? 'bg-[#30d158]' : 'bg-faint'}`} />
            {live ? m.flood.live.on : m.flood.live.off}
          </span>
        </p>
        <p className="text-[15px] text-muted">{children}</p>
      </div>
    </div>
  )
}

function Field({ label, hint, action, children }: { label: string; hint?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-medium">{label}</span>
        {action}
      </div>
      {children}
      {hint && <span className="text-sm text-faint">{hint}</span>}
    </div>
  )
}

function Slider(props: {
  label: string
  value: number
  min: number
  max: number
  step: number
  unit: string
  digits?: number
  /** A value to mark on the track, e.g. the critical level. */
  mark?: number
  onChange: (v: number) => void
}) {
  const { label, value, min, max, step, unit, digits = 0, mark, onChange } = props
  return (
    <div className="flex items-center gap-3">
      <div className="relative flex-1">
        <input
          type="range"
          aria-label={label}
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-full accent-[var(--accent)]"
        />
        {mark !== undefined && (
          <span
            className="pointer-events-none absolute -bottom-1 h-2 w-0.5 bg-urgent"
            style={{ left: `${((mark - min) / (max - min)) * 100}%` }}
          />
        )}
      </div>
      <span className="w-28 text-right tabular-nums">
        {value.toFixed(digits)} {unit}
      </span>
    </div>
  )
}

function Segmented({ value, options, onChange }: { value: string; options: [string, string][]; onChange: (v: string) => void }) {
  return (
    <div role="group" className="flex self-start rounded-full bg-line/60 p-0.5">
      {options.map(([v, label]) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          aria-pressed={value === v}
          className={`min-h-10 rounded-full px-3.5 text-[15px] font-medium ${value === v ? 'bg-card text-ink shadow-sm' : 'text-ink/80'}`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

function ForecastBars({ mm, unit, empty }: { mm: number[]; unit: string; empty: string }) {
  const { m } = useI18n()
  const max = Math.max(...mm, 0)
  if (max === 0) return <p className="text-muted">{empty}</p>
  return (
    <div>
      <div className="flex h-16 items-end gap-px">
        {mm.map((v, i) => (
          <span key={i} className="flex-1 rounded-t-sm bg-go" style={{ height: `${(v / max) * 100}%`, minHeight: v ? 2 : 0 }} title={`+${i} h: ${v} ${unit}`} />
        ))}
      </div>
      <p className="mt-1 text-sm text-faint">{m.flood.scenario.forecastPeak(max)}</p>
    </div>
  )
}

function Stat({ label, value, urgent }: { label: string; value: string; urgent?: boolean }) {
  return (
    <div className="rounded-[12px] bg-paper p-3">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className={`text-[22px] font-semibold tabular-nums ${urgent ? 'text-urgent' : ''}`}>{value}</dd>
    </div>
  )
}

/** The page's resolved light / dark theme, from <html data-theme> (set by ThemeSwitcher). */
function useResolvedTheme(): 'light' | 'dark' {
  const read = () => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light')
  const [theme, setTheme] = useState<'light' | 'dark'>(read)
  useEffect(() => {
    const obs = new MutationObserver(() => setTheme(read()))
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => obs.disconnect()
  }, [])
  return theme
}
