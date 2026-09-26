import L from 'leaflet'
import { useEffect } from 'react'
import { CircleMarker, MapContainer, Marker, TileLayer, Tooltip, useMap } from 'react-leaflet'
import { useI18n } from '../i18n'
import { CATEGORY_ICONS } from '../lib/categories'
import { iconSvg } from '../lib/icons'
import { CHIANG_MAI_CENTER, type LatLng } from '../lib/geo'
import type { Need } from '../types'

interface Props {
  needs: Need[]
  selectedId: string | null
  onSelect: (id: string) => void
  userLocation: LatLng
  onCenterChange?: (center: LatLng) => void
}

function pinIcon(need: Need, selected: boolean) {
  const classes = ['need-pin', need.urgent ? 'urgent' : '', selected ? 'selected' : ''].join(' ')
  return L.divIcon({
    className: '',
    html: `<div class="${classes}">${iconSvg(CATEGORY_ICONS[need.category])}</div>`,
    iconSize: [38, 38],
    iconAnchor: [19, 19],
  })
}

/** Pans to the selected need and reports the map centre (used when posting a new need). */
function MapController({ selected, onCenterChange }: { selected?: Need; onCenterChange?: (c: LatLng) => void }) {
  const map = useMap()
  useEffect(() => {
    if (!selected) return
    // The map may have just been un-hidden (phones): measure first, and don't animate from a 0×0 size.
    map.invalidateSize()
    const target: [number, number] = [selected.lat, selected.lng]
    const zoom = Math.max(map.getZoom(), 14)
    const { x, y } = map.getSize()
    if (x === 0 || y === 0) map.setView(target, zoom, { animate: false })
    else map.flyTo(target, zoom, { duration: 0.6 })
  }, [map, selected])
  // Leaflet measures its container once; re-measure when it changes size or is shown again (phones hide the map on some tabs).
  useEffect(() => {
    const observer = new ResizeObserver(() => map.invalidateSize())
    observer.observe(map.getContainer())
    return () => observer.disconnect()
  }, [map])
  useEffect(() => {
    if (!onCenterChange) return
    const report = () => onCenterChange(map.getCenter())
    report()
    map.on('moveend', report)
    return () => {
      map.off('moveend', report)
    }
  }, [map, onCenterChange])
  return null
}

export function NeedMap({ needs, selectedId, onSelect, userLocation, onCenterChange }: Props) {
  const { m } = useI18n()
  const selected = needs.find((n) => n.id === selectedId)
  return (
    <MapContainer center={[CHIANG_MAI_CENTER.lat, CHIANG_MAI_CENTER.lng]} zoom={13} className="h-full w-full">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <CircleMarker
        center={[userLocation.lat, userLocation.lng]}
        radius={8}
        pathOptions={{ color: '#1F1B16', weight: 3, fillColor: '#FFFFFF', fillOpacity: 1 }}
      >
        <Tooltip>{m.map.youAreHere}</Tooltip>
      </CircleMarker>
      {needs.map((n) => (
        <Marker
          key={n.id}
          position={[n.lat, n.lng]}
          icon={pinIcon(n, n.id === selectedId)}
          zIndexOffset={n.id === selectedId ? 1000 : n.urgent ? 500 : 0}
          eventHandlers={{ click: () => onSelect(n.id) }}
        >
          <Tooltip direction="top" offset={[0, -16]}>
            {n.title.en}
          </Tooltip>
        </Marker>
      ))}
      <MapController selected={selected} onCenterChange={onCenterChange} />
    </MapContainer>
  )
}
