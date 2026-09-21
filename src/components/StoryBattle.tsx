'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useApp } from './AppProvider'
import { QUESTIONS_PER_RUN, buildQuestions, judgeInput, type Question } from '@/lib/kuku'
import { speak } from '@/lib/speech'
import type { StoryEnemy } from '@/lib/story'
import type { FactResult, Run } from '@/lib/storage'
import { answerYomi, questionYomi } from '@/lib/yomi'

/** 正解表示の間。短くしすぎるとキーを押した実感が出ない。 */
const CORRECT_HOLD_MS = 380
/** 不正解のときは唱え方を聞かせるので長めに取る。ここが覚える瞬間になる。 */
const WRONG_HOLD_MS = 1600

/**
 * ストーリーの中の戦い。
 *
 * タイムアタックと違い、時間は競わない。だからタイマーを出さない。
 * 記録は mode: 'story' として残し、ベスト記録には並べない。
 * ただし問題ごとの習熟度には積む。どちらで解いても覚えたことに変わりはない。
 */
export default function StoryBattle({
  stage,
  enemy,
  onBubble,
  onDone,
}: {
  stage: number
  enemy: StoryEnemy
  onBubble: (lines: string[]) => void
  onDone: (won: boolean) => void
}) {
  const { device, store } = useApp()
  const [questions, setQuestions] = useState<Question[]>([])
  const [index, setIndex] = useState(0)
  const [input, setInput] = useState('')
  const [revealed, setRevealed] = useState<'correct' | 'wrong' | null>(null)
  const results = useRef<FactResult[]>([])
  const startedAt = useRef(0)
  const voice = device.voice

  useEffect(() => {
    store.getFactStats(device.role).then((stats) => {
      setQuestions(buildQuestions(stage, [stage], stats))
    })
  }, [stage, store, device.role])

  const current = questions[index]

  useEffect(() => {
    if (!current) return
    startedAt.current = performance.now()
    setInput('')
    setRevealed(null)
    if (voice) speak(questionYomi(current.a, current.b))
  }, [current, voice])

  const finish = useCallback(async () => {
    const facts = results.current
    const correct = facts.filter((f) => f.correct).length
    const run: Run = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      who: device.role,
      mode: 'story',
      stage,
      totalMs: facts.reduce((sum, f) => sum + f.ms, 0),
      correct,
      total: facts.length,
      at: new Date().toISOString(),
      facts,
    }
    await store.addRun(run)
    onDone(correct === facts.length)
  }, [device.role, onDone, stage, store])

  const commit = useCallback(
    (correct: boolean) => {
      if (!current) return
      results.current.push({
        a: current.a,
        b: current.b,
        correct,
        ms: performance.now() - startedAt.current,
      })
      setRevealed(correct ? 'correct' : 'wrong')
      onBubble(correct ? enemy.onCorrect : enemy.onWrong)
      // 間違えたときだけ唱え方を聞かせる。覚えるべき形が必要な場所にだけ出る
      if (voice && !correct) speak(answerYomi(current.a, current.b), { rate: 1.0 })

      setTimeout(
        () => {
          if (results.current.length >= QUESTIONS_PER_RUN) void finish()
          else setIndex((i) => i + 1)
        },
        correct ? CORRECT_HOLD_MS : WRONG_HOLD_MS,
      )
    },
    [current, enemy.onCorrect, enemy.onWrong, finish, onBubble, voice],
  )

  const press = useCallback(
    (digit: string) => {
      if (!current || revealed) return
      const next = input + digit
      setInput(next)
      const verdict = judgeInput(next, current.answer)
      if (verdict === 'correct') commit(true)
      else if (verdict === 'wrong') commit(false)
    },
    [commit, current, input, revealed],
  )

  if (!current) return <div style={{ flex: '0 0 auto', minHeight: 200 }} />

  const hp = Math.max(0, QUESTIONS_PER_RUN - results.current.filter((r) => r.correct).length)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, flex: '0 0 auto' }}>
      <div className="hpTrack">
        <div className="hpFill" style={{ width: `${(hp / QUESTIONS_PER_RUN) * 100}%` }} />
      </div>
      <div
        style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 800 }}
      >
        <span>{enemy.name}</span>
        <span className="muted">
          {index + 1} / {QUESTIONS_PER_RUN}
        </span>
      </div>

      <div className="question">
        {current.a} <span style={{ color: 'var(--accent)' }}>×</span> {current.b}
      </div>
      <div className="answerSlot" data-state={revealed ?? 'input'}>
        {revealed === 'wrong' ? (
          <span style={{ color: 'var(--accent2)' }}>{current.answer}</span>
        ) : (
          input || <span style={{ opacity: 0.25 }}>?</span>
        )}
      </div>

      <div className="keypad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button key={d} className="key" onClick={() => press(d)}>
            {d}
          </button>
        ))}
        <button className="key" style={{ fontSize: 18 }} onClick={() => setInput((v) => v.slice(0, -1))}>
          けす
        </button>
        <button className="key" onClick={() => press('0')}>
          0
        </button>
        <button
          className="key"
          style={{ fontSize: 26 }}
          aria-label="もういちど きく"
          onClick={() => speak(questionYomi(current.a, current.b))}
        >
          🔊
        </button>
      </div>
    </div>
  )
}
