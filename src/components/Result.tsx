'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from './AppProvider'
import RankBadge from './RankBadge'
import { formatMs, unlockedStages } from '@/lib/kuku'
import {
  higherRank,
  nextRankGap,
  rankOf,
  RANK_LABEL,
  RANK_ORDER,
  type Rank,
} from '@/lib/rank'
import { speak } from '@/lib/speech'
import { computeBests, findBest, isBetter, type Best, type Run } from '@/lib/storage'
import { enemyEmoji } from '@/lib/themes'
import { answerYomi } from '@/lib/yomi'

/**
 * 結果画面。
 *
 * 出さないもの: 連続日数、プレイ時間の合計、苦手の強調。
 * 途切れた日に開かなくなる理由を作らないこと、
 * 「自分は苦手だ」と結論づけさせないことを優先する。
 *
 * ランクは出す。達成そのものの尺度であって、達成とは別に配る餌ではない。
 * ただし見せるのは「1 つ上まであと何秒」だけにする。ゴールドまでの距離を
 * 下位の子に見せると、それは苦手の通知になる。
 */
export default function Result({ run, onRetry }: { run: Run; onRetry: () => void }) {
  const router = useRouter()
  const { settings, device, theme, store } = useApp()
  const [previousBest, setPreviousBest] = useState<Best | null | undefined>(undefined)
  const [rivalBest, setRivalBest] = useState<Best | null>(null)
  /** これまでに届いた最高のランク。null なら未到達。undefined は読み込み前 */
  const [previousRank, setPreviousRank] = useState<Rank | null | undefined>(undefined)

  const current: Best = {
    who: run.who,
    stage: run.stage,
    totalMs: run.totalMs,
    correct: run.correct,
    total: run.total,
    at: run.at,
  }

  const unlocked = useMemo(
    () => unlockedStages(settings.stageOrder, settings.unlockedCount),
    [settings.stageOrder, settings.unlockedCount],
  )
  const pace = settings.rankPace ?? 'normal'

  useEffect(() => {
    store.getRuns().then((runs) => {
      // 今回の記録を除いた過去のベストと比べる
      const earlier = runs.filter((r) => r.id !== run.id)
      const bests = computeBests(earlier)
      setPreviousBest(findBest(bests, run.who, run.stage) ?? null)
      const rival = run.who === 'child' ? 'parent' : 'child'
      setRivalBest(findBest(computeBests(runs), rival, run.stage) ?? null)

      /*
       * これまでの最高ランクは、ベスト記録からではなく過去の全ランから採る。
       * ベストの並び順は「正答数 → タイム」なので、ベストでない回の方が
       * ランクだけ高いことがありうる。そこで「はじめての」を誤って出さない。
       * ストーリー中の戦いは時間を競っていないので数えない。
       */
      let best: Rank | null = null
      for (const r of earlier) {
        if (r.who !== run.who || String(r.stage) !== String(run.stage)) continue
        if ((r.mode ?? 'attack') !== 'attack') continue
        const got = rankOf(r, unlocked, pace)
        best = best === null ? got : higherRank(best, got)
      }
      setPreviousRank(best)
    })
  }, [pace, run.id, run.stage, run.who, store, unlocked])

  const rank = rankOf(current, unlocked, pace)
  const gap = nextRankGap(current, unlocked, pace)
  // 初めてそのランクに届いた回だけ言う。毎回言うと言葉が軽くなる
  const rankedUp =
    previousRank !== undefined &&
    (previousRank === null ||
      RANK_ORDER.indexOf(rank) < RANK_ORDER.indexOf(previousRank))

  const isNewBest = previousBest !== undefined && (previousBest === null || isBetter(current, previousBest))
  const beatRival = rivalBest !== null && isBetter(current, rivalBest)
  const rivalName = run.who === 'child' ? settings.parentName : settings.childName
  const perfect = run.correct === run.total
  const remaining = run.total - run.correct

  return (
    <main className="app">
      <div className="rise" style={{ textAlign: 'center', marginTop: 4 }}>
        <div className="enemy" style={{ fontSize: 56, opacity: perfect ? 1 : 0.55 }} aria-hidden>
          {perfect ? '🎁' : enemyEmoji(theme, run.stage)}
        </div>
        <div style={{ fontSize: 17, fontWeight: 900, marginTop: 4 }}>
          {/* 倒しきれなくても否定で終わらせない。残りを事実として出すだけにする */}
          {perfect ? theme.clearLine : `あと ${remaining} で たおせる`}
        </div>
      </div>

      {/* ランクが主役。タイムはその根拠として下に置く */}
      <div
        className="panel rise"
        style={{ marginTop: 12, textAlign: 'center', '--i': 1 } as React.CSSProperties}
      >
        <RankBadge rank={rank} size="big" />
        {rankedUp && (
          <div style={{ marginTop: 8, fontSize: 14, fontWeight: 900, color: 'var(--accent2)' }}>
            はじめての {RANK_LABEL[rank]}
          </div>
        )}

        <div
          style={{
            marginTop: 12,
            fontSize: 52,
            fontWeight: 900,
            fontVariantNumeric: 'tabular-nums',
            lineHeight: 1,
          }}
        >
          {formatMs(run.totalMs)}
        </div>
        <div className="muted" style={{ fontSize: 14, fontWeight: 800, marginTop: 4 }}>
          びょう ・ {run.correct}/{run.total} せいかい
        </div>

        {/*
          もう一回やる理由。1 つ上までの差だけを出す。
          ここが近い数字であることが「もういちど」に手が伸びる条件。
        */}
        {gap && (
          <div
            style={{
              marginTop: 12,
              padding: '9px 12px',
              borderRadius: 999,
              background: 'color-mix(in srgb, var(--accent2) 15%, transparent)',
              border: '1px solid color-mix(in srgb, var(--accent2) 35%, transparent)',
              fontSize: 14,
              fontWeight: 800,
            }}
          >
            {RANK_LABEL[gap.rank]}まで あと{' '}
            <span style={{ color: 'var(--accent2)', fontSize: 21, fontWeight: 900 }}>
              {formatMs(gap.ms)}
            </span>{' '}
            びょう
          </div>
        )}

        {isNewBest && !rankedUp && (
          <div style={{ marginTop: 10, fontSize: 16, fontWeight: 900, color: 'var(--accent2)' }}>
            ✨ じこベスト こうしん
          </div>
        )}
        {beatRival && (
          <div style={{ marginTop: 6, fontSize: 16, fontWeight: 900, color: 'var(--accent)' }}>
            🏆 {rivalName}を こえた
          </div>
        )}
      </div>

      <div
        className="rise"
        style={{ marginTop: 12, flex: 1, overflowY: 'auto', '--i': 2 } as React.CSSProperties}
      >
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

      <div className="rowGap" style={{ marginTop: 12 }}>
        <button
          className="bigButton"
          style={{ fontSize: 22, padding: '17px 12px' }}
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
