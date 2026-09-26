export type Mode = 'normal' | 'haze' | 'flood'

export type Category =
  | 'haze'
  | 'flood'
  | 'school'
  | 'temple'
  | 'animals'
  | 'elderly'
  | 'environment'

export interface Bilingual {
  en: string
  th: string
}

export interface Slot {
  id: string
  label: string
  hours: number
}

export interface Need {
  id: string
  title: Bilingual
  description: Bilingual
  category: Category
  /** Modes in which this need is shown. Emergency modes show only needs tagged for them. */
  modes: Mode[]
  urgent?: boolean
  lat: number
  lng: number
  place: string
  partner: string
  /** Person from the partner org who went and checked the need. Empty = pending verification. */
  verifiedBy: string
  /** Days since verification. Stored relative so the demo data never goes stale. */
  verifiedDaysAgo: number
  hostContact: string
  skills: string[]
  slots: Slot[]
  spotsTotal: number
  spotsTaken: number
  /** Optional measurable outcome, e.g. "purifiers built". */
  impact?: { metric: string; done: number; target: number }
}

export interface Commitment {
  needId: string
  slotId: string
  hours: number
  code: string
  at: string
  /** True when the need was full at sign-up time. */
  waitlist?: boolean
}
