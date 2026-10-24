'use client'

import RankBadge from './RankBadge'
import { formatMs } from '@/lib/kuku'
import { rankOf } from '@/lib/rank'
import { findBest, type Best, type SharedSettings, type StageKey } from '@/lib/storage'

/**
 * 親の記録が常に見えている状態を作るための表示。
 *
 * 子ども専用端末なので親が隣にいる前提は置けない。
 * 代わりに、親の記録がいつでもそこにある状態に一人で挑む形にする。
 * 親は手加減しない。九九であれば親は本気で速く、勝つには本当に覚えるしかない。
 */
export default function RecordBoard({
  bests,
  stage,
  settings,
  unlocked,
}: {
  bests: Best[]
  stage: StageKey
  settings: SharedSettings
  unlocked: number[]
}) {
  const parent = findBest(bests, 'parent', stage)
  const child = findBest(bests, 'child', stage)
  const pace = settings.rankPace ?? 'normal'

  const beaten =
    parent && child && (child.correct > parent.correct ||
      (child.correct === parent.correct && child.totalMs < parent.totalMs))

  const gapSec =
    parent && child && !beaten && child.correct === parent.correct
      ? (child.totalMs - parent.totalMs) / 1000
      : null

  return (
    <div className="panel">
      <div className="label" style={{ marginBottom: 10 }}>
        きろく
      </div>

      <Row
        name={settings.parentName}
        best={parent}
        empty="まだ きろく なし"
        highlight={!beaten}
        unlocked={unlocked}
        pace={pace}
      />
      <Row
        name={settings.childName}
        best={child}
        empty="はじめての ちょうせん"
        highlight={!!beaten}
        unlocked={unlocked}
        pace={pace}
      />

      {beaten && (
        <div
          style={{
            marginTop: 12,
            padding: '10px 12px',
            borderRadius: 12,
            background: 'color-mix(in srgb, var(--accent2) 20%, transparent)',
            border: '1px solid color-mix(in srgb, var(--accent2) 40%, transparent)',
            fontSize: 15,
            fontWeight: 800,
            textAlign: 'center',
          }}
        >
          🏆 {settings.parentName}を こえている
        </div>
      )}

      {gapSec !== null && gapSec > 0 && (
        <div style={{ marginTop: 10, fontSize: 14, fontWeight: 800, textAlign: 'center' }}>
          あと <span style={{ color: 'var(--accent2)', fontSize: 20 }}>{gapSec.toFixed(1)}</span> びょう
        </div>
      )}
    </div>
  )
}

function Row({
  name,
  best,
  empty,
  highlight,
  unlocked,
  pace,
}: {
  name: string
  best: Best | undefined
  empty: string
  highlight: boolean
  unlocked: number[]
  pace: SharedSettings['rankPace']
}) {
  /*
   * 寸法はインラインではなく CSS 側に置く。
   * インラインだと画面の高さに応じた圧縮（@media max-height）が効かず、
   * 縦の短い端末で自分の記録が画面の外に出る。
   */
  return (
    <div className="recordRow" style={{ opacity: best ? 1 : 0.5 }}>
      <span className="recordWho">
        <span className="recordName">{name}</span>
        {best && <RankBadge rank={rankOf(best, unlocked, pace)} />}
      </span>
      {best ? (
        <span className="recordScore">
          <span className="recordTime" data-lead={highlight}>
            {formatMs(best.totalMs)}
          </span>
          <span className="muted recordOf">
            {best.correct}/{best.total}
          </span>
        </span>
      ) : (
        <span className="muted recordOf">{empty}</span>
      )}
    </div>
  )
}
