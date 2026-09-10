'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from './AppProvider'
import { formatMs } from '@/lib/kuku'
import { speak } from '@/lib/speech'
import { computeBests, findBest, isBetter, type Best, type Run } from '@/lib/storage'
import { enemyEmoji, enemyName } from '@/lib/themes'
import { answerYomi } from '@/lib/yomi'

/**
 * 結果画面。
 *
 * 出さないもの: 連続日数、プレイ時間の合計、苦手の強調。
 * 途切れた日に開かなくなる理由を作らないこと、
 * 「自分は苦手だ」と結論づけさせないことを優先する。
 */
export default function Result({ run, onRetry }: { run: Run; onRetry: () => void }) {
  const router = useRouter()
  const { settings, device, theme, store } = useApp()
  const [previousBest, setPreviousBest] = useState<Best | null | undefined>(undefined)
  const [rivalBest, setRivalBest] = useState<Best | null>(null)

  const current: Best = {
    who: run.who,
    stage: run.stage,
    totalMs: run.totalMs,
    correct: run.correct,
    total: run.total,
    at: run.at,
  }

  useEffect(() => {
    store.getRuns().then((runs) => {
      // 今回の記録を除いた過去のベストと比べる
      const bests = computeBests(runs.filter((r) => r.id !== run.id))
      setPreviousBest(findBest(bests, run.who, run.stage) ?? null)
      const rival = run.who === 'child' ? 'parent' : 'child'
      setRivalBest(findBest(computeBests(runs), rival, run.stage) ?? null)
    })
  }, [run.id, run.stage, run.who, store])

  const isNewBest = previousBest !== undefined && (previousBest === null || isBetter(current, previousBest))
  const beatRival = rivalBest !== null && isBetter(current, rivalBest)
  const rivalName = run.who === 'child' ? settings.parentName : settings.childName
  const perfect = run.correct === run.total
  const remaining = run.total - run.correct

  return (
    <main className="app">
      <div style={{ textAlign: 'center', marginTop: 8 }}>
        <div className="enemy" aria-hidden style={{ fontSize: 64, opacity: perfect ? 1 : 0.55 }}>
          {perfect ? '🎁' : enemyEmoji(theme, run.stage)}
        </div>
        <div style={{ fontSize: 18, fontWeight: 900, marginTop: 6 }}>
          {/* 倒しきれなくても否定で終わらせない。残りを事実として出すだけにする */}
          {perfect ? theme.clearLine : `あと ${remaining} で たおせる`}
        </div>
      </div>

      <div className="panel" style={{ marginTop: 14, textAlign: 'center' }}>
        <div style={{ fontSize: 60, fontWeight: 900, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
          {formatMs(run.totalMs)}
        </div>
        <div className="muted" style={{ fontSize: 14, fontWeight: 800, marginTop: 4 }}>
          びょう ・ {run.correct}/{run.total} せいかい
        </div>
        {isNewBest && (
          <div style={{ marginTop: 10, fontSize: 17, fontWeight: 900, color: 'var(--accent2)' }}>
            ✨ じこベスト こうしん
          </div>
        )}
        {beatRival && (
          <div style={{ marginTop: 6, fontSize: 17, fontWeight: 900, color: 'var(--accent)' }}>
            🏆 {rivalName}を こえた
          </div>
        )}
      </div>

      <div style={{ marginTop: 14, flex: 1, overflowY: 'auto' }}>
        <div className="label" style={{ marginBottom: 8 }}>
          タップで きける
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
          {run.facts.map((fact, i) => (
            <button
              key={`${fact.a}x${fact.b}-${i}`}
              className="panel"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 12px',
                // 間違えた問題も色で責めない。情報として並べるだけにする
                borderColor: fact.correct ? 'var(--accent)' : 'var(--line)',
              }}
              onClick={() => device.voice && speak(answerYomi(fact.a, fact.b), { rate: 1.0 })}
            >
              <span style={{ fontSize: 17, fontWeight: 900, fontVariantNumeric: 'tabular-nums' }}>
                {fact.a} × {fact.b}
              </span>
              <span style={{ fontSize: 17, fontWeight: 900, color: 'var(--accent2)' }}>
                {fact.a * fact.b}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="rowGap" style={{ marginTop: 14 }}>
        <button
          className="bigButton"
          style={{ fontSize: 22, padding: '18px 12px' }}
          onClick={onRetry}
        >
          もういちど
        </button>
        <button
          className="subButton"
          style={{ flexShrink: 0, paddingInline: 20 }}
          onClick={() => router.push('/')}
        >
          もどる
        </button>
      </div>
    </main>
  )
}
