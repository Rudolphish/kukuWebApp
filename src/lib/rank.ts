import { factsFor, QUESTIONS_PER_RUN, type Fact } from './kuku'
import type { RankPace, StageKey } from './storage/types'

/**
 * タイムに応じたランク。
 *
 * 設計メモの「ポイント・コイン・ガチャで釣らない」に反しないか。反しない。
 * あの項が禁じているのは「達成と無関係な配布」であり、同じ項は
 * 「進度の可視化として設計すれば健全」と明記している。
 * ランクは達成そのものの尺度であって、達成とは別に配る餌ではない。
 *
 * そのうえで、この仕組みが壊してはいけないものが 2 つある。
 *
 * 1. 減点しないこと。最下位のランクを失敗の名前にしない。
 *    10 問終えた時点で必ず「クリア」は付く。付かないランクはない。
 * 2. 苦手を子どもに見せないこと。だから表示するのは常に
 *    「1 つ上のランクまであと何秒」だけにする。ゴールドまでの距離を
 *    最下位の子に見せると、それは苦手の通知になる。
 */
export type Rank = 'gold' | 'silver' | 'bronze' | 'clear'

/** 上から順。比較の基準になるので順序を変えないこと。 */
export const RANK_ORDER: Rank[] = ['gold', 'silver', 'bronze', 'clear']

export const RANK_LABEL: Record<Rank, string> = {
  gold: 'ゴールド',
  silver: 'シルバー',
  bronze: 'ブロンズ',
  clear: 'クリア',
}

export const RANK_MARK: Record<Rank, string> = {
  gold: '🥇',
  silver: '🥈',
  bronze: '🥉',
  clear: '⭐',
}

/** 高いほうを返す。 */
export function higherRank(a: Rank, b: Rank): Rank {
  return RANK_ORDER.indexOf(a) <= RANK_ORDER.indexOf(b) ? a : b
}

/** 1 つ上のランク。ゴールドの上はない。 */
export function rankAbove(rank: Rank): Rank | null {
  const i = RANK_ORDER.indexOf(rank)
  return i <= 0 ? null : RANK_ORDER[i - 1]
}

/**
 * ランクの厳しさ。親が 1 段ずらせる。
 *
 * しきい値を固定値で決め打つと、速ければ常にゴールド、遅ければ一生ゴールドなしになる。
 * 実際の子どもの速さは実機で遊ばせるまで分からないので、親が 1 段ずらせる形にしておく。
 * 自己ベストに追従させる案は採らなかった（理由は docs/design-notes.md）。
 *
 * 型は保存層側（storage/types.ts）にある。
 */
export type { RankPace }
export const PACE_FACTOR: Record<RankPace, number> = {
  fast: 0.85,
  normal: 1,
  slow: 1.25,
}

export const PACE_LABEL: Record<RankPace, string> = {
  fast: 'きびしめ',
  normal: 'ふつう',
  slow: 'ゆっくりめ',
}

/**
 * 1 問あたりのゴールド目標（ms）。
 *
 * 段ごとに難しさが違うので、全段で同じ秒数にはできない。
 * 1 の段の 10 問と 7 の段の 10 問を同じ秒数で測ると、
 * 1 の段は必ずゴールド、7 の段は一生ゴールドなしになる。
 *
 * 内訳は 3 つ。
 * - 読んでキーを 1 つ押すまでの固定費
 * - 2 桁の答えは押す回数が 1 回増える
 * - 積が大きいほど思い出すのに時間がかかる。ただし 1・2・5 の段は
 *   数えてたどれるので安く、ぞろ目は覚えやすいので安い
 */
export function factTargetMs(a: number, b: number): number {
  const product = a * b
  const base = 1500
  const secondDigit = product >= 10 ? 450 : 0
  let recall = 95 * Math.sqrt(product)
  if (a === 1 || b === 1) recall *= 0.3
  else if (a === 2 || b === 2 || a === 5 || b === 5) recall *= 0.65
  if (a === b) recall *= 0.85
  return base + secondDigit + recall
}

/**
 * その段のゴールド目標（ms）。
 *
 * 引かれた 10 問ではなく「段」で決める。引かれた問題で決めると、
 * 同じ記録が結果画面とホームで違うランクに見えることがある。
 * 段で決めれば、その段のゴールドは 1 つの秒数として言い切れる。
 */
export function goldTargetMs(
  stage: StageKey,
  unlocked: number[],
  pace: RankPace = 'normal',
): number {
  const facts: Fact[] = factsFor(stage, unlocked)
  const mean = facts.reduce((sum, f) => sum + factTargetMs(f.a, f.b), 0) / facts.length
  return mean * QUESTIONS_PER_RUN * PACE_FACTOR[pace]
}

/**
 * 目標として見せる秒数。切り捨てる。
 *
 * 22.09 秒を四捨五入して「22.1 びょう」と出すと、22.1 秒で走った子が
 * ゴールドにならない。表示した秒数で必ず取れることを優先する。
 * 2 桁まで出さないのは、追いかける的が細かすぎると的にならないため。
 */
export function formatTargetSec(ms: number): string {
  return (Math.floor(ms / 100) / 10).toFixed(1)
}

/** ゴールド・シルバー・ブロンズの境目（ms）。 */
export function rankThresholds(
  stage: StageKey,
  unlocked: number[],
  pace: RankPace = 'normal',
): Record<'gold' | 'silver' | 'bronze', number> {
  const gold = goldTargetMs(stage, unlocked, pace)
  return { gold, silver: gold * 1.3, bronze: gold * 1.7 }
}

/**
 * 正答数で届く上限。
 *
 * 速いだけでゴールドが取れると、覚えていなくても当てずっぽうで連打した方が速くなる。
 * ゴールドは「全部あっていて、しかも速い」の名前にする。
 * ただし足りなかった分を罰にはしない。下げるのは上限だけで、ランク自体は必ず付く。
 */
export function capByCorrect(correct: number, total: number): Rank {
  const missed = total - correct
  if (missed <= 0) return 'gold'
  if (missed === 1) return 'silver'
  if (missed === 2) return 'bronze'
  return 'clear'
}

/** タイムだけで見たランク。 */
export function rankByTime(
  totalMs: number,
  stage: StageKey,
  unlocked: number[],
  pace: RankPace = 'normal',
): Rank {
  const t = rankThresholds(stage, unlocked, pace)
  if (totalMs <= t.gold) return 'gold'
  if (totalMs <= t.silver) return 'silver'
  if (totalMs <= t.bronze) return 'bronze'
  return 'clear'
}

export type RankInput = {
  totalMs: number
  correct: number
  total: number
  stage: StageKey
}

/** その記録のランク。タイムで決め、正答数で上限をかける。 */
export function rankOf(run: RankInput, unlocked: number[], pace: RankPace = 'normal'): Rank {
  const byTime = rankByTime(run.totalMs, run.stage, unlocked, pace)
  const cap = capByCorrect(run.correct, run.total)
  // RANK_ORDER は上から順なので、添字の大きい方が低い
  return RANK_ORDER.indexOf(byTime) >= RANK_ORDER.indexOf(cap) ? byTime : cap
}

/**
 * 1 つ上のランクまでの差。
 *
 * ゴールドまでの距離ではなく「次」までの距離だけを返す。
 * クリアの子にゴールドまでの差を見せると、それは苦手の通知になる。
 * 正答数が足りなくて上限に当たっている場合は秒数の話にならないので null を返す。
 */
export function nextRankGap(
  run: RankInput,
  unlocked: number[],
  pace: RankPace = 'normal',
): { rank: Rank; ms: number } | null {
  const current = rankOf(run, unlocked, pace)
  const target = rankAbove(current)
  if (target === null) return null

  // 正答数の上限より上は、速くしても届かない。秒数を出すと嘘になる
  const cap = capByCorrect(run.correct, run.total)
  if (RANK_ORDER.indexOf(target) < RANK_ORDER.indexOf(cap)) return null

  const t = rankThresholds(run.stage, unlocked, pace)
  const limit = target === 'gold' ? t.gold : target === 'silver' ? t.silver : t.bronze
  const ms = run.totalMs - limit
  return ms > 0 ? { rank: target, ms } : null
}
