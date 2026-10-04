import { useMemo } from 'react'
import { PROVINCES, type Region } from '../../data/provinces'
import { useI18n } from '../../i18n'
import { useApi, type National } from '../../lib/api'
import { provinceAt } from '../../lib/geo'
import { navigate, provinceHref } from '../../lib/router'
import { STATUS_COLOR, stationStatus } from '../../lib/water'
import { Icon } from '../Icon'
import { EmergencyNumbers, GeoMessage, ProvinceSearch } from '../kit'
import { provinceName, useGeolocation } from '../../lib/ui'

const REGIONS: Region[] = ['north', 'northeast', 'central', 'east', 'west', 'south']

export function Provinces() {
  const { m, lang } = useI18n()
  const national = useApi<National>('/national')
  const geo = useGeolocation()

  const counts = useMemo(() => {
    const c: Record<string, { over: number; high: number }> = {}
    for (const s of national.data?.stations ?? []) {
      if (!s.province) continue
      const st = stationStatus(s)
      c[s.province] ??= { over: 0, high: 0 }
      if (st === 'over') c[s.province].over++
      if (st === 'high') c[s.province].high++
    }
    return c
  }, [national.data])
  const open = new Set((national.data?.commandCenters ?? []).map((c) => c.province))
  const sorted = (r: Region) =>
    PROVINCES.filter((p) => p.region === r).sort((a, b) => (lang === 'th' ? a.th.localeCompare(b.th, 'th') : a.en.localeCompare(b.en)))

  return (
    <div className="mx-auto w-full flex max-w-5xl flex-col gap-7 px-4 py-6 md:px-6">
      <header className="flex flex-col gap-4">
        <div>
          <h1 className="text-[34px] font-bold leading-tight">{m.provinces.title}</h1>
          <p className="mt-1 text-lg text-muted">{m.provinces.sub}</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="flex-1">
            <ProvinceSearch autoFocus onPick={(p) => navigate({ name: 'province', province: p, section: null })} />
          </div>
          <button
            onClick={async () => {
              const pt = await geo.locate()
              const prov = pt ? await provinceAt(pt[0], pt[1]) : null
              if (prov) navigate({ name: 'province', province: prov, section: null })
            }}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-go px-5 font-medium text-white hover:bg-go-hover"
          >
            <Icon name="locate" size={20} />
            {m.home.nearMe}
          </button>
        </div>
        <GeoMessage state={geo.state} />
      </header>

      {open.size > 0 && (
        <section className="flex flex-wrap gap-2">
          {PROVINCES.filter((p) => open.has(p.code)).map((p) => (
            <a key={p.code} href={provinceHref(p)} className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#34c759] px-4 font-semibold text-white">
              <Icon name="lifebuoy" size={18} />
              {provinceName(p, lang)} · {m.provinces.commandOpen}
            </a>
          ))}
        </section>
      )}

      {REGIONS.map((r) => (
        <section key={r} className="flex flex-col gap-3">
          <h2 className="text-[22px] font-bold">
            {m.regions[r]} <span className="font-normal text-faint">({sorted(r).length})</span>
          </h2>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {sorted(r).map((p) => {
              const c = counts[p.code]
              return (
                <li key={p.code}>
                  <a href={provinceHref(p)} className="flex min-h-14 items-center gap-2 rounded-[14px] bg-card px-4 py-2 hover:shadow-[0_4px_20px_rgb(0_0_0/0.08)]">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-semibold">{provinceName(p, lang)}</span>
                      <span className="block truncate text-sm text-faint">{lang === 'th' ? p.en : p.th}</span>
                    </span>
                    {c?.over ? (
                      <span className="rounded-full px-2 py-0.5 text-xs font-bold text-white" style={{ background: STATUS_COLOR.over }}>
                        {m.provinces.overCount(c.over)}
                      </span>
                    ) : c?.high ? (
                      <span className="rounded-full px-2 py-0.5 text-xs font-bold text-white" style={{ background: STATUS_COLOR.high }}>
                        {m.provinces.highCount(c.high)}
                      </span>
                    ) : null}
                    {open.has(p.code) && <Icon name="lifebuoy" size={18} className="text-[#34c759]" />}
                  </a>
                </li>
              )
            })}
          </ul>
        </section>
      ))}

      <EmergencyNumbers />
    </div>
  )
}
