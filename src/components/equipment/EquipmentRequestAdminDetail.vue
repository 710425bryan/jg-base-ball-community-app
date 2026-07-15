<script setup lang="ts">
import { computed, ref } from 'vue'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Delete } from '@element-plus/icons-vue'
import { useEquipmentStore } from '@/stores/equipment'
import { useEquipmentRequestsStore } from '@/stores/equipmentRequests'
import type { EquipmentPurchaseRequest } from '@/types/equipment'
import type { EquipmentRequestAdminRecord } from '@/utils/equipmentPurchaseAdmin'
import {
  EQUIPMENT_REQUEST_STATUS,
  getEquipmentRequestStatusLabel,
  getEquipmentRequestStatusTagType
} from '@/utils/equipmentRequestStatus'
import { formatEquipmentVariantLabel, getEquipmentRequestItemTotalPrice } from '@/utils/equipmentPricing'
import { buildPushEventKey, dispatchPushNotification } from '@/utils/pushNotifications'
import AppActionOverflow from '@/components/common/AppActionOverflow.vue'
import EquipmentPhotoCarousel from '@/components/equipment/EquipmentPhotoCarousel.vue'
import EquipmentRequestActionDialog from '@/components/equipment/EquipmentRequestActionDialog.vue'

const props = defineProps<{
  record: EquipmentRequestAdminRecord
  canEdit: boolean
  canDelete: boolean
}>()

const emit = defineEmits<{
  changed: [recordKey: string]
}>()

const equipmentStore = useEquipmentStore()
const requestStore = useEquipmentRequestsStore()
const isProcessing = ref(false)
const actionDialog = ref<{
  visible: boolean
  mode: 'ready' | 'picked_up'
}>({ visible: false, mode: 'ready' })

const request = computed(() => props.record.source)
const canShowActions = computed(() => props.canEdit || props.canDelete)
const primaryActionLabel = computed(() => {
  if (!props.canEdit) return ''
  if (request.value.status === EQUIPMENT_REQUEST_STATUS.PENDING) return '核准請購'
  if (request.value.status === EQUIPMENT_REQUEST_STATUS.APPROVED) return '標記備貨完成'
  if (request.value.status === EQUIPMENT_REQUEST_STATUS.READY_FOR_PICKUP) return '完成領取'
  return ''
})

const primaryActionClass = computed(() => {
  if (request.value.status === EQUIPMENT_REQUEST_STATUS.APPROVED) {
    return 'bg-blue-600 hover:bg-blue-700 focus-visible:ring-blue-300'
  }
  if (request.value.status === EQUIPMENT_REQUEST_STATUS.READY_FOR_PICKUP) {
    return 'bg-emerald-600 hover:bg-emerald-700 focus-visible:ring-emerald-300'
  }
  return 'bg-primary hover:bg-primary-hover focus-visible:ring-primary/40'
})

const formatCurrency = (amount: number) => new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0
}).format(Number(amount) || 0)

const formatDateTime = (value?: string | null) => {
  const parsed = dayjs(value)
  return parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm') : '尚無資料'
}

const getVariantLabel = (item: { size?: string | null; jersey_number?: number | string | null }) => (
  formatEquipmentVariantLabel(item)
)

const notifyRequester = async (
  target: EquipmentPurchaseRequest,
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
      targetUserIds: [target.requester_user_id],
      eventKey: buildPushEventKey(scope, target.id)
    })
  } catch (error) {
    console.warn('Equipment requester push failed', error)
  }
}

const completeAction = () => emit('changed', props.record.key)

const approve = async () => {
  isProcessing.value = true
  try {
    const updated = await requestStore.approveRequest(request.value.id)
    ElMessage.success('已核准加購申請')
    if (updated) {
      await notifyRequester(
        updated,
        '裝備加購已核准',
        `${updated.member?.name || '成員'} 的裝備加購申請已核准，可至繳費資訊回報付款，商品仍會依備貨進度通知。`,
        `/equipment-addons?tab=requests&highlight_id=${updated.id}`,
        'equipment-request-approved'
      )
    }
    completeAction()
  } catch (error: any) {
    ElMessage.error(error?.message || '核准失敗')
  } finally {
    isProcessing.value = false
  }
}

const reject = async () => {
  try {
    const { value } = await ElMessageBox.prompt('請輸入退回原因', '退回加購申請', {
      confirmButtonText: '退回',
      cancelButtonText: '取消',
      inputType: 'textarea',
      inputPlaceholder: '例如：尺寸缺貨，請改選其他尺寸'
    })
    isProcessing.value = true
    const updated = await requestStore.rejectRequest(request.value.id, String(value || ''))
    ElMessage.success('已退回申請')
    if (updated) {
      await notifyRequester(
        updated,
        '裝備加購已退回',
        String(value || '').trim() || '你的裝備加購申請已退回，請查看申請紀錄。',
        `/equipment-addons?tab=requests&highlight_id=${updated.id}`,
        'equipment-request-rejected'
      )
    }
    completeAction()
  } catch (error: any) {
    if (error !== 'cancel' && error !== 'close') {
      ElMessage.error(error?.message || '退回申請失敗')
    }
  } finally {
    isProcessing.value = false
  }
}

const openActionDialog = (mode: 'ready' | 'picked_up') => {
  actionDialog.value = { visible: true, mode }
}

const submitActionDialog = async (payload: { note: string; imageFiles: File[]; markPaid?: boolean }) => {
  isProcessing.value = true
  try {
    const updated = actionDialog.value.mode === 'ready'
      ? await requestStore.markReady(request.value.id, payload.note, payload.imageFiles)
      : await requestStore.markPickedUp(request.value.id, payload.note, payload.imageFiles, Boolean(payload.markPaid))

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
    } else if (updated && payload.markPaid) {
      await notifyRequester(
        updated,
        '裝備已領取，付款已登錄',
        `${updated.member?.name || '成員'} 的裝備加購已完成領取，付款已登錄。`,
        `/equipment-addons?tab=requests&highlight_id=${updated.id}`,
        'equipment-request-picked-up-paid'
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
    completeAction()
  } catch (error: any) {
    ElMessage.error(error?.message || '更新申請狀態失敗')
  } finally {
    isProcessing.value = false
  }
}

const deleteRequest = async () => {
  const isPickedUp = request.value.status === EQUIPMENT_REQUEST_STATUS.PICKED_UP
  const restoresReservedStock = request.value.status === EQUIPMENT_REQUEST_STATUS.APPROVED
    || request.value.status === EQUIPMENT_REQUEST_STATUS.READY_FOR_PICKUP

  try {
    await ElMessageBox.confirm(
      isPickedUp
        ? '刪除後會一併移除這筆請購產生的裝備購買交易，裝備庫存數量會回補。已有付款回報或已確認付款的紀錄不可直接刪除。'
        : restoresReservedStock
          ? '刪除後會移除這筆請購預留數量，裝備可用庫存會回補。確定要刪除嗎？'
          : '確定要刪除這筆裝備請購紀錄嗎？',
      '刪除裝備請購',
      {
        confirmButtonText: '確定刪除',
        cancelButtonText: '取消',
        type: 'warning',
        confirmButtonClass: 'el-button--danger'
      }
    )
    isProcessing.value = true
    await requestStore.deleteRequest(request.value.id)
    await equipmentStore.loadEquipments()
    ElMessage.success(isPickedUp || restoresReservedStock ? '已刪除請購並回補裝備庫存' : '已刪除裝備請購紀錄')
    completeAction()
  } catch (error: any) {
    if (error !== 'cancel' && error !== 'close') {
      ElMessage.error(error?.message || '刪除裝備請購失敗')
    }
  } finally {
    isProcessing.value = false
  }
}

const runPrimaryAction = () => {
  if (request.value.status === EQUIPMENT_REQUEST_STATUS.PENDING) void approve()
  else if (request.value.status === EQUIPMENT_REQUEST_STATUS.APPROVED) openActionDialog('ready')
  else if (request.value.status === EQUIPMENT_REQUEST_STATUS.READY_FOR_PICKUP) openActionDialog('picked_up')
}

const handleOverflow = (command: unknown) => {
  if (command === 'reject') void reject()
}
</script>

<template>
  <article class="flex min-h-full flex-col bg-white">
    <div class="flex-1 space-y-5 p-4 lg:p-6">
      <header class="border-b border-slate-100 pb-5">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <el-tag :type="getEquipmentRequestStatusTagType(request.status)" effect="light">
              {{ getEquipmentRequestStatusLabel(request.status) }}
            </el-tag>
            <h2 class="mt-2 text-xl font-black text-slate-800">{{ record.memberName }}</h2>
            <p class="mt-1 text-sm font-bold text-slate-500">{{ record.equipmentSummary }}</p>
          </div>
          <div class="text-right">
            <p class="text-xs font-bold text-slate-400">申請金額</p>
            <p class="mt-1 tabular-nums text-2xl font-black text-primary">{{ formatCurrency(record.amount) }}</p>
          </div>
        </div>
        <p class="mt-3 text-xs font-medium text-slate-400">申請時間：{{ formatDateTime(request.requested_at) }}</p>
      </header>

      <section>
        <h3 class="text-sm font-black text-slate-800">請購品項</h3>
        <div class="mt-3 divide-y divide-slate-100 rounded-2xl border border-slate-200">
          <div v-for="item in request.items" :key="item.id" class="p-4">
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="font-black text-slate-700">{{ item.equipment_name_snapshot }}</p>
                <p class="mt-1 text-xs font-bold text-slate-400">{{ getVariantLabel(item) }}</p>
              </div>
              <div class="shrink-0 text-right">
                <p class="font-black text-primary">{{ formatCurrency(getEquipmentRequestItemTotalPrice(item)) }}</p>
                <p class="mt-1 text-xs font-bold text-slate-400">{{ item.quantity }} 件</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section v-if="request.notes || request.ready_note || request.pickup_note || request.rejection_reason || request.cancel_reason" class="space-y-2">
        <h3 class="text-sm font-black text-slate-800">處理備註</h3>
        <p v-if="request.notes" class="rounded-xl bg-slate-50 p-3 text-sm leading-6 text-slate-600">申請：{{ request.notes }}</p>
        <p v-if="request.ready_note" class="rounded-xl bg-sky-50 p-3 text-sm leading-6 text-sky-700">備貨：{{ request.ready_note }}</p>
        <p v-if="request.pickup_note" class="rounded-xl bg-emerald-50 p-3 text-sm leading-6 text-emerald-700">領取：{{ request.pickup_note }}</p>
        <p v-if="request.rejection_reason" class="rounded-xl bg-red-50 p-3 text-sm leading-6 text-red-600">退回：{{ request.rejection_reason }}</p>
        <p v-if="request.cancel_reason" class="rounded-xl bg-slate-100 p-3 text-sm leading-6 text-slate-600">取消：{{ request.cancel_reason }}</p>
      </section>

      <section v-if="request.ready_image_urls.length > 0 || request.pickup_image_urls.length > 0" class="grid gap-4 sm:grid-cols-2">
        <div v-if="request.ready_image_urls.length > 0">
          <h3 class="mb-2 text-sm font-black text-slate-800">備貨照片</h3>
          <EquipmentPhotoCarousel :photos="request.ready_image_urls" alt="備貨照片" class="h-40 w-full rounded-2xl border border-slate-200" />
        </div>
        <div v-if="request.pickup_image_urls.length > 0">
          <h3 class="mb-2 text-sm font-black text-slate-800">領取照片</h3>
          <EquipmentPhotoCarousel :photos="request.pickup_image_urls" alt="領取照片" class="h-40 w-full rounded-2xl border border-slate-200" />
        </div>
      </section>
    </div>

    <footer
      v-if="canShowActions && (primaryActionLabel || canDelete)"
      class="sticky bottom-0 z-10 flex min-h-[4.75rem] flex-wrap items-center justify-end gap-2 border-t border-slate-200 bg-white/95 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur lg:px-6"
    >
      <AppActionOverflow v-if="canEdit && request.status === EQUIPMENT_REQUEST_STATUS.PENDING" :disabled="isProcessing" @command="handleOverflow">
        <el-dropdown-item v-if="canEdit && request.status === EQUIPMENT_REQUEST_STATUS.PENDING" command="reject">退回請購</el-dropdown-item>
      </AppActionOverflow>
      <button
        v-if="canDelete"
        type="button"
        class="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-4 text-sm font-black text-red-600 transition-colors hover:border-red-300 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300 disabled:cursor-not-allowed disabled:opacity-50"
        title="刪除請購"
        :disabled="isProcessing"
        @click="deleteRequest"
      >
        <el-icon><Delete /></el-icon>
        刪除請購
      </button>
      <button
        v-if="primaryActionLabel"
        type="button"
        class="min-h-11 rounded-xl px-5 text-sm font-black text-white transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:opacity-50"
        :class="primaryActionClass"
        :disabled="isProcessing"
        @click="runPrimaryAction"
      >{{ primaryActionLabel }}</button>
    </footer>
  </article>

  <EquipmentRequestActionDialog
    v-model="actionDialog.visible"
    :title="actionDialog.mode === 'ready' ? '標記備貨完成' : '標記已領取'"
    :confirm-text="actionDialog.mode === 'ready' ? '標記可領取' : '完成領取'"
    :allow-image="true"
    :allow-payment-received="actionDialog.mode === 'picked_up'"
    :is-submitting="isProcessing"
    @confirm="submitActionDialog"
  />
</template>
