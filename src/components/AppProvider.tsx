'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { getStore, supabaseConfigured } from '@/lib/storage'
import { getDeviceSettings, saveDeviceSettings } from '@/lib/storage/device'
import { checkStories, readCachedStories, type StoryCheck, type StoryOrder } from '@/lib/storage/stories'
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
  /** 子どもが注文した話。端末に残っている分を先に出し、裏で取り直す */
  stories: StoryOrder[]
  refreshStories: () => Promise<void>
  /** 話の一覧を最後に取りに行った結果。null は未実行 */
  storyCheck: StoryCheck | null
  /** 話の一覧を取りに行っている最中か */
  checkingStories: boolean
  setStories: (next: StoryOrder[]) => void
  updateSettings: (patch: Partial<SharedSettings>) => Promise<void>
  updateDevice: (patch: Partial<DeviceSettings>) => void
  syncNow: () => Promise<SyncOutcome>
}

const AppContext = createContext<AppContextValue | null>(null)

/** 注文の待ち中に、できあがりを見に行く間隔 */
const STORY_POLL_MS = 60_000

export default function AppProvider({ children }: { children: React.ReactNode }) {
  const store = useMemo(() => getStore(), [])
  const [settings, setSettings] = useState<SharedSettings>(DEFAULT_SETTINGS)
  const [device, setDevice] = useState<DeviceSettings>(DEFAULT_DEVICE)
  const [ready, setReady] = useState(false)
  const [lastSync, setLastSync] = useState<SyncOutcome | null>(null)
  const [stories, setStories] = useState<StoryOrder[]>([])
  const [storyCheck, setStoryCheck] = useState<StoryCheck | null>(null)
  const [checkingStories, setCheckingStories] = useState(false)
  /** 話の取り直しも重ねない。ボタンの連打と定期の取り直しがぶつかる */
  const checking = useRef(false)
  /** 同期が重ならないようにする。復帰のたびに走ると無駄な往復が増える */
  const syncing = useRef(false)

  const reload = useCallback(async () => {
    const loaded = await store.getSettings()
    setSettings(loaded)
  }, [store])

  const refreshStories = useCallback(async () => {
    if (checking.current) return
    checking.current = true
    setCheckingStories(true)
    try {
      const { stories: next, check } = await checkStories()
      setStories(next)
      setStoryCheck(check)
    } finally {
      checking.current = false
      setCheckingStories(false)
    }
  }, [])

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
    // 端末に残っている分を先に出す。通信を待たせない
    setStories(readCachedStories())
    store.getSettings().then((loaded) => {
      if (cancelled) return
      setSettings(loaded)
      setReady(true)
      void syncNow()
      void refreshStories()
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
      if (document.visibilityState !== 'visible') return
      void syncNow()
      // 戻ってきたときに、できあがった話を取りに行く
      void refreshStories()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [syncNow, refreshStories])

  /*
   * 注文が待ちのあいだは、画面を開いたままでも取りに行く。
   * 子どもは注文したあとアプリを閉じずに遊び続けるので、復帰の合図だけでは
   * できあがった話がいつまでも「つくっているところ」のまま残る。
   * 待ちが無いときは何もしない。通信は見えている間だけ。
   */
  const waiting = stories.some((s) => s.status === 'ordered')
  useEffect(() => {
    if (!supabaseConfigured || !waiting) return
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refreshStories()
    }, STORY_POLL_MS)
    return () => window.clearInterval(timer)
  }, [waiting, refreshStories])

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
      stories,
      refreshStories,
      storyCheck,
      checkingStories,
      setStories,
      updateSettings,
      updateDevice,
      syncNow,
    }),
    [
      settings,
      device,
      ready,
      store,
      lastSync,
      stories,
      refreshStories,
      storyCheck,
      checkingStories,
      updateSettings,
      updateDevice,
      syncNow,
    ],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside AppProvider')
  return ctx
}
