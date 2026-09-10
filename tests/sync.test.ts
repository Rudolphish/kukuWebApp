import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mergeRuns } from '@/lib/storage/local'
import { DEFAULT_DEVICE, DEFAULT_SETTINGS, type Run } from '@/lib/storage/types'

function run(id: string, at: string, who: Run['who'] = 'child'): Run {
  return { id, who, stage: 5, totalMs: 10000, correct: 10, total: 10, at, facts: [] }
}

test('同じ記録が端末とリモートの両方にあっても 1 件になる', () => {
  const local = [run('b', '2026-01-02T00:00:00.000Z'), run('a', '2026-01-01T00:00:00.000Z')]
  const remote = [run('b', '2026-01-02T00:00:00.000Z'), run('c', '2026-01-03T00:00:00.000Z', 'parent')]
  const merged = mergeRuns(local, remote)
  assert.equal(merged.length, 3)
  assert.deepEqual(merged.map((r) => r.id), ['c', 'b', 'a'])
})

test('相手の端末の記録だけがある場合も取り込める', () => {
  const merged = mergeRuns([], [run('p1', '2026-01-05T00:00:00.000Z', 'parent')])
  assert.equal(merged.length, 1)
  assert.equal(merged[0].who, 'parent')
})

test('端末に記録があってリモートが空でも失わない', () => {
  const merged = mergeRuns([run('a', '2026-01-01T00:00:00.000Z')], [])
  assert.equal(merged.length, 1)
  assert.equal(merged[0].id, 'a')
})

test('併合した結果は新しい順に並ぶ', () => {
  const merged = mergeRuns(
    [run('old', '2025-12-01T00:00:00.000Z')],
    [run('new', '2026-03-01T00:00:00.000Z'), run('mid', '2026-01-15T00:00:00.000Z')],
  )
  assert.deepEqual(merged.map((r) => r.id), ['new', 'mid', 'old'])
})

test('共有設定と端末設定が混ざっていない', () => {
  // 合言葉と持ち主が同期されると、子どもの記録が親のものとして残る事故になる
  const shared = Object.keys(DEFAULT_SETTINGS)
  for (const key of ['familyCode', 'role', 'voice']) {
    assert.ok(!shared.includes(key), `${key} は共有設定に入れてはいけない`)
  }
  const deviceKeys = Object.keys(DEFAULT_DEVICE)
  for (const key of ['stageOrder', 'unlockedCount', 'enemyNames', 'themeId']) {
    assert.ok(!deviceKeys.includes(key), `${key} は端末設定ではなく共有設定`)
  }
})

test('端末の既定は子どもの端末で、合言葉は空', () => {
  // 親の端末だけが明示的に切り替える。既定が parent だと記録が取り違えられる
  assert.equal(DEFAULT_DEVICE.role, 'child')
  assert.equal(DEFAULT_DEVICE.familyCode, '')
})
