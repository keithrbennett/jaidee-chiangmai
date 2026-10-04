import { useState } from 'react'
import { useI18n } from '../../i18n'
import { api } from '../../lib/api'
import { Button } from '../ui'
import { EmergencyNumbers, Field, Loading, inputCls } from '../kit'
import { errorText, provinceName } from '../../lib/ui'
import { SectionPage, type ProvinceProps } from './ProvincePage'

/** Missing people go to the command centre only; nothing is published. */
export function Missing({ province, data, dataError }: ProvinceProps) {
  const { m, lang } = useI18n()
  const f = m.missing.form
  const [v, setV] = useState({ name: '', age: '', description: '', lastSeenPlace: '', lastSeenAt: '', reporterName: '', reporterPhone: '', relation: '' })
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [error, setError] = useState<string | null>(null)
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value })

  return (
    <SectionPage province={province} title={m.missing.title(provinceName(province, lang))}>
      <p className="text-lg">{m.missing.intro}</p>
      {!data ? (
        <Loading error={dataError} />
      ) : !data.commandCenter.active ? (
        <>
          <p className="rounded-[16px] bg-card p-5 font-semibold">{m.missing.closed}</p>
          <EmergencyNumbers social />
        </>
      ) : state === 'sent' ? (
        <p className="rounded-[18px] bg-[#34c759]/15 p-5 text-lg font-semibold text-[#248a3d]">{m.missing.sent}</p>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault()
            setState('sending')
            setError(null)
            try {
              await api('/missing', { body: { province: province.code, ...v, age: v.age ? Number(v.age) : null } })
              setState('sent')
            } catch (err) {
              setError(errorText(err, m))
              setState('idle')
            }
          }}
        >
          <Field label={f.name}>
            <input required className={inputCls} value={v.name} onChange={set('name')} maxLength={120} />
          </Field>
          <Field label={f.age}>
            <input className={inputCls} inputMode="numeric" value={v.age} onChange={set('age')} maxLength={3} />
          </Field>
          <Field label={f.description}>
            <textarea className={`${inputCls} min-h-24 py-2`} value={v.description} onChange={set('description')} maxLength={1000} />
          </Field>
          <Field label={f.lastSeenPlace}>
            <input className={inputCls} value={v.lastSeenPlace} onChange={set('lastSeenPlace')} maxLength={300} />
          </Field>
          <Field label={f.lastSeenAt}>
            <input className={inputCls} value={v.lastSeenAt} onChange={set('lastSeenAt')} maxLength={60} />
          </Field>
          <Field label={f.reporterName}>
            <input required className={inputCls} value={v.reporterName} onChange={set('reporterName')} maxLength={120} />
          </Field>
          <Field label={f.reporterPhone}>
            <input required className={inputCls} type="tel" value={v.reporterPhone} onChange={set('reporterPhone')} maxLength={40} />
          </Field>
          <Field label={f.relation}>
            <input className={inputCls} value={v.relation} onChange={set('relation')} maxLength={60} />
          </Field>
          {error && <p className="font-semibold text-urgent">{error}</p>}
          <Button main disabled={state === 'sending'}>
            {state === 'sending' ? m.common.sending : f.send}
          </Button>
        </form>
      )}
    </SectionPage>
  )
}
