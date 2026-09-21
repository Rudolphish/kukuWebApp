import assert from 'node:assert/strict'
import { test } from 'node:test'
import { computeBests, computeFactStats } from '@/lib/storage/local'
import type { Run } from '@/lib/storage/types'
import {
  RUNS_TO_CLEAR,
  STORIES,
  availableStories,
  buildWalk,
  getStory,
  townLine,
} from '@/lib/stories'
import { ENCOUNTERS_PER_WALK, SCENES_PER_WALK, type StoryArea } from '@/lib/story'

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

const area = getStory('area-1') as StoryArea

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
  const stats = computeFactStats([run('s', 'story', 1000), run('a', 'attack', 9000)], 'child')
  assert.equal(stats['1x2'].attempts, 2)
})

test('未解放の段のおはなしは出さない', () => {
  assert.deepEqual(availableStories([1]).map((s) => s.id), ['area-1'])
  assert.deepEqual(availableStories([2]), [])
})

test('街のセリフは進行度で変わり、超えても最後のものが残る', () => {
  assert.notEqual(townLine(area, 0).line, townLine(area, 3).line)
  assert.equal(townLine(area, 99).line, townLine(area, 3).line)
})

test('すべてのおはなしが、街へ帰るまでに必要な回数ぶんの住人のセリフを持つ', () => {
  for (const a of STORIES) {
    const max = Math.max(...a.town.map((t) => t.progress))
    assert.ok(max >= RUNS_TO_CLEAR, `${a.id}: 進行度 ${RUNS_TO_CLEAR} のセリフが無い`)
  }
})

test('散策の骨組みは毎回おなじ。場面と出会いが交互に並ぶ', () => {
  // ここが変わると 1 回の長さがぶれ、「1 ループ 3 分」の歯止めが効かなくなる
  for (const a of STORIES) {
    for (const branch of a.branches) {
      const walk = buildWalk(a, branch.id, [])
      assert.deepEqual(
        walk.map((s) => s.kind),
        ['scene', 'encounter', 'scene', 'encounter'],
        `${a.id} / ${branch.id}`,
      )
      assert.equal(walk.filter((s) => s.kind === 'scene').length, SCENES_PER_WALK)
      assert.equal(walk.filter((s) => s.kind === 'encounter').length, ENCOUNTERS_PER_WALK)
    }
  }
})

test('1 回の散策の中で同じ場面や同じあいてが重ならない', () => {
  for (let i = 0; i < 50; i += 1) {
    const walk = buildWalk(area, 'flower', [])
    assert.equal(new Set(walk.map((s) => s.id)).size, walk.length)
  }
})

test('選んだ道に対応するあいてだけが出る', () => {
  const flowerEnemies = new Set(
    area.encounters.filter((e) => e.branch === 'flower').map((e) => e.enemy),
  )
  for (let i = 0; i < 30; i += 1) {
    for (const step of buildWalk(area, 'flower', [])) {
      if (step.kind === 'encounter') {
        assert.ok(flowerEnemies.has(step.enemy.id), `${step.enemy.id} は はなばたけの みちに居ない`)
      }
    }
  }
})

test('直近に出たものは次の散策で避ける', () => {
  const first = buildWalk(area, 'flower', [])
  const second = buildWalk(area, 'flower', first.map((s) => s.id))
  for (const step of second) {
    assert.ok(!first.some((f) => f.id === step.id), `${step.id} が続けて出た`)
  }
})

test('何度歩いても散策が組めなくならない', () => {
  // 直近に出たものを避けきれない場合でも、引き直して必ず 4 歩ぶん揃える
  let recent: string[] = []
  for (let i = 0; i < 40; i += 1) {
    const walk = buildWalk(area, i % 2 === 0 ? 'flower' : 'stream', recent)
    assert.equal(walk.length, SCENES_PER_WALK + ENCOUNTERS_PER_WALK, `${i} 回目で組めなかった`)
    recent = [...recent, ...walk.map((s) => s.id)].slice(-12)
  }
})
