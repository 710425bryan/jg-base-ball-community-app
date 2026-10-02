<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Calendar, Filter, Plus, Refresh } from '@element-plus/icons-vue'
import AppPageHeader from '@/components/common/AppPageHeader.vue'
import AppLoadingState from '@/components/common/AppLoadingState.vue'
import AppMobileFilterSheet from '@/components/common/AppMobileFilterSheet.vue'
import CoachLeaveRequestDialog from '@/components/coach-leave/CoachLeaveRequestDialog.vue'
import '@/components/coach-schedules/coachFeatureTheme.css'
import { useAuthStore } from '@/stores/auth'
import { usePermissionsStore } from '@/stores/permissions'
import { coachLeaveRequestsApi } from '@/services/coachLeaveRequestsApi'
import { getProfileAccessState } from '@/utils/profileAccess'
import {
  canChangeCoachLeave, formatCoachLeaveDateRange, formatCoachLeaveTimeSegment,
  getTaiwanToday, isActiveCoachProfile, normalizeCoachLeaveError
} from '@/utils/coachLeaveRequests'
import type { SchedulableCoach } from '@/types/coachSchedule'
import type { CoachLeaveBatchCreateInput, CoachLeaveRequest, CoachLeaveSaveInput, CoachLeaveStatusFilter } from '@/types/coachLeaveRequest'

const props = withDefaults(defineProps<{ manage?: boolean }>(), { manage: false })
const authStore = useAuthStore()
const permissionsStore = usePermissionsStore()
const route = useRoute()
const feature = computed(() => props.manage ? 'coach_leave_requests' : 'my_coach_leave_requests')
const eligible = computed(() => props.manage
  ? !!authStore.profile && getProfileAccessState(authStore.profile).allowed
  : isActiveCoachProfile(authStore.profile))
const canView = computed(() => eligible.value && permissionsStore.can(feature.value, 'VIEW'))
const canCreate = computed(() => canView.value && permissionsStore.can(feature.value, 'CREATE'))
const canEdit = computed(() => canView.value && permissionsStore.can(feature.value, 'EDIT'))
const canCancel = computed(() => canView.value && permissionsStore.can(feature.value, 'DELETE'))
const highlightId = computed(() => typeof route.query.highlight_leave_id === 'string' ? route.query.highlight_leave_id : '')
const selectedMonth = ref<string>(highlightId.value ? '' : getTaiwanToday().slice(0, 7))
const selectedCoachId = ref('')
const selectedStatus = ref<CoachLeaveStatusFilter>('all')
const coaches = ref<SchedulableCoach[]>([])
const leaves = ref<CoachLeaveRequest[]>([])
const isLoading = ref(false)
const errorMessage = ref('')
const filtersOpen = ref(false)
const dialogOpen = ref(false)
const editingLeave = ref<CoachLeaveRequest | null>(null)
const saving = ref(false)
const dialogError = ref('')
const cancellingId = ref('')
let loadRevision = 0
const ownCoachName = computed(() => authStore.profile?.nickname || authStore.profile?.name || '本人')
const filterCoaches = computed(() => {
  const options = new Map(coaches.value.map((coach) => [coach.id, coach]))
  for (const leave of leaves.value) {
    if (!options.has(leave.coach_profile_id)) options.set(leave.coach_profile_id, {
      id: leave.coach_profile_id, name: leave.coach_name, nickname: leave.coach_nickname,
      role: '', avatar_url: null
    })
  }
  return [...options.values()]
})
const highlightMissing = computed(() => highlightId.value && !leaves.value.some((leave) => leave.id === highlightId.value))
const statuses: { value: CoachLeaveStatusFilter; label: string }[] = [
  { value: 'all', label: '全部' }, { value: 'active', label: '有效假單' }, { value: 'cancelled', label: '已取消' }
]

const load = async () => {
  const revision = ++loadRevision
  errorMessage.value = ''
  if (!canView.value) { leaves.value = []; coaches.value = []; isLoading.value = false; return }
  isLoading.value = true
  try {
    const result = await coachLeaveRequestsApi.list({
      month: selectedMonth.value || null, status: selectedStatus.value,
      coachProfileId: props.manage ? selectedCoachId.value || null : null, manage: props.manage
    })
    if (revision !== loadRevision) return
    leaves.value = result.leaves
    coaches.value = result.coaches
    await nextTick()
    if (highlightId.value) document.getElementById(`coach-leave-${highlightId.value}`)?.scrollIntoView?.({ block: 'nearest' })
  } catch (error) {
    if (revision !== loadRevision) return
    leaves.value = []
    errorMessage.value = normalizeCoachLeaveError(error)
  } finally { if (revision === loadRevision) isLoading.value = false }
}

const resetFilters = () => { selectedMonth.value = ''; selectedCoachId.value = ''; selectedStatus.value = 'all' }
watch(() => props.manage, () => {
  leaves.value = []; coaches.value = []; selectedCoachId.value = ''; dialogOpen.value = false; editingLeave.value = null
})
watch(highlightId, (id) => { if (id) resetFilters() })
watch([selectedMonth, selectedCoachId, selectedStatus, canView, () => props.manage, highlightId], load, { immediate: true })

const openCreate = () => {
  if (!canCreate.value) return
  editingLeave.value = null; dialogError.value = ''; dialogOpen.value = true
}
const openEdit = (leave: CoachLeaveRequest) => {
  if (!canEdit.value || !canChangeCoachLeave(leave)) return
  editingLeave.value = leave; dialogError.value = ''; dialogOpen.value = true
}
const notifyChanged = () => window.dispatchEvent(new Event('coach-leave-changed'))
const loadClassDates = async (month: string) => {
  if (!canView.value) throw new Error('目前帳號沒有查看上課日期的權限。')
  return coachLeaveRequestsApi.trainingDates(month, props.manage)
}
const createBatch = async (input: CoachLeaveBatchCreateInput, requestId: string) => {
  if (saving.value || editingLeave.value || !canCreate.value) return
  saving.value = true; dialogError.value = ''
  try {
    const ids = await coachLeaveRequestsApi.createBatch(input, props.manage, requestId)
    dialogOpen.value = false
    ElMessage.success(`已送出 ${ids.length} 筆教練假單。`)
    notifyChanged()
    await load()
  } catch (error) { dialogError.value = normalizeCoachLeaveError(error) }
  finally { saving.value = false }
}
const save = async (input: CoachLeaveSaveInput, requestId: string | null) => {
  if (saving.value || !editingLeave.value || !canEdit.value) return
  saving.value = true; dialogError.value = ''
  try {
    await coachLeaveRequestsApi.save(input, props.manage, requestId)
    dialogOpen.value = false
    ElMessage.success('教練假單已儲存。')
    notifyChanged()
    await load()
  } catch (error) { dialogError.value = normalizeCoachLeaveError(error) }
  finally { saving.value = false }
}
const cancel = async (leave: CoachLeaveRequest) => {
  if (!canCancel.value || !canChangeCoachLeave(leave) || cancellingId.value) return
  try {
    await ElMessageBox.confirm('取消後會保留假單紀錄，不會自動恢復已移除的教練指派，需由管理者重新排班；已取消假單不能恢復。', '取消教練假單', {
      confirmButtonText: '確認取消假單', cancelButtonText: '保留假單', type: 'warning'
    })
  } catch { return }
  if (!canCancel.value || !canChangeCoachLeave(leave) || cancellingId.value) return
  cancellingId.value = leave.id
  try {
    await coachLeaveRequestsApi.cancel(leave.id, leave.updated_at, props.manage)
    ElMessage.success('教練假單已取消。')
    notifyChanged()
    await load()
  } catch (error) { ElMessage.error(normalizeCoachLeaveError(error)) }
  finally { cancellingId.value = '' }
}
</script>

<template>
  <div class="coach-feature-theme min-h-full bg-slate-50 px-3 py-4 pb-5 md:px-6">
    <div class="mx-auto max-w-6xl space-y-4">
      <AppPageHeader :title="manage ? '教練請假管理' : '我的教練假單'" :icon="Calendar" subtitle="假單儲存後立即生效，重疊時段的教練指派會移除並標示待補人。">
        <template #actions>
          <el-button class="!ml-0 !min-h-11" :loading="isLoading" :icon="Refresh" aria-label="重新整理假單" @click="load">重新整理</el-button>
          <el-button v-if="canCreate" type="primary" class="!ml-0 !min-h-11" :icon="Plus" data-test="create-leave" @click="openCreate">新增假單</el-button>
        </template>
      </AppPageHeader>

      <p v-if="!canView" class="rounded-2xl border border-slate-200 bg-white p-6 text-slate-600" data-test="no-access">
        {{ manage ? '目前帳號沒有教練請假管理權限。' : '目前帳號不是有效教練，或尚未開啟我的教練假單權限。' }}
      </p>
      <template v-else>
        <section class="rounded-2xl border border-slate-200 bg-white p-4">
          <div class="flex min-w-0 flex-wrap items-end gap-3">
            <div class="min-w-0 flex-1 md:flex-none md:w-56">
              <div id="coach-leave-month-label" class="mb-2 text-sm font-bold text-slate-700">請假月份</div>
              <el-date-picker v-model="selectedMonth" type="month" format="YYYY 年 MM 月" value-format="YYYY-MM" size="large" class="!w-full" placeholder="全部月份" clearable aria-labelledby="coach-leave-month-label" />
            </div>
            <div v-if="manage" class="hidden w-64 md:block">
              <div id="coach-leave-filter-label" class="mb-2 text-sm font-bold text-slate-700">教練</div>
              <el-select v-model="selectedCoachId" filterable clearable size="large" class="w-full" placeholder="全部教練" aria-labelledby="coach-leave-filter-label">
                <el-option label="全部教練" value="" />
                <el-option v-for="coach in filterCoaches" :key="coach.id" :label="coach.nickname || coach.name" :value="coach.id" />
              </el-select>
            </div>
            <button v-if="manage" type="button" class="app-icon-button md:hidden" aria-label="篩選教練" title="篩選教練" @click="filtersOpen = true"><el-icon><Filter /></el-icon></button>
          </div>
          <div class="mt-3 flex flex-wrap gap-2" aria-label="假單狀態">
            <button v-for="status in statuses" :key="status.value" type="button" :aria-pressed="selectedStatus === status.value" class="min-h-11 rounded-xl border px-4 text-sm font-bold" :class="selectedStatus === status.value ? 'border-primary bg-primary/5 text-primary' : 'border-slate-200 text-slate-600'" @click="selectedStatus = status.value">{{ status.label }}</button>
          </div>
        </section>

        <p v-if="errorMessage" role="alert" class="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{{ errorMessage }}</p>
        <AppLoadingState v-if="isLoading" text="讀取教練假單中..." />
        <template v-else-if="!errorMessage">
          <p v-if="highlightMissing" class="rounded-xl bg-amber-50 p-4 text-sm text-amber-800">目前篩選找不到指定假單，可能已異動或不在您的可見範圍。</p>
          <p v-if="!leaves.length" class="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500">目前沒有符合條件的教練假單。</p>
          <div v-else class="grid min-w-0 gap-3 md:grid-cols-2">
            <article v-for="leave in leaves" :id="`coach-leave-${leave.id}`" :key="leave.id" data-test="coach-leave-card" class="min-w-0 rounded-2xl border bg-white p-4" :class="leave.id === highlightId ? 'border-primary ring-2 ring-primary/20' : 'border-slate-200'">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <h2 class="break-words text-base font-black text-slate-800">{{ leave.coach_nickname || leave.coach_name }}</h2>
                  <p class="mt-1 break-words text-sm font-bold text-slate-700">{{ formatCoachLeaveDateRange(leave.start_date, leave.end_date) }}</p>
                  <p class="mt-1 text-sm text-slate-600">{{ formatCoachLeaveTimeSegment(leave.time_segment) }}</p>
                </div>
                <span class="shrink-0 rounded-full px-3 py-1 text-xs font-bold" :class="leave.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'">{{ leave.status === 'active' ? '有效' : '已取消' }}</span>
              </div>
              <p class="mt-3 whitespace-pre-line break-words text-sm text-slate-600">{{ leave.reason || '未填寫原因' }}</p>
              <div v-if="canChangeCoachLeave(leave) && (canEdit || canCancel)" class="mt-4 flex flex-wrap justify-end gap-2">
                <el-button v-if="canEdit" class="!ml-0 !min-h-11" data-test="edit-leave" @click="openEdit(leave)">修改</el-button>
                <el-button v-if="canCancel" type="danger" plain class="!ml-0 !min-h-11" :loading="cancellingId === leave.id" :disabled="!!cancellingId" data-test="cancel-leave" @click="cancel(leave)">取消假單</el-button>
              </div>
              <p v-else class="mt-4 text-xs text-slate-500">{{ leave.status === 'cancelled' ? '已取消假單保留紀錄，不能恢復。' : leave.end_date < getTaiwanToday() ? '已結束的歷史假單為唯讀。' : '目前為唯讀模式。' }}</p>
            </article>
          </div>
        </template>
      </template>
    </div>

    <AppMobileFilterSheet v-model="filtersOpen" title="篩選教練" :active-count="selectedCoachId ? 1 : 0" @clear="selectedCoachId = ''">
      <div class="mb-2 text-sm font-bold text-slate-700">教練</div>
      <el-select v-model="selectedCoachId" filterable clearable size="large" class="w-full" placeholder="全部教練" aria-label="篩選教練">
        <el-option label="全部教練" value="" />
        <el-option v-for="coach in filterCoaches" :key="coach.id" :label="coach.nickname || coach.name" :value="coach.id" />
      </el-select>
    </AppMobileFilterSheet>
    <CoachLeaveRequestDialog v-model="dialogOpen" :manage="manage" :leave="editingLeave" :coaches="coaches" :own-coach-name="ownCoachName" :saving="saving" :server-error="dialogError" :load-class-dates="loadClassDates" @save="save" @create="createBatch" />
  </div>
</template>
