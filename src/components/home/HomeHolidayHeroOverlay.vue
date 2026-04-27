<template>
  <div
    v-if="resolvedTheme.enabled"
    data-test="holiday-hero-overlay"
    class="absolute inset-0 z-10 overflow-hidden pointer-events-none"
    :style="themeCssVars"
  >
    <div class="absolute inset-0 holiday-overlay-backdrop"></div>
    <div class="absolute -top-20 left-[12%] h-52 w-52 rounded-full blur-3xl opacity-70 holiday-glow-orb"></div>
    <div class="absolute top-[18%] right-[8%] h-40 w-40 rounded-full blur-3xl opacity-40 holiday-soft-orb"></div>

    <div class="absolute inset-0">
      <div
        v-for="batch in decorativeBatches"
        :key="batch.id"
        class="absolute inset-0 holiday-layout-batch"
        :class="`holiday-layout-batch--${batch.phase}`"
        data-test="holiday-hero-batch"
        :data-batch-phase="batch.phase"
      >
        <template v-for="item in batch.items" :key="`${batch.id}:${item.key}`">
          <span
            v-if="item.type !== 'heart'"
            class="absolute holiday-decoration"
            :class="[`holiday-decoration--${item.type}`, !prefersReducedMotion ? 'holiday-decoration--animated' : '']"
            :style="item.style"
            aria-hidden="true"
          ></span>
          <span
            v-else
            class="absolute holiday-decoration holiday-decoration--heart"
            :class="!prefersReducedMotion ? 'holiday-decoration--animated' : ''"
            :style="item.style"
            aria-hidden="true"
          >
            <svg viewBox="0 0 24 24" class="w-full h-full fill-current">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
            </svg>
          </span>
        </template>
      </div>
    </div>

    <div class="absolute top-4 right-4 w-[10.75rem] sm:w-[12rem] md:hidden">
      <div class="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-black tracking-[0.22em] uppercase holiday-badge ml-auto">
        <span class="inline-block h-2 w-2 rounded-full holiday-badge-dot"></span>
        {{ resolvedTheme.badgeText }}
      </div>

      <div
        data-test="holiday-hero-mobile-chip"
        class="mt-2 rounded-[22px] border px-3 py-3 backdrop-blur-md holiday-mobile-chip"
      >
        <p class="text-[10px] uppercase tracking-[0.22em] font-bold holiday-caption">
          {{ resolvedTheme.label }}
        </p>
        <p class="mt-1.5 text-xs leading-5 font-semibold holiday-message line-clamp-2">
          {{ mobileHeadline }}
        </p>
      </div>
    </div>

    <div class="absolute top-7 right-8 hidden md:block md:max-w-[24rem] lg:max-w-[25rem] xl:max-w-[27rem]">
      <div class="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] sm:text-xs font-black tracking-[0.24em] uppercase holiday-badge">
        <span class="inline-block h-2 w-2 rounded-full holiday-badge-dot"></span>
        {{ resolvedTheme.badgeText }}
      </div>

      <div class="mt-3 rounded-[28px] border p-4 sm:p-5 backdrop-blur-md holiday-card">
        <p class="text-[11px] sm:text-xs uppercase tracking-[0.28em] font-bold holiday-caption">
          {{ resolvedTheme.label }}
        </p>
        <h2 class="mt-2 text-lg sm:text-xl md:text-[1.85rem] leading-tight font-black holiday-title">
          {{ resolvedTheme.title }}
        </h2>
        <div class="mt-3 h-[3.6rem] sm:h-[4rem] md:h-[4.4rem] overflow-hidden">
          <transition name="holiday-message" mode="out-in">
            <p
              :key="currentMessageKey"
              data-test="holiday-hero-message"
              class="text-sm sm:text-base md:text-lg leading-relaxed font-medium holiday-message line-clamp-2"
            >
              {{ currentMessage }}
            </p>
          </transition>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'

import { useHolidayTheme } from '@/composables/useHolidayTheme'
import {
  createHolidayMotionLayoutNonce,
  HOLIDAY_LAYOUT_BATCH_CROSSFADE_MS,
  HOLIDAY_FIREWORKS_LAYOUT_REFRESH_MS,
  isHolidayFireworksMotionPreset,
  randomizeHolidayMotionItems,
} from '@/utils/holidayMotionLayout'

type MotionBatch = {
  id: string
  phase: string
  items: any[]
}

const ROTATION_INTERVAL_MS = 4500

const props = withDefaults(defineProps<{
  themeOverride?: any | null
}>(), {
  themeOverride: null,
})

const { holidayTheme } = useHolidayTheme()

const currentMessageIndex = ref(0)
const prefersReducedMotion = ref(false)
const decorativeBatches = ref<MotionBatch[]>([])

let rotationTimer: ReturnType<typeof setInterval> | null = null
let layoutRefreshTimer: ReturnType<typeof setInterval> | null = null
let layoutCleanupTimer: ReturnType<typeof setTimeout> | null = null
let reducedMotionQuery: MediaQueryList | null = null

const DECORATION_MAP: Record<string, any[]> = {
  soft_petals: [
    { key: 'petal-1', type: 'petal', style: { top: '16%', left: '8%', width: '2.8rem', height: '1.15rem', animationDelay: '0s', animationDuration: '10s' } },
    { key: 'petal-2', type: 'petal', style: { top: '28%', right: '18%', width: '2.2rem', height: '0.95rem', animationDelay: '1.5s', animationDuration: '9s' } },
    { key: 'petal-3', type: 'petal', style: { top: '44%', left: '18%', width: '1.9rem', height: '0.85rem', animationDelay: '2.2s', animationDuration: '11s' } },
    { key: 'glow-1', type: 'spark', style: { top: '22%', right: '26%', width: '0.85rem', height: '0.85rem', animationDelay: '0.8s', animationDuration: '7.5s' } },
    { key: 'glow-2', type: 'spark', style: { top: '58%', right: '12%', width: '1.1rem', height: '1.1rem', animationDelay: '3s', animationDuration: '8.5s' } },
  ],
  gentle_glow: [
    { key: 'ribbon-1', type: 'ribbon', style: { top: '18%', right: '15%', width: '8rem', height: '1.05rem', transform: 'rotate(-12deg)', animationDelay: '0.2s', animationDuration: '8.5s' } },
    { key: 'ribbon-2', type: 'ribbon', style: { top: '52%', left: '10%', width: '6.8rem', height: '0.95rem', transform: 'rotate(14deg)', animationDelay: '1.3s', animationDuration: '9.5s' } },
    { key: 'spark-1', type: 'spark', style: { top: '18%', left: '22%', width: '0.8rem', height: '0.8rem', animationDelay: '0.8s', animationDuration: '6.8s' } },
    { key: 'spark-2', type: 'spark', style: { top: '34%', right: '10%', width: '1.1rem', height: '1.1rem', animationDelay: '2.4s', animationDuration: '7.5s' } },
    { key: 'spark-3', type: 'spark', style: { top: '62%', right: '28%', width: '0.95rem', height: '0.95rem', animationDelay: '3.4s', animationDuration: '8.2s' } },
  ],
  heart_bokeh: [
    { key: 'heart-1', type: 'heart', style: { top: '16%', right: '16%', width: '1.2rem', height: '1.2rem', animationDelay: '0.2s', animationDuration: '7.5s' } },
    { key: 'heart-2', type: 'heart', style: { top: '38%', right: '8%', width: '1rem', height: '1rem', animationDelay: '1.6s', animationDuration: '8.5s' } },
    { key: 'heart-3', type: 'heart', style: { top: '60%', left: '15%', width: '1.35rem', height: '1.35rem', animationDelay: '3.1s', animationDuration: '9.2s' } },
    { key: 'spark-1', type: 'spark', style: { top: '26%', left: '14%', width: '0.95rem', height: '0.95rem', animationDelay: '0.8s', animationDuration: '7.4s' } },
    { key: 'spark-2', type: 'spark', style: { top: '52%', right: '22%', width: '1.15rem', height: '1.15rem', animationDelay: '2.5s', animationDuration: '8.4s' } },
  ],
  snowfall_drift: [
    { key: 'snow-1', type: 'snowflake', style: { top: '8%', left: '8%', width: '1rem', height: '1rem', animationDelay: '0s', animationDuration: '12.6s', '--holiday-drift-x': '14px', '--holiday-drift-y': '148px', '--holiday-rotate-start': '0deg', '--holiday-rotate-end': '164deg', '--holiday-opacity': '0.74' } },
    { key: 'snow-2', type: 'snowflake', style: { top: '14%', right: '16%', width: '0.86rem', height: '0.86rem', animationDelay: '1.4s', animationDuration: '11.8s', '--holiday-drift-x': '-18px', '--holiday-drift-y': '134px', '--holiday-rotate-start': '12deg', '--holiday-rotate-end': '172deg', '--holiday-opacity': '0.68' } },
    { key: 'snow-3', type: 'snowflake', style: { top: '24%', left: '24%', width: '1.14rem', height: '1.14rem', animationDelay: '2.8s', animationDuration: '13.4s', '--holiday-drift-x': '22px', '--holiday-drift-y': '152px', '--holiday-rotate-start': '-10deg', '--holiday-rotate-end': '188deg', '--holiday-opacity': '0.76' } },
    { key: 'snow-4', type: 'snowflake', style: { top: '36%', right: '26%', width: '0.8rem', height: '0.8rem', animationDelay: '4.6s', animationDuration: '11.2s', '--holiday-drift-x': '-12px', '--holiday-drift-y': '126px', '--holiday-rotate-start': '8deg', '--holiday-rotate-end': '156deg', '--holiday-opacity': '0.6' } },
    { key: 'snow-5', type: 'snowflake', style: { top: '48%', left: '16%', width: '0.94rem', height: '0.94rem', animationDelay: '3.4s', animationDuration: '12.1s', '--holiday-drift-x': '16px', '--holiday-drift-y': '138px', '--holiday-rotate-start': '-6deg', '--holiday-rotate-end': '178deg', '--holiday-opacity': '0.7' } },
    { key: 'snow-6', type: 'snowflake', style: { top: '56%', right: '10%', width: '1.08rem', height: '1.08rem', animationDelay: '5.1s', animationDuration: '13.1s', '--holiday-drift-x': '-14px', '--holiday-drift-y': '144px', '--holiday-rotate-start': '4deg', '--holiday-rotate-end': '182deg', '--holiday-opacity': '0.72' } },
    { key: 'snow-glow-1', type: 'spark', style: { top: '20%', right: '32%', width: '0.92rem', height: '0.92rem', animationDelay: '1s', animationDuration: '7.8s' } },
    { key: 'snow-glow-2', type: 'spark', style: { top: '62%', left: '30%', width: '1.04rem', height: '1.04rem', animationDelay: '3.7s', animationDuration: '8.6s' } },
  ],
  sakura_blossom: [
    { key: 'sakura-1', type: 'sakura', style: { top: '14%', left: '10%', width: '2.5rem', height: '1.2rem', animationDelay: '0.1s', animationDuration: '10.4s' } },
    { key: 'sakura-2', type: 'sakura', style: { top: '22%', right: '18%', width: '2.2rem', height: '1.05rem', animationDelay: '1.8s', animationDuration: '9.4s' } },
    { key: 'sakura-3', type: 'sakura', style: { top: '42%', left: '16%', width: '1.95rem', height: '0.94rem', animationDelay: '2.8s', animationDuration: '11.1s' } },
    { key: 'sakura-4', type: 'sakura', style: { top: '58%', right: '24%', width: '2.1rem', height: '1rem', animationDelay: '4.2s', animationDuration: '10.8s' } },
    { key: 'spark-1', type: 'spark', style: { top: '28%', left: '28%', width: '0.85rem', height: '0.85rem', animationDelay: '1.1s', animationDuration: '7.3s' } },
    { key: 'spark-2', type: 'spark', style: { top: '52%', right: '10%', width: '1rem', height: '1rem', animationDelay: '3.1s', animationDuration: '8.1s' } },
  ],
  fireworks_gold: [
    { key: 'rocket-1', type: 'rocket', style: { bottom: '10%', right: '18%', width: '0.42rem', height: '4.8rem', animationDelay: '0.2s', animationDuration: '4.8s', '--holiday-rise-x': '-6px', '--holiday-rise-y': '-210px', '--holiday-opacity': '0.94' } },
    { key: 'firework-1', type: 'firework', style: { top: '14%', right: '14%', width: '3.8rem', height: '3.8rem', animationDelay: '1.25s', animationDuration: '3.6s' } },
    { key: 'rocket-2', type: 'rocket', style: { bottom: '14%', left: '18%', width: '0.38rem', height: '4.2rem', animationDelay: '1.6s', animationDuration: '4.4s', '--holiday-rise-x': '10px', '--holiday-rise-y': '-180px', '--holiday-opacity': '0.9' } },
    { key: 'firework-2', type: 'firework', style: { top: '24%', left: '12%', width: '3.2rem', height: '3.2rem', animationDelay: '2.55s', animationDuration: '3.4s' } },
    { key: 'rocket-3', type: 'rocket', style: { bottom: '8%', right: '30%', width: '0.34rem', height: '3.8rem', animationDelay: '3.1s', animationDuration: '4.6s', '--holiday-rise-x': '8px', '--holiday-rise-y': '-128px', '--holiday-opacity': '0.86' } },
    { key: 'firework-3', type: 'firework', style: { top: '48%', right: '24%', width: '2.9rem', height: '2.9rem', animationDelay: '4.15s', animationDuration: '3.8s' } },
    { key: 'spark-1', type: 'spark', style: { top: '18%', left: '34%', width: '1rem', height: '1rem', animationDelay: '1.3s', animationDuration: '5.4s' } },
    { key: 'spark-2', type: 'spark', style: { top: '58%', left: '20%', width: '1.1rem', height: '1.1rem', animationDelay: '4.3s', animationDuration: '5.8s' } },
  ],
  fireworks_rainbow: [
    { key: 'rainbow-rocket-1', type: 'rocket', style: { bottom: '10%', right: '18%', width: '0.42rem', height: '4.8rem', animationDelay: '0.2s', animationDuration: '4.8s', '--holiday-rise-x': '-6px', '--holiday-rise-y': '-210px', '--holiday-opacity': '0.94', '--holiday-rocket-core': '#fff7ed', '--holiday-rocket-trail-start': '#fb7185', '--holiday-rocket-trail-mid': '#facc15', '--holiday-rocket-trail-end': 'rgba(59,130,246,0)' } },
    { key: 'rainbow-firework-1', type: 'firework', style: { top: '14%', right: '14%', width: '3.8rem', height: '3.8rem', animationDelay: '1.25s', animationDuration: '3.6s', '--holiday-firework-core': 'rgba(255,255,255,0.96)', '--holiday-firework-primary': '#fb7185', '--holiday-firework-secondary': '#38bdf8' } },
    { key: 'rainbow-rocket-2', type: 'rocket', style: { bottom: '14%', left: '18%', width: '0.38rem', height: '4.2rem', animationDelay: '1.6s', animationDuration: '4.4s', '--holiday-rise-x': '10px', '--holiday-rise-y': '-180px', '--holiday-opacity': '0.9', '--holiday-rocket-core': '#ffffff', '--holiday-rocket-trail-start': '#a855f7', '--holiday-rocket-trail-mid': '#22c55e', '--holiday-rocket-trail-end': 'rgba(251,146,60,0)' } },
    { key: 'rainbow-firework-2', type: 'firework', style: { top: '24%', left: '12%', width: '3.2rem', height: '3.2rem', animationDelay: '2.55s', animationDuration: '3.4s', '--holiday-firework-core': 'rgba(255,255,255,0.94)', '--holiday-firework-primary': '#facc15', '--holiday-firework-secondary': '#22c55e' } },
    { key: 'rainbow-rocket-3', type: 'rocket', style: { bottom: '8%', right: '30%', width: '0.34rem', height: '3.8rem', animationDelay: '3.1s', animationDuration: '4.6s', '--holiday-rise-x': '8px', '--holiday-rise-y': '-128px', '--holiday-opacity': '0.86', '--holiday-rocket-core': '#ffffff', '--holiday-rocket-trail-start': '#38bdf8', '--holiday-rocket-trail-mid': '#fb7185', '--holiday-rocket-trail-end': 'rgba(250,204,21,0)' } },
    { key: 'rainbow-firework-3', type: 'firework', style: { top: '48%', right: '24%', width: '2.9rem', height: '2.9rem', animationDelay: '4.15s', animationDuration: '3.8s', '--holiday-firework-core': 'rgba(255,255,255,0.94)', '--holiday-firework-primary': '#a855f7', '--holiday-firework-secondary': '#fb7185' } },
    { key: 'rainbow-spark-1', type: 'spark', style: { top: '18%', left: '34%', width: '1rem', height: '1rem', animationDelay: '1.3s', animationDuration: '5.4s', '--holiday-decoration-primary-override': '#facc15', '--holiday-decoration-secondary-override': '#38bdf8' } },
    { key: 'rainbow-spark-2', type: 'spark', style: { top: '58%', left: '20%', width: '1.1rem', height: '1.1rem', animationDelay: '4.3s', animationDuration: '5.8s', '--holiday-decoration-primary-override': '#fb7185', '--holiday-decoration-secondary-override': '#22c55e' } },
  ],
  fireworks_champion: [
    { key: 'champion-rocket-1', type: 'rocket', style: { bottom: '10%', right: '18%', width: '0.44rem', height: '5rem', animationDelay: '0.2s', animationDuration: '4.9s', '--holiday-rise-x': '-6px', '--holiday-rise-y': '-220px', '--holiday-opacity': '0.96', '--holiday-rocket-core': '#ffffff', '--holiday-rocket-trail-start': '#fde68a', '--holiday-rocket-trail-mid': '#60a5fa', '--holiday-rocket-trail-end': 'rgba(255,255,255,0)' } },
    { key: 'champion-firework-1', type: 'firework', style: { top: '14%', right: '14%', width: '4rem', height: '4rem', animationDelay: '1.25s', animationDuration: '3.7s', '--holiday-firework-core': 'rgba(255,255,255,0.98)', '--holiday-firework-primary': '#fde68a', '--holiday-firework-secondary': '#60a5fa' } },
    { key: 'champion-rocket-2', type: 'rocket', style: { bottom: '14%', left: '18%', width: '0.4rem', height: '4.3rem', animationDelay: '1.65s', animationDuration: '4.5s', '--holiday-rise-x': '10px', '--holiday-rise-y': '-184px', '--holiday-opacity': '0.92', '--holiday-rocket-core': '#ffffff', '--holiday-rocket-trail-start': '#facc15', '--holiday-rocket-trail-mid': '#1d4ed8', '--holiday-rocket-trail-end': 'rgba(255,255,255,0)' } },
    { key: 'champion-firework-2', type: 'firework', style: { top: '24%', left: '12%', width: '3.4rem', height: '3.4rem', animationDelay: '2.6s', animationDuration: '3.5s', '--holiday-firework-core': 'rgba(255,255,255,0.96)', '--holiday-firework-primary': '#facc15', '--holiday-firework-secondary': '#93c5fd' } },
    { key: 'champion-confetti-1', type: 'confetti', style: { top: '18%', right: '18%', width: '0.88rem', height: '2.3rem', animationDelay: '1.4s', animationDuration: '8.1s', '--holiday-confetti-start': '#facc15', '--holiday-confetti-end': '#1d4ed8' } },
    { key: 'champion-confetti-2', type: 'confetti', style: { top: '36%', left: '14%', width: '0.76rem', height: '2rem', animationDelay: '2.8s', animationDuration: '7.5s', '--holiday-confetti-start': '#ffffff', '--holiday-confetti-end': '#60a5fa' } },
    { key: 'champion-twinkle-1', type: 'twinkle', style: { top: '18%', left: '34%', width: '1rem', height: '1rem', animationDelay: '1.5s', animationDuration: '5.4s', '--holiday-twinkle-primary': '#fde68a', '--holiday-twinkle-secondary': '#60a5fa', '--holiday-twinkle-tertiary': 'rgba(255,255,255,0.96)' } },
    { key: 'champion-twinkle-2', type: 'twinkle', style: { top: '58%', left: '20%', width: '1.12rem', height: '1.12rem', animationDelay: '4.2s', animationDuration: '5.8s', '--holiday-twinkle-primary': '#ffffff', '--holiday-twinkle-secondary': '#1d4ed8', '--holiday-twinkle-tertiary': '#fde68a' } },
  ],
  starlight_confetti: [
    { key: 'confetti-1', type: 'confetti', style: { top: '18%', right: '18%', width: '0.85rem', height: '2.2rem', animationDelay: '0.1s', animationDuration: '8.4s' } },
    { key: 'confetti-2', type: 'confetti', style: { top: '32%', left: '14%', width: '0.72rem', height: '1.9rem', animationDelay: '1.6s', animationDuration: '7.6s' } },
    { key: 'confetti-3', type: 'confetti', style: { top: '56%', right: '28%', width: '0.78rem', height: '2rem', animationDelay: '2.9s', animationDuration: '8.8s' } },
    { key: 'spark-1', type: 'spark', style: { top: '22%', left: '24%', width: '0.92rem', height: '0.92rem', animationDelay: '0.8s', animationDuration: '6.8s' } },
    { key: 'spark-2', type: 'spark', style: { top: '46%', right: '12%', width: '1.2rem', height: '1.2rem', animationDelay: '2.4s', animationDuration: '7.6s' } },
    { key: 'spark-3', type: 'spark', style: { top: '62%', left: '30%', width: '0.8rem', height: '0.8rem', animationDelay: '4.1s', animationDuration: '6.9s' } },
  ],
}

const resolvedTheme = computed(() => props.themeOverride || holidayTheme.value)

const currentMessages = computed<string[]>(() => resolvedTheme.value.messages || [])

const currentMessage = computed(() => {
  return currentMessages.value[currentMessageIndex.value] || currentMessages.value[0] || ''
})

const mobileHeadline = computed(() => {
  return currentMessages.value[0] || resolvedTheme.value.title || ''
})

const currentMessageKey = computed(() => {
  return `${resolvedTheme.value.token}:${currentMessageIndex.value}`
})

const resolvedMotionPreset = computed(() => {
  return resolvedTheme.value.motionPreset === 'fireworks_burst'
    ? 'fireworks_gold'
    : resolvedTheme.value.motionPreset
})

const shouldCycleFireworkLayout = computed(() => {
  return (
    resolvedTheme.value.enabled &&
    !prefersReducedMotion.value &&
    isHolidayFireworksMotionPreset(resolvedMotionPreset.value)
  )
})

const themeCssVars = computed(() => ({
  '--holiday-accent': resolvedTheme.value.paletteValues?.accent || '#f472b6',
  '--holiday-accent-soft': resolvedTheme.value.paletteValues?.accentSoft || '#fbcfe8',
  '--holiday-highlight': resolvedTheme.value.paletteValues?.highlight || '#f59e0b',
  '--holiday-card-from': resolvedTheme.value.paletteValues?.cardFrom || 'rgba(255,255,255,0.14)',
  '--holiday-card-to': resolvedTheme.value.paletteValues?.cardTo || 'rgba(255,255,255,0.08)',
  '--holiday-border': resolvedTheme.value.paletteValues?.border || 'rgba(255,255,255,0.28)',
  '--holiday-glow': resolvedTheme.value.paletteValues?.glow || 'rgba(255,255,255,0.18)',
  '--holiday-text': resolvedTheme.value.paletteValues?.text || '#ffffff',
  '--holiday-muted': resolvedTheme.value.paletteValues?.muted || 'rgba(255,255,255,0.82)',
  '--holiday-decoration-primary': resolvedTheme.value.paletteValues?.decorationPrimary || 'rgba(255,255,255,0.7)',
  '--holiday-decoration-secondary': resolvedTheme.value.paletteValues?.decorationSecondary || 'rgba(255,255,255,0.32)',
  '--holiday-decoration-tertiary': resolvedTheme.value.paletteValues?.decorationTertiary || 'rgba(255,255,255,0.48)',
}))

const buildDecorativeBatch = (nonce: string, phase = 'current'): MotionBatch => {
  return {
    id: `hero-${nonce}`,
    phase,
    items: randomizeHolidayMotionItems(DECORATION_MAP[resolvedMotionPreset.value] || [], {
      seed: `${resolvedTheme.value.token || 'holiday-theme'}:${nonce}:${resolvedMotionPreset.value}`,
      scope: 'hero',
      includePhaseClones: !prefersReducedMotion.value,
    }),
  }
}

const updateReducedMotionPreference = () => {
  prefersReducedMotion.value = reducedMotionQuery?.matches ?? false
}

const stopRotation = () => {
  if (rotationTimer) {
    clearInterval(rotationTimer)
    rotationTimer = null
  }
}

const clearLayoutCleanup = () => {
  if (!layoutCleanupTimer) return
  clearTimeout(layoutCleanupTimer)
  layoutCleanupTimer = null
}

const stopLayoutRefresh = () => {
  if (layoutRefreshTimer) {
    clearInterval(layoutRefreshTimer)
    layoutRefreshTimer = null
  }
}

const resetDecorativeBatches = () => {
  clearLayoutCleanup()
  decorativeBatches.value = [buildDecorativeBatch(createHolidayMotionLayoutNonce())]
}

const queueDecorativeBatchCrossfade = () => {
  clearLayoutCleanup()

  const nextBatch = buildDecorativeBatch(createHolidayMotionLayoutNonce(), 'entering')
  decorativeBatches.value = [
    ...decorativeBatches.value.map((batch) => ({ ...batch, phase: 'leaving' })),
    nextBatch,
  ]

  layoutCleanupTimer = setTimeout(() => {
    decorativeBatches.value = [{ ...nextBatch, phase: 'current' }]
    layoutCleanupTimer = null
  }, HOLIDAY_LAYOUT_BATCH_CROSSFADE_MS)
}

const startLayoutRefresh = () => {
  stopLayoutRefresh()

  if (!shouldCycleFireworkLayout.value) return

  layoutRefreshTimer = setInterval(() => {
    queueDecorativeBatchCrossfade()
  }, HOLIDAY_FIREWORKS_LAYOUT_REFRESH_MS)
}

const startRotation = () => {
  stopRotation()

  if (
    prefersReducedMotion.value ||
    !resolvedTheme.value.enabled ||
    currentMessages.value.length <= 1
  ) {
    return
  }

  rotationTimer = setInterval(() => {
    currentMessageIndex.value = (currentMessageIndex.value + 1) % currentMessages.value.length
  }, ROTATION_INTERVAL_MS)
}

watch(
  [() => resolvedTheme.value.token, () => prefersReducedMotion.value],
  () => {
    currentMessageIndex.value = 0
    startRotation()
  }
)

watch(
  [
    () => resolvedTheme.value.token || 'holiday-theme',
    () => resolvedMotionPreset.value,
    () => resolvedTheme.value.enabled,
    () => prefersReducedMotion.value,
  ],
  () => {
    resetDecorativeBatches()
    startLayoutRefresh()
  },
  { immediate: true }
)

onMounted(() => {
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    updateReducedMotionPreference()
    reducedMotionQuery.addEventListener?.('change', updateReducedMotionPreference)
  }

  currentMessageIndex.value = 0
  startRotation()
})

onUnmounted(() => {
  stopRotation()
  stopLayoutRefresh()
  clearLayoutCleanup()
  reducedMotionQuery?.removeEventListener?.('change', updateReducedMotionPreference)
})
</script>

<style scoped>
.holiday-overlay-backdrop {
  background:
    linear-gradient(135deg, color-mix(in srgb, var(--holiday-accent) 24%, transparent), transparent 44%),
    linear-gradient(315deg, color-mix(in srgb, var(--holiday-highlight) 18%, transparent), transparent 40%);
  opacity: 0.9;
}

.holiday-glow-orb {
  background: radial-gradient(circle, var(--holiday-glow) 0%, transparent 72%);
}

.holiday-soft-orb {
  background: radial-gradient(circle, color-mix(in srgb, var(--holiday-decoration-primary) 58%, transparent) 0%, transparent 72%);
}

.holiday-badge {
  color: var(--holiday-text);
  background: color-mix(in srgb, var(--holiday-card-from) 92%, transparent);
  border-color: var(--holiday-border);
  box-shadow: 0 12px 38px -22px var(--holiday-glow);
}

.holiday-badge-dot {
  background: linear-gradient(135deg, var(--holiday-accent), var(--holiday-highlight));
  box-shadow: 0 0 16px color-mix(in srgb, var(--holiday-highlight) 64%, transparent);
}

.holiday-card {
  background:
    linear-gradient(180deg, var(--holiday-card-from), var(--holiday-card-to)),
    rgba(15, 23, 42, 0.1);
  border-color: var(--holiday-border);
  box-shadow:
    0 18px 60px -28px rgba(15, 23, 42, 0.7),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
}

.holiday-mobile-chip {
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--holiday-card-from) 96%, transparent), color-mix(in srgb, var(--holiday-card-to) 92%, transparent)),
    rgba(15, 23, 42, 0.12);
  border-color: color-mix(in srgb, var(--holiday-border) 92%, transparent);
  box-shadow:
    0 14px 38px -24px rgba(15, 23, 42, 0.82),
    inset 0 1px 0 rgba(255, 255, 255, 0.08);
}

.holiday-caption {
  color: var(--holiday-muted);
}

.holiday-title {
  color: var(--holiday-text);
  text-wrap: balance;
}

.holiday-message {
  color: var(--holiday-muted);
}

.holiday-layout-batch {
  pointer-events: none;
}

.holiday-layout-batch--current {
  opacity: 1;
}

.holiday-layout-batch--entering {
  animation: holidayHeroLayoutBatchEnter 1.6s ease both;
}

.holiday-layout-batch--leaving {
  animation: holidayHeroLayoutBatchExit 1.6s ease both;
}

.holiday-decoration {
  pointer-events: none;
}

.holiday-decoration--petal {
  background: linear-gradient(135deg, var(--holiday-decoration-primary), var(--holiday-decoration-secondary));
  border-radius: 80% 0 80% 0;
  box-shadow: 0 10px 28px -18px var(--holiday-glow);
  transform: rotate(-12deg);
}

.holiday-decoration--sakura {
  background:
    radial-gradient(circle at 30% 28%, color-mix(in srgb, var(--holiday-decoration-tertiary) 82%, transparent) 0 14%, transparent 16%),
    linear-gradient(135deg, var(--holiday-decoration-primary), var(--holiday-decoration-secondary));
  border-radius: 78% 40% 82% 32%;
  box-shadow: 0 12px 30px -18px var(--holiday-glow);
  transform: rotate(-18deg);
}

.holiday-decoration--spark {
  background: radial-gradient(
    circle,
    var(--holiday-decoration-primary-override, var(--holiday-decoration-primary)) 0%,
    var(--holiday-decoration-secondary-override, var(--holiday-decoration-secondary)) 68%,
    transparent 72%
  );
  border-radius: 9999px;
  box-shadow: 0 0 24px -10px var(--holiday-decoration-primary-override, var(--holiday-decoration-primary));
}

.holiday-decoration--snowflake {
  background:
    linear-gradient(90deg, transparent 44%, var(--holiday-decoration-primary) 44% 56%, transparent 56%),
    linear-gradient(0deg, transparent 44%, var(--holiday-decoration-primary) 44% 56%, transparent 56%),
    linear-gradient(45deg, transparent 46%, var(--holiday-decoration-tertiary) 46% 54%, transparent 54%),
    linear-gradient(-45deg, transparent 46%, var(--holiday-decoration-tertiary) 46% 54%, transparent 54%),
    radial-gradient(circle, color-mix(in srgb, var(--holiday-decoration-primary) 82%, white) 0 20%, transparent 22%);
  filter: drop-shadow(0 0 12px color-mix(in srgb, var(--holiday-decoration-tertiary) 64%, transparent));
  transform-origin: center;
}

.holiday-decoration--ribbon {
  background: linear-gradient(90deg, color-mix(in srgb, var(--holiday-accent) 84%, transparent), color-mix(in srgb, var(--holiday-highlight) 72%, transparent));
  border-radius: 9999px;
  opacity: 0.72;
  box-shadow: 0 10px 28px -18px var(--holiday-glow);
}

.holiday-decoration--heart {
  color: var(--holiday-decoration-primary);
  filter: drop-shadow(0 0 10px color-mix(in srgb, var(--holiday-decoration-secondary) 42%, transparent));
}

.holiday-decoration--twinkle {
  background:
    radial-gradient(circle, var(--holiday-twinkle-tertiary, var(--holiday-decoration-tertiary)) 0 18%, transparent 20%),
    linear-gradient(90deg, transparent 42%, var(--holiday-twinkle-primary, var(--holiday-decoration-primary)) 42% 58%, transparent 58%),
    linear-gradient(0deg, transparent 42%, var(--holiday-twinkle-secondary, var(--holiday-decoration-secondary)) 42% 58%, transparent 58%);
  filter: drop-shadow(0 0 10px color-mix(in srgb, var(--holiday-twinkle-primary, var(--holiday-decoration-primary)) 48%, transparent));
}

.holiday-decoration--rocket {
  background:
    radial-gradient(circle at 50% 10%, var(--holiday-rocket-core, var(--holiday-decoration-tertiary)) 0 18%, transparent 20%),
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--holiday-rocket-trail-start, var(--holiday-highlight)) 82%, transparent) 0%,
      color-mix(in srgb, var(--holiday-rocket-trail-mid, var(--holiday-decoration-primary)) 72%, transparent) 26%,
      color-mix(in srgb, var(--holiday-rocket-trail-end, var(--holiday-decoration-secondary)) 48%, transparent) 62%,
      transparent 100%
    );
  border-radius: 9999px;
  filter: drop-shadow(0 0 12px color-mix(in srgb, var(--holiday-rocket-trail-start, var(--holiday-highlight)) 58%, transparent));
  transform-origin: center bottom;
}

.holiday-decoration--firework {
  border-radius: 9999px;
  background:
    radial-gradient(circle, color-mix(in srgb, var(--holiday-firework-core, var(--holiday-decoration-tertiary)) 92%, transparent) 0 10%, transparent 12%),
    repeating-conic-gradient(
      from 0deg,
      var(--holiday-firework-primary, var(--holiday-decoration-primary)) 0deg 10deg,
      transparent 10deg 22deg,
      var(--holiday-firework-secondary, var(--holiday-highlight)) 22deg 30deg,
      transparent 30deg 42deg
    );
  -webkit-mask: radial-gradient(circle, transparent 0 14%, #000 18% 100%);
  mask: radial-gradient(circle, transparent 0 14%, #000 18% 100%);
  opacity: 0.82;
  filter: drop-shadow(0 0 12px color-mix(in srgb, var(--holiday-firework-secondary, var(--holiday-highlight)) 52%, transparent));
}

.holiday-decoration--confetti {
  background: linear-gradient(
    180deg,
    var(--holiday-confetti-start, var(--holiday-decoration-primary)),
    color-mix(in srgb, var(--holiday-confetti-end, var(--holiday-highlight)) 66%, var(--holiday-decoration-secondary))
  );
  border-radius: 9999px;
  box-shadow: 0 10px 26px -16px var(--holiday-glow);
}

.holiday-decoration--animated {
  animation-name: holidayFloat;
  animation-timing-function: ease-in-out;
  animation-iteration-count: infinite;
}

.holiday-decoration--firework.holiday-decoration--animated {
  animation-name: holidayBurst;
  animation-timing-function: ease-out;
}

.holiday-decoration--rocket.holiday-decoration--animated {
  animation-name: holidayRocketLaunch;
  animation-timing-function: cubic-bezier(0.22, 0.61, 0.36, 1);
}

.holiday-decoration--confetti.holiday-decoration--animated {
  animation-name: holidayConfettiFloat;
}

.holiday-decoration--snowflake.holiday-decoration--animated {
  animation-name: holidaySnowfall;
  animation-timing-function: linear;
}

.holiday-message-enter-active,
.holiday-message-leave-active {
  transition: opacity 0.35s ease, transform 0.35s ease;
}

.holiday-message-enter-from,
.holiday-message-leave-to {
  opacity: 0;
  transform: translateY(12px);
}

@keyframes holidayFloat {
  0%,
  100% {
    transform: translateY(0) scale(1);
    opacity: 0.78;
  }
  50% {
    transform: translateY(-12px) scale(1.05);
    opacity: 1;
  }
}

@keyframes holidayBurst {
  0% {
    transform: scale(0.28);
    opacity: 0;
  }
  18% {
    opacity: 0.94;
  }
  100% {
    transform: scale(1.18);
    opacity: 0;
  }
}

@keyframes holidayRocketLaunch {
  0% {
    transform: translate3d(0, 0, 0) scaleY(0.4);
    opacity: 0;
  }
  12% {
    opacity: calc(var(--holiday-opacity, 0.9) * 0.72);
  }
  76% {
    transform: translate3d(var(--holiday-rise-x, 0), var(--holiday-rise-y, -180px), 0) scaleY(1);
    opacity: var(--holiday-opacity, 0.9);
  }
  100% {
    transform: translate3d(var(--holiday-rise-x, 0), calc(var(--holiday-rise-y, -180px) - 10px), 0) scaleY(0.82);
    opacity: 0;
  }
}

@keyframes holidayConfettiFloat {
  0%,
  100% {
    transform: translateY(0) rotate(-8deg);
    opacity: 0.82;
  }
  50% {
    transform: translateY(-14px) rotate(10deg);
    opacity: 1;
  }
}

@keyframes holidaySnowfall {
  0% {
    transform: translate3d(0, -18px, 0) rotate(var(--holiday-rotate-start, 0deg)) scale(0.82);
    opacity: 0;
  }
  14% {
    opacity: var(--holiday-opacity, 0.72);
  }
  100% {
    transform: translate3d(var(--holiday-drift-x, 12px), calc(var(--holiday-drift-y, 136px) + 72px), 0) rotate(var(--holiday-rotate-end, 180deg)) scale(1.04);
    opacity: 0;
  }
}

@keyframes holidayHeroLayoutBatchEnter {
  0% {
    opacity: 0;
  }
  100% {
    opacity: 1;
  }
}

@keyframes holidayHeroLayoutBatchExit {
  0% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}

@media (max-width: 767px) {
  .holiday-card {
    max-width: min(100%, 24rem);
  }
}

@media (prefers-reduced-motion: reduce) {
  .holiday-layout-batch--entering,
  .holiday-layout-batch--leaving {
    animation: none !important;
  }

  .holiday-decoration--animated {
    animation: none !important;
  }

  .holiday-message-enter-active,
  .holiday-message-leave-active {
    transition: none !important;
  }
}
</style>
