<script setup lang="ts">
import PerformanceMemberDetailPage from '@/components/performance/PerformanceMemberDetailPage.vue'
import { PHYSICAL_TESTS_FEATURE } from '@/types/performance'
</script>

<template>
  <PerformanceMemberDetailPage :kind="PHYSICAL_TESTS_FEATURE" />
</template>
