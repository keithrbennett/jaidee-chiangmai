import maplibregl, { type LngLatBoundsLike, type Map as MlMap } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useRef } from 'react'
import { useI18n } from '../../i18n'
import { mapStyle, type MapLang } from '../../lib/map/style'
import { useResolvedTheme } from '../../lib/theme'

export interface MapViewProps {
  /** Initial camera: fit these bounds, or centre and zoom. */
  bounds?: LngLatBoundsLike
  center?: [number, number]
  zoom?: number
  pitch?: number
  bearing?: number
  /** Called once the map exists. */
  onMap?: (map: MlMap) => void
  /** Called every time a style finishes loading (first load, and after a theme or language switch): add your layers here. */
  onStyle?: (map: MlMap) => void
  className?: string
  /** Show the zoom / tilt buttons. */
  controls?: boolean
}

/**
 * A MapLibre 3D map in our Apple-like style. Follows the app's light/dark theme and language; overlays are
 * re-added through onStyle whenever the style changes. Load it lazily: MapLibre is about 1 MB.
 */
export default function MapView({ bounds, center, zoom, pitch = 50, bearing = -10, onMap, onStyle, className = '', controls = true }: MapViewProps) {
  const el = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MlMap | null>(null)
  const { lang } = useI18n()
  const theme = useResolvedTheme()
  // Latest callbacks and style settings for MapLibre events, which outlive a render.
  const latest = useRef({ onStyle, onMap, theme, lang })
  useEffect(() => {
    latest.current = { onStyle, onMap, theme, lang }
  })
  const applied = useRef({ theme, lang })
  // The camera props are initial values only; changing them later doesn't move the map.
  const initial = useRef({ bounds, center, zoom, pitch, bearing, controls })

  useEffect(() => {
    const { theme: t, lang: l } = latest.current
    const cam = initial.current
    // Maps open flat and a little further out, then tilt into 3D as they load, like a flyover. Not for people
    // who asked for less motion.
    const glide = !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const map = new maplibregl.Map({
      container: el.current!,
      style: mapStyle(t, l as MapLang),
      bounds: cam.bounds,
      fitBoundsOptions: { padding: 24 },
      center: cam.bounds ? undefined : cam.center,
      zoom: cam.bounds ? undefined : cam.zoom !== undefined && glide ? cam.zoom - 0.5 : cam.zoom,
      pitch: glide ? 0 : cam.pitch,
      bearing: glide ? 0 : cam.bearing,
      maxPitch: 85,
      attributionControl: { compact: true },
    })
    if (glide) {
      map.once('load', () => {
        // Someone who already moved the map keeps their view.
        if (map.getPitch() !== 0) return
        map.easeTo({ pitch: cam.pitch, bearing: cam.bearing, ...(cam.bounds || cam.zoom === undefined ? {} : { zoom: cam.zoom }), duration: 1600, easing: (x) => 1 - (1 - x) ** 3 })
      })
    }
    if (cam.controls) map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right')
    map.on('style.load', () => latest.current.onStyle?.(map))
    // On small maps the credits would cover the legend: show them first, then fold them behind the (i) button.
    const fold = setTimeout(() => {
      if (el.current && el.current.clientWidth < 640) el.current.querySelector('.maplibregl-ctrl-attrib')?.classList.remove('maplibregl-compact-show')
    }, 5000)
    mapRef.current = map
    latest.current.onMap?.(map)
    applied.current = { theme: t, lang: l }
    return () => {
      clearTimeout(fold)
      map.remove()
      mapRef.current = null
    }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map || (applied.current.theme === theme && applied.current.lang === lang)) return
    applied.current = { theme, lang }
    map.setStyle(mapStyle(theme, lang as MapLang), { diff: false })
  }, [theme, lang])

  return <div ref={el} className={`h-full w-full ${className}`} />
}
