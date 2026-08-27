<script setup lang="ts">
import { computed } from 'vue'

import type { TrainingLocationSession } from '@/types/trainingLocation'

const props = defineProps<{
  session: Pick<TrainingLocationSession, 'venue_count' | 'assignment_count' | 'venues'>
}>()

const venueSummaries = computed(() =>
  props.session.venues.map((venue, index) => ({
    key: venue.id || `${venue.venue_name || 'venue'}-${index}`,
    label: `場地 ${index + 1}${venue.venue_name.trim() ? `・${venue.venue_name.trim()}` : ''}`,
    memberCount: venue.member_ids.length
  }))
)
</script>

<template>
  <div class="min-w-0">
    <div data-test="training-location-session-total">
      {{ session.venue_count }} 場地｜{{ session.assignment_count }} 人
    </div>
    <ul
      v-if="venueSummaries.length > 0"
      aria-label="各場地人數"
      class="mt-1 flex flex-wrap gap-1.5"
    >
      <li
        v-for="venue in venueSummaries"
        :key="venue.key"
        data-test="training-location-venue-count"
        class="inline-flex max-w-full items-center rounded-md bg-slate-100 px-2 py-1 text-[11px] font-black text-slate-500"
      >
        <span class="truncate">{{ venue.label }}</span>
        <span class="shrink-0">：{{ venue.memberCount }} 人</span>
      </li>
    </ul>
  </div>
</template>
