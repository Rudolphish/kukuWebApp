import assert from 'node:assert/strict'
import { test } from 'node:test'
import { answerYomi, questionYomi, stageYomi } from '@/lib/yomi'
import { buildQuestions, judgeInput, weightOf, QUESTIONS_PER_RUN, factsFor } from '@/lib/kuku'
import { computeBests, computeFactStats, isBetter } from '@/lib/storage/local'
import type { FactStats, Run } from '@/lib/storage/types'

test('九九の読みが 81 通りすべて埋まっている', () => {
  for (let a = 1; a <= 9; a += 1) {
    for (let b = 1; b <= 9; b += 1) {
      const yomi = answerYomi(a, b)
      // フォールバック（「6 かける 7 は 42」）に落ちていないこと
      assert.ok(!yomi.includes('かける'), `${a}x${b} の読みが未定義: ${yomi}`)
      assert.ok(/^[ぁ-ん]+$/.test(yomi), `${a}x${b} がひらがなでない: ${yomi}`)
    }
  }
})

test('代表的な唱え方が正しい', () => {
  assert.equal(answerYomi(6, 7), 'ろくしちしじゅうに')
  assert.equal(answerYomi(2, 3), 'にさんがろく')
  assert.equal(answerYomi(3, 6), 'さぶろくじゅうはち')
  assert.equal(answerYomi(8, 8), 'はっぱろくじゅうし')
  assert.equal(answerYomi(9, 9), 'くくはちじゅういち')
  assert.equal(answerYomi(1, 1), 'いんいちがいち')
  assert.equal(questionYomi(6, 7), 'ろく かける なな')
  assert.equal(stageYomi(5), 'ごのだん')
})

test('入力判定は途中入力を待ち、確定した時点で判定する', () => {
  assert.equal(judgeInput('', 42), 'pending')
  assert.equal(judgeInput('4', 42), 'pending')
  assert.equal(judgeInput('42', 42), 'correct')
  assert.equal(judgeInput('45', 42), 'wrong')
  assert.equal(judgeInput('5', 42), 'wrong')
  // 1 桁の答えは押した瞬間に確定する
  assert.equal(judgeInput('6', 6), 'correct')
  assert.equal(judgeInput('8', 6), 'wrong')
  // 答えの一部が次の桁の先頭と一致する場合も取りこぼさない
  assert.equal(judgeInput('1', 12), 'pending')
  assert.equal(judgeInput('12', 12), 'correct')
})

test('1 段ぶんの出題には 9 問すべてが必ず 1 回以上入る', () => {
  const questions = buildQuestions(5, [5], {})
  assert.equal(questions.length, QUESTIONS_PER_RUN)
  const covered = new Set(questions.map((q) => `${q.a}x${q.b}`))
  assert.equal(covered.size, 9, '9 問すべてが出題されていない')
  for (const q of questions) {
    assert.equal(q.a, 5)
    assert.equal(q.answer, q.a * q.b)
  }
})

test('同じ問題が連続して並ばない', () => {
  for (let seed = 0; seed < 50; seed += 1) {
    const questions = buildQuestions(5, [5], {})
    for (let i = 1; i < questions.length; i += 1) {
      const same = questions[i].a === questions[i - 1].a && questions[i].b === questions[i - 1].b
      assert.ok(!same, `${i} 番目で同じ問題が連続した`)
    }
  }
})

test('mix は解放済みの段のみから出題する', () => {
  const unlocked = [5, 2]
  const facts = factsFor('mix', unlocked)
  assert.equal(facts.length, 18)
  const questions = buildQuestions('mix', unlocked, {})
  for (const q of questions) assert.ok(unlocked.includes(q.a), `未解放の段が出題された: ${q.a}`)
})

test('間違えた問題ほど出題の重みが大きい', () => {
  const stats: FactStats = {
    '5x1': { attempts: 10, wrong: 0, lastWrong: false, avgMs: 1200 },
    '5x7': { attempts: 10, wrong: 5, lastWrong: true, avgMs: 5200 },
  }
  const easy = weightOf({ a: 5, b: 1 }, stats)
  const hard = weightOf({ a: 5, b: 7 }, stats)
  assert.ok(hard > easy * 2, `重みの差が小さい: ${easy} vs ${hard}`)
  // 未出題の問題は既知の得意問題より優先される
  assert.ok(weightOf({ a: 5, b: 3 }, stats) > easy)
})

test('ベストは正答数を優先し、同数ならタイムで比べる', () => {
  const base = { who: 'child' as const, stage: 5, at: '2026-01-01T00:00:00.000Z' }
  // わざと間違えて速く終える記録が上位にならないこと
  assert.equal(isBetter({ ...base, totalMs: 1000, correct: 5, total: 10 }, { ...base, totalMs: 9000, correct: 10, total: 10 }), false)
  assert.equal(isBetter({ ...base, totalMs: 8000, correct: 10, total: 10 }, { ...base, totalMs: 9000, correct: 10, total: 10 }), true)
})

test('記録から段ごとのベストと問題ごとの統計を集計できる', () => {
  const runs: Run[] = [
    {
      id: 'b', who: 'child', stage: 5, totalMs: 8000, correct: 10, total: 10,
      at: '2026-01-02T00:00:00.000Z',
      facts: [{ a: 5, b: 7, correct: true, ms: 800 }],
    },
    {
      id: 'a', who: 'child', stage: 5, totalMs: 12000, correct: 9, total: 10,
      at: '2026-01-01T00:00:00.000Z',
      facts: [{ a: 5, b: 7, correct: false, ms: 3000 }],
    },
  ]
  const bests = computeBests(runs)
  assert.equal(bests.length, 1)
  assert.equal(bests[0].totalMs, 8000)

  const stats = computeFactStats(runs, 'child')
  assert.equal(stats['5x7'].attempts, 2)
  assert.equal(stats['5x7'].wrong, 1)
  // 新しい方（正解）が最後に畳み込まれる
  assert.equal(stats['5x7'].lastWrong, false)
  assert.equal(computeFactStats(runs, 'parent')['5x7'], undefined)
})
