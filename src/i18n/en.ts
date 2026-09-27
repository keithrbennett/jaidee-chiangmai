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
    haze: 'Unhealthy',
    flood: 'above 3.7 m warning',
    riverGauge: 'Ping River P.1',
    good: 'Good',
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
    post: 'Partner: post a need',
    about: 'How it works',
    mapShort: 'Find',
    tasksShort: 'My tasks',
    postShort: 'Post',
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
    intro:
      'Write in Thai the way you’d post in LINE. Claude drafts a bilingual Thai/English job card for you to check.',
    placeholder: 'e.g. ต้องการอาสา 5 คน ช่วยทาสีห้องเรียน วันเสาร์นี้...',
    useSample: 'Use sample (Kru Noi)',
    drafting: 'Claude is drafting…',
    draft: 'Draft job card with Claude',
    apiUnreachable: 'Could not reach the API server. Is `npm run dev` running (it starts both web and API)?',
    serverError: (status: number) => `Server returned ${status}`,
    where: 'Where',
    when: 'When',
    volunteers: 'Volunteers',
    skills: 'Skills',
    draftNote: 'Safety rules for this category are added automatically. The need stays “pending” until a partner verifies it.',
    added: 'Added to the map at the current map centre as pending verification.',
    seeIt: 'See it on the map →',
    addToMap: 'Looks right → add to map (pending verification)',
    edit: 'Edit the text',
    placeTbc: 'Location to be confirmed',
    demoPartner: 'You (demo partner)',
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
    about: 'How it works',
  },
}

export type Messages = typeof en
