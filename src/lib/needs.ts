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

export function verifiedLabel(n: Need) {
  if (isPending(n)) return 'Pending partner verification'
  const d = n.verifiedDaysAgo
  return `Verified ${d === 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`} by ${n.verifiedBy}`
}

/** Short human-friendly check-in code, e.g. JD-4821. */
export function newCheckInCode() {
  return `JD-${Math.floor(1000 + Math.random() * 9000)}`
}
