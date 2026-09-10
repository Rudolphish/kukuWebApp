import type { Metadata, Viewport } from 'next'
import AppProvider from '@/components/AppProvider'
import ServiceWorker from '@/components/ServiceWorker'
import ThemeStyle from '@/components/ThemeStyle'
import './globals.css'

/**
 * 名前とアイコンは完全にゲーム側へ振る。
 * 「勉強」「ドリル」「学習」という語を画面のどこにも出さない。
 */
export const metadata: Metadata = {
  title: '九九バトル',
  applicationName: '九九バトル',
  description: 'たたかって、つよくなる。',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: '九九バトル',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: '/icon-192.png',
    apple: '/apple-touch-icon.png',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  // ホーム画面から起動したときにノッチ下まで背景を回り込ませる
  viewportFit: 'cover',
  themeColor: '#0d1a12',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <AppProvider>
          <ThemeStyle />
          <ServiceWorker />
          {children}
        </AppProvider>
      </body>
    </html>
  )
}
