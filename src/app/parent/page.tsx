'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from '@/components/AppProvider'
import ParentGate from '@/components/ParentGate'
import StageInsights from '@/components/StageInsights'
import { QUESTIONS_PER_RUN, formatMs, unlockedStages } from '@/lib/kuku'
import { PACE_LABEL, formatTargetSec, rankThresholds } from '@/lib/rank'
import { deleteStory, storyProblems, type StoryOrder } from '@/lib/storage/stories'
import { computeBests, computeFactStats, findBest, type RankPace, type Run } from '@/lib/storage'
import { THEMES, enemyName } from '@/lib/themes'
import { supabaseConfigured } from '@/lib/storage'

export default function ParentPage() {
  const router = useRouter()
  const {
    settings,
    device,
    theme,
    ready,
    store,
    lastSync,
    stories,
    setStories,
    refreshStories,
    updateSettings,
    updateDevice,
    syncNow,
  } = useApp()
  const [unlocked, setUnlocked] = useState(false)
  const [runs, setRuns] = useState<Run[]>([])

  useEffect(() => {
    if (!ready) return
    if (device.role !== 'parent' && !unlocked) return
    store.getRuns().then(setRuns)
  }, [ready, unlocked, store, device.role, lastSync])

  const bests = useMemo(() => computeBests(runs), [runs])
  const childStats = useMemo(() => computeFactStats(runs, 'child'), [runs])
  const openStages = unlockedStages(settings.stageOrder, settings.unlockedCount)

  // 親自身の端末では入口を隠す意味がない。子ども専用端末のときだけ計算を出す。
  const needsGate = device.role !== 'parent'
  if (needsGate && !unlocked) {
    return <ParentGate onPass={() => setUnlocked(true)} onCancel={() => router.push('/')} />
  }

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

      {/* --- 子どもが注文した話 --- */}
      <section className="panel">
        <div className="label">子どもがつくった おはなし</div>
        <p style={{ fontSize: 13, lineHeight: 1.6, margin: '8px 0 12px' }} className="muted">
          子どもが注文した話は、生成と機械的な検査（漢字・文字数・こわい表現の禁止）を通ってから
          すぐ遊べる状態になります。承認は挟んでいません。合わないものはここから消してください。
          判断の根拠は docs/story-authoring-design.md。
        </p>

        {stories.length === 0 && (
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            まだありません。子どもの画面の「ぼうけん」→「おはなしを つくる」から注文します。
          </p>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {stories.map((o) => (
            <StoryRow
              key={o.id}
              order={o}
              onDelete={async () => {
                if (!window.confirm(`「${o.seed.who}」の おはなしを消しますか？`)) return
                const ok = await deleteStory(o.id, stories)
                if (ok) setStories(stories.filter((s) => s.id !== o.id))
                else window.alert('消せませんでした。通信を確かめてください。')
              }}
            />
          ))}
        </div>

        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>作る時刻</div>
          <p style={{ fontSize: 12, lineHeight: 1.6, margin: '0 0 8px' }} className="muted">
            スケジュールタスクを仕掛けた時刻に合わせてください。
            子どもの画面に「つぎに できるのは ◯じごろ」と出すためだけに使います。
            ここを変えてもタスク自体の時刻は変わりません。
          </p>
          <input
            className="seedInput"
            style={{ marginTop: 0 }}
            value={(settings.storyBuildHours ?? []).join(', ')}
            inputMode="numeric"
            placeholder="7, 12, 18"
            onChange={(e) =>
              void updateSettings({
                storyBuildHours: e.target.value
                  .split(',')
                  .map((v) => Number(v.trim()))
                  .filter((v) => Number.isInteger(v) && v >= 0 && v <= 23),
              })
            }
          />
        </div>

        {stories.length > 0 && (
          <button
            className="subButton"
            style={{ marginTop: 12, fontSize: 13, padding: '8px 14px' }}
            onClick={() => void refreshStories()}
          >
            読み直す
          </button>
        )}
      </section>

      {/* --- ランク --- */}
      <section className="panel">
        <div className="label">ランクの きびしさ</div>
        <p style={{ fontSize: 13, lineHeight: 1.6, margin: '8px 0 12px' }} className="muted">
          タイムでゴールド・シルバー・ブロンズが付きます。目標は段ごとに変えてあります
          （1 の段と 7 の段を同じ秒数で測ると、1 の段は必ずゴールド、7 の段は一生ゴールドなしになるため）。
          実際の速さに合っていなければ、ここで全体をずらしてください。
        </p>

        <div className="segment">
          {(['fast', 'normal', 'slow'] as RankPace[]).map((p) => (
            <button
              key={p}
              className="segmentItem"
              data-active={(settings.rankPace ?? 'normal') === p}
              onClick={() => updateSettings({ rankPace: p })}
            >
              {PACE_LABEL[p]}
            </button>
          ))}
        </div>

        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 5 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr repeat(3, 56px)',
              fontSize: 11,
              fontWeight: 800,
            }}
            className="muted"
          >
            <span>段</span>
            <span style={{ textAlign: 'right' }}>🥇</span>
            <span style={{ textAlign: 'right' }}>🥈</span>
            <span style={{ textAlign: 'right' }}>🥉</span>
          </div>
          {openStages.map((stage) => {
            const t = rankThresholds(stage, openStages, settings.rankPace ?? 'normal')
            return (
              <div
                key={stage}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr repeat(3, 56px)',
                  fontSize: 13,
                  fontWeight: 800,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                <span>{stage} の段</span>
                <span style={{ textAlign: 'right' }}>{formatTargetSec(t.gold)}</span>
                <span style={{ textAlign: 'right' }} className="muted">
                  {formatTargetSec(t.silver)}
                </span>
                <span style={{ textAlign: 'right' }} className="muted">
                  {formatTargetSec(t.bronze)}
                </span>
              </div>
            )
          })}
        </div>

        <p style={{ fontSize: 12, lineHeight: 1.6, margin: '12px 0 0' }} className="muted">
          10 問終えれば必ずランクは付きます（最低は「クリア」）。付かないランクは作っていません。
          ゴールドは全問正解のときだけ届きます。速いだけで取れると、覚えずに連打した方が速くなるためです。
        </p>
      </section>

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
            checked={device.voice}
            onChange={() => updateDevice({ voice: !device.voice })}
            style={{ width: 22, height: 22 }}
          />
          音声で読み上げる
        </label>
      </section>

      {/* --- べつの端末とつなぐ --- */}
      <section className="panel">
        <div className="label">べつの端末とつなぐ</div>
        <p style={{ fontSize: 13, lineHeight: 1.6, margin: '8px 0 12px' }} className="muted">
          親が自分の端末を使う場合に設定します。親子それぞれの端末で同じ合言葉を入れると、
          記録と段の解放が共有されます。
        </p>

        {!supabaseConfigured ? (
          <p style={{ fontSize: 13, lineHeight: 1.7, margin: 0 }} className="muted">
            いまはこの端末の中だけで動いています。共有するには Supabase の設定（.env.local と
            supabase/schema.sql）が必要です。設定しなくても、この端末だけで最後まで遊べます。
          </p>
        ) : (
          <>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>この端末は</div>
              <div className="rowGap">
                {(['child', 'parent'] as const).map((role) => (
                  <button
                    key={role}
                    className="subButton"
                    style={{
                      flex: 1,
                      borderColor: device.role === role ? 'var(--accent)' : 'var(--line)',
                    }}
                    onClick={() => updateDevice({ role })}
                  >
                    {role === 'child' ? '子どもの端末' : 'おうちのひとの端末'}
                  </button>
                ))}
              </div>
              <p className="muted" style={{ fontSize: 12, lineHeight: 1.6, margin: '8px 0 0' }}>
                この端末で作った記録が、どちらのものとして残るかが決まります。
              </p>
            </div>

            <LabeledInput
              label="家族の合言葉"
              value={device.familyCode}
              onChange={(v) => updateDevice({ familyCode: v })}
            />
            <p className="muted" style={{ fontSize: 12, lineHeight: 1.6, margin: '8px 0 12px' }}>
              推測されにくい長い文字列にしてください。これを知っている端末だけが記録を読み書きできます。
            </p>

            <div className="rowGap" style={{ alignItems: 'center' }}>
              <button className="subButton" style={{ flex: 1 }} onClick={() => void syncNow()}>
                いま同期する
              </button>
              <span className="muted" style={{ fontSize: 12, fontWeight: 700 }}>
                {syncLabel(lastSync)}
              </span>
            </div>
          </>
        )}
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

/** 注文 1 件ぶんの行。状態と、失敗したときの理由を出す。 */
function StoryRow({ order, onDelete }: { order: StoryOrder; onDelete: () => void }) {
  // 公開されていても検査に通らなければ遊べない。実態どおりに出す
  const problems = storyProblems(order)
  const state =
    order.status === 'ordered' ? 'ordered' : problems.length === 0 ? 'ready' : 'broken'
  const label = state === 'ready' ? '遊べる' : state === 'ordered' ? '作成中' : '遊べない'
  const color =
    state === 'ready'
      ? 'var(--accent)'
      : state === 'ordered'
        ? 'var(--accent2)'
        : 'var(--danger)'

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: '10px 12px',
        border: '1px solid var(--line)',
        background: 'color-mix(in srgb, var(--bg) 40%, var(--panel))',
      }}
    >
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontSize: 14, fontWeight: 800 }}>
          {order.area?.name ?? `「${order.seed.who}」の おはなし`}
        </span>
        <span className="muted" style={{ fontSize: 12, fontWeight: 700 }}>
          {order.stage} の段 ・ {order.seed.place} ・ {order.seed.mood} ・{' '}
          {order.orderedAt.slice(0, 10)}
        </span>
        {problems.length > 0 && (
          <span style={{ fontSize: 11, color: 'var(--danger)', lineHeight: 1.5 }}>
            {problems.join(' / ')}
          </span>
        )}
      </span>
      <span style={{ fontSize: 11, fontWeight: 900, color, flexShrink: 0 }}>{label}</span>
      <button
        className="subButton"
        style={{ padding: '5px 10px', fontSize: 12, flexShrink: 0 }}
        onClick={onDelete}
      >
        消す
      </button>
    </div>
  )
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

function syncLabel(outcome: ReturnType<typeof useApp>['lastSync']): string {
  if (!outcome) return '未同期'
  if (outcome.ok) return `同期ずみ（${outcome.runs} 件）`
  if (outcome.reason === 'no-family-code') return '合言葉が未設定'
  if (outcome.reason === 'not-configured') return 'この端末のみ'
  return '同期に失敗'
}

function move(order: number[], index: number, delta: number): number[] {
  const next = [...order]
  const target = index + delta
  if (target < 0 || target >= next.length) return next
  ;[next[index], next[target]] = [next[target], next[index]]
  return next
}
