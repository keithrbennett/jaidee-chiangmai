import { useLayoutEffect, useRef, useState } from 'react'
import { useI18n } from '../../i18n'
import { MODES, type MapMode } from '../../lib/map/modes'
import { Icon } from '../Icon'

/**
 * The hazard picker floating over a map, an iOS segmented control: a coloured pill slides to the chosen
 * hazard. On phones only the chosen hazard keeps its name.
 */
export function ModeSwitcher({ mode, onChange }: { mode: MapMode; onChange: (m: MapMode) => void }) {
  const { m, lang } = useI18n()
  const group = useRef<HTMLDivElement>(null)
  const [pill, setPill] = useState<{ left: number; width: number } | null>(null)
  const color = MODES.find((md) => md.id === mode)?.color

  // Measure the chosen button after layout (names show or hide, the language changes) and move the pill there.
  useLayoutEffect(() => {
    const measure = () => {
      const b = group.current?.querySelector<HTMLButtonElement>(`[data-mode="${mode}"]`)
      if (b) setPill({ left: b.offsetLeft, width: b.offsetWidth })
    }
    measure()
    const ro = new ResizeObserver(measure)
    if (group.current) ro.observe(group.current)
    return () => ro.disconnect()
  }, [mode, lang])

  return (
    <div
      ref={group}
      role="group"
      aria-label={m.modes.label}
      className="absolute left-1/2 top-3 z-10 flex w-max max-w-[calc(100%-1.5rem)] -translate-x-1/2 gap-1 overflow-x-auto rounded-full bg-card/90 p-1 shadow-lg backdrop-blur-xl"
    >
      {pill && (
        <span
          aria-hidden="true"
          className="absolute top-1 bottom-1 rounded-full shadow transition-[left,width,background-color] duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)]"
          style={{ left: pill.left, width: pill.width, background: color }}
        />
      )}
      {MODES.map((md) => (
        <button
          key={md.id}
          data-mode={md.id}
          onClick={() => onChange(md.id)}
          aria-pressed={mode === md.id}
          title={m.modes[md.id]}
          className={`relative inline-flex min-h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[14px] font-semibold transition-colors duration-300 ${mode === md.id ? 'text-white' : 'text-ink/75 hover:text-ink'}`}
        >
          <Icon name={md.icon} size={17} />
          <span className={mode === md.id ? '' : 'hidden sm:inline'}>{m.modes[md.id]}</span>
        </button>
      ))}
    </div>
  )
}
