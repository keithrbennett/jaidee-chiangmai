import type { Messages } from '../i18n'
import type { Commitment, Mode, Need } from '../types'
import { VERIFICATION_TTL_DAYS } from './categories'

export const isPending = (n: Need) => n.verifiedBy === ''
export const isStale = (n: Need) => !isPending(n) && n.verifiedDaysAgo > VERIFICATION_TTL_DAYS

export const visibleInMode = (n: Need, mode: Mode) => n.modes.includes(mode)

export function spotsTaken(n: Need, commitments: Commitment[]) {
  return n.spotsTaken + commitments.filter((c) => c.needId === n.id && !c.waitlist).length
}

export function spotsLeft(n: Need, commitments: Commitment[]) {
  return Math.max(0, n.spotsTotal - spotsTaken(n, commitments))
}

export function verifiedLabel(n: Need, m: Messages) {
  if (isPending(n)) return m.verified.pending
  const d = n.verifiedDaysAgo
  if (d === 0) return m.verified.today(n.verifiedBy)
  if (d === 1) return m.verified.yesterday(n.verifiedBy)
  return m.verified.daysAgo(d, n.verifiedBy)
}

/** Short human-friendly check-in code, e.g. JD-4821. */
export function newCheckInCode() {
  return `JD-${Math.floor(1000 + Math.random() * 9000)}`
}
