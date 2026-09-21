import assert from 'node:assert/strict'
import { test } from 'node:test'
import { computeBests, computeFactStats } from '@/lib/storage/local'
import type { Run } from '@/lib/storage/types'
import { RUNS_TO_CLEAR, STORIES, availableStories, getStory, paragraph, townLine } from '@/lib/stories'

function run(id: string, mode: Run['mode'], totalMs: number): Run {
  return {
    id,
    who: 'child',
    mode,
    stage: 1,
    totalMs,
    correct: 10,
    total: 10,
    at: '2026-01-01T00:00:00.000Z',
    facts: [{ a: 1, b: 2, correct: true, ms: 500 }],
  }
}

test('ストーリー中の戦いはベスト記録に並べない', () => {
  // あちらは時間を競っていない。混ぜると親子の記録比べが成立しなくなる
  const bests = computeBests([run('s', 'story', 1000), run('a', 'attack', 9000)])
  assert.equal(bests.length, 1)
  assert.equal(bests[0].totalMs, 9000)
})

test('mode の無い古い記録はタイムアタックとして扱う', () => {
  const legacy = { ...run('old', undefined, 8000) }
  delete (legacy as { mode?: unknown }).mode
  assert.equal(computeBests([legacy]).length, 1)
})

test('習熟度はどちらの遊び方でも積む', () => {
  // どちらで解いても覚えたことに変わりはない
  const stats = computeFactStats([run('s', 'story', 1000), run('a', 'attack', 9000)], 'child')
  assert.equal(stats['1x2'].attempts, 2)
})

test('未解放の段のおはなしは出さない', () => {
  // 話だけ先に進むと、段を 1 つずつ解放している意味が無くなる
  assert.deepEqual(availableStories([1]).map((s) => s.id), ['area-1'])
  assert.deepEqual(availableStories([1, 5]).map((s) => s.id), ['area-1', 'area-5'])
  assert.deepEqual(availableStories([2]), [])
})

test('街のセリフは進行度で変わり、超えても最後のものが残る', () => {
  const area = getStory('area-1')
  assert.ok(area)
  assert.notEqual(townLine(area, 0).line, townLine(area, 3).line)
  assert.equal(townLine(area, 99).line, townLine(area, 3).line)
})

test('すべてのおはなしが、街へ帰るまでに必要な回数ぶんの住人のセリフを持つ', () => {
  for (const area of STORIES) {
    const max = Math.max(...area.town.map((t) => t.progress))
    assert.ok(max >= RUNS_TO_CLEAR, `${area.id}: 進行度 ${RUNS_TO_CLEAR} のセリフが無い`)
  }
})

test('はじまりの場面から順にたどれる', () => {
  for (const area of STORIES) {
    assert.ok(paragraph(area, area.start), `${area.id}: start が引けない`)
  }
})
