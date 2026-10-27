'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from './AppProvider'
import { unlockedStages } from '@/lib/kuku'
import {
  ORDERS_PER_DAY,
  SEED_MAX_LENGTH,
  orderStory,
  orderedToday,
  type StorySeed,
} from '@/lib/storage/stories'

/**
 * 話を注文する画面。
 *
 * ここで生成はしない。注文を置くだけで、作るのはスケジュール実行。
 * 判断の根拠は docs/story-authoring-design.md。
 *
 * 打つ量を増やさない。選ぶだけで出せる状態を既定にして、
 * 書きたいところだけ書ける形にする。小 2 がスマホで打つ前提。
 */

const PLACES = ['もり', 'うみ', 'そら', 'ゆきのくに', 'おかしのくに', 'うちゅう']
const MOODS = ['たのしい', 'ふしぎ', 'やさしい', 'ちょっと どきどき']

export default function StoryOrderScreen() {
  const router = useRouter()
  const { settings, stories, setStories, refreshStories } = useApp()

  const unlocked = useMemo(
    () => unlockedStages(settings.stageOrder, settings.unlockedCount),
    [settings.stageOrder, settings.unlockedCount],
  )

  const [stage, setStage] = useState<number>(unlocked[unlocked.length - 1] ?? 1)
  const [place, setPlace] = useState(PLACES[0])
  const [placeFree, setPlaceFree] = useState('')
  const [who, setWho] = useState('')
  const [mood, setMood] = useState(MOODS[0])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const left = ORDERS_PER_DAY - orderedToday(stories)
  const canOrder = left > 0 && who.trim().length > 0 && !sending

  /*
   * 押せない理由は、押す前に出す。
   * 小 2 に「押しても何も起きないボタン」を見せない。
   */
  const blocked =
    left <= 0
      ? 'きょうは もう おねがいしたよ。あしたまで まってね'
      : who.trim().length === 0
        ? 'だれが でてくるか かいてね'
        : null

  async function send() {
    if (!canOrder) return
    setSending(true)
    setError(null)
    const seed: StorySeed = {
      place: (place === 'じぶんで かく' ? placeFree : place).trim(),
      who: who.trim(),
      mood,
    }
    const outcome = await orderStory(seed, stage, settings.childName, stories)
    if (outcome.ok) {
      setStories([outcome.story, ...stories])
      void refreshStories()
      router.push('/')
      return
    }
    setSending(false)
    setError(
      outcome.reason === 'not-configured'
        ? 'いまは つくれません。おうちのひとに きいてね'
        : outcome.reason === 'limit'
          ? 'きょうは もう おねがいしたよ。あしたまで まってね'
          : 'うまく おねがいできなかった。もういちど ためしてね',
    )
  }

  return (
    <main className="app" data-fit="true">
      <div className="hud">
        <button
          className="subButton"
          style={{ padding: '6px 13px', fontSize: 13 }}
          onClick={() => router.push('/')}
        >
          もどる
        </button>
        <div style={{ flex: 1 }} />
        <span className="label">きょう あと {Math.max(0, left)}かい</span>
      </div>

      <div className="scrollArea homeStack">
        <div className="title" style={{ marginTop: 2 }}>
          おはなしを つくる
        </div>

        <section>
          <div className="label" style={{ marginBottom: 7 }}>
            どの だん？
          </div>
          <div className="chipRow">
            {unlocked.map((s) => (
              <button
                key={s}
                className="chip"
                data-selected={stage === s}
                onClick={() => setStage(s)}
              >
                {s} の だん
              </button>
            ))}
          </div>
        </section>

        <section>
          <div className="label" style={{ marginBottom: 7 }}>
            どこの おはなし？
          </div>
          <div className="chipRow">
            {[...PLACES, 'じぶんで かく'].map((p) => (
              <button key={p} className="chip" data-selected={place === p} onClick={() => setPlace(p)}>
                {p}
              </button>
            ))}
          </div>
          {place === 'じぶんで かく' && (
            <input
              className="seedInput"
              value={placeFree}
              maxLength={SEED_MAX_LENGTH}
              placeholder="どこ？"
              onChange={(e) => setPlaceFree(e.target.value)}
            />
          )}
        </section>

        <section>
          <div className="label" style={{ marginBottom: 7 }}>
            だれが でてくる？
          </div>
          <input
            className="seedInput"
            value={who}
            maxLength={SEED_MAX_LENGTH}
            placeholder="たとえば ねこの きし"
            onChange={(e) => setWho(e.target.value)}
          />
        </section>

        <section>
          <div className="label" style={{ marginBottom: 7 }}>
            どんな かんじ？
          </div>
          <div className="chipRow">
            {MOODS.map((m) => (
              <button key={m} className="chip" data-selected={mood === m} onClick={() => setMood(m)}>
                {m}
              </button>
            ))}
          </div>
        </section>

        {error && (
          <p style={{ fontSize: 14, fontWeight: 800, color: 'var(--danger)', margin: 0 }}>{error}</p>
        )}

        {/* 待つことは隠さない。いつ届くか分かっている方が、待てる */}
        <p className="muted" style={{ fontSize: 13, lineHeight: 1.8, margin: 0 }}>
          おねがいすると、しばらくしてから できあがるよ。
          できたら「ぼうけん」に ならぶから、ときどき みにきてね。
        </p>
      </div>

      {blocked && (
        <p
          style={{
            margin: '8px 0 0',
            textAlign: 'center',
            fontSize: 13,
            fontWeight: 800,
            color: 'var(--accent2)',
          }}
        >
          {blocked}
        </p>
      )}

      <button className="bigButton" style={{ marginTop: 8 }} disabled={!canOrder} onClick={send}>
        {sending ? 'おねがい中…' : 'おねがいする'}
      </button>
    </main>
  )
}
