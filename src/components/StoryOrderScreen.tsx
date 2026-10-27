'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from './AppProvider'
import { unlockedStages } from '@/lib/kuku'
import {
  ORDERS_PER_DAY,
  SEED_MAX_LENGTH,
  canContinue,
  orderStory,
  orderedToday,
  readyAreas,
  sequelCast,
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
 *
 * `fromId` があれば「つづき」の注文になる。もとの話の なかま を候補に出し、
 * どこへ いく・なにを する・だれが でる を選ぶか書いてもらう。
 */

const PLACES = ['もり', 'うみ', 'そら', 'ゆきのくに', 'おかしのくに', 'うちゅう']
const MOODS = ['たのしい', 'ふしぎ', 'やさしい', 'ちょっと どきどき']
const SEQUEL_PLACES = ['となりの くに', 'やまの うえ', 'うみの そこ', 'ほしの くに', 'ひみつの しま']
const SEQUEL_DOINGS = ['たからさがし', 'おまつり', 'だれかを たすける', 'ピクニック', 'かくれんぼ']

/** 候補のチップと並べる「じぶんで かく」 */
const FREE = 'じぶんで かく'

export default function StoryOrderScreen({ fromId }: { fromId?: string }) {
  const router = useRouter()
  const { settings, device, stories, setStories, refreshStories } = useApp()
  // おうちのひとの端末では、1 日の上限をかけない
  const unlimited = device.role === 'parent'

  const unlocked = useMemo(
    () => unlockedStages(settings.stageOrder, settings.unlockedCount),
    [settings.stageOrder, settings.unlockedCount],
  )

  // つづきの もとの話。見つからなければ ふつうの注文として扱う
  const parent = useMemo(() => {
    if (!fromId) return null
    const area = readyAreas(stories).find((a) => a.id === fromId)
    return area && canContinue(area) ? area : null
  }, [fromId, stories])
  const cast = useMemo(() => (parent ? sequelCast(parent) : []), [parent])

  const [stage, setStage] = useState<number | null>(null)
  const [place, setPlace] = useState<string | null>(null)
  const [placeFree, setPlaceFree] = useState('')
  const [what, setWhat] = useState<string | null>(null)
  const [whatFree, setWhatFree] = useState('')
  const [whoPick, setWhoPick] = useState<string | null>(null)
  const [who, setWho] = useState('')
  const [mood, setMood] = useState(MOODS[0])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const places = parent ? SEQUEL_PLACES : PLACES
  // 選ぶ前は先頭を選んだことにする。押さなくても出せる状態を既定にする
  const stageNow =
    stage ??
    (parent && unlocked.includes(parent.stage) ? parent.stage : (unlocked[unlocked.length - 1] ?? 1))
  const placeNow = place ?? places[0]
  const whatNow = what ?? SEQUEL_DOINGS[0]
  const whoPickNow = whoPick ?? cast[0] ?? FREE

  const whoValue = (parent && whoPickNow !== FREE ? whoPickNow : who).trim()

  const left = unlimited ? Infinity : ORDERS_PER_DAY - orderedToday(stories)
  const canOrder = left > 0 && whoValue.length > 0 && !sending

  /*
   * 押せない理由は、押す前に出す。
   * 小 2 に「押しても何も起きないボタン」を見せない。
   */
  const blocked =
    left <= 0
      ? 'きょうは もう おねがいしたよ。あしたまで まってね'
      : whoValue.length === 0
        ? 'だれが でてくるか かいてね'
        : null

  async function send() {
    if (!canOrder) return
    setSending(true)
    setError(null)
    const seed: StorySeed = {
      place: (placeNow === FREE ? placeFree : placeNow).trim(),
      who: whoValue,
      mood,
      ...(unlimited ? { by: 'parent' as const } : {}),
      ...(parent
        ? {
            what: (whatNow === FREE ? whatFree : whatNow).trim(),
            continues: { id: parent.id, name: parent.name },
          }
        : {}),
    }
    const outcome = await orderStory(seed, stageNow, settings.childName, stories)
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
        <span className="label">{unlimited ? 'おうちのひとは いくつでも' : `きょう あと ${Math.max(0, left)}かい`}</span>
      </div>

      <div className="scrollArea homeStack">
        <div className="title" style={{ marginTop: 2 }}>
          {parent ? 'つづきを つくる' : 'おはなしを つくる'}
        </div>
        {parent && (
          <p className="muted" style={{ fontSize: 14, fontWeight: 800, margin: '-4px 0 0' }}>
            「{parent.name}」の つづき
          </p>
        )}

        <section>
          <div className="label" style={{ marginBottom: 7 }}>
            どの だん？
          </div>
          <div className="chipRow">
            {unlocked.map((s) => (
              <button
                key={s}
                className="chip"
                data-selected={stageNow === s}
                onClick={() => setStage(s)}
              >
                {s} の だん
              </button>
            ))}
          </div>
        </section>

        <ChoiceField
          label={parent ? 'つぎは どこへ いく？' : 'どこの おはなし？'}
          options={places}
          value={placeNow}
          onPick={setPlace}
          free={placeFree}
          onFree={setPlaceFree}
          placeholder="どこ？"
        />

        {parent && (
          <ChoiceField
            label="なにを する？"
            options={SEQUEL_DOINGS}
            value={whatNow}
            onPick={setWhat}
            free={whatFree}
            onFree={setWhatFree}
            placeholder="なにを する？"
          />
        )}

        {parent ? (
          <ChoiceField
            label="だれが でてくる？"
            options={cast}
            value={whoPickNow}
            onPick={setWhoPick}
            free={who}
            onFree={setWho}
            placeholder="あたらしい なかまも かけるよ"
          />
        ) : (
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
        )}

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

/** 候補のチップと「じぶんで かく」。選ばなくても書けるようにする */
function ChoiceField({
  label,
  options,
  value,
  onPick,
  free,
  onFree,
  placeholder,
}: {
  label: string
  options: string[]
  value: string
  onPick: (value: string) => void
  free: string
  onFree: (value: string) => void
  placeholder: string
}) {
  return (
    <section>
      <div className="label" style={{ marginBottom: 7 }}>
        {label}
      </div>
      <div className="chipRow">
        {[...options, FREE].map((o) => (
          <button key={o} className="chip" data-selected={value === o} onClick={() => onPick(o)}>
            {o}
          </button>
        ))}
      </div>
      {value === FREE && (
        <input
          className="seedInput"
          value={free}
          maxLength={SEED_MAX_LENGTH}
          placeholder={placeholder}
          onChange={(e) => onFree(e.target.value)}
        />
      )}
    </section>
  )
}
