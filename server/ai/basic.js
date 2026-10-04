// น้องใจดี without a model (no API key, the day's budget spent, or Claude unreachable): recognise what the
// person wants from keywords in Thai, English or Chinese, answer from live data and the guides, and give
// the same one-tap buttons. Less clever, never silent.
import { get } from '../db.js'
import { PROVINCES } from '../lib/geo.js'
import { GUIDES, nearbySummary, placeAt, provinceName, provinceSummary } from './context.js'

const has = (re, text) => re.test(text)
const EMERGENCY = /(ช่วยด้วย|ช่วยที|ติดอยู่|ติดค้าง|จมน้ำ|หมดสติ|บาดเจ็บ|ไม่หายใจ|หายใจไม่ออก|เลือดออก|ฉุกเฉิน|ไฟไหม้|น้ำเข้าบ้าน|help me|trapped|drown|injured|emergency|\bsos\b|not breathing|bleeding|救命|被困|溺水|受伤|紧急|着火)/i
const HELP = /(ขอความช่วยเหลือ|ต้องการความช่วยเหลือ|ขอช่วย|ขออาหาร|ขอน้ำ|ขอเรือ|ขอยา|need help|rescue|need food|need water|求助|救援|需要帮助)/i
const MISSING = /(คนหาย|หาคน|ตามหา|พลัดหลง|missing person|missing|失踪|寻人)/i
const LOST = /(ของหาย|สัตว์หาย|หมาหาย|แมวหาย|เก็บได้|lost and found|lost my|found a|丢失|捡到)/i
const REPORT = /(รายงาน|แจ้งระดับน้ำ|แจ้งน้ำท่วม|ส่งรูป|report|上报|报告)/i
const VOLUNTEER = /(อาสา|volunteer|志愿)/i
const ALERTS = /(แจ้งเตือน|เตือนภัย|notify|notification|alert|提醒|预警)/i
const STATUS = /(ท่วมไหม|ท่วมมั้ย|ท่วมหรือยัง|สถานการณ์|ตอนนี้|วันนี้|ระดับน้ำ|น้ำขึ้น|เป็นยังไง|เป็นอย่างไร|ปลอดภัยไหม|เป็นไง|status|situation|how is|how's|now|today|level|safe|情况|现在|今天|水位|安全|怎么样|如何)/i
const HOW = /(ทำยังไง|ทำอย่างไร|ควรทำ|เตรียม|วิธี|how to|how do|what should|prepare|怎么办|怎么做|该做什么|准备)/i

const TOPIC_WORDS = [
  ['tsunami', /(สึนามิ|คลื่นยักษ์|tsunami|海啸)/i],
  ['earthquake', /(แผ่นดินไหว|earthquake|quake|地震)/i],
  ['landslide', /(ดินถล่ม|โคลนถล่ม|ดินสไลด์|landslide|mudslide|滑坡|泥石流)/i],
  ['wildfire', /(ไฟป่า|การเผา|เผาป่า|wildfire|forest fire|burning|山火|焚烧)/i],
  ['pm25', /(ฝุ่น|pm\s?2\.?5|aqi|หมอกควัน|มลพิษ|dust|smog|haze|air quality|雾霾|空气|粉尘)/i],
  ['storm', /(พายุ|ฟ้าผ่า|ลมแรง|storm|lightning|thunder|风暴|雷)/i],
  ['electricity', /(ไฟฟ้า|ไฟดูด|ปลั๊ก|คัตเอาต์|electric|shock|电)/i],
  ['go-bag', /(ถุงยังชีพ|กระเป๋าฉุกเฉิน|ของจำเป็น|go.?bag|emergency kit|应急包)/i],
  ['evacuate', /(อพยพ|หนีน้ำ|ศูนย์พักพิง|evacuat|shelter|撤离|避难)/i],
  ['care', /(ผู้สูงอายุ|คนแก่|ติดเตียง|คนพิการ|สัตว์เลี้ยง|elderly|bedridden|disabled|pets?\b|老人|宠物|残障)/i],
  ['health', /(ฉี่หนู|น้ำกัดเท้า|ท้องเสีย|ท้องร่วง|งูกัด|เครียด|ไข้|health|snake|leptospirosis|diarrh|disease|健康|蛇|腹泻)/i],
  ['flood-after', /(น้ำลด|หลังน้ำ|ทำความสะอาด|after the flood|clean ?up|退水|水退)/i],
  ['flood-before', /(ก่อนน้ำ|เตรียมตัว|เตรียมพร้อม|prepare|before|准备)/i],
  ['flood-during', /(น้ำท่วม|ท่วม|flood|洪水|水灾)/i],
]
const HAZARD_MODE = { pm25: 'air', wildfire: 'fire', earthquake: 'quake', tsunami: 'quake', storm: 'rain', landslide: 'rain' }

const ALIASES = [
  [/(กทม|กรุงเทพ|bangkok|bkk|曼谷)/i, '10'],
  [/(โคราช|korat)/i, '30'],
  [/(อยุธยา|ayutthaya)/i, '14'],
  [/(清迈)/, '50'],
  [/(普吉)/, '83'],
]
/** A province named in the text, if any. */
function provinceIn(text) {
  const lower = text.toLowerCase()
  for (const [re, code] of ALIASES) if (re.test(text)) return code
  const hit = PROVINCES.filter((p) => text.includes(p.th) || lower.includes(p.en.toLowerCase())).sort((a, b) => b.th.length - a.th.length)[0]
  return hit?.code ?? null
}

const T = {
  th: {
    photo: 'ตอนนี้น้องใจดียังดูรูปไม่ได้ (ยังไม่ได้เชื่อม AI) ถ้าเป็นรูปน้ำท่วมตรงที่คุณอยู่ ส่งเป็นรายงานระดับน้ำได้เลย คนอื่นจะได้เห็นบนแผนที่ค่ะ',
    emergency: 'ถ้ามีคนอยู่ในอันตรายตอนนี้ **โทร 1669 (การแพทย์ฉุกเฉิน) หรือ 1784 (ปภ.) ทันที** บอกจุดที่อยู่ให้ชัด จำนวนคน และมีผู้สูงอายุ เด็ก หรือผู้ป่วยไหม\n\nระหว่างรอ ขึ้นที่สูง อย่าลุยน้ำที่ไหลแรง และใช้ไฟฉายหรือผ้าสีสดส่งสัญญาณค่ะ',
    helpOpen: (p) => `${p} เปิดศูนย์ประสานงานแล้ว ส่งคำขอความช่วยเหลือผ่านใจดีได้เลยค่ะ เจ้าหน้าที่จะเห็นทันที ถ้าเร่งด่วนโทร 1784 หรือ 1669 ด้วยนะคะ`,
    helpClosed: (p) => `${p} ยังไม่เปิดรับคำขอผ่านใจดี โทร **1784 (ปภ.)** หรือ **1669** ได้ตลอด 24 ชม. ค่ะ`,
    helpWhere: 'ต้องการความช่วยเหลือที่จังหวัดไหนคะ พิมพ์ชื่อจังหวัด หรือกดใช้ตำแหน่งของฉัน ถ้าเร่งด่วนโทร **1784** หรือ **1669** ได้เลยค่ะ',
    missing: 'แจ้งคนหายกับศูนย์ประสานงานของจังหวัดได้ ข้อมูลจะเห็นเฉพาะเจ้าหน้าที่ ไม่เผยแพร่ค่ะ ถ้าเห็นคนถูกน้ำพัด โทร 1669 หรือ 191 ทันที',
    lost: 'ประกาศของหายหรือสัตว์เลี้ยงหาย และดูของที่มีคนเก็บได้ ในหน้าของหายของจังหวัดค่ะ ระวังคนขอให้โอนเงินก่อนคืนของ ใจดีไม่มีการเก็บเงิน',
    report: 'ช่วยรายงานระดับน้ำตรงที่คุณอยู่ได้ใน 3 ขั้น: ตำแหน่ง ระดับน้ำ และรูป (ถ้ามี) น้องใจดีจะเทียบกับสถานีวัดน้ำใกล้เคียงให้ค่ะ',
    volunteer: 'ดูงานอาสาที่เจ้าหน้าที่ตรวจแล้ว หรือโพสต์ความต้องการอาสาได้ที่หน้าอาสาค่ะ',
    alerts: 'เปิดรับแจ้งเตือนบนเครื่องนี้ได้ เลือกจังหวัด ชนิดภัย และระดับที่อยากรู้ค่ะ บน iPhone ต้องเพิ่มใจดีไปที่หน้าจอโฮมก่อน',
    statusWhere: 'อยากรู้สถานการณ์ที่จังหวัดไหนคะ พิมพ์ชื่อจังหวัด หรือกดใช้ตำแหน่งของฉัน แล้วถามใหม่ได้เลย',
    guide: (title) => `นี่คือสรุปเรื่อง **${title}** ค่ะ ดูขั้นตอนทั้งหมดในการ์ดด้านล่าง`,
    hello: 'น้องใจดีตอนนี้ทำงานแบบพื้นฐานค่ะ ถามได้เรื่อง สถานการณ์ในจังหวัด วิธีเตรียมตัวและรับมือภัย หรือขอความช่วยเหลือ ลองพิมพ์ เช่น "เชียงใหม่น้ำท่วมไหม" หรือ "ถ้าแผ่นดินไหวต้องทำยังไง"',
    b: { call: (n) => `โทร ${n}`, help: 'ขอความช่วยเหลือ', missing: 'แจ้งคนหาย', lost: 'ของหาย', report: 'รายงานระดับน้ำ', volunteer: 'หน้าอาสา', alerts: 'รับแจ้งเตือน', province: 'ดูหน้าจังหวัด', map: 'ดูแผนที่', guides: 'คู่มือรับมือภัย', weather: 'ฝนและฝุ่น' },
  },
  en: {
    photo: "น้องใจดี can't look at photos right now (AI isn't connected). If it shows flooding where you are, send it as a water report so others see it on the map.",
    emergency: 'If someone is in danger right now, **call 1669 (medical emergency) or 1784 (disaster) immediately**. Say exactly where you are, how many people, and whether anyone is old, a child or sick.\n\nWhile you wait, get to high ground, keep out of moving water, and signal with a torch or bright cloth.',
    helpOpen: (p) => `${p} has a coordination centre open: you can send a help request on Jaidee and staff see it straight away. If it's urgent, call 1784 or 1669 too.`,
    helpClosed: (p) => `${p} doesn't take requests on Jaidee yet. Call **1784 (disaster)** or **1669**, open 24 hours.`,
    helpWhere: 'Which province do you need help in? Type its name or tap "use my location". If it is urgent, call **1784** or **1669** now.',
    missing: "Report a missing person to the province's coordination centre; only staff see it, it is never published. If you see someone swept away, call 1669 or 191 now.",
    lost: "Post a lost item or pet, or look through things people found, on the province's lost-and-found page. Beware anyone who asks for money before returning something: Jaidee never charges.",
    report: 'Report the water where you are in 3 steps: place, depth and a photo if you can. น้องใจดี compares it with nearby gauges.',
    volunteer: 'See volunteer tasks checked by staff, or post a need, on the volunteer page.',
    alerts: 'Turn on alerts on this device for the provinces, hazards and level you care about. On iPhone, add Jaidee to your Home Screen first.',
    statusWhere: 'Which province would you like to know about? Type its name or tap "use my location", then ask again.',
    guide: (title) => `Here is **${title}**: the full steps are in the card below.`,
    hello: 'น้องใจดี is in basic mode right now. Ask about conditions in a province, how to prepare for or handle a hazard, or how to get help. Try "Is Chiang Mai flooded?" or "What do I do in an earthquake?"',
    b: { call: (n) => `Call ${n}`, help: 'Ask for help', missing: 'Report missing', lost: 'Lost & found', report: 'Report water', volunteer: 'Volunteer', alerts: 'Get alerts', province: 'Province page', map: 'Open map', guides: 'Safety guides', weather: 'Rain & dust' },
  },
  zh: {
    photo: 'Nong Jaidee 目前还不能看图片（未连接 AI）。如果是您所在位置的洪水照片，可以作为水位报告发送，让大家在地图上看到。',
    emergency: '如果现在有人身处危险，**请立即拨打 1669（医疗急救）或 1784（灾害热线）**，说清所在位置、人数，以及是否有老人、儿童或病人。\n\n等待时请到高处，不要涉入湍急的水流，用手电筒或鲜艳的布发信号。',
    helpOpen: (p) => `${p}已开设协调中心，可以在 Jaidee 上提交求助，工作人员会立即看到。紧急情况也请拨打 1784 或 1669。`,
    helpClosed: (p) => `${p}暂未在 Jaidee 上接收求助。请拨打 **1784** 或 **1669**，24 小时服务。`,
    helpWhere: '您需要在哪个府求助？输入府名或点击“使用我的位置”。紧急情况请立即拨打 **1784** 或 **1669**。',
    missing: '可向该府协调中心报告失踪人员，只有工作人员可见，不会公开。如看到有人被水冲走，请立即拨打 1669 或 191。',
    lost: '在该府的失物招领页面发布丢失物品或宠物，或查看别人捡到的东西。小心归还前要求付款的人：Jaidee 从不收费。',
    report: '三步报告您所在位置的水位：位置、深度、照片（如有）。น้องใจดี 会与附近水位站对比。',
    volunteer: '在志愿者页面查看工作人员核实过的任务，或发布需求。',
    alerts: '在此设备上开启提醒，选择关心的府、灾害类型和级别。iPhone 需先把 Jaidee 添加到主屏幕。',
    statusWhere: '您想了解哪个府？输入府名或点击“使用我的位置”，然后再问一次。',
    guide: (title) => `这是 **${title}** 的要点，完整步骤见下方卡片。`,
    hello: 'น้องใจดี 目前为基础模式。可以询问各府情况、如何防灾应对，或如何求助。例如：“清迈有洪水吗？”或“地震时该怎么办？”',
    b: { call: (n) => `拨打 ${n}`, help: '求助', missing: '报告失踪', lost: '失物招领', report: '报告水位', volunteer: '志愿者', alerts: '开启提醒', province: '查看本府', map: '打开地图', guides: '防灾指南', weather: '降雨与粉尘' },
  },
}

const STATUS_WORDS = {
  th: { over: 'ล้นตลิ่ง', high: 'น้ำมาก', of: 'จาก', gauges: 'สถานี', rivers: 'แม่น้ำ', rain: 'ฝน 24 ชม. ข้างหน้า', about: 'ราว', mm: 'มม.', chance: 'โอกาส', dust: 'ฝุ่น', pmTomorrow: (v) => `PM2.5 พรุ่งนี้ราว ${Math.round(v)} มคก./ลบ.ม.`, fires: 'จุดความร้อน 24 ชม.', alerts: 'แจ้งเตือนของใจดี', none: 'ไม่มี', now: 'ตอนนี้', reports: 'รายงานจากประชาชน 24 ชม.', centre: 'ศูนย์ประสานงานเปิดรับคำขอแล้ว', near: 'รอบตัวคุณ', gauge: 'สถานีใกล้สุด', km: 'กม.', shelter: 'ศูนย์พักพิงใกล้สุด', noData: 'ยังไม่มีข้อมูล', levels: ['เฝ้าระวัง', 'เตือนภัย', 'อันตราย'], status: { over: 'ล้นตลิ่ง', high: 'น้ำมาก', normal: 'ปกติ', low: 'น้อย', veryLow: 'น้อยมาก', unknown: 'ไม่ทราบ' } },
  en: { over: 'over the bank', high: 'high', of: 'of', gauges: 'gauges', rivers: 'Rivers', rain: 'Rain, next 24 h', about: 'about', mm: 'mm', chance: 'chance', dust: 'Dust', pmTomorrow: (v) => `PM2.5 tomorrow about ${Math.round(v)} µg/m³`, fires: 'Fire hotspots, 24 h', alerts: 'Jaidee alerts', none: 'none', now: 'now', reports: 'Reports from people, 24 h', centre: 'Coordination centre open for requests', near: 'Around you', gauge: 'Nearest gauge', km: 'km', shelter: 'Nearest shelter', noData: 'no data yet', levels: ['watch', 'warning', 'danger'], status: { over: 'over the bank', high: 'high', normal: 'normal', low: 'low', veryLow: 'very low', unknown: 'unknown' } },
  zh: { over: '漫堤', high: '水位高', of: '共', gauges: '个站', rivers: '河流', rain: '未来 24 小时降雨', about: '约', mm: '毫米', chance: '概率', dust: '粉尘', pmTomorrow: (v) => `明天 PM2.5 约 ${Math.round(v)} 微克/立方米`, fires: '24 小时火点', alerts: 'Jaidee 提醒', none: '无', now: '现在', reports: '24 小时民众报告', centre: '协调中心已开放求助', near: '您附近', gauge: '最近水位站', km: '公里', shelter: '最近避难所', noData: '暂无数据', levels: ['关注', '警告', '危险'], status: { over: '漫堤', high: '水位高', normal: '正常', low: '偏低', veryLow: '很低', unknown: '未知' } },
}

function statusText(s, lang) {
  const W = STATUS_WORDS[lang]
  const name = lang === 'th' ? s.province.name_th : s.province.name_en
  const lines = [`**${name}** ${W.now}`]
  lines.push(`- ${W.rivers}: ${s.rivers.gauges ? `${W.over} ${s.rivers.over_bank} · ${W.high} ${s.rivers.high} ${W.of} ${s.rivers.gauges} ${W.gauges}` : W.noData}`)
  if (s.rain.forecast_next_24h_mm !== null) lines.push(`- ${W.rain}: ${W.about} ${s.rain.forecast_next_24h_mm} ${W.mm} (${W.chance} ${s.rain.forecast_max_chance_pct}%)`)
  const pmTomorrow = s.air.pm25_outlook[1]?.mean
  if (s.air.worst_station || pmTomorrow) lines.push(`- ${W.dust}: ${[s.air.worst_station && `AQI ${s.air.worst_station.aqi}`, pmTomorrow && W.pmTomorrow(pmTomorrow)].filter(Boolean).join(' · ')}`)
  lines.push(`- ${W.fires}: ${s.fire_hotspots_24h.count}`)
  if (s.public_reports_24h.count) lines.push(`- ${W.reports}: ${s.public_reports_24h.count}`)
  const alertLine = s.jaidee_alerts.length ? s.jaidee_alerts.slice(0, 3).map((a) => `${W.levels[['watch', 'warning', 'danger'].indexOf(a.level)]}: ${a.text}`).join(' / ') : W.none
  lines.push(`- ${W.alerts}: ${alertLine}`)
  if (s.coordination_centre.open) lines.push(`- ${W.centre}${s.coordination_centre.hotline ? ` (${s.coordination_centre.hotline})` : ''}`)
  return lines.join('\n')
}

function nearText(n, lang) {
  const W = STATUS_WORDS[lang]
  const g = n.nearest_gauges[0]
  const lines = [`**${W.near}**: ${lang === 'th' ? n.place.name_th : n.place.name_en}`]
  if (g) lines.push(`- ${W.gauge}: ${g.name} (${g.km_away} ${W.km}) ${W.status[g.status]}`)
  lines.push(`- ${W.reports}: ${n.public_reports_within_3km_24h.count}`)
  if (n.nearest_open_shelter) lines.push(`- ${W.shelter}: ${n.nearest_open_shelter.name} (${n.nearest_open_shelter.km_away} ${W.km})`)
  return lines.join('\n')
}

const centerOpen = (code) => !!get('SELECT active FROM command_centers WHERE province = ?', code)?.active

/** Answer one message without a model. Emits the same events as runAssistant. */
export async function runBasic({ turns, lang, province, location }, emit) {
  const L = T[lang] ? lang : 'th'
  const t = T[L]
  const text = String([...turns].reverse().find((x) => x.role !== 'assistant')?.text ?? '')
  const here = location ? placeAt(location[0], location[1])?.province ?? null : null
  const named = provinceIn(text)
  const p = named ?? province ?? here
  const pName = p ? (L === 'th' ? provinceName(p).th : provinceName(p).en) : null
  const say = (s) => emit({ type: 'text', delta: s })
  const buttons = (list) => emit({ type: 'buttons', buttons: list.filter(Boolean).slice(0, 4) })
  const page = (label, pg, extra = {}) => ({ label, action: 'page', page: pg, ...extra })
  const call = (n) => ({ label: t.b.call(n), action: 'call', number: n })
  const topic = TOPIC_WORDS.find(([, re]) => re.test(text))?.[0] ?? null

  if (turns[turns.length - 1]?.image) {
    // Without the model nobody can look at the photo; offer what can be done with it.
    say(t.photo)
    buttons([p ? page(t.b.report, 'report', { province: p }) : page(t.b.province, 'provinces'), call('1784')])
  } else if (has(EMERGENCY, text)) {
    say(t.emergency)
    buttons([call('1669'), call('1784'), p && centerOpen(p) && page(t.b.help, 'help', { province: p })])
  } else if (has(HELP, text)) {
    if (!p) say(t.helpWhere)
    else say(centerOpen(p) ? t.helpOpen(pName) : t.helpClosed(pName))
    buttons([p && centerOpen(p) && page(t.b.help, 'help', { province: p }), call('1784'), call('1669')])
  } else if (has(MISSING, text)) {
    say(t.missing)
    buttons([p && page(t.b.missing, 'missing', { province: p }), call('1669'), call('191')])
  } else if (has(LOST, text)) {
    say(t.lost)
    buttons([p ? page(t.b.lost, 'lost_found', { province: p }) : page(t.b.province, 'provinces')])
  } else if (has(REPORT, text) && !has(STATUS, text)) {
    say(t.report)
    buttons([p ? page(t.b.report, 'report', { province: p }) : page(t.b.province, 'provinces')])
  } else if (has(VOLUNTEER, text)) {
    say(t.volunteer)
    buttons([page(t.b.volunteer, 'volunteer')])
  } else if (has(ALERTS, text) && !has(HOW, text)) {
    say(t.alerts)
    buttons([page(t.b.alerts, 'alerts')])
  } else if ((has(STATUS, text) || (topic && !has(HOW, text))) && (location || p)) {
    if (location && !named) {
      const n = await nearbySummary(location[0], location[1])
      if (!n.error) say(`${nearText(n, L)}\n\n`)
    }
    const s = p ? await provinceSummary(p) : null
    if (s && !s.error) say(statusText(s, L))
    const mode = topic ? HAZARD_MODE[topic] : null
    buttons([p && page(t.b.province, 'province', { province: p }), mode ? page(t.b.map, 'map', { mode }) : p && page(t.b.weather, 'weather', { province: p }), topic && page(GUIDES.topics.find((g) => g.id === topic).title[L], 'guide', { topic })])
  } else if (topic) {
    const g = GUIDES.topics.find((x) => x.id === topic)
    say(t.guide(g.title[L]))
    emit({ type: 'guide', topic })
    buttons(g.hotlines.slice(0, 2).map((n) => ({ label: `${GUIDES.hotlines[n][L].split(' (')[0]} ${n}`.slice(0, 40), action: 'call', number: n })))
  } else if (has(STATUS, text)) {
    say(t.statusWhere)
    buttons([page(t.b.map, 'map'), page(t.b.province, 'provinces')])
  } else {
    say(t.hello)
    buttons([page(t.b.guides, 'guide'), page(t.b.map, 'map'), page(t.b.alerts, 'alerts')])
  }
  emit({ type: 'done' })
}
