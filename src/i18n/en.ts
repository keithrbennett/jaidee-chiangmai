import type { Category } from '../types'

/**
 * English UI text. This is the source dictionary: `Messages` is derived from it, so the Thai and
 * Chinese dictionaries fail to compile if a key is missing or a function has the wrong arguments.
 * Sample needs in src/data are content, not UI text, and are not translated here.
 */
export const en = {
  appName: 'Jaidee',
  appSubtitle: 'แผนที่ช่วยกัน',
  tagline: 'Verified needs in Chiang Mai, matched with people who want to help',
  demoBanner: 'Hackathon demo · all needs, people and phone numbers are fictional',
  language: 'Language',
  theme: {
    title: 'Appearance',
    system: 'Match my device',
    light: 'Light',
    dark: 'Dark',
  },
  backHome: 'Home',

  modes: {
    title: 'Mode (admin)',
    hint: 'In production only the municipality / admins can switch modes',
    normal: 'Normal',
    haze: 'Haze',
    flood: 'Flood',
    modeLabel: (name: string) => `${name} mode`,
  },

  status: {
    demo: '(demo)',
    riverGauge: 'Ping River P.1',
    /** Thai AQI bands (Pollution Control Department wording), 0–25 … 201+. */
    aqi: ['Very good', 'Good', 'Moderate', 'Starting to affect health', 'Affects health'],
    riverBelow: (m: number) => `below ${m} m critical level`,
    riverAbove: (m: number) => `above ${m} m critical level`,
    asOf: (time: string) => `as of ${time}`,
    source: (source: string, place: string, time: string) => `${source} · ${place} · ${time}`,
  },

  home: {
    title: 'What would you like to do?',
    sub: 'Choose one to get started.',
    help: {
      title: 'I want to help',
      who: 'Anyone can join',
      body: 'Pick a verified task near you and a time that suits you.',
      cta: 'Find a need',
    },
    ask: {
      title: 'I need help',
      who: 'For me, my family or my group',
      body: 'Say what you need. Volunteers nearby will see it and offer to help.',
      cta: 'Post a need',
    },
    tasks: {
      title: 'My tasks',
      who: "Help I've offered to give",
      body: 'See where and when to go, with your check-in codes.',
      cta: 'See my tasks',
    },
    open: (n: number) => `${n} ${n === 1 ? 'need' : 'needs'} open now`,
    joined: (n: number) => (n === 0 ? 'No tasks yet' : `${n} ${n === 1 ? 'task' : 'tasks'}`),
    hazeUrgent: (n: number) => `Haze emergency: ${n} urgent ${n === 1 ? 'need' : 'needs'} right now`,
    floodUrgent: (n: number) => `Flood emergency: ${n} urgent ${n === 1 ? 'need' : 'needs'} right now`,
    helpNow: 'Help now',
    howItWorks: 'New here? See how it works',
  },

  tabs: {
    map: 'Find a need',
    tasks: 'My tasks',
    post: 'Post a need',
    flood: 'Flood 3D',
    about: 'How it works',
    mapShort: 'Find',
    tasksShort: 'My tasks',
    postShort: 'Post',
    floodShort: 'Flood 3D',
    aboutShort: 'About',
    mainNav: 'Main',
  },

  stats: {
    volunteers: 'volunteers signed up',
    hours: 'hours pledged',
    mine: 'of them yours',
  },

  categories: {
    haze: 'Haze relief',
    flood: 'Flood',
    school: 'Schools',
    temple: 'Temples',
    animals: 'Animals',
    elderly: 'Elderly care',
    environment: 'Environment',
  } satisfies Record<Category, string>,

  /** Safety rules added automatically to every need of a category. */
  safety: {
    haze: ['Wear an N95 mask outdoors when AQI > 100', 'Take breaks indoors; stop if short of breath'],
    flood: [
      'Rubber boots and gloves required',
      'Tetanus shot within the last 10 years',
      'Never wade in moving water; follow the host’s evacuation call',
    ],
    school: ['A teacher (host) stays on site the whole time', 'No photos of children in shared impact cards'],
    temple: ['Cover shoulders and knees; remove shoes in buildings'],
    animals: ['Closed-toe shoes', 'Follow the shelter handler; do not approach dogs alone'],
    elderly: ['Host introduces you first; never visit homes alone'],
    environment: ['Gloves provided; bring water and a hat'],
  } satisfies Record<Category, string[]>,

  verified: {
    pending: 'Pending partner verification',
    today: (by: string) => `Verified today by ${by}`,
    yesterday: (by: string) => `Verified yesterday by ${by}`,
    daysAgo: (days: number, by: string) => `Verified ${days} days ago by ${by}`,
  },

  list: {
    hazeBanner: 'Haze emergency mode',
    floodBanner: 'Flood emergency mode',
    emergencyExplainer: 'showing only urgent, partner-verified needs for this crisis. Switched on by Chiang Mai Municipality.',
    all: 'All',
    count: (n: number) => `${n} ${n === 1 ? 'need' : 'needs'} near you`,
    sortedByDistance: 'sorted by distance',
    sortedByUrgency: 'sorted by urgency, then distance',
    fromNimman: 'from Nimman (location not shared)',
    noMatch: 'No needs match this filter.',
    showAll: 'Show all',
    urgent: 'URGENT',
    youreIn: "YOU'RE IN",
    full: 'Full (waitlist)',
    spotsLeft: (left: number, total: number) => `${left} of ${total} spots left`,
    hiddenStale: (n: number) =>
      `${n} ${n === 1 ? 'need' : 'needs'} hidden because verification is older than 14 days. Partners get a reminder to re-check.`,
  },

  detail: {
    back: 'Back to list',
    share: 'Share',
    copied: 'Link copied',
    pendingExplainer: 'A partner must visit and verify this need before volunteers can join.',
    verifiedExplainer: (partner: string, days: number, contact: string) =>
      `Someone from ${partner} went and checked this in person. Verification expires in ${days} days. Host contact: ${contact}`,
    thaiOriginal: 'Thai original (ต้นฉบับภาษาไทย)',
    where: 'Where',
    away: (distance: string) => `${distance} away`,
    skills: 'Skills',
    spots: 'Spots',
    filled: (taken: number, total: number) => `${taken} / ${total} filled`,
    impactSoFar: 'Impact so far',
    impactNote: 'Numbers are confirmed by the host, not self-reported.',
    safetyTitle: 'Safety rules',
    safetyNote: (category: string) => `Added automatically for every “${category}” need.`,
    waitlisted: "You're on the waitlist ⏳",
    joined: "You're in!",
    waitlistNote: 'We will message you if a spot opens. Keep this code for check-in.',
    codeNote: 'Show this code to the host at check-in',
    cancel: "Can't make it? Cancel and free the spot",
    pickTime: 'Pick a time',
    hours: (h: number) => `${h} h`,
    joinWaitlist: 'Join the waitlist',
    imIn: "I'm in",
  },

  notFound: {
    expiredTitle: 'This need has expired',
    missingTitle: 'Need not found',
    expiredBody: 'Its verification is older than 14 days, so it is hidden until a partner re-checks it.',
    missingBody: 'It may have been filled or removed, or the link is incomplete.',
    seeAll: 'See all needs',
  },

  tasks: {
    emptyTitle: "You haven't joined anything yet.",
    emptyBody: 'Pick a need on the map and tap “I’m in”.',
    findNeed: 'Find a need →',
    receiptTitle: 'Your impact receipt (pledged)',
    hours: (h: number) => `${h} hours`,
    across: (n: number) => `across ${n} verified ${n === 1 ? 'need' : 'needs'} in Chiang Mai`,
    receiptNote: 'Hours become confirmed impact once the host checks you in and signs off.',
    waitlist: '⏳ Waitlist',
    confirmed: 'Confirmed',
    checkInCode: 'check-in code',
    cancel: 'Cancel',
  },

  post: {
    title: 'Post a need',
    intro: 'Say what you need in your own words: what, where, when and how many people.',
    placeholder: 'e.g. I need 3 people to help move furniture this Saturday morning…',
    useSample: 'Use a sample',
    sample:
      'Hello, this is Kru Noi from Ban Pa Daet School. The dust is very bad at the moment, and we would like to turn the school library into a clean-air room where the children can read at lunchtime. We need about 5 people to help seal the windows with tape and move the bookshelves on Saturday 13 December, 9 am to noon.',
    submit: 'Submit',
    submittedTitle: 'Submitted',
    submittedBody: 'Thank you. A partner will check your request, then volunteers nearby can see it and offer to help.',
    done: 'Done',
    postAnother: 'Post another need',
  },

  about: {
    title: 'How it works',
    intro: 'Real, verified needs in Chiang Mai, matched with people who want to help but don’t know where to start.',
    steps: [
      {
        title: 'A partner checks the need in person',
        body: 'Only partners (the municipality, Cosmo Local, NGOs) can publish. Every need shows who checked it and when, and it disappears after 14 days unless someone re-checks it.',
      },
      {
        title: 'You pick a task and a time',
        body: 'Browse the map or the list, open a need, choose a slot and tap “I’m in”. No Thai needed.',
      },
      {
        title: 'Show up and check in',
        body: 'Show your check-in code to the host. Safety rules for that kind of task are listed on every need.',
      },
      {
        title: 'The host confirms what got done',
        body: 'Impact numbers come from the host, not from volunteers, so “40 purifiers built” means 40 purifiers built.',
      },
    ],
    modesTitle: 'Emergency modes',
    modesBody:
      'During the haze season or a flood the municipality switches the map to crisis needs only: masks, air purifiers, clean rooms, mud clean-up, water and drivers. Urgent needs come first.',
    help: 'I want to help → find a need',
    needHelp: 'I need help → post a need',
  },

  map: {
    youAreHere: 'You are here',
  },

  titles: {
    home: 'Home',
    map: 'Find a need',
    tasks: 'My tasks',
    post: 'Post a need',
    flood: 'Flood simulator 3D',
    about: 'How it works',
  },

  flood: {
    title: 'Flood simulator 3D',
    sub: 'Heavy rain, a rising Ping: see which streets flood first and how deep, to plan help ahead.',
    modelBadge: 'Model for planning, not a forecast',
    loading: 'Loading the terrain…',
    loadError: (msg: string) => `Couldn't load the terrain: ${msg}`,
    live: {
      title: 'Live data',
      rain: 'Rainfall live',
      rainNow: (mm: number) => `${mm} mm in the last hour`,
      rainWettest: (mm: number) => `wettest gauge in town: ${mm} mm in 24 h`,
      river: 'River gauges',
      riverP1: (level: string, critical: string) => `P.1 Nawarat Bridge ${level} m (critical ${critical} m)`,
      sensors: 'IoT water sensors',
      sensorsCount: (n: number) => `${n} stations reporting in Chiang Mai`,
      cctv: 'Flood CCTV grid',
      cctvOff: 'Not connected: needs a camera feed from the municipality',
      unavailable: 'Live data unavailable right now',
      asOf: (time: string) => `as of ${time}`,
      on: 'Live',
      off: 'Off',
    },
    scenario: {
      title: 'Scenario',
      rain: 'Rain',
      manual: 'Set it',
      forecast: 'Forecast, 48 h',
      forecastNone: 'No rain in the forecast',
      forecastPeak: (mm: number) => `peak ${mm} mm/h`,
      mmPerHour: 'mm/h',
      drain: 'Drains can take',
      drainHint: 'An assumption: the drain network data is not public yet',
      p1Start: 'P.1 level at the start',
      p1Rise: 'River rising',
      perHour: 'm per hour',
      useLive: 'Use live',
    },
    run: 'Run',
    pause: 'Pause',
    reset: 'Reset',
    speed: 'Speed',
    speedActual: (x: number) => `running at ×${x}`,
    clock: (h: number, m: number) => `+${h} h ${String(m).padStart(2, '0')} min`,
    results: {
      title: 'Result',
      flooded: 'Flooded (10 cm or more)',
      typicalDepth: 'Typical depth there',
      p1Now: 'P.1 now',
      rainNow: 'Rain now',
      needs: 'Jaidee needs in flooded streets',
      needsNone: 'None so far',
    },
    legend: {
      depth: 'Water depth',
      depthClasses: ['10–30 cm', '30–50 cm: cars stall', '50 cm–1 m: dangerous to wade', '1–2 m', 'over 2 m'],
      gauges: 'Gauges',
      gaugeRid: 'River gauge (RID)',
      gaugeOther: 'Other telemetry',
      gaugeStatus: { over: 'Over the bank', near: 'Within 1 m of the bank', ok: 'Below the bank', none: 'No reading' },
      rain: 'Rain in 24 h (TMD classes)',
      rainClasses: ['Light', 'Moderate', 'Heavy', 'Very heavy'],
      needs: 'Jaidee needs (red: in water)',
    },
    walk: {
      enter: 'Street walk',
      exit: 'Leave street walk',
      keys: 'W / S or ↑ / ↓ walk · A / D step aside · Q / E or ← / → turn',
      here: 'Water here',
      dry: 'Dry',
      ground: (m: string) => `ground ${m} m (terrain data)`,
      approx: 'Approximate: 36 m terrain cells, a few metres out in town',
      outside: 'Outside the modelled area',
      tap: 'Tap the ground to walk there',
    },
    popup: {
      water: 'Water',
      bank: 'Lowest bank',
      below: (m: string) => `${m} m below the bank`,
      over: (m: string) => `${m} m over the bank`,
      rain1h: 'Last hour',
      rain24h: 'Last 24 h',
      open: 'Open this need',
    },
    notes: {
      title: 'How this model works',
      body: [
        'The water moves by the shallow water (Saint-Venant) equations in their local inertial form, the method of the LISFLOOD-FP model, on a 36 m grid over the city, in your browser.',
        'The ground is SRTM satellite terrain with roofs and trees filtered out. In town it can be a few metres out, so read depths as a guide to which streets flood first, not as exact figures.',
        'The Ping is held at P.1 level minus 3.7 m above its banks all along the city, so it starts to spill where the terrain lets it once P.1 passes its critical level. The river does not run out of water, so long runs show the most a level can flood.',
        'There is no storm drain network in the model yet (no SWMM): drains are one figure, in mm per hour, taken from any flooded cell. Rain falls evenly on the whole area.',
        'Before using it for real decisions, check it against a flood that happened, such as October 2024.',
      ],
      sources:
        'Data: Thaiwater (river and rain gauges, RID and others), Open-Meteo (rain forecast), Terrain Tiles on AWS (SRTM), OpenStreetMap via OpenFreeMap (buildings, the Ping River).',
    },
  },
}

export type Messages = typeof en
