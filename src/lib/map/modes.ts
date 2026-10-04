import type { IconName } from '../icons'

/** The hazard a map is showing: one at a time, so it reads at a glance. */
export type MapMode = 'water' | 'rain' | 'air' | 'fire' | 'quake'

export const MODES: { id: MapMode; icon: IconName; color: string }[] = [
  { id: 'water', icon: 'flood', color: '#0a84ff' },
  { id: 'rain', icon: 'cloud', color: '#5e5ce6' },
  { id: 'air', icon: 'air', color: '#ff9500' },
  { id: 'fire', icon: 'fire', color: '#ff3b30' },
  { id: 'quake', icon: 'quake', color: '#af52de' },
]

/** Our layer ids in each mode (src/lib/map/layers.ts). */
export const MODE_LAYERS: Record<MapMode, string[]> = {
  water: ['jd-st', 'jd-st-label', 'jd-dam', 'jd-dam-label', 'jd-rep', 'jd-shelter', 'jd-shelter-label', 'jd-cam', 'jd-satflood'],
  rain: ['jd-rain-heat', 'jd-rain-pt', 'jd-radar'],
  air: ['jd-air', 'jd-air-label'],
  fire: ['jd-fire-heat', 'jd-fire'],
  quake: ['jd-quake', 'jd-quake-label'],
}
