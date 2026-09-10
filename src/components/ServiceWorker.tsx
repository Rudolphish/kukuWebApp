'use client'

import { useEffect } from 'react'

/** オフラインでも開けるようにする。電波の無い場所で開かないアプリは、それだけで習慣にならない。 */
export default function ServiceWorker() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    if (process.env.NODE_ENV !== 'production') return
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // 登録失敗はオンラインでの動作に影響しない
    })
  }, [])
  return null
}
