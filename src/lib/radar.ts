import { useEffect, useState } from 'react'

/** RainViewer radar frames (past ~2 hours, every 10 minutes). Free tiles, attribution required. */
export interface RadarFrames {
  frames: { time: number; path: string }[]
  /** Latest frame. */
  path: string | null
  time: number | null
}

export function useRadar(): RadarFrames {
  const [frames, setFrames] = useState<{ time: number; path: string }[]>([])
  useEffect(() => {
    let live = true
    const load = () =>
      fetch('https://api.rainviewer.com/public/weather-maps.json')
        .then((r) => r.json())
        .then((d) => live && setFrames(d.radar?.past ?? []))
        .catch(() => {})
    load()
    const t = setInterval(load, 10 * 60_000)
    return () => {
      live = false
      clearInterval(t)
    }
  }, [])
  const last = frames[frames.length - 1]
  return { frames, path: last?.path ?? null, time: last?.time ?? null }
}
