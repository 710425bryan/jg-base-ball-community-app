<script setup lang="ts">
import {
  canChangeCoachLeave, formatCoachLeaveDateRange, formatCoachLeaveTimeSegment, getTaiwanToday
} from '@/utils/coachLeaveRequests'
import type { CoachLeaveRequest } from '@/types/coachLeaveRequest'

defineProps<{
  leaves: CoachLeaveRequest[]
  highlightId?: string
  canEdit: boolean
  canCancel: boolean
  cancellingId?: string
}>()

const emit = defineEmits<{
  (e: 'edit', leave: CoachLeaveRequest): void
  (e: 'cancel', leave: CoachLeaveRequest): void
}>()

const readOnlyText = (leave: CoachLeaveRequest) => leave.status === 'cancelled'
  ? '已取消假單保留紀錄，不能恢復。'
  : leave.end_date < getTaiwanToday() ? '已結束的歷史假單為唯讀。' : '目前為唯讀模式。'
</script>

<template>
  <section class="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-white" data-test="coach-leave-table">
    <div class="overflow-x-auto">
      <table class="w-full min-w-[860px] text-left text-sm">
        <thead class="border-b border-slate-200 bg-slate-50 text-xs font-bold text-slate-500">
          <tr>
            <th scope="col" class="px-4 py-3">教練</th>
            <th scope="col" class="px-4 py-3">請假日期</th>
            <th scope="col" class="px-4 py-3">時段</th>
            <th scope="col" class="px-4 py-3">狀態</th>
            <th scope="col" class="px-4 py-3">原因</th>
            <th scope="col" class="px-4 py-3 text-right">操作</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100">
          <tr
            v-for="leave in leaves"
            :id="`coach-leave-${leave.id}`"
            :key="leave.id"
            data-test="coach-leave-row"
            class="align-top"
            :class="leave.id === highlightId ? 'bg-primary/5 outline outline-2 -outline-offset-2 outline-primary/40' : ''"
          >
            <td class="px-4 py-3 font-black text-slate-800">{{ leave.coach_nickname || leave.coach_name }}</td>
            <td class="whitespace-nowrap px-4 py-3 font-bold text-slate-700">{{ formatCoachLeaveDateRange(leave.start_date, leave.end_date) }}</td>
            <td class="whitespace-nowrap px-4 py-3 text-slate-600">{{ formatCoachLeaveTimeSegment(leave.time_segment) }}</td>
            <td class="px-4 py-3">
              <span class="whitespace-nowrap rounded-full px-3 py-1 text-xs font-bold" :class="leave.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'">{{ leave.status === 'active' ? '有效' : '已取消' }}</span>
            </td>
            <td class="max-w-[260px] whitespace-pre-line break-words px-4 py-3 text-slate-600">{{ leave.reason || '未填寫原因' }}</td>
            <td class="px-4 py-3">
              <div v-if="canChangeCoachLeave(leave) && (canEdit || canCancel)" class="flex justify-end gap-2">
                <el-button v-if="canEdit" class="!ml-0 !min-h-11" data-test="edit-leave" @click="emit('edit', leave)">修改</el-button>
                <el-button v-if="canCancel" type="danger" plain class="!ml-0 !min-h-11" :loading="cancellingId === leave.id" :disabled="!!cancellingId" data-test="cancel-leave" @click="emit('cancel', leave)">取消假單</el-button>
              </div>
              <p v-else class="ml-auto max-w-[180px] text-right text-xs text-slate-500">{{ readOnlyText(leave) }}</p>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
