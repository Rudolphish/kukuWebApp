'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from '@/components/AppProvider'
import RankBadge from '@/components/RankBadge'
import RecordBoard from '@/components/RecordBoard'
import { unlockedStages } from '@/lib/kuku'
import { formatTargetSec, goldTargetMs, rankOf, type Rank } from '@/lib/rank'
import { primeSpeech, speak } from '@/lib/speech'
import { computeBests, findBest, type Best, type StageKey } from '@/lib/storage'
import { availableStories } from '@/lib/stories'
import { readyAreas } from '@/lib/storage/stories'
import { enemyEmoji, enemyName } from '@/lib/themes'

export default function Home() {
  const router = useRouter()
  const { settings, device, theme, ready, store, updateDevice, stories: orders } = useApp()
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
  // 未習の段の話は見せない。話だけ先に進むと、解放の意味が無くなる。
  // 子どもが注文して出来上がった話も、同じ並びに混ぜる（自分の作ったものが先頭）。
  const playable = useMemo(
    () => availableStories(unlocked, readyAreas(orders)),
    [unlocked, orders],
  )
  /** まだ出来ていない注文。作っている最中であることを見せる */
  const pending = useMemo(() => orders.filter((o) => o.status === 'ordered'), [orders])
  const failed = useMemo(() => orders.filter((o) => o.status === 'failed'), [orders])
  const mode = device.mode
  const pace = settings.rankPace ?? 'normal'

  /*
   * 段ごとに取れているランク。ホームに出すのは「これまでの達成」であって
   * 残っている課題ではない。だから取れていない段には何も出さない。
   * 鍵のかかった段に「まだクリアなし」と出すと、それは苦手の一覧になる。
   */
  const rankByStage = useMemo(() => {
    const out = new Map<StageKey, Rank>()
    for (const s of [...unlocked, 'mix' as const]) {
      const best = findBest(bests, device.role, s)
      if (best) out.set(s, rankOf(best, unlocked, pace))
    }
    return out
  }, [bests, device.role, pace, unlocked])

  const goldSec = formatTargetSec(goldTargetMs(selected, unlocked, pace))

  function start() {
    primeSpeech()
    speak(theme.startLine, { rate: 1.2 })
    router.push(`/play?stage=${selected}`)
  }

  return (
    <main className="app" data-fit="true">
      <div className="title">九九バトル</div>

      {/*
        モードは画面を分けずに中身を入れ替える。
        遷移にすると「はじめる」までのタップが 1 つ増える。
      */}
      <div className="modeTabs rise" style={{ marginTop: 14 }}>
        <button
          className="modeTab"
          data-active={mode === 'attack'}
          onClick={() => updateDevice({ mode: 'attack' })}
        >
          たたかう
        </button>
        <button
          className="modeTab"
          data-active={mode === 'story'}
          onClick={() => updateDevice({ mode: 'story' })}
        >
          ぼうけん
        </button>
      </div>

      {mode === 'attack' ? (
        <>
          <div className="scrollArea homeStack">
            <div className="hero rise" style={{ '--i': 1 } as React.CSSProperties}>
              <div className="heroPort">
                <span className="heroChar" aria-hidden>
                  {enemyEmoji(theme, selected)}
                </span>
              </div>
              <div className="heroInfo">
                <span className="label">あいて</span>
                <span className="heroName">{enemyName(theme, selected, settings.enemyNames)}</span>
                {rankByStage.get(selected) && <RankBadge rank={rankByStage.get(selected)!} />}
                {/*
                  追いかける的を 1 つの数字として言い切る。
                  「速く」では的にならないが、「22.0 びょう」は的になる。
                */}
                <span className="goldLine">
                  ゴールド <b>{goldSec}</b> びょう
                </span>
              </div>
            </div>

            <div className="rise" style={{ '--i': 2 } as React.CSSProperties}>
              <div className="label" style={{ marginBottom: 7 }}>
                えらぶ
              </div>
              <div className="stagePicker">
                {unlocked.map((s) => (
                  <button
                    key={s}
                    className="stageCard"
                    data-selected={selected === s}
                    onClick={() => setStage(s)}
                  >
                    <span aria-hidden style={{ fontSize: 19 }}>
                      {enemyEmoji(theme, s)}
                    </span>
                    <span className="stageNum">{s}</span>
                    {rankByStage.get(s) && <RankBadge rank={rankByStage.get(s)!} size="bar" />}
                  </button>
                ))}
                {mixAvailable && (
                  <button
                    className="stageCard"
                    data-selected={selected === 'mix'}
                    onClick={() => setStage('mix')}
                  >
                    <span aria-hidden style={{ fontSize: 19 }}>
                      {enemyEmoji(theme, 'mix')}
                    </span>
                    <span className="stageSub">ぜんぶ</span>
                    {rankByStage.get('mix') && (
                      <RankBadge rank={rankByStage.get('mix')!} size="bar" />
                    )}
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

            <div className="rise" style={{ '--i': 3 } as React.CSSProperties}>
              <RecordBoard bests={bests} stage={selected} settings={settings} unlocked={unlocked} />
            </div>
          </div>

          <button
            className="bigButton rise"
            style={{ marginTop: 12, '--i': 4 } as React.CSSProperties}
            onClick={start}
          >
            はじめる
          </button>
        </>
      ) : (
        <>
          <div
            className="scrollArea"
            style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 14 }}
          >
            <div className="label">おはなし</div>
            {playable.map((s, i) => (
              <button
                key={s.id}
                className="storyCard rise"
                style={{ '--i': i + 1 } as React.CSSProperties}
                onClick={() => {
                  primeSpeech()
                  router.push(`/story?area=${s.id}`)
                }}
              >
                <span aria-hidden style={{ fontSize: 34 }}>
                  {s.enemies[0]?.emoji ?? '📖'}
                </span>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span style={{ fontSize: 18, fontWeight: 900 }}>{s.name}</span>
                  <span className="muted" style={{ fontSize: 12, fontWeight: 700 }}>
                    {s.origin === 'original' && s.author
                      ? `${s.author}が つくった おはなし`
                      : `${s.stage}の だんの ぼうけん`}
                  </span>
                </span>
              </button>
            ))}

            {/*
              注文したが、まだ出来ていないもの。
              待っていることを隠さない。何も出ないと、注文が消えたように見える。
            */}
            {pending.map((o) => (
              <div key={o.id} className="pendingCard">
                <span className="pendingDots" aria-hidden>
                  <span />
                  <span />
                  <span />
                </span>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span style={{ fontSize: 16, fontWeight: 900 }}>
                    「{o.seed.who}」の おはなし
                  </span>
                  <span className="muted" style={{ fontSize: 12, fontWeight: 700 }}>
                    いま つくってもらっているところ
                  </span>
                </span>
              </div>
            ))}

            {failed.map((o) => (
              <div key={o.id} className="pendingCard" data-failed="true">
                <span aria-hidden style={{ fontSize: 26 }}>
                  💤
                </span>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <span style={{ fontSize: 16, fontWeight: 900 }}>
                    「{o.seed.who}」の おはなし
                  </span>
                  <span className="muted" style={{ fontSize: 12, fontWeight: 700 }}>
                    うまく できなかったみたい。もういちど おねがいしてみてね
                  </span>
                </span>
              </div>
            ))}

            {playable.length === 0 && pending.length === 0 && (
              <p className="muted" style={{ fontSize: 14, lineHeight: 1.8 }}>
                いまの だんの おはなしは まだ ありません。
              </p>
            )}
          </div>

          {/* 作る側に回る入口。ここがこのモードの主役 */}
          <button
            className="bigButton"
            style={{ marginTop: 12, fontSize: 24 }}
            onClick={() => router.push('/story/new')}
          >
            おはなしを つくる
          </button>
        </>
      )}

      {/* 親向けの入口。子どもの動線からは外して小さく置く */}
      <button
        className="subButton"
        style={{ alignSelf: 'center', opacity: 0.55, fontSize: 13, padding: '8px 14px', marginTop: 10 }}
        onClick={() => router.push('/parent')}
      >
        おうちのひと
      </button>
    </main>
  )
}
