import area1 from '@/data/stories/area-1.json'
import area5 from '@/data/stories/area-5.json'
import {
  ENCOUNTERS_PER_WALK,
  SCENES_PER_WALK,
  type StoryArea,
  type StoryEncounter,
  type StoryEnemy,
  type StoryScene,
} from './story'

/**
 * 同梱のストーリー。
 * 追加はここに 1 行足すだけで済む形にしておく。
 */
export const STORIES: StoryArea[] = [area1 as StoryArea, area5 as StoryArea]

export function getStory(id: string): StoryArea | undefined {
  return STORIES.find((s) => s.id === id)
}

/** 解放済みの段に対応する話だけを出す。未習の段の話は見せない。 */
export function availableStories(unlocked: number[]): StoryArea[] {
  return STORIES.filter((s) => unlocked.includes(s.stage))
}

/** 街の住人のセリフ。進行度を超えたら最後のものを使い続ける。 */
export function townLine(area: StoryArea, progress: number) {
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
 * 骨組みは 場面 → 出会い → 場面 → 出会い で固定する。
 * ここを毎回変えると 1 回の長さがぶれ、「1 ループ 3 分」の歯止めが効かなくなる。
 * 変わるのは中身だけ。
 *
 * 直近に出たものは避ける。同じ相手が続けて出ると、
 * 組み合わせがあっても「また同じ」に感じられる。
 */
export function buildWalk(
  area: StoryArea,
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

  const steps: WalkStep[] = []
  for (let i = 0; i < Math.max(scenes.length, encounters.length); i += 1) {
    const scene = scenes[i]
    if (scene) steps.push({ kind: 'scene', id: scene.id, text: scene.text })
    const enc = encounters[i]
    if (enc) {
      const enemy = area.enemies.find((e) => e.id === enc.enemy)
      if (enemy) {
        steps.push({
          kind: 'encounter',
          id: enc.id,
          text: enc.text,
          enemy,
          outroWin: enc.outroWin,
          outroLose: enc.outroLose,
        })
      }
    }
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
