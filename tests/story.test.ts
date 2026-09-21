import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  MAX_TEXT_LENGTH,
  MIN_COMBINATIONS,
  countCombinations,
  validateStory,
  type StoryArea,
} from '@/lib/story'
import { STORIES } from '@/lib/stories'

const sample = STORIES.find((s) => s.id === 'area-5') as StoryArea

test('同梱のストーリーがすべて検証を通る', () => {
  for (const area of STORIES) {
    const errors = validateStory(area)
    assert.deepEqual(errors, [], `${area.id}:\n${errors.join('\n')}`)
  }
})

test('最初に開く段のエリアが用意されている', () => {
  // 既定の順序は数字順。1 の段のエリアが無いと、
  // ストーリーモードを開いた初日に遊ぶものが無くなる
  assert.ok(STORIES.some((a) => a.stage === 1), '1 の段のエリアが無い')
})

test('どのエリアも十分な組み合わせを持つ', () => {
  // 同じ散策ばかりだと一度で飽きる。実機で「1 回で終わる」と言われた点
  for (const area of STORIES) {
    const n = countCombinations(area)
    assert.ok(n >= MIN_COMBINATIONS, `${area.id}: ${n} 通りしかない`)
  }
})

test('見本は はじめから入っている話として印づけられている', () => {
  assert.equal(sample.origin, 'default')
  assert.equal(sample.author, undefined)
})

test('子どもが作った話には作者の名前を必ず持たせる', () => {
  // 名前が画面に出ることが「自分の話が動いている」の実体になる
  assert.ok(validateStory({ ...sample, origin: 'original' }).some((e) => e.includes('author が無い')))
  assert.deepEqual(validateStory({ ...sample, origin: 'original', author: 'たろう' }), [])
})

test('負けたときの結びの書き忘れを弾く', () => {
  const broken: StoryArea = {
    ...sample,
    encounters: sample.encounters.map((e, i) => (i === 0 ? { ...e, outroLose: '' } : e)),
  }
  assert.ok(validateStory(broken).some((e) => e.includes('outroLose')))
})

test('存在しないあいてや道を弾く', () => {
  const badEnemy: StoryArea = {
    ...sample,
    encounters: sample.encounters.map((e, i) => (i === 0 ? { ...e, enemy: 'nobody' } : e)),
  }
  assert.ok(validateStory(badEnemy).some((e) => e.includes('あいてが存在しない')))

  const badBranch: StoryArea = {
    ...sample,
    encounters: sample.encounters.map((e, i) => (i === 0 ? { ...e, branch: 'nowhere' } : e)),
  }
  assert.ok(validateStory(badBranch).some((e) => e.includes('道が存在しない')))
})

test('長すぎる本文と漢字を弾く', () => {
  const long: StoryArea = {
    ...sample,
    scenes: sample.scenes.map((s, i) => (i === 0 ? { ...s, text: 'あ'.repeat(MAX_TEXT_LENGTH + 1) } : s)),
  }
  assert.ok(validateStory(long).some((e) => e.includes('字以内')))

  const kanji: StoryArea = {
    ...sample,
    scenes: sample.scenes.map((s, i) => (i === 0 ? { ...s, text: '古い橋が かかっている。' } : s)),
  }
  assert.ok(validateStory(kanji).some((e) => e.includes('漢字')))
})

test('1 回ぶんを引けないほど中身が少ないエリアを弾く', () => {
  // 場面が足りないと散策が組めず、画面が途中で止まる
  const thin: StoryArea = { ...sample, scenes: sample.scenes.slice(0, 1) }
  const errors = validateStory(thin)
  assert.ok(errors.some((e) => e.includes('場面が')), errors.join('\n'))
})

test('道が 1 つしか無いエリアを弾く', () => {
  const single: StoryArea = {
    ...sample,
    branches: sample.branches.slice(0, 1),
  }
  assert.ok(validateStory(single).some((e) => e.includes('道が 2 つ未満')))
})
