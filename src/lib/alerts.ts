import type { Messages } from '../i18n'
import type { Alert } from './api'
import type { IconName } from './icons'

/** Hazard icon and colour, shared by alert cards, tiles and the map modes. */
export const HAZARD: Record<Alert['hazard'], { icon: IconName; color: string }> = {
  flood: { icon: 'flood', color: '#0a84ff' },
  rain: { icon: 'cloud', color: '#5e5ce6' },
  landslide: { icon: 'mountain', color: '#a2845e' },
  air: { icon: 'air', color: '#ff9500' },
  fire: { icon: 'fire', color: '#ff3b30' },
  quake: { icon: 'quake', color: '#af52de' },
  tsunami: { icon: 'wave', color: '#30b0c7' },
}

/** One line describing an alert, in the reader's language. */
export function alertText(a: Alert, m: Messages) {
  const d = a.data as Record<string, never>
  const t = m.alerts.text
  switch (a.hazard) {
    case 'flood':
      return a.kind === 'satellite' ? t.floodSat(d.km2) : t.floodRiver(d.station, (d.maxOver as number | undefined) ?? null, d.count ?? 1)
    case 'rain':
      return (d.measured ?? 0) >= 90.1 ? t.rainMeasured(d.measured, d.place ?? '') : t.rainForecast(d.next)
    case 'landslide':
      return (d.measured ?? 0) >= 100 ? t.landslide(d.measured, d.place ?? '') : t.landslideForecast(d.next)
    case 'air':
      return (d.aqi ?? 0) > 100 ? t.airNow(d.aqi, d.station ?? '') : t.airForecast(d.forecastPm25)
    case 'fire':
      return t.fire(d.count, d.forest ?? 0)
    case 'quake':
      return t.quake(d.mag, d.place ?? '', d.distance)
    case 'tsunami':
      return t.tsunami(d.mag, d.sea)
  }
}

/** Official sources to send people to, per hazard. */
export const OFFICIAL: Record<Alert['hazard'], string> = {
  flood: 'https://www.thaiwater.net/',
  rain: 'https://www.tmd.go.th/',
  landslide: 'https://www.dmr.go.th/',
  air: 'http://air4thai.pcd.go.th/',
  fire: 'https://fire.gistda.or.th/',
  quake: 'https://earthquake.tmd.go.th/',
  tsunami: 'https://ndwc.disaster.go.th/',
}
