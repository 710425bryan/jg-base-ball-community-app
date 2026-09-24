<script setup lang="ts">
import { computed } from 'vue'
import { Delete } from '@element-plus/icons-vue'
import type { TrainingLocationRosterMember } from '@/types/trainingLocation'
import { isNoFeeBillingMember } from '@/utils/memberBilling'
import { groupTrainingLocationMembers } from '@/utils/trainingLocationMemberGroups'

const props = defineProps<{ members: TrainingLocationRosterMember[] }>()
const emit = defineEmits<{ remove: [memberId: string] }>()
const groups = computed(() => groupTrainingLocationMembers(props.members))

const getMemberMeta = (member: TrainingLocationRosterMember) =>
  [member.role || '球員', member.team_group, member.jersey_number ? `#${member.jersey_number}` : null]
    .filter(Boolean).join('｜')
</script>

<template>
  <div class="mt-4 space-y-4">
    <section v-for="group in groups" :key="group.key" data-test="venue-member-group">
      <h4 class="mb-2 flex flex-wrap items-center gap-2 border-b border-slate-100 pb-2 text-base font-black text-sky-700">
        <span class="min-w-0 break-words">{{ group.role }}｜{{ group.teamGroup }}</span>
        <span class="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">{{ group.members.length }} 人</span>
      </h4>
      <div class="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        <div
          v-for="member in group.members"
          :key="member.member_id"
          data-test="venue-member"
          :data-member-id="member.member_id"
          class="flex min-w-0 items-center justify-between gap-2 rounded-xl border px-3 py-2"
          :class="isNoFeeBillingMember(member)
            ? 'border-slate-200 bg-slate-100 text-slate-400'
            : member.is_on_leave
              ? 'border-amber-100 bg-amber-50 text-amber-800'
              : 'border-slate-100 bg-slate-50 text-slate-700'"
        >
          <div class="min-w-0">
            <div class="flex min-w-0 items-center gap-2">
              <span class="truncate text-sm font-black">{{ member.name }}</span>
              <span v-if="isNoFeeBillingMember(member)" class="shrink-0 rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-black text-slate-500">不收費</span>
            </div>
            <div class="break-words text-xs font-bold opacity-70">{{ getMemberMeta(member) }}<span v-if="member.is_on_leave">｜已請假</span></div>
          </div>
          <button
            type="button"
            class="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white hover:text-red-500"
            :aria-label="`移除${member.name}`"
            :title="`移除${member.name}`"
            @click="emit('remove', member.member_id)"
          >
            <el-icon><Delete /></el-icon>
          </button>
        </div>
      </div>
    </section>
    <div v-if="members.length === 0" class="rounded-xl border border-dashed border-slate-200 px-3 py-5 text-center text-sm font-bold text-slate-400">
      拖曳或移入球員到這個場地。
    </div>
  </div>
</template>
