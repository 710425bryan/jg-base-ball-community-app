<script setup lang="ts">
import PerformanceRecordsPage from '@/components/performance/PerformanceRecordsPage.vue'
import { PHYSICAL_TESTS_FEATURE } from '@/types/performance'
</script>

<template>
  <PerformanceRecordsPage :kind="PHYSICAL_TESTS_FEATURE" />
</template>
