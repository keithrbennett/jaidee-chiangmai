import type { ReactNode } from 'react'
import type { Province } from '../../data/provinces'
import { useI18n } from '../../i18n'
import { useApi, type ProvinceData, type Report } from '../../lib/api'
import { provinceHref, type Section } from '../../lib/router'
import { Icon } from '../Icon'
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
    default:
      return <Hub {...props} />
  }
}

/** Page frame for a province section: back to the province, a title, the content. */
export function SectionPage({ province, title, wide = false, children }: { province: Province; title: string; wide?: boolean; children: ReactNode }) {
  const { lang } = useI18n()
  return (
    <div className={`mx-auto flex ${wide ? 'max-w-6xl' : 'max-w-3xl'} flex-col gap-6 px-4 py-5 md:px-6`}>
      <a href={provinceHref(province)} className="inline-flex min-h-11 items-center gap-0.5 self-start text-[17px] text-link hover:underline">
        <Icon name="back" size={20} />
        {provinceName(province, lang)}
      </a>
      <h1 className="-mt-3 text-[30px] font-bold leading-tight md:text-[34px]">{title}</h1>
      {children}
    </div>
  )
}

