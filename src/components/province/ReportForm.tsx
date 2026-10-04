import { useI18n } from '../../i18n'
import { QuickReportForm } from '../report/QuickReport'
import { SectionPage, type ProvinceProps } from './ProvincePage'

/** The province's "report the water" page: the same photo-first form as the sheet, starting in this province. */
export function ReportForm({ province, reloadReports }: ProvinceProps) {
  const { m } = useI18n()
  return (
    <SectionPage province={province} title={m.report.title}>
      <div className="max-w-xl">
        <QuickReportForm prefill={{ province: province.code }} onSent={reloadReports} />
      </div>
    </SectionPage>
  )
}
