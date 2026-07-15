<script setup lang="ts">
import { Close } from '@element-plus/icons-vue'

withDefaults(defineProps<{
  modelValue: boolean
  title?: string
  activeCount?: number
  clearLabel?: string
  confirmLabel?: string
  clearDisabled?: boolean
}>(), {
  title: '篩選',
  activeCount: 0,
  clearLabel: '清除',
  confirmLabel: '完成',
  clearDisabled: false
})

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void
  (event: 'clear'): void
  (event: 'confirm'): void
}>()

const close = () => emit('update:modelValue', false)

const confirm = () => {
  emit('confirm')
  close()
}
</script>

<template>
  <el-drawer
    :model-value="modelValue"
    direction="btt"
    size="auto"
    :title="title"
    :with-header="false"
    append-to-body
    modal-class="app-mobile-filter-overlay"
    class="app-mobile-filter-sheet"
    @close="close"
  >
    <div class="app-mobile-filter-sheet__layout">
      <div class="app-mobile-filter-sheet__handle" aria-hidden="true" />

      <header class="app-mobile-filter-sheet__header">
        <div class="min-w-0">
          <h2 class="text-base font-black text-slate-800">{{ title }}</h2>
          <p v-if="activeCount > 0" class="mt-1 text-xs font-bold text-primary">
            已套用 {{ activeCount }} 個條件
          </p>
        </div>
        <button
          type="button"
          class="app-icon-button !rounded-full !border-0 !bg-slate-50"
          aria-label="關閉篩選"
          title="關閉篩選"
          @click="close"
        >
          <el-icon><Close /></el-icon>
        </button>
      </header>

      <div class="app-mobile-filter-sheet__body">
        <slot />
      </div>

      <footer class="app-mobile-filter-sheet__footer">
        <el-button
          class="app-mobile-filter-sheet__button"
          :disabled="clearDisabled"
          @click="$emit('clear')"
        >
          {{ clearLabel }}
        </el-button>
        <el-button
          type="primary"
          class="app-mobile-filter-sheet__button"
          @click="confirm"
        >
          {{ confirmLabel }}
        </el-button>
      </footer>
    </div>
  </el-drawer>
</template>
