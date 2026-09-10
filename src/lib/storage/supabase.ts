import { LocalStore } from './local'
import type { Run } from './types'

/**
 * Supabase（PostgREST）を使う保存層。
 *
 * 親子で端末が分かれた時点で有効にする。環境変数が両方揃っているときだけ選ばれる。
 * 依存パッケージは足さず fetch で直接叩く。
 *
 * 方針: 端末内（LocalStore）を常に正とし、リモートは「相手の記録を取りに行く鏡」として扱う。
 * こうしておけば通信が落ちていても遊べる。子どもの端末で「読み込み中」を見せない方が重要。
 */

const KEY_FAMILY = 'kuku.family.v1'
const KEY_REMOTE_CACHE = 'kuku.remote.v1'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export const supabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)

/** 家族を識別する合言葉。親子の端末で同じ文字列を入れる。 */
export function getFamilyCode(): string {
  if (typeof window === 'undefined') return ''
  try {
    return window.localStorage.getItem(KEY_FAMILY) ?? ''
  } catch {
    return ''
  }
}

export function setFamilyCode(code: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(KEY_FAMILY, code.trim())
  } catch {
    // 設定できなくてもローカル単独では成立する
  }
}

/**
 * anon キーは公開されるものなので、家族ごとの分離は合言葉ヘッダと RLS で行う。
 * supabase/schema.sql の request_family_code() がこのヘッダを読む。
 */
function headers(): HeadersInit {
  return {
    apikey: SUPABASE_ANON_KEY as string,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
    'x-family-code': getFamilyCode(),
  }
}

type RemoteRow = {
  id: string
  family_code: string
  who: string
  stage: string
  total_ms: number
  correct: number
  total: number
  at: string
  facts: Run['facts']
}

function toRun(row: RemoteRow): Run {
  return {
    id: row.id,
    who: row.who === 'parent' ? 'parent' : 'child',
    stage: row.stage === 'mix' ? 'mix' : Number(row.stage),
    totalMs: row.total_ms,
    correct: row.correct,
    total: row.total,
    at: row.at,
    facts: row.facts ?? [],
  }
}

export class SupabaseStore extends LocalStore {
  override async addRun(run: Run): Promise<void> {
    await super.addRun(run)
    void this.push(run)
  }

  override async getRuns(limit?: number): Promise<Run[]> {
    const local = await super.getRuns()
    const remote = readRemoteCache()
    // id で重複を除く。自分が送った記録はローカルとリモート両方に現れる。
    const byId = new Map<string, Run>()
    for (const run of [...remote, ...local]) byId.set(run.id, run)
    const merged = [...byId.values()].sort((a, b) => b.at.localeCompare(a.at))
    return typeof limit === 'number' ? merged.slice(0, limit) : merged
  }

  /** 自分の記録を 1 件送る。失敗しても握り潰す（次回の同期で拾える）。 */
  private async push(run: Run): Promise<void> {
    const family = getFamilyCode()
    if (!supabaseConfigured || !family) return
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/runs`, {
        method: 'POST',
        headers: { ...headers(), Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify([
          {
            id: run.id,
            family_code: family,
            who: run.who,
            stage: String(run.stage),
            total_ms: run.totalMs,
            correct: run.correct,
            total: run.total,
            at: run.at,
            facts: run.facts,
          },
        ]),
      })
    } catch {
      // オフラインでも遊べることを優先する
    }
  }

  /** リモートの記録を取り込む。ホーム表示前に一度だけ呼ぶ想定。 */
  async sync(): Promise<boolean> {
    const family = getFamilyCode()
    if (!supabaseConfigured || !family) return false
    try {
      const query = new URLSearchParams({
        select: '*',
        family_code: `eq.${family}`,
        order: 'at.desc',
        limit: '300',
      })
      const res = await fetch(`${SUPABASE_URL}/rest/v1/runs?${query}`, { headers: headers() })
      if (!res.ok) return false
      const rows = (await res.json()) as RemoteRow[]
      writeRemoteCache(rows.map(toRun))
      // 未送信のローカル記録を追いつかせる
      const remoteIds = new Set(rows.map((r) => r.id))
      for (const run of await super.getRuns()) {
        if (!remoteIds.has(run.id)) void this.push(run)
      }
      return true
    } catch {
      return false
    }
  }
}

function readRemoteCache(): Run[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(KEY_REMOTE_CACHE)
    return raw ? (JSON.parse(raw) as Run[]) : []
  } catch {
    return []
  }
}

function writeRemoteCache(runs: Run[]): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(KEY_REMOTE_CACHE, JSON.stringify(runs))
  } catch {
    // キャッシュできなくても動く
  }
}
