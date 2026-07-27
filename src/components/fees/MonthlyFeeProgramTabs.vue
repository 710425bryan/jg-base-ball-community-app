<script setup lang="ts">
export type MonthlyFeeProgramTabOption = {
  value: string
  label: string
  memberCount: number
}

defineProps<{
  modelValue: string
  options: MonthlyFeeProgramTabOption[]
}>()

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void
}>()
</script>

<template>
  <div
    class="flex w-full gap-1.5 overflow-x-auto rounded-2xl border border-slate-200 bg-slate-50 p-1.5"
    role="tablist"
    aria-label="月費訓練項目"
  >
    <button
      v-for="option in options"
      :id="`monthly-fee-program-tab-${option.value}`"
      :key="option.value"
      type="button"
      role="tab"
      class="inline-flex min-h-11 min-w-[8.5rem] flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-black transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
      :class="modelValue === option.value
        ? 'bg-primary text-white shadow-sm'
        : 'bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-800'"
      :aria-selected="modelValue === option.value"
      aria-controls="monthly-fee-program-panel"
      @click="emit('update:modelValue', option.value)"
    >
      <span>{{ option.label }}</span>
      <span
        class="rounded-full px-2 py-0.5 text-xs font-black"
        :class="modelValue === option.value ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'"
      >
        {{ option.memberCount }} 人
      </span>
    </button>
  </div>
</template>
