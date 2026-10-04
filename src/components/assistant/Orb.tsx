/** น้องใจดี's face in a ring of colour (styles in index.css: .jd-orb). The ring spins up while it thinks. */
export function Orb({ size = 40, busy = false, className = '' }: { size?: number; busy?: boolean; className?: string }) {
  return (
    <span className={`jd-orb ${busy ? 'is-busy' : ''} ${className}`} style={{ width: size, height: size }} aria-hidden="true">
      <span className="jd-orb-glow" />
      <span className="jd-orb-ring" />
      <span className="jd-orb-face">
        <svg viewBox="0 0 40 40" fill="none">
          <circle className="jd-eye" cx="14" cy="17" r="3" fill="currentColor" />
          <circle className="jd-eye" cx="26" cy="17" r="3" fill="currentColor" />
          <path d="M13.5 24.5c3.6 3.6 9.4 3.6 13 0" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
          <circle cx="9.5" cy="23" r="2.4" fill="#ff6b8a" opacity="0.45" />
          <circle cx="30.5" cy="23" r="2.4" fill="#ff6b8a" opacity="0.45" />
        </svg>
      </span>
    </span>
  )
}
