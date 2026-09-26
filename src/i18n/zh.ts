import type { Messages } from './en'

export const zh: Messages = {
  appName: 'Jaidee',
  appSubtitle: '互助地图',
  tagline: '清迈经过核实的需求，与想帮忙的人配对',
  demoBanner: '黑客松演示 · 所有需求、人物和电话号码均为虚构',
  language: '语言',

  modes: {
    title: '🔒 模式（管理员）',
    hint: '正式上线后，只有市政府或管理员可以切换模式',
    normal: '正常',
    haze: '雾霾',
    flood: '洪水',
    modeLabel: (name) => `${name}模式`,
  },

  status: {
    demo: '（演示）',
    haze: '不健康',
    flood: '高于 3.7 米警戒线',
    riverGauge: '滨河 P.1',
    good: '良好',
  },

  tabs: {
    map: '寻找需求',
    tasks: '我的任务',
    post: '合作伙伴：发布需求',
    about: '使用说明',
    mapShort: '寻找',
    tasksShort: '我的任务',
    postShort: '发布',
    aboutShort: '关于',
    mainNav: '主导航',
  },

  stats: {
    volunteers: '名志愿者已报名',
    hours: '小时已承诺',
    mine: '其中是你的 💚',
  },

  categories: {
    haze: '雾霾救助',
    flood: '洪水',
    school: '学校',
    temple: '寺庙',
    animals: '动物',
    elderly: '长者照护',
    environment: '环境',
  },

  safety: {
    haze: ['AQI 超过 100 时在户外佩戴 N95 口罩', '定时到室内休息；呼吸困难时立即停止'],
    flood: ['必须穿胶靴、戴手套', '需在过去 10 年内接种过破伤风疫苗', '切勿涉入流动的水；听从负责人的撤离指示'],
    school: ['老师（负责人）全程在场', '分享的成果卡片中不得出现儿童照片'],
    temple: ['衣着遮住肩膀和膝盖；进入建筑前脱鞋'],
    animals: ['穿包头鞋', '听从收容所工作人员指挥；不要独自接近狗'],
    elderly: ['由负责人先介绍你；切勿独自上门'],
    environment: ['提供手套；请自带饮用水和帽子'],
  },

  verified: {
    pending: '等待合作伙伴核实',
    today: (by) => `${by} 今天已核实`,
    yesterday: (by) => `${by} 昨天已核实`,
    daysAgo: (days, by) => `${by} ${days} 天前已核实`,
  },

  list: {
    hazeBanner: '🔴 雾霾紧急模式',
    floodBanner: '🔵 洪水紧急模式',
    emergencyExplainer: '只显示本次危机中经合作伙伴核实的紧急需求。由清迈市政府开启。',
    all: '全部',
    count: (n) => `附近有 ${n} 个需求`,
    sortedByDistance: '按距离排序',
    sortedByUrgency: '按紧急程度排序，其次按距离',
    fromNimman: '以宁曼路为起点（未共享位置）',
    noMatch: '没有符合此筛选条件的需求。',
    showAll: '显示全部',
    urgent: '紧急',
    youreIn: '已报名',
    full: '已满（候补）',
    spotsLeft: (left, total) => `剩余 ${left} / ${total} 个名额`,
    hiddenStale: (n) => `有 ${n} 个需求因核实已超过 14 天而被隐藏。合作伙伴会收到重新核实的提醒。`,
  },

  detail: {
    back: '← 返回列表',
    share: '🔗 分享',
    copied: '✓ 链接已复制',
    pendingExplainer: '合作伙伴须到现场核实此需求后，志愿者才能报名。',
    verifiedExplainer: (partner, days, contact) =>
      `${partner} 的工作人员已到现场亲自核实。核实将在 ${days} 天后过期。负责人联系方式：${contact}`,
    thaiOriginal: '泰语原文',
    where: '地点',
    away: (distance) => `距离 ${distance}`,
    skills: '技能',
    spots: '名额',
    filled: (taken, total) => `已报名 ${taken} / ${total}`,
    impactSoFar: '目前成果',
    impactNote: '数字由负责人确认，而非志愿者自行填报。',
    safetyTitle: '⚠️ 安全规定',
    safetyNote: (category) => `所有“${category}”类需求都会自动附上。`,
    waitlisted: '你已在候补名单中 ⏳',
    joined: '报名成功！🎉',
    waitlistNote: '有空位时我们会通知你。请保留此代码用于签到。',
    codeNote: '签到时向负责人出示此代码',
    cancel: '去不了？取消以释放名额',
    pickTime: '选择时间',
    hours: (h) => `${h} 小时`,
    joinWaitlist: '加入候补',
    imIn: '我要参加',
  },

  notFound: {
    expiredTitle: '此需求已过期',
    missingTitle: '找不到此需求',
    expiredBody: '其核实已超过 14 天，在合作伙伴重新核实前将被隐藏。',
    missingBody: '可能已满员或已被删除，或链接不完整。',
    seeAll: '← 查看全部需求',
  },

  tasks: {
    emptyTitle: '你还没有报名任何需求。',
    emptyBody: '在地图上选择一个需求，然后点击“我要参加”。',
    findNeed: '寻找需求 →',
    receiptTitle: '你的成果凭证（已承诺）',
    hours: (h) => `${h} 小时`,
    across: (n) => `来自清迈 ${n} 个经核实的需求`,
    receiptNote: '负责人为你签到并确认后，这些小时才会成为已确认的成果。',
    waitlist: '⏳ 候补',
    confirmed: '✅ 已确认',
    checkInCode: '签到码',
    cancel: '取消',
  },

  post: {
    title: '发布需求',
    intro: '像在 LINE 上发帖一样用泰语书写即可。Claude 会为你起草一张泰英双语的任务卡片供你检查。',
    placeholder: '例如：ต้องการอาสา 5 คน ช่วยทาสีห้องเรียน วันเสาร์นี้...',
    useSample: '使用示例（Noi 老师）',
    drafting: 'Claude 正在起草…',
    draft: '✨ 让 Claude 起草任务卡片',
    apiUnreachable: '无法连接 API 服务器。`npm run dev` 是否在运行（它会同时启动网页和 API）？',
    serverError: (status) => `服务器返回 ${status}`,
    where: '地点',
    when: '时间',
    volunteers: '志愿者人数',
    skills: '技能',
    draftNote: '此类别的安全规定会自动添加。在合作伙伴核实之前，该需求会保持“待核实”状态。',
    added: '已以“待核实”状态添加到当前地图中心位置。',
    seeIt: '在地图上查看 →',
    addToMap: '没问题 → 添加到地图（待核实）',
    placeTbc: '地点待确认',
    demoPartner: '你（演示合作伙伴）',
  },

  about: {
    title: '使用说明',
    intro: '清迈真实且经过核实的需求，与想帮忙却不知从何开始的人配对。',
    steps: [
      {
        title: '合作伙伴到现场核实需求',
        body: '只有合作伙伴（市政府、Cosmo Local、非政府组织）可以发布。每个需求都会显示由谁、在何时核实；若 14 天内无人重新核实，需求将自动下架。',
      },
      {
        title: '你选择任务和时间',
        body: '浏览地图或列表，打开一个需求，选择时段，然后点击“我要参加”。不需要会泰语。',
      },
      {
        title: '到场签到',
        body: '向负责人出示你的签到码。每个需求都列有该类任务的安全规定。',
      },
      {
        title: '负责人确认完成情况',
        body: '成果数字来自负责人而非志愿者，所以“组装了 40 台净化器”就是真的 40 台。',
      },
    ],
    modesTitle: '紧急模式',
    modesBody:
      '在雾霾季 🔴 或洪水期间 🔵，市政府会把地图切换为只显示危机需求：口罩、空气净化器、洁净室、清理淤泥、饮用水和司机。紧急需求优先显示。',
    help: '我想帮忙 → 寻找需求',
    needHelp: '我们需要帮助 → 发布需求',
  },

  map: {
    youAreHere: '你在这里',
  },

  titles: {
    map: '寻找需求',
    tasks: '我的任务',
    post: '发布需求',
    about: '使用说明',
  },
}
