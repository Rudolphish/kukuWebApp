/**
 * ホームが端末の高さに収まっていることを確かめる。
 *
 * 第 1 版から 375x667 で 96px、320x568 で 217px あふれていたのに
 * 気づかなかった。原因は 1 つの画面サイズでしか見ていなかったこと。
 * 「収まった」は目視では分からないので、条件を先に決めて機械で測る。
 *
 *   npm run build && npm start -- -p 3210
 *   npm run layout-check
 *
 * 崩れていたら終了コード 1 と、どのサイズでどの条件が落ちたかを出す。
 */
import { chromium } from 'playwright-core'

const BASE = process.env.LAYOUT_CHECK_URL ?? 'http://localhost:3210'
const EXE = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'

/**
 * 狭い端末から広い端末まで。1 点で測ると、1 点でしか直らない。
 * LAYOUT_CHECK_SIZES='320x568,390x844' で個別に指定できる。
 */
const SIZES = process.env.LAYOUT_CHECK_SIZES
  ? process.env.LAYOUT_CHECK_SIZES.split(',').map((s) => s.split('x').map(Number))
  : [
      [320, 568], // iPhone SE 第 1 世代 / 5
      [360, 640], // 小型の Android
      [375, 667], // iPhone SE 第 2・3 世代
      [390, 844], // iPhone 13 / 14
      [414, 736], // iPhone 8 Plus
      [430, 932], // iPhone 15 Pro Max
    ]

/** 4 段まで解放し、親子に記録がある状態。いちばん縦に長くなる */
const SEED = (() => {
  const runs = [
    ['child', 1, 14_800, 10],
    ['child', 2, 26_000, 10],
    ['child', 3, 38_000, 9],
    ['child', 4, 52_000, 7],
    ['parent', 1, 11_000, 10],
    ['parent', 4, 16_000, 10],
  ].map(([who, stage, totalMs, correct], i) => ({
    id: `seed-${i}`,
    who,
    mode: 'attack',
    stage,
    totalMs,
    correct,
    total: 10,
    at: new Date(Date.now() - i * 86_400_000).toISOString(),
    facts: Array.from({ length: 10 }, (_, b) => ({
      a: stage,
      b: (b % 9) + 1,
      correct: b < correct,
      ms: totalMs / 10,
    })),
  }))
  return {
    settings: {
      settings: {
        stageOrder: [1, 2, 3, 4, 5, 6, 7, 8, 9],
        unlockedCount: 4,
        themeId: 'blocks',
        // 長めの名前で測る。短い名前でしか測らないと折り返しを見逃す
        childName: 'そうた',
        parentName: 'おとうさん',
        enemyNames: {},
        rankPace: 'normal',
      },
      updatedAt: new Date().toISOString(),
    },
    runs,
    device: { familyCode: '', role: 'child', voice: false, mode: 'attack' },
  }
})()

/** 守る条件。潰れて収まるのは収まったうちに入らない。 */
function inspect() {
  const doc = document.documentElement
  const sa = document.querySelector('.scrollArea')
  const btn = document.querySelector('.bigButton')
  // 骨組みごと無くなった場合は、黙って通さず落とす
  if (!sa || !btn) {
    return { missing: [!sa && '.scrollArea', !btn && '.bigButton'].filter(Boolean) }
  }
  const saBox = sa.getBoundingClientRect()
  const btnBox = btn.getBoundingClientRect()
  const cards = [...document.querySelectorAll('.stageCard')]
  const rows = [...document.querySelectorAll('.recordRow')]

  const within = (el, box) => {
    const b = el.getBoundingClientRect()
    return b.top >= box.top - 1 && b.bottom <= box.bottom + 1
  }

  // 親が overflow:hidden で、中身がその箱から出ているもの（= 見切れ）
  const clipped = []
  for (const el of document.querySelectorAll('.app *')) {
    const cs = getComputedStyle(el)
    if (cs.display === 'none' || cs.visibility === 'hidden') continue
    const p = el.parentElement
    if (!p) continue
    const ps = getComputedStyle(p)
    if (ps.overflow !== 'hidden' && ps.overflowY !== 'hidden') continue
    const a = el.getBoundingClientRect()
    const b = p.getBoundingClientRect()
    if (a.height === 0) continue
    if (a.bottom > b.bottom + 1 || a.top < b.top - 1 || a.right > b.right + 1 || a.left < b.left - 1) {
      clipped.push(el.className?.toString?.().slice(0, 30) || el.tagName)
    }
  }

  return {
    docScroll: doc.scrollHeight - doc.clientHeight,
    startVisible: btnBox.top >= 0 && btnBox.bottom <= window.innerHeight + 1,
    cardsVisible: cards.length > 0 && cards.every((c) => within(c, saBox)),
    recordRowsVisible: rows.length === 2 && rows.every((r) => within(r, saBox)),
    clipped: [...new Set(clipped)],
  }
}

const browser = await chromium.launch({ executablePath: EXE })
let failed = 0

for (const [width, height] of SIZES) {
  const ctx = await browser.newContext({ viewport: { width, height } })
  const page = await ctx.newPage()
  try {
    await page.goto(BASE, { waitUntil: 'networkidle' })
    await page.evaluate((s) => {
      localStorage.setItem('kuku.settings.v2', JSON.stringify(s.settings))
      localStorage.setItem('kuku.runs.v1', JSON.stringify(s.runs))
      localStorage.setItem('kuku.device.v1', JSON.stringify(s.device))
    }, SEED)
    await page.reload({ waitUntil: 'networkidle' })
    await page.waitForTimeout(700)

    const r = await page.evaluate(inspect)
    const bad = []
    if (r.missing) {
      bad.push(`見つからない: ${r.missing.join(', ')}`)
    } else {
      if (r.docScroll > 1) bad.push(`画面がスクロールする(+${r.docScroll}px)`)
      if (!r.startVisible) bad.push('「はじめる」が見えていない')
      if (!r.cardsVisible) bad.push('段カードが見えていない')
      if (!r.recordRowsVisible) bad.push('きろくの行が見えていない')
      if (r.clipped.length) bad.push(`見切れ: ${r.clipped.join(', ')}`)
    }

    const label = `${width}x${height}`.padEnd(9)
    if (bad.length) {
      failed += 1
      console.log(`NG  ${label} ${bad.join(' / ')}`)
    } else {
      console.log(`ok  ${label}`)
    }
  } finally {
    await ctx.close()
  }
}

await browser.close()

if (failed > 0) {
  console.log(`\n${failed} サイズで崩れている。`)
  process.exit(1)
}
console.log('\nすべてのサイズで収まっている。')
