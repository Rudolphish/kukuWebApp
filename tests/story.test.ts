import assert from 'node:assert/strict'
import { test } from 'node:test'
import area5 from '@/data/stories/area-5.json'
import { MAX_DEPTH, MAX_TEXT_LENGTH, MIN_DEPTH, validateStory, type StoryArea } from '@/lib/story'

const sample = area5 as StoryArea

test('同梱のサンプルストーリーが検証を通る', () => {
  const errors = validateStory(sample)
  assert.deepEqual(errors, [], errors.join('\n'))
})

test('どの経路も同じ長さで、1 ループの時間がぶれない', () => {
  // ノード数が経路でばらつくと、日によって 1 回の長さが変わってしまう
  const byId = new Map(sample.paragraphs.map((p) => [p.id, p]))
  const depths: number[] = []
  const walk = (id: string, n: number) => {
    const p = byId.get(id)
    if (!p) return
    if (p.end) { depths.push(n); return }
    for (const c of p.choices ?? []) walk(c.to, n + 1)
  }
  walk(sample.start, 1)
  assert.ok(depths.length >= 4, '分岐が足りない')
  assert.ok(Math.min(...depths) >= MIN_DEPTH)
  assert.ok(Math.max(...depths) <= MAX_DEPTH)
  assert.equal(new Set(depths).size, 1, `経路の長さがばらついている: ${depths.join(', ')}`)
})

test('どの経路でも戦いの数が同じ', () => {
  const byId = new Map(sample.paragraphs.map((p) => [p.id, p]))
  const counts: number[] = []
  const walk = (id: string, n: number) => {
    const p = byId.get(id)
    if (!p) return
    const next = n + (p.battle ? 1 : 0)
    if (p.end) { counts.push(next); return }
    for (const c of p.choices ?? []) walk(c.to, next)
  }
  walk(sample.start, 0)
  assert.equal(new Set(counts).size, 1, `戦いの数がばらついている: ${counts.join(', ')}`)
})

test('行き止まりを弾く', () => {
  const broken: StoryArea = {
    ...sample,
    paragraphs: sample.paragraphs.map((p) =>
      p.id === 'p7' ? { id: 'p7', text: 'おわり。' } : p,
    ),
  }
  const errors = validateStory(broken)
  assert.ok(errors.some((e) => e.includes('行き止まり')), errors.join('\n'))
})

test('負けたときの結びの書き忘れを弾く', () => {
  const broken: StoryArea = {
    ...sample,
    paragraphs: sample.paragraphs.map((p) =>
      p.id === 'p1' ? { ...p, outroLose: undefined } : p,
    ),
  }
  const errors = validateStory(broken)
  assert.ok(errors.some((e) => e.includes('outroLose')), errors.join('\n'))
})

test('存在しない行き先を弾く', () => {
  const broken: StoryArea = {
    ...sample,
    paragraphs: sample.paragraphs.map((p) =>
      p.id === 'p2' ? { ...p, choices: [{ label: 'すすむ', to: 'p99' }] } : p,
    ),
  }
  assert.ok(validateStory(broken).some((e) => e.includes('行き先が存在しない')))
})

test('長すぎる本文を弾く', () => {
  const broken: StoryArea = {
    ...sample,
    paragraphs: sample.paragraphs.map((p) =>
      p.id === 'p2' ? { ...p, text: 'あ'.repeat(MAX_TEXT_LENGTH + 1) } : p,
    ),
  }
  assert.ok(validateStory(broken).some((e) => e.includes('字以内')))
})

test('漢字を弾く', () => {
  // 小 2 に読めない字が混ざると、読める子にも読めない画面になる
  const broken: StoryArea = {
    ...sample,
    paragraphs: sample.paragraphs.map((p) =>
      p.id === 'p2' ? { ...p, text: '古い橋が かかっている。' } : p,
    ),
  }
  assert.ok(validateStory(broken).some((e) => e.includes('漢字')))
})

test('街へ帰れない循環を弾く', () => {
  const broken: StoryArea = {
    ...sample,
    paragraphs: [
      ...sample.paragraphs.filter((p) => p.id !== 'p4'),
      { id: 'p4', text: 'ぐるぐる まわっている。', choices: [{ label: 'もどる', to: 'p4' }] },
    ],
  }
  const errors = validateStory(broken)
  assert.ok(errors.some((e) => e.includes('街へ帰れない')), errors.join('\n'))
})

test('見本は はじめから入っている話として印づけられている', () => {
  assert.equal(sample.origin, 'default')
  assert.equal(sample.author, undefined)
})

test('子どもが作った話には作者の名前を必ず持たせる', () => {
  // 名前が画面に出ることが「自分の話が動いている」の実体になる
  const noAuthor: StoryArea = { ...sample, origin: 'original' }
  assert.ok(validateStory(noAuthor).some((e) => e.includes('author が無い')))

  const withAuthor: StoryArea = { ...sample, origin: 'original', author: 'たろう' }
  assert.deepEqual(validateStory(withAuthor), [])
})
