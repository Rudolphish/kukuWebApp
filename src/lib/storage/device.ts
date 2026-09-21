import { DEFAULT_DEVICE, type DeviceSettings, type StoryProgress } from './types'

const KEY_DEVICE = 'kuku.device.v1'

/**
 * 端末ごとの設定。リモートへは送らない。
 *
 * 合言葉と持ち主は端末の素性そのものであり、同期すると意味が壊れる。
 * 親の端末の設定が子どもの端末へ流れてきて、子どもの記録が親のものとして
 * 残るような事故を防ぐ。
 */
export function getDeviceSettings(): DeviceSettings {
  if (typeof window === 'undefined') return DEFAULT_DEVICE
  try {
    const raw = window.localStorage.getItem(KEY_DEVICE)
    return raw ? { ...DEFAULT_DEVICE, ...(JSON.parse(raw) as Partial<DeviceSettings>) } : DEFAULT_DEVICE
  } catch {
    return DEFAULT_DEVICE
  }
}

export function saveDeviceSettings(device: DeviceSettings): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(KEY_DEVICE, JSON.stringify({ ...device, familyCode: device.familyCode.trim() }))
  } catch {
    // 保存できなくても、その場のセッションでは動く
  }
}

export function getFamilyCode(): string {
  return getDeviceSettings().familyCode
}

const KEY_STORY = 'kuku.story.v1'

/**
 * ストーリーの進行。エリア id をキーに持つ。
 *
 * 同期しない。進行は子どもの体験そのものなので、
 * 親の端末で先へ進められると意味が壊れる。
 */
export function getStoryProgress(areaId: string): StoryProgress {
  const all = readAll()
  return all[areaId] ?? { progress: 0, current: null, seen: [] }
}

export function saveStoryProgress(areaId: string, progress: StoryProgress): void {
  if (typeof window === 'undefined') return
  try {
    const all = readAll()
    all[areaId] = progress
    window.localStorage.setItem(KEY_STORY, JSON.stringify(all))
  } catch {
    // 保存できなくても、その場の散策は最後まで遊べる
  }
}

function readAll(): Record<string, StoryProgress> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(KEY_STORY)
    return raw ? (JSON.parse(raw) as Record<string, StoryProgress>) : {}
  } catch {
    return {}
  }
}
