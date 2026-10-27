'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useApp } from '@/components/AppProvider'
import { parseJoinHash } from '@/lib/join'
import { supabaseConfigured } from '@/lib/storage'

/**
 * 親画面の QR から開かれる入口。
 *
 * 合言葉は URL の # 以降で届く。読んだらすぐアドレスバーから消し、
 * 履歴や共有メニュー経由で合言葉が残らないようにする。
 *
 * 書き込みは「つなぐ」を押してから行う。親が自分の端末で誤って読み取ったときに、
 * 持ち主が「子ども」に書き換わる事故を避けるため。
 */
export default function JoinPage() {
  const router = useRouter()
  const { device, ready, updateDevice, syncNow, refreshStories } = useApp()
  const [code, setCode] = useState<string | null | undefined>(undefined)
  const [standalone, setStandalone] = useState(true)

  useEffect(() => {
    setCode(parseJoinHash(window.location.hash))
    window.history.replaceState(null, '', window.location.pathname)
    setStandalone(
      window.matchMedia('(display-mode: standalone)').matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true,
    )
  }, [])

  async function join() {
    if (!code) return
    updateDevice({ familyCode: code, role: 'child' })
    await syncNow()
    await refreshStories()
    router.replace('/')
  }

  if (code === undefined || !ready) return <main className="app" />

  const replacing = device.familyCode !== '' && device.familyCode !== code
  const already = device.familyCode === code && device.role === 'child'

  return (
    <main className="app" style={{ gap: 16 }}>
      <section className="panel">
        <div className="label">この端末をつなぐ</div>

        {!code || !supabaseConfigured ? (
          <p style={{ fontSize: 13, lineHeight: 1.7, margin: '8px 0 12px' }}>
            {!code
              ? '合言葉を読み取れませんでした。親画面で QR を出し直してください。'
              : 'このアプリには記録を共有する設定がないため、つなぐ必要はありません。'}
          </p>
        ) : already ? (
          <p style={{ fontSize: 13, lineHeight: 1.7, margin: '8px 0 12px' }}>
            この端末は、すでにこの合言葉で「子どもの端末」としてつながっています。
          </p>
        ) : (
          <>
            <p style={{ fontSize: 13, lineHeight: 1.7, margin: '8px 0 12px' }}>
              この端末を「子どもの端末」として、家族の合言葉でつなぎます。この端末で遊んだ記録は子どものものとして残ります。
            </p>
            {replacing && (
              <p style={{ fontSize: 12, lineHeight: 1.7, margin: '0 0 12px', color: 'var(--danger)' }}>
                この端末にはすでに別の合言葉が入っています。つなぐと置き換わります。
              </p>
            )}
            {device.role === 'parent' && (
              <p style={{ fontSize: 12, lineHeight: 1.7, margin: '0 0 12px', color: 'var(--danger)' }}>
                この端末はいま「おうちのひとの端末」です。つなぐと「子どもの端末」に変わります。
              </p>
            )}
            <button className="subButton" style={{ width: '100%', borderColor: 'var(--accent)' }} onClick={() => void join()}>
              つなぐ
            </button>
          </>
        )}

        {!standalone && (
          <p className="muted" style={{ fontSize: 12, lineHeight: 1.7, margin: '12px 0 0' }}>
            いまはブラウザで開いています。ホーム画面に追加したアプリとブラウザでは、保存場所が別になることがあります。
            ホーム画面のアプリで合言葉が入っていなければ、親画面から入れ直してください。
          </p>
        )}
      </section>

      <button className="subButton" onClick={() => router.replace('/')}>
        ホームへ
      </button>
    </main>
  )
}
