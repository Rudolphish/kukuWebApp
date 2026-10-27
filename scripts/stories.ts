/**
 * 注文された話を、親の Claude の手で作るための道具。
 *
 *   npm run stories -- pending            注文の一覧を出す
 *   npm run stories -- prompt <id>        その注文ぶんの指示文を出す
 *   npm run stories -- check <file.json>  検査だけする（書き込まない）
 *   npm run stories -- publish <id> <file.json>  検査して通れば遊べる状態にする
 *   npm run stories -- fail <id> <理由>   作れなかったものを失敗として閉じる
 *
 * **LLM を API として呼ばない。** 話を書くのは、このスクリプトを動かしている
 * Claude 自身である。従量課金は発生しない。
 * 判断の根拠は docs/story-authoring-design.md、手順は docs/story-task.md。
 *
 * 必要な環境変数（.env.local からも読む）:
 *   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, FAMILY_CODE
 *
 * Supabase は service_role ではなく anon キー + 合言葉で触る。
 * アプリと同じ権限しか使わない。
 */
import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateStory, type StoryArea } from '../src/lib/story'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..')

/** .env.local はアプリ用だが、手で動かすときもここを見れば済むようにする。 */
function loadEnvLocal(): void {
  const file = path.join(repoRoot, '.env.local')
  if (!existsSync(file)) return
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m) continue
    if (process.env[m[1]]) continue
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

function env(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`環境変数 ${name} が設定されていない`)
  return value
}

type Seed = { place?: string; who?: string; mood?: string }

type StoryRow = {
  id: string
  status: string
  stage: number
  author: string
  seed: Seed | null
  ordered_at: string
}

async function rest(pathAndQuery: string, init?: RequestInit) {
  const url = env('NEXT_PUBLIC_SUPABASE_URL')
  const key = env('NEXT_PUBLIC_SUPABASE_ANON_KEY')
  const family = env('FAMILY_CODE')
  const res = await fetch(`${url}/rest/v1/${pathAndQuery}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'x-family-code': family,
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`)
  return res
}

function family(): string {
  return encodeURIComponent(env('FAMILY_CODE'))
}

/**
 * プロンプトは docs/story-prompt.md から読む。
 *
 * 親が手で LLM に投げるときと同じ文面を使う。二重に持つと必ず片方が古くなる。
 */
export function promptTemplate(markdown: string): string {
  const start = markdown.indexOf('## プロンプト本文（ここから下をコピー）')
  const end = markdown.indexOf('## プロンプト本文（ここまで）')
  if (start < 0 || end < 0 || end <= start) {
    throw new Error('docs/story-prompt.md からプロンプト本文を取り出せない')
  }
  const body = markdown.slice(markdown.indexOf('\n', start) + 1, end).trim()
  if (!body.includes('【ここに子どもが言ったこと】')) {
    throw new Error('プロンプト本文に【ここに子どもが言ったこと】が無い')
  }
  return body
}

/** 子どもが選んだ種を、そのまま読める言葉にする。 */
export function seedText(seed: Seed, stage: number): string {
  return [
    `ばしょ: ${seed.place || 'どこでもいい'}`,
    `でてくるもの: ${seed.who || 'おまかせ'}`,
    `かんじ: ${seed.mood || 'たのしい'}`,
    `かけ算の だん: ${stage} の だん`,
  ].join('\n')
}

export function buildPrompt(template: string, seed: Seed, stage: number): string {
  return template.replace('【ここに子どもが言ったこと】', seedText(seed, stage))
}

/**
 * 身元に関わる欄は、書き手に決めさせずこちらで入れる。
 * 作者も段もこちらが知っている事実であって、創作の対象ではない。
 */
export function stamp(area: StoryArea, row: { id: string; stage: number; author: string }): StoryArea {
  return { ...area, id: row.id, stage: row.stage, origin: 'original', author: row.author }
}

function readArea(file: string): StoryArea {
  return JSON.parse(readFileSync(path.resolve(file), 'utf8')) as StoryArea
}

async function getRow(id: string): Promise<StoryRow> {
  const res = await rest(
    `stories?select=id,status,stage,author,seed,ordered_at&id=eq.${encodeURIComponent(id)}&family_code=eq.${family()}&limit=1`,
  )
  const rows = (await res.json()) as StoryRow[]
  if (rows.length === 0) throw new Error(`注文 ${id} が見つからない`)
  return rows[0]
}

async function patch(id: string, body: Record<string, unknown>): Promise<void> {
  await rest(`stories?id=eq.${encodeURIComponent(id)}&family_code=eq.${family()}`, {
    method: 'PATCH',
    body: JSON.stringify({ ...body, updated_at: new Date().toISOString() }),
  })
}

async function main() {
  loadEnvLocal()
  const [command, ...args] = process.argv.slice(2)

  switch (command) {
    case 'pending': {
      const res = await rest(
        `stories?select=id,status,stage,author,seed,ordered_at&status=eq.ordered&family_code=eq.${family()}&order=ordered_at.asc`,
      )
      const rows = (await res.json()) as StoryRow[]
      if (rows.length === 0) {
        console.log('注文なし')
        return
      }
      console.log(JSON.stringify(rows, null, 2))
      return
    }

    case 'prompt': {
      const id = args[0]
      if (!id) throw new Error('使い方: npm run stories -- prompt <id>')
      const row = await getRow(id)
      const template = promptTemplate(
        readFileSync(path.join(repoRoot, 'docs', 'story-prompt.md'), 'utf8'),
      )
      console.log(buildPrompt(template, row.seed ?? {}, row.stage))
      return
    }

    case 'check': {
      const file = args[0]
      if (!file) throw new Error('使い方: npm run stories -- check <file.json>')
      const problems = validateStory(readArea(file))
      if (problems.length === 0) {
        console.log('検査を通った')
        return
      }
      console.log(`検査に通らない:\n- ${problems.join('\n- ')}`)
      process.exitCode = 1
      return
    }

    case 'publish': {
      const [id, file] = args
      if (!id || !file) throw new Error('使い方: npm run stories -- publish <id> <file.json>')
      const row = await getRow(id)
      const area = stamp(readArea(file), row)

      // 検査に落ちたら書き込まない。直して publish し直せる
      const problems = validateStory(area)
      if (problems.length > 0) {
        console.log(`検査に通らないので書き込まない:\n- ${problems.join('\n- ')}`)
        process.exitCode = 1
        return
      }

      await patch(id, { status: 'ready', area, error: null })
      console.log(`${id}: ready「${area.name}」`)
      return
    }

    case 'fail': {
      const [id, ...reason] = args
      if (!id) throw new Error('使い方: npm run stories -- fail <id> <理由>')
      await patch(id, { status: 'failed', error: reason.join(' ').slice(0, 500) || '作れなかった' })
      console.log(`${id}: failed`)
      return
    }

    default:
      console.log(
        [
          '使い方:',
          '  npm run stories -- pending                    注文の一覧',
          '  npm run stories -- prompt <id>                指示文を出す',
          '  npm run stories -- check <file.json>          検査だけ',
          '  npm run stories -- publish <id> <file.json>   検査して公開',
          '  npm run stories -- fail <id> <理由>           失敗として閉じる',
        ].join('\n'),
      )
      process.exitCode = command ? 1 : 0
  }
}

// テストから import できるよう、直接実行のときだけ走らせる
if (process.argv[1] && process.argv[1].endsWith('stories.ts')) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exit(1)
  })
}
