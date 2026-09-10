'use client'

import { formatMs } from '@/lib/kuku'
import { findBest, type Best, type Settings, type StageKey } from '@/lib/storage'

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
}: {
  bests: Best[]
  stage: StageKey
  settings: Settings
}) {
  const parent = findBest(bests, 'parent', stage)
  const child = findBest(bests, 'child', stage)

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
      />
      <div style={{ height: 8 }} />
      <Row name={settings.childName} best={child} empty="はじめての ちょうせん" highlight={!!beaten} />

      {beaten && (
        <div
          style={{
            marginTop: 12,
            padding: '10px 12px',
            borderRadius: 12,
            background: 'color-mix(in srgb, var(--accent2) 20%, transparent)',
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
}: {
  name: string
  best: Best | undefined
  empty: string
  highlight: boolean
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: 10,
        opacity: best ? 1 : 0.5,
      }}
    >
      <span style={{ fontSize: 16, fontWeight: 800 }}>{name}</span>
      {best ? (
        <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span
            style={{
              fontSize: 28,
              fontWeight: 900,
              fontVariantNumeric: 'tabular-nums',
              color: highlight ? 'var(--accent)' : 'var(--text)',
            }}
          >
            {formatMs(best.totalMs)}
          </span>
          <span className="muted" style={{ fontSize: 13, fontWeight: 700 }}>
            {best.correct}/{best.total}
          </span>
        </span>
      ) : (
        <span className="muted" style={{ fontSize: 13, fontWeight: 700 }}>
          {empty}
        </span>
      )}
    </div>
  )
}
