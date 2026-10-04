import { useEffect, useState } from 'react'
import { useI18n } from '../../i18n'
import { api } from '../../lib/api'
import { clearDraft, readDraft } from '../../lib/assistant'
import { href } from '../../lib/router'
import { LEVELS, LEVEL_COLOR } from '../../lib/water'
import { Icon } from '../Icon'
import { Button } from '../ui'
import { Choices, EmergencyNumbers, Field, Loading, LocationPicker, inputCls } from '../kit'
import { errorText, provinceName } from '../../lib/ui'
import { SectionPage, type ProvinceProps } from './ProvincePage'

const VULNERABLE = ['elderly', 'children', 'disabled', 'sick', 'pregnant', 'bedridden']
const NEEDS = ['evacuate', 'food', 'water', 'medicine', 'medical']

/**
 * Ask for help. Only where a command centre is open: otherwise the request would sit unread, so we show
 * the emergency numbers instead.
 */
export function Help({ province, data, dataError }: ProvinceProps) {
  const { m, lang } = useI18n()
  // A request น้องใจดี drafted in the chat (src/lib/assistant.ts), if one is waiting for this province.
  const [draft] = useState(() => readDraft(province.code))
  useEffect(() => clearDraft(), [])
  const [where, setWhere] = useState<[number, number] | null>(draft?.location ?? null)
  const [people, setPeople] = useState(String(draft?.people ?? 1))
  const [vulnerable, setVulnerable] = useState<string[]>(draft?.vulnerable ?? [])
  const [needs, setNeeds] = useState<string[]>(draft?.needs ?? [])
  const [level, setLevel] = useState<number | null>(draft?.waterLevel ?? null)
  const [phone, setPhone] = useState(draft?.phone ?? '')
  const [name, setName] = useState(draft?.name ?? '')
  const [note, setNote] = useState(
    draft ? [draft.place, draft.noteTh, draft.noteOriginal && `(${draft.noteOriginal})`].filter(Boolean).join('\n').slice(0, 1000) : '',
  )
  const [sending, setSending] = useState(false)
  const [code, setCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const toggle = (list: string[], set: (v: string[]) => void) => (v: string) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

  return (
    <SectionPage province={province} title={m.help.title(provinceName(province, lang))}>
      {!data ? (
        <Loading error={dataError} />
      ) : !data.commandCenter.active ? (
        <>
          <p className="rounded-[16px] bg-card p-5 text-lg font-semibold">{m.help.closed}</p>
          <EmergencyNumbers social rid />
        </>
      ) : code ? (
        <section className="flex flex-col gap-3 rounded-[22px] bg-card p-6">
          <p className="text-lg font-semibold text-[#248a3d]">{m.help.sent}</p>
          <p className="text-[34px] font-bold tracking-wider">{m.help.code(code)}</p>
          <p className="text-muted">{m.help.codeNote}</p>
          <Button href={href({ name: 'helpStatus', code })}>{m.help.check}</Button>
          {data.commandCenter.hotline && (
            <a href={`tel:${data.commandCenter.hotline}`} className="font-semibold text-link">
              {m.province.centerHotline(data.commandCenter.hotline)}
            </a>
          )}
        </section>
      ) : (
        <>
          <p className="rounded-[16px] bg-urgent-soft p-4 font-semibold text-urgent">{m.help.intro}</p>
          {draft && (
            <p className="rise flex items-start gap-3 rounded-[16px] bg-go-soft p-4 text-[15px] font-medium text-go">
              <Icon name="check" size={20} className="mt-0.5" />
              {m.help.drafted}
            </p>
          )}
          <section className="flex flex-col gap-3">
            <h2 className="text-xl font-bold">{m.help.where}</h2>
            <LocationPicker value={where} onChange={setWhere} center={province.center} />
          </section>
          <Field label={m.help.people}>
            <input className={`${inputCls} w-32`} inputMode="numeric" value={people} onChange={(e) => setPeople(e.target.value.replace(/\D/g, '').slice(0, 3))} />
          </Field>
          <section className="flex flex-col gap-2">
            <h2 className="font-semibold">{m.help.vulnerableTitle}</h2>
            <Choices multi options={VULNERABLE.map((k) => [k, m.help.vulnerable[k]])} value={vulnerable} onChange={toggle(vulnerable, setVulnerable)} />
          </section>
          <section className="flex flex-col gap-2">
            <h2 className="font-semibold">{m.help.needsTitle}</h2>
            <Choices multi options={NEEDS.map((k) => [k, m.help.needs[k]])} value={needs} onChange={toggle(needs, setNeeds)} />
          </section>
          <section className="flex flex-col gap-2">
            <h2 className="font-semibold">{m.help.level}</h2>
            <Choices
              options={LEVELS.map((l) => [l, m.levels.names[l]])}
              value={level}
              onChange={(v) => setLevel(level === v ? null : v)}
              colors={Object.fromEntries(LEVELS.map((l) => [String(l), LEVEL_COLOR[l]]))}
            />
          </section>
          <Field label={m.help.phone}>
            <input className={inputCls} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={40} />
          </Field>
          <Field label={m.help.name}>
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
          </Field>
          <Field label={m.help.note} hint={m.help.anyLanguage}>
            <textarea className={`${inputCls} min-h-24 py-2`} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
          </Field>
          {error && <p className="font-semibold text-urgent">{error}</p>}
          <Button
            main
            variant="danger"
            className="!bg-urgent !text-white"
            disabled={!where || !phone.trim() || !Number(people) || sending}
            onClick={async () => {
              setSending(true)
              setError(null)
              try {
                const res = await api<{ code: string }>('/help', {
                  body: { lng: where![0], lat: where![1], people: Number(people), vulnerable, needs, waterLevel: level, phone, name: name || null, note: note || null },
                })
                setCode(res.code)
              } catch (err) {
                setError(errorText(err, m))
              } finally {
                setSending(false)
              }
            }}
          >
            {sending ? m.common.sending : m.help.send}
          </Button>
          <EmergencyNumbers />
        </>
      )}
    </SectionPage>
  )
}
