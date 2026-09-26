import type { Category } from '../types'
import type { IconName } from './icons'

// Category names and the safety rules added to every need of a category are UI text: see src/i18n.
export const CATEGORY_ICONS: Record<Category, IconName> = {
  haze: 'haze',
  flood: 'flood',
  school: 'school',
  temple: 'temple',
  animals: 'animals',
  elderly: 'elderly',
  environment: 'environment',
}

/** Verification older than this is treated as stale and hidden from volunteers. */
export const VERIFICATION_TTL_DAYS = 14
