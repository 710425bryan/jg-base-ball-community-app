import { defineStore } from 'pinia'
import { ref } from 'vue'
import { matchesApi } from '@/services/matchesApi'
import type { MatchRecord, MatchRecordInput } from '@/types/match'

export const useMatchesStore = defineStore('matches', () => {
  const matches = ref<MatchRecord[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)
  const loadedDetailIds = new Set<string>()

  const mergeMatches = (incoming: MatchRecord[]) => {
    const merged = new Map(matches.value.map((match) => [match.id, match]))

    incoming.forEach((match) => {
      merged.set(match.id, {
        ...merged.get(match.id),
        ...match
      })
    })

    matches.value = [...merged.values()]
  }

  async function fetchMatches() {
    return listMatchesForAdmin()
  }

  async function listMatchesForAdmin() {
    loading.value = true
    error.value = null
    try {
      const data = await matchesApi.listMatchesForAdmin()
      matches.value = data
      data.forEach((match) => loadedDetailIds.add(match.id))
      return data
    } catch (err: any) {
      console.error('Failed to fetch matches:', err)
      error.value = err.message || '無法載入比賽紀錄'
    } finally {
      loading.value = false
    }
  }

  async function fetchDashboardMatches(options: {
    fromDate?: string | null
    beforeDate?: string | null
    upcomingLimit?: number
    recentLimit?: number
  } = {}) {
    loading.value = true
    error.value = null
    try {
      const [upcomingMatches, recentMatches] = await Promise.all([
        matchesApi.listUpcomingMatches(options.upcomingLimit ?? 8, options.fromDate),
        matchesApi.listRecentMatches(options.recentLimit ?? 4, options.beforeDate || options.fromDate)
      ])
      const data = [...upcomingMatches, ...recentMatches]
      mergeMatches(data)
      return data
    } catch (err: any) {
      console.error('Failed to fetch dashboard matches:', err)
      error.value = err.message || '無法載入比賽摘要'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function fetchUpcomingMatches(limit = 8, fromDate?: string | null) {
    loading.value = true
    error.value = null
    try {
      const data = await matchesApi.listUpcomingMatches(limit, fromDate)
      mergeMatches(data)
      return data
    } catch (err: any) {
      console.error('Failed to fetch upcoming matches:', err)
      error.value = err.message || '無法載入近期賽程'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function fetchMatch(id: string, options: { force?: boolean } = {}) {
    if (!options.force && loadedDetailIds.has(id)) {
      const existing = matches.value.find((match) => match.id === id)
      if (existing) return existing
    }

    loading.value = true
    error.value = null
    try {
      const data = await matchesApi.getMatch(id)
      loadedDetailIds.add(id)
      mergeMatches([data])
      return data
    } catch (err: any) {
      console.error('Failed to fetch match:', err)
      error.value = err.message || '無法載入比賽紀錄'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function createMatch(input: MatchRecordInput) {
    loading.value = true
    error.value = null
    try {
      const data = await matchesApi.createMatch(input)
      matches.value.unshift(data) // Optionally sort properly
      loadedDetailIds.add(data.id)
      return data
    } catch (err: any) {
      console.error('Failed to create match:', err)
      error.value = err.message || '新增比賽紀錄失敗'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function updateMatch(id: string, updates: Partial<MatchRecordInput>) {
    loading.value = true
    error.value = null
    try {
      const data = await matchesApi.updateMatch(id, updates)
      const index = matches.value.findIndex(m => m.id === id)
      if (index !== -1) {
        matches.value[index] = data
      }
      loadedDetailIds.add(data.id)
      return data
    } catch (err: any) {
      console.error('Failed to update match:', err)
      error.value = err.message || '更新比賽紀錄失敗'
      throw err
    } finally {
      loading.value = false
    }
  }

  async function deleteMatch(id: string) {
    loading.value = true
    error.value = null
    try {
      await matchesApi.deleteMatch(id)
      matches.value = matches.value.filter(m => m.id !== id)
      loadedDetailIds.delete(id)
    } catch (err: any) {
      console.error('Failed to delete match:', err)
      error.value = err.message || '刪除比賽紀錄失敗'
      throw err
    } finally {
      loading.value = false
    }
  }

  return {
    matches,
    loading,
    error,
    fetchMatches,
    listMatchesForAdmin,
    fetchDashboardMatches,
    fetchUpcomingMatches,
    fetchMatch,
    createMatch,
    updateMatch,
    deleteMatch
  }
})
