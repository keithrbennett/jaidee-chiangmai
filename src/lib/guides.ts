import data from '../data/guides.json'
import type { Lang } from '../i18n'
import type { IconName } from './icons'

/** Safety guides (src/data/guides.json), shared with น้องใจดี on the server. */
type Tri = Record<Lang, string>
export interface Guide {
  id: string
  icon: IconName
  color: string
  title: Tri
  sub: Tri
  steps: Tri[]
  hotlines: string[]
  sources: string[]
}

export const GUIDES = data.topics as Guide[]
export const HOTLINES = data.hotlines as Record<string, Tri>
export const GUIDE_SOURCES = data.sources as Record<string, { name: Tri; url: string }>
export const guideById = (id: string) => GUIDES.find((g) => g.id === id) ?? null

/** Flood topics first, then the other hazards. */
export const FLOOD_GUIDES = ['flood-before', 'flood-during', 'flood-after', 'electricity', 'go-bag', 'evacuate', 'care', 'health']
export const OTHER_GUIDES = ['landslide', 'pm25', 'wildfire', 'earthquake', 'tsunami', 'storm']
/** The map mode that shows a guide's hazard. */
export const GUIDE_MODE: Record<string, string> = { pm25: 'air', wildfire: 'fire', earthquake: 'quake', tsunami: 'quake', storm: 'rain', landslide: 'rain', 'flood-before': 'water', 'flood-during': 'water' }
