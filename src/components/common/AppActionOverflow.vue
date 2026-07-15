<script setup lang="ts">
import { MoreFilled } from '@element-plus/icons-vue'

withDefaults(defineProps<{
  ariaLabel?: string
  title?: string
  disabled?: boolean
}>(), {
  ariaLabel: '更多操作',
  title: '更多操作',
  disabled: false
})

const emit = defineEmits<{
  (event: 'command', command: unknown): void
}>()
</script>

<template>
  <el-dropdown
    trigger="click"
    :disabled="disabled"
    @command="emit('command', $event)"
  >
    <button
      type="button"
      class="app-icon-button"
      :aria-label="ariaLabel"
      :title="title"
      :disabled="disabled"
    >
      <el-icon><MoreFilled /></el-icon>
    </button>

    <template #dropdown>
      <el-dropdown-menu>
        <slot />
      </el-dropdown-menu>
    </template>
  </el-dropdown>
</template>
