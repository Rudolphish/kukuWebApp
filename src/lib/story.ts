/**
 * ストーリー（第 2 段階）のデータ構造と検証。
 *
 * 形はゲームブック。番号付きのパラグラフを選択肢でたどる。
 * 命令列は持たない。変数もフラグもラベルジャンプも無く、
 * パラグラフと行き先だけで話が成立する。
 *
 * 文章は LLM が生成する。生成物は壊れうるので、
 * 守ってほしい性質は指示ではなくこの検証で保証する。
 */

export type StoryEnemy = {
  id: string
  name: string
  emoji: string
  /** 戦いの前のあいさつ */
  greeting: string
  /** 1 問あたったときのひとこと */
  onCorrect: string[]
  /** 間違えたときのひとこと。敵も間違える立場で書く */
  onWrong: string[]
}

export type StoryChoice = {
  label: string
  /** 行き先のパラグラフ id */
  to: string
}

export type StoryParagraph = {
  id: string
  text: string
  /** 戦いが起きるなら敵の id。勝敗は行き先を変えない */
  battle?: string
  /** 勝ったときの結び。battle があるなら必須 */
  outroWin?: string
  /** 負けたときの結び。battle があるなら必須。劣化版にしない */
  outroLose?: string
  choices?: StoryChoice[]
  /** 街へ帰る終端 */
  end?: boolean
}

/**
 * 話の出どころ。
 *
 * default はアプリに最初から入っている話で、種が出る前から遊べる。
 * 同時に「こういうものが作れる」の見本として働く。
 * original は子どもが作った話。作者の名前を画面に出すため author を必須にする。
 */
export type StoryOrigin = 'default' | 'original'

export type StoryArea = {
  id: string
  name: string
  origin: StoryOrigin
  /** origin が original のとき必須。「◯◯が つくった おはなし」として出す */
  author?: string
  /** このエリアで出す段 */
  stage: number
  /** 街の住人のセリフ。進行度ごとに変わり、話の縦の筋を作る */
  town: { progress: number; speaker: string; line: string }[]
  enemies: StoryEnemy[]
  /** 散策のはじまり */
  start: string
  paragraphs: StoryParagraph[]
}

/** 1 パラグラフの上限。音声で 30 秒以内に収める目安。 */
export const MAX_TEXT_LENGTH = 100
/** 街を出て街へ帰るまでのノード数。1 ループ 3 分の歯止めになる。 */
export const MIN_DEPTH = 3
export const MAX_DEPTH = 5

const KANJI = /[㐀-䶿一-鿿]/

/**
 * 検証。問題があればその説明を配列で返す。空なら通過。
 *
 * ここで弾きたいのは主に 2 つ。
 *  - 行き止まり。ゲームブックの「冒険はここで終わった」は減点そのもの
 *  - 負けたときの結びの書き忘れ。勝敗で話を止めないことを型で担保する
 */
export function validateStory(area: StoryArea): string[] {
  const errors: string[] = []
  const byId = new Map<string, StoryParagraph>()
  const enemyIds = new Set(area.enemies.map((e) => e.id))

  for (const p of area.paragraphs) {
    if (byId.has(p.id)) errors.push(`パラグラフ id が重複している: ${p.id}`)
    byId.set(p.id, p)
  }

  if (!byId.has(area.start)) errors.push(`start が存在しない: ${area.start}`)

  // 自分の話には名前が出る。柱 4 の効き目はここに宿るので、空のまま通さない
  if (area.origin === 'original' && !area.author?.trim()) {
    errors.push('origin が original なのに author が無い')
  }
  if (area.origin === 'default' && area.author) {
    errors.push('origin が default なのに author がある')
  }

  for (const p of area.paragraphs) {
    const where = `パラグラフ ${p.id}`

    if (p.text.length > MAX_TEXT_LENGTH) {
      errors.push(`${where}: 本文が ${p.text.length} 字。${MAX_TEXT_LENGTH} 字以内にする`)
    }

    // 出口が無いパラグラフを作らせない
    const hasChoices = (p.choices?.length ?? 0) > 0
    if (!p.end && !hasChoices) errors.push(`${where}: 行き止まり。choices を置くか end にする`)
    if (p.end && hasChoices) errors.push(`${where}: end なのに choices がある`)

    for (const c of p.choices ?? []) {
      if (!byId.has(c.to)) errors.push(`${where}: 行き先が存在しない (${c.to})`)
      if (!c.label.trim()) errors.push(`${where}: 選択肢の文字が空`)
    }

    if (p.battle !== undefined) {
      if (!enemyIds.has(p.battle)) errors.push(`${where}: 敵が存在しない (${p.battle})`)
      if (!p.outroWin) errors.push(`${where}: outroWin が無い`)
      // 負けたときの話を書き忘れられない構造にしておく
      if (!p.outroLose) errors.push(`${where}: outroLose が無い。負けても話は進む`)
    } else if (p.outroWin || p.outroLose) {
      errors.push(`${where}: 戦いが無いのに勝敗の結びがある`)
    }
  }

  for (const [label, text] of collectText(area)) {
    if (KANJI.test(text)) errors.push(`${label}: 漢字が入っている（ひらがな・カタカナで書く）`)
  }

  for (const e of area.enemies) {
    if (e.onCorrect.length === 0) errors.push(`敵 ${e.id}: onCorrect が空`)
    if (e.onWrong.length === 0) errors.push(`敵 ${e.id}: onWrong が空`)
  }

  errors.push(...checkGraph(area, byId))
  return errors
}

/** 到達できないパラグラフ、終端へ行けない経路、深さの逸脱を調べる。 */
function checkGraph(area: StoryArea, byId: Map<string, StoryParagraph>): string[] {
  const errors: string[] = []
  if (!byId.has(area.start)) return errors

  // start から到達できるか
  const reachable = new Set<string>()
  const queue = [area.start]
  while (queue.length > 0) {
    const id = queue.shift() as string
    if (reachable.has(id)) continue
    reachable.add(id)
    for (const c of byId.get(id)?.choices ?? []) if (byId.has(c.to)) queue.push(c.to)
  }
  for (const p of area.paragraphs) {
    if (!reachable.has(p.id)) errors.push(`パラグラフ ${p.id}: どこからも たどり着けない`)
  }

  // すべての経路が終端に至るか。循環だけで閉じていると街へ帰れなくなる
  const canEnd = new Set<string>()
  let changed = true
  while (changed) {
    changed = false
    for (const p of area.paragraphs) {
      if (canEnd.has(p.id)) continue
      if (p.end || (p.choices ?? []).some((c) => canEnd.has(c.to))) {
        canEnd.add(p.id)
        changed = true
      }
    }
  }
  for (const id of reachable) {
    if (!canEnd.has(id)) errors.push(`パラグラフ ${id}: ここから街へ帰れない`)
  }

  const depths = pathDepths(area, byId)
  if (depths.length > 0) {
    const min = Math.min(...depths)
    const max = Math.max(...depths)
    if (min < MIN_DEPTH) errors.push(`最短の経路が ${min} ノード。${MIN_DEPTH} 以上にする`)
    if (max > MAX_DEPTH) errors.push(`最長の経路が ${max} ノード。${MAX_DEPTH} 以下にする`)
  }
  return errors
}

/** start から終端までの経路ごとのノード数。循環は打ち切る。 */
function pathDepths(area: StoryArea, byId: Map<string, StoryParagraph>): number[] {
  const depths: number[] = []
  const walk = (id: string, seen: string[]) => {
    if (seen.includes(id)) return
    const p = byId.get(id)
    if (!p) return
    const path = [...seen, id]
    if (p.end || (p.choices?.length ?? 0) === 0) {
      depths.push(path.length)
      return
    }
    for (const c of p.choices ?? []) walk(c.to, path)
  }
  walk(area.start, [])
  return depths
}

/** 検証の対象になる文字列をすべて集める。 */
function collectText(area: StoryArea): [string, string][] {
  const out: [string, string][] = []
  for (const t of area.town) out.push([`街 (progress ${t.progress})`, t.line])
  for (const e of area.enemies) {
    out.push([`敵 ${e.id} のあいさつ`, e.greeting])
    e.onCorrect.forEach((l, i) => out.push([`敵 ${e.id} の onCorrect[${i}]`, l]))
    e.onWrong.forEach((l, i) => out.push([`敵 ${e.id} の onWrong[${i}]`, l]))
  }
  for (const p of area.paragraphs) {
    out.push([`パラグラフ ${p.id}`, p.text])
    if (p.outroWin) out.push([`パラグラフ ${p.id} の outroWin`, p.outroWin])
    if (p.outroLose) out.push([`パラグラフ ${p.id} の outroLose`, p.outroLose])
    for (const c of p.choices ?? []) out.push([`パラグラフ ${p.id} の選択肢`, c.label])
  }
  return out
}
