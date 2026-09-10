/** 誰の記録か。 */
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

/**
 * 家族で共有する設定。
 *
 * 親が自分の端末から段を解放したら、子どもの端末にも反映されてほしい。
 * Supabase を有効にすると、これらが端末間で同期される。
 */
export type SharedSettings = {
  /** 段の解放順。学校の進度に合わせて親が並べ替える */
  stageOrder: number[]
  /** stageOrder の先頭から何段まで解放済みか。1 段ずつしか増やさない */
  unlockedCount: number
  /** 問題文・見た目のテーマ id */
  themeId: string
  childName: string
  parentName: string
  /** 子どもが決めた敵の名前。キーは段（'mix' を含む） */
  enemyNames: Record<string, string>
}

/**
 * この端末だけの設定。同期しない。
 *
 * 合言葉と持ち主は端末の素性そのものなので、同期させると意味が壊れる。
 * 音声は場所によって切りたいことがあるため、端末ごとに持たせる。
 */
export type DeviceSettings = {
  /** 家族の合言葉。親子の端末で同じ文字列を入れる */
  familyCode: string
  /** この端末で作った記録を誰のものとして残すか */
  role: Who
  /** 音声読み上げの ON/OFF */
  voice: boolean
}

export type SyncOutcome =
  | { ok: true; runs: number }
  | { ok: false; reason: 'not-configured' | 'no-family-code' | 'failed' }

/**
 * 保存層。
 *
 * 端末内（localStorage）を常に正とし、リモートは相手の記録を取りに行く鏡として扱う。
 * 通信が落ちていても遊べることを優先する。子どもの端末で読み込み中を見せない。
 */
export interface Store {
  getSettings(): Promise<SharedSettings>
  saveSettings(settings: SharedSettings): Promise<void>
  addRun(run: Run): Promise<void>
  getRuns(limit?: number): Promise<Run[]>
  getBests(): Promise<Best[]>
  getFactStats(who: Who): Promise<FactStats>
  /** 記録をすべて消す（親画面からのみ） */
  reset(): Promise<void>
  /** リモートと突き合わせる。端末内で完結する構成では ok:false を返す */
  sync(): Promise<SyncOutcome>
}

export const factKey = (a: number, b: number) => `${a}x${b}`

export const DEFAULT_SETTINGS: SharedSettings = {
  // 教科書では 5 の段から始めることが多い（規則が見えやすいため）。
  // 学校の進度が違えば親画面で並べ替える。
  stageOrder: [5, 2, 3, 4, 6, 7, 8, 9, 1],
  unlockedCount: 1,
  themeId: 'blocks',
  childName: 'きみ',
  parentName: 'おとうさん',
  enemyNames: {},
}

export const DEFAULT_DEVICE: DeviceSettings = {
  familyCode: '',
  // 既定は子どもの端末。親の端末では親画面から切り替える。
  role: 'child',
  voice: true,
}
