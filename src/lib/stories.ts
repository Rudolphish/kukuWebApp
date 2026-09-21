import area1 from '@/data/stories/area-1.json'
import area5 from '@/data/stories/area-5.json'
import type { StoryArea, StoryParagraph } from './story'

/**
 * 同梱のストーリー。
 *
 * 追加はここに 1 行足すだけで済む形にしておく。
 * 子どもが作った話（origin: 'original'）も、いまは同じ置き場に並べる。
 */
export const STORIES: StoryArea[] = [area1 as StoryArea, area5 as StoryArea]

export function getStory(id: string): StoryArea | undefined {
  return STORIES.find((s) => s.id === id)
}

/** 解放済みの段に対応する話だけを出す。未習の段の話は見せない。 */
export function availableStories(unlocked: number[]): StoryArea[] {
  return STORIES.filter((s) => unlocked.includes(s.stage))
}

export function paragraph(area: StoryArea, id: string): StoryParagraph | undefined {
  return area.paragraphs.find((p) => p.id === id)
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

export function enemyOf(area: StoryArea, id: string | undefined) {
  return id ? area.enemies.find((e) => e.id === id) : undefined
}
