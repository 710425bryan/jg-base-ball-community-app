<script setup lang="ts">
import { computed } from 'vue'

import type { TrainingLocationSession } from '@/types/trainingLocation'

const props = defineProps<{
  session: Pick<TrainingLocationSession, 'venue_count' | 'assignment_count' | 'venues'>
}>()

const venueSummaries = computed(() =>
  props.session.venues.map((venue, index) => {
    const memberCount = venue.member_ids.length
    const memberIds = new Set(venue.member_ids)
    const leaveCount = new Set(
      venue.assignments
        .filter((member) => member.is_on_leave && memberIds.has(member.member_id))
        .map((member) => member.member_id)
    ).size

    return {
      key: venue.id || `${venue.venue_name || 'venue'}-${index}`,
      label: `場地 ${index + 1}${venue.venue_name.trim() ? `・${venue.venue_name.trim()}` : ''}`,
      memberCount,
      attendingCount: Math.max(memberCount - leaveCount, 0),
      leaveCount
    }
  })
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
        class="max-w-full rounded-md bg-slate-100 px-2 py-1 text-[11px] font-black text-slate-500"
      >
        <div class="flex min-w-0 items-center">
          <span class="truncate">{{ venue.label }}</span>
          <span data-test="training-location-venue-total-count" class="shrink-0">：{{ venue.memberCount }} 人</span>
        </div>
        <div class="mt-0.5 flex flex-wrap gap-x-2 text-[10px]">
          <span data-test="training-location-venue-attending-count" class="text-emerald-700">
            上課 {{ venue.attendingCount }} 人
          </span>
          <span data-test="training-location-venue-leave-count" :class="venue.leaveCount > 0 ? 'text-amber-700' : 'text-slate-400'">
            請假 {{ venue.leaveCount }} 人
          </span>
        </div>
      </li>
    </ul>
  </div>
</template>
