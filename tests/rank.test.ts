import assert from 'node:assert/strict'
import { test } from 'node:test'
import { QUESTIONS_PER_RUN } from '../src/lib/kuku'
import {
  capByCorrect,
  factTargetMs,
  formatTargetSec,
  goldTargetMs,
  higherRank,
  nextRankGap,
  PACE_FACTOR,
  rankAbove,
  rankByTime,
  rankOf,
  rankThresholds,
  RANK_LABEL,
  RANK_ORDER,
  type Rank,
} from '../src/lib/rank'

const ALL = [1, 2, 3, 4, 5, 6, 7, 8, 9]

test('ランクはゴールドからクリアの順に並んでいる', () => {
  assert.deepEqual(RANK_ORDER, ['gold', 'silver', 'bronze', 'clear'])
  for (const r of RANK_ORDER) assert.ok(RANK_LABEL[r].length > 0)
})

test('rankAbove はゴールドの上を返さない', () => {
  assert.equal(rankAbove('clear'), 'bronze')
  assert.equal(rankAbove('bronze'), 'silver')
  assert.equal(rankAbove('silver'), 'gold')
  assert.equal(rankAbove('gold'), null)
})

test('higherRank は良い方を返す', () => {
  assert.equal(higherRank('silver', 'clear'), 'silver')
  assert.equal(higherRank('clear', 'gold'), 'gold')
  assert.equal(higherRank('bronze', 'bronze'), 'bronze')
})

test('段が進むほどゴールドの目標は甘くなる', () => {
  // 1 の段と 7 の段を同じ秒数で測ると、1 の段は必ずゴールド、
  // 7 の段は一生ゴールドなしになる。これを防ぐことが段別にした理由。
  const targets = ALL.map((s) => goldTargetMs(s, ALL))
  for (let i = 1; i < targets.length; i += 1) {
    if (ALL[i] === 5) continue // 5 の段は 4 の段より易しい（数えてたどれる）
    assert.ok(
      targets[i] > targets[i - 1],
      `${ALL[i]} の段の目標が ${ALL[i - 1]} の段より厳しい`,
    )
  }
  assert.ok(goldTargetMs(1, ALL) < goldTargetMs(9, ALL) * 0.75, '1 の段と 9 の段の差が小さすぎる')
})

test('1 の段と 5 の段は積の割に目標が短い', () => {
  // 1 をかける問題は答えがそのまま。5 の段は数えてたどれる
  assert.ok(factTargetMs(1, 9) < factTargetMs(3, 3))
  assert.ok(factTargetMs(5, 8) < factTargetMs(6, 8))
  // ぞろ目は覚えやすい
  assert.ok(factTargetMs(7, 7) < factTargetMs(7, 8))
})

test('すべてのランクが 1 回 1 分の中に収まる', () => {
  // 設計メモの「1 回 1 分で終わる長さ」を、ランクの境目が壊してはいけない。
  // ブロンズの境目が 60 秒を超えると、最下位のランクが
  // 「1 分では終わらない遊び」を前提にしてしまう。
  for (const stage of [...ALL, 'mix' as const]) {
    const t = rankThresholds(stage, ALL, 'slow')
    assert.ok(t.bronze < 60_000, `${stage}: ブロンズが ${t.bronze}ms で 1 分を超える`)
  }
})

test('きびしさで目標がずれる', () => {
  const normal = goldTargetMs(7, ALL, 'normal')
  assert.ok(goldTargetMs(7, ALL, 'fast') < normal)
  assert.ok(goldTargetMs(7, ALL, 'slow') > normal)
  assert.equal(goldTargetMs(7, ALL, 'fast'), normal * PACE_FACTOR.fast)
})

test('mix の目標は解放済みの段で決まる', () => {
  // ぜんぶモードは解放が進むほど本当に難しくなる。目標も一緒に動く
  assert.ok(goldTargetMs('mix', [1, 2]) < goldTargetMs('mix', ALL))
})

test('タイムの境目でランクが変わる', () => {
  const t = rankThresholds(3, ALL)
  assert.equal(rankByTime(t.gold - 1, 3, ALL), 'gold')
  assert.equal(rankByTime(t.gold, 3, ALL), 'gold', '境目はちょうどで取れる')
  assert.equal(rankByTime(t.gold + 1, 3, ALL), 'silver')
  assert.equal(rankByTime(t.silver + 1, 3, ALL), 'bronze')
  assert.equal(rankByTime(t.bronze + 1, 3, ALL), 'clear')
  assert.equal(rankByTime(60 * 60 * 1000, 3, ALL), 'clear', 'どれだけ遅くてもクリアは付く')
})

test('10 問終えればランクは必ず付く', () => {
  // 減点しない方針そのもの。付かないランクを作らない
  for (let correct = 0; correct <= QUESTIONS_PER_RUN; correct += 1) {
    const rank = rankOf(
      { totalMs: 999_999, correct, total: QUESTIONS_PER_RUN, stage: 7 },
      ALL,
    )
    assert.ok(RANK_ORDER.includes(rank))
  }
})

test('速いだけではゴールドにならない', () => {
  // 当てずっぽうで連打した方が速くなる形にしてはいけない
  const fast = { totalMs: 1000, total: QUESTIONS_PER_RUN, stage: 7 }
  assert.equal(rankOf({ ...fast, correct: 10 }, ALL), 'gold')
  assert.equal(rankOf({ ...fast, correct: 9 }, ALL), 'silver')
  assert.equal(rankOf({ ...fast, correct: 8 }, ALL), 'bronze')
  assert.equal(rankOf({ ...fast, correct: 7 }, ALL), 'clear')
  assert.equal(rankOf({ ...fast, correct: 0 }, ALL), 'clear')
})

test('正答数の上限とタイムの低い方が採られる', () => {
  const t = rankThresholds(7, ALL)
  // 全問正解でも遅ければ上がらない
  assert.equal(rankOf({ totalMs: t.bronze + 1, correct: 10, total: 10, stage: 7 }, ALL), 'clear')
  // 1 問落として、タイムはシルバー相当 -> シルバー（上限に当たっていない）
  assert.equal(rankOf({ totalMs: t.silver - 1, correct: 9, total: 10, stage: 7 }, ALL), 'silver')
})

test('capByCorrect は落とした数だけ上限を下げる', () => {
  assert.equal(capByCorrect(10, 10), 'gold')
  assert.equal(capByCorrect(9, 10), 'silver')
  assert.equal(capByCorrect(8, 10), 'bronze')
  assert.equal(capByCorrect(7, 10), 'clear')
  assert.equal(capByCorrect(1, 10), 'clear')
})

test('次のランクまでの差は 1 つ上の分だけ返す', () => {
  const t = rankThresholds(7, ALL)
  // クリアにいるので、見せるのはブロンズまでの差。ゴールドまでの距離は見せない
  const gap = nextRankGap({ totalMs: t.bronze + 2000, correct: 10, total: 10, stage: 7 }, ALL)
  assert.equal(gap?.rank, 'bronze')
  assert.ok(gap && Math.abs(gap.ms - 2000) < 1)

  // ブロンズにいるならシルバーまでの差
  const gap2 = nextRankGap({ totalMs: t.silver + 2000, correct: 10, total: 10, stage: 7 }, ALL)
  assert.equal(gap2?.rank, 'silver')
  assert.ok(gap2 && Math.abs(gap2.ms - 2000) < 1)
})

test('ゴールドのときは次の差を出さない', () => {
  const t = rankThresholds(7, ALL)
  assert.equal(nextRankGap({ totalMs: t.gold - 1, correct: 10, total: 10, stage: 7 }, ALL), null)
})

test('正答数の上限で止まっているときは秒数を出さない', () => {
  const t = rankThresholds(7, ALL)
  // 8/10 の上限はブロンズ。タイムもブロンズなら、速くしてもシルバーには届かない。
  // ここで「シルバーまであと n 秒」と出すと嘘になる
  const run = { totalMs: t.silver + 1, correct: 8, total: 10, stage: 7 }
  assert.equal(rankOf(run, ALL), 'bronze')
  assert.equal(nextRankGap(run, ALL), null)

  // 9/10 でタイムがゴールド相当。上限のシルバーで止まっているので差は出さない
  const run2 = { totalMs: t.gold - 1, correct: 9, total: 10, stage: 7 }
  assert.equal(rankOf(run2, ALL), 'silver')
  assert.equal(nextRankGap(run2, ALL), null)
})

test('差が出るときは必ず正の秒数', () => {
  const stages: Array<number | 'mix'> = [...ALL, 'mix']
  for (const stage of stages) {
    for (const correct of [10, 9, 8, 5]) {
      for (const totalMs of [5_000, 20_000, 30_000, 45_000, 90_000]) {
        const gap = nextRankGap({ totalMs, correct, total: 10, stage }, ALL)
        if (gap === null) continue
        assert.ok(gap.ms > 0, `${stage}/${correct}/${totalMs} で差が ${gap.ms}`)
        // 返したランクは実際に 1 つ上
        const current: Rank = rankOf({ totalMs, correct, total: 10, stage }, ALL)
        assert.equal(gap.rank, rankAbove(current))
      }
    }
  }
})

test('見せる目標の秒数は切り捨てる', () => {
  // 22.09 を「22.1 びょう」と出すと、22.1 秒で走った子がゴールドにならない。
  // 表示した秒数で必ず取れることを優先する
  assert.equal(formatTargetSec(22_090), '22.0')
  assert.equal(formatTargetSec(22_000), '22.0')
  assert.equal(formatTargetSec(15_990), '15.9')

  for (const stage of [...ALL, 'mix' as const]) {
    for (const pace of ['fast', 'normal', 'slow'] as const) {
      const gold = goldTargetMs(stage, ALL, pace)
      const shown = Number(formatTargetSec(gold)) * 1000
      assert.ok(shown <= gold, `${stage}/${pace}: 表示 ${shown}ms が目標 ${gold}ms を上回る`)
      assert.equal(rankByTime(shown, stage, ALL, pace), 'gold', '表示どおりの秒数で取れない')
    }
  }
})
