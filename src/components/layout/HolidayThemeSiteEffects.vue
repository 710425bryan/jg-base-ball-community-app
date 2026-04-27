<template>
  <div
    v-if="shouldRender"
    data-test="holiday-site-effects"
    class="pointer-events-none fixed inset-0 z-[9] overflow-hidden"
    :style="effectCssVars"
    aria-hidden="true"
  >
    <div class="absolute inset-0 holiday-site-effects-fade"></div>

    <div
      v-for="batch in effectBatches"
      :key="batch.id"
      class="absolute inset-0 holiday-site-batch"
      :class="`holiday-site-batch--${batch.phase}`"
      data-test="holiday-site-batch"
      :data-batch-phase="batch.phase"
    >
      <template v-for="item in batch.items" :key="`${batch.id}:${item.key}`">
        <span
          v-if="item.type !== 'heart'"
          class="absolute holiday-site-effect"
          :class="`holiday-site-effect--${item.type}`"
          :style="item.style"
        ></span>
        <span
          v-else
          class="absolute holiday-site-effect holiday-site-effect--heart"
          :style="item.style"
        >
          <svg viewBox="0 0 24 24" class="h-full w-full fill-current">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
          </svg>
        </span>
      </template>
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

const { holidayTheme } = useHolidayTheme()

const prefersReducedMotion = ref(false)
const effectBatches = ref<MotionBatch[]>([])
let layoutRefreshTimer: ReturnType<typeof setInterval> | null = null
let layoutCleanupTimer: ReturnType<typeof setTimeout> | null = null
let reducedMotionQuery: MediaQueryList | null = null

const SITE_EFFECT_MAP: Record<string, any[]> = {
  soft_petals: [
    { key: 'petal-a', type: 'petal', style: { left: '4%', top: '-12%', width: '1rem', height: '1.55rem', animationDelay: '0s', animationDuration: '13s', '--holiday-drift-x': '52px', '--holiday-rotate-start': '-12deg', '--holiday-rotate-end': '210deg', '--holiday-opacity': '0.68' } },
    { key: 'petal-b', type: 'petal', style: { left: '16%', top: '-16%', width: '0.88rem', height: '1.32rem', animationDelay: '2.1s', animationDuration: '12.2s', '--holiday-drift-x': '38px', '--holiday-rotate-start': '8deg', '--holiday-rotate-end': '194deg', '--holiday-opacity': '0.6' } },
    { key: 'petal-c', type: 'petal', style: { left: '28%', top: '-10%', width: '0.94rem', height: '1.42rem', animationDelay: '4.6s', animationDuration: '13.1s', '--holiday-drift-x': '-34px', '--holiday-rotate-start': '-6deg', '--holiday-rotate-end': '188deg', '--holiday-opacity': '0.54' } },
    { key: 'petal-d', type: 'petal', style: { left: '43%', top: '-18%', width: '1.08rem', height: '1.68rem', animationDelay: '1.4s', animationDuration: '14s', '--holiday-drift-x': '46px', '--holiday-rotate-start': '14deg', '--holiday-rotate-end': '236deg', '--holiday-opacity': '0.64' } },
    { key: 'petal-e', type: 'petal', style: { left: '58%', top: '-14%', width: '0.92rem', height: '1.38rem', animationDelay: '3.6s', animationDuration: '12.8s', '--holiday-drift-x': '-42px', '--holiday-rotate-start': '-10deg', '--holiday-rotate-end': '208deg', '--holiday-opacity': '0.58' } },
    { key: 'petal-f', type: 'petal', style: { left: '72%', top: '-11%', width: '1rem', height: '1.54rem', animationDelay: '5.2s', animationDuration: '13.6s', '--holiday-drift-x': '32px', '--holiday-rotate-start': '6deg', '--holiday-rotate-end': '224deg', '--holiday-opacity': '0.52' } },
    { key: 'petal-g', type: 'petal', style: { left: '84%', top: '-16%', width: '0.86rem', height: '1.28rem', animationDelay: '2.9s', animationDuration: '12.4s', '--holiday-drift-x': '-52px', '--holiday-rotate-start': '-8deg', '--holiday-rotate-end': '196deg', '--holiday-opacity': '0.56' } },
    { key: 'petal-h', type: 'petal', style: { left: '94%', top: '-8%', width: '0.8rem', height: '1.18rem', animationDelay: '6.1s', animationDuration: '11.8s', '--holiday-drift-x': '-40px', '--holiday-rotate-start': '4deg', '--holiday-rotate-end': '180deg', '--holiday-opacity': '0.46' } },
  ],
  gentle_glow: [
    { key: 'orb-a', type: 'orb', style: { left: '8%', top: '16%', width: '1.05rem', height: '1.05rem', animationDelay: '0s', animationDuration: '7.2s', '--holiday-drift-x': '34px', '--holiday-drift-y': '26px', '--holiday-opacity': '0.34' } },
    { key: 'orb-b', type: 'orb', style: { left: '18%', top: '64%', width: '1.35rem', height: '1.35rem', animationDelay: '1.5s', animationDuration: '9.2s', '--holiday-drift-x': '-18px', '--holiday-drift-y': '-42px', '--holiday-opacity': '0.38' } },
    { key: 'orb-c', type: 'orb', style: { left: '36%', top: '28%', width: '0.8rem', height: '0.8rem', animationDelay: '4.1s', animationDuration: '8.1s', '--holiday-drift-x': '22px', '--holiday-drift-y': '-18px', '--holiday-opacity': '0.28' } },
    { key: 'orb-d', type: 'orb', style: { left: '52%', top: '12%', width: '0.92rem', height: '0.92rem', animationDelay: '5.2s', animationDuration: '7.5s', '--holiday-drift-x': '18px', '--holiday-drift-y': '22px', '--holiday-opacity': '0.24' } },
    { key: 'orb-e', type: 'orb', style: { left: '72%', top: '22%', width: '1.12rem', height: '1.12rem', animationDelay: '2.1s', animationDuration: '8.4s', '--holiday-drift-x': '28px', '--holiday-drift-y': '30px', '--holiday-opacity': '0.3' } },
    { key: 'orb-f', type: 'orb', style: { left: '84%', top: '54%', width: '1.48rem', height: '1.48rem', animationDelay: '3.8s', animationDuration: '10.5s', '--holiday-drift-x': '-24px', '--holiday-drift-y': '-34px', '--holiday-opacity': '0.42' } },
    { key: 'orb-g', type: 'orb', style: { left: '62%', top: '72%', width: '0.88rem', height: '0.88rem', animationDelay: '6s', animationDuration: '8.8s', '--holiday-drift-x': '-14px', '--holiday-drift-y': '-26px', '--holiday-opacity': '0.26' } },
  ],
  heart_bokeh: [
    { key: 'heart-a', type: 'heart', style: { left: '8%', bottom: '-12%', width: '1.06rem', height: '1.06rem', animationDelay: '0s', animationDuration: '10.5s', '--holiday-drift-x': '18px', '--holiday-opacity': '0.42' } },
    { key: 'heart-b', type: 'heart', style: { left: '18%', bottom: '-18%', width: '0.82rem', height: '0.82rem', animationDelay: '2.2s', animationDuration: '8.8s', '--holiday-drift-x': '-12px', '--holiday-opacity': '0.34' } },
    { key: 'heart-c', type: 'heart', style: { left: '32%', bottom: '-15%', width: '0.9rem', height: '0.9rem', animationDelay: '5.1s', animationDuration: '9.6s', '--holiday-drift-x': '10px', '--holiday-opacity': '0.3' } },
    { key: 'heart-d', type: 'heart', style: { left: '56%', bottom: '-11%', width: '1rem', height: '1rem', animationDelay: '3.4s', animationDuration: '10.2s', '--holiday-drift-x': '-18px', '--holiday-opacity': '0.36' } },
    { key: 'heart-e', type: 'heart', style: { left: '72%', bottom: '-14%', width: '0.96rem', height: '0.96rem', animationDelay: '1.4s', animationDuration: '9.4s', '--holiday-drift-x': '14px', '--holiday-opacity': '0.38' } },
    { key: 'heart-f', type: 'heart', style: { left: '86%', bottom: '-10%', width: '1.16rem', height: '1.16rem', animationDelay: '4s', animationDuration: '11.2s', '--holiday-drift-x': '-18px', '--holiday-opacity': '0.46' } },
    { key: 'heart-g', type: 'heart', style: { left: '94%', bottom: '-16%', width: '0.8rem', height: '0.8rem', animationDelay: '6.4s', animationDuration: '8.9s', '--holiday-drift-x': '8px', '--holiday-opacity': '0.32' } },
  ],
  snowfall_drift: [
    { key: 'snow-a', type: 'snowflake', style: { left: '6%', top: '-16%', width: '0.92rem', height: '0.92rem', animationDelay: '0s', animationDuration: '14.2s', '--holiday-drift-x': '18px', '--holiday-rotate-start': '0deg', '--holiday-rotate-end': '172deg', '--holiday-opacity': '0.72' } },
    { key: 'snow-b', type: 'snowflake', style: { left: '18%', top: '-10%', width: '0.78rem', height: '0.78rem', animationDelay: '1.8s', animationDuration: '12.8s', '--holiday-drift-x': '-14px', '--holiday-rotate-start': '8deg', '--holiday-rotate-end': '184deg', '--holiday-opacity': '0.62' } },
    { key: 'snow-c', type: 'snowflake', style: { left: '32%', top: '-18%', width: '1.08rem', height: '1.08rem', animationDelay: '3.2s', animationDuration: '15.1s', '--holiday-drift-x': '20px', '--holiday-rotate-start': '-10deg', '--holiday-rotate-end': '196deg', '--holiday-opacity': '0.78' } },
    { key: 'snow-d', type: 'snowflake', style: { left: '46%', top: '-12%', width: '0.86rem', height: '0.86rem', animationDelay: '4.6s', animationDuration: '13.7s', '--holiday-drift-x': '-18px', '--holiday-rotate-start': '10deg', '--holiday-rotate-end': '188deg', '--holiday-opacity': '0.66' } },
    { key: 'snow-e', type: 'snowflake', style: { left: '60%', top: '-20%', width: '1.14rem', height: '1.14rem', animationDelay: '2.4s', animationDuration: '15.6s', '--holiday-drift-x': '24px', '--holiday-rotate-start': '-8deg', '--holiday-rotate-end': '202deg', '--holiday-opacity': '0.8' } },
    { key: 'snow-f', type: 'snowflake', style: { left: '74%', top: '-14%', width: '0.82rem', height: '0.82rem', animationDelay: '5.8s', animationDuration: '12.9s', '--holiday-drift-x': '-16px', '--holiday-rotate-start': '12deg', '--holiday-rotate-end': '176deg', '--holiday-opacity': '0.6' } },
    { key: 'snow-g', type: 'snowflake', style: { left: '88%', top: '-18%', width: '0.98rem', height: '0.98rem', animationDelay: '6.6s', animationDuration: '14.4s', '--holiday-drift-x': '14px', '--holiday-rotate-start': '-6deg', '--holiday-rotate-end': '168deg', '--holiday-opacity': '0.7' } },
    { key: 'snow-orb-a', type: 'orb', style: { left: '24%', top: '24%', width: '1rem', height: '1rem', animationDelay: '1.2s', animationDuration: '8.8s', '--holiday-drift-x': '18px', '--holiday-drift-y': '16px', '--holiday-opacity': '0.22' } },
    { key: 'snow-orb-b', type: 'orb', style: { left: '78%', top: '48%', width: '1.28rem', height: '1.28rem', animationDelay: '3.6s', animationDuration: '9.6s', '--holiday-drift-x': '-16px', '--holiday-drift-y': '24px', '--holiday-opacity': '0.28' } },
  ],
  sakura_blossom: [
    { key: 'sakura-a', type: 'sakura', style: { left: '6%', top: '-14%', width: '1rem', height: '1.42rem', animationDelay: '0s', animationDuration: '13.4s', '--holiday-drift-x': '58px', '--holiday-rotate-start': '-18deg', '--holiday-rotate-end': '198deg', '--holiday-opacity': '0.7' } },
    { key: 'sakura-b', type: 'sakura', style: { left: '18%', top: '-18%', width: '0.92rem', height: '1.28rem', animationDelay: '1.7s', animationDuration: '12.2s', '--holiday-drift-x': '-40px', '--holiday-rotate-start': '12deg', '--holiday-rotate-end': '210deg', '--holiday-opacity': '0.62' } },
    { key: 'sakura-c', type: 'sakura', style: { left: '34%', top: '-9%', width: '0.88rem', height: '1.2rem', animationDelay: '3.6s', animationDuration: '13.1s', '--holiday-drift-x': '46px', '--holiday-rotate-start': '-8deg', '--holiday-rotate-end': '226deg', '--holiday-opacity': '0.58' } },
    { key: 'sakura-d', type: 'sakura', style: { left: '48%', top: '-16%', width: '1.04rem', height: '1.46rem', animationDelay: '2.5s', animationDuration: '14.2s', '--holiday-drift-x': '-52px', '--holiday-rotate-start': '10deg', '--holiday-rotate-end': '214deg', '--holiday-opacity': '0.68' } },
    { key: 'sakura-e', type: 'sakura', style: { left: '66%', top: '-12%', width: '0.9rem', height: '1.22rem', animationDelay: '4.8s', animationDuration: '12.6s', '--holiday-drift-x': '36px', '--holiday-rotate-start': '-14deg', '--holiday-rotate-end': '206deg', '--holiday-opacity': '0.56' } },
    { key: 'sakura-f', type: 'sakura', style: { left: '82%', top: '-17%', width: '0.96rem', height: '1.34rem', animationDelay: '6.1s', animationDuration: '13.8s', '--holiday-drift-x': '-44px', '--holiday-rotate-start': '8deg', '--holiday-rotate-end': '218deg', '--holiday-opacity': '0.6' } },
  ],
  fireworks_gold: [
    { key: 'rocket-a', type: 'rocket', style: { left: '16%', bottom: '6%', width: '0.4rem', height: '5.4rem', animationDelay: '0.2s', animationDuration: '5s', '--holiday-rise-x': '10px', '--holiday-rise-y': '-62vh', '--holiday-opacity': '0.92' } },
    { key: 'firework-a', type: 'firework', style: { left: '12%', top: '12%', width: '4rem', height: '4rem', animationDelay: '1.35s', animationDuration: '3.8s', '--holiday-opacity': '0.86' } },
    { key: 'ember-a', type: 'ember', style: { left: '18%', top: '18%', width: '0.44rem', height: '0.44rem', animationDelay: '1.55s', animationDuration: '5.2s', '--holiday-drift-x': '22px', '--holiday-drift-y': '64px', '--holiday-opacity': '0.62' } },
    { key: 'rocket-b', type: 'rocket', style: { left: '62%', bottom: '8%', width: '0.36rem', height: '4.9rem', animationDelay: '1.8s', animationDuration: '4.7s', '--holiday-rise-x': '-6px', '--holiday-rise-y': '-54vh', '--holiday-opacity': '0.88' } },
    { key: 'firework-b', type: 'firework', style: { left: '58%', top: '18%', width: '3.4rem', height: '3.4rem', animationDelay: '2.95s', animationDuration: '3.5s', '--holiday-opacity': '0.82' } },
    { key: 'ember-b', type: 'ember', style: { left: '60%', top: '24%', width: '0.38rem', height: '0.38rem', animationDelay: '3.15s', animationDuration: '5.4s', '--holiday-drift-x': '-26px', '--holiday-drift-y': '58px', '--holiday-opacity': '0.56' } },
    { key: 'rocket-c', type: 'rocket', style: { left: '82%', bottom: '10%', width: '0.32rem', height: '4.4rem', animationDelay: '3.4s', animationDuration: '4.6s', '--holiday-rise-x': '6px', '--holiday-rise-y': '-34vh', '--holiday-opacity': '0.84' } },
    { key: 'firework-c', type: 'firework', style: { left: '78%', top: '42%', width: '2.9rem', height: '2.9rem', animationDelay: '4.45s', animationDuration: '3.6s', '--holiday-opacity': '0.78' } },
    { key: 'ember-c', type: 'ember', style: { left: '82%', top: '46%', width: '0.34rem', height: '0.34rem', animationDelay: '4.7s', animationDuration: '4.9s', '--holiday-drift-x': '18px', '--holiday-drift-y': '52px', '--holiday-opacity': '0.48' } },
  ],
  fireworks_rainbow: [
    { key: 'rainbow-rocket-a', type: 'rocket', style: { left: '16%', bottom: '6%', width: '0.4rem', height: '5.4rem', animationDelay: '0.2s', animationDuration: '5s', '--holiday-rise-x': '10px', '--holiday-rise-y': '-62vh', '--holiday-opacity': '0.92', '--holiday-rocket-core': '#ffffff', '--holiday-rocket-trail-start': '#fb7185', '--holiday-rocket-trail-mid': '#facc15', '--holiday-rocket-trail-end': 'rgba(56,189,248,0)' } },
    { key: 'rainbow-firework-a', type: 'firework', style: { left: '12%', top: '12%', width: '4rem', height: '4rem', animationDelay: '1.35s', animationDuration: '3.8s', '--holiday-opacity': '0.86', '--holiday-firework-core': 'rgba(255,255,255,0.96)', '--holiday-firework-primary': '#fb7185', '--holiday-firework-secondary': '#38bdf8' } },
    { key: 'rainbow-ember-a', type: 'ember', style: { left: '18%', top: '18%', width: '0.44rem', height: '0.44rem', animationDelay: '1.55s', animationDuration: '5.2s', '--holiday-drift-x': '22px', '--holiday-drift-y': '64px', '--holiday-opacity': '0.62', '--holiday-ember-core': '#facc15', '--holiday-ember-glow': '#fb7185' } },
    { key: 'rainbow-rocket-b', type: 'rocket', style: { left: '62%', bottom: '8%', width: '0.36rem', height: '4.9rem', animationDelay: '1.8s', animationDuration: '4.7s', '--holiday-rise-x': '-6px', '--holiday-rise-y': '-54vh', '--holiday-opacity': '0.88', '--holiday-rocket-core': '#ffffff', '--holiday-rocket-trail-start': '#a855f7', '--holiday-rocket-trail-mid': '#22c55e', '--holiday-rocket-trail-end': 'rgba(251,146,60,0)' } },
    { key: 'rainbow-firework-b', type: 'firework', style: { left: '58%', top: '18%', width: '3.4rem', height: '3.4rem', animationDelay: '2.95s', animationDuration: '3.5s', '--holiday-opacity': '0.82', '--holiday-firework-core': 'rgba(255,255,255,0.94)', '--holiday-firework-primary': '#facc15', '--holiday-firework-secondary': '#22c55e' } },
    { key: 'rainbow-ember-b', type: 'ember', style: { left: '60%', top: '24%', width: '0.38rem', height: '0.38rem', animationDelay: '3.15s', animationDuration: '5.4s', '--holiday-drift-x': '-26px', '--holiday-drift-y': '58px', '--holiday-opacity': '0.56', '--holiday-ember-core': '#38bdf8', '--holiday-ember-glow': '#a855f7' } },
    { key: 'rainbow-rocket-c', type: 'rocket', style: { left: '82%', bottom: '10%', width: '0.32rem', height: '4.4rem', animationDelay: '3.4s', animationDuration: '4.6s', '--holiday-rise-x': '6px', '--holiday-rise-y': '-34vh', '--holiday-opacity': '0.84', '--holiday-rocket-core': '#ffffff', '--holiday-rocket-trail-start': '#38bdf8', '--holiday-rocket-trail-mid': '#fb7185', '--holiday-rocket-trail-end': 'rgba(250,204,21,0)' } },
    { key: 'rainbow-firework-c', type: 'firework', style: { left: '78%', top: '42%', width: '2.9rem', height: '2.9rem', animationDelay: '4.45s', animationDuration: '3.6s', '--holiday-opacity': '0.78', '--holiday-firework-core': 'rgba(255,255,255,0.94)', '--holiday-firework-primary': '#a855f7', '--holiday-firework-secondary': '#fb7185' } },
    { key: 'rainbow-ember-c', type: 'ember', style: { left: '82%', top: '46%', width: '0.34rem', height: '0.34rem', animationDelay: '4.7s', animationDuration: '4.9s', '--holiday-drift-x': '18px', '--holiday-drift-y': '52px', '--holiday-opacity': '0.48', '--holiday-ember-core': '#22c55e', '--holiday-ember-glow': '#38bdf8' } },
  ],
  fireworks_champion: [
    { key: 'champion-rocket-a', type: 'rocket', style: { left: '16%', bottom: '6%', width: '0.42rem', height: '5.6rem', animationDelay: '0.2s', animationDuration: '5.1s', '--holiday-rise-x': '10px', '--holiday-rise-y': '-64vh', '--holiday-opacity': '0.94', '--holiday-rocket-core': '#ffffff', '--holiday-rocket-trail-start': '#fde68a', '--holiday-rocket-trail-mid': '#60a5fa', '--holiday-rocket-trail-end': 'rgba(255,255,255,0)' } },
    { key: 'champion-firework-a', type: 'firework', style: { left: '12%', top: '12%', width: '4rem', height: '4rem', animationDelay: '1.35s', animationDuration: '3.8s', '--holiday-opacity': '0.88', '--holiday-firework-core': 'rgba(255,255,255,0.98)', '--holiday-firework-primary': '#fde68a', '--holiday-firework-secondary': '#60a5fa' } },
    { key: 'champion-confetti-a', type: 'confetti', style: { left: '20%', top: '-6%', width: '0.62rem', height: '1.82rem', animationDelay: '1.5s', animationDuration: '9.2s', '--holiday-drift-x': '28px', '--holiday-rotate-start': '-18deg', '--holiday-rotate-end': '176deg', '--holiday-opacity': '0.68', '--holiday-confetti-start': '#facc15', '--holiday-confetti-end': '#1d4ed8' } },
    { key: 'champion-rocket-b', type: 'rocket', style: { left: '62%', bottom: '8%', width: '0.36rem', height: '4.9rem', animationDelay: '1.8s', animationDuration: '4.8s', '--holiday-rise-x': '-6px', '--holiday-rise-y': '-54vh', '--holiday-opacity': '0.9', '--holiday-rocket-core': '#ffffff', '--holiday-rocket-trail-start': '#facc15', '--holiday-rocket-trail-mid': '#1d4ed8', '--holiday-rocket-trail-end': 'rgba(255,255,255,0)' } },
    { key: 'champion-firework-b', type: 'firework', style: { left: '58%', top: '18%', width: '3.4rem', height: '3.4rem', animationDelay: '2.95s', animationDuration: '3.6s', '--holiday-opacity': '0.84', '--holiday-firework-core': 'rgba(255,255,255,0.96)', '--holiday-firework-primary': '#facc15', '--holiday-firework-secondary': '#93c5fd' } },
    { key: 'champion-confetti-b', type: 'confetti', style: { left: '64%', top: '-10%', width: '0.58rem', height: '1.72rem', animationDelay: '3.2s', animationDuration: '8.7s', '--holiday-drift-x': '-22px', '--holiday-rotate-start': '16deg', '--holiday-rotate-end': '184deg', '--holiday-opacity': '0.6', '--holiday-confetti-start': '#ffffff', '--holiday-confetti-end': '#60a5fa' } },
    { key: 'champion-rocket-c', type: 'rocket', style: { left: '82%', bottom: '10%', width: '0.32rem', height: '4.4rem', animationDelay: '3.4s', animationDuration: '4.7s', '--holiday-rise-x': '6px', '--holiday-rise-y': '-34vh', '--holiday-opacity': '0.86', '--holiday-rocket-core': '#ffffff', '--holiday-rocket-trail-start': '#fde68a', '--holiday-rocket-trail-mid': '#1d4ed8', '--holiday-rocket-trail-end': 'rgba(255,255,255,0)' } },
    { key: 'champion-firework-c', type: 'firework', style: { left: '78%', top: '42%', width: '2.9rem', height: '2.9rem', animationDelay: '4.45s', animationDuration: '3.7s', '--holiday-opacity': '0.8', '--holiday-firework-core': 'rgba(255,255,255,0.96)', '--holiday-firework-primary': '#f8fafc', '--holiday-firework-secondary': '#facc15' } },
    { key: 'champion-twinkle-a', type: 'twinkle', style: { left: '86%', top: '16%', width: '0.9rem', height: '0.9rem', animationDelay: '4.8s', animationDuration: '5.4s', '--holiday-opacity': '0.58', '--holiday-twinkle-primary': '#ffffff', '--holiday-twinkle-secondary': '#60a5fa', '--holiday-twinkle-tertiary': '#fde68a' } },
  ],
  starlight_confetti: [
    { key: 'confetti-a', type: 'confetti', style: { left: '10%', top: '-10%', width: '0.6rem', height: '1.8rem', animationDelay: '0s', animationDuration: '11.8s', '--holiday-drift-x': '42px', '--holiday-rotate-start': '-20deg', '--holiday-rotate-end': '160deg', '--holiday-opacity': '0.68' } },
    { key: 'confetti-b', type: 'confetti', style: { left: '24%', top: '-16%', width: '0.56rem', height: '1.54rem', animationDelay: '1.8s', animationDuration: '10.7s', '--holiday-drift-x': '-32px', '--holiday-rotate-start': '18deg', '--holiday-rotate-end': '182deg', '--holiday-opacity': '0.62' } },
    { key: 'confetti-c', type: 'confetti', style: { left: '44%', top: '-8%', width: '0.66rem', height: '1.92rem', animationDelay: '3.6s', animationDuration: '12.1s', '--holiday-drift-x': '28px', '--holiday-rotate-start': '-12deg', '--holiday-rotate-end': '176deg', '--holiday-opacity': '0.58' } },
    { key: 'confetti-d', type: 'confetti', style: { left: '68%', top: '-14%', width: '0.58rem', height: '1.72rem', animationDelay: '5.4s', animationDuration: '11.2s', '--holiday-drift-x': '-36px', '--holiday-rotate-start': '14deg', '--holiday-rotate-end': '188deg', '--holiday-opacity': '0.56' } },
    { key: 'twinkle-a', type: 'twinkle', style: { left: '18%', top: '20%', width: '0.84rem', height: '0.84rem', animationDelay: '0.8s', animationDuration: '5.6s', '--holiday-opacity': '0.56' } },
    { key: 'twinkle-b', type: 'twinkle', style: { left: '54%', top: '34%', width: '0.96rem', height: '0.96rem', animationDelay: '2.4s', animationDuration: '6.1s', '--holiday-opacity': '0.62' } },
    { key: 'twinkle-c', type: 'twinkle', style: { left: '86%', top: '16%', width: '0.78rem', height: '0.78rem', animationDelay: '4.2s', animationDuration: '5.2s', '--holiday-opacity': '0.52' } },
  ],
}

const shouldRender = computed(() => {
  return holidayTheme.value.enabled && holidayTheme.value.motionPreset && !prefersReducedMotion.value
})

const resolvedMotionPreset = computed(() => {
  return holidayTheme.value.motionPreset === 'fireworks_burst'
    ? 'fireworks_gold'
    : holidayTheme.value.motionPreset
})

const shouldCycleFireworkLayout = computed(() => {
  return shouldRender.value && isHolidayFireworksMotionPreset(resolvedMotionPreset.value)
})

const effectCssVars = computed(() => ({
  '--holiday-site-primary': holidayTheme.value.paletteValues?.decorationPrimary || 'rgba(255,255,255,0.7)',
  '--holiday-site-secondary': holidayTheme.value.paletteValues?.decorationSecondary || 'rgba(255,255,255,0.3)',
  '--holiday-site-tertiary': holidayTheme.value.paletteValues?.decorationTertiary || 'rgba(255,255,255,0.4)',
  '--holiday-site-glow': holidayTheme.value.paletteValues?.glow || 'rgba(255,255,255,0.18)',
}))

const buildEffectBatch = (nonce: string, phase = 'current'): MotionBatch => {
  return {
    id: `site-${nonce}`,
    phase,
    items: randomizeHolidayMotionItems(SITE_EFFECT_MAP[resolvedMotionPreset.value] || [], {
      seed: `${holidayTheme.value.token || 'holiday-theme'}:${nonce}:${resolvedMotionPreset.value}`,
      scope: 'site',
      includePhaseClones: !prefersReducedMotion.value,
    }),
  }
}

const updateReducedMotionPreference = () => {
  prefersReducedMotion.value = reducedMotionQuery?.matches ?? false
}

const clearLayoutCleanup = () => {
  if (!layoutCleanupTimer) return
  clearTimeout(layoutCleanupTimer)
  layoutCleanupTimer = null
}

const stopLayoutRefresh = () => {
  if (!layoutRefreshTimer) return
  clearInterval(layoutRefreshTimer)
  layoutRefreshTimer = null
}

const resetEffectBatches = () => {
  clearLayoutCleanup()
  effectBatches.value = [buildEffectBatch(createHolidayMotionLayoutNonce())]
}

const queueEffectBatchCrossfade = () => {
  clearLayoutCleanup()

  const nextBatch = buildEffectBatch(createHolidayMotionLayoutNonce(), 'entering')
  effectBatches.value = [
    ...effectBatches.value.map((batch) => ({ ...batch, phase: 'leaving' })),
    nextBatch,
  ]

  layoutCleanupTimer = setTimeout(() => {
    effectBatches.value = [{ ...nextBatch, phase: 'current' }]
    layoutCleanupTimer = null
  }, HOLIDAY_LAYOUT_BATCH_CROSSFADE_MS)
}

const startLayoutRefresh = () => {
  stopLayoutRefresh()

  if (!shouldCycleFireworkLayout.value) return

  layoutRefreshTimer = setInterval(() => {
    queueEffectBatchCrossfade()
  }, HOLIDAY_FIREWORKS_LAYOUT_REFRESH_MS)
}

watch(
  [
    () => holidayTheme.value.token || 'holiday-theme',
    () => resolvedMotionPreset.value,
    () => holidayTheme.value.enabled,
    () => prefersReducedMotion.value,
  ],
  () => {
    resetEffectBatches()
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
})

onUnmounted(() => {
  stopLayoutRefresh()
  clearLayoutCleanup()
  reducedMotionQuery?.removeEventListener?.('change', updateReducedMotionPreference)
})
</script>

<style scoped>
.holiday-site-effects-fade {
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.06), transparent 14%, transparent 86%, rgba(255, 255, 255, 0.05)),
    radial-gradient(circle at top left, rgba(255, 255, 255, 0.05), transparent 32%),
    radial-gradient(circle at bottom right, rgba(255, 255, 255, 0.04), transparent 28%);
}

.holiday-site-effect {
  pointer-events: none;
  will-change: transform, opacity;
}

.holiday-site-batch {
  pointer-events: none;
}

.holiday-site-batch--current {
  opacity: 1;
}

.holiday-site-batch--entering {
  animation: holidaySiteBatchEnter 1.6s ease both;
}

.holiday-site-batch--leaving {
  animation: holidaySiteBatchExit 1.6s ease both;
}

.holiday-site-effect--petal {
  background: linear-gradient(135deg, var(--holiday-site-primary), var(--holiday-site-secondary));
  border-radius: 78% 22% 76% 20%;
  box-shadow: 0 14px 34px -16px var(--holiday-site-glow);
  animation: holidaySitePetalFall linear infinite;
}

.holiday-site-effect--sakura {
  background:
    radial-gradient(circle at 30% 30%, color-mix(in srgb, var(--holiday-site-tertiary) 86%, transparent) 0 14%, transparent 16%),
    linear-gradient(135deg, var(--holiday-site-primary), var(--holiday-site-secondary));
  border-radius: 80% 38% 76% 28%;
  box-shadow: 0 16px 34px -18px var(--holiday-site-glow);
  animation: holidaySitePetalFall linear infinite;
}

.holiday-site-effect--orb {
  border-radius: 9999px;
  background: radial-gradient(
    circle,
    var(--holiday-site-primary-override, var(--holiday-site-primary)) 0%,
    var(--holiday-site-secondary-override, var(--holiday-site-secondary)) 62%,
    transparent 72%
  );
  box-shadow: 0 0 24px -8px var(--holiday-site-primary-override, var(--holiday-site-primary));
  animation: holidaySiteGlowDrift ease-in-out infinite;
}

.holiday-site-effect--heart {
  color: var(--holiday-site-primary);
  filter: drop-shadow(0 0 12px color-mix(in srgb, var(--holiday-site-secondary) 58%, transparent));
  animation: holidaySiteHeartRise ease-in infinite;
}

.holiday-site-effect--snowflake {
  background:
    linear-gradient(90deg, transparent 44%, var(--holiday-site-primary) 44% 56%, transparent 56%),
    linear-gradient(0deg, transparent 44%, var(--holiday-site-primary) 44% 56%, transparent 56%),
    linear-gradient(45deg, transparent 46%, var(--holiday-site-tertiary) 46% 54%, transparent 54%),
    linear-gradient(-45deg, transparent 46%, var(--holiday-site-tertiary) 46% 54%, transparent 54%),
    radial-gradient(circle, color-mix(in srgb, var(--holiday-site-primary) 82%, white) 0 20%, transparent 22%);
  filter: drop-shadow(0 0 12px color-mix(in srgb, var(--holiday-site-tertiary) 62%, transparent));
  animation: holidaySiteSnowfall linear infinite;
}

.holiday-site-effect--rocket {
  background:
    radial-gradient(circle at 50% 10%, var(--holiday-rocket-core, var(--holiday-site-tertiary)) 0 18%, transparent 20%),
    linear-gradient(
      180deg,
      color-mix(in srgb, var(--holiday-rocket-trail-start, var(--holiday-site-secondary)) 86%, transparent) 0%,
      color-mix(in srgb, var(--holiday-rocket-trail-mid, var(--holiday-site-primary)) 78%, transparent) 26%,
      color-mix(in srgb, var(--holiday-rocket-trail-end, var(--holiday-site-secondary)) 48%, transparent) 62%,
      transparent 100%
    );
  border-radius: 9999px;
  filter: drop-shadow(0 0 12px color-mix(in srgb, var(--holiday-rocket-trail-start, var(--holiday-site-secondary)) 62%, transparent));
  transform-origin: center bottom;
  animation: holidaySiteRocketLaunch cubic-bezier(0.22, 0.61, 0.36, 1) infinite;
}

.holiday-site-effect--firework {
  border-radius: 9999px;
  background:
    radial-gradient(circle, color-mix(in srgb, var(--holiday-firework-core, var(--holiday-site-tertiary)) 94%, transparent) 0 10%, transparent 12%),
    repeating-conic-gradient(
      from 0deg,
      var(--holiday-firework-primary, var(--holiday-site-primary)) 0deg 10deg,
      transparent 10deg 20deg,
      var(--holiday-firework-secondary, var(--holiday-site-secondary)) 20deg 28deg,
      transparent 28deg 40deg
    );
  -webkit-mask: radial-gradient(circle, transparent 0 14%, #000 18% 100%);
  mask: radial-gradient(circle, transparent 0 14%, #000 18% 100%);
  filter: drop-shadow(0 0 14px color-mix(in srgb, var(--holiday-firework-primary, var(--holiday-site-primary)) 58%, transparent));
  animation: holidaySiteFireworkBurst ease-out infinite;
}

.holiday-site-effect--ember {
  border-radius: 9999px;
  background: radial-gradient(circle, var(--holiday-ember-core, var(--holiday-site-primary)) 0%, var(--holiday-ember-glow, var(--holiday-site-secondary)) 58%, transparent 72%);
  box-shadow: 0 0 14px -4px var(--holiday-ember-core, var(--holiday-site-primary));
  animation: holidaySiteEmberFall ease-out infinite;
}

.holiday-site-effect--confetti {
  background: linear-gradient(
    180deg,
    var(--holiday-confetti-start, var(--holiday-site-primary)),
    color-mix(in srgb, var(--holiday-confetti-end, var(--holiday-site-secondary)) 70%, var(--holiday-site-tertiary))
  );
  border-radius: 9999px;
  box-shadow: 0 12px 24px -16px var(--holiday-site-glow);
  animation: holidaySiteConfettiFall linear infinite;
}

.holiday-site-effect--twinkle {
  background:
    radial-gradient(circle, var(--holiday-twinkle-tertiary, var(--holiday-site-tertiary)) 0 18%, transparent 20%),
    linear-gradient(90deg, transparent 42%, var(--holiday-twinkle-primary, var(--holiday-site-primary)) 42% 58%, transparent 58%),
    linear-gradient(0deg, transparent 42%, var(--holiday-twinkle-secondary, var(--holiday-site-secondary)) 42% 58%, transparent 58%);
  filter: drop-shadow(0 0 10px color-mix(in srgb, var(--holiday-twinkle-primary, var(--holiday-site-primary)) 48%, transparent));
  animation: holidaySiteTwinkle ease-in-out infinite;
}

@keyframes holidaySitePetalFall {
  0% {
    transform: translate3d(0, -10vh, 0) rotate(var(--holiday-rotate-start, -12deg));
    opacity: 0;
  }
  12% {
    opacity: var(--holiday-opacity, 0.45);
  }
  100% {
    transform: translate3d(var(--holiday-drift-x, 36px), 115vh, 0) rotate(var(--holiday-rotate-end, 196deg));
    opacity: 0;
  }
}

@keyframes holidaySiteHeartRise {
  0% {
    transform: translate3d(0, 8vh, 0) scale(0.86);
    opacity: 0;
  }
  18% {
    opacity: var(--holiday-opacity, 0.24);
  }
  100% {
    transform: translate3d(var(--holiday-drift-x, 14px), -118vh, 0) scale(1.14);
    opacity: 0;
  }
}

@keyframes holidaySiteSnowfall {
  0% {
    transform: translate3d(0, -12vh, 0) rotate(var(--holiday-rotate-start, 0deg)) scale(0.82);
    opacity: 0;
  }
  14% {
    opacity: var(--holiday-opacity, 0.7);
  }
  100% {
    transform: translate3d(var(--holiday-drift-x, 18px), 112vh, 0) rotate(var(--holiday-rotate-end, 180deg)) scale(1.04);
    opacity: 0;
  }
}

@keyframes holidaySiteGlowDrift {
  0%,
  100% {
    transform: translate3d(0, 0, 0) scale(0.94);
    opacity: 0.1;
  }
  50% {
    transform: translate3d(var(--holiday-drift-x, 24px), var(--holiday-drift-y, 28px), 0) scale(1.1);
    opacity: var(--holiday-opacity, 0.26);
  }
}

@keyframes holidaySiteFireworkBurst {
  0% {
    transform: scale(0.26);
    opacity: 0;
  }
  20% {
    opacity: var(--holiday-opacity, 0.74);
  }
  100% {
    transform: scale(1.26);
    opacity: 0;
  }
}

@keyframes holidaySiteRocketLaunch {
  0% {
    transform: translate3d(0, 0, 0) scaleY(0.38);
    opacity: 0;
  }
  14% {
    opacity: calc(var(--holiday-opacity, 0.88) * 0.72);
  }
  74% {
    transform: translate3d(var(--holiday-rise-x, 0), var(--holiday-rise-y, -56vh), 0) scaleY(1);
    opacity: var(--holiday-opacity, 0.88);
  }
  100% {
    transform: translate3d(var(--holiday-rise-x, 0), calc(var(--holiday-rise-y, -56vh) - 2vh), 0) scaleY(0.8);
    opacity: 0;
  }
}

@keyframes holidaySiteEmberFall {
  0% {
    transform: translate3d(0, 0, 0) scale(0.72);
    opacity: 0;
  }
  18% {
    opacity: var(--holiday-opacity, 0.42);
  }
  100% {
    transform: translate3d(var(--holiday-drift-x, 18px), var(--holiday-drift-y, 56px), 0) scale(1.08);
    opacity: 0;
  }
}

@keyframes holidaySiteConfettiFall {
  0% {
    transform: translate3d(0, -12vh, 0) rotate(var(--holiday-rotate-start, -12deg));
    opacity: 0;
  }
  14% {
    opacity: var(--holiday-opacity, 0.48);
  }
  100% {
    transform: translate3d(var(--holiday-drift-x, 30px), 110vh, 0) rotate(var(--holiday-rotate-end, 172deg));
    opacity: 0;
  }
}

@keyframes holidaySiteTwinkle {
  0%,
  100% {
    transform: scale(0.72);
    opacity: 0.18;
  }
  50% {
    transform: scale(1.08);
    opacity: var(--holiday-opacity, 0.58);
  }
}

@keyframes holidaySiteBatchEnter {
  0% {
    opacity: 0;
  }
  100% {
    opacity: 1;
  }
}

@keyframes holidaySiteBatchExit {
  0% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}

@media (max-width: 767px) {
  .holiday-site-effects-fade {
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.05), transparent 18%, transparent 82%, rgba(255, 255, 255, 0.04));
  }
}

@media (prefers-reduced-motion: reduce) {
  .holiday-site-batch--entering,
  .holiday-site-batch--leaving {
    animation: none !important;
  }
}
</style>
