import type { Map as MlMap } from 'maplibre-gl'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useI18n } from '../../i18n'
import { weatherKind } from '../../lib/forecast'
import { showRadar } from '../../lib/map/layers'
import { useRadar } from '../../lib/radar'
import { clock } from '../../lib/time'
import { RAIN_CLASSES, rainClass } from '../../lib/water'
import { Icon } from '../Icon'
import { Loading, MapBox, SectionTitle } from '../kit'
import { MapView, provinceName, useLocale } from '../../lib/ui'
import { SectionPage, type ProvinceProps } from './ProvincePage'

export function Weather({ province, data, dataError }: ProvinceProps) {
  const { m, lang } = useI18n()
  const locale = useLocale()
  const radar = useRadar()
  const [frame, setFrame] = useState<number | null>(null) // index while playing, null = latest
  const mapRef = useRef<MlMap | null>(null)
  const shown = frame === null ? radar.frames[radar.frames.length - 1] : radar.frames[frame]

  useEffect(() => {
    if (frame === null) return
    const t = setTimeout(() => setFrame((f) => (f === null ? null : f + 1 < radar.frames.length ? f + 1 : 0)), 700)
    return () => clearTimeout(t)
  }, [frame, radar.frames.length])

  const draw = useCallback((map: MlMap) => map.getSource('osm') && shown && showRadar(map, shown.path, true), [shown])
  const drawRef = useRef(draw)
  useEffect(() => {
    drawRef.current = draw
    if (mapRef.current) draw(mapRef.current)
  }, [draw])

  const days = data?.forecast?.daily ?? []
  const dayNames = [m.weather.today, m.weather.tomorrow, m.weather.dayAfter]
  const hourly = data?.forecast?.hourly ?? []
  const max = Math.max(2, ...hourly.map((h) => h[1] ?? 0))

  return (
    <SectionPage province={province} title={m.weather.title(provinceName(province, lang))} wide>
      {!data ? (
        <Loading error={dataError} />
      ) : (
        <section className="grid gap-3 sm:grid-cols-3">
          {days.map((d, i) => {
            const k = rainClass(d.rain)
            return (
              <div key={d.date} className="flex flex-col gap-1 rounded-[18px] bg-card p-5">
                <span className="text-[15px] font-semibold text-muted">{dayNames[i] ?? d.date}</span>
                <span className="text-[22px] font-bold" style={{ color: k >= 0 ? RAIN_CLASSES[k].color : undefined }}>
                  {k >= 0 ? m.rain.classes[k] : m.rain.none}
                </span>
                <span>
                  {m.common.mm(d.rain.toFixed(1))} · {d.chance}%
                </span>
                <span className="text-[15px] text-muted">
                  {m.weatherCodes[weatherKind(d.code)]} · {m.weather.wind(Math.round(d.wind))}
                </span>
              </div>
            )
          })}
        </section>
      )}
      <p className="-mt-3 text-sm text-faint">{m.weather.forecastNote}</p>

      <section className="flex flex-col gap-3">
        <SectionTitle
          icon="radar"
          hue="teal"
          action={
            <button
              onClick={() => setFrame(frame === null ? 0 : null)}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-full border border-line px-4 text-[15px] font-semibold"
            >
              <Icon name={frame === null ? 'forward' : 'minus'} size={16} />
              {frame === null ? m.weather.play : m.weather.stop}
            </button>
          }
        >
          {m.weather.radar}
        </SectionTitle>
        <MapBox className="h-[58vh] min-h-[380px]">
          <MapView
            bounds={province.bbox as [number, number, number, number]}
            pitch={30}
            bearing={0}
            onMap={(map) => {
              mapRef.current = map
              map.setMaxZoom(10)
            }}
            onStyle={(map) => drawRef.current(map)}
          />
          {shown && (
            <span className="absolute bottom-3 left-3 rounded-full bg-card/95 px-3 py-1.5 text-[14px] font-semibold shadow">
              {m.weather.radarTime(clock(shown.time * 1000, locale))}
            </span>
          )}
        </MapBox>
        <p className="text-sm text-faint">RainViewer</p>
      </section>

      {hourly.length > 0 && (
        <section className="flex flex-col gap-3">
          <SectionTitle icon="cloud" hue="blue">
            {m.weather.hourly}
          </SectionTitle>
          <div className="rounded-[18px] bg-card p-5">
            <div className="flex h-28 items-end gap-[2px]">
              {hourly.map(([t, mm, chance]) => (
                <span
                  key={t}
                  title={`${clock(t, locale)} · ${mm} mm · ${chance}%`}
                  className="flex-1 rounded-t-[2px]"
                  style={{ height: `${Math.max(2, ((mm ?? 0) / max) * 100)}%`, background: (mm ?? 0) > 0 ? '#0a84ff' : 'var(--hairline)', opacity: 0.35 + (chance ?? 0) / 150 }}
                />
              ))}
            </div>
            <div className="mt-1 flex justify-between text-xs text-faint">
              {[0, 12, 24, 36].map((i) => (
                <span key={i}>{hourly[i] ? clock(hourly[i][0], locale) : ''}</span>
              ))}
            </div>
          </div>
        </section>
      )}
    </SectionPage>
  )
}
