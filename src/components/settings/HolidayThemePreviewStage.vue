<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'

import HomeHolidayHeroOverlay from '@/components/home/HomeHolidayHeroOverlay.vue'
import {
  HOLIDAY_THEME_MOTION_LABELS,
  HOLIDAY_THEME_MOTION_PICKER_OPTIONS,
  buildHolidayThemeDisplayState,
} from '@/composables/useHolidayTheme'

const PREVIEW_MOTION_SEQUENCE = HOLIDAY_THEME_MOTION_PICKER_OPTIONS.map((item) => item.value)
const MOTION_LABELS = HOLIDAY_THEME_MOTION_LABELS as Record<string, string>

const TEXTS = {
  previewing: '\u76ee\u524d\u9810\u89bd',
  selected: '\u6b63\u5f0f\u5957\u7528',
  reducedMotion: '\u88dd\u7f6e\u5df2\u555f\u7528\u6e1b\u5c11\u52d5\u614b\uff0c\u9810\u89bd\u6703\u7dad\u6301\u76ee\u524d\u9078\u64c7\u7684 preset\u3002',
}

const props = defineProps<{
  theme: any
}>()

const prefersReducedMotion = ref(false)

let reducedMotionQuery: MediaQueryList | null = null

const selectedMotionPreset = computed(() => {
  return props.theme?.motionPreset && PREVIEW_MOTION_SEQUENCE.includes(props.theme.motionPreset)
    ? props.theme.motionPreset
    : PREVIEW_MOTION_SEQUENCE[0]
})

const displayedMotionPreset = computed(() => selectedMotionPreset.value)

const previewMotionLabel = computed(() => {
  return MOTION_LABELS[displayedMotionPreset.value] || displayedMotionPreset.value
})

const selectedMotionLabel = computed(() => {
  return MOTION_LABELS[selectedMotionPreset.value] || selectedMotionPreset.value
})

const previewTheme = computed(() => {
  return buildHolidayThemeDisplayState({
    ...props.theme,
    enabled: true,
    motionPreset: displayedMotionPreset.value,
  })
})

const stageBackdropStyle = {
  backgroundImage: "url('/hero-bg.jpg')",
}

const updateReducedMotionPreference = () => {
  prefersReducedMotion.value = reducedMotionQuery?.matches ?? false
}

onMounted(() => {
  if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
    reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    updateReducedMotionPreference()
    reducedMotionQuery.addEventListener?.('change', updateReducedMotionPreference)
  }
})

onUnmounted(() => {
  reducedMotionQuery?.removeEventListener?.('change', updateReducedMotionPreference)
})
</script>

<template>
  <div class="rounded-[30px] border border-slate-200 bg-white p-3 shadow-sm">
    <div class="flex flex-wrap items-center gap-2">
      <span
        class="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-black tracking-wide text-amber-700"
      >
        {{ TEXTS.selected }}: {{ selectedMotionLabel }}
      </span>
      <span
        class="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-black tracking-wide text-sky-700"
        data-test="holiday-preview-current-motion"
      >
        {{ TEXTS.previewing }}: {{ previewMotionLabel }}
      </span>
    </div>

    <div class="mt-3 relative overflow-hidden rounded-[28px] border border-slate-900/10 bg-slate-950 shadow-[0_18px_60px_-30px_rgba(15,23,42,0.95)]">
      <div class="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(217,144,38,0.2),transparent_42%),radial-gradient(circle_at_bottom_right,rgba(14,165,233,0.18),transparent_36%)]"></div>
      <div
        class="absolute inset-0 bg-cover bg-center opacity-30 mix-blend-screen"
        :style="stageBackdropStyle"
      ></div>
      <div class="absolute inset-0 bg-[linear-gradient(180deg,rgba(15,23,42,0.28),rgba(15,23,42,0.92))]"></div>
      <div class="absolute right-[-7rem] top-0 hidden h-full w-[42%] skew-x-[-18deg] bg-[#D99026]/30 md:block"></div>

      <div class="relative h-[360px]">
        <HomeHolidayHeroOverlay :theme-override="previewTheme" />

        <div class="absolute bottom-4 left-4 right-4 z-20 flex items-end justify-between gap-4 pointer-events-none">
          <div class="rounded-2xl border border-white/10 bg-slate-950/45 px-4 py-3 backdrop-blur-sm">
            <div class="text-[11px] font-black uppercase tracking-[0.24em] text-white/60">Preview</div>
            <div class="mt-2 flex items-center gap-2">
              <span
                v-for="preset in PREVIEW_MOTION_SEQUENCE"
                :key="preset"
                class="h-2.5 w-8 rounded-full transition-all duration-300"
                :class="preset === displayedMotionPreset ? 'bg-white shadow-[0_0_18px_rgba(255,255,255,0.5)]' : 'bg-white/25'"
              ></span>
            </div>
          </div>

          <div class="hidden rounded-2xl border border-white/10 bg-slate-950/45 px-4 py-3 text-right backdrop-blur-sm sm:block">
            <div class="text-[11px] font-black uppercase tracking-[0.24em] text-white/60">Hero Stage</div>
            <div class="mt-2 text-sm font-semibold text-white/90">{{ previewTheme.label }}</div>
          </div>
        </div>
      </div>
    </div>

    <p
      v-if="prefersReducedMotion"
      class="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs leading-6 text-slate-500"
    >
      {{ TEXTS.reducedMotion }}
    </p>
  </div>
</template>
