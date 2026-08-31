import { onBeforeUnmount, onMounted, toValue, type MaybeRefOrGetter } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'

type UnsavedChangesGuard = {
  isDirty: MaybeRefOrGetter<boolean>
  confirmDiscard: () => Promise<boolean>
}

let activeGuard: UnsavedChangesGuard | null = null
let navigationBypassDepth = 0

const isNavigationBypassed = () => navigationBypassDepth > 0

const isGuardDirty = (guard: UnsavedChangesGuard | null) =>
  Boolean(guard && toValue(guard.isDirty))

export const confirmActiveUnsavedChanges = async () => {
  if (isNavigationBypassed() || !isGuardDirty(activeGuard)) {
    return true
  }

  return activeGuard!.confirmDiscard()
}

export const withUnsavedChangesNavigationBypass = async <T>(action: () => Promise<T>) => {
  navigationBypassDepth += 1

  try {
    return await action()
  } finally {
    navigationBypassDepth -= 1
  }
}

export const runWithUnsavedChangesConfirmation = async (action: () => Promise<void>) => {
  const shouldContinue = await confirmActiveUnsavedChanges()
  if (!shouldContinue) {
    return false
  }

  await withUnsavedChangesNavigationBypass(action)
  return true
}

export const useUnsavedChangesGuard = ({
  isDirty,
  confirmDiscard
}: UnsavedChangesGuard) => {
  let activeConfirmation: Promise<boolean> | null = null

  const confirmDiscardOnce = () => {
    if (!activeConfirmation) {
      activeConfirmation = Promise.resolve(confirmDiscard()).finally(() => {
        activeConfirmation = null
      })
    }

    return activeConfirmation
  }

  const guard = { isDirty, confirmDiscard: confirmDiscardOnce }

  const canLeave = async () => {
    if (isNavigationBypassed() || !isGuardDirty(guard)) {
      return true
    }

    return confirmDiscardOnce()
  }

  const handleBeforeUnload = (event: BeforeUnloadEvent) => {
    if (isNavigationBypassed() || !isGuardDirty(guard)) {
      return
    }

    event.preventDefault()
    event.returnValue = ''
  }

  onBeforeRouteLeave(canLeave)

  onMounted(() => {
    activeGuard = guard
    window.addEventListener('beforeunload', handleBeforeUnload)
  })

  onBeforeUnmount(() => {
    if (activeGuard === guard) {
      activeGuard = null
    }
    window.removeEventListener('beforeunload', handleBeforeUnload)
  })

  return { canLeave }
}
