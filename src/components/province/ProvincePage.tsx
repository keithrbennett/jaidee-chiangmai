import { createContext, useContext, type ReactNode } from 'react'
import type { Province } from '../../data/provinces'
import { useI18n } from '../../i18n'
import { useApi, type ProvinceData, type Report } from '../../lib/api'
import { href, provinceHref, type Section } from '../../lib/router'
import { ALERT_COLOR } from '../../lib/water'
import { provinceName } from '../../lib/ui'
import { Area } from './Area'
import { Cctv } from './Cctv'
import { Help } from './Help'
import { Hub } from './Hub'
import { LostFound } from './LostFound'
import { Missing } from './Missing'
import { OpenCenter } from './OpenCenter'
import { ProvinceMap } from './ProvinceMap'
import { ReportForm } from './ReportForm'
import { Updates } from './Updates'
import { Weather } from './Weather'
import { EmergencyContacts } from '../contacts/EmergencyContacts'

export interface ProvinceProps {
  province: Province
  data: ProvinceData | null
  dataError: boolean
  reports: Report[] | null
  reloadReports: () => void
}

/** A province's pages share one load of its live data and its people's reports. */
export function ProvincePage({ province, section }: { province: Province; section: Section | null }) {
  const data = useApi<ProvinceData>(`/province/${province.code}`)
  const reports = useApi<Report[]>(`/reports?province=${province.code}`, 60_000)
  const props: ProvinceProps = { province, data: data.data, dataError: data.error, reports: reports.data, reloadReports: reports.reload }
  return <Ctx.Provider value={{ ...props, section }}>{sectionFor(section, props)}</Ctx.Provider>
}

function sectionFor(section: Section | null, props: ProvinceProps) {
  switch (section) {
    case 'map':
      return <ProvinceMap {...props} />
    case 'weather':
      return <Weather {...props} />
    case 'area':
      return <Area {...props} />
    case 'report':
      return <ReportForm {...props} />
    case 'updates':
      return <Updates {...props} />
    case 'lost-found':
      return <LostFound {...props} />
    case 'missing':
      return <Missing {...props} />
    case 'help':
      return <Help {...props} />
    case 'open':
      return <OpenCenter {...props} />
    case 'cctv':
      return <Cctv {...props} />
    case 'contacts':
      return <ContactsPage {...props} />
    default:
      return <Hub {...props} />
  }
}

const Ctx = createContext<(ProvinceProps & { section: Section | null }) | null>(null)

type TabId = 'overview' | 'map' | 'weather' | 'community' | 'contacts' | 'help'
const TABS: { id: TabId; section: Section | null; also: Section[] }[] = [
  { id: 'overview', section: null, also: [] },
  { id: 'map', section: 'map', also: ['area', 'cctv'] },
  { id: 'weather', section: 'weather', also: [] },
  { id: 'community', section: 'updates', also: ['report', 'lost-found'] },
  { id: 'contacts', section: 'contacts', also: [] },
  { id: 'help', section: 'help', also: ['missing', 'open'] },
]

/**
 * The top of every province page: name, today's overall level (the highest active alert), and the five
 * province tabs. One place to move around a province, instead of a long list of links.
 */
export function ProvinceHeader({ province, section }: { province: Province; section: Section | null }) {
  const { m, lang } = useI18n()
  const ctx = useContext(Ctx)
  const level = Math.max(0, ...(ctx?.data?.alerts ?? []).map((a) => a.level))
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
        <div className="mr-auto">
          <a href={href({ name: 'provinces' })} className="text-[15px] font-semibold text-muted hover:text-link">
            {m.regions[province.region]} · {m.province.change}
          </a>
          <h1 className="text-[32px] font-bold leading-tight md:text-[40px]">{provinceName(province, lang)}</h1>
        </div>
        {ctx?.data && (
          <span className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-[15px] font-bold" style={{ background: `${ALERT_COLOR[level]}26`, color: level === 1 ? '#a37f00' : ALERT_COLOR[level] }}>
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: ALERT_COLOR[level] }} />
            {m.province.overall}: {m.hazard.levels[level]}
          </span>
        )}
      </div>
      <nav className="-mx-4 flex gap-1 overflow-x-auto border-b border-line px-4 md:mx-0 md:px-0" aria-label={provinceName(province, lang)}>
        {TABS.map((t) => {
          const on = section === t.section || (section !== null && t.also.includes(section))
          return (
            <a
              key={t.id}
              href={provinceHref(province, t.section)}
              aria-current={on ? 'page' : undefined}
              className={`-mb-px shrink-0 border-b-2 px-3 py-2.5 text-[15px] font-semibold ${on ? 'border-go text-go' : 'border-transparent text-muted hover:text-ink'}`}
            >
              {m.province.tabs[t.id]}
            </a>
          )
        })}
      </nav>
    </div>
  )
}

/** Page frame for a province section: the province header, a title, the content. */
export function SectionPage({ province, title, wide = false, children }: { province: Province; title: string; wide?: boolean; children: ReactNode }) {
  const ctx = useContext(Ctx)
  return (
    <div className={`mx-auto flex w-full ${wide ? 'max-w-6xl' : 'max-w-4xl'} flex-col gap-6 px-4 py-5 md:px-6`}>
      <ProvinceHeader province={ctx?.province ?? province} section={ctx?.section ?? null} />
      <h2 className="text-[26px] font-bold leading-tight">{title}</h2>
      {children}
    </div>
  )
}

/** #/p/<slug>/contacts: who to call in this province. */
function ContactsPage({ province }: ProvinceProps) {
  const { m, lang } = useI18n()
  return (
    <SectionPage province={province} title={m.contacts.titleIn(provinceName(province, lang))}>
      <EmergencyContacts province={province} />
    </SectionPage>
  )
}
