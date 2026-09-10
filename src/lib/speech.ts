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
  // ja-JP を優先し、無ければ ja で始まるもの。
  return voices.find((v) => v.lang === 'ja-JP') ?? voices.find((v) => v.lang.startsWith('ja')) ?? null
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
    utterance.rate = rate
    utterance.pitch = pitch
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
