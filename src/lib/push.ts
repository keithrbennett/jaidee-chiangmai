import { api } from './api'

/** Web Push on the client: register the service worker, subscribe, and tell the server what to send. */

export interface AlertPrefs {
  provinces: string[]
  hazards: string[]
  minLevel: 1 | 2 | 3
}

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
/** iPhone/iPad only allow push from a site added to the Home Screen. */
export const needsHomeScreen = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone)

function urlBase64ToUint8Array(base64: string) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (c) => c.charCodeAt(0))
}

async function registration() {
  return navigator.serviceWorker.register('/sw.js')
}

export async function currentSubscription() {
  if (!pushSupported()) return null
  const reg = await navigator.serviceWorker.getRegistration('/sw.js')
  return (await reg?.pushManager.getSubscription()) ?? null
}

/** Ask permission (if needed), subscribe this browser and save the preferences. Returns false if refused. */
export async function subscribe(prefs: AlertPrefs, lang: string) {
  if ((await Notification.requestPermission()) !== 'granted') return false
  const reg = await registration()
  await navigator.serviceWorker.ready
  const { key } = await api<{ key: string }>('/push/key')
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) }))
  await api('/push/subscribe', { body: { subscription: sub.toJSON(), ...prefs, lang } })
  return true
}

export async function unsubscribe() {
  const sub = await currentSubscription()
  if (!sub) return
  await api('/push/unsubscribe', { body: { endpoint: sub.endpoint } }).catch(() => {})
  await sub.unsubscribe()
}
