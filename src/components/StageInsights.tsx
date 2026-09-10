'use client'

import { factKey, type FactStats, type Run, type StageKey } from '@/lib/storage'

/**
 * 親だけが見る、子どもの状態。
 *
 * どの段が遅いかは親には見えるが、子どもの画面には出さない。
 * 小 2 が一度「自分は苦手だ」と結論づけると、そこから戻すのは難しい。
 */
export default function StageInsights({
  stats,
  openStages,
  runs,
}: {
  stats: FactStats
  openStages: number[]
  runs: Run[]
}) {
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
  const opensThisWeek = runs.filter((r) => r.who === 'child' && Date.parse(r.at) >= weekAgo).length

  const perStage = openStages.map((stage) => {
    const entries = Array.from({ length: 9 }, (_, i) => stats[factKey(stage, i + 1)]).filter(Boolean)
    const attempts = entries.reduce((sum, s) => sum + s!.attempts, 0)
    const wrong = entries.reduce((sum, s) => sum + s!.wrong, 0)
    const timed = entries.filter((s) => s!.avgMs > 0)
    const avgMs = timed.length ? timed.reduce((sum, s) => sum + s!.avgMs, 0) / timed.length : 0
    return { stage, attempts, wrong, avgMs }
  })

  const slowest = [...perStage].filter((s) => s.attempts > 0).sort((x, y) => y.avgMs - x.avgMs)[0]

  return (
    <section className="panel">
      <div className="label">子どもの状態</div>

      <div style={{ marginTop: 10, display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 32, fontWeight: 900 }}>{opensThisWeek}</span>
        <span style={{ fontSize: 13, fontWeight: 700 }} className="muted">
          回 / この 7 日で開いた回数
        </span>
      </div>
      <p className="muted" style={{ fontSize: 12, lineHeight: 1.6, margin: '6px 0 0' }}>
        言わずに開いたかどうかが最初に見る指標です。増やそうとしないでください。
      </p>

      {perStage.some((s) => s.attempts > 0) && (
        <>
          <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {perStage.map((s) => (
              <div key={s.stage} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 44, fontSize: 13, fontWeight: 800 }}>{s.stage}の段</span>
                <span style={{ flex: 1, fontSize: 12 }} className="muted">
                  {s.attempts > 0
                    ? `平均 ${(s.avgMs / 1000).toFixed(1)}秒 ・ 誤答 ${s.wrong}/${s.attempts}`
                    : 'まだデータなし'}
                </span>
              </div>
            ))}
          </div>

          {slowest && slowest.avgMs > 0 && (
            <p style={{ fontSize: 12, lineHeight: 1.7, marginTop: 12 }} className="muted">
              いま最も時間がかかっているのは <strong>{slowest.stage} の段</strong>です。
              新しい段を開ける前に、ここが落ち着いているか見てください。
            </p>
          )}

          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>問題ごとの状態</div>
            <div className="grid9">
              {openStages.flatMap((stage) =>
                Array.from({ length: 9 }, (_, i) => {
                  const s = stats[factKey(stage, i + 1)]
                  return (
                    <div
                      key={`${stage}-${i}`}
                      className="cell"
                      style={{ background: cellColor(s) }}
                      title={`${stage} × ${i + 1}`}
                    >
                      {i + 1}
                    </div>
                  )
                }),
              )}
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: 11 }} className="muted">
              <span>濃い = 誤答が多い / 時間がかかる</span>
            </div>
          </div>
        </>
      )}
    </section>
  )
}

function cellColor(stat: FactStats[string] | undefined): string {
  if (!stat || stat.attempts === 0) return 'color-mix(in srgb, var(--line) 40%, transparent)'
  const wrongRate = stat.wrong / stat.attempts
  const slowness = stat.avgMs > 0 ? Math.min(1, stat.avgMs / 6000) : 0
  const heat = Math.min(1, wrongRate * 0.7 + slowness * 0.5)
  return `color-mix(in srgb, var(--danger) ${Math.round(heat * 85)}%, color-mix(in srgb, var(--accent) 30%, transparent))`
}
