'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from './AppProvider'
import StoryBattle from './StoryBattle'
import { RECENT_MEMORY, RUNS_TO_CLEAR, buildWalk, getStory, townLine, type WalkStep } from '@/lib/stories'
import { primeSpeech, speak, stopSpeaking } from '@/lib/speech'
import { getStoryProgress, saveStoryProgress } from '@/lib/storage'
import type { StoryProgress } from '@/lib/storage'

type Phase = 'town' | 'fork' | 'scene' | 'encounter' | 'greeting' | 'cue' | 'battle' | 'outro'

/** 文字送りの速さ。読める子は目で追い、読めない子は耳だけで進む。 */
const TYPE_MS = 45

export default function StoryScreen({ areaId }: { areaId: string }) {
  const router = useRouter()
  const { device } = useApp()
  const area = getStory(areaId)

  const [phase, setPhase] = useState<Phase>('town')
  const [state, setState] = useState<StoryProgress>({ progress: 0, current: null, seen: [] })
  const [ready, setReady] = useState(false)
  const [steps, setSteps] = useState<WalkStep[]>([])
  const [stepIndex, setStepIndex] = useState(0)
  const [won, setWon] = useState(false)
  const [charging, setCharging] = useState(false)
  const [bubble, setBubble] = useState<{ text: string; key: number } | null>(null)
  const lastBubble = useRef('')

  const [full, setFull] = useState('')
  const [shown, setShown] = useState('')
  const typing = shown.length < full.length
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    setState(getStoryProgress(areaId))
    setReady(true)
  }, [areaId])

  const persist = useCallback(
    (next: StoryProgress) => {
      setState(next)
      saveStoryProgress(areaId, next)
    },
    [areaId],
  )

  /** 文字送りを始める。読み上げも同時に走らせるが、同期は取らない。 */
  const say = useCallback(
    (text: string) => {
      if (timer.current) clearInterval(timer.current)
      setFull(text)
      setShown('')
      if (device.voice) speak(text)
      let i = 0
      timer.current = setInterval(() => {
        i += 1
        setShown(text.slice(0, i))
        if (i >= text.length && timer.current) clearInterval(timer.current)
      }, TYPE_MS)
    },
    [device.voice],
  )

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current)
    stopSpeaking()
  }, [])

  useEffect(() => {
    if (!ready || !area || phase !== 'town') return
    say(townLine(area, state.progress).line)
    // 進行度が変わったときだけ言い直す
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, phase, state.progress])

  if (!area) {
    return (
      <main className="app" style={{ justifyContent: 'center', alignItems: 'center', gap: 16 }}>
        <p>おはなしが みつからない</p>
        <button className="subButton" onClick={() => router.push('/')}>
          もどる
        </button>
      </main>
    )
  }

  const step = steps[stepIndex]
  const enemy = step?.kind === 'encounter' ? step.enemy : undefined
  const cleared = state.progress >= RUNS_TO_CLEAR

  function showBubble(lines: string[]) {
    if (lines.length === 0) return
    let pick = lines[Math.floor(Math.random() * lines.length)]
    let guard = 0
    while (lines.length > 1 && pick === lastBubble.current && guard < 8) {
      pick = lines[Math.floor(Math.random() * lines.length)]
      guard += 1
    }
    lastBubble.current = pick
    setBubble({ text: pick, key: Date.now() })
  }

  function openFork() {
    primeSpeech()
    setPhase('fork')
    say(area!.forkText)
  }

  /** 道を選んだ時点で 1 回ぶんの散策を組む。中身は直近に出たものを避けて引く。 */
  function chooseBranch(branchId: string) {
    const walk = buildWalk(area!, branchId, state.seen)
    setSteps(walk)
    setStepIndex(0)
    setWon(false)
    setPhase(walk[0]?.kind === 'encounter' ? 'encounter' : 'scene')
    if (walk[0]) say(walk[0].text)
    // 引いたものを覚えておき、次の散策では避ける
    persist({ ...state, seen: [...state.seen, ...walk.map((s) => s.id)].slice(-RECENT_MEMORY * 2) })
  }

  function nextStep() {
    const next = stepIndex + 1
    if (next >= steps.length) {
      backToTown()
      return
    }
    setStepIndex(next)
    setWon(false)
    setPhase(steps[next].kind === 'encounter' ? 'encounter' : 'scene')
    say(steps[next].text)
  }

  function backToTown() {
    persist({
      progress: Math.min(RUNS_TO_CLEAR, state.progress + 1),
      current: null,
      seen: state.seen,
    })
    setSteps([])
    setStepIndex(0)
    setPhase('town')
  }

  /**
   * 戦いに入る前触れ。
   * 自動で流し込まないのは、指の準備ができる前に 1 問目が出ると
   * 最初の 1 問だけ不利になるため。
   */
  function beginCharge() {
    setCharging(true)
    setTimeout(() => {
      setCharging(false)
      setPhase('cue')
      if (device.voice) speak('バトル スタート')
    }, 620)
  }

  /** 画面のどこをタップしても進む。文字送りの途中なら一気に表示する。 */
  function tap() {
    primeSpeech()
    if (phase === 'battle' || phase === 'town' || phase === 'fork') return
    if (phase === 'cue') {
      stopSpeaking()
      setPhase('battle')
      return
    }
    if (typing) {
      if (timer.current) clearInterval(timer.current)
      setShown(full)
      return
    }
    stopSpeaking()

    if (phase === 'scene') {
      nextStep()
      return
    }
    if (phase === 'encounter' && enemy) {
      setPhase('greeting')
      say(enemy.greeting)
      return
    }
    if (phase === 'greeting') {
      beginCharge()
      return
    }
    if (phase === 'outro') {
      nextStep()
    }
  }

  const emoji =
    phase === 'town' ? '🏡' : phase === 'fork' ? '🧭' : won && phase === 'outro' ? '🎁' : (enemy?.emoji ?? '🌿')
  const caption = phase === 'town' ? area.name : enemy?.name

  return (
    <main className="app" onClick={tap}>
      <div className="hud" style={{ display: 'flex', justifyContent: 'space-between' }}>
        <button
          className="subButton"
          style={{ padding: '6px 12px', fontSize: 13, opacity: 0.6 }}
          onClick={(e) => {
            e.stopPropagation()
            stopSpeaking()
            router.push('/')
          }}
        >
          やめる
        </button>
        <span className="label">
          {phase === 'town' ? area.name : `さんさく ${Math.min(stepIndex + 1, steps.length || 1)} / ${steps.length || 4}`}
        </span>
      </div>

      <div className="art" data-battle={phase === 'battle'} data-charge={charging} style={{ marginTop: 10 }}>
        {caption && <span className="artCaption">{caption}</span>}
        <div className="bubbleZone">
          <div className="bubble" key={bubble?.key} data-go={Boolean(bubble)}>
            {bubble?.text ?? ''}
          </div>
        </div>
        <div className="stage">
          <div className="ground" />
          <span className="artEmoji" aria-hidden>
            {emoji}
          </span>
        </div>
        <span className="alert" data-go={charging} aria-hidden>
          !
        </span>
        <div className="flash" data-go={charging} aria-hidden />
        {phase === 'cue' && (
          <div className="startCue">
            <span className="startCueText">バトル スタート！</span>
            <span className="startCueHint">タップ</span>
          </div>
        )}
      </div>

      {phase === 'town' && (
        <div className="storyMeter" style={{ marginTop: 10 }}>
          <div className="storyMeterTop">
            <span>ぼうけんの すすみぐあい</span>
            <span>{Math.round((state.progress / RUNS_TO_CLEAR) * 100)}%</span>
          </div>
          <div className="meterTrack">
            <div className="meterFill" style={{ width: `${(state.progress / RUNS_TO_CLEAR) * 100}%` }} />
          </div>
        </div>
      )}

      {phase === 'battle' && enemy && (
        <div style={{ marginTop: 10 }} onClick={(e) => e.stopPropagation()}>
          <StoryBattle
            stage={area.stage}
            enemy={enemy}
            onBubble={showBubble}
            onDone={(victory) => {
              setWon(victory)
              setBubble(null)
              setPhase('outro')
              if (step?.kind === 'encounter') say(victory ? step.outroWin : step.outroLose)
            }}
          />
        </div>
      )}

      {phase !== 'battle' && (
        <div className="window" style={{ marginTop: 10 }}>
          {phase === 'town' && <span className="speaker">{townLine(area, state.progress).speaker}</span>}
          {phase === 'greeting' && enemy && <span className="speaker">{enemy.name}</span>}
          <p className="storyBody">
            {shown}
            {typing && <span className="caret">▎</span>}
          </p>

          {phase === 'town' && !typing && (
            <div className="choiceList" onClick={(e) => e.stopPropagation()}>
              <button className="choice" onClick={openFork}>
                {cleared ? 'もう いちど さんさくする' : 'さんさくに いく'}
              </button>
              <button
                className="choice"
                onClick={() => {
                  stopSpeaking()
                  router.push('/')
                }}
              >
                きょうは ここまで
              </button>
            </div>
          )}

          {/* 道を選ぶ。選んだ道によって出会う あいて が変わる */}
          {phase === 'fork' && !typing && (
            <div className="choiceList" onClick={(e) => e.stopPropagation()}>
              {area.branches.map((b) => (
                <button key={b.id} className="choice" onClick={() => chooseBranch(b.id)}>
                  {b.label}
                </button>
              ))}
            </div>
          )}

          {!typing && phase !== 'town' && phase !== 'fork' && phase !== 'cue' && (
            <span className="nextMark">▼</span>
          )}
        </div>
      )}
    </main>
  )
}
