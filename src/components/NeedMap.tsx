import L from 'leaflet'
import { useEffect } from 'react'
import { CircleMarker, MapContainer, Marker, TileLayer, Tooltip, useMap } from 'react-leaflet'
import { CATEGORIES } from '../lib/categories'
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
  const cat = CATEGORIES[need.category]
  const classes = ['need-pin', need.urgent ? 'urgent' : '', selected ? 'selected' : ''].join(' ')
  return L.divIcon({
    className: '',
    html: `<div class="${classes}" style="background:${cat.color}">${cat.emoji}</div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  })
}

/** Pans to the selected need and reports the map centre (used when posting a new need). */
function MapController({ selected, onCenterChange }: { selected?: Need; onCenterChange?: (c: LatLng) => void }) {
  const map = useMap()
  useEffect(() => {
    if (selected) map.flyTo([selected.lat, selected.lng], Math.max(map.getZoom(), 14), { duration: 0.6 })
  }, [map, selected])
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
        pathOptions={{ color: '#1d4ed8', fillColor: '#3b82f6', fillOpacity: 0.9 }}
      >
        <Tooltip>You are here</Tooltip>
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
