import { ref } from 'vue'

const STORAGE_KEY = 'jg-baseball:readable-text-mode'
const READABLE_TEXT_CLASS = 'app-readable-text-mode'

const isReadableTextMode = ref(false)
let isInitialized = false
let isStorageListenerRegistered = false

const getStoredPreference = () => {
  if (typeof window === 'undefined') return false

  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

const applyReadableTextModeClass = () => {
  if (typeof document === 'undefined') return

  const appElement = document.getElementById('app')
  appElement?.classList.toggle(READABLE_TEXT_CLASS, isReadableTextMode.value)
  document.documentElement.classList.toggle(READABLE_TEXT_CLASS, isReadableTextMode.value)
  document.body?.classList.toggle(READABLE_TEXT_CLASS, isReadableTextMode.value)
}

const persistPreference = () => {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(STORAGE_KEY, isReadableTextMode.value ? '1' : '0')
  } catch {
    // The mode still applies for the current session if storage is unavailable.
  }
}

const handleStorageChange = (event: StorageEvent) => {
  if (event.key !== STORAGE_KEY) return

  isReadableTextMode.value = event.newValue === '1'
  applyReadableTextModeClass()
}

const registerStorageListener = () => {
  if (
    typeof window === 'undefined' ||
    isStorageListenerRegistered
  ) {
    return
  }

  window.addEventListener('storage', handleStorageChange)
  isStorageListenerRegistered = true
}

const initializeReadableTextMode = () => {
  if (!isInitialized) {
    isReadableTextMode.value = getStoredPreference()
    isInitialized = true
    registerStorageListener()
  }

  applyReadableTextModeClass()
}

const setReadableTextMode = (enabled: boolean) => {
  initializeReadableTextMode()
  isReadableTextMode.value = enabled
  persistPreference()
  applyReadableTextModeClass()
}

const toggleReadableTextMode = () => {
  setReadableTextMode(!isReadableTextMode.value)
}

export const useReadableTextMode = () => ({
  isReadableTextMode,
  initializeReadableTextMode,
  setReadableTextMode,
  toggleReadableTextMode
})
