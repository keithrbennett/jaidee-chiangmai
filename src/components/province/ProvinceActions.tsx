import type { CSSProperties } from 'react'
import type { Province } from '../../data/provinces'
import { useI18n } from '../../i18n'
import type { IconName } from '../../lib/icons'
import { openQuickReport } from '../../lib/report'
import { href, provinceHref } from '../../lib/router'
import { Icon } from '../Icon'

/** The four things to do in a province, as round buttons: get help, report the water, call, simulate. */
export function ProvinceActions({ province, onCall }: { province: Province; onCall?: () => void }) {
  const { m } = useI18n()
  const S = m.provinceSheet
  const actions: { icon: IconName; label: string; color: string; href?: string; onClick?: () => void }[] = [
    { icon: 'lifebuoy', label: S.help, color: '#ff3b30', href: provinceHref(province, 'help') },
    { icon: 'camera', label: S.report, color: '#0a84ff', onClick: () => openQuickReport({ province: province.code }) },
    { icon: 'phone', label: S.call, color: '#34c759', ...(onCall ? { onClick: onCall } : { href: provinceHref(province, 'contacts') }) },
    { icon: 'globe3d', label: S.simulate, color: '#5e5ce6', href: href({ name: 'flood', province }) },
  ]
  return (
    <div className="grid grid-cols-4 gap-2">
      {actions.map((a, i) => {
        const inner = (
          <>
            <span className="grid h-11 w-11 place-items-center rounded-full text-white shadow-sm" style={{ background: a.color }}>
              <Icon name={a.icon} size={21} />
            </span>
            <span className="text-center text-[12px] font-semibold leading-tight">{a.label}</span>
          </>
        )
        const cls = 'press rise flex min-w-[72px] flex-col items-center gap-1.5 rounded-[16px] bg-paper/70 px-1 py-2.5 hover:bg-paper'
        return a.href ? (
          <a key={a.label} href={a.href} className={cls} style={{ '--i': i } as CSSProperties}>
            {inner}
          </a>
        ) : (
          <button key={a.label} onClick={a.onClick} className={cls} style={{ '--i': i } as CSSProperties}>
            {inner}
          </button>
        )
      })}
    </div>
  )
}
