// Alerts to phones and computers (Web Push). Every 5 minutes the warning engine runs; each alert that is new
// (or has gone up a level) goes to the browsers subscribed to that province and hazard, in their language.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import webpush from 'web-push'
import { computeAlerts } from './alerts.js'
import { DATA_DIR, all, get, run } from './db.js'
import { PROVINCES } from './lib/geo.js'
import { cached } from './lib/util.js'

const VAPID_FILE = `${DATA_DIR.replace(/\/$/, '')}/vapid.json`
function vapidKeys() {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY }
  }
  if (existsSync(VAPID_FILE)) return JSON.parse(readFileSync(VAPID_FILE, 'utf8'))
  const keys = webpush.generateVAPIDKeys()
  writeFileSync(VAPID_FILE, JSON.stringify(keys), { mode: 0o600 })
  return keys
}
const keys = vapidKeys()
webpush.setVapidDetails(process.env.VAPID_SUBJECT ?? 'mailto:alerts@jaidee.invalid', keys.publicKey, keys.privateKey)
export const vapidPublicKey = keys.publicKey

/** The current alerts, recomputed at most every 5 minutes. */
export const alerts = cached('alerts', computeAlerts, 5 * 60_000)

export const HAZARDS = ['flood', 'rain', 'landslide', 'air', 'fire', 'quake', 'tsunami']

const byCode = new Map(PROVINCES.map((p) => [p.code, p]))
const LEVEL = {
  th: ['', 'เฝ้าระวัง', 'เตือนภัย', 'อันตราย'],
  en: ['', 'Watch', 'Warning', 'Danger'],
  zh: ['', '注意', '警告', '危险'],
}

/** Notification text for one alert in one language. The page shows the full detail. */
export function alertText(a, lang) {
  const L = LEVEL[lang] ?? LEVEL.th
  const p = byCode.get(a.provinces[0])
  const name = p ? (lang === 'th' ? p.th : p.en) : ''
  const d = a.data
  const t = {
    th: {
      flood: a.kind === 'satellite' ? `ดาวเทียมพบพื้นที่น้ำท่วมราว ${d.km2} ตร.กม. ใน 7 วัน` : d.maxOver ? `${d.station}: น้ำสูงกว่าตลิ่ง ${d.maxOver.toFixed(2)} ม.` : `${d.station}: น้ำใกล้ตลิ่ง`,
      rain: d.measured >= 90.1 ? `ฝนหนักมาก ${d.measured} มม. ใน 24 ชม. ที่${d.place}` : `คาดว่าฝนจะตก ${d.next} มม. ใน 24 ชม. ข้างหน้า`,
      landslide: `ฝนสะสม ${d.measured} มม. ระวังดินถล่มและน้ำป่าในที่ลาดชันและเชิงเขา`,
      air: d.aqi > 100 ? `ฝุ่นสูง AQI ${d.aqi} ที่${d.station}` : `คาดว่าพรุ่งนี้ PM2.5 ราว ${d.forecastPm25} มคก./ลบ.ม.`,
      fire: `ดาวเทียมพบจุดความร้อน ${d.count} จุด ใน 24 ชม.`,
      quake: `แผ่นดินไหวขนาด ${d.mag} ${d.place ?? ''} ห่างราว ${d.distance} กม.`,
      tsunami: `แผ่นดินไหวขนาด ${d.mag} ในทะเล ติดตามประกาศศูนย์เตือนภัยพิบัติแห่งชาติ และอยู่ห่างชายฝั่ง`,
    },
    en: {
      flood: a.kind === 'satellite' ? `Satellite sees about ${d.km2} km² of flooding in 7 days` : d.maxOver ? `${d.station}: ${d.maxOver.toFixed(2)} m over the bank` : `${d.station}: near the bank`,
      rain: d.measured >= 90.1 ? `Very heavy rain: ${d.measured} mm in 24 h at ${d.place}` : `About ${d.next} mm of rain expected in the next 24 h`,
      landslide: `${d.measured} mm of rain: watch for landslides and flash floods on slopes and foothills`,
      air: d.aqi > 100 ? `High dust: AQI ${d.aqi} at ${d.station}` : `PM2.5 around ${d.forecastPm25} µg/m³ expected tomorrow`,
      fire: `${d.count} fire hotspots seen by satellite in 24 h`,
      quake: `Magnitude ${d.mag} earthquake, ${d.place ?? ''}, about ${d.distance} km away`,
      tsunami: `Magnitude ${d.mag} earthquake at sea: follow the National Disaster Warning Center and keep away from the shore`,
    },
    zh: {
      flood: a.kind === 'satellite' ? `卫星 7 天内发现约 ${d.km2} 平方公里淹水` : d.maxOver ? `${d.station}：高出河岸 ${d.maxOver.toFixed(2)} 米` : `${d.station}：接近河岸`,
      rain: d.measured >= 90.1 ? `暴雨：${d.place} 24 小时 ${d.measured} 毫米` : `预计未来 24 小时降雨约 ${d.next} 毫米`,
      landslide: `累计降雨 ${d.measured} 毫米：山坡和山脚注意山体滑坡和山洪`,
      air: d.aqi > 100 ? `粉尘高：${d.station} AQI ${d.aqi}` : `预计明天 PM2.5 约 ${d.forecastPm25} 微克/立方米`,
      fire: `卫星 24 小时内发现 ${d.count} 个热点`,
      quake: `${d.mag} 级地震，${d.place ?? ''}，距离约 ${d.distance} 公里`,
      tsunami: `海上发生 ${d.mag} 级地震：请关注国家灾害预警中心公告，远离海岸`,
    },
  }[lang] ?? {}
  const hazardName = {
    th: { flood: 'น้ำท่วม', rain: 'ฝนตกหนัก', landslide: 'ดินถล่ม', air: 'ฝุ่น PM2.5', fire: 'ไฟป่า', quake: 'แผ่นดินไหว', tsunami: 'สึนามิ' },
    en: { flood: 'Flood', rain: 'Heavy rain', landslide: 'Landslide', air: 'Dust PM2.5', fire: 'Fire', quake: 'Earthquake', tsunami: 'Tsunami' },
    zh: { flood: '洪水', rain: '暴雨', landslide: '山体滑坡', air: 'PM2.5 粉尘', fire: '火灾', quake: '地震', tsunami: '海啸' },
  }[lang]?.[a.hazard]
  const where = a.provinces.length > 1 ? '' : ` · ${name}`
  return { title: `${L[a.level]}: ${hazardName}${where}`, body: t[a.hazard] ?? '', url: p && a.provinces.length === 1 ? `/#/p/${p.slug}` : '/#/alerts' }
}

/** Send what's new. The first run after a fresh install only records what's already active. */
async function tick() {
  const list = await alerts.get()
  if (!list) return
  const baseline = !get('SELECT 1 FROM sent_alerts LIMIT 1')
  const subs = baseline ? [] : all('SELECT * FROM push_subscriptions')
  for (const a of list) {
    if (get('SELECT 1 FROM sent_alerts WHERE id = ? AND level >= ?', a.id, a.level)) continue
    run('INSERT OR REPLACE INTO sent_alerts (id, level, sent_at) VALUES (?, ?, ?)', a.id, a.level, Date.now())
    for (const s of subs) {
      const provinces = JSON.parse(s.provinces)
      const hazards = JSON.parse(s.hazards)
      if (a.level < s.min_level || !hazards.includes(a.hazard) || !a.provinces.some((p) => provinces.includes(p))) continue
      const msg = alertText(a, s.lang)
      webpush
        .sendNotification({ endpoint: s.endpoint, keys: JSON.parse(s.keys) }, JSON.stringify({ ...msg, tag: a.id, level: a.level }), { TTL: 6 * 3600 })
        .catch((err) => {
          // Gone or expired: forget the subscription.
          if (err.statusCode === 404 || err.statusCode === 410) run('DELETE FROM push_subscriptions WHERE endpoint = ?', s.endpoint)
        })
    }
  }
  run('DELETE FROM sent_alerts WHERE sent_at < ?', Date.now() - 14 * 864e5)
}

export function startPush() {
  const go = () => tick().catch((err) => console.error('push tick failed:', err.message))
  setTimeout(go, 15_000)
  setInterval(go, 5 * 60_000)
}
