import { useSyncExternalStore } from 'react'
import type { Lang } from '../i18n'
import type { MapMode } from './map/modes'
import { href, navigate, provinceByCode, provinceHref, type Section } from './router'

/**
 * น้องใจดี in the browser: one conversation per tab (sessionStorage), opened from anywhere with
 * `openAssistant`, streamed from POST /api/assistant (server-sent events, see server/ai/assistant.js).
 * Location is kept in memory only and sent with a question only after the person turns it on.
 */

export interface ChatButton {
  label: string
  action: 'call' | 'page'
  number?: string
  page?: string
  province?: string
  topic?: string
  mode?: string
}

export interface HelpDraft {
  province: string
  people: number
  vulnerable: string[]
  needs: string[]
  waterLevel: number | null
  phone: string | null
  name: string | null
  place: string | null
  noteTh: string
  noteOriginal: string | null
  language: string | null
  location: [number, number] | null
  centerOpen: boolean
  hotline: string | null
}

/** A water report น้องใจดี prepared from the chat (often from a photo), for the person to check and send. */
export interface ReportDraft {
  level: number
  trend: 'rising' | 'steady' | 'falling' | null
  passable: 'car' | 'high' | 'boat' | null
  note: string | null
  usePhoto: boolean
  confidence: 'high' | 'medium' | 'low' | null
  location: [number, number] | null
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  /** A photo sent with a question (JPEG data URL). */
  image?: string
  buttons?: ChatButton[]
  /** Web pages the reply used. */
  sources?: { url: string; title: string | null }[]
  report?: ReportDraft
  guides?: string[]
  draft?: HelpDraft
  /** Answered without the model (no key, or Claude unreachable). */
  basic?: boolean
  error?: 'failed' | 'busy'
  done?: boolean
}

export interface AssistantState {
  open: boolean
  messages: ChatMessage[]
  busy: boolean
  /** The lookup under way, for the "checking Chiang Mai…" line. */
  status: { tool: string; province?: string } | null
  location: [number, number] | null
  /** The province page the person is on, so "here" means something. */
  province: string | null
  page: Section | null
  /** null until the server has said. */
  ai: boolean | null
}

const KEY = 'jaidee.chat'
const listeners = new Set<() => void>()
let controller: AbortController | null = null

function load(): ChatMessage[] {
  try {
    const saved = JSON.parse(sessionStorage.getItem(KEY) ?? '[]') as ChatMessage[]
    return Array.isArray(saved) ? saved.map((m) => ({ ...m, done: true })) : []
  } catch {
    return []
  }
}

let state: AssistantState = { open: false, messages: load(), busy: false, status: null, location: null, province: null, page: null, ai: null }

function set(patch: Partial<AssistantState>) {
  state = { ...state, ...patch }
  if ('messages' in patch) {
    try {
      // Photos are big: keep only the newest one across reloads.
      const lastPhoto = state.messages.findLastIndex((x) => x.image)
      const keep = state.messages.slice(-30).map((x) => (x.image && state.messages.indexOf(x) !== lastPhoto ? { ...x, image: undefined } : x))
      sessionStorage.setItem(KEY, JSON.stringify(keep))
    } catch {
      // Private mode or full storage: the chat just won't survive a reload.
    }
  }
  for (const l of listeners) l()
}

const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}
export const useAssistant = () => useSyncExternalStore(subscribe, () => state)

const uid = () => Math.random().toString(36).slice(2, 10)

export function openAssistant(opts: { text?: string; lang?: Lang } = {}) {
  set({ open: true })
  if (opts.text?.trim() && opts.lang) void sendMessage(opts.text, opts.lang)
}
export const closeAssistant = () => set({ open: false })
export const setAssistantContext = (province: string | null, page: Section | null) => {
  if (province !== state.province || page !== state.page) set({ province, page })
}
export const setAssistantLocation = (location: [number, number] | null) => set({ location })

/** Stop the reply being written. */
export const stopReply = () => controller?.abort()

/** A reply as plain text, for reading aloud. */
export const plainText = (text: string) => text.replace(/\*\*/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/^\s*[-•*]\s+/gm, '')

export function resetChat() {
  controller?.abort()
  set({ messages: [], busy: false, status: null })
}

/** Ask whether the model is connected (shown as "basic mode" when not). */
export async function checkAssistantMode() {
  if (state.ai !== null) return
  try {
    const res = await fetch('/api/assistant/status')
    const body = (await res.json()) as { ai: boolean }
    set({ ai: body.ai })
  } catch {
    // Unknown: say nothing.
  }
}

function patchReply(id: string, fn: (m: ChatMessage) => ChatMessage) {
  set({ messages: state.messages.map((m) => (m.id === id ? fn(m) : m)) })
}

type ServerEvent =
  | { type: 'mode'; ai: boolean }
  | { type: 'text'; delta: string }
  | { type: 'status'; tool: string; province?: string }
  | { type: 'buttons'; buttons: ChatButton[] }
  | { type: 'guide'; topic: string }
  | { type: 'draft'; draft: HelpDraft }
  | { type: 'report'; draft: ReportDraft }
  | { type: 'source'; url: string; title: string | null }
  | { type: 'error' }
  | { type: 'done' }

export async function sendMessage(text: string, lang: Lang, image: string | null = null) {
  const question = text.trim()
  if ((!question && !image) || state.busy) return
  const reply: ChatMessage = { id: uid(), role: 'assistant', text: '' }
  const asked: ChatMessage = { id: uid(), role: 'user', text: question, done: true, ...(image ? { image } : {}) }
  set({ messages: [...state.messages, asked, reply], busy: true, status: null })
  const turns = state.messages
    .filter((m) => m.id !== reply.id && !m.error && (m.text.trim() || m.image))
    .slice(-16)
    // Only the new question carries its photo; earlier ones are just mentioned.
    .map((m) => ({ role: m.role, text: m.text, ...(m === asked && image ? { image } : m.image ? { hadImage: true } : {}) }))
  controller = new AbortController()
  try {
    const res = await fetch('/api/assistant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: turns, lang, province: state.province, page: state.page, location: state.location }),
      signal: controller.signal,
    })
    if (res.status === 429) throw new Error('busy')
    if (!res.ok || !res.body) throw new Error(String(res.status))
    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader()
    let buffer = ''
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += value
      let cut
      while ((cut = buffer.indexOf('\n\n')) >= 0) {
        const chunk = buffer.slice(0, cut)
        buffer = buffer.slice(cut + 2)
        for (const line of chunk.split('\n')) if (line.startsWith('data: ')) handle(reply.id, JSON.parse(line.slice(6)) as ServerEvent)
      }
    }
  } catch (err) {
    if ((err as Error).name !== 'AbortError') patchReply(reply.id, (m) => ({ ...m, error: (err as Error).message === 'busy' ? 'busy' : 'failed' }))
  } finally {
    controller = null
    patchReply(reply.id, (m) => ({ ...m, done: true }))
    set({ busy: false, status: null })
  }
}

function handle(id: string, ev: ServerEvent) {
  switch (ev.type) {
    case 'mode':
      set({ ai: ev.ai })
      if (!ev.ai) patchReply(id, (m) => ({ ...m, basic: true }))
      break
    case 'text':
      patchReply(id, (m) => ({ ...m, text: m.text + ev.delta }))
      if (state.status) set({ status: null })
      break
    case 'status':
      set({ status: { tool: ev.tool, province: ev.province } })
      break
    case 'buttons':
      patchReply(id, (m) => ({ ...m, buttons: [...(m.buttons ?? []), ...ev.buttons].slice(0, 6) }))
      break
    case 'guide':
      patchReply(id, (m) => ({ ...m, guides: [...new Set([...(m.guides ?? []), ev.topic])] }))
      break
    case 'draft':
      patchReply(id, (m) => ({ ...m, draft: ev.draft }))
      break
    case 'report':
      patchReply(id, (m) => ({ ...m, report: ev.draft }))
      break
    case 'source':
      patchReply(id, (m) => ({ ...m, sources: [...(m.sources ?? []), { url: ev.url, title: ev.title }].slice(0, 6) }))
      break
    case 'error':
      patchReply(id, (m) => ({ ...m, error: 'failed' }))
      break
  }
}

const PROVINCE_PAGES: Record<string, Section | null> = {
  province: null,
  province_map: 'map',
  weather: 'weather',
  report: 'report',
  updates: 'updates',
  help: 'help',
  missing: 'missing',
  lost_found: 'lost-found',
  cctv: 'cctv',
  area: 'area',
}

/** Where a chat button goes: tel: for calls, a hash route for pages. */
export function buttonHref(b: ChatButton): string | null {
  if (b.action === 'call') return b.number ? `tel:${b.number}` : null
  if (b.page && b.page in PROVINCE_PAGES) {
    const p = b.province ? provinceByCode.get(b.province) : undefined
    return p ? provinceHref(p, PROVINCE_PAGES[b.page]) : null
  }
  switch (b.page) {
    case 'home':
      return href({ name: 'home' })
    case 'map':
      return href({ name: 'map', mode: b.mode as MapMode | undefined })
    case 'alerts':
      return href({ name: 'alerts' })
    case 'provinces':
      return href({ name: 'provinces' })
    case 'guide':
      return href({ name: 'guide', topic: b.topic ?? null })
    case 'volunteer':
      return href({ name: 'volunteer' })
    case 'simulator':
      return href({ name: 'flood' })
    default:
      return null
  }
}

const DRAFT_KEY = 'jaidee.helpDraft'
/** Hand a drafted help request to the province's help form, and go there. */
export function openDraft(d: HelpDraft) {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d))
  } catch {
    // The form will just open empty.
  }
  const p = provinceByCode.get(d.province)
  if (p) navigate({ name: 'province', province: p, section: 'help' })
  if (window.innerWidth < 768) closeAssistant()
}
/** The draft waiting for this province's help form (read during render; clear it with clearDraft). */
export function readDraft(province: string): HelpDraft | null {
  try {
    const d = JSON.parse(sessionStorage.getItem(DRAFT_KEY) ?? 'null') as HelpDraft | null
    return d && d.province === province ? d : null
  } catch {
    return null
  }
}
export function clearDraft() {
  try {
    sessionStorage.removeItem(DRAFT_KEY)
  } catch {
    // Nothing to clear.
  }
}
