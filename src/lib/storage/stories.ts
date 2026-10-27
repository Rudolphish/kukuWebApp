import { isNovel, validateStory, type StoryArea } from '../story'
import { clearStoryProgress, getFamilyCode } from './device'
import { readJSON, writeJSON } from './local'

/**
 * 子どもが注文した話。
 *
 * 判断の根拠は docs/story-authoring-design.md。
 *
 * 注文と完成品を別のテーブルに分けない。分けると、注文だけ残って完成品が無い状態と
 * その逆の両方を扱う羽目になる。1 つの行が状態を持つ。
 */
export type StoryStatus = 'ordered' | 'ready' | 'failed'

/** 子どもが出した種。これを LLM が文章にする。 */
export type StorySeed = {
  /** どこ */
  place: string
  /** だれが でる */
  who: string
  /** どんな かんじ */
  mood: string
  /** なにを する。つづきの注文で選ぶ */
  what?: string
  /**
   * おうちのひとの端末から出した注文。1 日の上限（ORDERS_PER_DAY）に数えない。
   * 上限は子どもの連打を止めるためのもので、親が作る分まで止める理由がない
   */
  by?: 'parent'
  /** つづきの注文のとき、もとの話。id はもとの話の StoryArea.id（= 注文の id） */
  continues?: { id: string; name: string }
}

/**
 * つづきの注文で「だれが でてくる？」の候補にする、もとの話の なかま。
 * 小説の形はおもな登場人物と最後の あいて、散策の形は あいて全員と街の人。
 * 多すぎると選べないので 8 人まで。
 */
export function sequelCast(area: StoryArea): string[] {
  const names = isNovel(area)
    ? [...area.cast.map((c) => c.name), area.boss.enemy.name]
    : [...area.enemies.map((e) => e.name), ...area.town.map((t) => t.speaker)]
  return [...new Set(names.map((n) => n.trim()).filter(Boolean))].slice(0, 8)
}

/** つづきを作れる話か。子どもが注文して出来上がった話だけを対象にする */
export function canContinue(area: StoryArea): boolean {
  return area.origin === 'original'
}

export type StoryOrder = {
  id: string
  status: StoryStatus
  stage: number
  author: string
  seed: StorySeed
  /** status が 'ready' のときだけ入る */
  area: StoryArea | null
  /** failed のときに、何が起きたかを親に見せるために残す */
  error: string | null
  orderedAt: string
}

/** 1 日に注文できる本数。連打で費用が跳ねないようにする。 */
export const ORDERS_PER_DAY = 3

/**
 * 次に話が作られる時刻を返す（0〜23）。今日もう無ければ、明日の最初の時刻。
 *
 * 待ち時間を隠さない。いつ届くか分かっている方が待てる。
 * 実際に作るのは親のスケジュールタスクなので、ここは表示のための写しでしかない。
 */
export function nextBuildHour(hours: number[], now: Date = new Date()): number | null {
  const sorted = [...new Set(hours)]
    .filter((h) => Number.isInteger(h) && h >= 0 && h <= 23)
    .sort((a, b) => a - b)
  if (sorted.length === 0) return null
  return sorted.find((h) => h > now.getHours()) ?? sorted[0]
}

/** 自由に書ける欄の長さ。小 2 がスマホで打つ前提で短く取る。 */
export const SEED_MAX_LENGTH = 24

const KEY_STORIES = 'kuku.stories.v1'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const configured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)

function headers(): HeadersInit {
  return {
    apikey: SUPABASE_ANON_KEY as string,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
    'x-family-code': getFamilyCode(),
  }
}

type StoryRow = {
  id: string
  status: string
  stage: number
  author: string
  seed: Partial<StorySeed> | null
  area: StoryArea | null
  error: string | null
  ordered_at: string
}

function toOrder(row: StoryRow): StoryOrder {
  const status: StoryStatus =
    row.status === 'ready' ? 'ready' : row.status === 'failed' ? 'failed' : 'ordered'
  return {
    id: row.id,
    status,
    stage: Number(row.stage),
    author: row.author,
    seed: { place: '', who: '', mood: '', ...(row.seed ?? {}) },
    area: status === 'ready' ? row.area : null,
    error: row.error,
    orderedAt: row.ordered_at,
  }
}

/**
 * 端末に残っている分。
 *
 * 端末内を常に正とする方針はここでも変えない。通信が落ちていても、
 * 既にできている話は遊べる。子どもの画面で「読み込み中」を見せない方が重要。
 */
export function readCachedStories(): StoryOrder[] {
  return readJSON<StoryOrder[]>(KEY_STORIES, [])
}

function writeCachedStories(stories: StoryOrder[]): void {
  writeJSON(KEY_STORIES, stories)
}

/**
 * 最後に取り直しを試みた結果。画面で「いつ たしかめたか」を見せるために持つ。
 *
 * 取れなかったときも端末に残っている分で動き続けるので、黙っていると
 * 「まだできていない」のか「取りに行けていない」のかが区別できない。
 */
export type StoryCheck =
  | { at: string; ok: true }
  | { at: string; ok: false; reason: 'not-configured' | 'no-family-code' | 'failed' }

/** リモートから取り直す。取れなければ端末に残っている分をそのまま返し、理由を添える。 */
export async function checkStories(now: () => Date = () => new Date()): Promise<{
  stories: StoryOrder[]
  check: StoryCheck
}> {
  const family = getFamilyCode()
  const at = () => now().toISOString()
  if (!configured) return { stories: readCachedStories(), check: { at: at(), ok: false, reason: 'not-configured' } }
  if (!family) return { stories: readCachedStories(), check: { at: at(), ok: false, reason: 'no-family-code' } }
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/stories?select=*&family_code=eq.${encodeURIComponent(family)}&order=ordered_at.desc&limit=60`,
      { headers: headers() },
    )
    if (!res.ok) return { stories: readCachedStories(), check: { at: at(), ok: false, reason: 'failed' } }
    const rows = (await res.json()) as StoryRow[]
    const stories = rows.map(toOrder)
    writeCachedStories(stories)
    return { stories, check: { at: at(), ok: true } }
  } catch {
    return { stories: readCachedStories(), check: { at: at(), ok: false, reason: 'failed' } }
  }
}

export async function fetchStories(): Promise<StoryOrder[]> {
  return (await checkStories()).stories
}

/**
 * 子どもの画面に出す、たしかめた結果のひとこと。ひらがなだけで書く。
 * 時刻は端末の時計（日本時間を想定）で出す。
 */
export function storyCheckLabel(check: StoryCheck | null, now: Date = new Date()): string {
  if (!check) return 'まだ たしかめていないよ'
  if (!check.ok) {
    if (check.reason === 'no-family-code') return 'おうちのひとに あいことばを いれてもらってね'
    if (check.reason === 'not-configured') return 'この たんまつの なかだけで うごいているよ'
    return 'つながらなかったよ。もういちど おしてみてね'
  }
  const at = new Date(check.at)
  if (now.getTime() - at.getTime() < 60_000) return 'いま たしかめたよ'
  return `${at.getHours()}じ${at.getMinutes()}ふんに たしかめたよ`
}

/** その日に子どもが出した注文の数。上限の判定に使う。おうちのひとの注文は数えない */
export function orderedToday(stories: StoryOrder[], now: Date = new Date()): number {
  const today = now.toISOString().slice(0, 10)
  return stories.filter((s) => s.orderedAt.slice(0, 10) === today && s.seed.by !== 'parent').length
}

export type OrderOutcome =
  | { ok: true; story: StoryOrder }
  | { ok: false; reason: 'not-configured' | 'limit' | 'failed' }

/**
 * 注文を出す。生成はしない。
 *
 * 生成はスケジュール実行に任せる。アプリ側に生成の口を作らないことで、
 * Anthropic の API キーを置く場所が 1 か所で済む。
 */
export async function orderStory(
  seed: StorySeed,
  stage: number,
  author: string,
  existing: StoryOrder[],
): Promise<OrderOutcome> {
  const family = getFamilyCode()
  if (!configured || !family) return { ok: false, reason: 'not-configured' }
  if (seed.by !== 'parent' && orderedToday(existing) >= ORDERS_PER_DAY) return { ok: false, reason: 'limit' }

  const story: StoryOrder = {
    id: `story-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    status: 'ordered',
    stage,
    author,
    seed,
    area: null,
    error: null,
    orderedAt: new Date().toISOString(),
  }

  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/stories`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify([
        {
          id: story.id,
          family_code: family,
          status: 'ordered',
          stage,
          author,
          seed,
          ordered_at: story.orderedAt,
        },
      ]),
    })
    if (!res.ok) return { ok: false, reason: 'failed' }
    writeCachedStories([story, ...existing])
    return { ok: true, story }
  } catch {
    return { ok: false, reason: 'failed' }
  }
}

/**
 * 話を消す。作っている途中の注文なら取り消しになる。
 * 消せるのは親画面と、おうちのひとの端末のホームから（子どもの迷い込みで消えないように）。
 */
export async function deleteStory(id: string, existing: StoryOrder[]): Promise<boolean> {
  const family = getFamilyCode()
  if (!configured || !family) return false
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/stories?id=eq.${encodeURIComponent(id)}&family_code=eq.${encodeURIComponent(family)}`,
      { method: 'DELETE', headers: headers() },
    )
    if (!res.ok) return false
    writeCachedStories(existing.filter((s) => s.id !== id))
    clearStoryProgress(id)
    return true
  } catch {
    return false
  }
}

/**
 * 話が壊れていないか。
 *
 * 書き手（親の Claude）が検査を通してから公開する建前だが、
 * 読む側でも必ず確かめる。手で直接 Supabase を触ることもできる以上、
 * 壊れた話が子どもの画面に出る経路を残さない。
 */
export function storyProblems(order: StoryOrder): string[] {
  if (order.status === 'failed') return [order.error ?? '作れなかった']
  if (order.status !== 'ready') return []
  if (!order.area) return ['おはなしの中身が入っていない']
  return validateStory(order.area)
}

/** できあがっていて、かつ検査を通る話だけを遊べる形で取り出す。 */
export function readyAreas(stories: StoryOrder[]): StoryArea[] {
  return stories.flatMap((s) =>
    s.status === 'ready' && s.area && validateStory(s.area).length === 0 ? [s.area] : [],
  )
}

/** 遊べない状態のもの。失敗したものと、公開されたが壊れているもの。 */
export function brokenOrders(stories: StoryOrder[]): StoryOrder[] {
  return stories.filter((s) => s.status !== 'ordered' && storyProblems(s).length > 0)
}
