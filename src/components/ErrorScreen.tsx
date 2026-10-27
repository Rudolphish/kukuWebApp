'use client'

/**
 * 画面が開けなかったときに出す。真っ白や英語のエラーで止めない。
 *
 * 「もういちど ひらく」は、端末に残っている古い部品（Service Worker のキャッシュ）を
 * 消してから開き直す。更新の直後に古い部品と食い違うのが、いちばんありそうな原因のため。
 * 記録や設定（localStorage）は消さない。
 *
 * 何が起きたかを親が伝えられるように、エラーの文を小さく出す。
 */
export default function ErrorScreen({ error, reset }: { error: Error & { digest?: string }; reset?: () => void }) {
  async function reopen() {
    try {
      if ('caches' in window) {
        const keys = await caches.keys()
        await Promise.all(keys.map((k) => caches.delete(k)))
      }
      const regs = await navigator.serviceWorker?.getRegistrations?.()
      await Promise.all((regs ?? []).map((r) => r.update().catch(() => undefined)))
    } catch {
      // 消せなくても開き直しは試す
    }
    if (reset) reset()
    window.location.reload()
  }

  return (
    <main className="app" style={{ justifyContent: 'center', gap: 16, padding: 24 }}>
      <p style={{ fontSize: 20, fontWeight: 900, margin: 0, textAlign: 'center' }}>うまく ひらけなかったよ</p>
      <button className="bigButton" onClick={() => void reopen()}>
        もういちど ひらく
      </button>
      <button className="subButton" onClick={() => window.location.assign('/')}>
        ホームへ
      </button>
      <p className="muted" style={{ fontSize: 11, lineHeight: 1.6, margin: 0, wordBreak: 'break-all' }}>
        おうちのひとへ: なおらないときは、この文を伝えてください。
        <br />
        {error.name}: {error.message}
        {error.digest ? ` (${error.digest})` : ''}
        <br />
        {typeof window !== 'undefined' ? window.location.pathname : ''}
      </p>
    </main>
  )
}
