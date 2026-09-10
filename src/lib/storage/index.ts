import { LocalStore } from './local'
import { SupabaseStore, supabaseConfigured } from './supabase'
import type { Store } from './types'

let instance: Store | null = null

/**
 * 保存層を 1 つだけ作って使い回す。
 * Supabase の環境変数が両方あればリモート同期つき、無ければ端末内で完結。
 */
export function getStore(): Store {
  if (!instance) instance = supabaseConfigured ? new SupabaseStore() : new LocalStore()
  return instance
}

export { supabaseConfigured }
export * from './types'
export { computeBests, computeFactStats, findBest, isBetter } from './local'
