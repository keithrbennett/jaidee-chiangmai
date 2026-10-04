import type { LngLatLike, Map as MlMap, Popup } from 'maplibre-gl'

/**
 * Map popups built as DOM nodes, never HTML strings: station and place names come from outside sources.
 */
export interface PopupContent {
  title: string
  /** Coloured label above the title, e.g. a status. */
  badge?: { text: string; color: string }
  lines?: (string | null | undefined | false)[]
  image?: string
  link?: { href: string; text: string; external?: boolean }
  /** Extra buttons (e.g. "still flooded"). */
  actions?: { text: string; onClick: () => void }[]
}

export function popupNode(c: PopupContent) {
  const root = document.createElement('div')
  root.className = 'jd-popup'
  if (c.badge) {
    const b = document.createElement('span')
    b.className = 'jd-popup-badge'
    b.style.background = c.badge.color
    b.textContent = c.badge.text
    root.append(b)
  }
  const h = document.createElement('div')
  h.className = 'jd-popup-title'
  h.textContent = c.title
  root.append(h)
  for (const line of c.lines ?? []) {
    if (!line) continue
    const p = document.createElement('div')
    p.className = 'jd-popup-line'
    p.textContent = line
    root.append(p)
  }
  if (c.image) {
    const img = document.createElement('img')
    img.src = c.image
    img.alt = ''
    img.className = 'jd-popup-img'
    root.append(img)
  }
  if (c.actions?.length) {
    const row = document.createElement('div')
    row.className = 'jd-popup-actions'
    for (const a of c.actions) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.textContent = a.text
      btn.onclick = a.onClick
      row.append(btn)
    }
    root.append(row)
  }
  if (c.link) {
    const a = document.createElement('a')
    a.href = c.link.href
    a.textContent = c.link.text
    a.className = 'jd-popup-link'
    if (c.link.external) {
      a.target = '_blank'
      a.rel = 'noreferrer'
    }
    root.append(a)
  }
  return root
}

let current: Popup | null = null
/** MapLibre is imported lazily so it stays out of the main bundle; a map that is clicked has loaded it already. */
export function openPopup(map: MlMap, at: LngLatLike, content: PopupContent) {
  void import('maplibre-gl').then(({ default: maplibregl }) => {
    current?.remove()
    current = new maplibregl.Popup({ maxWidth: '300px', offset: 10 }).setLngLat(at).setDOMContent(popupNode(content)).addTo(map)
  })
}

/** Pointer cursor over clickable layers. */
export function clickable(map: MlMap, layers: string[]) {
  for (const id of layers) {
    map.on('mouseenter', id, () => (map.getCanvas().style.cursor = 'pointer'))
    map.on('mouseleave', id, () => (map.getCanvas().style.cursor = ''))
  }
}
