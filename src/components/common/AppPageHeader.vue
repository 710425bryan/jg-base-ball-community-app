<script setup lang="ts">
import type { Component } from 'vue'

withDefaults(defineProps<{
  title: string
  subtitle?: string
  icon: Component
  as?: 'h1' | 'h2'
}>(), {
  as: 'h1'
})
</script>

<template>
  <header class="app-page-header">
    <div v-if="$slots.before" class="app-page-header-before">
      <slot name="before" />
    </div>

    <div class="app-page-header-main">
      <div class="app-page-heading">
        <component :is="as" class="app-page-title app-page-title--inline">
          <el-icon class="app-page-title-icon">
            <component :is="icon" />
          </el-icon>
          <span class="app-page-title-text">{{ title }}</span>
          <slot name="title-suffix" />
        </component>
        <p v-if="subtitle || $slots.subtitle" class="app-page-subtitle">
          <slot name="subtitle">{{ subtitle }}</slot>
        </p>
      </div>

      <div v-if="$slots.actions" class="app-page-header-actions">
        <slot name="actions" />
      </div>
    </div>
  </header>
</template>
