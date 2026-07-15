<script setup lang="ts">
import { computed } from 'vue'

type ViewMode = 'grid' | 'table'

const props = withDefaults(defineProps<{
  modelValue: ViewMode
  gridLabel?: string
  tableLabel?: string
}>(), {
  gridLabel: '網格',
  tableLabel: '表格'
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: ViewMode): void
}>()

// List pages should reuse this switch so grid/table mode stays visually consistent.
const options = computed<Array<{ value: ViewMode; label: string; icon: 'grid' | 'table' }>>(() => [
  { value: 'grid', label: props.gridLabel, icon: 'grid' },
  { value: 'table', label: props.tableLabel, icon: 'table' }
])

const getButtonClass = (mode: ViewMode) => {
  const baseClass = 'flex h-11 min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-0 text-sm font-bold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2'

  return props.modelValue === mode
    ? `${baseClass} border border-orange-200/80 bg-orange-50 text-primary`
    : `${baseClass} border border-transparent text-slate-500 hover:bg-slate-200/70 hover:text-slate-700`
}
</script>

<template>
  <div
    class="inline-flex h-11 shrink-0 items-stretch overflow-hidden rounded-xl bg-slate-100/80 ring-1 ring-inset ring-slate-200"
    role="group"
    aria-label="檢視模式"
  >
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      :aria-pressed="modelValue === option.value"
      :class="getButtonClass(option.value)"
      @click="emit('update:modelValue', option.value)"
    >
      <svg
        v-if="option.icon === 'grid'"
        xmlns="http://www.w3.org/2000/svg"
        class="h-4 w-4 shrink-0"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <rect x="4" y="4" width="6" height="6" rx="1.5" />
        <rect x="14" y="4" width="6" height="6" rx="1.5" />
        <rect x="4" y="14" width="6" height="6" rx="1.5" />
        <rect x="14" y="14" width="6" height="6" rx="1.5" />
      </svg>

      <svg
        v-else
        xmlns="http://www.w3.org/2000/svg"
        class="h-4 w-4 shrink-0"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="M6 7h14" />
        <path d="M6 12h14" />
        <path d="M6 17h14" />
        <path d="M3.5 7h.01" />
        <path d="M3.5 12h.01" />
        <path d="M3.5 17h.01" />
      </svg>

      <span>{{ option.label }}</span>
    </button>
  </div>
</template>
