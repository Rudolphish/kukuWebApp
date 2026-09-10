'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from '@/components/AppProvider'
import ParentGate from '@/components/ParentGate'
import StageInsights from '@/components/StageInsights'
import { QUESTIONS_PER_RUN, formatMs, unlockedStages } from '@/lib/kuku'
import { computeBests, computeFactStats, findBest, type Run } from '@/lib/storage'
import { THEMES, enemyName } from '@/lib/themes'

export default function ParentPage() {
  const router = useRouter()
  const { settings, theme, ready, store, updateSettings } = useApp()
  const [unlocked, setUnlocked] = useState(false)
  const [runs, setRuns] = useState<Run[]>([])

  useEffect(() => {
    if (!ready || !unlocked) return
    store.getRuns().then(setRuns)
  }, [ready, unlocked, store])

  const bests = useMemo(() => computeBests(runs), [runs])
  const childStats = useMemo(() => computeFactStats(runs, 'child'), [runs])
  const openStages = unlockedStages(settings.stageOrder, settings.unlockedCount)

  if (!unlocked) return <ParentGate onPass={() => setUnlocked(true)} onCancel={() => router.push('/')} />

  const nextStage = settings.stageOrder[settings.unlockedCount]

  return (
    <main className="app" style={{ gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <button className="subButton" style={{ padding: '6px 12px', fontSize: 13 }} onClick={() => router.push('/')}>
          もどる
        </button>
        <div style={{ flex: 1 }} />
        <span className="label">おうちのひと</span>
      </div>

      {/* --- 段の解放 --- */}
      <section className="panel">
        <div className="label">段の解放</div>
        <p style={{ fontSize: 13, lineHeight: 1.6, margin: '8px 0 12px' }} className="muted">
          学校で今どこをやっているかに合わせてください。未習の段を出すと「わからない」だけが残ります。
          解放は 1 段ずつです。
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {settings.stageOrder.map((stage, i) => {
            const open = i < settings.unlockedCount
            return (
              <div
                key={stage}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 10px',
                  borderRadius: 10,
                  background: open ? 'color-mix(in srgb, var(--accent) 14%, transparent)' : 'transparent',
                  border: '1px solid var(--line)',
                  opacity: open ? 1 : 0.55,
                }}
              >
                <span style={{ fontSize: 18, fontWeight: 900, width: 26 }}>{stage}</span>
                <span style={{ fontSize: 13, fontWeight: 700, flex: 1 }}>
                  {open ? '解放ずみ' : '未解放'}
                </span>
                <button
                  className="subButton"
                  style={{ padding: '4px 10px', fontSize: 16 }}
                  disabled={i === 0}
                  onClick={() => void updateSettings({ stageOrder: move(settings.stageOrder, i, -1) })}
                >
                  ↑
                </button>
                <button
                  className="subButton"
                  style={{ padding: '4px 10px', fontSize: 16 }}
                  disabled={i === settings.stageOrder.length - 1}
                  onClick={() => void updateSettings({ stageOrder: move(settings.stageOrder, i, 1) })}
                >
                  ↓
                </button>
              </div>
            )
          })}
        </div>

        <div className="rowGap" style={{ marginTop: 12 }}>
          <button
            className="subButton"
            style={{ flex: 1 }}
            disabled={settings.unlockedCount <= 1}
            onClick={() => void updateSettings({ unlockedCount: settings.unlockedCount - 1 })}
          >
            1 段もどす
          </button>
          <button
            className="subButton"
            style={{ flex: 1, borderColor: 'var(--accent)' }}
            disabled={settings.unlockedCount >= settings.stageOrder.length}
            onClick={() => void updateSettings({ unlockedCount: settings.unlockedCount + 1 })}
          >
            {nextStage ? `${nextStage} の段をひらく` : 'すべて解放ずみ'}
          </button>
        </div>
      </section>

      {/* --- 親の記録 --- */}
      <section className="panel">
        <div className="label">親の記録をつくる</div>
        <p style={{ fontSize: 13, lineHeight: 1.6, margin: '8px 0 12px' }} className="muted">
          手加減しないでください。手加減した瞬間に見抜かれます。親もミスをするので「勝てた」は実際に起きます。
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[...openStages, ...(openStages.length >= 2 ? (['mix'] as const) : [])].map((stage) => {
            const parentBest = findBest(bests, 'parent', stage)
            const childBest = findBest(bests, 'child', stage)
            return (
              <div key={String(stage)} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ width: 44, fontSize: 15, fontWeight: 900 }}>
                  {stage === 'mix' ? 'ぜんぶ' : `${stage}の段`}
                </span>
                <span style={{ flex: 1, fontSize: 13 }} className="muted">
                  親 {parentBest ? `${formatMs(parentBest.totalMs)} (${parentBest.correct}/${parentBest.total})` : '—'}
                  {' / '}
                  子 {childBest ? `${formatMs(childBest.totalMs)} (${childBest.correct}/${childBest.total})` : '—'}
                </span>
                <button
                  className="subButton"
                  style={{ padding: '6px 12px', fontSize: 13 }}
                  onClick={() => router.push(`/play?stage=${stage}&who=parent`)}
                >
                  挑戦
                </button>
              </div>
            )
          })}
        </div>
      </section>

      {/* --- 子どもの状態 --- */}
      <StageInsights stats={childStats} openStages={openStages} runs={runs} />

      {/* --- 着せ替え --- */}
      <section className="panel">
        <div className="label">見た目と名前</div>

        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>テーマ</div>
          <div className="rowGap" style={{ flexWrap: 'wrap' }}>
            {THEMES.map((t) => (
              <button
                key={t.id}
                className="subButton"
                style={{ borderColor: t.id === settings.themeId ? 'var(--accent)' : 'var(--line)' }}
                onClick={() => void updateSettings({ themeId: t.id })}
              >
                {t.name}
              </button>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>敵の名前</div>
          <p className="muted" style={{ fontSize: 12, lineHeight: 1.6, margin: '0 0 8px' }}>
            子どもに決めてもらってください。ここで入れた名前はその場で反映されます。
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[...openStages, 'mix' as const].map((stage) => (
              <div key={String(stage)} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 44, fontSize: 13, fontWeight: 800 }}>
                  {stage === 'mix' ? 'ぜんぶ' : `${stage}の段`}
                </span>
                <input
                  value={settings.enemyNames[String(stage)] ?? ''}
                  placeholder={enemyName(theme, stage)}
                  onChange={(e) =>
                    void updateSettings({
                      enemyNames: { ...settings.enemyNames, [String(stage)]: e.target.value },
                    })
                  }
                  style={inputStyle}
                />
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <LabeledInput
            label="子どもの呼び名"
            value={settings.childName}
            onChange={(v) => void updateSettings({ childName: v })}
          />
          <LabeledInput
            label="親の呼び名"
            value={settings.parentName}
            onChange={(v) => void updateSettings({ parentName: v })}
          />
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 14, fontSize: 14, fontWeight: 700 }}>
          <input
            type="checkbox"
            checked={settings.voice}
            onChange={(e) => void updateSettings({ voice: e.target.checked })}
            style={{ width: 22, height: 22 }}
          />
          音声で読み上げる
        </label>
      </section>

      <section className="panel">
        <div className="label">記録の消去</div>
        <button
          className="subButton"
          style={{ marginTop: 10, width: '100%', borderColor: 'var(--danger)', color: 'var(--danger)' }}
          onClick={() => {
            if (!confirm('すべての記録を消します。よろしいですか？')) return
            void store.reset().then(() => setRuns([]))
          }}
        >
          すべての記録を消す
        </button>
      </section>

      <p className="muted" style={{ fontSize: 11, lineHeight: 1.7, textAlign: 'center' }}>
        1 回 {QUESTIONS_PER_RUN} 問。連続日数やプレイ時間は意図的に記録・表示していません。
      </p>
    </main>
  )
}

const inputStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
  padding: '8px 10px',
  borderRadius: 10,
  border: '1px solid var(--line)',
  background: 'var(--bg)',
  fontSize: 14,
}

function LabeledInput({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ width: 96, fontSize: 13, fontWeight: 800 }}>{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle} />
    </div>
  )
}

function move(order: number[], index: number, delta: number): number[] {
  const next = [...order]
  const target = index + delta
  if (target < 0 || target >= next.length) return next
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}
