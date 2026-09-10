'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { getStore } from '@/lib/storage'
import { DEFAULT_SETTINGS, type Settings, type Store } from '@/lib/storage/types'
import { getTheme, type Theme } from '@/lib/themes'

type AppContextValue = {
  settings: Settings
  theme: Theme
  /** 設定が localStorage から読めたか。読めるまで記録を 0 として描かない */
  ready: boolean
  store: Store
  updateSettings: (patch: Partial<Settings>) => Promise<void>
}

const AppContext = createContext<AppContextValue | null>(null)

export default function AppProvider({ children }: { children: React.ReactNode }) {
  const store = useMemo(() => getStore(), [])
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    store.getSettings().then((loaded) => {
      if (cancelled) return
      setSettings(loaded)
      setReady(true)
    })
    return () => {
      cancelled = true
    }
  }, [store])

  const updateSettings = useCallback(
    async (patch: Partial<Settings>) => {
      // 画面を先に更新してから保存する。設定画面での操作が引っかからない方を優先する。
      const next = { ...settings, ...patch }
      setSettings(next)
      await store.saveSettings(next)
    },
    [settings, store],
  )

  const value = useMemo<AppContextValue>(
    () => ({ settings, theme: getTheme(settings.themeId), ready, store, updateSettings }),
    [settings, ready, store, updateSettings],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside AppProvider')
  return ctx
}
