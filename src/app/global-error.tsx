'use client'

import ErrorScreen from '@/components/ErrorScreen'
import './globals.css'

/** レイアウトごと落ちたとき用。html と body を自分で持つ必要がある */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="ja">
      <body>
        <ErrorScreen error={error} reset={reset} />
      </body>
    </html>
  )
}
