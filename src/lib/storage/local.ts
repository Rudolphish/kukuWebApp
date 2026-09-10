import {
  DEFAULT_SETTINGS,
  factKey,
  type Best,
  type FactStats,
  type Run,
  type Settings,
  type StageKey,
  type Store,
  type Who,
} from './types'

const KEY_SETTINGS = 'kuku.settings.v1'
const KEY_RUNS = 'kuku.runs.v1'

/** 端末が古い・プライベートブラウズ等で localStorage が使えない場合に落ちないようにする。 */
function readJSON<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeJSON(key: string, value: unknown): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // 保存できなくても遊べる方を優先する
  }
}

/** 記録が無限に増えないよう、直近ぶんだけ残す。 */
const MAX_RUNS = 300

export class LocalStore implements Store {
  async getSettings(): Promise<Settings> {
    const stored = readJSON<Partial<Settings>>(KEY_SETTINGS, {})
    return { ...DEFAULT_SETTINGS, ...stored }
  }

  async saveSettings(settings: Settings): Promise<void> {
    writeJSON(KEY_SETTINGS, settings)
  }

  async addRun(run: Run): Promise<void> {
    const runs = readJSON<Run[]>(KEY_RUNS, [])
    runs.unshift(run)
    writeJSON(KEY_RUNS, runs.slice(0, MAX_RUNS))
  }

  async getRuns(limit = MAX_RUNS): Promise<Run[]> {
    return readJSON<Run[]>(KEY_RUNS, []).slice(0, limit)
  }

  async getBests(): Promise<Best[]> {
    return computeBests(await this.getRuns())
  }

  async getFactStats(who: Who): Promise<FactStats> {
    return computeFactStats(await this.getRuns(), who)
  }

  async reset(): Promise<void> {
    writeJSON(KEY_RUNS, [])
  }
}

/**
 * ベスト記録。正答数が多い方を上位とし、同数ならタイムが速い方を上位とする。
 * タイムだけで比べると「わざと間違えて飛ばす」が最速になってしまう。
 */
export function computeBests(runs: Run[]): Best[] {
  const byKey = new Map<string, Best>()
  for (const run of runs) {
    const key = `${run.who}:${run.stage}`
    const current = byKey.get(key)
    const candidate: Best = {
      who: run.who,
      stage: run.stage,
      totalMs: run.totalMs,
      correct: run.correct,
      total: run.total,
      at: run.at,
    }
    if (!current || isBetter(candidate, current)) byKey.set(key, candidate)
  }
  return [...byKey.values()]
}

export function isBetter(a: Best, b: Best): boolean {
  if (a.correct !== b.correct) return a.correct > b.correct
  return a.totalMs < b.totalMs
}

export function computeFactStats(runs: Run[], who: Who): FactStats {
  const stats: FactStats = {}
  // 古い順に畳み込む。lastWrong と avgMs は新しい結果ほど強く効かせたい。
  for (const run of [...runs].reverse()) {
    if (run.who !== who) continue
    for (const fact of run.facts) {
      const key = factKey(fact.a, fact.b)
      const s = stats[key] ?? { attempts: 0, wrong: 0, lastWrong: false, avgMs: 0 }
      s.attempts += 1
      if (!fact.correct) s.wrong += 1
      s.lastWrong = !fact.correct
      if (fact.correct) {
        s.avgMs = s.avgMs === 0 ? fact.ms : Math.round(s.avgMs * 0.6 + fact.ms * 0.4)
      }
      stats[key] = s
    }
  }
  return stats
}

/** 表示用: 特定の who / stage のベストを引く。 */
export function findBest(bests: Best[], who: Who, stage: StageKey): Best | undefined {
  return bests.find((b) => b.who === who && b.stage === stage)
}
