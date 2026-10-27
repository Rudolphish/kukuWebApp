import area1 from '@/data/stories/area-1.json'
import area5 from '@/data/stories/area-5.json'
import {
  ENCOUNTERS_PER_WALK,
  SCENES_PER_WALK,
  isNovel,
  type NovelArea,
  type StoryArea,
  type WalkArea,
  type StoryEncounter,
  type StoryEnemy,
  type StoryScene,
} from './story'
import type { NovelPlace, StoryProgress } from './storage/types'

/**
 * 同梱のストーリー。
 * 追加はここに 1 行足すだけで済む形にしておく。
 */
export const STORIES: WalkArea[] = [area1 as WalkArea, area5 as WalkArea]

/**
 * 同梱の話と、子どもが注文して出来上がった話の両方から引く。
 * 子どもの作った話を先に置く。自分の作ったものが上にある状態にしておく。
 */
export function allStories(authored: StoryArea[] = []): StoryArea[] {
  return [...authored, ...STORIES]
}

export function getStory(id: string, authored: StoryArea[] = []): StoryArea | undefined {
  return allStories(authored).find((s) => s.id === id)
}

/** 解放済みの段に対応する話だけを出す。未習の段の話は見せない。 */
export function availableStories(unlocked: number[], authored: StoryArea[] = []): StoryArea[] {
  return allStories(authored).filter((s) => unlocked.includes(s.stage))
}

/**
 * 小説の形を、保存した場所から再開する。
 *
 * 話の中身が後から変わる（作り直し等）こともあるので、範囲の外なら丸める。
 * 古い保存（progress と done だけ）は、読み終えていれば「おしまい」、
 * そうでなければそのページから。
 */
export function resumeNovel(area: NovelArea, saved: StoryProgress): NovelPlace {
  const last = area.pages.length - 1
  const place = saved.novel
  if (!place) {
    if (saved.done) return { phase: 'end', page: last, won: true }
    return { phase: 'read', page: clamp(saved.progress, 0, last) }
  }
  const page = clamp(place.page, 0, last)
  if (place.phase === 'read') {
    const b = place.branch
    const pages = b ? area.pages[page].choices?.[b.option]?.pages : undefined
    if (b && pages && b.at >= 0 && b.at < pages.length) return { phase: 'read', page, branch: b }
    return { phase: 'read', page }
  }
  if (place.phase === 'boss') return { phase: 'boss', page: last }
  const won = place.won ?? true
  if (place.phase === 'ending') {
    const pages = won ? area.ending.win : area.ending.lose
    return { phase: 'ending', page: last, won, endingIndex: clamp(place.endingIndex ?? 0, 0, pages.length - 1) }
  }
  return { phase: 'end', page: last, won }
}

function clamp(n: number, min: number, max: number): number {
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.floor(n))) : min
}

/** カードに出す絵文字。小説の形は主人公、散策の形は最初の あいて */
export function areaEmoji(area: StoryArea): string {
  return (isNovel(area) ? area.cast[0]?.emoji : area.enemies[0]?.emoji) ?? '📖'
}

/** 街の住人のセリフ。進行度を超えたら最後のものを使い続ける。 */
export function townLine(area: WalkArea, progress: number) {
  const sorted = [...area.town].sort((a, b) => a.progress - b.progress)
  let line = sorted[0]
  for (const t of sorted) if (t.progress <= progress) line = t
  return line
}

/** 次のエリアを解放するまでに必要な散策の回数。 */
export const RUNS_TO_CLEAR = 3

/** 直近に出たものを覚えておく数。これを超えたら再び出てよい。 */
export const RECENT_MEMORY = 6

export type WalkStep =
  | { kind: 'scene'; id: string; text: string }
  | { kind: 'encounter'; id: string; text: string; enemy: StoryEnemy; outroWin: string; outroLose: string }

/**
 * 1 回ぶんの散策を組む。
 *
 * 骨組みは 場面 → 場面 → 出会い で固定する。戦いは最後の 1 回だけ。
 * ここを毎回変えると 1 回の長さがぶれ、「1 ループ 3 分」の歯止めが効かなくなる。
 * 変わるのは中身だけ。
 *
 * 直近に出たものは避ける。同じ相手が続けて出ると、
 * 組み合わせがあっても「また同じ」に感じられる。
 */
export function buildWalk(
  area: WalkArea,
  branchId: string,
  recent: string[],
  rand: () => number = Math.random,
): WalkStep[] {
  const scenes = pick(
    area.scenes.filter((s) => !s.branch || s.branch === branchId),
    SCENES_PER_WALK,
    recent,
    rand,
  )
  const encounters = pick(
    area.encounters.filter((e) => e.branch === branchId),
    ENCOUNTERS_PER_WALK,
    recent,
    rand,
  )

  // 場面を先にすべて並べ、戦いは最後に置く
  const steps: WalkStep[] = scenes.map((scene) => ({ kind: 'scene', id: scene.id, text: scene.text }))
  for (const enc of encounters) {
    const enemy = area.enemies.find((e) => e.id === enc.enemy)
    if (!enemy) continue
    steps.push({
      kind: 'encounter',
      id: enc.id,
      text: enc.text,
      enemy,
      outroWin: enc.outroWin,
      outroLose: enc.outroLose,
    })
  }
  return steps
}

/**
 * プールから重複なく引く。
 * 直近に出ていないものを先に使い、足りなければ直近のものも使う。
 */
function pick<T extends StoryScene | StoryEncounter>(
  pool: T[],
  count: number,
  recent: string[],
  rand: () => number,
): T[] {
  const fresh = shuffle(pool.filter((p) => !recent.includes(p.id)), rand)
  const stale = shuffle(pool.filter((p) => recent.includes(p.id)), rand)
  return [...fresh, ...stale].slice(0, count)
}

function shuffle<T>(items: T[], rand: () => number): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}
