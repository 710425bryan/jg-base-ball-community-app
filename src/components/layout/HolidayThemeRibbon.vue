<template>
  <div
    v-if="shouldShowRibbon"
    data-test="holiday-theme-ribbon"
    class="relative z-[47] w-full shrink-0 overflow-hidden px-4 py-2.5 text-white"
    :style="ribbonStyle"
  >
    <div class="absolute inset-0 pointer-events-none opacity-80" :style="ribbonGlowStyle"></div>

    <div class="relative mx-auto flex max-w-7xl items-center justify-between gap-3">
      <div class="min-w-0 flex items-center gap-2.5">
        <el-icon class="shrink-0 text-lg opacity-95"><StarFilled /></el-icon>
        <div class="min-w-0 flex flex-col sm:flex-row sm:items-center sm:gap-2">
          <span data-test="holiday-theme-ribbon-title" class="truncate font-black tracking-wide">
            {{ currentRibbonTitle }}
          </span>
          <transition name="holiday-ribbon-message" mode="out-in">
            <span
              :key="currentRibbonMessageKey"
              data-test="holiday-theme-ribbon-message"
              class="truncate text-sm text-white/85"
            >
              {{ currentRibbonMessage }}
            </span>
          </transition>
        </div>
      </div>

      <button
        type="button"
        data-test="holiday-theme-ribbon-close"
        class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/90 transition-colors hover:bg-white/12 hover:text-white"
        @click="dismissRibbon"
      >
        <el-icon><Close /></el-icon>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { Close, StarFilled } from '@element-plus/icons-vue'

import { useHolidayTheme } from '@/composables/useHolidayTheme'

const DISMISSED_THEME_STORAGE_KEY = 'jg_holiday_ribbon_dismissed_token'
const RIBBON_ROTATION_INTERVAL_MS = 4500

const dismissedToken = ref('')
const currentMessageIndex = ref(0)
const prefersReducedMotion = ref(false)
const { holidayTheme } = useHolidayTheme()

let rotationTimer: ReturnType<typeof setInterval> | null = null
let reducedMotionQuery: MediaQueryList | null = null

const readDismissedToken = () => {
  if (typeof window === 'undefined') return ''
  return window.localStorage.getItem(DISMISSED_THEME_STORAGE_KEY) || ''
}

const currentRibbonTitle = computed(() => {
  const customTitle =
    typeof holidayTheme.value.ribbonTitle === 'string'
      ? holidayTheme.value.ribbonTitle.trim()
      : ''
  const baseLabel =
    typeof holidayTheme.value.label === 'string'
      ? holidayTheme.value.label.trim()
      : ''

  if (customTitle) return customTitle
  if (!baseLabel) return ''
  if (baseLabel.endsWith('祝福')) return baseLabel
  return `${baseLabel}祝福`
})

const ribbonMessages = computed(() => {
  const messageSource =
    Array.isArray(holidayTheme.value.ribbonMessages) && holidayTheme.value.ribbonMessages.length
      ? holidayTheme.value.ribbonMessages
      : holidayTheme.value.messages

  return Array.isArray(messageSource)
    ? messageSource.filter((message) => typeof message === 'string' && message.trim())
    : []
})

const currentRibbonMessage = computed(() => {
  return (
    ribbonMessages.value[currentMessageIndex.value] ||
    ribbonMessages.value[0] ||
    holidayTheme.value.ribbonMessage
  )
})

const currentRibbonMessageKey = computed(() => {
  return `${holidayTheme.value.token}:${currentMessageIndex.value}`
})

const shouldShowRibbon = computed(() => {
  return (
    holidayTheme.value.enabled &&
    holidayTheme.value.showGlobalRibbon &&
    currentRibbonTitle.value &&
    currentRibbonMessage.value &&
    dismissedToken.value !== holidayTheme.value.token
  )
})

const ribbonStyle = computed(() => ({
  background: `linear-gradient(90deg, ${holidayTheme.value.paletteValues?.ribbonFrom || '#7c3aed'}, ${holidayTheme.value.paletteValues?.ribbonTo || '#4338ca'})`,
}))

const ribbonGlowStyle = computed(() => ({
  background: `radial-gradient(circle at left center, ${holidayTheme.value.paletteValues?.glow || 'rgba(255,255,255,0.18)'}, transparent 58%)`,
}))

const dismissRibbon = () => {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(DISMISSED_THEME_STORAGE_KEY, holidayTheme.value.token)
  dismissedToken.value = holidayTheme.value.token
}

const updateReducedMotionPreference = () => {
  prefersReducedMotion.value = reducedMotionQuery?.matches ?? false
}

const stopRotation = () => {
  if (!rotationTimer) return
  clearInterval(rotationTimer)
  rotationTimer = null
}

const startRotation = () => {
  stopRotation()

  if (
    prefersReducedMotion.value ||
    !holidayTheme.value.enabled ||
    !holidayTheme.value.showGlobalRibbon ||
    ribbonMessages.value.length <= 1
  ) {
    return
  }

  rotationTimer = setInterval(() => {
    currentMessageIndex.value = (currentMessageIndex.value + 1) % ribbonMessages.value.length
  }, RIBBON_ROTATION_INTERVAL_MS)
}

watch(
  () => holidayTheme.value.token,
  () => {
    dismissedToken.value = readDismissedToken()
    currentMessageIndex.value = 0
    startRotation()
  },
  { immediate: true }
)

watch(
  () => prefersReducedMotion.value,
  () => {
    currentMessageIndex.value = 0
    startRotation()
  }
)

onMounted(() => {
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    updateReducedMotionPreference()
    reducedMotionQuery.addEventListener?.('change', updateReducedMotionPreference)
  }

  dismissedToken.value = readDismissedToken()
  currentMessageIndex.value = 0
  startRotation()
})

onUnmounted(() => {
  stopRotation()
  reducedMotionQuery?.removeEventListener?.('change', updateReducedMotionPreference)
})
</script>

<style scoped>
.holiday-ribbon-message-enter-active,
.holiday-ribbon-message-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}

.holiday-ribbon-message-enter-from,
.holiday-ribbon-message-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

@media (prefers-reduced-motion: reduce) {
  .holiday-ribbon-message-enter-active,
  .holiday-ribbon-message-leave-active {
    transition: none !important;
  }
}
</style>
