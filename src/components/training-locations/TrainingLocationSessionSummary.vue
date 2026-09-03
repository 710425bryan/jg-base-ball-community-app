<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'

import type { TrainingLocationSession } from '@/types/trainingLocation'
import { CHUNGGANG_SCHOOL_TEAM_PROGRAM_KEY } from '@/utils/trainingPrograms'

const props = defineProps<{
  session: Pick<TrainingLocationSession, 'program_key' | 'venue_count' | 'assignment_count' | 'venues'>
}>()

const showRoleBreakdown = computed(() =>
  props.session.program_key === CHUNGGANG_SCHOOL_TEAM_PROGRAM_KEY
)

const MOBILE_VIEWPORT_MEDIA_QUERY = '(max-width: 767px)'
const isMobileViewport = ref(false)
let mobileViewportMediaQuery: MediaQueryList | null = null

const handleMobileViewportChange = (event: MediaQueryListEvent) => {
  isMobileViewport.value = event.matches
}

onMounted(() => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return

  mobileViewportMediaQuery = window.matchMedia(MOBILE_VIEWPORT_MEDIA_QUERY)
  isMobileViewport.value = mobileViewportMediaQuery.matches

  if (typeof mobileViewportMediaQuery.addEventListener === 'function') {
    mobileViewportMediaQuery.addEventListener('change', handleMobileViewportChange)
  } else {
    mobileViewportMediaQuery.addListener(handleMobileViewportChange)
  }
})

onUnmounted(() => {
  if (!mobileViewportMediaQuery) return

  if (typeof mobileViewportMediaQuery.removeEventListener === 'function') {
    mobileViewportMediaQuery.removeEventListener('change', handleMobileViewportChange)
  } else {
    mobileViewportMediaQuery.removeListener(handleMobileViewportChange)
  }
})

const venueSummaries = computed(() =>
  props.session.venues.map((venue, index) => {
    const memberCount = venue.member_ids.length
    const memberIds = new Set(venue.member_ids)
    const assignedMembers = venue.assignments.filter((member) => memberIds.has(member.member_id))
    const leaveMembers = Array.from(
      new Map(
        assignedMembers
          .filter((member) => member.is_on_leave)
          .map((member) => [member.member_id, member])
      ).values()
    )
    const sortByName = (left: typeof leaveMembers[number], right: typeof leaveMembers[number]) =>
      left.name.localeCompare(right.name, 'zh-Hant')

    return {
      key: venue.id || `${venue.venue_name || 'venue'}-${index}`,
      label: `場地 ${index + 1}${venue.venue_name.trim() ? `・${venue.venue_name.trim()}` : ''}`,
      memberCount,
      communityCount: assignedMembers.filter((member) => member.role === '球員').length,
      schoolTeamCount: assignedMembers.filter((member) => member.role === '校隊').length,
      attendingCount: Math.max(memberCount - leaveMembers.length, 0),
      leaveCount: leaveMembers.length,
      communityLeaveMembers: leaveMembers.filter((member) => member.role === '球員').sort(sortByName),
      schoolTeamLeaveMembers: leaveMembers.filter((member) => member.role === '校隊').sort(sortByName)
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
        <div v-if="showRoleBreakdown" data-test="training-location-venue-role-counts" class="mt-0.5 flex flex-wrap gap-x-2 text-[10px]">
          <span data-test="training-location-venue-community-count" class="text-emerald-700">
            社區 {{ venue.communityCount }} 人
          </span>
          <span data-test="training-location-venue-school-team-count" class="text-sky-700">
            校隊 {{ venue.schoolTeamCount }} 人
          </span>
        </div>
        <div class="mt-0.5 flex flex-wrap gap-x-2 text-[10px]">
          <span data-test="training-location-venue-attending-count" class="text-emerald-700">
            上課 {{ venue.attendingCount }} 人
          </span>
          <span v-if="venue.leaveCount === 0" data-test="training-location-venue-leave-count" class="text-slate-400">
            請假 {{ venue.leaveCount }} 人
          </span>
          <el-popover
            v-else
            :trigger="isMobileViewport ? 'click' : 'hover'"
            placement="top"
            :width="260"
            :show-after="isMobileViewport ? 0 : 150"
          >
            <template #reference>
              <button
                type="button"
                data-test="training-location-venue-leave-count"
                class="min-h-11 cursor-pointer rounded-md px-1 text-amber-700 underline decoration-dotted underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 md:min-h-0"
                :aria-label="`請假 ${venue.leaveCount} 人，查看社區與校隊請假球員`"
              >
                請假 {{ venue.leaveCount }} 人
              </button>
            </template>

            <div data-test="training-location-leave-tooltip" class="text-left">
              <div class="font-black text-slate-800">{{ venue.label }}請假球員</div>
              <div class="mt-3 max-h-72 space-y-3 overflow-y-auto pr-1">
                <section data-test="training-location-community-leave-group">
                  <div class="flex items-center justify-between gap-3 text-xs font-black text-emerald-700">
                    <span>社區</span>
                    <span>{{ venue.communityLeaveMembers.length }} 人</span>
                  </div>
                  <ul v-if="venue.communityLeaveMembers.length > 0" class="mt-1.5 flex flex-wrap gap-1.5">
                    <li
                      v-for="member in venue.communityLeaveMembers"
                      :key="member.member_id"
                      class="rounded-md bg-emerald-50 px-2 py-1 text-xs font-bold text-emerald-800"
                    >
                      {{ member.name }}
                    </li>
                  </ul>
                  <div v-else class="mt-1 text-xs font-semibold text-slate-400">無</div>
                </section>

                <section data-test="training-location-school-team-leave-group" class="border-t border-slate-200 pt-3">
                  <div class="flex items-center justify-between gap-3 text-xs font-black text-sky-700">
                    <span>校隊</span>
                    <span>{{ venue.schoolTeamLeaveMembers.length }} 人</span>
                  </div>
                  <ul v-if="venue.schoolTeamLeaveMembers.length > 0" class="mt-1.5 flex flex-wrap gap-1.5">
                    <li
                      v-for="member in venue.schoolTeamLeaveMembers"
                      :key="member.member_id"
                      class="rounded-md bg-sky-50 px-2 py-1 text-xs font-bold text-sky-800"
                    >
                      {{ member.name }}
                    </li>
                  </ul>
                  <div v-else class="mt-1 text-xs font-semibold text-slate-400">無</div>
                </section>
              </div>
            </div>
          </el-popover>
        </div>
      </li>
    </ul>
  </div>
</template>
