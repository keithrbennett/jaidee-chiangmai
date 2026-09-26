import { PATHS, type IconName } from '../lib/icons'

/** Inline SVG line icon. The design rules ban emoji, so every pictogram in the app comes from here. */
export function Icon({ name, size = 22, className = '' }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`inline-block shrink-0 ${className}`}
      dangerouslySetInnerHTML={{ __html: PATHS[name] }}
    />
  )
}
