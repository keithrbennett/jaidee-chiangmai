import { useEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import { PROVINCES, type Province } from '../data/provinces'
import type { MapMode } from './map/modes'

const MAP_MODES = ['water', 'rain', 'air', 'fire', 'quake']

/**
 * Hash router. Hash URLs work on the Vite dev server, `vite preview` and the Express server without any
 * fallback config, and every screen gets a link you can share.
 *
 *   #/                              Thailand overview
 *   #/map  #/map/<mode>             national 3D map, optionally opened on water | rain | air | fire | quake;
 *                                   ?p=<slug> opens that province's panel
 *   #/alerts                        alerts by our warning rules, and alert notifications
 *   #/provinces                     choose a province
 *   #/p/<slug>                      a province: water now, forecast, what to do
 *   #/p/<slug>/<section>            map | weather | area | report | updates | lost-found | missing | help | open | cctv | contacts
 *   #/help/<code>                   progress on a help request
 *   #/flood  #/flood/<slug>         flood simulator 3D, for any province
 *   #/guide  #/guide/<topic>        safety guides (src/data/guides.json)
 *   #/volunteer  #/need/<id>  #/tasks  #/post     volunteering (Jaidee)
 *   #/command                       command centre (staff)
 *   #/track/<token>                 a rescue team's phone sharing its location
 *   #/sources  #/about
 */
export const SECTIONS = ['map', 'weather', 'area', 'report', 'updates', 'lost-found', 'missing', 'help', 'open', 'cctv', 'contacts'] as const
export type Section = (typeof SECTIONS)[number]

export type Route =
  | { name: 'home' }
  | { name: 'map'; mode?: MapMode; province?: Province }
  | { name: 'alerts' }
  | { name: 'provinces' }
  | { name: 'province'; province: Province; section: Section | null }
  | { name: 'helpStatus'; code: string }
  | { name: 'flood'; province?: Province }
  | { name: 'guide'; topic: string | null }
  | { name: 'volunteer' }
  | { name: 'need'; id: string }
  | { name: 'tasks' }
  | { name: 'post' }
  | { name: 'command' }
  | { name: 'track'; token: string }
  | { name: 'sources' }
  | { name: 'about' }

/** Top-level areas, for the navigation highlight. */
export type Tab = 'home' | 'map' | 'alerts' | 'provinces' | 'volunteer' | 'flood' | 'more'

const bySlug = new Map(PROVINCES.map((p) => [p.slug, p]))
export const provinceByCode = new Map(PROVINCES.map((p) => [p.code, p]))

export function parseHash(hash: string): Route {
  const [path, query = ''] = hash.replace(/^#/, '').split('?')
  const params = new URLSearchParams(query)
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent)
  const [a, b, c] = parts
  switch (a) {
    case 'map': {
      const province = bySlug.get(params.get('p') ?? '')
      return { name: 'map', ...(MAP_MODES.includes(b) ? { mode: b as MapMode } : {}), ...(province ? { province } : {}) }
    }
    case 'alerts':
      return { name: 'alerts' }
    case 'provinces':
      return { name: 'provinces' }
    case 'p': {
      const province = b ? bySlug.get(b) : undefined
      if (!province) return { name: 'provinces' }
      return { name: 'province', province, section: (SECTIONS as readonly string[]).includes(c) ? (c as Section) : null }
    }
    case 'help':
      return b ? { name: 'helpStatus', code: b.toUpperCase() } : { name: 'home' }
    case 'flood': {
      const province = b ? bySlug.get(b) : undefined
      return province ? { name: 'flood', province } : { name: 'flood' }
    }
    case 'guide':
      return { name: 'guide', topic: b ?? null }
    case 'volunteer':
    case 'find':
      return { name: 'volunteer' }
    case 'need':
      return b ? { name: 'need', id: b } : { name: 'volunteer' }
    case 'tasks':
      return { name: 'tasks' }
    case 'post':
      return { name: 'post' }
    case 'command':
      return { name: 'command' }
    case 'track':
      return b ? { name: 'track', token: b } : { name: 'home' }
    case 'sources':
      return { name: 'sources' }
    case 'about':
      return { name: 'about' }
    default:
      return { name: 'home' }
  }
}

export function href(route: Route): string {
  switch (route.name) {
    case 'home':
      return '#/'
    case 'map':
      return `#/map${route.mode ? `/${route.mode}` : ''}${route.province ? `?p=${route.province.slug}` : ''}`
    case 'guide':
      return route.topic ? `#/guide/${route.topic}` : '#/guide'
    case 'flood':
      return route.province ? `#/flood/${route.province.slug}` : '#/flood'
    case 'province':
      return `#/p/${route.province.slug}${route.section ? `/${route.section}` : ''}`
    case 'helpStatus':
      return `#/help/${route.code}`
    case 'need':
      return `#/need/${encodeURIComponent(route.id)}`
    case 'track':
      return `#/track/${route.token}`
    default:
      return `#/${route.name}`
  }
}

export const provinceHref = (province: Province, section: Section | null = null) => href({ name: 'province', province, section })

export function tabOf(route: Route): Tab {
  switch (route.name) {
    case 'home':
    case 'map':
    case 'alerts':
    case 'flood':
      return route.name
    case 'provinces':
    case 'province':
    case 'helpStatus':
      return 'provinces'
    case 'volunteer':
    case 'need':
    case 'tasks':
    case 'post':
      return 'volunteer'
    default:
      return 'more'
  }
}

export function navigate(route: Route, { replace = false } = {}) {
  const next = href(route)
  if (window.location.hash === next) return
  if (replace) {
    window.history.replaceState(null, '', next)
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  } else {
    window.location.hash = next
  }
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(window.location.hash))
  useEffect(() => {
    const onChange = () => {
      const swap = () => {
        flushSync(() => setRoute(parseHash(window.location.hash)))
        window.scrollTo({ top: 0 })
      }
      // Page changes cross-fade with a small lift (CSS: ::view-transition-*), where the browser can and the
      // person hasn't asked for less motion.
      const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      if (document.startViewTransition && !still && !document.hidden) document.startViewTransition(swap)
      else swap()
    }
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}
