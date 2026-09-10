import { getFamilyCode } from './device'
import {
  LocalStore,
  mergeRuns,
  readLocalRuns,
  readStoredSettings,
  writeLocalRuns,
  writeStoredSettings,
} from './local'
import { DEFAULT_SETTINGS, type Run, type SharedSettings, type SyncOutcome } from './types'

/**
 * Supabase（PostgREST）を使う保存層。
 *
 * 親が自分の端末を持つ構成で有効にする。子ども専用端末に親の記録が乗らないため、
 * 記録と共有設定をリモートで突き合わせる必要がある。
 * 依存パッケージは足さず fetch で直接叩く。
 *
 * 方針は変えない。端末内を常に正とし、リモートは相手の記録を取りに行く鏡として扱う。
 * 通信が落ちていても遊べる。子どもの端末で「読み込み中」を見せない方が重要。
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export const supabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)

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

type RunRow = {
  id: string
  who: string
  stage: string
  total_ms: number
  correct: number
  total: number
  at: string
  facts: Run['facts']
}

type SettingsRow = {
  family_code: string
  settings: Partial<SharedSettings>
  updated_at: string
}

function toRun(row: RunRow): Run {
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

function toRow(run: Run, family: string) {
  return {
    id: run.id,
    family_code: family,
    who: run.who,
    stage: String(run.stage),
    total_ms: run.totalMs,
    correct: run.correct,
    total: run.total,
    at: run.at,
    facts: run.facts,
  }
}

export class SupabaseStore extends LocalStore {
  override async addRun(run: Run): Promise<void> {
    await super.addRun(run)
    void this.pushRuns([run])
  }

  override async saveSettings(settings: SharedSettings): Promise<void> {
    await super.saveSettings(settings)
    void this.pushSettings(settings, readStoredSettings().updatedAt)
  }

  /**
   * リモートと突き合わせる。
   *
   * 記録は id で重複を除いて併合する。設定は更新時刻の新しい方を採る。
   * 家庭内で同時に設定を触ることは稀なので、後勝ちで足りる。
   */
  override async sync(): Promise<SyncOutcome> {
    if (!supabaseConfigured) return { ok: false, reason: 'not-configured' }
    const family = getFamilyCode()
    if (!family) return { ok: false, reason: 'no-family-code' }

    try {
      const [runRows, settingsRows] = await Promise.all([
        this.get<RunRow[]>(`runs?select=*&family_code=eq.${encodeURIComponent(family)}&order=at.desc&limit=300`),
        this.get<SettingsRow[]>(`family_settings?select=*&family_code=eq.${encodeURIComponent(family)}&limit=1`),
      ])
      if (!runRows || !settingsRows) return { ok: false, reason: 'failed' }

      // --- 記録 ---
      const remote = runRows.map(toRun)
      const local = readLocalRuns()
      writeLocalRuns(mergeRuns(local, remote))

      // 未送信のローカル記録を追いつかせる
      const remoteIds = new Set(remote.map((r) => r.id))
      const unsent = local.filter((r) => !remoteIds.has(r.id))
      if (unsent.length > 0) void this.pushRuns(unsent)

      // --- 共有設定 ---
      const stored = readStoredSettings()
      const remoteSettings = settingsRows[0]
      if (remoteSettings && remoteSettings.updated_at > stored.updatedAt) {
        writeStoredSettings(
          { ...DEFAULT_SETTINGS, ...remoteSettings.settings },
          remoteSettings.updated_at,
        )
      } else if (stored.updatedAt && (!remoteSettings || stored.updatedAt > remoteSettings.updated_at)) {
        void this.pushSettings({ ...DEFAULT_SETTINGS, ...stored.settings }, stored.updatedAt)
      }

      return { ok: true, runs: remote.length }
    } catch {
      return { ok: false, reason: 'failed' }
    }
  }

  private async get<T>(path: string): Promise<T | null> {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: headers() })
    if (!res.ok) return null
    return (await res.json()) as T
  }

  /** 記録を送る。失敗しても握り潰す（次回の同期で拾える）。 */
  private async pushRuns(runs: Run[]): Promise<void> {
    const family = getFamilyCode()
    if (!supabaseConfigured || !family || runs.length === 0) return
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/runs`, {
        method: 'POST',
        // 記録は書き換えない。再送で重複しても無視させ、UPDATE 権限を渡さずに済ませる
        headers: { ...headers(), Prefer: 'resolution=ignore-duplicates' },
        body: JSON.stringify(runs.map((run) => toRow(run, family))),
      })
    } catch {
      // オフラインでも遊べることを優先する
    }
  }

  private async pushSettings(settings: SharedSettings, updatedAt: string): Promise<void> {
    const family = getFamilyCode()
    if (!supabaseConfigured || !family) return
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/family_settings`, {
        method: 'POST',
        headers: { ...headers(), Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify([
          { family_code: family, settings, updated_at: updatedAt || new Date().toISOString() },
        ]),
      })
    } catch {
      // 同上
    }
  }
}
