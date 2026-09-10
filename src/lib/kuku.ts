import { factKey, type FactStats, type StageKey } from './storage/types'

export type Fact = { a: number; b: number }
export type Question = Fact & { answer: number }

/** 1 回 1 分で終わる長さ。物足りないくらいでちょうどよい。 */
export const QUESTIONS_PER_RUN = 10

/** 出題対象の段。stageOrder の先頭から unlockedCount 段ぶん。 */
export function unlockedStages(stageOrder: number[], unlockedCount: number): number[] {
  return stageOrder.slice(0, Math.max(1, Math.min(unlockedCount, stageOrder.length)))
}

/** その段（または混合）に含まれる全問題。 */
export function factsFor(stage: StageKey, unlocked: number[]): Fact[] {
  const stages = stage === 'mix' ? unlocked : [stage]
  const facts: Fact[] = []
  for (const s of stages) {
    for (let b = 1; b <= 9; b += 1) facts.push({ a: s, b })
  }
  return facts
}

/**
 * 出題の重み。
 *
 * 間違えた問題は「減点」ではなく「出題頻度」で扱う。ライフも連続正解も持たない。
 * 小 2 が一度「自分は苦手だ」と結論づけると戻すのが難しいので、
 * 苦手さは画面に出さず、出題の偏りとしてだけ効かせる。
 */
export function weightOf(fact: Fact, stats: FactStats): number {
  const s = stats[factKey(fact.a, fact.b)]
  if (!s || s.attempts === 0) return 3 // まだ出していない問題を優先する
  let w = 1
  w += (s.wrong / s.attempts) * 4
  if (s.lastWrong) w += 3
  if (s.avgMs > 4000) w += 1
  return Math.max(0.5, w)
}

function weightedPick(pool: Fact[], stats: FactStats, rand: () => number): Fact {
  const weights = pool.map((f) => weightOf(f, stats))
  const total = weights.reduce((sum, w) => sum + w, 0)
  let r = rand() * total
  for (let i = 0; i < pool.length; i += 1) {
    r -= weights[i]
    if (r <= 0) return pool[i]
  }
  return pool[pool.length - 1]
}

function shuffle<T>(items: T[], rand: () => number): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/**
 * 1 回ぶんの出題を組む。
 *
 * 段の問題が 10 問以下のときは全問を必ず 1 回ずつ入れる。
 * 覚えるべき 9 個のうち出ない問題があると、そこだけ穴が残る。
 * 余った枠を重み付き抽選で埋めることで、苦手な問題が自然に厚くなる。
 */
export function buildQuestions(
  stage: StageKey,
  unlocked: number[],
  stats: FactStats,
  rand: () => number = Math.random,
): Question[] {
  const pool = factsFor(stage, unlocked)
  const picked: Fact[] = pool.length <= QUESTIONS_PER_RUN ? shuffle(pool, rand) : []

  while (picked.length < QUESTIONS_PER_RUN) {
    const remaining = pool.filter((f) => !picked.some((p) => p.a === f.a && p.b === f.b))
    const candidates = remaining.length > 0 ? remaining : pool
    picked.push(weightedPick(candidates, stats, rand))
  }

  const ordered = avoidAdjacentRepeats(picked.slice(0, QUESTIONS_PER_RUN))
  return ordered.map((f) => ({ ...f, answer: f.a * f.b }))
}

/** 同じ問題が連続すると「さっきと同じ」で考えずに答えてしまうため、隣り合わせを崩す。 */
function avoidAdjacentRepeats(facts: Fact[]): Fact[] {
  const out = [...facts]
  for (let i = 1; i < out.length; i += 1) {
    if (out[i].a !== out[i - 1].a || out[i].b !== out[i - 1].b) continue
    const swap = out.findIndex(
      (f, j) => j !== i && j !== i - 1 && (f.a !== out[i - 1].a || f.b !== out[i - 1].b),
    )
    if (swap >= 0) [out[i], out[swap]] = [out[swap], out[i]]
  }
  return out
}

/**
 * 入力途中の判定。
 *
 * 「けってい」ボタンを押させない。答えと一致した瞬間に正解、
 * どうやっても答えにならない数になった瞬間に不正解として次へ進む。
 * ボタンを 1 つ減らすことが、この年齢では体感速度に効く。
 */
export type InputVerdict = 'pending' | 'correct' | 'wrong'

export function judgeInput(input: string, answer: number): InputVerdict {
  if (input === '') return 'pending'
  if (Number(input) === answer) return 'correct'
  return String(answer).startsWith(input) ? 'pending' : 'wrong'
}

/** タイム表示。例: 41230 -> 「41.23」 */
export function formatMs(ms: number): string {
  return (ms / 1000).toFixed(2)
}
