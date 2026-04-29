import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
  fetchPlayerRosterMeta,
  fetchPlayerRosterRows,
  type PlayerRosterCacheMeta,
  type PlayerRosterSourceScope
} from '@/services/playerRosterApi'

interface PlayerRosterCacheEntry {
  members: any[]
  meta: PlayerRosterCacheMeta | null
}

interface LoadRosterOptions {
  userId?: string | null
  canEditPlayers: boolean
  force?: boolean
}

const cloneMembers = (rows: any[]) => rows.map((row) => ({
  ...row,
  sibling_ids: Array.isArray(row?.sibling_ids) ? [...row.sibling_ids] : row?.sibling_ids
}))

const normalizeMetaTime = (value: string | null | undefined) => value || ''

const isSameMeta = (left: PlayerRosterCacheMeta | null, right: PlayerRosterCacheMeta | null) =>
  Boolean(left && right) &&
  Number(left?.row_count || 0) === Number(right?.row_count || 0) &&
  normalizeMetaTime(left?.latest_changed_at) === normalizeMetaTime(right?.latest_changed_at)

const getSourceScope = (canEditPlayers: boolean): PlayerRosterSourceScope =>
  canEditPlayers ? 'full' : 'safe'

const getCacheKey = (userId: string | null | undefined, sourceScope: PlayerRosterSourceScope) =>
  `${userId || 'anonymous'}:${sourceScope}`

export const usePlayerRosterStore = defineStore('playerRoster', () => {
  const members = ref<any[]>([])
  const loading = ref(false)
  const checkingVersion = ref(false)
  const error = ref<string | null>(null)
  const meta = ref<PlayerRosterCacheMeta | null>(null)
  const activeCacheKey = ref('')
  const cache = new Map<string, PlayerRosterCacheEntry>()

  const applyCacheEntry = (cacheKey: string, entry: PlayerRosterCacheEntry) => {
    activeCacheKey.value = cacheKey
    members.value = cloneMembers(entry.members)
    meta.value = entry.meta ? { ...entry.meta } : null
  }

  const fetchAndCacheRoster = async (
    cacheKey: string,
    sourceScope: PlayerRosterSourceScope,
    metaOverride?: PlayerRosterCacheMeta | null
  ) => {
    loading.value = true
    error.value = null

    try {
      const rows = await fetchPlayerRosterRows(sourceScope)
      let nextMeta = metaOverride ?? null

      if (!nextMeta) {
        try {
          nextMeta = await fetchPlayerRosterMeta()
        } catch (metaError: any) {
          error.value = metaError?.message || '無法確認球員名單版本'
        }
      }

      const entry: PlayerRosterCacheEntry = {
        members: cloneMembers(rows),
        meta: nextMeta
      }

      cache.set(cacheKey, entry)
      applyCacheEntry(cacheKey, entry)
      return members.value
    } catch (err: any) {
      error.value = err?.message || '無法載入球員名單'
      throw err
    } finally {
      loading.value = false
    }
  }

  const loadRoster = async (options: LoadRosterOptions) => {
    const sourceScope = getSourceScope(options.canEditPlayers)
    const cacheKey = getCacheKey(options.userId, sourceScope)
    const cachedEntry = cache.get(cacheKey)

    if (!cachedEntry || options.force) {
      return fetchAndCacheRoster(cacheKey, sourceScope)
    }

    applyCacheEntry(cacheKey, cachedEntry)
    error.value = null
    checkingVersion.value = true

    try {
      const remoteMeta = await fetchPlayerRosterMeta()

      if (isSameMeta(cachedEntry.meta, remoteMeta)) {
        meta.value = remoteMeta
        cache.set(cacheKey, {
          members: cloneMembers(cachedEntry.members),
          meta: remoteMeta
        })
        return members.value
      }

      return await fetchAndCacheRoster(cacheKey, sourceScope, remoteMeta)
    } catch (err: any) {
      error.value = err?.message || '無法確認球員名單版本，已保留目前快取'
      return members.value
    } finally {
      checkingVersion.value = false
    }
  }

  const refreshRoster = async (options: Omit<LoadRosterOptions, 'force'>) =>
    loadRoster({ ...options, force: true })

  const clearRosterCache = () => {
    cache.clear()
    activeCacheKey.value = ''
    members.value = []
    meta.value = null
    error.value = null
    loading.value = false
    checkingVersion.value = false
  }

  return {
    members,
    loading,
    checkingVersion,
    error,
    meta,
    activeCacheKey,
    loadRoster,
    refreshRoster,
    clearRosterCache
  }
})
