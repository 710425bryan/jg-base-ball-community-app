import { computed, ref } from 'vue'
import { useMatchesStore } from '@/stores/matches'
import { usePermissionsStore } from '@/stores/permissions'
import { isMatchCancelled } from '@/utils/matchPresentation'

export function useMatchStatusDialogs() {
  const matchesStore = useMatchesStore()
  const permissionsStore = usePermissionsStore()
  const cancelDialogVisible = ref(false)
  const restoreDialogVisible = ref(false)
  const cancelMatchId = ref<string | null>(null)
  const restoreMatchId = ref<string | null>(null)
  const cancellationMatch = computed(() => matchesStore.matches.find(match => match.id === cancelMatchId.value) || null)
  const restorationMatch = computed(() => matchesStore.matches.find(match => match.id === restoreMatchId.value) || null)

  const handleCancelMatch = (id: string) => {
    const match = matchesStore.matches.find(item => item.id === id)
    if (!permissionsStore.can('matches', 'EDIT') || !match || isMatchCancelled(match) || match.match_level === '特訓課') return
    cancelMatchId.value = id
    restoreDialogVisible.value = false
    cancelDialogVisible.value = true
  }
  const handleRestoreMatch = (id: string) => {
    const match = matchesStore.matches.find(item => item.id === id)
    if (!permissionsStore.can('matches', 'EDIT') || !match || !isMatchCancelled(match) || match.match_level === '特訓課') return
    restoreMatchId.value = id
    cancelDialogVisible.value = false
    restoreDialogVisible.value = true
  }
  return { cancelDialogVisible, restoreDialogVisible, cancellationMatch, restorationMatch, handleCancelMatch, handleRestoreMatch }
}
