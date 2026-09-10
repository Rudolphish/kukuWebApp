'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { getStore, supabaseConfigured } from '@/lib/storage'
import { getDeviceSettings, saveDeviceSettings } from '@/lib/storage/device'
import {
  DEFAULT_DEVICE,
  DEFAULT_SETTINGS,
  type DeviceSettings,
  type SharedSettings,
  type Store,
  type SyncOutcome,
} from '@/lib/storage/types'
import { getTheme, type Theme } from '@/lib/themes'

type AppContextValue = {
  /** 家族で共有する設定。Supabase が有効なら端末間で同期される */
  settings: SharedSettings
  /** この端末だけの設定 */
  device: DeviceSettings
  theme: Theme
  /** 設定が読めたか。読めるまで記録を 0 として描かない */
  ready: boolean
  store: Store
  /** 直近の同期結果。null は未実行 */
  lastSync: SyncOutcome | null
  updateSettings: (patch: Partial<SharedSettings>) => Promise<void>
  updateDevice: (patch: Partial<DeviceSettings>) => void
  syncNow: () => Promise<SyncOutcome>
}

const AppContext = createContext<AppContextValue | null>(null)

export default function AppProvider({ children }: { children: React.ReactNode }) {
  const store = useMemo(() => getStore(), [])
  const [settings, setSettings] = useState<SharedSettings>(DEFAULT_SETTINGS)
  const [device, setDevice] = useState<DeviceSettings>(DEFAULT_DEVICE)
  const [ready, setReady] = useState(false)
  const [lastSync, setLastSync] = useState<SyncOutcome | null>(null)
  /** 同期が重ならないようにする。復帰のたびに走ると無駄な往復が増える */
  const syncing = useRef(false)

  const reload = useCallback(async () => {
    const loaded = await store.getSettings()
    setSettings(loaded)
  }, [store])

  const syncNow = useCallback(async () => {
    if (syncing.current) return lastSync ?? { ok: false as const, reason: 'failed' as const }
    syncing.current = true
    try {
      const outcome = await store.sync()
      setLastSync(outcome)
      // 同期でリモートの設定を取り込んでいることがあるので読み直す
      if (outcome.ok) await reload()
      return outcome
    } finally {
      syncing.current = false
    }
  }, [store, reload, lastSync])

  useEffect(() => {
    let cancelled = false
    setDevice(getDeviceSettings())
    store.getSettings().then((loaded) => {
      if (cancelled) return
      setSettings(loaded)
      setReady(true)
      void syncNow()
    })
    return () => {
      cancelled = true
    }
    // 起動時に 1 度だけ走らせる
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store])

  // 端末に戻ってきたときに、相手の記録を取りに行く
  useEffect(() => {
    if (!supabaseConfigured) return
    const onVisible = () => {
      if (document.visibilityState === 'visible') void syncNow()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [syncNow])

  const updateSettings = useCallback(
    async (patch: Partial<SharedSettings>) => {
      // 画面を先に更新してから保存する。設定画面での操作が引っかからない方を優先する。
      const next = { ...settings, ...patch }
      setSettings(next)
      await store.saveSettings(next)
    },
    [settings, store],
  )

  const updateDevice = useCallback(
    (patch: Partial<DeviceSettings>) => {
      const next = { ...device, ...patch }
      setDevice(next)
      saveDeviceSettings(next)
    },
    [device],
  )

  const value = useMemo<AppContextValue>(
    () => ({
      settings,
      device,
      theme: getTheme(settings.themeId),
      ready,
      store,
      lastSync,
      updateSettings,
      updateDevice,
      syncNow,
    }),
    [settings, device, ready, store, lastSync, updateSettings, updateDevice, syncNow],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside AppProvider')
  return ctx
}
