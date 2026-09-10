'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useApp } from './AppProvider'
import Result from './Result'
import {
  buildQuestions,
  formatMs,
  judgeInput,
  QUESTIONS_PER_RUN,
  unlockedStages,
  type Question,
} from '@/lib/kuku'
import { speak, stopSpeaking } from '@/lib/speech'
import { answerYomi, questionYomi } from '@/lib/yomi'
import type { FactResult, Run, StageKey, Who } from '@/lib/storage'
import { enemyEmoji, enemyName } from '@/lib/themes'

type Phase = 'loading' | 'countdown' | 'playing' | 'reveal' | 'done'

/** 正解表示の間。短くしすぎるとキーを押した実感が出ない。 */
const CORRECT_HOLD_MS = 380
/** 不正解のときは唱え方を聞かせるので長めに取る。ここが覚える瞬間になる。 */
const WRONG_HOLD_MS = 1600

export default function PlayScreen() {
  const router = useRouter()
  const params = useSearchParams()
  const { settings, theme, ready, store } = useApp()

  const stageParam = params.get('stage')
  const stage: StageKey = stageParam === 'mix' ? 'mix' : Number(stageParam || 1)
  const who: Who = params.get('who') === 'parent' ? 'parent' : 'child'

  const [phase, setPhase] = useState<Phase>('loading')
  const [countdown, setCountdown] = useState(3)
  const [questions, setQuestions] = useState<Question[]>([])
  const [index, setIndex] = useState(0)
  const [input, setInput] = useState('')
  const [results, setResults] = useState<FactResult[]>([])
  const [lastCorrect, setLastCorrect] = useState<boolean | null>(null)
  const [hit, setHit] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [finishedRun, setFinishedRun] = useState<Run | null>(null)

  /** 問題が表示された時刻。考えている時間だけを測り、解説の間は測らない。 */
  const questionStart = useRef(0)
  const current = questions[index]
  const voice = settings.voice

  // 出題を組む。苦手な問題ほど厚くなるが、その事実は画面に出さない。
  useEffect(() => {
    if (!ready || phase !== 'loading') return
    const unlocked = unlockedStages(settings.stageOrder, settings.unlockedCount)
    store.getFactStats(who).then((stats) => {
      setQuestions(buildQuestions(stage, unlocked, stats))
      setPhase('countdown')
    })
  }, [ready, phase, settings.stageOrder, settings.unlockedCount, stage, store, who])

  // カウントダウン
  useEffect(() => {
    if (phase !== 'countdown') return
    if (countdown <= 0) {
      setPhase('playing')
      return
    }
    const timer = setTimeout(() => setCountdown((n) => n - 1), 520)
    return () => clearTimeout(timer)
  }, [phase, countdown])

  // 問題が変わったら読み上げ、計測を開始する
  useEffect(() => {
    if (phase !== 'playing' || !current) return
    questionStart.current = performance.now()
    setInput('')
    if (voice) speak(questionYomi(current.a, current.b))
  }, [phase, current, voice])

  // 経過時間の表示。実際の記録は 1 問ごとの合計で出す
  useEffect(() => {
    if (phase !== 'playing') return
    const id = setInterval(() => {
      setElapsed(performance.now() - questionStart.current)
    }, 100)
    return () => clearInterval(id)
  }, [phase, index])

  useEffect(() => () => stopSpeaking(), [])

  /**
   * 「もういちど」。同じ URL への遷移では再マウントされないので、状態を作り直す。
   * 出題は毎回組み直すため、直前に間違えた問題が厚くなった状態で再挑戦できる。
   */
  const restart = useCallback(() => {
    stopSpeaking()
    setQuestions([])
    setIndex(0)
    setInput('')
    setResults([])
    setLastCorrect(null)
    setElapsed(0)
    setFinishedRun(null)
    setCountdown(3)
    setPhase('loading')
  }, [])

  const answeredMs = useMemo(() => results.reduce((sum, r) => sum + r.ms, 0), [results])

  const finish = useCallback(
    async (allResults: FactResult[]) => {
      const run: Run = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        who,
        stage,
        totalMs: allResults.reduce((sum, r) => sum + r.ms, 0),
        correct: allResults.filter((r) => r.correct).length,
        total: allResults.length,
        at: new Date().toISOString(),
        facts: allResults,
      }
      await store.addRun(run)
      setFinishedRun(run)
      setPhase('done')
    },
    [stage, store, who],
  )

  const commit = useCallback(
    (correct: boolean) => {
      if (!current) return
      const ms = performance.now() - questionStart.current
      const result: FactResult = { a: current.a, b: current.b, correct, ms }
      const next = [...results, result]
      setResults(next)
      setLastCorrect(correct)
      setPhase('reveal')

      if (correct) {
        setHit(true)
        setTimeout(() => setHit(false), 240)
      }
      // 間違えたときだけ唱え方を聞かせる。覚えるべき形が必要な場所にだけ出る。
      if (voice && !correct) speak(answerYomi(current.a, current.b), { rate: 1.0 })

      setTimeout(
        () => {
          if (next.length >= QUESTIONS_PER_RUN) {
            void finish(next)
          } else {
            setIndex((i) => i + 1)
            setPhase('playing')
          }
        },
        correct ? CORRECT_HOLD_MS : WRONG_HOLD_MS,
      )
    },
    [current, finish, results, voice],
  )

  const press = useCallback(
    (digit: string) => {
      if (phase !== 'playing' || !current) return
      const nextInput = input + digit
      const verdict = judgeInput(nextInput, current.answer)
      if (verdict === 'correct') {
        setInput(nextInput)
        commit(true)
      } else if (verdict === 'wrong') {
        setInput(nextInput)
        commit(false)
      } else {
        setInput(nextInput)
      }
    },
    [commit, current, input, phase],
  )

  // 物理キーボード（親が自分の記録を作るとき用）
  useEffect(() => {
    if (phase !== 'playing') return
    const onKey = (e: KeyboardEvent) => {
      if (/^[0-9]$/.test(e.key)) press(e.key)
      else if (e.key === 'Backspace') setInput((v) => v.slice(0, -1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, press])

  if (phase === 'done' && finishedRun) {
    return <Result run={finishedRun} onRetry={restart} />
  }

  const name = enemyName(theme, stage, settings.enemyNames)
  const hp = QUESTIONS_PER_RUN - results.filter((r) => r.correct).length
  const hpPercent = (hp / QUESTIONS_PER_RUN) * 100

  if (phase === 'loading' || phase === 'countdown') {
    return (
      <main className="app" style={{ justifyContent: 'center', alignItems: 'center' }}>
        <div className="enemy" style={{ fontSize: 88 }} aria-hidden>
          {enemyEmoji(theme, stage)}
        </div>
        <div style={{ fontSize: 24, fontWeight: 900, marginTop: 10 }}>{name}</div>
        <div style={{ fontSize: 96, fontWeight: 900, marginTop: 20, color: 'var(--accent2)' }}>
          {phase === 'countdown' && countdown > 0 ? countdown : 'GO'}
        </div>
      </main>
    )
  }

  return (
    <main className="app">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          className="subButton"
          style={{ padding: '6px 12px', fontSize: 13, opacity: 0.6 }}
          onClick={() => {
            stopSpeaking()
            router.push('/')
          }}
        >
          やめる
        </button>
        <div style={{ flex: 1 }} />
        <div
          style={{ fontSize: 18, fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}
          aria-label="けいかじかん"
        >
          {formatMs(answeredMs + (phase === 'playing' ? elapsed : 0))}
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <div className="enemy" data-hit={hit} aria-hidden>
          {enemyEmoji(theme, stage)}
        </div>
        <div style={{ marginTop: 10 }} className="hpTrack">
          <div className="hpFill" style={{ width: `${hpPercent}%` }} />
        </div>
        <div
          style={{
            marginTop: 6,
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 12,
            fontWeight: 800,
          }}
        >
          <span>{name}</span>
          <span className="muted">
            {index + 1} / {QUESTIONS_PER_RUN}
          </span>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div className="question">
          {current.a} <span style={{ color: 'var(--accent)' }}>×</span> {current.b}
        </div>
        <div
          className="answerSlot"
          data-state={phase === 'reveal' ? (lastCorrect ? 'correct' : 'wrong') : 'input'}
        >
          {phase === 'reveal' && !lastCorrect ? (
            <span style={{ color: 'var(--accent2)' }}>{current.answer}</span>
          ) : (
            input || <span style={{ opacity: 0.25 }}>?</span>
          )}
        </div>
      </div>

      <div className="keypad" style={{ marginTop: 14 }}>
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button key={d} className="key" onClick={() => press(d)}>
            {d}
          </button>
        ))}
        <button
          className="key"
          style={{ fontSize: 18 }}
          onClick={() => setInput((v) => v.slice(0, -1))}
        >
          けす
        </button>
        <button className="key" onClick={() => press('0')}>
          0
        </button>
        <button
          className="key"
          style={{ fontSize: 26 }}
          aria-label="もういちど きく"
          onClick={() => current && speak(questionYomi(current.a, current.b))}
        >
          🔊
        </button>
      </div>
    </main>
  )
}
