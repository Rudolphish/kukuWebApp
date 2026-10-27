'use client'

import { useEffect, useState } from 'react'
import { useApp } from './AppProvider'
import { primeSpeech, speak, stopSpeaking, voiceMissing } from '@/lib/speech'
import type { SpeechRate, SpeechVoice } from '@/lib/storage/types'

const RATES: [SpeechRate, string][] = [
  ['slow', 'ゆっくり'],
  ['normal', 'ふつう'],
  ['fast', 'はやい'],
]
const VOICES: [SpeechVoice, string][] = [
  ['auto', 'おまかせ'],
  ['female', 'おんなの ひと'],
  ['male', 'おとこの ひと'],
]

/**
 * 読み上げの設定。お話の画面と親画面の両方に置く。
 * 子どもも触るので、言葉はひらがなで書く。
 */
export default function SpeechSettings() {
  const { device, updateDevice } = useApp()
  const [missing, setMissing] = useState(false)

  // 声の一覧は端末から非同期に届くので、描画のあとで確かめる
  useEffect(() => {
    setMissing(voiceMissing(device.speechVoice ?? 'auto'))
  }, [device.speechVoice])

  function tryIt() {
    primeSpeech()
    // 設定を反映してから鳴らす（AppProvider の反映は次の描画のあと）
    setTimeout(() => speak('こんにちは。この こえで よむよ。'), 50)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Row label="よみあげ">
        {([true, false] as const).map((on) => (
          <button
            key={String(on)}
            className="chip"
            data-selected={device.voice === on}
            onClick={() => {
              if (!on) stopSpeaking()
              updateDevice({ voice: on })
            }}
          >
            {on ? '🔊 する' : '🔇 しない'}
          </button>
        ))}
      </Row>
      {device.voice && (
        <>
          <Row label="はやさ">
            {RATES.map(([value, label]) => (
              <button
                key={value}
                className="chip"
                data-selected={(device.speechRate ?? 'normal') === value}
                onClick={() => updateDevice({ speechRate: value })}
              >
                {label}
              </button>
            ))}
          </Row>
          <Row label="こえ">
            {VOICES.map(([value, label]) => (
              <button
                key={value}
                className="chip"
                data-selected={(device.speechVoice ?? 'auto') === value}
                onClick={() => updateDevice({ speechVoice: value })}
              >
                {label}
              </button>
            ))}
          </Row>
          {missing && (
            <p className="muted" style={{ fontSize: 12, lineHeight: 1.6, margin: 0 }}>
              この たんまつには その こえが ないので、こえの たかさを かえて よむよ。
            </p>
          )}
          <button className="subButton" style={{ alignSelf: 'flex-start', fontSize: 13 }} onClick={tryIt}>
            ためしに きく
          </button>
        </>
      )}
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="label" style={{ marginBottom: 6 }}>
        {label}
      </div>
      <div className="chipRow">{children}</div>
    </div>
  )
}

/**
 * お話の画面の右上に置くボタン。押すと読み上げの設定が開く。
 * 画面のタップで話が進むので、ここでのタップは外へ伝えない。
 */
export function SpeechButton() {
  const { device } = useApp()
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        className="subButton"
        style={{ padding: '6px 10px', fontSize: 15 }}
        aria-label="よみあげの せってい"
        onClick={(e) => {
          e.stopPropagation()
          setOpen(true)
        }}
      >
        {device.voice ? '🔊' : '🔇'}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="よみあげの せってい"
          onClick={(e) => {
            e.stopPropagation()
            setOpen(false)
          }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 50,
            background: 'rgba(0,0,0,0.55)',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            className="panel"
            onClick={(e) => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 440, display: 'flex', flexDirection: 'column', gap: 14 }}
          >
            <SpeechSettings />
            <button className="bigButton" style={{ fontSize: 20 }} onClick={() => setOpen(false)}>
              とじる
            </button>
          </div>
        </div>
      )}
    </>
  )
}
