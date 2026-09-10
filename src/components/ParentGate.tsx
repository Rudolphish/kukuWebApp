'use client'

import { useEffect, useState } from 'react'

/**
 * 親画面の入口。
 *
 * PIN は親が忘れる。代わりに小 2 には解けない計算を置く。
 * 目的は防犯ではなく「子どもが迷い込まないこと」なので、この強度で足りる。
 */
export default function ParentGate({ onPass, onCancel }: { onPass: () => void; onCancel: () => void }) {
  /*
   * 問題は描画時ではなくマウント後に決める。
   * 描画中に乱数を使うと、サーバで作った HTML とクライアントの初回描画で
   * 数字が食い違い、hydration が失敗する。
   */
  const [problem, setProblem] = useState<[number, number] | null>(null)
  const [value, setValue] = useState('')
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setProblem([11 + Math.floor(Math.random() * 78), 3 + Math.floor(Math.random() * 7)])
  }, [])

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!problem) return
    if (Number(value) === problem[0] * problem[1]) onPass()
    else {
      setFailed(true)
      setValue('')
    }
  }

  // 問題が決まるまでは何も出さない。一瞬なので画面のちらつきにはならない
  if (!problem) return <main className="app" />
  const [a, b] = problem

  return (
    <main className="app" style={{ justifyContent: 'center', gap: 18 }}>
      <div style={{ textAlign: 'center' }}>
        <div className="label">おうちのひと</div>
        <div style={{ fontSize: 44, fontWeight: 900, marginTop: 14, fontVariantNumeric: 'tabular-nums' }}>
          {a} × {b}
        </div>
      </div>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <input
          autoFocus
          inputMode="numeric"
          pattern="[0-9]*"
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/\D/g, ''))}
          style={{
            padding: '14px 16px',
            borderRadius: 14,
            border: `1px solid ${failed ? 'var(--danger)' : 'var(--line)'}`,
            background: 'var(--panel)',
            fontSize: 28,
            fontWeight: 900,
            textAlign: 'center',
          }}
        />
        <button className="bigButton" type="submit" style={{ fontSize: 20, padding: '16px' }}>
          すすむ
        </button>
        <button type="button" className="subButton" onClick={onCancel}>
          もどる
        </button>
      </form>
    </main>
  )
}
