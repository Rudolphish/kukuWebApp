'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from '@/components/AppProvider'
import RecordBoard from '@/components/RecordBoard'
import { unlockedStages } from '@/lib/kuku'
import { primeSpeech, speak } from '@/lib/speech'
import { computeBests, type Best, type StageKey } from '@/lib/storage'
import { enemyEmoji, enemyName } from '@/lib/themes'

export default function Home() {
  const router = useRouter()
  const { settings, theme, ready, store } = useApp()
  const [bests, setBests] = useState<Best[]>([])
  const [stage, setStage] = useState<StageKey | null>(null)

  const unlocked = useMemo(
    () => unlockedStages(settings.stageOrder, settings.unlockedCount),
    [settings.stageOrder, settings.unlockedCount],
  )

  useEffect(() => {
    if (!ready) return
    store.getRuns().then((runs) => setBests(computeBests(runs)))
  }, [ready, store])

  // 直近に解放された段を既定の選択にする。子どもが毎回選び直さなくていい。
  useEffect(() => {
    if (!ready || stage !== null) return
    setStage(unlocked[unlocked.length - 1] ?? 1)
  }, [ready, stage, unlocked])

  const selected: StageKey = stage ?? unlocked[0] ?? 1
  const mixAvailable = unlocked.length >= 2
  // 未解放の段を全部並べると「はじめる」が画面の外に出るうえ、鍵ばかりの画面になる。
  // 次の 1 段だけ見せて、進度は分かるが圧はかからない形にする。
  const nextLocked = settings.stageOrder[unlocked.length]

  function start() {
    primeSpeech()
    speak(theme.startLine, { rate: 1.2 })
    router.push(`/play?stage=${selected}`)
  }

  return (
    <main className="app">
      <div className="title">九九バトル</div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 14, marginTop: 18 }}>
        <div className="panel" style={{ textAlign: 'center', paddingBlock: 20 }}>
          <div className="enemy" aria-hidden>
            {enemyEmoji(theme, selected)}
          </div>
          <div style={{ marginTop: 8, fontSize: 22, fontWeight: 900 }}>
            {enemyName(theme, selected, settings.enemyNames)}
          </div>
        </div>

        <div>
          <div className="label" style={{ marginBottom: 8 }}>
            あいて
          </div>
          <div className="stagePicker">
            {unlocked.map((s) => (
              <button
                key={s}
                className="stageCard"
                data-selected={selected === s}
                onClick={() => setStage(s)}
              >
                <span aria-hidden style={{ fontSize: 20 }}>
                  {enemyEmoji(theme, s)}
                </span>
                <span className="stageNum">{s}</span>
              </button>
            ))}
            {mixAvailable && (
              <button
                className="stageCard"
                data-selected={selected === 'mix'}
                onClick={() => setStage('mix')}
              >
                <span aria-hidden style={{ fontSize: 20 }}>
                  {enemyEmoji(theme, 'mix')}
                </span>
                <span className="stageSub">ぜんぶ</span>
              </button>
            )}
            {nextLocked !== undefined && (
              <div className="stageCard" data-locked="true" aria-label="つぎの あいて">
                <span aria-hidden style={{ fontSize: 20 }}>
                  🔒
                </span>
                <span className="stageNum">{nextLocked}</span>
              </div>
            )}
          </div>
        </div>

        <RecordBoard bests={bests} stage={selected} settings={settings} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}>
        <button className="bigButton" onClick={start}>
          はじめる
        </button>
        {/* 親向けの入口。子どもの動線からは外して小さく置く */}
        <button
          className="subButton"
          style={{ alignSelf: 'center', opacity: 0.55, fontSize: 13, padding: '8px 14px' }}
          onClick={() => router.push('/parent')}
        >
          おうちのひと
        </button>
      </div>
    </main>
  )
}
