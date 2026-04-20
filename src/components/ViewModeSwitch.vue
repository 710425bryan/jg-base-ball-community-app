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
  const baseClass = 'flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-all duration-200'

  return props.modelValue === mode
    ? `${baseClass} border border-white/90 bg-white text-primary shadow-[0_1px_2px_rgba(15,23,42,0.08)]`
    : `${baseClass} border border-transparent text-gray-400 hover:bg-white/70 hover:text-gray-600`
}
</script>

<template>
  <div class="inline-flex items-center rounded-2xl border border-gray-200 bg-[#f4f5f7] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.75),0_1px_2px_rgba(15,23,42,0.04)]">
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
