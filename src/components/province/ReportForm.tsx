import { Suspense, lazy } from 'react'
import { useI18n } from '../../i18n'
import { SectionPage, type ProvinceProps } from './ProvincePage'

// The report form (and its photo handling) loads when someone opens it.
const QuickReportForm = lazy(() => import('../report/QuickReport').then((mod) => ({ default: mod.QuickReportForm })))

/** The province's "report the water" page: the same photo-first form as the sheet, starting in this province. */
export function ReportForm({ province, reloadReports }: ProvinceProps) {
  const { m } = useI18n()
  return (
    <SectionPage province={province} title={m.report.title}>
      <div className="max-w-xl">
        <Suspense fallback={<div className="skeleton h-64" />}>
          <QuickReportForm prefill={{ province: province.code }} onSent={reloadReports} />
        </Suspense>
      </div>
    </SectionPage>
  )
}
