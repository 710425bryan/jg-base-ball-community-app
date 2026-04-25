<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Goods, Loading, Refresh, ShoppingCart } from '@element-plus/icons-vue'
import { listMyPaymentMembers } from '@/services/myPayments'
import { useEquipmentStore } from '@/stores/equipment'
import { useEquipmentRequestsStore } from '@/stores/equipmentRequests'
import type { Equipment, EquipmentRequestItem } from '@/types/equipment'
import type { MyPaymentMember } from '@/types/payments'
import {
  getEquipmentRemainingOverallQuantity,
  getEquipmentSizeInventoryList
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

const route = useRoute()
const router = useRouter()
const equipmentStore = useEquipmentStore()
const requestStore = useEquipmentRequestsStore()

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

const selectedMember = computed(() =>
  linkedMembers.value.find((member) => member.member_id === selectedMemberId.value) || null
)

const availableEquipments = computed(() =>
  equipmentStore.equipments.filter((equipment) =>
    equipment.quick_purchase_enabled
    && Number(equipment.purchase_price || 0) > 0
    && getEquipmentRemainingOverallQuantity(equipment) > 0
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

const getAvailableSizes = (equipment: Equipment) =>
  getEquipmentSizeInventoryList(equipment).filter((item) => item.remaining > 0)

const getRequestTotal = (items: EquipmentRequestItem[]) =>
  items.reduce((total, item) => total + getEquipmentRequestItemTotalPrice(item), 0)

const buildMemberOptionLabel = (member: MyPaymentMember) =>
  `${member.name}｜${member.role}`

const addToCart = (equipment: Equipment) => {
  const sizes = getAvailableSizes(equipment)
  const selectedSize = sizes.length > 0
    ? selectedSizeByEquipmentId.value[equipment.id]
    : ''

  if (sizes.length > 0 && !selectedSize) {
    ElMessage.warning('請先選擇尺寸或序號')
    return
  }

  const rawQuantity = quantityByEquipmentId.value[equipment.id]
  if (!isValidQuantity(rawQuantity)) {
    ElMessage.warning('請先填寫加購數量')
    return
  }

  const quantity = Number(rawQuantity)
  const size = selectedSize || null
  const exists = cart.value.find((item) => item.equipment_id === equipment.id && (item.size || null) === size)

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
      requestStore.loadMyRequests()
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

const goToEquipmentPayment = (requestId: string) => {
  router.push(`/my-payments?view=equipment&highlight_id=${requestId}`)
}

const highlightFromRoute = async () => {
  const id = String(route.query.highlight_id || '').trim()
  if (!id) return

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
      equipmentStore.loadEquipments(),
      requestStore.loadMyRequests()
    ])
    members.value = paymentMembers
    if (!selectedMemberId.value && linkedMembers.value.length > 0) {
      selectedMemberId.value = linkedMembers.value[0].member_id
    }
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
            <h2 class="text-xl md:text-2xl font-black text-slate-800 leading-tight flex items-center gap-2">
              <el-icon class="text-primary"><ShoppingCart /></el-icon>
              裝備加購
            </h2>
            <p class="text-xs md:text-sm font-bold text-gray-500 mt-1">
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
        <section v-if="linkedMembers.length === 0" class="rounded-3xl border border-gray-100 bg-white p-8 text-center shadow-sm">
          <h3 class="text-lg font-black text-slate-800">目前沒有可加購的綁定成員</h3>
          <p class="mt-2 text-sm text-gray-500">請先請管理員完成帳號與球員或校隊成員綁定。</p>
        </section>

        <template v-else>
          <section class="mb-4 rounded-3xl border border-gray-100 bg-white p-5 shadow-sm">
            <label class="text-xs font-bold uppercase tracking-[0.18em] text-gray-400">加購成員</label>
            <el-select v-model="selectedMemberId" class="mt-2 w-full md:max-w-md" size="large">
              <el-option
                v-for="member in linkedMembers"
                :key="member.member_id"
                :label="buildMemberOptionLabel(member)"
                :value="member.member_id"
              />
            </el-select>
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
                  class="rounded-2xl border border-gray-100 bg-gray-50/70 p-4"
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

                <div class="mt-4 flex justify-end">
                  <button
                    type="button"
                    class="rounded-2xl bg-primary px-5 py-3 font-bold text-white hover:bg-primary-hover transition-colors disabled:opacity-70"
                    :disabled="isSubmitting || cart.length === 0 || hasInvalidCartQuantity"
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
                      <img
                        v-if="equipment.image_url"
                        :src="equipment.image_url"
                        :alt="equipment.name"
                        class="h-full w-full object-cover"
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
                        <span class="shrink-0 rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-black text-emerald-700">
                          可申請
                        </span>
                      </div>

                      <div class="mt-3 flex flex-wrap items-center gap-2">
                        <span class="rounded-full bg-white px-2.5 py-1 text-xs font-black text-gray-600">
                          售價 {{ formatCurrency(equipment.purchase_price) }}
                        </span>
                        <span class="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-black text-primary">
                          {{ getAvailableSizes(equipment).length > 0 ? `${getAvailableSizes(equipment).length} 個可選尺寸` : `可用 ${getEquipmentRemainingOverallQuantity(equipment)}` }}
                        </span>
                      </div>

                      <div class="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_112px]">
                        <el-select
                          v-if="getAvailableSizes(equipment).length > 0"
                          v-model="selectedSizeByEquipmentId[equipment.id]"
                          size="large"
                          class="w-full"
                          placeholder="選尺寸"
                        >
                          <el-option
                            v-for="size in getAvailableSizes(equipment)"
                            :key="size.size"
                            :label="`${size.size}｜可用 ${size.remaining}`"
                            :value="size.size"
                          />
                        </el-select>
                        <div v-else class="rounded-xl border border-gray-100 bg-white px-3 py-3 text-sm font-bold text-gray-400">
                          無尺寸
                        </div>

                        <el-input-number
                          v-model="quantityByEquipmentId[equipment.id]"
                          :min="1"
                          :precision="0"
                          size="large"
                          class="!w-full"
                        />
                      </div>

                      <button
                        type="button"
                        class="mt-3 w-full rounded-2xl bg-primary px-4 py-2.5 text-sm font-bold text-white hover:bg-primary-hover transition-colors"
                        @click="addToCart(equipment)"
                      >
                        加入請購單
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
                <p class="mt-1 text-xs text-gray-400">查看審核、備貨、領取與付款狀態。</p>
              </div>
              <span class="rounded-full bg-gray-100 px-3 py-1 text-xs font-black text-gray-600">
                {{ requestStore.myRequests.length }} 筆
              </span>
            </div>

            <div v-if="requestStore.myRequests.length === 0" class="mt-4 rounded-2xl bg-gray-50 px-4 py-8 text-center text-sm font-bold text-gray-400">
              目前沒有裝備加購申請。
            </div>

            <div v-else class="mt-4 grid gap-3">
              <article
                v-for="request in requestStore.myRequests"
                :id="`equipment-addon-request-${request.id}`"
                :key="request.id"
                class="rounded-2xl border border-gray-100 bg-gray-50/70 p-4 transition-all"
              >
                <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div>
                    <div class="font-black text-slate-800">{{ request.member?.name || selectedMember?.name || '未知成員' }}</div>
                    <div class="mt-1 text-xs text-gray-400">{{ formatDateTime(request.requested_at) }}</div>
                  </div>
                  <el-tag :type="getEquipmentRequestStatusTagType(request.status)" effect="light">
                    {{ getEquipmentRequestStatusLabel(request.status) }}
                  </el-tag>
                </div>

                <div class="mt-4 grid gap-2">
                  <div
                    v-for="item in request.items"
                    :key="item.id"
                    class="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2 text-sm"
                  >
                    <span class="font-bold text-gray-700">{{ item.equipment_name_snapshot }} <span class="text-gray-400">{{ item.size || '' }}</span></span>
                    <span class="font-black text-primary">{{ item.quantity }} 件 / {{ formatCurrency(getEquipmentRequestItemTotalPrice(item)) }}</span>
                  </div>
                </div>

                <div class="mt-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div class="font-black text-primary">合計 {{ formatCurrency(getRequestTotal(request.items)) }}</div>
                  <div class="flex flex-wrap gap-2">
                    <button
                      v-if="request.status === EQUIPMENT_REQUEST_STATUS.PENDING"
                      type="button"
                      class="rounded-xl border border-red-100 bg-red-50 px-4 py-2 text-sm font-bold text-red-500 hover:bg-red-100 transition-colors"
                      @click="cancelRequest(request.id)"
                    >
                      取消申請
                    </button>
                    <button
                      v-if="request.status === EQUIPMENT_REQUEST_STATUS.PICKED_UP"
                      type="button"
                      class="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white hover:bg-primary-hover transition-colors"
                      @click="goToEquipmentPayment(request.id)"
                    >
                      前往付款回報
                    </button>
                  </div>
                </div>
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
