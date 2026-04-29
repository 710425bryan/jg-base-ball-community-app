<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Goods, Loading, Refresh, ShoppingCart } from '@element-plus/icons-vue'
import PreviewableImage from '@/components/common/PreviewableImage.vue'
import { listMyPaymentMembers } from '@/services/myPayments'
import { useAuthStore } from '@/stores/auth'
import { useEquipmentStore } from '@/stores/equipment'
import { useEquipmentRequestsStore } from '@/stores/equipmentRequests'
import { usePermissionsStore } from '@/stores/permissions'
import type {
  Equipment,
  EquipmentManualPurchaseRecord,
  EquipmentPurchaseRequest,
  EquipmentRequestItem
} from '@/types/equipment'
import type { MyPaymentMember } from '@/types/payments'
import {
  getEquipmentPurchaseAvailability,
  getEquipmentRemainingOverallQuantity,
  getEquipmentSizeInventoryList,
  isEquipmentPurchasable,
  validateEquipmentPurchaseItemsAvailability
} from '@/utils/equipmentInventory'
import {
  EQUIPMENT_REQUEST_STATUS,
  getEquipmentRequestStatusLabel,
  getEquipmentRequestStatusTagType
} from '@/utils/equipmentRequestStatus'
import { getEquipmentRequestItemTotalPrice } from '@/utils/equipmentPricing'
import { buildPushEventKey, dispatchPushNotification } from '@/utils/pushNotifications'

type CartItem = {
  equipment_id: string
  size: string | null
  quantity: number
}

type AddonHistoryItem =
  | {
    type: 'request'
    id: string
    sortAt: string
    request: EquipmentPurchaseRequest
  }
  | {
    type: 'manual_purchase'
    id: string
    sortAt: string
    manualPurchase: EquipmentManualPurchaseRecord
  }

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const equipmentStore = useEquipmentStore()
const requestStore = useEquipmentRequestsStore()
const permissionsStore = usePermissionsStore()

const members = ref<MyPaymentMember[]>([])
const selectedMemberId = ref('')
const activeTab = ref<'shop' | 'requests'>('shop')
const searchKeyword = ref('')
const isBootstrapping = ref(true)
const isSubmitting = ref(false)
const cart = ref<CartItem[]>([])
const selectedSizeByEquipmentId = ref<Record<string, string>>({})
const quantityByEquipmentId = ref<Record<string, number>>({})
const requestNote = ref('')

const linkedMembers = computed(() =>
  members.value.filter((member) => member.is_linked !== false)
)

const canPurchaseForAllMembers = computed(() => permissionsStore.currentRole === 'ADMIN')

const purchaseMemberOptions = computed(() =>
  canPurchaseForAllMembers.value ? members.value : linkedMembers.value
)

const selectedMember = computed(() =>
  purchaseMemberOptions.value.find((member) => member.member_id === selectedMemberId.value) || null
)

const loadedRequests = computed(() =>
  canPurchaseForAllMembers.value ? requestStore.reviewRequests : requestStore.myRequests
)

const visibleRequestRecords = computed(() => {
  if (!selectedMemberId.value) return loadedRequests.value

  return loadedRequests.value.filter((request) => request.member_id === selectedMemberId.value)
})

const visibleManualPurchaseRecords = computed(() => {
  if (!selectedMemberId.value) return requestStore.manualPurchaseRecords

  return requestStore.manualPurchaseRecords.filter((record) => record.member_id === selectedMemberId.value)
})

const visibleHistoryItems = computed<AddonHistoryItem[]>(() => {
  const requestItems = visibleRequestRecords.value.map((request) => ({
    type: 'request' as const,
    id: request.id,
    sortAt: request.updated_at || request.created_at || request.requested_at,
    request
  }))
  const manualPurchaseItems = visibleManualPurchaseRecords.value.map((manualPurchase) => ({
    type: 'manual_purchase' as const,
    id: manualPurchase.transaction_id,
    sortAt: manualPurchase.updated_at || manualPurchase.created_at || manualPurchase.transaction_date,
    manualPurchase
  }))

  return [...requestItems, ...manualPurchaseItems].sort((left, right) => right.sortAt.localeCompare(left.sortAt))
})

const loadedHistoryRecordCount = computed(() =>
  loadedRequests.value.length + requestStore.manualPurchaseRecords.length
)

const availableEquipments = computed(() =>
  equipmentStore.equipments.filter((equipment) =>
    equipment.quick_purchase_enabled
    && Number(equipment.purchase_price || 0) > 0
  )
)

const filteredEquipments = computed(() => {
  const keyword = searchKeyword.value.trim().toLowerCase()
  return availableEquipments.value.filter((equipment) => {
    const content = [equipment.name, equipment.category, equipment.specs, equipment.notes]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return !keyword || content.includes(keyword)
  })
})

const cartItemsWithEquipment = computed(() =>
  cart.value.map((item) => ({
    ...item,
    equipment: equipmentStore.equipmentById.get(item.equipment_id) || null
  }))
)

const getCartAvailabilityValidation = () =>
  validateEquipmentPurchaseItemsAvailability(cart.value, equipmentStore.equipmentById)

const cartAvailabilityValidation = computed(getCartAvailabilityValidation)

const cartAvailabilityFailures = computed(() => cartAvailabilityValidation.value.failures)

const hasUnavailableCartItems = computed(() => !cartAvailabilityValidation.value.isValid)

const isValidQuantity = (value: unknown) => {
  const quantity = Number(value)
  return Number.isFinite(quantity) && quantity > 0
}

const hasInvalidCartQuantity = computed(() =>
  cart.value.some((item) => !isValidQuantity(item.quantity))
)

const cartTotal = computed(() =>
  cartItemsWithEquipment.value.reduce((total, item) => (
    total + Number(item.equipment?.purchase_price || 0) * (isValidQuantity(item.quantity) ? item.quantity : 0)
  ), 0)
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

const formatDate = (value?: string | null) => {
  const parsed = dayjs(value)
  return parsed.isValid() ? parsed.format('YYYY-MM-DD') : '尚無資料'
}

const getEquipmentSizeOptions = (equipment: Equipment) =>
  getEquipmentSizeInventoryList(equipment)

const hasEquipmentSizeOptions = (equipment: Equipment) =>
  getEquipmentSizeOptions(equipment).length > 0

const getPurchasableSizeCount = (equipment: Equipment) =>
  getEquipmentSizeOptions(equipment).filter((item) => item.remaining > 0).length

const isEquipmentAvailableForPurchase = (equipment: Equipment) =>
  isEquipmentPurchasable(equipment)

const getEquipmentPurchaseStatusLabel = (equipment: Equipment) =>
  isEquipmentAvailableForPurchase(equipment) ? '可申請' : '售完'

const getEquipmentPurchaseStatusClass = (equipment: Equipment) =>
  isEquipmentAvailableForPurchase(equipment)
    ? 'bg-emerald-50 text-emerald-700'
    : 'bg-gray-100 text-gray-500'

const getEquipmentInventoryPillClass = (equipment: Equipment) =>
  isEquipmentAvailableForPurchase(equipment)
    ? 'bg-primary/10 text-primary'
    : 'bg-gray-100 text-gray-500'

const getEquipmentInventoryLabel = (equipment: Equipment) => {
  const sizeOptions = getEquipmentSizeOptions(equipment)
  if (sizeOptions.length > 0) {
    return `${getPurchasableSizeCount(equipment)} / ${sizeOptions.length} 個尺寸可申請`
  }

  return `可用 ${getEquipmentRemainingOverallQuantity(equipment)}`
}

const getCartQuantity = (equipmentId: string, size?: string | null, excludedIndex: number | null = null) =>
  cart.value.reduce((total, item, index) => {
    if (excludedIndex !== null && index === excludedIndex) return total
    if (item.equipment_id !== equipmentId) return total
    if ((item.size || null) !== (size || null)) return total
    return total + (isValidQuantity(item.quantity) ? Number(item.quantity) : 0)
  }, 0)

const getEquipmentAddAvailability = (equipment: Equipment) => {
  const selectedSize = hasEquipmentSizeOptions(equipment)
    ? selectedSizeByEquipmentId.value[equipment.id] || null
    : null

  return getEquipmentPurchaseAvailability(equipment, {
    size: selectedSize,
    quantity: quantityByEquipmentId.value[equipment.id],
    existingQuantity: getCartQuantity(equipment.id, selectedSize)
  })
}

const isAddToCartDisabled = (equipment: Equipment) =>
  !getEquipmentAddAvailability(equipment).isPurchasable

const getAddToCartButtonLabel = (equipment: Equipment) => {
  if (!isEquipmentAvailableForPurchase(equipment)) return '已售完'
  if (hasEquipmentSizeOptions(equipment) && !selectedSizeByEquipmentId.value[equipment.id]) return '選擇尺寸'
  return '加入請購單'
}

const getEquipmentAddHelperText = (equipment: Equipment) => {
  if (!isEquipmentAvailableForPurchase(equipment)) {
    return hasEquipmentSizeOptions(equipment) ? '此商品所有尺寸已售完' : '此商品已售完'
  }

  const availability = getEquipmentAddAvailability(equipment)
  if (availability.reason === '請先填寫加購數量') return ''
  return availability.reason || ''
}

const getEquipmentQuantityMax = (equipment: Equipment) => {
  const availability = getEquipmentAddAvailability(equipment)
  return Math.max(1, availability.availableQuantity - availability.existingQuantity)
}

const getCartItemAvailabilityFailure = (item: CartItem) =>
  cartAvailabilityFailures.value.find((failure) =>
    failure.equipmentId === item.equipment_id
    && (failure.size || null) === (item.size || null)
  ) || null

const getRequestTotal = (items: EquipmentRequestItem[]) =>
  items.reduce((total, item) => total + getEquipmentRequestItemTotalPrice(item), 0)

const buildMemberOptionLabel = (member: MyPaymentMember) =>
  `${member.name}｜${member.role}`

const memberSelectorHelperText = computed(() => {
  if (canPurchaseForAllMembers.value) {
    return '管理員可切換加購成員，申請紀錄會同步篩選該成員。'
  }

  if (purchaseMemberOptions.value.length > 1) {
    return '切換不同關聯成員時，申請紀錄會同步顯示該成員。'
  }

  return '系統會自動使用你目前綁定的成員。'
})

const requestSectionDescription = computed(() => {
  if (selectedMember.value) {
    return `目前顯示 ${selectedMember.value.name} 的裝備加購紀錄。`
  }

  return '查看申請、管理員新增、領取與付款狀態。'
})

const emptyRequestText = computed(() => {
  if (loadedHistoryRecordCount.value > 0 && selectedMember.value) {
    return `${selectedMember.value.name} 目前沒有裝備加購紀錄。`
  }

  return '目前沒有裝備加購紀錄。'
})

const getLinkedMemberIds = (source = members.value) =>
  source
    .filter((member) => member.is_linked !== false)
    .map((member) => member.member_id)

const getMemberNameById = (memberId: string) =>
  members.value.find((member) => member.member_id === memberId)?.name || ''

const getManualPurchaseStatusLabel = (status?: string | null) => {
  if (status === 'paid') return '已確認付款'
  if (status === 'pending_review') return '付款待確認'
  if (status === 'cancelled') return '已取消'
  return '待付款'
}

const getManualPurchaseStatusTagType = (status?: string | null) => {
  if (status === 'paid') return 'success'
  if (status === 'pending_review') return 'warning'
  if (status === 'cancelled') return 'info'
  return 'danger'
}

const requestPaymentEligibleStatuses = new Set([
  EQUIPMENT_REQUEST_STATUS.APPROVED,
  EQUIPMENT_REQUEST_STATUS.READY_FOR_PICKUP,
  EQUIPMENT_REQUEST_STATUS.PICKED_UP
])

const getRequestTransactionPaymentStatuses = (request: EquipmentPurchaseRequest) =>
  request.items
    .map((item) => item.equipment_transaction?.payment_status || null)
    .filter(Boolean) as string[]

const getRequestPaymentStatus = (request: EquipmentPurchaseRequest) => {
  const statuses = getRequestTransactionPaymentStatuses(request)

  if (statuses.length === 0) {
    return requestPaymentEligibleStatuses.has(request.status as any) ? 'unpaid' : null
  }

  if (statuses.length < request.items.length) return 'unpaid'
  if (statuses.every((status) => status === 'paid')) return 'paid'
  if (statuses.some((status) => status === 'pending_review')) return 'pending_review'
  if (statuses.some((status) => status === 'unpaid')) return 'unpaid'
  if (statuses.every((status) => status === 'cancelled')) return 'cancelled'
  return 'unpaid'
}

const getRequestPaymentStatusLabel = (request: EquipmentPurchaseRequest) => {
  const status = getRequestPaymentStatus(request)
  return status ? getManualPurchaseStatusLabel(status) : ''
}

const getRequestPaymentStatusTagType = (request: EquipmentPurchaseRequest) =>
  getManualPurchaseStatusTagType(getRequestPaymentStatus(request))

const canGoToEquipmentPayment = (request: EquipmentPurchaseRequest) => (
  requestPaymentEligibleStatuses.has(request.status as any)
  && getRequestPaymentStatus(request) === 'unpaid'
)

const getManualPurchaseNote = (record: EquipmentManualPurchaseRecord) =>
  ['管理員新增', record.notes?.trim()].filter(Boolean).join('｜')

const ensureSelectedMember = () => {
  if (purchaseMemberOptions.value.length === 0) {
    selectedMemberId.value = ''
    return
  }

  const stillSelectable = purchaseMemberOptions.value.some((member) => member.member_id === selectedMemberId.value)
  if (!stillSelectable) {
    selectedMemberId.value = linkedMembers.value[0]?.member_id || purchaseMemberOptions.value[0].member_id
  }
}

const selectHighlightedRequestMember = (requestId: string) => {
  const highlightedRequest = loadedRequests.value.find((request) => request.id === requestId)
  if (!highlightedRequest?.member_id) return

  const canSelectHighlightedMember = purchaseMemberOptions.value.some(
    (member) => member.member_id === highlightedRequest.member_id
  )
  if (canSelectHighlightedMember) {
    selectedMemberId.value = highlightedRequest.member_id
  }
}

const addToCart = (equipment: Equipment) => {
  const sizes = getEquipmentSizeOptions(equipment)
  const selectedSize = sizes.length > 0
    ? selectedSizeByEquipmentId.value[equipment.id]
    : ''
  const size = selectedSize || null
  const availability = getEquipmentAddAvailability(equipment)

  if (!availability.isPurchasable) {
    ElMessage.warning(availability.reason || '裝備庫存不足')
    return
  }

  const quantity = availability.requestedQuantity
  const exists = cart.value.find((item) => item.equipment_id === equipment.id && (item.size || null) === size)
  const candidateCart = exists
    ? cart.value.map((item) => (
      item === exists
        ? { ...item, quantity: item.quantity + quantity }
        : item
    ))
    : [
      ...cart.value,
      {
        equipment_id: equipment.id,
        size,
        quantity
      }
    ]
  const validation = validateEquipmentPurchaseItemsAvailability(candidateCart, equipmentStore.equipmentById)

  if (!validation.isValid) {
    ElMessage.warning(validation.failures[0]?.reason || '裝備庫存不足')
    return
  }

  if (exists) {
    exists.quantity += quantity
  } else {
    cart.value.push({
      equipment_id: equipment.id,
      size,
      quantity
    })
  }

  ElMessage.success('已加入加購清單')
}

const updateCartItemQuantity = (index: number, quantity: number | undefined) => {
  if (!isValidQuantity(quantity)) {
    cart.value[index].quantity = 0
    return
  }

  cart.value[index].quantity = Number(quantity)
}

const handleCartQuantityUpdate = (index: number, value: number | undefined) => {
  updateCartItemQuantity(index, value)
}

const removeCartItem = (index: number) => {
  cart.value.splice(index, 1)
}

const submitRequest = async () => {
  if (!selectedMember.value) {
    ElMessage.warning('請先選擇加購成員')
    return
  }

  if (cart.value.length === 0) {
    ElMessage.warning('請先加入至少一項裝備')
    return
  }

  if (hasInvalidCartQuantity.value) {
    ElMessage.warning('請確認每個加購項目都有填寫大於 0 的數量')
    return
  }

  isSubmitting.value = true
  try {
    await equipmentStore.loadEquipments()
    const validation = getCartAvailabilityValidation()
    if (!validation.isValid) {
      ElMessage.warning(validation.failures[0]?.reason || '部分裝備庫存不足，請調整請購數量')
      return
    }

    const request = await requestStore.createRequest({
      member_id: selectedMember.value.member_id,
      notes: requestNote.value,
      items: cart.value.map((item) => ({
        equipment_id: item.equipment_id,
        size: item.size,
        quantity: item.quantity
      }))
    })

    if (request) {
      await dispatchPushNotification({
        title: '收到裝備加購申請',
        body: `${selectedMember.value.name} 送出 ${cart.value.length} 項裝備加購申請。`,
        url: `/fees?tab=equipment&highlight_id=${request.id}`,
        feature: 'equipment',
        action: 'EDIT',
        eventKey: buildPushEventKey('equipment-request-created', request.id)
      })
    }

    cart.value = []
    requestNote.value = ''
    activeTab.value = 'requests'
    ElMessage.success('已送出裝備加購申請')
    await Promise.all([
      equipmentStore.loadEquipments(),
      loadAddonRecords()
    ])
  } catch (error: any) {
    ElMessage.error(error?.message || '送出加購申請失敗')
  } finally {
    isSubmitting.value = false
  }
}

const cancelRequest = async (requestId: string) => {
  try {
    await ElMessageBox.confirm('確定要取消這筆裝備加購申請嗎？', '取消申請', {
      confirmButtonText: '取消申請',
      cancelButtonText: '返回',
      type: 'warning'
    })
    await requestStore.cancelRequest(requestId, '使用者取消')
    ElMessage.success('已取消申請')
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error?.message || '取消申請失敗')
    }
  }
}

const canCancelRequest = (request: EquipmentPurchaseRequest) => (
  request.status === EQUIPMENT_REQUEST_STATUS.PENDING
  && (canPurchaseForAllMembers.value || request.requester_user_id === authStore.user?.id)
)

const goToEquipmentPayment = (requestId: string) => {
  router.push(`/my-payments?view=equipment&highlight_id=${requestId}`)
}

const goToManualPurchasePayment = (transactionId: string) => {
  router.push(`/my-payments?view=equipment&highlight_transaction_id=${transactionId}`)
}

const loadAddonRequests = (linkedMemberIds = getLinkedMemberIds()) => (
  canPurchaseForAllMembers.value
    ? requestStore.loadReviewRequests()
    : requestStore.loadMyRequests(linkedMemberIds)
)

const loadAddonRecords = (linkedMemberIds = getLinkedMemberIds()) => Promise.all([
  loadAddonRequests(linkedMemberIds),
  requestStore.loadManualPurchaseRecords()
])

const highlightFromRoute = async () => {
  const id = String(route.query.highlight_id || '').trim()
  if (!id) return

  selectHighlightedRequestMember(id)
  activeTab.value = 'requests'
  await nextTick()

  const target = document.getElementById(`equipment-addon-request-${id}`)
  if (!target) return

  target.scrollIntoView({ behavior: 'smooth', block: 'center' })
  target.classList.add('ring-2', 'ring-primary', 'ring-offset-2')
  window.setTimeout(() => target.classList.remove('ring-2', 'ring-primary', 'ring-offset-2'), 2600)
}

const bootstrap = async () => {
  isBootstrapping.value = true
  try {
    const [paymentMembers] = await Promise.all([
      listMyPaymentMembers(),
      equipmentStore.loadEquipments()
    ])
    members.value = paymentMembers
    ensureSelectedMember()
    await loadAddonRecords(getLinkedMemberIds(paymentMembers))
    if (route.query.tab === 'requests') activeTab.value = 'requests'
    await highlightFromRoute()
  } catch (error: any) {
    ElMessage.error(error?.message || '無法載入裝備加購資料')
  } finally {
    isBootstrapping.value = false
  }
}

watch(() => route.query.highlight_id, () => {
  void highlightFromRoute()
})

onMounted(() => {
  void bootstrap()
})
</script>

<template>
  <div class="h-full flex flex-col relative animate-fade-in bg-gray-50 text-text overflow-hidden">
    <div class="bg-white px-4 md:px-6 py-4 border-b border-gray-200 shadow-sm shrink-0 z-10">
      <div class="max-w-6xl mx-auto flex flex-col gap-4">
        <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 class="app-page-title app-page-title--inline">
              <el-icon class="app-page-title-icon"><ShoppingCart /></el-icon>
              裝備加購
            </h2>
            <p class="app-page-subtitle">
              為已綁定成員申請裝備加購，管理員確認領取後再回報付款
            </p>
          </div>
          <button
            type="button"
            class="inline-flex items-center justify-center gap-2 rounded-2xl border border-gray-200 px-4 py-3 text-sm font-bold text-gray-600 hover:border-primary hover:text-primary transition-colors disabled:opacity-70"
            :disabled="isBootstrapping"
            @click="bootstrap"
          >
            <el-icon :class="{ 'is-loading': isBootstrapping }"><Refresh /></el-icon>
            重新整理
          </button>
        </div>

        <div class="flex gap-2 overflow-x-auto">
          <button
            type="button"
            class="rounded-t-xl border-b-2 px-5 py-2 text-sm font-bold transition-all"
            :class="activeTab === 'shop' ? 'border-primary bg-primary/5 text-primary' : 'border-transparent text-gray-500 hover:bg-gray-50'"
            @click="activeTab = 'shop'"
          >
            加購裝備
          </button>
          <button
            type="button"
            class="rounded-t-xl border-b-2 px-5 py-2 text-sm font-bold transition-all"
            :class="activeTab === 'requests' ? 'border-primary bg-primary/5 text-primary' : 'border-transparent text-gray-500 hover:bg-gray-50'"
            @click="activeTab = 'requests'"
          >
            申請紀錄
          </button>
        </div>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto min-h-0 p-4 md:p-6 pb-[calc(4.5rem+env(safe-area-inset-bottom)+20px)] md:pb-6 custom-scrollbar">
      <div v-if="isBootstrapping" class="min-h-[50vh] flex items-center justify-center">
        <div class="flex items-center gap-3 text-gray-500 font-bold">
          <el-icon class="is-loading text-primary text-2xl"><Loading /></el-icon>
          讀取裝備加購資料中...
        </div>
      </div>

      <div v-else class="max-w-6xl mx-auto">
        <section v-if="purchaseMemberOptions.length === 0" class="rounded-3xl border border-gray-100 bg-white p-8 text-center shadow-sm">
          <h3 class="text-lg font-black text-slate-800">目前沒有可加購的綁定成員</h3>
          <p class="mt-2 text-sm text-gray-500">請先請管理員完成帳號與球員或校隊成員綁定。</p>
        </section>

        <template v-else>
          <section class="mb-4 rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
            <label class="text-xs font-bold uppercase tracking-[0.18em] text-gray-400">加購成員</label>
            <el-select v-model="selectedMemberId" class="mt-2 w-full md:max-w-md" size="large" filterable>
              <el-option
                v-for="member in purchaseMemberOptions"
                :key="member.member_id"
                :label="buildMemberOptionLabel(member)"
                :value="member.member_id"
              />
            </el-select>
            <p class="mt-2 text-xs text-gray-400">
              {{ memberSelectorHelperText }}
            </p>
          </section>

          <div v-show="activeTab === 'shop'" class="flex flex-col gap-4 md:flex-row md:items-start">
            <section class="w-full min-w-0 rounded-3xl border border-gray-100 bg-white p-5 shadow-sm md:flex-1">
              <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <h3 class="text-lg font-black text-slate-800">請購表單</h3>
                  <p class="mt-1 text-xs md:text-sm text-gray-500">
                    一張請購單只對應一位成員，但可以加入多個裝備品項。
                  </p>
                </div>
                <span class="self-start rounded-full bg-primary/10 px-3 py-1 text-xs font-black text-primary">
                  {{ cart.length }} 項
                </span>
              </div>

              <div v-if="cartItemsWithEquipment.length === 0" class="mt-5 rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm font-bold text-gray-400">
                請從右側「可加購裝備」加入品項。
              </div>

              <div v-else class="mt-5 space-y-3">
                <article
                  v-for="(item, index) in cartItemsWithEquipment"
                  :key="`${item.equipment_id}-${item.size || 'none'}`"
                  class="rounded-2xl border p-4"
                  :class="getCartItemAvailabilityFailure(item) ? 'border-red-100 bg-red-50/70' : 'border-gray-100 bg-gray-50/70'"
                >
                  <div class="flex flex-col gap-4 md:flex-row md:items-center">
                    <div class="min-w-0 flex-1">
                      <div class="text-xs font-black text-gray-400">品項 {{ index + 1 }}</div>
                      <div class="mt-1 font-black text-slate-800">{{ item.equipment?.name || '未知裝備' }}</div>
                      <p class="mt-1 text-xs text-gray-400">{{ item.size || '無尺寸' }}</p>
                    </div>

                    <div class="md:w-40">
                      <div class="mb-1 text-xs font-bold text-gray-400">數量</div>
                      <el-input-number
                        :model-value="item.quantity"
                        :min="1"
                        :precision="0"
                        size="large"
                        class="!w-full"
                        @update:model-value="(value: number | undefined) => handleCartQuantityUpdate(index, value)"
                      />
                    </div>

                    <div class="md:w-28 md:text-right">
                      <div class="mb-1 text-xs font-bold text-gray-400">小計</div>
                      <div class="font-black text-primary">
                        {{ formatCurrency(Number(item.equipment?.purchase_price || 0) * (isValidQuantity(item.quantity) ? item.quantity : 0)) }}
                      </div>
                    </div>

                    <button type="button" class="self-start text-sm font-bold text-red-500 md:self-center" @click="removeCartItem(index)">
                      移除
                    </button>
                  </div>
                  <p v-if="getCartItemAvailabilityFailure(item)" class="mt-3 rounded-xl border border-red-100 bg-white px-3 py-2 text-sm font-bold text-red-600">
                    {{ getCartItemAvailabilityFailure(item)?.reason }}
                  </p>
                </article>
              </div>

              <div class="mt-5 rounded-2xl border border-gray-100 bg-white px-4 py-4">
                <div class="grid gap-4 md:grid-cols-[1fr_auto] md:items-start">
                  <el-input
                    v-model="requestNote"
                    type="textarea"
                    :rows="3"
                    maxlength="120"
                    show-word-limit
                    placeholder="可補充尺寸需求、備註或聯絡資訊"
                  />
                  <div class="md:min-w-36 md:text-right">
                    <div class="text-xs font-bold text-gray-400">預估合計</div>
                    <div class="mt-1 text-2xl font-black text-primary">{{ formatCurrency(cartTotal) }}</div>
                  </div>
                </div>

                <div v-if="hasInvalidCartQuantity" class="mt-3 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm font-bold text-red-600">
                  請確認每個加購項目都有填寫大於 0 的數量。
                </div>
                <div v-else-if="hasUnavailableCartItems" class="mt-3 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm font-bold text-red-600">
                  {{ cartAvailabilityFailures[0]?.reason || '部分裝備庫存不足，請調整請購數量。' }}
                </div>

                <div class="mt-4 flex justify-end">
                  <button
                    type="button"
                    class="rounded-2xl bg-primary px-5 py-3 font-bold text-white hover:bg-primary-hover transition-colors disabled:opacity-70"
                    :disabled="isSubmitting || cart.length === 0 || hasInvalidCartQuantity || hasUnavailableCartItems"
                    @click="submitRequest"
                  >
                    {{ isSubmitting ? '送出中...' : '送出請購' }}
                  </button>
                </div>
              </div>
            </section>

            <aside class="w-full rounded-3xl border border-gray-100 bg-white p-5 shadow-sm md:w-[360px] md:shrink-0 lg:sticky lg:top-4 lg:w-[420px] xl:w-[440px]">
              <div>
                <h3 class="text-lg font-black text-slate-800">可加購裝備</h3>
                <p class="mt-1 text-xs md:text-sm text-gray-500">
                  僅顯示已開放快速購買且有售價的裝備。
                </p>
              </div>

              <el-input v-model="searchKeyword" size="large" clearable class="mt-4" placeholder="搜尋裝備" />

              <div v-if="filteredEquipments.length === 0" class="mt-4 rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center">
                <el-icon class="text-4xl text-gray-200"><Goods /></el-icon>
                <h4 class="mt-3 font-black text-slate-800">目前沒有可加購裝備</h4>
                <p class="mt-2 text-sm text-gray-400">請稍後再查看，或聯繫管理員確認裝備庫存與售價。</p>
              </div>

              <div v-else class="mt-4 space-y-3">
                <article
                  v-for="equipment in filteredEquipments"
                  :key="equipment.id"
                  class="rounded-2xl border border-gray-100 bg-gray-50/70 p-3 transition-colors hover:border-primary/30 hover:bg-white"
                >
                  <div class="flex gap-3">
                    <div class="h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-gray-100">
                      <PreviewableImage
                        v-if="equipment.image_url"
                        :src="equipment.image_url"
                        :alt="equipment.name"
                        class="h-full w-full"
                      />
                      <div v-else class="flex h-full w-full items-center justify-center text-gray-300">
                        <el-icon class="text-3xl"><Goods /></el-icon>
                      </div>
                    </div>

                    <div class="min-w-0 flex-1">
                      <div class="flex items-start justify-between gap-2">
                        <div class="min-w-0">
                          <h4 class="truncate font-black text-slate-800">{{ equipment.name }}</h4>
                          <p class="mt-1 line-clamp-1 text-xs text-gray-400">{{ equipment.specs || equipment.notes || '無額外規格說明' }}</p>
                        </div>
                        <span
                          class="shrink-0 rounded-full px-2 py-1 text-[11px] font-black"
                          :class="getEquipmentPurchaseStatusClass(equipment)"
                        >
                          {{ getEquipmentPurchaseStatusLabel(equipment) }}
                        </span>
                      </div>

                      <div class="mt-3 flex flex-wrap items-center gap-2">
                        <span class="rounded-full bg-white px-2.5 py-1 text-xs font-black text-gray-600">
                          售價 {{ formatCurrency(equipment.purchase_price) }}
                        </span>
                        <span
                          class="rounded-full px-2.5 py-1 text-xs font-black"
                          :class="getEquipmentInventoryPillClass(equipment)"
                        >
                          {{ getEquipmentInventoryLabel(equipment) }}
                        </span>
                      </div>

                      <div class="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_112px]">
                        <el-select
                          v-if="getEquipmentSizeOptions(equipment).length > 0"
                          v-model="selectedSizeByEquipmentId[equipment.id]"
                          size="large"
                          class="w-full"
                          placeholder="選尺寸"
                          :disabled="getPurchasableSizeCount(equipment) === 0"
                        >
                          <el-option
                            v-for="size in getEquipmentSizeOptions(equipment)"
                            :key="size.size"
                            :label="`${size.size}｜${size.remaining > 0 ? `可用 ${size.remaining}` : '已售完'}`"
                            :value="size.size"
                            :disabled="size.remaining <= 0"
                          />
                        </el-select>
                        <div v-else class="rounded-xl border border-gray-100 bg-white px-3 py-3 text-sm font-bold text-gray-400">
                          無尺寸
                        </div>

                        <el-input-number
                          v-model="quantityByEquipmentId[equipment.id]"
                          :min="1"
                          :max="getEquipmentQuantityMax(equipment)"
                          :precision="0"
                          size="large"
                          class="!w-full"
                          :disabled="!isEquipmentAvailableForPurchase(equipment) || (hasEquipmentSizeOptions(equipment) && !selectedSizeByEquipmentId[equipment.id])"
                        />
                      </div>
                      <p v-if="getEquipmentAddHelperText(equipment)" class="mt-2 text-xs font-bold text-red-500">
                        {{ getEquipmentAddHelperText(equipment) }}
                      </p>

                      <button
                        type="button"
                        class="mt-3 w-full rounded-2xl bg-primary px-4 py-2.5 text-sm font-bold text-white hover:bg-primary-hover transition-colors disabled:bg-gray-200 disabled:text-gray-500"
                        :disabled="isAddToCartDisabled(equipment)"
                        @click="addToCart(equipment)"
                      >
                        {{ getAddToCartButtonLabel(equipment) }}
                      </button>
                    </div>
                  </div>
                </article>
              </div>
            </aside>
          </div>

          <section v-show="activeTab === 'requests'" class="rounded-3xl border border-gray-100 bg-white p-4 md:p-5 shadow-sm">
            <div class="flex items-center justify-between gap-3">
              <div>
                <h3 class="text-lg font-black text-slate-800">申請紀錄</h3>
                <p class="mt-1 text-xs text-gray-400">{{ requestSectionDescription }}</p>
              </div>
              <span class="rounded-full bg-gray-100 px-3 py-1 text-xs font-black text-gray-600">
                {{ visibleHistoryItems.length }} 筆
              </span>
            </div>

            <div v-if="visibleHistoryItems.length === 0" class="mt-4 rounded-2xl bg-gray-50 px-4 py-8 text-center text-sm font-bold text-gray-400">
              {{ emptyRequestText }}
            </div>

            <div v-else class="mt-4 grid gap-3">
              <article
                v-for="historyItem in visibleHistoryItems"
                :id="historyItem.type === 'request' ? `equipment-addon-request-${historyItem.request.id}` : `equipment-addon-manual-purchase-${historyItem.manualPurchase.transaction_id}`"
                :key="`${historyItem.type}-${historyItem.id}`"
                class="rounded-2xl border border-gray-100 bg-gray-50/70 p-4 transition-all"
              >
                <template v-if="historyItem.type === 'request'">
                  <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div class="font-black text-slate-800">{{ historyItem.request.member?.name || getMemberNameById(historyItem.request.member_id) || selectedMember?.name || '未知成員' }}</div>
                      <div class="mt-1 text-xs text-gray-400">{{ formatDateTime(historyItem.request.requested_at) }}</div>
                    </div>
                    <div class="flex flex-wrap gap-2">
                      <el-tag :type="getEquipmentRequestStatusTagType(historyItem.request.status)" effect="light">
                        {{ getEquipmentRequestStatusLabel(historyItem.request.status) }}
                      </el-tag>
                      <el-tag
                        v-if="getRequestPaymentStatus(historyItem.request)"
                        :type="getRequestPaymentStatusTagType(historyItem.request)"
                        effect="light"
                      >
                        {{ getRequestPaymentStatusLabel(historyItem.request) }}
                      </el-tag>
                    </div>
                  </div>

                  <div class="mt-4 grid gap-2">
                    <div
                      v-for="item in historyItem.request.items"
                      :key="item.id"
                      class="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 text-sm"
                    >
                      <span class="font-bold text-gray-700">{{ item.equipment_name_snapshot }} <span class="text-gray-400">{{ item.size || '' }}</span></span>
                      <span class="font-black text-primary">{{ item.quantity }} 件 / {{ formatCurrency(getEquipmentRequestItemTotalPrice(item)) }}</span>
                    </div>
                  </div>

                  <div v-if="historyItem.request.ready_image_url || historyItem.request.pickup_image_url" class="mt-4 grid gap-3 sm:grid-cols-2">
                    <div v-if="historyItem.request.ready_image_url" class="rounded-2xl border border-gray-100 bg-white p-3">
                      <div class="mb-2 text-xs font-black text-gray-400">備貨照片</div>
                      <PreviewableImage
                        :src="historyItem.request.ready_image_url"
                        alt="備貨照片"
                        class="h-28 w-full rounded-xl border border-gray-100"
                      />
                    </div>
                    <div v-if="historyItem.request.pickup_image_url" class="rounded-2xl border border-gray-100 bg-white p-3">
                      <div class="mb-2 text-xs font-black text-gray-400">領取照片</div>
                      <PreviewableImage
                        :src="historyItem.request.pickup_image_url"
                        alt="領取照片"
                        class="h-28 w-full rounded-xl border border-gray-100"
                      />
                    </div>
                  </div>

                  <div class="mt-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div class="font-black text-primary">合計 {{ formatCurrency(getRequestTotal(historyItem.request.items)) }}</div>
                    <div class="flex flex-wrap gap-2">
                      <button
                        v-if="canCancelRequest(historyItem.request)"
                        type="button"
                        class="rounded-xl border border-red-100 bg-red-50 px-4 py-2 text-sm font-bold text-red-500 hover:bg-red-100 transition-colors"
                        @click="cancelRequest(historyItem.request.id)"
                      >
                        取消申請
                      </button>
                      <button
                        v-if="canGoToEquipmentPayment(historyItem.request)"
                        type="button"
                        class="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white hover:bg-primary-hover transition-colors"
                        @click="goToEquipmentPayment(historyItem.request.id)"
                      >
                        前往付款回報
                      </button>
                    </div>
                  </div>
                </template>

                <template v-else>
                  <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div class="font-black text-slate-800">{{ historyItem.manualPurchase.member_name || getMemberNameById(historyItem.manualPurchase.member_id) || selectedMember?.name || '未知成員' }}</div>
                      <div class="mt-1 text-xs text-gray-400">{{ formatDate(historyItem.manualPurchase.transaction_date) }}</div>
                    </div>
                    <div class="flex flex-wrap gap-2">
                      <el-tag type="info" effect="light">管理員新增</el-tag>
                      <el-tag :type="getManualPurchaseStatusTagType(historyItem.manualPurchase.payment_status)" effect="light">
                        {{ getManualPurchaseStatusLabel(historyItem.manualPurchase.payment_status) }}
                      </el-tag>
                    </div>
                  </div>

                  <div class="mt-4 grid gap-2">
                    <div class="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 text-sm">
                      <span class="font-bold text-gray-700">
                        {{ historyItem.manualPurchase.equipment_name }}
                        <span class="text-gray-400">{{ historyItem.manualPurchase.size || '' }}</span>
                      </span>
                      <span class="font-black text-primary">
                        {{ historyItem.manualPurchase.quantity }} 件 / {{ formatCurrency(historyItem.manualPurchase.total_amount) }}
                      </span>
                    </div>
                  </div>

                  <div class="mt-4 rounded-xl border border-blue-100 bg-blue-50/60 px-3 py-2 text-sm font-bold text-blue-700">
                    備註：{{ getManualPurchaseNote(historyItem.manualPurchase) }}
                    <span v-if="historyItem.manualPurchase.handled_by" class="text-blue-500">｜經手人：{{ historyItem.manualPurchase.handled_by }}</span>
                  </div>

                  <div class="mt-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div class="font-black text-primary">合計 {{ formatCurrency(historyItem.manualPurchase.total_amount) }}</div>
                    <div class="flex flex-wrap gap-2">
                      <button
                        v-if="historyItem.manualPurchase.payment_status === 'unpaid'"
                        type="button"
                        class="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white hover:bg-primary-hover transition-colors"
                        @click="goToManualPurchasePayment(historyItem.manualPurchase.transaction_id)"
                      >
                        前往付款回報
                      </button>
                    </div>
                  </div>
                </template>
              </article>
            </div>
          </section>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  height: 4px;
  width: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: #cbd5e1;
  border-radius: 10px;
}
</style>
