import { useState } from 'react'
import { useI18n } from '../../i18n'
import { api, useApi, type LostFound as Post } from '../../lib/api'
import { provinceHref } from '../../lib/router'
import { useLocalStorage } from '../../lib/useLocalStorage'
import { Icon } from '../Icon'
import { Button } from '../ui'
import { Ago, CautionNote, Choices, Field, PhotoInput, inputCls } from '../kit'
import { errorText, provinceName } from '../../lib/ui'
import { SectionPage, type ProvinceProps } from './ProvincePage'

const CATEGORIES = ['pet', 'livestock', 'document', 'valuables', 'phone', 'vehicle', 'other']

export function LostFound({ province }: ProvinceProps) {
  const { m, lang } = useI18n()
  const posts = useApi<Post[]>(`/lost-found?province=${province.code}`, 60_000)
  const [kind, setKind] = useState<'all' | 'lost' | 'found'>('all')
  const [category, setCategory] = useState('')
  const [form, setForm] = useState<'lost' | 'found' | null>(null)
  // Tokens for posts made on this device, so the poster can close them.
  const [mine, setMine] = useLocalStorage<Record<string, string>>('jaidee.lostTokens', {})
  const all = posts.data ?? []
  const list = all.filter((p) => (kind === 'all' || p.kind === kind) && (!category || p.category === category))

  return (
    <SectionPage province={province} title={m.lost.title(provinceName(province, lang))}>
      <div className="grid gap-2 sm:grid-cols-2">
        <button onClick={() => setForm('lost')} className="flex min-h-20 flex-col items-start justify-center rounded-[18px] bg-[#ff2d55] p-4 text-left text-white">
          <span className="text-lg font-bold">{m.lost.lost}</span>
          <span className="text-white/85">{m.lost.lostSub}</span>
        </button>
        <button onClick={() => setForm('found')} className="flex min-h-20 flex-col items-start justify-center rounded-[18px] bg-[#34c759] p-4 text-left text-white">
          <span className="text-lg font-bold">{m.lost.found}</span>
          <span className="text-white/85">{m.lost.foundSub}</span>
        </button>
      </div>
      <a href={provinceHref(province, 'missing')} className="inline-flex items-center gap-1 font-semibold text-link">
        <Icon name="person" size={18} /> {m.lost.missingLink}
      </a>
      <p className="rounded-[14px] bg-[#ffcc00]/20 p-4 text-[15px]">{m.lost.scam}</p>

      {form && (
        <PostForm
          kind={form}
          provinceCode={province.code}
          onDone={(id, token) => {
            setMine({ ...mine, [id]: token })
            setForm(null)
            posts.reload()
          }}
          onCancel={() => setForm(null)}
        />
      )}

      <div className="flex flex-col gap-2">
        <Choices
          options={[
            ['all', m.lost.all],
            ['lost', m.lost.lookingFor(all.filter((p) => p.kind === 'lost' && p.status === 'open').length)],
            ['found', m.lost.waiting(all.filter((p) => p.kind === 'found' && p.status === 'open').length)],
          ]}
          value={kind}
          onChange={(v) => setKind(v as typeof kind)}
        />
        <select className={`${inputCls} w-auto`} value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">{m.lost.allTypes}</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {m.lost.categories[c]}
            </option>
          ))}
        </select>
      </div>

      {list.length ? (
        <ul className="flex flex-col gap-2">
          {list.map((p) => (
            <li key={p.id} className={`flex flex-col gap-1 rounded-[16px] bg-card p-4 ${p.status === 'resolved' ? 'opacity-60' : ''}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2.5 py-0.5 text-sm font-semibold text-white ${p.kind === 'lost' ? 'bg-[#ff2d55]' : 'bg-[#34c759]'}`}>
                  {p.kind === 'lost' ? m.lost.lost : m.lost.found}
                </span>
                <span className="text-sm text-muted">{m.lost.categories[p.category]}</span>
                {p.status === 'resolved' && <span className="text-sm font-semibold text-muted">· {m.lost.resolved}</span>}
                <span className="ml-auto text-sm text-faint">
                  <Ago when={p.createdAt} />
                </span>
              </div>
              <p className="text-lg font-semibold">{p.title}</p>
              <CautionNote text={p.caution} />
              {p.description && <p>{p.description}</p>}
              {p.place && <p className="text-muted">{p.place}</p>}
              {p.photo && <img src={p.photo} alt="" loading="lazy" className="mt-1 max-h-56 self-start rounded-[12px]" />}
              <p className="mt-1">
                <b>{m.lost.contact}:</b> {p.contact}
              </p>
              {mine[p.id] && p.status === 'open' && (
                <button
                  onClick={async () => {
                    await api(`/lost-found/${p.id}/resolve`, { body: { token: mine[p.id] } }).catch(() => {})
                    posts.reload()
                  }}
                  className="mt-1 self-start rounded-full bg-paper px-4 py-2 font-semibold"
                >
                  {m.lost.resolve}
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-[16px] bg-card p-5 text-muted">{posts.loading ? m.common.loading : m.lost.none}</p>
      )}
    </SectionPage>
  )
}

function PostForm({ kind, provinceCode, onDone, onCancel }: { kind: 'lost' | 'found'; provinceCode: string; onDone: (id: string, token: string) => void; onCancel: () => void }) {
  const { m } = useI18n()
  const [category, setCategory] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [place, setPlace] = useState('')
  const [contact, setContact] = useState('')
  const [photo, setPhoto] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <section className="flex flex-col gap-4 rounded-[18px] bg-card p-5">
      <h2 className="text-xl font-bold">{kind === 'lost' ? m.lost.lostSub : m.lost.foundSub}</h2>
      <Choices options={CATEGORIES.map((c) => [c, m.lost.categories[c]])} value={category} onChange={setCategory} />
      <Field label={m.lost.form.title}>
        <input className={inputCls} maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label={m.lost.form.description}>
        <textarea className={`${inputCls} min-h-24 py-2`} maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <Field label={m.lost.form.place}>
        <input className={inputCls} maxLength={200} value={place} onChange={(e) => setPlace(e.target.value)} />
      </Field>
      <Field label={m.lost.form.contact} hint={m.lost.form.contactNote}>
        <input className={inputCls} maxLength={120} value={contact} onChange={(e) => setContact(e.target.value)} />
      </Field>
      <PhotoInput value={photo} onChange={setPhoto} />
      {error && <p className="font-semibold text-urgent">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={!category || !title.trim() || !contact.trim() || sending}
          onClick={async () => {
            setSending(true)
            setError(null)
            try {
              const res = await api<{ id: string; token: string }>('/lost-found', {
                body: { province: provinceCode, kind, category, title, description: description || null, place: place || null, contact, photo },
              })
              onDone(res.id, res.token)
            } catch (err) {
              setError(errorText(err, m))
            } finally {
              setSending(false)
            }
          }}
        >
          {sending ? m.common.sending : m.lost.form.post}
        </Button>
        <Button variant="secondary" onClick={onCancel}>
          {m.common.cancel}
        </Button>
      </div>
    </section>
  )
}
