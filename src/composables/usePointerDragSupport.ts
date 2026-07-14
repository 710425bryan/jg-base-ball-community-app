import { onMounted, onUnmounted, ref } from 'vue'

const POINTER_DRAG_MEDIA_QUERY = '(hover: hover) and (pointer: fine)'

export const usePointerDragSupport = () => {
  const isSupported = ref(false)
  let mediaQuery: MediaQueryList | null = null

  const handleCapabilityChange = (event: MediaQueryListEvent) => {
    isSupported.value = event.matches
  }

  onMounted(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return

    mediaQuery = window.matchMedia(POINTER_DRAG_MEDIA_QUERY)
    isSupported.value = mediaQuery.matches

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleCapabilityChange)
    } else {
      mediaQuery.addListener(handleCapabilityChange)
    }
  })

  onUnmounted(() => {
    if (!mediaQuery) return

    if (typeof mediaQuery.removeEventListener === 'function') {
      mediaQuery.removeEventListener('change', handleCapabilityChange)
    } else {
      mediaQuery.removeListener(handleCapabilityChange)
    }
  })

  return isSupported
}
