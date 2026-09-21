'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from './AppProvider'
import StoryBattle from './StoryBattle'
import { RUNS_TO_CLEAR, enemyOf, getStory, paragraph, townLine } from '@/lib/stories'
import { primeSpeech, speak, stopSpeaking } from '@/lib/speech'
import { getStoryProgress, saveStoryProgress } from '@/lib/storage'
import type { StoryProgress } from '@/lib/storage'

type Phase = 'town' | 'scene' | 'greeting' | 'cue' | 'battle' | 'outro'

/** 文字送りの速さ。読める子は目で追い、読めない子は耳だけで進む。 */
const TYPE_MS = 45

export default function StoryScreen({ areaId }: { areaId: string }) {
  const router = useRouter()
  const { device } = useApp()
  const area = getStory(areaId)

  const [phase, setPhase] = useState<Phase>('town')
  const [state, setState] = useState<StoryProgress>({ progress: 0, current: null, seen: [] })
  const [ready, setReady] = useState(false)
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

  // 街に着いたときの住人のセリフ
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

  const current = state.current ? paragraph(area, state.current) : undefined
  const enemy = enemyOf(area, current?.battle)
  const cleared = state.progress >= RUNS_TO_CLEAR

  /*
   * 選択肢を出す条件。
   *
   * 戦いのある場面では、戦いが終わって結びを読み終えるまで出さない。
   * 戦いの無い場面では、地の文を読み終えた時点で出す。
   * 出ている間はタップで先へ進めない。選ぶことが進む手段になる。
   */
  const hasChoices = (current?.choices?.length ?? 0) > 0
  const choicesReady =
    !typing && hasChoices && (phase === 'outro' || (phase === 'scene' && !enemy))

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

  function goToParagraph(id: string) {
    const next = { ...state, current: id, seen: [...state.seen, id].slice(-12) }
    persist(next)
    setPhase('scene')
    setWon(false)
    const p = paragraph(area!, id)
    if (p) say(p.text)
  }

  function startWalk() {
    primeSpeech()
    goToParagraph(area!.start)
  }

  function backToTown(counted: boolean) {
    const next = {
      progress: counted ? Math.min(RUNS_TO_CLEAR, state.progress + 1) : state.progress,
      current: null,
      seen: [],
    }
    persist(next)
    setPhase('town')
  }

  /**
   * 戦いに入る前触れ。
   * 敵が一歩ふみこみ、枠が光ってから「バトル スタート！」で止まる。
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
    if (phase === 'battle') return
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

    // 選択肢が出ているなら、それを選ぶことが先へ進む手段。タップは効かせない
    if (choicesReady) return

    if (phase === 'scene') {
      // 戦いのある場面では、地の文のあとに敵が名乗る
      if (enemy) {
        setPhase('greeting')
        say(enemy.greeting)
        return
      }
      backToTown(true)
      return
    }
    if (phase === 'greeting') {
      beginCharge()
      return
    }
    if (phase === 'outro') {
      // 結びまで読んで選択肢が無いなら、その散策はここで終わり
      backToTown(true)
    }
  }

  const emoji = phase === 'town' ? '🏡' : won && phase === 'outro' ? '🎁' : (enemy?.emoji ?? '🌿')
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
        <span className="label">{phase === 'town' ? area.name : 'さんさく'}</span>
      </div>

      <div
        className="art"
        data-battle={phase === 'battle'}
        data-charge={charging}
        style={{ marginTop: 10 }}
      >
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
            <div
              className="meterFill"
              style={{ width: `${(state.progress / RUNS_TO_CLEAR) * 100}%` }}
            />
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
              const text = victory ? current?.outroWin : current?.outroLose
              if (text) say(text)
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
              <button className="choice" onClick={startWalk}>
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

          {choicesReady && (
            <div className="choiceList" onClick={(e) => e.stopPropagation()}>
              {current?.choices?.map((c) => (
                <button key={c.to} className="choice" onClick={() => goToParagraph(c.to)}>
                  {c.label}
                </button>
              ))}
            </div>
          )}

          {!typing && !choicesReady && phase !== 'town' && phase !== 'cue' && (
            <span className="nextMark">▼</span>
          )}
        </div>
      )}
    </main>
  )
}
