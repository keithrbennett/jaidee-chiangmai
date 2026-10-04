/** Water height for each level, in metres against a 1.7 m person: what the level means at a glance. */
const DEPTH_M = [0.06, 0.2, 0.45, 0.8, 1.22, 1.9]

/** A person standing in water up to `level` (0 dry … 5 over head height). */
export function LevelFigure({ level, size = 56, color = '#0a84ff' }: { level: number; size?: number; color?: string }) {
  const feet = 58
  const y = Math.max(2, feet - DEPTH_M[level] * 30.6)
  return (
    <svg viewBox="0 0 40 60" width={size * (40 / 60)} height={size} aria-hidden="true">
      <g fill="currentColor" opacity="0.88">
        <circle cx="20" cy="11" r="5" />
        <rect x="14" y="17.5" width="12" height="19" rx="5" />
        <rect x="10.4" y="18.5" width="3.2" height="15" rx="1.6" />
        <rect x="26.4" y="18.5" width="3.2" height="15" rx="1.6" />
        <rect x="15.3" y="33" width="4.3" height="25" rx="2.1" />
        <rect x="20.4" y="33" width="4.3" height="25" rx="2.1" />
      </g>
      <path d={`M0 ${y} q 5 -2.2 10 0 t 10 0 t 10 0 t 10 0 V60 H0 Z`} fill={color} opacity="0.72" />
      <path d={`M0 ${y} q 5 -2.2 10 0 t 10 0 t 10 0 t 10 0`} fill="none" stroke="#ffffff" strokeWidth="0.8" opacity="0.7" />
    </svg>
  )
}
