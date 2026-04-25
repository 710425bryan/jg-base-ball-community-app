<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Loading, Refresh } from '@element-plus/icons-vue'
import { useRoute } from 'vue-router'
import { useEquipmentRequestsStore } from '@/stores/equipmentRequests'
import { usePermissionsStore } from '@/stores/permissions'
import { deleteEquipmentPurchaseRequestWithRollback } from '@/services/equipmentApi'
import type { EquipmentPurchaseRequest } from '@/types/equipment'
import {
  EQUIPMENT_REQUEST_HISTORY_STATUSES,
  EQUIPMENT_REQUEST_STATUS,
  getEquipmentRequestStatusLabel,
  getEquipmentRequestStatusTagType
} from '@/utils/equipmentRequestStatus'
import { getEquipmentRequestItemTotalPrice } from '@/utils/equipmentPricing'
import { buildPushEventKey, dispatchPushNotification } from '@/utils/pushNotifications'
import EquipmentRequestActionDialog from './EquipmentRequestActionDialog.vue'

const route = useRoute()
const requestStore = useEquipmentRequestsStore()
const permissionsStore = usePermissionsStore()
const processingIds = ref(new Set<string>())
const actionDialog = ref<{
  visible: boolean
  mode: 'ready' | 'picked_up'
  request: EquipmentPurchaseRequest | null
}>({
  visible: false,
  mode: 'ready',
  request: null
})

const pendingRequests = computed(() =>
  requestStore.reviewRequests.filter((request) => request.status === EQUIPMENT_REQUEST_STATUS.PENDING)
)

const activeRequests = computed(() =>
  requestStore.reviewRequests.filter((request) =>
    request.status === EQUIPMENT_REQUEST_STATUS.APPROVED
    || request.status === EQUIPMENT_REQUEST_STATUS.READY_FOR_PICKUP
  )
)

const historyRequests = computed(() =>
  requestStore.reviewRequests.filter((request) =>
    EQUIPMENT_REQUEST_HISTORY_STATUSES.includes(request.status as any)
  )
)

const actionDialogTitle = computed(() =>
  actionDialog.value.mode === 'ready' ? '標記備貨完成' : '標記已領取'
)

const actionDialogConfirmText = computed(() =>
  actionDialog.value.mode === 'ready' ? '標記可領取' : '完成領取'
)

const canDeleteHistory = computed(() =>
  permissionsStore.can('fees', 'DELETE') || permissionsStore.can('equipment', 'DELETE')
)

const formatCurrency = (amount: number) => new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0
}).format(Number(amount) || 0)

const formatDateTime = (value?: string | null) => {
  const parsed = dayjs(value)
  return parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm') : '尚無資料'
}

const getRequestTotal = (request: EquipmentPurchaseRequest) =>
  request.items.reduce((total, item) => total + getEquipmentRequestItemTotalPrice(item), 0)

const setProcessing = (id: string, value: boolean) => {
  const next = new Set(processingIds.value)
  if (value) next.add(id)
  else next.delete(id)
  processingIds.value = next
}

const notifyRequester = async (
  request: EquipmentPurchaseRequest,
  title: string,
  body: string,
  url: string,
  scope: string
) => {
  try {
    await dispatchPushNotification({
      title,
      body,
      url,
      feature: 'equipment',
      action: 'VIEW',
      targetUserIds: [request.requester_user_id],
      eventKey: buildPushEventKey(scope, request.id)
    })
  } catch (error) {
    console.warn('Equipment requester push failed', error)
  }
}

const approve = async (request: EquipmentPurchaseRequest) => {
  setProcessing(request.id, true)
  try {
    const updated = await requestStore.approveRequest(request.id)
    ElMessage.success('已核准加購申請')
    if (updated) {
      await notifyRequester(
        updated,
        '裝備加購已核准',
        `${updated.member?.name || '成員'} 的裝備加購申請已核准，待管理員備貨。`,
        `/equipment-addons?tab=requests&highlight_id=${updated.id}`,
        'equipment-request-approved'
      )
    }
  } catch (error: any) {
    ElMessage.error(error?.message || '核准失敗')
  } finally {
    setProcessing(request.id, false)
  }
}

const openActionDialog = (mode: 'ready' | 'picked_up', request: EquipmentPurchaseRequest) => {
  actionDialog.value = {
    visible: true,
    mode,
    request
  }
}

const submitActionDialog = async (payload: { note: string; imageFile: File | null }) => {
  const target = actionDialog.value.request
  if (!target) return

  setProcessing(target.id, true)
  try {
    const updated = actionDialog.value.mode === 'ready'
      ? await requestStore.markReady(target.id, payload.note, payload.imageFile)
      : await requestStore.markPickedUp(target.id, payload.note, payload.imageFile)

    actionDialog.value.visible = false
    ElMessage.success(actionDialog.value.mode === 'ready' ? '已標記可領取' : '已完成領取')

    if (updated && actionDialog.value.mode === 'ready') {
      await notifyRequester(
        updated,
        '裝備已可領取',
        `${updated.member?.name || '成員'} 的裝備加購已備貨完成。`,
        `/equipment-addons?tab=requests&highlight_id=${updated.id}`,
        'equipment-request-ready'
      )
    } else if (updated) {
      await notifyRequester(
        updated,
        '裝備已領取，請回報付款',
        `${updated.member?.name || '成員'} 的裝備加購已完成領取，請至繳費資訊回報付款。`,
        `/my-payments?view=equipment&highlight_id=${updated.id}`,
        'equipment-request-picked-up'
      )
    }
  } catch (error: any) {
    ElMessage.error(error?.message || '更新申請狀態失敗')
  } finally {
    setProcessing(target.id, false)
  }
}

const reject = async (request: EquipmentPurchaseRequest) => {
  try {
    const { value } = await ElMessageBox.prompt('請輸入退回原因', '退回加購申請', {
      confirmButtonText: '退回',
      cancelButtonText: '取消',
      inputType: 'textarea',
      inputPlaceholder: '例如：尺寸缺貨，請改選其他尺寸'
    })

    setProcessing(request.id, true)
    const updated = await requestStore.rejectRequest(request.id, value)
    ElMessage.success('已退回申請')
    if (updated) {
      await notifyRequester(
        updated,
        '裝備加購已退回',
        value || '你的裝備加購申請已退回，請查看申請紀錄。',
        `/equipment-addons?tab=requests&highlight_id=${updated.id}`,
        'equipment-request-rejected'
      )
    }
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error?.message || '退回申請失敗')
    }
  } finally {
    setProcessing(request.id, false)
  }
}

const deleteHistoryRequest = async (request: EquipmentPurchaseRequest) => {
  const isPickedUp = request.status === EQUIPMENT_REQUEST_STATUS.PICKED_UP

  try {
    await ElMessageBox.confirm(
      isPickedUp
        ? '刪除後會一併移除這筆請購產生的裝備購買交易，裝備庫存數量會回補。已有付款回報或已確認付款的紀錄不可直接刪除。'
        : '確定要刪除這筆裝備請購歷史紀錄嗎？',
      '刪除歷史紀錄',
      {
        confirmButtonText: '刪除',
        cancelButtonText: '取消',
        type: 'warning',
        confirmButtonClass: 'el-button--danger'
      }
    )

    setProcessing(request.id, true)
    await deleteEquipmentPurchaseRequestWithRollback(request.id)
    await requestStore.loadReviewRequests()
    ElMessage.success(isPickedUp ? '已刪除歷史紀錄並回補裝備庫存' : '已刪除歷史紀錄')
  } catch (error: any) {
    if (error !== 'cancel' && error !== 'close') {
      ElMessage.error(error?.message || '刪除歷史紀錄失敗')
    }
  } finally {
    setProcessing(request.id, false)
  }
}

const highlightFromRoute = async () => {
  const id = String(route.query.highlight_id || '').trim()
  if (!id) return

  await new Promise((resolve) => window.setTimeout(resolve, 80))
  const target = document.getElementById(`equipment-review-request-${id}`)
  if (!target) return

  target.scrollIntoView({ behavior: 'smooth', block: 'center' })
  target.classList.add('ring-2', 'ring-primary', 'ring-offset-2')
  window.setTimeout(() => target.classList.remove('ring-2', 'ring-primary', 'ring-offset-2'), 2600)
}

const refresh = async () => {
  await requestStore.loadReviewRequests()
  await highlightFromRoute()
}

onMounted(() => {
  void refresh()
})

watch(() => route.query.highlight_id, () => {
  void highlightFromRoute()
})
</script>

<template>
  <section class="space-y-4">
    <div class="rounded-2xl border border-gray-100 bg-white p-4 md:p-5 shadow-sm">
      <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 class="text-lg font-black text-slate-800">裝備請購審核</h3>
          <p class="mt-1 text-xs md:text-sm text-gray-500">
            處理家長送出的加購申請，完成領取後會進入裝備付款流程。
          </p>
        </div>
        <button
          type="button"
          class="inline-flex items-center justify-center gap-2 rounded-2xl border border-gray-200 px-4 py-3 text-sm font-bold text-gray-600 hover:border-primary hover:text-primary transition-colors disabled:opacity-70"
          :disabled="requestStore.isLoading"
          @click="refresh"
        >
          <el-icon :class="{ 'is-loading': requestStore.isLoading }"><Refresh /></el-icon>
          重新整理
        </button>
      </div>
    </div>

    <div v-if="requestStore.isLoading" class="flex items-center justify-center gap-3 rounded-2xl border border-gray-100 bg-white py-10 text-gray-500 font-bold">
      <el-icon class="is-loading text-primary"><Loading /></el-icon>
      讀取裝備請購中...
    </div>

    <template v-else>
      <div class="grid gap-4 xl:grid-cols-2">
        <section class="rounded-2xl border border-amber-100 bg-amber-50/70 p-4 md:p-5">
          <div class="mb-3 flex items-center justify-between gap-3">
            <h4 class="font-black text-amber-900">待審核</h4>
            <span class="rounded-full bg-white px-3 py-1 text-xs font-black text-amber-700">{{ pendingRequests.length }} 筆</span>
          </div>
          <div v-if="pendingRequests.length === 0" class="rounded-2xl bg-white/70 px-4 py-5 text-sm font-bold text-amber-700/70">
            目前沒有待審核申請。
          </div>
          <div v-else class="grid gap-3">
            <article
              v-for="request in pendingRequests"
              :id="`equipment-review-request-${request.id}`"
              :key="request.id"
              class="rounded-2xl border border-white bg-white/90 p-4 shadow-sm transition-all"
            >
              <div class="flex items-start justify-between gap-3">
                <div>
                  <div class="font-black text-slate-800">{{ request.member?.name || '未知成員' }}</div>
                  <div class="mt-1 text-xs text-gray-400">{{ formatDateTime(request.requested_at) }}</div>
                </div>
                <el-tag :type="getEquipmentRequestStatusTagType(request.status)" effect="light">
                  {{ getEquipmentRequestStatusLabel(request.status) }}
                </el-tag>
              </div>

              <div class="mt-3 space-y-2">
                <div v-for="item in request.items" :key="item.id" class="flex items-center justify-between gap-3 text-sm">
                  <span class="font-bold text-gray-700">{{ item.equipment_name_snapshot }} <span class="text-gray-400">{{ item.size || '' }}</span></span>
                  <span class="font-black text-primary">{{ item.quantity }} 件 / {{ formatCurrency(getEquipmentRequestItemTotalPrice(item)) }}</span>
                </div>
              </div>

              <p v-if="request.notes" class="mt-3 rounded-xl bg-gray-50 px-3 py-2 text-sm text-gray-500">{{ request.notes }}</p>

              <div class="mt-4 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  class="rounded-xl border border-red-100 bg-red-50 px-4 py-2 text-sm font-bold text-red-500 hover:bg-red-100 transition-colors disabled:opacity-70"
                  :disabled="processingIds.has(request.id)"
                  @click="reject(request)"
                >
                  退回
                </button>
                <button
                  type="button"
                  class="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white hover:bg-primary-hover transition-colors disabled:opacity-70"
                  :disabled="processingIds.has(request.id)"
                  @click="approve(request)"
                >
                  核准
                </button>
              </div>
            </article>
          </div>
        </section>

        <section class="rounded-2xl border border-blue-100 bg-blue-50/60 p-4 md:p-5">
          <div class="mb-3 flex items-center justify-between gap-3">
            <h4 class="font-black text-blue-900">處理中</h4>
            <span class="rounded-full bg-white px-3 py-1 text-xs font-black text-blue-700">{{ activeRequests.length }} 筆</span>
          </div>
          <div v-if="activeRequests.length === 0" class="rounded-2xl bg-white/70 px-4 py-5 text-sm font-bold text-blue-700/70">
            目前沒有處理中的申請。
          </div>
          <div v-else class="grid gap-3">
            <article
              v-for="request in activeRequests"
              :id="`equipment-review-request-${request.id}`"
              :key="request.id"
              class="rounded-2xl border border-white bg-white/90 p-4 shadow-sm transition-all"
            >
              <div class="flex items-start justify-between gap-3">
                <div>
                  <div class="font-black text-slate-800">{{ request.member?.name || '未知成員' }}</div>
                  <div class="mt-1 text-xs text-gray-400">合計 {{ formatCurrency(getRequestTotal(request)) }}</div>
                </div>
                <el-tag :type="getEquipmentRequestStatusTagType(request.status)" effect="light">
                  {{ getEquipmentRequestStatusLabel(request.status) }}
                </el-tag>
              </div>

              <div class="mt-3 space-y-2">
                <div v-for="item in request.items" :key="item.id" class="flex items-center justify-between gap-3 text-sm">
                  <span class="font-bold text-gray-700">{{ item.equipment_name_snapshot }} <span class="text-gray-400">{{ item.size || '' }}</span></span>
                  <span class="font-black text-primary">{{ item.quantity }} 件</span>
                </div>
              </div>

              <div class="mt-4 flex flex-wrap justify-end gap-2">
                <button
                  v-if="request.status === EQUIPMENT_REQUEST_STATUS.APPROVED"
                  type="button"
                  class="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 transition-colors disabled:opacity-70"
                  :disabled="processingIds.has(request.id)"
                  @click="openActionDialog('ready', request)"
                >
                  備貨完成
                </button>
                <button
                  v-if="request.status === EQUIPMENT_REQUEST_STATUS.READY_FOR_PICKUP"
                  type="button"
                  class="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-700 transition-colors disabled:opacity-70"
                  :disabled="processingIds.has(request.id)"
                  @click="openActionDialog('picked_up', request)"
                >
                  已領取
                </button>
              </div>
            </article>
          </div>
        </section>
      </div>

      <section class="rounded-2xl border border-gray-100 bg-white p-4 md:p-5 shadow-sm">
        <div class="mb-3 flex items-center justify-between gap-3">
          <h4 class="font-black text-slate-800">歷史紀錄</h4>
          <span class="rounded-full bg-gray-100 px-3 py-1 text-xs font-black text-gray-600">{{ historyRequests.length }} 筆</span>
        </div>
        <div v-if="historyRequests.length === 0" class="rounded-2xl bg-gray-50 px-4 py-5 text-sm font-bold text-gray-400">
          尚無歷史請購紀錄。
        </div>
        <div v-else class="grid gap-3 md:grid-cols-2">
          <article
            v-for="request in historyRequests.slice(0, 12)"
            :id="`equipment-review-request-${request.id}`"
            :key="request.id"
            class="rounded-2xl border border-gray-100 bg-gray-50/70 p-4 transition-all"
          >
            <div class="flex items-start justify-between gap-3">
              <div>
                <div class="font-black text-slate-800">{{ request.member?.name || '未知成員' }}</div>
                <div class="mt-1 text-xs text-gray-400">{{ formatDateTime(request.updated_at) }}</div>
              </div>
              <el-tag :type="getEquipmentRequestStatusTagType(request.status)" effect="light">
                {{ getEquipmentRequestStatusLabel(request.status) }}
              </el-tag>
            </div>
            <div class="mt-3 flex flex-wrap items-center justify-between gap-2">
              <p class="text-sm font-bold text-primary">{{ formatCurrency(getRequestTotal(request)) }}</p>
              <button
                v-if="canDeleteHistory"
                type="button"
                class="rounded-xl border border-red-100 bg-red-50 px-4 py-2 text-sm font-bold text-red-500 hover:bg-red-100 transition-colors disabled:opacity-70"
                :disabled="processingIds.has(request.id)"
                @click="deleteHistoryRequest(request)"
              >
                刪除
              </button>
            </div>
          </article>
        </div>
      </section>
    </template>

    <EquipmentRequestActionDialog
      v-model="actionDialog.visible"
      :title="actionDialogTitle"
      :confirm-text="actionDialogConfirmText"
      :allow-image="true"
      :is-submitting="actionDialog.request ? processingIds.has(actionDialog.request.id) : false"
      @confirm="submitActionDialog"
    />
  </section>
</template>
