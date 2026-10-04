import { useSyncExternalStore } from 'react'

/** The quick water report sheet, opened from anywhere (home, a province, the chat) with what's known. */
export interface ReportPrefill {
  level?: number | null
  trend?: 'rising' | 'steady' | 'falling' | null
  passable?: 'car' | 'high' | 'boat' | null
  note?: string | null
  /** A JPEG data URL, e.g. the photo sent to น้องใจดี. */
  photo?: string | null
  location?: [number, number] | null
  /** Where the map starts if there's no location yet. */
  province?: string | null
}

let state: { open: boolean; prefill: ReportPrefill; nonce: number } = { open: false, prefill: {}, nonce: 0 }
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function openQuickReport(prefill: ReportPrefill = {}) {
  state = { open: true, prefill, nonce: state.nonce + 1 }
  emit()
}
export function closeQuickReport() {
  state = { ...state, open: false }
  emit()
}
export const useQuickReport = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => state,
  )
