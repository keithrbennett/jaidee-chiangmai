import type { Category } from '../types'

interface CategoryInfo {
  emoji: string
  color: string
}

// Category names and the safety rules added to every need of a category are UI text: see src/i18n.

export const CATEGORIES: Record<Category, CategoryInfo> = {
  haze: { emoji: '😷', color: '#f97316' },
  flood: { emoji: '🌊', color: '#2563eb' },
  school: { emoji: '🏫', color: '#16a34a' },
  temple: { emoji: '🛕', color: '#ca8a04' },
  animals: { emoji: '🐕', color: '#9333ea' },
  elderly: { emoji: '🧓', color: '#db2777' },
  environment: { emoji: '🌳', color: '#0d9488' },
}

/** Verification older than this is treated as stale and hidden from volunteers. */
export const VERIFICATION_TTL_DAYS = 14
