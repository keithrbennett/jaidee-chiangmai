import { useEffect, useState } from 'react'
import type { Category } from '../types'
import { CATEGORIES } from './categories'

/**
 * Tiny hash router. Hash URLs work on the Vite dev server, `vite preview` and the Express
 * server without any fallback config, and every screen gets a link you can share or bookmark.
 *
 *   #/                     list + map
 *   #/?cat=school          list filtered by category
 *   #/need/<id>            one need
 *   #/tasks                my tasks
 *   #/post                 partner: post a need
 *   #/about                how it works
 */
export type Route =
  | { name: 'map'; category: Category | 'all' }
  | { name: 'need'; id: string }
  | { name: 'tasks' }
  | { name: 'post' }
  | { name: 'about' }

export type Tab = 'map' | 'tasks' | 'post' | 'about'

export function parseHash(hash: string): Route {
  const [path, query = ''] = hash.replace(/^#/, '').split('?')
  const parts = path.split('/').filter(Boolean)
  if (parts[0] === 'need' && parts[1]) return { name: 'need', id: decodeURIComponent(parts[1]) }
  if (parts[0] === 'tasks') return { name: 'tasks' }
  if (parts[0] === 'post') return { name: 'post' }
  if (parts[0] === 'about') return { name: 'about' }
  const cat = new URLSearchParams(query).get('cat')
  return { name: 'map', category: cat && cat in CATEGORIES ? (cat as Category) : 'all' }
}

export function href(route: Route): string {
  switch (route.name) {
    case 'map':
      return route.category === 'all' ? '#/' : `#/?cat=${route.category}`
    case 'need':
      return `#/need/${encodeURIComponent(route.id)}`
    default:
      return `#/${route.name}`
  }
}

/** The top-level tab a route belongs to (a need detail lives under "Find a need"). */
export function tabOf(route: Route): Tab {
  return route.name === 'need' ? 'map' : route.name
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
    const onChange = () => setRoute(parseHash(window.location.hash))
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return route
}
