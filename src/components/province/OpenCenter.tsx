import { useState } from 'react'
import { useI18n } from '../../i18n'
import { api } from '../../lib/api'
import { Button } from '../ui'
import { Field, inputCls } from '../kit'
import { errorText, provinceName } from '../../lib/ui'
import { SectionPage, type ProvinceProps } from './ProvincePage'

/** For local agencies: ask to have a command centre opened for the province. */
export function OpenCenter({ province }: ProvinceProps) {
  const { m, lang } = useI18n()
  const f = m.open.form
  const [v, setV] = useState({ name: '', position: '', phone: '', agency: '', lineId: '', details: '' })
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [error, setError] = useState<string | null>(null)
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value })

  return (
    <SectionPage province={province} title={m.open.title(provinceName(province, lang))}>
      <p className="text-lg">{m.open.intro}</p>
      <p className="text-muted">{m.open.review}</p>
      {state === 'sent' ? (
        <p className="rounded-[18px] bg-[#34c759]/15 p-5 text-lg font-semibold text-[#248a3d]">{m.open.sent}</p>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault()
            setState('sending')
            setError(null)
            try {
              await api('/open-request', { body: { province: province.code, ...v } })
              setState('sent')
            } catch (err) {
              setError(errorText(err, m))
              setState('idle')
            }
          }}
        >
          <Field label={`${f.name} *`}>
            <input required className={inputCls} value={v.name} onChange={set('name')} maxLength={120} />
          </Field>
          <Field label={f.position}>
            <input className={inputCls} value={v.position} onChange={set('position')} maxLength={120} />
          </Field>
          <Field label={`${f.phone} *`}>
            <input required type="tel" className={inputCls} value={v.phone} onChange={set('phone')} maxLength={40} />
          </Field>
          <Field label={`${f.agency} *`}>
            <input required className={inputCls} value={v.agency} onChange={set('agency')} maxLength={200} />
          </Field>
          <Field label={f.lineId}>
            <input className={inputCls} value={v.lineId} onChange={set('lineId')} maxLength={60} />
          </Field>
          <Field label={f.details}>
            <textarea className={`${inputCls} min-h-24 py-2`} value={v.details} onChange={set('details')} maxLength={2000} />
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
