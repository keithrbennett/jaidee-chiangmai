import type { Bilingual, Category } from '../types'

interface CategoryInfo {
  label: Bilingual
  emoji: string
  color: string
  /** Safety rules added automatically to every need of this category. */
  safety: string[]
}

export const CATEGORIES: Record<Category, CategoryInfo> = {
  haze: {
    label: { en: 'Haze relief', th: 'หมอกควัน' },
    emoji: '😷',
    color: '#f97316',
    safety: ['Wear an N95 mask outdoors when AQI > 100', 'Take breaks indoors; stop if short of breath'],
  },
  flood: {
    label: { en: 'Flood', th: 'น้ำท่วม' },
    emoji: '🌊',
    color: '#2563eb',
    safety: [
      'Rubber boots and gloves required',
      'Tetanus shot within the last 10 years',
      'Never wade in moving water; follow the host’s evacuation call',
    ],
  },
  school: {
    label: { en: 'Schools', th: 'โรงเรียน' },
    emoji: '🏫',
    color: '#16a34a',
    safety: [
      'A teacher (host) stays on site the whole time',
      'No photos of children in shared impact cards',
    ],
  },
  temple: {
    label: { en: 'Temples', th: 'วัด' },
    emoji: '🛕',
    color: '#ca8a04',
    safety: ['Cover shoulders and knees; remove shoes in buildings'],
  },
  animals: {
    label: { en: 'Animals', th: 'สัตว์' },
    emoji: '🐕',
    color: '#9333ea',
    safety: ['Closed-toe shoes', 'Follow the shelter handler; do not approach dogs alone'],
  },
  elderly: {
    label: { en: 'Elderly care', th: 'ผู้สูงอายุ' },
    emoji: '🧓',
    color: '#db2777',
    safety: ['Host introduces you first; never visit homes alone'],
  },
  environment: {
    label: { en: 'Environment', th: 'สิ่งแวดล้อม' },
    emoji: '🌳',
    color: '#0d9488',
    safety: ['Gloves provided; bring water and a hat'],
  },
}

/** Verification older than this is treated as stale and hidden from volunteers. */
export const VERIFICATION_TTL_DAYS = 14
