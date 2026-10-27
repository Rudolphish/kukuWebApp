/**
 * Web Speech API のラッパ。
 *
 * 小 2 にとって読字自体が負荷なので、音声は装飾ではなく本体側の機能として扱う。
 * ただし iOS Safari には癖があるため、ここで吸収する。
 *  - 音声リストの読み込みが非同期（voiceschanged を待つ必要がある）
 *  - 最初の発話がユーザー操作起点でないと無音になる
 *  - 連続発話でキューが詰まることがある（speak の前に cancel する）
 */

let jaVoice: SpeechSynthesisVoice | null = null
let primed = false

/**
 * 端末ごとの読み上げの好み。AppProvider が端末設定から入れる。
 * 呼び出し側ごとの rate（答えはゆっくり等）に、この倍率を掛ける。
 */
type SpeechPrefs = { rate: 'slow' | 'normal' | 'fast'; voice: 'auto' | 'female' | 'male' }
let prefs: SpeechPrefs = { rate: 'normal', voice: 'auto' }

export const RATE_FACTOR: Record<SpeechPrefs['rate'], number> = { slow: 0.75, normal: 1, fast: 1.3 }

export function setSpeechPrefs(next: SpeechPrefs): void {
  const changed = next.voice !== prefs.voice
  prefs = next
  if (changed) jaVoice = pickJapaneseVoice()
}

/**
 * 声の名前から性別を推し量る。Web Speech API は性別を返さないため、
 * 主要な端末の日本語の声の名前で見分ける。知らない名前は unknown。
 */
const FEMALE_NAMES = ['kyoko', 'o-ren', 'oren', 'haruka', 'ayumi', 'nanami', 'sayaka', 'mizuki', 'female', '女性', 'google 日本語']
const MALE_NAMES = ['otoya', 'hattori', 'ichiro', 'keita', 'daichi', 'naoki', 'male', '男性']

export function voiceGender(name: string): 'female' | 'male' | 'unknown' {
  const n = name.toLowerCase()
  // female は male を含むので先に見る
  if (FEMALE_NAMES.some((k) => n.includes(k))) return 'female'
  if (MALE_NAMES.some((k) => n.includes(k))) return 'male'
  return 'unknown'
}

/** 選んだ声の性別がこの端末に無いか。無ければ高さで寄せる */
export function voiceMissing(want: SpeechPrefs['voice']): boolean {
  if (want === 'auto') return false
  const s = synth()
  if (!s) return false
  return !s.getVoices().some((v) => v.lang.startsWith('ja') && voiceGender(v.name) === want)
}

function synth(): SpeechSynthesis | null {
  if (typeof window === 'undefined') return null
  return window.speechSynthesis ?? null
}

export function speechAvailable(): boolean {
  return synth() !== null
}

function pickJapaneseVoice(): SpeechSynthesisVoice | null {
  const s = synth()
  if (!s) return null
  const voices = s.getVoices()
  if (voices.length === 0) return null
  const ja = voices.filter((v) => v.lang.startsWith('ja'))
  // 選んだ性別の声があればそれを使う。無ければ ja-JP を優先し、無ければ ja で始まるもの
  if (prefs.voice !== 'auto') {
    const match = ja.find((v) => voiceGender(v.name) === prefs.voice)
    if (match) return match
  }
  return ja.find((v) => v.lang === 'ja-JP') ?? ja[0] ?? null
}

/**
 * 最初のユーザー操作（スタートのタップ）で必ず呼ぶ。
 * 空の発話を 1 度通すことで、以降のプログラム発話が iOS でも鳴るようになる。
 */
export function primeSpeech(): void {
  const s = synth()
  if (!s || primed) return
  primed = true
  jaVoice = pickJapaneseVoice()
  if (!jaVoice) {
    s.addEventListener('voiceschanged', () => {
      jaVoice = pickJapaneseVoice()
    })
  }
  try {
    const warmup = new SpeechSynthesisUtterance('')
    warmup.volume = 0
    s.speak(warmup)
  } catch {
    // 鳴らなくてもゲームは成立する
  }
}

export type SpeakOptions = {
  /** 読み上げ速度。既定は少し速め。待たされると小 2 は閉じる */
  rate?: number
  pitch?: number
  /** 読み上げ中のものを止めてから話すか */
  interrupt?: boolean
}

export function speak(text: string, options: SpeakOptions = {}): void {
  const s = synth()
  if (!s || !text) return
  const { rate = 1.15, pitch = 1.1, interrupt = true } = options
  try {
    if (interrupt) s.cancel()
    if (!jaVoice) jaVoice = pickJapaneseVoice()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'ja-JP'
    utterance.rate = Math.min(2, rate * RATE_FACTOR[prefs.rate])
    // 選んだ性別の声が端末に無いときは、高さで寄せる
    const missing = jaVoice ? voiceGender(jaVoice.name) !== prefs.voice && prefs.voice !== 'auto' : prefs.voice !== 'auto'
    utterance.pitch = missing ? (prefs.voice === 'male' ? 0.7 : 1.35) : pitch
    if (jaVoice) utterance.voice = jaVoice
    s.speak(utterance)
  } catch {
    // 読み上げ失敗はゲーム進行を止めない
  }
}

export function stopSpeaking(): void {
  try {
    synth()?.cancel()
  } catch {
    // noop
  }
}
