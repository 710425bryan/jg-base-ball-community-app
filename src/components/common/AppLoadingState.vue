<script setup lang="ts">
import { computed } from 'vue'
import { Loading } from '@element-plus/icons-vue'

const props = withDefaults(defineProps<{
  text?: string
  fixed?: boolean
  screen?: boolean
  minHeight?: string
}>(), {
  text: '載入中...',
  fixed: false,
  screen: false,
  minHeight: '45vh'
})

const containerStyle = computed(() => {
  if (props.fixed || props.screen) return undefined
  return { minHeight: props.minHeight }
})
</script>

<template>
  <div
    class="app-loading-state"
    :class="{
      'app-loading-state--fixed': fixed,
      'app-loading-state--screen': screen
    }"
    :style="containerStyle"
    role="status"
    aria-live="polite"
  >
    <div class="app-loading-state__inner">
      <el-icon class="app-loading-state__icon is-loading" aria-hidden="true">
        <Loading />
      </el-icon>
      <span class="app-loading-state__text">{{ text }}</span>
    </div>
  </div>
</template>

<style scoped>
.app-loading-state {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: center;
  padding: 2rem 1.5rem;
}

.app-loading-state--fixed {
  position: fixed;
  inset: 0;
  z-index: 100;
  min-height: 100vh;
  background: var(--color-background, #f8fafc);
}

.app-loading-state--screen {
  min-height: 100vh;
  background: var(--color-background, #f8fafc);
}

.app-loading-state__inner {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  color: #64748b;
  font-size: 0.9375rem;
  font-weight: 700;
  line-height: 1.5;
}

.app-loading-state__icon {
  flex: 0 0 auto;
  color: #f59e0b;
  font-size: 1.25rem;
}

.app-loading-state__text {
  min-width: 0;
}
</style>
