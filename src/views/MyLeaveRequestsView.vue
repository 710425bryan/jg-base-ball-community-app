<template>
  <div class="h-full flex flex-col relative animate-fade-in bg-gray-50 text-text overflow-hidden">
    <div class="bg-white px-4 md:px-6 py-4 border-b border-gray-200 shadow-sm shrink-0">
      <div class="max-w-6xl mx-auto flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 class="app-page-title">我的假單</h2>
          <p class="app-page-subtitle">
            查看關聯成員的假單紀錄，並可直接送出新的請假申請
          </p>
        </div>

        <div class="flex gap-2 w-full sm:w-auto">
          <button
            type="button"
            class="flex-1 sm:flex-none rounded-2xl border border-gray-200 text-gray-600 hover:text-gray-800 hover:border-gray-300 font-bold px-4 py-3 transition-colors"
            :disabled="isRefreshing"
            @click="refreshCurrentMemberData"
          >
            {{ isRefreshing ? '更新中...' : '重新整理' }}
          </button>

          <button
            type="button"
            class="flex-1 sm:flex-none rounded-2xl bg-primary hover:bg-primary-hover text-white font-bold px-5 py-3 transition-colors disabled:opacity-70"
            :disabled="!canCreateLeaveRequest || isRefreshing"
            @click="openCreateDialog"
          >
            新增假單
          </button>
        </div>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto min-h-0 p-4 md:p-6 pb-[calc(4.5rem+env(safe-area-inset-bottom)+20px)] md:pb-6 custom-scrollbar">
      <div v-if="isBootstrapping" class="min-h-[50vh] flex items-center justify-center">
        <div class="flex items-center gap-3 text-gray-500 font-bold">
          <el-icon class="is-loading text-primary text-2xl"><Loading /></el-icon>
          讀取假單資訊中...
        </div>
      </div>

      <div v-else class="max-w-6xl mx-auto flex flex-col gap-4">
        <section
          v-if="members.length === 0"
          class="bg-white rounded-3xl border border-gray-100 shadow-sm p-8 md:p-10 text-center"
        >
          <div class="text-xl font-black text-slate-800">目前沒有可操作的關聯成員</div>
          <p class="mt-3 text-sm text-gray-500 leading-relaxed">
            你的帳號尚未綁定任何成員，若需要送出假單，請先請管理員在使用者名單完成成員綁定。
          </p>
        </section>

        <template v-else>
          <section class="bg-white rounded-3xl border border-gray-100 shadow-sm p-5 md:p-6">
            <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div class="w-full lg:max-w-md">
                <label class="text-xs font-bold uppercase tracking-[0.18em] text-gray-400">送假成員</label>
                <el-select
                  v-model="selectedMemberId"
                  class="w-full mt-2"
                  size="large"
                  placeholder="請選擇成員"
                >
                  <el-option
                    v-for="member in members"
                    :key="member.member_id"
                    :label="buildMemberOptionLabel(member)"
                    :value="member.member_id"
                  />
                </el-select>
                <p class="mt-2 text-xs text-gray-400">
                  {{ memberSelectorHelperText }}
                </p>
              </div>

              <div
                v-if="selectedMember"
                class="rounded-2xl border border-primary/15 bg-primary/5 px-4 py-3 text-sm text-primary font-bold"
              >
                目前送假對象：{{ selectedMember.name }} / {{ selectedMember.role }}
              </div>
            </div>
          </section>

          <section class="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
            <div class="px-5 md:px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
              <div>
                <h3 class="text-lg font-black text-slate-800">假單紀錄</h3>
                <p class="text-xs text-gray-400 mt-1">
                  只顯示目前所選關聯成員的假單，送出後會通知具請假查看權限的人員
                </p>
              </div>

              <div v-if="selectedMember" class="text-sm font-bold text-gray-500">
                {{ selectedMember.name }}
              </div>
            </div>

            <div v-if="isRefreshing" class="p-6 text-sm text-gray-400 font-bold">
              讀取最新假單中...
            </div>

            <div v-else-if="leaveRequests.length === 0" class="p-6 text-sm text-gray-400 font-bold">
              目前沒有假單紀錄。
            </div>

            <div v-else class="p-4 md:p-5 grid gap-3 md:grid-cols-2">
              <article
                v-for="leave in leaveRequests"
                :key="leave.id"
                class="rounded-2xl border border-gray-100 bg-gray-50/70 p-4 shadow-sm"
              >
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <div class="text-lg font-black text-slate-800">{{ formatLeaveDateRange(leave.start_date, leave.end_date) }}</div>
                    <div class="text-xs text-gray-400 mt-1">{{ leave.member_name }} / {{ leave.member_role || '未分類' }}</div>
                  </div>

                  <div class="flex items-center gap-2">
                    <span :class="getLeaveBadgeClass(leave.leave_type)" class="inline-flex rounded-full px-3 py-1 text-xs font-bold border whitespace-nowrap">
                      {{ leave.leave_type }}
                    </span>
                    <button
                      type="button"
                      class="rounded-xl border border-red-100 bg-red-50 p-2 text-red-500 hover:bg-red-100 transition-colors"
                      title="刪除假單"
                      @click="confirmDelete(leave)"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>

                <div class="mt-4 grid gap-2 text-sm text-gray-600">
                  <div class="flex items-center justify-between gap-3">
                    <span class="text-gray-400">建立時間</span>
                    <span class="font-medium text-right">{{ formatDateTime(leave.created_at) }}</span>
                  </div>
                  <div class="flex items-start justify-between gap-3">
                    <span class="text-gray-400 shrink-0">原因</span>
                    <span class="font-medium text-right whitespace-pre-line break-words">{{ leave.reason || '無說明' }}</span>
                  </div>
                </div>
              </article>
            </div>
          </section>
        </template>
      </div>
    </div>

    <el-dialog
      v-model="isCreateDialogOpen"
      title="新增假單"
      width="90%"
      style="max-width: 500px; border-radius: 16px;"
      destroy-on-close
      class="custom-dialog"
    >
      <el-form ref="formRef" :model="form" :rules="formRules" label-position="top" class="mt-4 space-y-4">
        <div class="rounded-2xl border border-primary/15 bg-primary/5 px-4 py-3 text-sm font-bold text-primary">
          目前送假成員：{{ selectedMember?.name || '尚未選擇' }}
        </div>

        <div class="flex gap-4 w-full flex-col sm:flex-row">
          <el-form-item label="請假類別" prop="leave_type" class="font-bold flex-1 mb-0 sm:mb-4">
            <el-select v-model="form.leave_type" size="large" class="w-full">
              <el-option
                v-for="option in LEAVE_TYPE_OPTIONS"
                :key="option"
                :label="option"
                :value="option"
              />
            </el-select>
          </el-form-item>
        </div>

        <el-form-item label="請假模式" prop="leave_mode" class="font-bold mb-5">
          <el-radio-group v-model="form.leave_mode" class="w-full flex custom-segmented">
            <el-radio-button
              v-for="option in LEAVE_MODE_OPTIONS"
              :key="option"
              :label="option"
              class="flex-1"
            />
          </el-radio-group>
        </el-form-item>

        <template v-if="form.leave_mode === '單日請假'">
          <el-form-item label="請假日期" prop="date_single" class="font-bold">
            <el-date-picker
              v-model="form.date_single"
              type="date"
              placeholder="選擇日期"
              format="YYYY-MM-DD"
              value-format="YYYY-MM-DD"
              size="large"
              class="!w-full"
            />
          </el-form-item>
        </template>

        <template v-else-if="form.leave_mode === '連續多日'">
          <el-form-item label="請假日期區間" prop="date_range" class="font-bold">
            <el-date-picker
              v-model="form.date_range"
              type="daterange"
              range-separator="至"
              start-placeholder="開始日期"
              end-placeholder="結束日期"
              format="YYYY-MM-DD"
              value-format="YYYY-MM-DD"
              size="large"
              class="!w-full"
            />
          </el-form-item>
        </template>

        <template v-else-if="form.leave_mode === '固定週期'">
          <div class="bg-purple-50/40 rounded-xl p-4 border border-purple-100 flex flex-col gap-4 mb-4">
            <el-form-item label="固定星期請假" class="font-bold text-primary mb-0 custom-week-selector">
              <el-checkbox-group v-model="form.recurring_days" size="default" class="w-full flex justify-between sm:justify-start gap-1 sm:gap-2">
                <el-checkbox-button
                  v-for="option in LEAVE_WEEKDAY_OPTIONS"
                  :key="option.value"
                  :label="option.value"
                >
                  {{ option.label }}
                </el-checkbox-button>
              </el-checkbox-group>
            </el-form-item>

            <el-form-item label="生效期限 (必填)" class="font-bold text-primary mb-0">
              <el-date-picker
                v-model="form.recurring_range"
                type="daterange"
                range-separator="至"
                start-placeholder="開始日期"
                end-placeholder="結束日期"
                format="YYYY-MM-DD"
                value-format="YYYY-MM-DD"
                class="!w-full"
              />
            </el-form-item>
          </div>
        </template>

        <el-form-item label="請假原因說明" prop="reason" class="font-bold">
          <el-input v-model="form.reason" type="textarea" :rows="3" placeholder="請簡述請假事由 (選填)" />
          <p class="text-sm text-gray-400 font-normal mt-1 w-full">
            假單送出後將自動生效，並同步通知具請假查看權限的相關人員。
          </p>
        </el-form-item>
      </el-form>

      <template #footer>
        <div class="flex justify-end gap-3 mt-4">
          <button
            type="button"
            class="rounded-2xl border border-gray-200 text-gray-600 hover:text-gray-800 hover:border-gray-300 font-bold px-5 py-3 transition-colors"
            @click="isCreateDialogOpen = false"
          >
            取消
          </button>

          <button
            type="button"
            class="rounded-2xl bg-primary hover:bg-primary-hover text-white font-bold px-6 py-3 transition-colors disabled:opacity-70"
            :disabled="isSubmitting"
            @click="submitLeaveRequest"
          >
            {{ isSubmitting ? '送出中...' : '送出假單' }}
          </button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Loading } from '@element-plus/icons-vue'
import {
  createMyLeaveRequests,
  deleteMyLeaveRequest,
  listMyLeaveMembers,
  listMyLeaveRequests
} from '@/services/myLeaveRequests'
import type {
  LeaveRequestFormState,
  MyLeaveMember,
  MyLeaveRequest
} from '@/types/leaveRequests'
import {
  buildLeaveNotificationDateLabel,
  buildLeaveRequestRecords,
  createDefaultLeaveRequestFormState,
  LEAVE_MODE_OPTIONS,
  LEAVE_TYPE_OPTIONS,
  LEAVE_WEEKDAY_OPTIONS,
  leaveRequestBaseRules
} from '@/utils/leaveRequests'
import {
  buildGroupedPushEventKey,
  describePushDispatchIssue,
  dispatchPushNotification
} from '@/utils/pushNotifications'

const members = ref<MyLeaveMember[]>([])
const leaveRequests = ref<MyLeaveRequest[]>([])
const selectedMemberId = ref('')
const isBootstrapping = ref(true)
const isRefreshing = ref(false)
const isCreateDialogOpen = ref(false)
const isSubmitting = ref(false)
const formRef = ref()

const form = reactive<LeaveRequestFormState>(createDefaultLeaveRequestFormState())
const formRules = leaveRequestBaseRules

const selectedMember = computed(() => {
  return members.value.find((member) => member.member_id === selectedMemberId.value) || null
})

const canCreateLeaveRequest = computed(() => {
  return Boolean(selectedMember.value)
})

const memberSelectorHelperText = computed(() => {
  if (members.value.length <= 1) {
    return '系統會自動使用你目前綁定的成員。'
  }

  return '切換不同關聯成員時，頁面會同步顯示對應的假單紀錄。'
})

const sortLeaveRequests = (rows: MyLeaveRequest[]) => {
  return [...rows].sort((left, right) => {
    const startDiff = new Date(right.start_date).getTime() - new Date(left.start_date).getTime()
    if (startDiff !== 0) {
      return startDiff
    }

    return new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
  })
}

const buildMemberOptionLabel = (member: MyLeaveMember) => {
  return `${member.name}｜${member.role}`
}

const getLeaveBadgeClass = (type: string) => {
  switch (type) {
    case '事假':
      return 'bg-orange-50 border-orange-200 text-primary'
    case '病假':
      return 'bg-red-50 border-red-200 text-red-600'
    case '公假':
      return 'bg-blue-50 border-blue-200 text-blue-600'
    default:
      return 'bg-gray-50 border-gray-200 text-gray-600'
  }
}

const formatLeaveDateRange = (startDate: string, endDate: string) => {
  if (!startDate || !endDate) {
    return '日期未設定'
  }

  if (startDate === endDate) {
    return startDate
  }

  return `${startDate} ~ ${endDate}`
}

const formatDateTime = (value?: string | null) => {
  if (!value) {
    return '尚無資料'
  }

  const parsed = dayjs(value)
  return parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm') : '尚無資料'
}

const hydrateFormDefaults = () => {
  Object.assign(form, createDefaultLeaveRequestFormState())
}

const refreshCurrentMemberData = async () => {
  if (!selectedMemberId.value) {
    leaveRequests.value = []
    return
  }

  isRefreshing.value = true

  try {
    const nextLeaveRequests = await listMyLeaveRequests(selectedMemberId.value)
    leaveRequests.value = sortLeaveRequests(nextLeaveRequests)
  } catch (error: any) {
    ElMessage.error(error?.message || '讀取假單資訊失敗')
  } finally {
    isRefreshing.value = false
  }
}

const openCreateDialog = async () => {
  if (!canCreateLeaveRequest.value) {
    return
  }

  hydrateFormDefaults()
  isCreateDialogOpen.value = true
  await nextTick()
  formRef.value?.clearValidate?.()
}

const submitLeaveRequest = async () => {
  if (!formRef.value || !selectedMember.value) {
    return
  }

  try {
    await formRef.value.validate()
  } catch {
    return
  }

  isSubmitting.value = true

  try {
    const records = buildLeaveRequestRecords({
      memberId: selectedMember.value.member_id,
      form
    })

    const createdRows = await createMyLeaveRequests({
      member_id: selectedMember.value.member_id,
      records: records.map((record) => ({
        leave_type: record.leave_type,
        start_date: record.start_date,
        end_date: record.end_date,
        reason: record.reason
      }))
    })

    await refreshCurrentMemberData()

    const firstCreatedRow = createdRows[0] || null
    let pushIssueMessage = ''
    if (firstCreatedRow) {
      try {
        const pushResult = await dispatchPushNotification({
          title: `[新增假單] ${selectedMember.value.name} 的${form.leave_type}`,
          body: `${buildLeaveNotificationDateLabel({
            leaveMode: form.leave_mode,
            form,
            recordCount: createdRows.length
          })}\n原因：${firstCreatedRow.reason || '無'}`,
          url: `/leave-requests?highlight_leave_id=${firstCreatedRow.id}`,
          feature: 'leave_requests',
          action: 'VIEW',
          eventKey: buildGroupedPushEventKey('leave_request', createdRows.map((row) => row.id))
        })

        pushIssueMessage = describePushDispatchIssue(pushResult) || ''
      } catch (pushError) {
        console.warn('我的假單通知發送失敗', pushError)
        pushIssueMessage = '通知發送失敗，請稍後確認接收裝置或推播設定。'
      }
    }

    isCreateDialogOpen.value = false
    ElMessage.success('假單已送出')
    if (pushIssueMessage) {
      ElMessage.warning(`假單已送出，但${pushIssueMessage}`)
    }
  } catch (error: any) {
    ElMessage.error(error?.message || '送出假單失敗')
  } finally {
    isSubmitting.value = false
  }
}

const confirmDelete = async (leave: MyLeaveRequest) => {
  try {
    await ElMessageBox.confirm('確定要刪除這筆假單嗎？', '⚠️ 刪除確認', {
      confirmButtonText: '確定刪除',
      cancelButtonText: '取消',
      type: 'error'
    })

    await deleteMyLeaveRequest(leave.id)
    leaveRequests.value = leaveRequests.value.filter((item) => item.id !== leave.id)
    ElMessage.success('刪除成功')
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error?.message || '刪除假單失敗')
    }
  }
}

onMounted(async () => {
  isBootstrapping.value = true

  try {
    members.value = await listMyLeaveMembers()
    selectedMemberId.value = members.value[0]?.member_id || ''

    if (selectedMemberId.value) {
      await refreshCurrentMemberData()
    }
  } catch (error: any) {
    ElMessage.error(error?.message || '讀取我的假單失敗')
  } finally {
    isBootstrapping.value = false
  }
})

watch(selectedMemberId, async (nextMemberId, previousMemberId) => {
  if (isBootstrapping.value || !nextMemberId || nextMemberId === previousMemberId) {
    return
  }

  await refreshCurrentMemberData()
})
</script>

<style scoped>
.custom-dialog :deep(.el-dialog__header) {
  border-bottom: 1px solid #f3f4f6;
  margin-right: 0;
  padding: 24px;
}

.custom-dialog :deep(.el-dialog__title) {
  font-weight: 800;
  color: #1f2937;
  font-size: 1.25rem;
}

.custom-dialog :deep(.el-dialog__body) {
  padding: 16px 24px 0 24px;
}

.custom-segmented {
  --el-radio-button-checked-bg-color: var(--color-primary);
  --el-radio-button-checked-border-color: var(--color-primary);
  --el-radio-button-checked-text-color: #fff;
}

.custom-segmented :deep(.el-radio-button) {
  flex: 1 1 0;
  min-width: 0;
}

.custom-segmented :deep(.el-radio-button__inner) {
  width: 100%;
  border-radius: 0;
  border-color: #e5e7eb;
  color: #6b7280;
  font-weight: 700;
}

.custom-segmented :deep(.el-radio-button:first-child .el-radio-button__inner) {
  border-top-left-radius: 8px;
  border-bottom-left-radius: 8px;
}

.custom-segmented :deep(.el-radio-button:last-child .el-radio-button__inner) {
  border-top-right-radius: 8px;
  border-bottom-right-radius: 8px;
}

.custom-segmented :deep(.el-radio-button__original-radio:checked + .el-radio-button__inner) {
  background-color: var(--color-primary) !important;
  border-color: var(--color-primary) !important;
  box-shadow: -1px 0 0 0 var(--color-primary) !important;
  color: #fff !important;
}
</style>
