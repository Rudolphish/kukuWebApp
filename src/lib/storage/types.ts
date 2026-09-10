/** 誰の記録か。子ども端末 1 台に親子両方の記録が乗る前提。 */
export type Who = 'child' | 'parent'

/** 出題対象。1〜9 は段、'mix' は解放済みの段からの混合。 */
export type StageKey = number | 'mix'

/** 1 問ぶんの結果。 */
export type FactResult = {
  a: number
  b: number
  correct: boolean
  ms: number
}

/** 1 回のタイムアタックの結果。 */
export type Run = {
  id: string
  who: Who
  stage: StageKey
  /** 全問終えるまでの所要時間 */
  totalMs: number
  correct: number
  total: number
  /** ISO 8601 */
  at: string
  facts: FactResult[]
}

/** 段ごとのベスト記録。タイムのみでなく正答数も見る（速いだけの記録を上に置かない）。 */
export type Best = {
  who: Who
  stage: StageKey
  totalMs: number
  correct: number
  total: number
  at: string
}

/** 問題ごとの累積。出題の重み付けと、親向けの弱点表示に使う。 */
export type FactStat = {
  attempts: number
  wrong: number
  /** 直近の解答が誤りだったか。直後の再出題を優先するために持つ */
  lastWrong: boolean
  /** 正答時の所要時間の移動平均（ms） */
  avgMs: number
}

export type FactStats = Record<string, FactStat>

export type Settings = {
  /** 段の解放順。学校の進度に合わせて親が並べ替える */
  stageOrder: number[]
  /** stageOrder の先頭から何段まで解放済みか。1 段ずつしか増やさない */
  unlockedCount: number
  /** 問題文・見た目のテーマ id */
  themeId: string
  /** 音声読み上げの ON/OFF */
  voice: boolean
  childName: string
  parentName: string
  /** 子どもが決めた敵の名前。キーは段（'mix' を含む） */
  enemyNames: Record<string, string>
}

/**
 * 保存層。第 1 版は端末内（localStorage）で完結させ、
 * 親子で端末が別になった時点で Supabase 実装に差し替える。
 */
export interface Store {
  getSettings(): Promise<Settings>
  saveSettings(settings: Settings): Promise<void>
  addRun(run: Run): Promise<void>
  getRuns(limit?: number): Promise<Run[]>
  getBests(): Promise<Best[]>
  getFactStats(who: Who): Promise<FactStats>
  /** 記録をすべて消す（親画面からのみ） */
  reset(): Promise<void>
}

export const factKey = (a: number, b: number) => `${a}x${b}`

export const DEFAULT_SETTINGS: Settings = {
  // 教科書では 5 の段から始めることが多い（規則が見えやすいため）。
  // 学校の進度が違えば親画面で並べ替える。
  stageOrder: [5, 2, 3, 4, 6, 7, 8, 9, 1],
  unlockedCount: 1,
  themeId: 'blocks',
  voice: true,
  childName: 'きみ',
  parentName: 'おとうさん',
  enemyNames: {},
}
