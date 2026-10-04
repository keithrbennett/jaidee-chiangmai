import { Suspense, lazy } from 'react'
import { useI18n } from '../../i18n'
import { openAssistant, useAssistant } from '../../lib/assistant'
import { Orb } from './Orb'

// The chat itself loads on first open.
const Panel = lazy(() => import('./Panel'))

/** น้องใจดี's button, floating over every page (above the tab bar on phones), and the chat when open. */
export function AssistantLauncher({ hidden = false }: { hidden?: boolean }) {
  const { m } = useI18n()
  const s = useAssistant()
  return (
    <>
      {!s.open && !hidden && (
        <button
          onClick={() => openAssistant()}
          aria-label={m.assistant.open}
          className="press pop-in glass fixed bottom-[calc(4.6rem+env(safe-area-inset-bottom))] right-3 z-[1100] flex items-center gap-2 rounded-full p-1.5 shadow-[0_10px_30px_rgb(0_0_0/0.2)] ring-1 ring-black/5 md:bottom-6 md:right-6 md:pr-5"
        >
          <Orb size={46} busy={s.busy} />
          <span className="hidden text-[15px] font-semibold md:inline">{m.assistant.open}</span>
        </button>
      )}
      {s.open && (
        <Suspense fallback={null}>
          <Panel />
        </Suspense>
      )}
    </>
  )
}
