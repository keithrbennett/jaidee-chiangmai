import type { ReactNode } from 'react'
import type { IconName } from '../lib/icons'
import { Icon } from './Icon'

/*
 * Apple-style building blocks: borderless 18px tiles on a light-grey page, pill buttons
 * (44px minimum tap target, 56px for the one main action on a screen), soft pills.
 */

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-[18px] bg-card p-6 ${className}`}>{children}</div>
}

const VARIANTS = {
  go: 'bg-go text-white hover:bg-go-hover disabled:bg-off',
  ask: 'bg-ask text-on-ask hover:opacity-85 disabled:bg-off',
  secondary: 'border border-link text-link hover:bg-link hover:text-page disabled:border-off disabled:text-off',
  danger: 'border border-urgent text-urgent hover:bg-urgent hover:text-white',
}

interface ButtonProps {
  children: ReactNode
  variant?: keyof typeof VARIANTS
  /** The one main action on a screen: 56px tall and full width. */
  main?: boolean
  icon?: IconName
  onClick?: () => void
  disabled?: boolean
  href?: string
  className?: string
}

export function Button({ children, variant = 'go', main, icon, onClick, disabled, href, className = '' }: ButtonProps) {
  const cls = `inline-flex items-center justify-center gap-2 rounded-full font-medium transition-colors disabled:cursor-not-allowed ${
    main ? 'min-h-14 w-full px-8 text-[19px]' : 'min-h-11 px-5 text-[17px]'
  } ${VARIANTS[variant]} ${className}`
  const content = (
    <>
      {icon && <Icon name={icon} size={main ? 22 : 20} />}
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

/** The small back link at the top of every screen ("‹ Home" in the Apple concept). */
export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} className="inline-flex min-h-11 items-center gap-0.5 self-start text-[17px] text-link hover:underline">
      <Icon name="back" size={20} />
      {children}
    </a>
  )
}

export function ScreenTitle({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  return (
    <div>
      <h2 className="text-[34px] font-bold leading-tight">{children}</h2>
      {sub && <p className="mt-1 text-[19px] text-muted">{sub}</p>}
    </div>
  )
}

/** Small label pills: urgent (red), confirmed (blue), neutral (grey). */
export function Pill({ tone, children, icon }: { tone: 'urgent' | 'go' | 'neutral'; children: ReactNode; icon?: IconName }) {
  const cls = {
    urgent: 'bg-urgent-soft text-urgent',
    go: 'bg-go-soft text-go',
    neutral: 'bg-paper text-muted',
  }[tone]
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-sm font-semibold ${cls}`}>
      {icon && <Icon name={icon} size={15} />}
      {children}
    </span>
  )
}
