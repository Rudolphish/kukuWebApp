/**
 * 注文された話を作る。
 *
 *   node --import tsx scripts/generate-stories.ts
 *   node --import tsx scripts/generate-stories.ts --dry-run   # API を呼ばず、組み立てたプロンプトだけ出す
 *
 * スケジュール実行（.github/workflows/generate-stories.yml）から呼ばれる。
 * アプリ側に生成の口を作らないので、Anthropic の API キーを置く場所はここだけで済む。
 * 判断の根拠は docs/story-authoring-design.md。
 *
 * 必要な環境変数:
 *   SUPABASE_URL, SUPABASE_ANON_KEY, FAMILY_CODE, ANTHROPIC_API_KEY
 *
 * Supabase は service_role ではなく anon キー + 合言葉で触る。
 * 生成のために全権限の鍵を増やす理由がない。
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import Anthropic from '@anthropic-ai/sdk'
import { validateStory, type StoryArea } from '../src/lib/story'

/** 1 回の実行で作る本数。クライアント側の制限は迂回されうるが、ここは迂回されない。 */
const PER_RUN = 3

/** 検査を通らなかったときの作り直し回数。 */
const RETRIES = 1

const MODEL = 'claude-opus-5-5'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..')

const dryRun = process.argv.includes('--dry-run')

type Seed = { place?: string; who?: string; mood?: string }

type StoryRow = {
  id: string
  stage: number
  author: string
  seed: Seed | null
}

function env(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`環境変数 ${name} が設定されていない`)
  return value
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
  const lines = [
    `ばしょ: ${seed.place || 'どこでもいい'}`,
    `でてくるもの: ${seed.who || 'おまかせ'}`,
    `かんじ: ${seed.mood || 'たのしい'}`,
    `かけ算の だん: ${stage} の だん`,
  ]
  return lines.join('\n')
}

export function buildPrompt(template: string, seed: Seed, stage: number): string {
  return template.replace('【ここに子どもが言ったこと】', seedText(seed, stage))
}

/** ```json で囲まれていても取り出せるようにする。 */
export function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const body = (fenced ? fenced[1] : text).trim()
  const first = body.indexOf('{')
  const last = body.lastIndexOf('}')
  if (first < 0 || last <= first) throw new Error('JSON が見つからない')
  return body.slice(first, last + 1)
}

/**
 * 身元に関わる欄は、モデルに決めさせずこちらで入れる。
 * 作者も段もこちらが知っている事実であって、創作の対象ではない。
 */
export function stamp(area: StoryArea, row: StoryRow): StoryArea {
  return { ...area, id: row.id, stage: row.stage, origin: 'original', author: row.author }
}

async function supabase(url: string, key: string, family: string, path: string, init?: RequestInit) {
  const res = await fetch(`${url}/rest/v1/${path}`, {
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

async function generate(client: Anthropic, prompt: string): Promise<string> {
  const message = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    messages: [{ role: 'user', content: prompt }],
  })
  if (message.stop_reason === 'refusal') {
    throw new Error(`生成を断られた: ${message.stop_details?.explanation ?? ''}`)
  }
  const text = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('')
  if (!text.trim()) throw new Error('空の応答')
  return text
}

async function main() {
  const template = promptTemplate(
    readFileSync(path.join(repoRoot, 'docs', 'story-prompt.md'), 'utf8'),
  )

  if (dryRun) {
    const sample: StoryRow = {
      id: 'story-dry-run',
      stage: 5,
      author: 'そうた',
      seed: { place: 'うみ', who: 'ねこの きし', mood: 'ふしぎ' },
    }
    console.log(buildPrompt(template, sample.seed ?? {}, sample.stage))
    return
  }

  const url = env('SUPABASE_URL')
  const key = env('SUPABASE_ANON_KEY')
  const family = env('FAMILY_CODE')
  const client = new Anthropic({ apiKey: env('ANTHROPIC_API_KEY') })

  const res = await supabase(
    url,
    key,
    family,
    `stories?select=id,stage,author,seed&status=eq.ordered&family_code=eq.${encodeURIComponent(family)}&order=ordered_at.asc&limit=${PER_RUN}`,
  )
  const rows = (await res.json()) as StoryRow[]

  if (rows.length === 0) {
    console.log('注文なし')
    return
  }
  console.log(`${rows.length} 件の注文を処理する`)

  for (const row of rows) {
    const prompt = buildPrompt(template, row.seed ?? {}, row.stage)
    let area: StoryArea | null = null
    let lastError = ''

    for (let attempt = 0; attempt <= RETRIES; attempt += 1) {
      try {
        const parsed = stamp(JSON.parse(extractJson(await generate(client, prompt))), row)
        // LLM の出力をそのまま信用しない。壊れた話を子どもの画面に出さない
        const problems = validateStory(parsed)
        if (problems.length === 0) {
          area = parsed
          break
        }
        lastError = problems.join(' / ')
        console.log(`${row.id}: 検査に通らず (${attempt + 1}回目) ${lastError}`)
      } catch (e) {
        lastError = e instanceof Error ? e.message : String(e)
        console.log(`${row.id}: 失敗 (${attempt + 1}回目) ${lastError}`)
      }
    }

    const patch = area
      ? { status: 'ready', area, error: null, updated_at: new Date().toISOString() }
      : {
          status: 'failed',
          error: lastError.slice(0, 500),
          updated_at: new Date().toISOString(),
        }

    await supabase(
      url,
      key,
      family,
      `stories?id=eq.${encodeURIComponent(row.id)}&family_code=eq.${encodeURIComponent(family)}`,
      { method: 'PATCH', body: JSON.stringify(patch) },
    )
    console.log(`${row.id}: ${patch.status}`)
  }
}

// --dry-run 以外で呼ばれたときだけ走らせる（テストから import できるようにする）
if (process.argv[1] && process.argv[1].endsWith('generate-stories.ts')) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exit(1)
  })
}
