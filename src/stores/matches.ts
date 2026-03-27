import { defineStore } from 'pinia'
import { ref } from 'vue'
import { matchesApi } from '@/services/matchesApi'
import type { MatchRecord, MatchRecordInput } from '@/types/match'

export const useMatchesStore = defineStore('matches', () => {
  const matches = ref<MatchRecord[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchMatches() {
    loading.value = true
    error.value = null
    try {
      matches.value = await matchesApi.getMatches()
    } catch (err: any) {
      console.error('Failed to fetch matches:', err)
      error.value = err.message || '無法載入比賽紀錄'
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
    createMatch,
    updateMatch,
    deleteMatch
  }
})
