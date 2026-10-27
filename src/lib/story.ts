/**
 * ストーリー（第 2 段階）のデータ構造と検証。
 *
 * 形は「骨組みは固定、中身は引き直し」。
 * 散策は必ず 道を選ぶ → 場面 → 場面 → 出会い → 街へ帰る の順で進む。
 * 各ステップの中身をプールから引くことで、同じ骨組みのまま毎回違う散策になる。
 *
 * 経路そのものを枝分かれさせる形（純粋なゲームブック）は採らなかった。
 * 10 通りの道を作るには 1 エリアあたり 15 場面ほど要り、9 段ぶん書くと破綻する。
 * しかも書いた本数ぶんしか遊べない。プールから引く形なら、
 * 場面を 1 つ足すだけで組み合わせが増える。
 *
 * 設計メモの判断 4「街は縦の筋、散策は横の変化」に戻る形でもある。
 *
 * 文章は LLM が生成する。生成物は壊れうるので、
 * 守ってほしい性質は指示ではなくこの検証で保証する。
 */

export type StoryOrigin = 'default' | 'original'

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

/** 散策のはじめに選ぶ道。選んだ道によって出会う相手が変わる。 */
export type StoryBranch = {
  id: string
  label: string
}

/** 何も起きない場面。出会いと出会いの間に挟み、話の呼吸を作る。 */
export type StoryScene = {
  id: string
  text: string
  /** 特定の道でだけ出す場合に指定する。省略すればどの道でも出る */
  branch?: string
}

/** 相手と出会う場面。ここで戦いが起きる。 */
export type StoryEncounter = {
  id: string
  /** どの道で出会うか */
  branch: string
  enemy: string
  text: string
  outroWin: string
  /** 負けても話は進む。劣化版にしない */
  outroLose: string
}

/**
 * 散策の形の話。道を選び、場面と出会いをプールから引いて歩く。
 * 同梱の 2 エリアと、2026-10-27 までに作られた話がこの形。
 */
export type WalkArea = {
  format?: 'walk'
  id: string
  name: string
  origin: StoryOrigin
  /** origin が original のとき必須。「◯◯が つくった おはなし」として出す */
  author?: string
  /** このエリアで出す段 */
  stage: number
  /** 街の住人のセリフ。進行度ごとに変わり、話の縦の筋を作る */
  town: { progress: number; speaker: string; line: string }[]
  /** 道を選ぶときの問いかけ */
  forkText: string
  branches: StoryBranch[]
  enemies: StoryEnemy[]
  scenes: StoryScene[]
  encounters: StoryEncounter[]
}

/** 小説の形の 1 ページ。speaker があればセリフとして出す */
export type NovelPage = {
  text: string
  speaker?: string
}

/**
 * 小説の形の話。はじめから順に読み、最後に 1 回だけ戦う。
 *
 * 散策の形は、場面がばらばらに引かれるため筋が無く、単調になった。
 * 戦いも散策のたびに起きて、子どもが面倒がった。
 * 判断の記録は docs/story-authoring-design.md の判断 9。
 */
export type NovelArea = {
  format: 'novel'
  id: string
  name: string
  origin: StoryOrigin
  author?: string
  stage: number
  /** おもな登場人物。カードの絵文字と、つづきの候補に使う */
  cast: { name: string; emoji: string }[]
  /** 本文。はじめから順に読む */
  pages: NovelPage[]
  /** 最後の戦い。intro は戦いの直前に読む地の文 */
  boss: { intro: string; enemy: StoryEnemy }
  /** 戦いのあとの結び。負けても話は終わりまで進む。劣化版にしない */
  ending: { win: NovelPage[]; lose: NovelPage[] }
}

export type StoryArea = WalkArea | NovelArea

export function isNovel(area: StoryArea): area is NovelArea {
  return area.format === 'novel'
}

/** 小説の 1 ページの上限。声に出して 40 秒ほど */
export const MAX_PAGE_LENGTH = 160
/** 小説のページ数の範囲。短すぎると筋が立たず、長すぎると 1 回で読み切れない */
export const MIN_NOVEL_PAGES = 12
export const MAX_NOVEL_PAGES = 30
/** 結びのページ数の範囲 */
export const MAX_ENDING_PAGES = 5
/** 画面に出さない言葉。このアプリは勉強を名乗らない */
export const BANNED_WORDS = ['べんきょう', 'ドリル', 'がくしゅう', 'テスト']

/** 1 パラグラフの上限。音声で 30 秒以内に収める目安。 */
export const MAX_TEXT_LENGTH = 100
/** 1 回の散策で引く場面の数。 */
export const SCENES_PER_WALK = 2
/**
 * 1 回の散策で起きる戦いの数。ここが 1 ループの長さを決める。
 *
 * 当初は 2 回だったが、実機で「何回も戦うと面倒になる」ことが分かり 1 回にした。
 * 戦いは散策の最後に置く。話を読んだ先にご褒美として戦いがある形にする。
 */
export const ENCOUNTERS_PER_WALK = 1
/**
 * 道ごとに必要な出会いの数。1 回に引くのは 1 つでも、
 * 直近に出たものを避けて次の散策で別の あいて を出すには 2 つ以上要る。
 */
export const MIN_ENCOUNTERS_PER_BRANCH = 2
/** 1 エリアで作れる散策の組み合わせの下限。同じ散策ばかりだと一度で飽きる。 */
export const MIN_COMBINATIONS = 10

const KANJI = /[㐀-䶿一-鿿]/

/** そのエリアで組める散策の通り数。道 × 場面の並び × 出会いの並び。 */
export function countCombinations(area: WalkArea): number {
  let total = 0
  for (const branch of area.branches) {
    const scenes = area.scenes.filter((s) => !s.branch || s.branch === branch.id).length
    const encounters = area.encounters.filter((e) => e.branch === branch.id).length
    total += ordered(scenes, SCENES_PER_WALK) * ordered(encounters, ENCOUNTERS_PER_WALK)
  }
  return total
}

/** n 個から k 個を、順番をつけて重複なく選ぶ通り数。 */
function ordered(n: number, k: number): number {
  let out = 1
  for (let i = 0; i < k; i += 1) out *= Math.max(0, n - i)
  return out
}

/**
 * 検証。問題があればその説明を配列で返す。空なら通過。
 *
 * この形では行き止まりが構造的に起きない（歩数が決まっているため）。
 * 代わりに、引くものが足りずに散策が組めない事態を防ぐ。
 */
export function validateStory(area: StoryArea): string[] {
  if (isNovel(area)) return validateNovel(area)
  return validateWalk(area)
}

function validateIdentity(area: StoryArea, errors: string[]): void {
  if (area.origin === 'original' && !area.author?.trim()) {
    errors.push('origin が original なのに author が無い')
  }
  if (area.origin === 'default' && area.author) {
    errors.push('origin が default なのに author がある')
  }
}

function validateNovel(area: NovelArea): string[] {
  const errors: string[] = []
  validateIdentity(area, errors)
  if (!area.name?.trim()) errors.push('name が無い')

  const cast = Array.isArray(area.cast) ? area.cast : []
  if (cast.length === 0) errors.push('cast（おもな登場人物）が無い')
  for (const [i, c] of cast.entries()) {
    if (!c?.name?.trim() || !c?.emoji?.trim()) errors.push(`cast[${i}]: name と emoji が要る`)
  }

  const pages = Array.isArray(area.pages) ? area.pages : []
  if (pages.length < MIN_NOVEL_PAGES || pages.length > MAX_NOVEL_PAGES) {
    errors.push(`pages が ${pages.length} ページ。${MIN_NOVEL_PAGES}〜${MAX_NOVEL_PAGES} ページにする`)
  }

  const enemy = area.boss?.enemy
  if (!area.boss?.intro?.trim()) errors.push('boss.intro が無い')
  if (!enemy?.id || !enemy?.name || !enemy?.emoji || !enemy?.greeting) {
    errors.push('boss.enemy に id・name・emoji・greeting が要る')
  }
  if (!enemy?.onCorrect?.length) errors.push('boss.enemy.onCorrect が空')
  if (!enemy?.onWrong?.length) errors.push('boss.enemy.onWrong が空')

  for (const side of ['win', 'lose'] as const) {
    const n = area.ending?.[side]?.length ?? 0
    // 負けたときの結びを書き忘れられない構造にしておく
    if (n === 0) errors.push(`ending.${side} が無い。${side === 'lose' ? '負けても話は終わりまで進む' : ''}`)
    if (n > MAX_ENDING_PAGES) errors.push(`ending.${side} が ${n} ページ。${MAX_ENDING_PAGES} ページ以内にする`)
  }

  for (const [label, text, max] of collectNovelText(area)) {
    if (typeof text !== 'string' || !text.trim()) {
      errors.push(`${label}: 空`)
      continue
    }
    if (text.length > max) errors.push(`${label}: ${text.length} 字。${max} 字以内にする`)
    if (KANJI.test(text)) errors.push(`${label}: 漢字が入っている（ひらがな・カタカナで書く）`)
    for (const w of BANNED_WORDS) if (text.includes(w)) errors.push(`${label}: 「${w}」を使わない`)
  }
  return errors
}

function collectNovelText(area: NovelArea): [string, string, number][] {
  const out: [string, string, number][] = [['name', area.name, MAX_TEXT_LENGTH]]
  ;(area.pages ?? []).forEach((p, i) => {
    out.push([`pages[${i}]`, p?.text, MAX_PAGE_LENGTH])
    if (p?.speaker !== undefined) out.push([`pages[${i}].speaker`, p.speaker, MAX_TEXT_LENGTH])
  })
  if (area.boss) out.push(['boss.intro', area.boss.intro, MAX_PAGE_LENGTH])
  const e = area.boss?.enemy
  if (e) {
    out.push(['boss.enemy.name', e.name, MAX_TEXT_LENGTH])
    out.push(['boss.enemy.greeting', e.greeting, MAX_TEXT_LENGTH])
    ;(e.onCorrect ?? []).forEach((l, i) => out.push([`boss.enemy.onCorrect[${i}]`, l, MAX_TEXT_LENGTH]))
    ;(e.onWrong ?? []).forEach((l, i) => out.push([`boss.enemy.onWrong[${i}]`, l, MAX_TEXT_LENGTH]))
  }
  for (const side of ['win', 'lose'] as const) {
    ;(area.ending?.[side] ?? []).forEach((p, i) => out.push([`ending.${side}[${i}]`, p?.text, MAX_PAGE_LENGTH]))
  }
  ;(area.cast ?? []).forEach((c, i) => out.push([`cast[${i}].name`, c?.name, MAX_TEXT_LENGTH]))
  return out
}

function validateWalk(area: WalkArea): string[] {
  const errors: string[] = []
  const enemyIds = new Set(area.enemies.map((e) => e.id))
  const branchIds = new Set(area.branches.map((b) => b.id))

  validateIdentity(area, errors)

  if (area.branches.length < 2) errors.push('道が 2 つ未満。選ぶ意味が無くなる')
  assertUnique(area.branches.map((b) => b.id), '道', errors)
  assertUnique(area.scenes.map((s) => s.id), '場面', errors)
  assertUnique(area.encounters.map((e) => e.id), '出会い', errors)
  assertUnique(area.enemies.map((e) => e.id), 'あいて', errors)

  for (const scene of area.scenes) {
    if (scene.branch && !branchIds.has(scene.branch)) {
      errors.push(`場面 ${scene.id}: 道が存在しない (${scene.branch})`)
    }
  }

  for (const enc of area.encounters) {
    const where = `出会い ${enc.id}`
    if (!branchIds.has(enc.branch)) errors.push(`${where}: 道が存在しない (${enc.branch})`)
    if (!enemyIds.has(enc.enemy)) errors.push(`${where}: あいてが存在しない (${enc.enemy})`)
    if (!enc.outroWin) errors.push(`${where}: outroWin が無い`)
    // 負けたときの話を書き忘れられない構造にしておく
    if (!enc.outroLose) errors.push(`${where}: outroLose が無い。負けても話は進む`)
  }

  // 道ごとに、1 回の散策ぶんを引けるだけの数があるか
  for (const branch of area.branches) {
    const scenes = area.scenes.filter((s) => !s.branch || s.branch === branch.id).length
    const encounters = area.encounters.filter((e) => e.branch === branch.id).length
    if (scenes < SCENES_PER_WALK) {
      errors.push(`道 ${branch.id}: 場面が ${scenes} 個。${SCENES_PER_WALK} 個以上要る`)
    }
    if (encounters < MIN_ENCOUNTERS_PER_BRANCH) {
      errors.push(`道 ${branch.id}: 出会いが ${encounters} 個。${MIN_ENCOUNTERS_PER_BRANCH} 個以上要る`)
    }
  }

  const combos = countCombinations(area)
  if (combos < MIN_COMBINATIONS) {
    errors.push(`散策の組み合わせが ${combos} 通り。${MIN_COMBINATIONS} 通り以上にする`)
  }

  for (const [label, text] of collectText(area)) {
    if (text.length > MAX_TEXT_LENGTH) {
      errors.push(`${label}: ${text.length} 字。${MAX_TEXT_LENGTH} 字以内にする`)
    }
    if (KANJI.test(text)) errors.push(`${label}: 漢字が入っている（ひらがな・カタカナで書く）`)
  }

  for (const e of area.enemies) {
    if (e.onCorrect.length === 0) errors.push(`あいて ${e.id}: onCorrect が空`)
    if (e.onWrong.length === 0) errors.push(`あいて ${e.id}: onWrong が空`)
  }

  return errors
}

function assertUnique(ids: string[], label: string, errors: string[]): void {
  const seen = new Set<string>()
  for (const id of ids) {
    if (seen.has(id)) errors.push(`${label}の id が重複している: ${id}`)
    seen.add(id)
  }
}

/** 検証の対象になる文字列をすべて集める。 */
function collectText(area: WalkArea): [string, string][] {
  const out: [string, string][] = []
  out.push(['道を選ぶ問いかけ', area.forkText])
  for (const b of area.branches) out.push([`道 ${b.id}`, b.label])
  for (const t of area.town) out.push([`街 (progress ${t.progress})`, t.line])
  for (const e of area.enemies) {
    out.push([`あいて ${e.id} のあいさつ`, e.greeting])
    e.onCorrect.forEach((l, i) => out.push([`あいて ${e.id} の onCorrect[${i}]`, l]))
    e.onWrong.forEach((l, i) => out.push([`あいて ${e.id} の onWrong[${i}]`, l]))
  }
  for (const s of area.scenes) out.push([`場面 ${s.id}`, s.text])
  for (const e of area.encounters) {
    out.push([`出会い ${e.id}`, e.text])
    out.push([`出会い ${e.id} の outroWin`, e.outroWin])
    out.push([`出会い ${e.id} の outroLose`, e.outroLose])
  }
  return out
}
