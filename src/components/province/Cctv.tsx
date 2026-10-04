import { useEffect, useState } from 'react'
import { useI18n } from '../../i18n'
import { Icon } from '../Icon'
import { Loading } from '../kit'
import { provinceName } from '../../lib/ui'
import { SectionPage, type ProvinceProps } from './ProvincePage'

/** Agency cameras in the province: stills through our proxy (refreshed every minute), or a link out. */
export function Cctv({ province, data, dataError }: ProvinceProps) {
  const { m, lang } = useI18n()
  const [stamp, setStamp] = useState(() => Date.now())
  const [broken, setBroken] = useState<Record<number, boolean>>({})
  useEffect(() => {
    const t = setInterval(() => setStamp(Date.now()), 60_000)
    return () => clearInterval(t)
  }, [])
  const cams = data?.cctv ?? []
  return (
    <SectionPage province={province} title={m.cctv.title(provinceName(province, lang))} wide>
      {!data ? (
        <Loading error={dataError} />
      ) : cams.length ? (
        <>
          <p className="-mt-2 text-muted">{m.cctv.refresh}</p>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {cams.map((c) => (
              <li key={c.id} className="flex flex-col overflow-hidden rounded-[18px] bg-card">
                {c.kind === 'image' && !broken[c.id] ? (
                  <img
                    src={`${c.url}?t=${stamp}`}
                    alt={c.title}
                    loading="lazy"
                    className="aspect-video w-full bg-paper object-cover"
                    onError={() => setBroken((b) => ({ ...b, [c.id]: true }))}
                  />
                ) : (
                  <div className="flex aspect-video items-center justify-center bg-paper text-muted">
                    <Icon name="camera" size={36} />
                  </div>
                )}
                <div className="flex flex-col gap-1 p-4">
                  <p className="font-semibold">{c.title}</p>
                  <p className="text-sm text-muted">{c.description}</p>
                  {broken[c.id] && <p className="text-sm text-[#ff9500]">{m.cctv.unavailable}</p>}
                  {c.kind === 'link' && (
                    <a href={c.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-link">
                      {m.cctv.openViewer} <Icon name="external" size={16} />
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="rounded-[16px] bg-card p-5 text-muted">{m.cctv.none}</p>
      )}
      <a href="https://cctv.maholan.net/" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-link">
        {m.cctv.nationwide} <Icon name="external" size={16} />
      </a>
    </SectionPage>
  )
}
