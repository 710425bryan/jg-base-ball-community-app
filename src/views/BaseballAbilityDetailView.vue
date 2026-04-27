<script setup lang="ts">
import PerformanceMemberDetailPage from '@/components/performance/PerformanceMemberDetailPage.vue'
import { BASEBALL_ABILITY_FEATURE } from '@/types/performance'
</script>

<template>
  <PerformanceMemberDetailPage :kind="BASEBALL_ABILITY_FEATURE" />
</template>
