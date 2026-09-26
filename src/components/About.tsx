import { useI18n } from '../i18n'
import { href } from '../lib/router'

const STEP_ICONS = ['✅', '🙋', '🎫', '📊']

export function About() {
  const { m } = useI18n()
  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        <h2 className="text-lg font-bold">{m.about.title}</h2>
        <p className="text-sm text-slate-600">{m.about.intro}</p>
      </div>

      <ol className="flex flex-col gap-2">
        {m.about.steps.map((s, i) => (
          <li key={i} className="flex gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <span className="text-2xl">{STEP_ICONS[i]}</span>
            <div>
              <div className="font-semibold">
                {i + 1}. {s.title}
              </div>
              <p className="mt-1 text-sm text-slate-700">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <section className="rounded-xl bg-slate-100 p-3 text-sm">
        <div className="mb-1 font-semibold">{m.about.modesTitle}</div>
        <p>{m.about.modesBody}</p>
      </section>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <a
          href={href({ name: 'map', category: 'all' })}
          className="rounded-xl bg-emerald-600 py-3 text-center font-bold text-white hover:bg-emerald-700"
        >
          {m.about.help}
        </a>
        <a
          href={href({ name: 'post' })}
          className="rounded-xl border border-slate-300 bg-white py-3 text-center font-semibold hover:bg-slate-100"
        >
          {m.about.needHelp}
        </a>
      </div>
    </div>
  )
}
