import { validateStory, type StoryArea } from '../story'
import { getFamilyCode } from './device'
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

/** リモートから取り直す。取れなければ端末に残っている分をそのまま返す。 */
export async function fetchStories(): Promise<StoryOrder[]> {
  const family = getFamilyCode()
  if (!configured || !family) return readCachedStories()
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/stories?select=*&family_code=eq.${encodeURIComponent(family)}&order=ordered_at.desc&limit=60`,
      { headers: headers() },
    )
    if (!res.ok) return readCachedStories()
    const rows = (await res.json()) as StoryRow[]
    const stories = rows.map(toOrder)
    writeCachedStories(stories)
    return stories
  } catch {
    return readCachedStories()
  }
}

/** その日に出した注文の数。上限の判定に使う。 */
export function orderedToday(stories: StoryOrder[], now: Date = new Date()): number {
  const today = now.toISOString().slice(0, 10)
  return stories.filter((s) => s.orderedAt.slice(0, 10) === today).length
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
  if (orderedToday(existing) >= ORDERS_PER_DAY) return { ok: false, reason: 'limit' }

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

/** 話を消す。親画面からのみ。 */
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
