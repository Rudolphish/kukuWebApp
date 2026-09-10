import { DEFAULT_DEVICE, type DeviceSettings } from './types'

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
