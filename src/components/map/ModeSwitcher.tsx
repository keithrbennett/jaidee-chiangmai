import { useI18n } from '../../i18n'
import { MODES, type MapMode } from '../../lib/map/modes'
import { Icon } from '../Icon'

/** The hazard picker floating over a map. On phones only the chosen hazard keeps its name. */
export function ModeSwitcher({ mode, onChange }: { mode: MapMode; onChange: (m: MapMode) => void }) {
  const { m } = useI18n()
  return (
    <div
      role="group"
      aria-label={m.modes.label}
      className="absolute left-1/2 top-3 z-10 flex w-max max-w-[calc(100%-1.5rem)] -translate-x-1/2 gap-1 overflow-x-auto rounded-full bg-card/90 p-1 shadow-lg backdrop-blur-xl"
    >
      {MODES.map((md) => (
        <button
          key={md.id}
          onClick={() => onChange(md.id)}
          aria-pressed={mode === md.id}
          title={m.modes[md.id]}
          className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-[14px] font-semibold transition ${mode === md.id ? 'text-white shadow' : 'text-ink/75 hover:text-ink'}`}
          style={mode === md.id ? { background: md.color } : undefined}
        >
          <Icon name={md.icon} size={17} />
          <span className={mode === md.id ? '' : 'hidden sm:inline'}>{m.modes[md.id]}</span>
        </button>
      ))}
    </div>
  )
}
