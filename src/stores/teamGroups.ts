import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  createTeamGroupSetting,
  deleteTeamGroupSetting,
  fetchTeamGroupSettings,
  reorderTeamGroupSettings,
  updateTeamGroupSetting
} from '@/services/teamGroupsApi'
import type { DeleteTeamGroupResult, TeamGroupSetting } from '@/types/teamGroup'
import { decorateTeamGroupSettings, defaultTeamGroupSettings } from '@/utils/teamGroups'

export const useTeamGroupsStore = defineStore('teamGroups', () => {
  const groups = ref<TeamGroupSetting[]>([])
  const loading = ref(false)
  const saving = ref(false)
  const error = ref<string | null>(null)
  const loaded = ref(false)

  const options = computed(() =>
    decorateTeamGroupSettings(groups.value.length > 0 ? groups.value : defaultTeamGroupSettings)
  )

  const loadGroups = async (options: { force?: boolean } = {}) => {
    if (loaded.value && !options.force) return groups.value

    loading.value = true
    error.value = null
    try {
      groups.value = await fetchTeamGroupSettings()
      loaded.value = true
      return groups.value
    } catch (err: any) {
      error.value = err?.message || '無法載入所屬群組設定'
      throw err
    } finally {
      loading.value = false
    }
  }

  const refreshGroups = () => loadGroups({ force: true })

  const createGroup = async (name: string) => {
    saving.value = true
    try {
      await createTeamGroupSetting(name)
      await refreshGroups()
    } finally {
      saving.value = false
    }
  }

  const updateGroup = async (id: string, name: string) => {
    saving.value = true
    try {
      await updateTeamGroupSetting(id, name)
      await refreshGroups()
    } finally {
      saving.value = false
    }
  }

  const deleteGroup = async (id: string, transferToId?: string | null): Promise<DeleteTeamGroupResult> => {
    saving.value = true
    try {
      const result = await deleteTeamGroupSetting(id, transferToId)
      await refreshGroups()
      return result
    } finally {
      saving.value = false
    }
  }

  const reorderGroups = async (groupIds: string[]) => {
    saving.value = true
    try {
      groups.value = await reorderTeamGroupSettings(groupIds)
      loaded.value = true
      return groups.value
    } finally {
      saving.value = false
    }
  }

  return {
    groups,
    options,
    loading,
    saving,
    error,
    loaded,
    loadGroups,
    refreshGroups,
    createGroup,
    updateGroup,
    deleteGroup,
    reorderGroups
  }
})
