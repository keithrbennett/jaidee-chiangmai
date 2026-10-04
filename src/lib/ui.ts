import { lazy, useEffect, useState } from 'react'
import type { Province } from '../data/provinces'
import { LANGUAGES, useI18n } from '../i18n'
import { ApiError, type Station } from './api'
import type { IconName } from './icons'

/** Helpers shared by the page components (kept out of .tsx files so fast refresh works). */

/** MapLibre is big: pages load the map component on demand. */
export const MapView = lazy(() => import('../components/map/MapView'))

/** The current time, refreshed every `everyMs`: for "new" badges and 24-hour windows without impure renders. */
export function useNow(everyMs = 60_000) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), everyMs)
    return () => clearInterval(t)
  }, [everyMs])
  return now
}

export function useLocale() {
  const { lang } = useI18n()
  return LANGUAGES.find((l) => l.code === lang)?.htmlLang ?? 'th'
}

export const provinceName = (p: Province, lang: string) => (lang === 'th' ? p.th : p.en)

export function trendIcon(t: Station['trend']): IconName {
  return t === 'up' ? 'up' : t === 'down' ? 'down' : 'minus'
}

export function errorText(err: unknown, m: ReturnType<typeof useI18n>['m']) {
  if (err instanceof ApiError) {
    const e = m.common.errors
    if (err.message === 'bad_input' && err.field && err.field in e) return (e as Record<string, unknown>)[err.field] as string
    if (err.message === 'bad_input') return e.bad_input(err.field ?? '')
    if (err.message in e) return (e as Record<string, unknown>)[err.message] as string
  }
  return m.common.errors.error
}

/** Re-encode a photo as a ≤1280 px JPEG: smaller to send, and the browser drops EXIF (incl. GPS) on the way. */
export async function shrinkPhoto(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  return canvas.toDataURL('image/jpeg', 0.8)
}

/** Read a location from a Google Maps / LINE link or plain "lat, lng". */
export function parseLocation(text: string): [number, number] | null {
  const pairs = [
    /@(-?\d+\.\d+),(-?\d+\.\d+)/, // google.com/maps/@lat,lng,zoom
    /!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/, // place links
    /[?&](?:q|ll|query|destination)=(-?\d+\.\d+)[, ]+(-?\d+\.\d+)/,
    /(-?\d{1,2}\.\d{3,})\s*[, ]\s*(-?\d{2,3}\.\d{3,})/, // "18.79, 99.00" (lat first, as Google shows it)
  ]
  for (const re of pairs) {
    const mt = text.match(re)
    if (mt) {
      const lat = Number(mt[1])
      const lng = Number(mt[2])
      if (lat >= 5.6 && lat <= 20.5 && lng >= 97.3 && lng <= 105.7) return [lng, lat]
    }
  }
  return null
}

export function useGeolocation() {
  const [state, setState] = useState<'idle' | 'locating' | 'denied' | 'outside'>('idle')
  const locate = () =>
    new Promise<[number, number] | null>((resolve) => {
      if (!navigator.geolocation) {
        setState('denied')
        return resolve(null)
      }
      setState('locating')
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const p: [number, number] = [pos.coords.longitude, pos.coords.latitude]
          const inside = p[1] >= 5.6 && p[1] <= 20.5 && p[0] >= 97.3 && p[0] <= 105.7
          setState(inside ? 'idle' : 'outside')
          resolve(inside ? p : null)
        },
        () => {
          setState('denied')
          resolve(null)
        },
        { enableHighAccuracy: true, timeout: 12_000, maximumAge: 60_000 },
      )
    })
  return { state, locate }
}
