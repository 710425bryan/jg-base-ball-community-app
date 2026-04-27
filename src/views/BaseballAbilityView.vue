<script setup lang="ts">
import PerformanceRecordsPage from '@/components/performance/PerformanceRecordsPage.vue'
import { BASEBALL_ABILITY_FEATURE } from '@/types/performance'
</script>

<template>
  <PerformanceRecordsPage :kind="BASEBALL_ABILITY_FEATURE" />
</template>
