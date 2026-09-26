import type { ReactNode } from 'react'
import type { IconName } from '../lib/icons'
import { Icon } from './Icon'

/*
 * Building blocks for the design rules: white cards with a 2px border and 16px radius,
 * big buttons (44px minimum, 64px for the one main action on a screen), high contrast.
 */

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border-2 border-line bg-card p-5 ${className}`}>{children}</div>
}

const VARIANTS = {
  go: 'bg-go text-white hover:bg-[#0b4a3c] disabled:bg-off',
  ask: 'bg-ask text-white hover:bg-[#962f17] disabled:bg-off',
  secondary: 'border-2 border-line bg-card text-ink hover:border-muted disabled:text-off',
  danger: 'border-2 border-urgent bg-card text-urgent hover:bg-urgent-soft',
}

interface ButtonProps {
  children: ReactNode
  variant?: keyof typeof VARIANTS
  /** The one main action on a screen: 64px tall and full width. */
  main?: boolean
  icon?: IconName
  onClick?: () => void
  disabled?: boolean
  href?: string
  className?: string
}

export function Button({ children, variant = 'go', main, icon, onClick, disabled, href, className = '' }: ButtonProps) {
  const cls = `inline-flex items-center justify-center gap-2 rounded-2xl px-5 font-semibold transition-colors disabled:cursor-not-allowed ${
    main ? 'min-h-16 w-full text-xl' : 'min-h-11 text-lg'
  } ${VARIANTS[variant]} ${className}`
  const content = (
    <>
      {icon && <Icon name={icon} size={main ? 26 : 22} />}
      {children}
    </>
  )
  return href ? (
    <a href={href} className={cls}>
      {content}
    </a>
  ) : (
    <button onClick={onClick} disabled={disabled} className={cls}>
      {content}
    </button>
  )
}

/** The small back link at the top of every screen. */
export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      className="inline-flex min-h-11 items-center gap-1 self-start rounded-lg pr-2 text-base font-medium text-muted underline-offset-4 hover:text-ink hover:underline"
    >
      <Icon name="back" size={20} />
      {children}
    </a>
  )
}

export function ScreenTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div>
      <h2 className="text-[26px] font-bold leading-tight">{children}</h2>
      {sub && <p className="mt-1 text-muted">{sub}</p>}
    </div>
  )
}

/** Small label pills: urgent (red on light red), confirmed (green on light green), neutral. */
export function Pill({ tone, children, icon }: { tone: 'urgent' | 'go' | 'neutral'; children: ReactNode; icon?: IconName }) {
  const cls = {
    urgent: 'bg-urgent-soft text-urgent border-urgent',
    go: 'bg-go-soft text-go border-go',
    neutral: 'bg-paper text-muted border-line',
  }[tone]
  return (
    <span className={`inline-flex items-center gap-1 rounded-lg border-2 px-2 py-0.5 text-sm font-semibold ${cls}`}>
      {icon && <Icon name={icon} size={16} />}
      {children}
    </span>
  )
}
