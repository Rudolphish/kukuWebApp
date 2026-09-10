import adventure from '@/data/themes/adventure.json'
import blocks from '@/data/themes/blocks.json'
import plain from '@/data/themes/plain.json'
import type { StageKey } from './storage/types'

export type Theme = {
  id: string
  name: string
  colors: {
    bg: string
    panel: string
    line: string
    text: string
    accent: string
    accent2: string
    danger: string
  }
  items: { emoji: string; name: string }[]
  unit: string
  startLine: string
  clearLine: string
  cheers: string[]
  enemies: Record<string, string>
  enemyEmoji: Record<string, string>
  problemTemplates: string[]
}

/**
 * テーマは JSON として持つ。飽きたら差し替えられることが寿命の対策そのものなので、
 * 追加はここに 1 行足すだけで済む形にしておく。
 */
export const THEMES: Theme[] = [blocks, adventure, plain] as Theme[]

export const DEFAULT_THEME = THEMES[0]

export function getTheme(id: string): Theme {
  return THEMES.find((t) => t.id === id) ?? DEFAULT_THEME
}

/** 敵の名前。子どもが決めた名前があればそれを最優先する。 */
export function enemyName(
  theme: Theme,
  stage: StageKey,
  custom: Record<string, string> = {},
): string {
  const key = String(stage)
  return custom[key]?.trim() || theme.enemies[key] || `${key}のだん`
}

/** 敵の見た目。名前は子どもが変えられるが、絵はテーマ側が持つ。 */
export function enemyEmoji(theme: Theme, stage: StageKey): string {
  return theme.enemyEmoji[String(stage)] ?? '👾'
}

/** 段ごとに安定して同じアイテムを割り当てる（毎回変わると「自分の段」の感覚が育たない）。 */
export function stageItem(theme: Theme, stage: StageKey) {
  const n = stage === 'mix' ? theme.items.length - 1 : (stage - 1) % theme.items.length
  return theme.items[n % theme.items.length]
}

/** 問題文の着せ替え。第 1 版では敵の登場時に 1 度だけ使う。 */
export function flavorText(theme: Theme, stage: StageKey, a: number, b: number): string {
  const template = theme.problemTemplates[(a + b) % theme.problemTemplates.length]
  const item = stageItem(theme, stage)
  return template.replace('{item}', item.name).replace('{a}', String(a)).replace('{b}', String(b))
}
