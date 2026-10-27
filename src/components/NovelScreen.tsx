'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from './AppProvider'
import StoryBattle from './StoryBattle'
import { SpeechButton } from './SpeechSettings'
import { primeSpeech, speak, stopSpeaking } from '@/lib/speech'
import { getStoryProgress, saveStoryProgress, supabaseConfigured } from '@/lib/storage'
import { canContinue } from '@/lib/storage/stories'
import type { NovelArea, NovelPage } from '@/lib/story'

/**
 * 小説の形の話を読む画面。
 *
 * はじめから順にページを送り、最後に 1 回だけ戦う。戦いのあとに結びを読んで終わる。
 * 途中でやめても、次に開いたときは続きのページから読める。
 */
type Phase = 'read' | 'bossIntro' | 'greeting' | 'cue' | 'battle' | 'ending' | 'end'

/** 文字送りの速さ。読める子は目で追い、読めない子は耳だけで進む。 */
const TYPE_MS = 45

export default function NovelScreen({ area }: { area: NovelArea }) {
  const router = useRouter()
  const { device } = useApp()
  const enemy = area.boss.enemy

  const [phase, setPhase] = useState<Phase>('read')
  const [page, setPage] = useState(0)
  /** 選択肢を選んで枝を読んでいる最中なら、その枝と位置 */
  const [branch, setBranch] = useState<{ option: number; at: number } | null>(null)
  const [endingIndex, setEndingIndex] = useState(0)
  const [won, setWon] = useState(false)
  const [done, setDone] = useState(false)
  const [charging, setCharging] = useState(false)
  const [bubble, setBubble] = useState<{ text: string; key: number } | null>(null)
  const lastBubble = useRef('')

  const [full, setFull] = useState('')
  const [shown, setShown] = useState('')
  const typing = shown.length < full.length
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

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

  const save = useCallback(
    (nextPage: number, nextDone: boolean) => {
      saveStoryProgress(area.id, { progress: nextPage, current: null, seen: [], done: nextDone })
    },
    [area.id],
  )

  // 途中でやめていたら、そのページから。読み終えていたら はじめから
  useEffect(() => {
    const saved = getStoryProgress(area.id)
    const start = saved.progress > 0 && saved.progress < area.pages.length ? saved.progress : 0
    setDone(Boolean(saved.done))
    setPage(start)
    say(area.pages[start].text)
    // 開いたときに 1 度だけ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [area.id])

  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current)
      stopSpeaking()
    },
    [],
  )

  const ending: NovelPage[] = won ? area.ending.win : area.ending.lose

  function goPage(next: number) {
    setBranch(null)
    setPage(next)
    save(next, done)
    say(area.pages[next].text)
  }

  /** 本筋の次へ。最後のページを読み終えていたら、さいごの しょうぶ へ */
  function nextMain() {
    if (page + 1 < area.pages.length) {
      goPage(page + 1)
      return
    }
    setBranch(null)
    setPhase('bossIntro')
    say(area.boss.intro)
  }

  function choose(option: number) {
    const first = area.pages[page].choices?.[option]?.pages[0]
    if (!first) return
    primeSpeech()
    stopSpeaking()
    setBranch({ option, at: 0 })
    say(first.text)
  }

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

  function finish() {
    setDone(true)
    save(0, true)
    setPhase('end')
    say('おしまい')
  }

  /** 画面のどこをタップしても進む。文字送りの途中なら一気に表示する。 */
  function tap() {
    primeSpeech()
    if (phase === 'battle' || phase === 'end') return
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

    if (phase === 'read') {
      if (branch) {
        const branchPages = area.pages[page].choices?.[branch.option]?.pages ?? []
        if (branch.at + 1 < branchPages.length) {
          setBranch({ ...branch, at: branch.at + 1 })
          say(branchPages[branch.at + 1].text)
          return
        }
        nextMain()
        return
      }
      // 選択肢のあるページでは、選ぶまで先へ進まない
      if (area.pages[page].choices) return
      nextMain()
      return
    }
    if (phase === 'bossIntro') {
      setPhase('greeting')
      say(enemy.greeting)
      return
    }
    if (phase === 'greeting') {
      beginCharge()
      return
    }
    if (phase === 'ending') {
      if (endingIndex + 1 < ending.length) {
        setEndingIndex(endingIndex + 1)
        say(ending[endingIndex + 1].text)
        return
      }
      finish()
    }
  }

  function readAgain() {
    setBranch(null)
    setPhase('read')
    setEndingIndex(0)
    setWon(false)
    goPage(0)
  }

  const branchPage = branch ? area.pages[page].choices?.[branch.option]?.pages[branch.at] : undefined
  const current: NovelPage | null =
    phase === 'read' ? (branchPage ?? area.pages[page]) : phase === 'ending' ? (ending[endingIndex] ?? null) : null
  const choosing = phase === 'read' && !branch && Boolean(area.pages[page].choices)
  const speaker = phase === 'greeting' ? enemy.name : current?.speaker
  const castEmoji = area.cast.find((c) => c.name === current?.speaker)?.emoji
  const atBoss = phase === 'bossIntro' || phase === 'greeting' || phase === 'cue' || phase === 'battle'
  const emoji = atBoss ? enemy.emoji : phase === 'end' ? (won ? '🎁' : '🌙') : (castEmoji ?? area.cast[0]?.emoji ?? '📖')
  const label =
    phase === 'read' ? `${page + 1} / ${area.pages.length}` : atBoss ? 'さいごの しょうぶ' : 'おしまい'

  return (
    <main className="app" onClick={tap}>
      <div className="hud" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
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
        <span className="label" style={{ flex: 1, textAlign: 'center' }}>
          {label}
        </span>
        {/* 読み返せるように。戦いのあとは戻らない */}
        <button
          className="subButton"
          style={{ padding: '6px 12px', fontSize: 13, opacity: phase === 'read' && page > 0 && !branch ? 0.8 : 0 }}
          disabled={!(phase === 'read' && page > 0 && !branch)}
          aria-label="まえの ページ"
          onClick={(e) => {
            e.stopPropagation()
            stopSpeaking()
            goPage(page - 1)
          }}
        >
          ◀ まえ
        </button>
        <SpeechButton />
      </div>

      <div className="art" data-battle={phase === 'battle'} data-charge={charging} style={{ marginTop: 10 }}>
        <span className="artCaption">{atBoss ? enemy.name : area.name}</span>
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

      {phase === 'read' && (
        <div className="storyMeter" style={{ marginTop: 10 }}>
          <div className="meterTrack">
            <div className="meterFill" style={{ width: `${((page + 1) / area.pages.length) * 100}%` }} />
          </div>
        </div>
      )}

      {phase === 'battle' && (
        <div style={{ marginTop: 10 }} onClick={(e) => e.stopPropagation()}>
          <StoryBattle
            stage={area.stage}
            enemy={enemy}
            onBubble={showBubble}
            onDone={(victory) => {
              setWon(victory)
              setBubble(null)
              setEndingIndex(0)
              setPhase('ending')
              const pages = victory ? area.ending.win : area.ending.lose
              say(pages[0].text)
            }}
          />
        </div>
      )}

      {phase !== 'battle' && (
        <div className="window" style={{ marginTop: 10 }}>
          {speaker && <span className="speaker">{speaker}</span>}
          <p className="storyBody">
            {shown}
            {typing && <span className="caret">▎</span>}
          </p>

          {/* 選択肢。どちらを選んでも本筋へ戻るが、読む場面が変わる */}
          {choosing && !typing && (
            <div className="choiceList" onClick={(e) => e.stopPropagation()}>
              {area.pages[page].choices!.map((c, i) => (
                <button key={i} className="choice" onClick={() => choose(i)}>
                  {c.label}
                </button>
              ))}
            </div>
          )}

          {phase === 'end' && !typing && (
            <div className="choiceList" onClick={(e) => e.stopPropagation()}>
              {/* 自分で作った世界を、ここで終わらせない */}
              {done && supabaseConfigured && canContinue(area) && (
                <button
                  className="choice"
                  onClick={() => {
                    stopSpeaking()
                    router.push(`/story/new?from=${encodeURIComponent(area.id)}`)
                  }}
                >
                  つづきを つくる
                </button>
              )}
              <button className="choice" onClick={readAgain}>
                もういちど よむ
              </button>
              <button
                className="choice"
                onClick={() => {
                  stopSpeaking()
                  router.push('/')
                }}
              >
                ホームへ
              </button>
            </div>
          )}

          {!typing && !choosing && phase !== 'end' && phase !== 'cue' && <span className="nextMark">▼</span>}
        </div>
      )}
    </main>
  )
}
