import assert from 'node:assert/strict'
import { test } from 'node:test'
import sample from './fixtures/novel-sample.json'
import { MAX_PAGE_LENGTH, MIN_NOVEL_PAGES, isNovel, validateStory, type NovelArea } from '@/lib/story'
import { areaEmoji } from '@/lib/stories'
import { canContinue, sequelCast } from '@/lib/storage/stories'
import { seedText } from '../scripts/stories'

const novel = { ...(sample as NovelArea), id: 'story-n', stage: 1 }

test('小説の形の見本は検査を通る', () => {
  assert.equal(isNovel(novel), true)
  assert.deepEqual(validateStory(novel), [])
})

test('漢字が入ったページは落ちる', () => {
  const pages = novel.pages.map((p, i) => (i === 2 ? { ...p, text: '森の なか' } : p))
  assert.ok(validateStory({ ...novel, pages }).some((e) => e.includes('pages[2]') && e.includes('漢字')))
})

test('長すぎるページは落ちる', () => {
  const pages = novel.pages.map((p, i) => (i === 0 ? { text: 'あ'.repeat(MAX_PAGE_LENGTH + 1) } : p))
  assert.ok(validateStory({ ...novel, pages }).some((e) => e.includes('pages[0]')))
})

test('ページが少なすぎると落ちる。筋が立たない', () => {
  const pages = novel.pages.slice(0, MIN_NOVEL_PAGES - 1)
  assert.ok(validateStory({ ...novel, pages }).some((e) => e.startsWith('pages が')))
})

test('負けたときの結びが無いと落ちる', () => {
  const errors = validateStory({ ...novel, ending: { ...novel.ending, lose: [] } })
  assert.ok(errors.some((e) => e.includes('ending.lose')))
})

test('勉強を名乗る言葉は落ちる', () => {
  const pages = novel.pages.map((p, i) => (i === 1 ? { ...p, text: 'きょうは テストの ひ' } : p))
  assert.ok(validateStory({ ...novel, pages }).some((e) => e.includes('テスト')))
})

test('壊れたデータでも検査は落ちずに指摘を返す', () => {
  const broken = { format: 'novel', id: 'x', name: '', origin: 'original', author: 'み', stage: 1 } as unknown as NovelArea
  assert.ok(validateStory(broken).length > 0)
})

test('カードの絵文字は主人公、つづきの候補は登場人物と しょうぶの あいて', () => {
  assert.equal(areaEmoji(novel), '🐱')
  const cast = sequelCast(novel)
  assert.deepEqual(cast, ['ミケ', 'ホーホー', 'ほたるの ピカ', 'かぞえやの ルル'])
  assert.equal(canContinue(novel), true)
})

test('小説の形の つづきの指示文には、なかま と まえの おわり が入る', () => {
  const text = seedText({ who: 'ミケ', continues: { id: novel.id, name: novel.name } }, 1, novel)
  assert.ok(text.includes(`「${novel.name}」の つづき`))
  assert.ok(text.includes('ミケ（🐱）'))
  assert.ok(text.includes('かぞえやの ルル（🦊）'))
  assert.ok(text.includes('まえの おはなしの おわり:'))
})
