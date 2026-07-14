<script setup lang="ts">
defineOptions({ inheritAttrs: false })

withDefaults(defineProps<{
  modelValue: string
  placeholder?: string
  ariaLabel?: string
}>(), {
  placeholder: '搜尋',
  ariaLabel: '搜尋'
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
  clear: []
}>()

const handleInput = (event: Event) => {
  emit('update:modelValue', (event.target as HTMLInputElement).value)
}

const clearSearch = () => {
  emit('update:modelValue', '')
  emit('clear')
}
</script>

<template>
  <div v-bind="$attrs" class="app-search-input relative min-w-0">
    <svg
      class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>

    <input
      :value="modelValue"
      type="search"
      inputmode="search"
      enterkeyhint="search"
      autocomplete="off"
      autocapitalize="off"
      :placeholder="placeholder"
      :aria-label="ariaLabel"
      class="min-h-11 w-full appearance-none rounded-lg border border-slate-200 bg-white py-2.5 pl-10 pr-11 text-base leading-6 text-slate-700 outline-none transition-colors placeholder:text-slate-400 focus:border-primary focus:ring-2 focus:ring-primary/15"
      @input="handleInput"
      @search="handleInput"
    />

    <button
      v-if="modelValue"
      type="button"
      aria-label="清除搜尋"
      class="absolute right-1 top-1/2 flex min-h-9 min-w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
      @click="clearSearch"
    >
      <svg viewBox="0 0 24 24" class="h-4 w-4" fill="currentColor" aria-hidden="true">
        <path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm3.54 12.12-1.42 1.42L12 13.41l-2.12 2.13-1.42-1.42L10.59 12 8.46 9.88l1.42-1.42L12 10.59l2.12-2.13 1.42 1.42L13.41 12l2.13 2.12Z" />
      </svg>
    </button>
  </div>
</template>

<style scoped>
.app-search-input input::-webkit-search-cancel-button {
  display: none;
}
</style>
