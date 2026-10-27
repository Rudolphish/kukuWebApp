import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import area1 from '../src/data/stories/area-1.json'
import { validateStory, type StoryArea } from '../src/lib/story'
import {
  brokenOrders,
  nextBuildHour,
  orderedToday,
  readyAreas,
  storyProblems,
  type StoryOrder,
} from '../src/lib/storage/stories'
import { buildPrompt, promptTemplate, seedText, stamp } from '../scripts/stories'

const TEMPLATE_MD = readFileSync(
  path.join(process.cwd(), 'docs', 'story-prompt.md'),
  'utf8',
)

function order(partial: Partial<StoryOrder>): StoryOrder {
  return {
    id: 'story-1',
    status: 'ordered',
    stage: 3,
    author: 'そうた',
    seed: { place: 'うみ', who: 'ねこの きし', mood: 'ふしぎ' },
    area: null,
    error: null,
    orderedAt: '2026-10-27T01:00:00.000Z',
    ...partial,
  }
}

// --- プロンプトの組み立て ---

test('プロンプトは docs/story-prompt.md から取り出す', () => {
  // 親が手で投げるときと同じ文面を使う。二重に持つと必ず片方が古くなる
  const template = promptTemplate(TEMPLATE_MD)
  assert.ok(template.includes('【ここに子どもが言ったこと】'))
  assert.ok(template.includes('JSON'))
  assert.ok(!template.includes('## プロンプト本文'), '見出しまで拾っている')
})

test('プロンプト本文が見つからなければ落とす', () => {
  // 黙って空のプロンプトを投げると、料金だけかかって何も出ない
  assert.throws(() => promptTemplate('# 見出しだけ'))
  assert.throws(() =>
    promptTemplate('## プロンプト本文（ここから下をコピー）\n差し込み口なし\n## プロンプト本文（ここまで）'),
  )
})

test('子どもの種がプロンプトに入り、差し込み口は残らない', () => {
  const template = promptTemplate(TEMPLATE_MD)
  const prompt = buildPrompt(template, { place: 'うみ', who: 'ねこの きし', mood: 'ふしぎ' }, 5)
  assert.ok(prompt.includes('ねこの きし'))
  assert.ok(prompt.includes('うみ'))
  assert.ok(prompt.includes('5 の だん'))
  assert.ok(!prompt.includes('【ここに子どもが言ったこと】'))
})

test('種が空でも組み立てられる', () => {
  // 入力を空のまま送れてしまっても、生成が止まらない方を採る
  const prompt = buildPrompt(promptTemplate(TEMPLATE_MD), {}, 1)
  assert.ok(prompt.includes('おまかせ'))
  assert.ok(!prompt.includes('undefined'))
  assert.ok(seedText({}, 1).includes('1 の だん'))
})

// --- 身元の欄はこちらで入れる ---

test('id・段・作者はモデルに決めさせない', () => {
  const area = { ...(area1 as StoryArea), id: 'area-3', stage: 9, author: 'だれか' }
  const stamped = stamp(area, { id: 'story-x', stage: 5, author: 'そうた' })
  assert.equal(stamped.id, 'story-x')
  assert.equal(stamped.stage, 5)
  assert.equal(stamped.author, 'そうた')
  assert.equal(stamped.origin, 'original')
})

test('身元を入れ直した話は検査を通る', () => {
  // 生成物は必ず validateStory を通す。この経路が壊れていないことを固定する
  const stamped = stamp(area1 as StoryArea, { id: 'story-x', stage: 5, author: 'そうた' })
  assert.deepEqual(validateStory(stamped), [])
})

test('作者が無い original は検査で弾かれる', () => {
  const broken = { ...(area1 as StoryArea), origin: 'original' as const, author: '' }
  assert.ok(validateStory(broken).length > 0)
})

// --- 注文の数え方 ---

test('その日に出した注文だけを数える', () => {
  const now = new Date('2026-10-27T12:00:00.000Z')
  const list = [
    order({ id: 'a', orderedAt: '2026-10-27T01:00:00.000Z' }),
    order({ id: 'b', orderedAt: '2026-10-27T23:00:00.000Z' }),
    order({ id: 'c', orderedAt: '2026-10-26T23:00:00.000Z' }),
  ]
  assert.equal(orderedToday(list, now), 2)
  assert.equal(orderedToday([], now), 0)
})

// --- 遊べる話の取り出し ---

test('できあがった話だけが遊べる形で出てくる', () => {
  const ready = order({ id: 'r', status: 'ready', area: area1 as StoryArea })
  const list = [
    ready,
    order({ id: 'o', status: 'ordered' }),
    order({ id: 'f', status: 'failed', error: 'だめだった' }),
    // ready なのに中身が無い行。リモートが壊れていても画面を落とさない
    order({ id: 'broken', status: 'ready', area: null }),
  ]
  const areas = readyAreas(list)
  assert.equal(areas.length, 1)
  assert.equal(areas[0].id, area1.id)
})

// --- 次に話が作られる時刻 ---

test('次に作られる時刻は、今より後の最初のもの', () => {
  const at = (h: number) => new Date(`2026-10-27T${String(h).padStart(2, '0')}:30:00`)
  assert.equal(nextBuildHour([7, 12, 18], at(6)), 7)
  assert.equal(nextBuildHour([7, 12, 18], at(7)), 12)
  assert.equal(nextBuildHour([7, 12, 18], at(13)), 18)
  // 今日はもう無いので、明日の最初
  assert.equal(nextBuildHour([7, 12, 18], at(20)), 7)
})

test('時刻の指定が壊れていても落ちない', () => {
  assert.equal(nextBuildHour([], new Date()), null)
  assert.equal(nextBuildHour([99, -1, 1.5], new Date()), null)
  // 順不同・重複も揃えて扱う
  assert.equal(nextBuildHour([18, 7, 7, 12], new Date('2026-10-27T08:00:00')), 12)
})

// --- 壊れた話は読む側でも弾く ---

test('公開されていても検査に通らなければ遊べない', () => {
  // Supabase は手でも触れる。書き手を信じるだけにはしない
  const broken = { ...(area1 as StoryArea), scenes: [] } as StoryArea
  const list = [
    order({ id: 'ok', status: 'ready', area: area1 as StoryArea }),
    order({ id: 'ng', status: 'ready', area: broken }),
  ]
  assert.equal(readyAreas(list).length, 1)
  assert.equal(brokenOrders(list).length, 1)
  assert.equal(brokenOrders(list)[0].id, 'ng')
  assert.ok(storyProblems(list[1]).length > 0)
  assert.deepEqual(storyProblems(list[0]), [])
})

test('中身が入っていない ready も弾く', () => {
  const list = [order({ id: 'empty', status: 'ready', area: null })]
  assert.equal(readyAreas(list).length, 0)
  assert.equal(brokenOrders(list).length, 1)
})

test('作成中のものは壊れていない扱い', () => {
  const list = [order({ id: 'o', status: 'ordered' })]
  assert.deepEqual(storyProblems(list[0]), [])
  assert.equal(brokenOrders(list).length, 0)
})
