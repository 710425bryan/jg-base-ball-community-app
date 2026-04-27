<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Delete,
  Edit,
  Goods,
  Plus,
  Refresh,
  Tickets
} from '@element-plus/icons-vue'
import ViewModeSwitch from '@/components/ViewModeSwitch.vue'
import PreviewableImage from '@/components/common/PreviewableImage.vue'
import EquipmentFormDialog from '@/components/equipment/EquipmentFormDialog.vue'
import EquipmentHistoryDialog from '@/components/equipment/EquipmentHistoryDialog.vue'
import EquipmentTransactionDialog from '@/components/equipment/EquipmentTransactionDialog.vue'
import { useEquipmentStore } from '@/stores/equipment'
import { usePermissionsStore } from '@/stores/permissions'
import type { Equipment, EquipmentTransactionType } from '@/types/equipment'
import {
  getEquipmentRemainingOverallQuantity,
  getEquipmentSizeInventoryList
} from '@/utils/equipmentInventory'

const equipmentStore = useEquipmentStore()
const permissionsStore = usePermissionsStore()

const searchKeyword = ref('')
const selectedCategory = ref('all')
const viewMode = ref<'grid' | 'table'>('grid')
const isFormDialogOpen = ref(false)
const editingEquipment = ref<Equipment | null>(null)
const isTransactionDialogOpen = ref(false)
const transactionEquipment = ref<Equipment | null>(null)
const transactionDefaultType = ref<EquipmentTransactionType>('borrow')
const isHistoryDialogOpen = ref(false)
const historyEquipment = ref<Equipment | null>(null)

const canCreate = computed(() => permissionsStore.can('equipment', 'CREATE'))
const canEdit = computed(() => permissionsStore.can('equipment', 'EDIT'))
const canDelete = computed(() => permissionsStore.can('equipment', 'DELETE'))

const categories = computed(() => {
  const values = new Set(equipmentStore.equipments.map((equipment) => equipment.category).filter(Boolean))
  return ['all', ...values]
})

const filteredEquipments = computed(() => {
  const keyword = searchKeyword.value.trim().toLowerCase()
  return equipmentStore.equipments.filter((equipment) => {
    const matchesCategory = selectedCategory.value === 'all' || equipment.category === selectedCategory.value
    const content = [
      equipment.name,
      equipment.category,
      equipment.specs,
      equipment.notes,
      equipment.purchased_by
    ].filter(Boolean).join(' ').toLowerCase()
    return matchesCategory && (!keyword || content.includes(keyword))
  })
})

const summary = computed(() => {
  const totalQuantity = equipmentStore.equipments.reduce((total, equipment) => total + Number(equipment.total_quantity || 0), 0)
  const remainingQuantity = equipmentStore.equipments.reduce((total, equipment) => total + getEquipmentRemainingOverallQuantity(equipment), 0)
  const quickPurchaseCount = equipmentStore.equipments.filter((equipment) => equipment.quick_purchase_enabled).length

  return {
    totalItems: equipmentStore.equipments.length,
    totalQuantity,
    remainingQuantity,
    quickPurchaseCount
  }
})

const formatCurrency = (amount: number) => new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0
}).format(Number(amount) || 0)

const openCreateDialog = () => {
  editingEquipment.value = null
  isFormDialogOpen.value = true
}

const openEditDialog = (equipment: Equipment) => {
  editingEquipment.value = equipment
  isFormDialogOpen.value = true
}

const openTransactionDialog = (equipment: Equipment, type: EquipmentTransactionType) => {
  transactionEquipment.value = equipment
  transactionDefaultType.value = type
  isTransactionDialogOpen.value = true
}

const openHistoryDialog = (equipment: Equipment) => {
  historyEquipment.value = equipment
  isHistoryDialogOpen.value = true
}

const removeEquipment = async (equipment: Equipment) => {
  try {
    await ElMessageBox.confirm(
      `確定要刪除「${equipment.name}」嗎？相關交易紀錄也會一起移除。`,
      '刪除裝備',
      {
        confirmButtonText: '刪除',
        cancelButtonText: '取消',
        type: 'warning'
      }
    )

    await equipmentStore.removeEquipment(equipment.id)
    ElMessage.success('已刪除裝備')
  } catch (error: any) {
    if (error !== 'cancel') {
      ElMessage.error(error?.message || '刪除裝備失敗')
    }
  }
}

const refresh = async () => {
  try {
    await Promise.all([
      equipmentStore.loadEquipments(),
      equipmentStore.loadMembers()
    ])
  } catch (error: any) {
    ElMessage.error(error?.message || '無法載入裝備資料')
  }
}

onMounted(() => {
  void refresh()
})
</script>

<template>
  <div class="h-full flex flex-col relative animate-fade-in bg-gray-50 text-text overflow-hidden">
    <div class="bg-white px-4 md:px-6 py-4 border-b border-gray-200 shadow-sm shrink-0 z-10">
      <div class="max-w-7xl mx-auto flex flex-col gap-4">
        <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 class="app-page-title app-page-title--inline">
              <el-icon class="app-page-title-icon"><Goods /></el-icon>
              裝備管理
            </h2>
            <p class="app-page-subtitle">
              管理裝備庫存、借還領取、加購品項與交易紀錄
            </p>
          </div>

          <div class="flex flex-wrap gap-2">
            <button
              type="button"
              class="inline-flex items-center justify-center gap-2 rounded-2xl border border-gray-200 px-4 py-3 text-sm font-bold text-gray-600 hover:border-primary hover:text-primary transition-colors disabled:opacity-70"
              :disabled="equipmentStore.isLoading"
              @click="refresh"
            >
              <el-icon :class="{ 'is-loading': equipmentStore.isLoading }"><Refresh /></el-icon>
              重新整理
            </button>
            <button
              v-if="canCreate"
              type="button"
              class="inline-flex items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-3 text-sm font-bold text-white hover:bg-primary-hover transition-colors"
              @click="openCreateDialog"
            >
              <el-icon><Plus /></el-icon>
              新增裝備
            </button>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-3">
          <section class="rounded-2xl border border-primary/15 bg-primary/5 px-4 py-3">
            <p class="text-[11px] font-bold uppercase tracking-[0.16em] text-primary/70">品項</p>
            <p class="mt-2 text-2xl font-black text-primary">{{ summary.totalItems }}</p>
          </section>
          <section class="rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3">
            <p class="text-[11px] font-bold uppercase tracking-[0.16em] text-sky-700">總數量</p>
            <p class="mt-2 text-2xl font-black text-sky-800">{{ summary.totalQuantity }}</p>
          </section>
          <section class="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-3">
            <p class="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-700">可用庫存</p>
            <p class="mt-2 text-2xl font-black text-emerald-700">{{ summary.remainingQuantity }}</p>
          </section>
          <section class="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3">
            <p class="text-[11px] font-bold uppercase tracking-[0.16em] text-amber-700">開放加購</p>
            <p class="mt-2 text-2xl font-black text-amber-700">{{ summary.quickPurchaseCount }}</p>
          </section>
        </div>

        <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div class="grid gap-2 md:grid-cols-[minmax(0,1fr)_220px] lg:min-w-[560px]">
            <el-input v-model="searchKeyword" size="large" clearable placeholder="搜尋裝備名稱、規格或備註" />
            <el-select v-model="selectedCategory" size="large" class="w-full">
              <el-option
                v-for="category in categories"
                :key="category"
                :label="category === 'all' ? '全部分類' : category"
                :value="category"
              />
            </el-select>
          </div>
          <ViewModeSwitch v-model="viewMode" />
        </div>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto min-h-0 p-4 md:p-6 pb-[calc(4.5rem+env(safe-area-inset-bottom)+20px)] md:pb-6 custom-scrollbar">
      <div class="max-w-7xl mx-auto">
        <div v-if="equipmentStore.isLoading" class="min-h-[45vh] flex items-center justify-center">
          <div class="text-sm font-bold text-gray-400">裝備資料載入中...</div>
        </div>

        <section v-else-if="filteredEquipments.length === 0" class="rounded-3xl border border-gray-100 bg-white p-10 text-center shadow-sm">
          <el-icon class="text-6xl text-gray-200"><Goods /></el-icon>
          <h3 class="mt-4 text-lg font-black text-slate-800">沒有符合條件的裝備</h3>
          <p class="mt-2 text-sm text-gray-400">調整搜尋條件，或新增第一筆裝備資料。</p>
        </section>

        <div v-else-if="viewMode === 'grid'" class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <article
            v-for="equipment in filteredEquipments"
            :key="equipment.id"
            class="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm"
          >
            <div class="aspect-[16/9] bg-gray-100">
              <PreviewableImage
                v-if="equipment.image_url"
                :src="equipment.image_url"
                :alt="equipment.name"
                class="h-full w-full"
              />
              <div v-else class="flex h-full items-center justify-center text-gray-300">
                <el-icon class="text-5xl"><Goods /></el-icon>
              </div>
            </div>

            <div class="p-5">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <h3 class="truncate text-lg font-black text-slate-800">{{ equipment.name }}</h3>
                  <p class="mt-1 text-xs font-bold text-gray-400">{{ equipment.category }}</p>
                </div>
                <span
                  class="rounded-full px-3 py-1 text-xs font-bold"
                  :class="equipment.quick_purchase_enabled ? 'bg-primary/10 text-primary' : 'bg-gray-100 text-gray-400'"
                >
                  {{ equipment.quick_purchase_enabled ? '可加購' : '庫存品' }}
                </span>
              </div>

              <div class="mt-4 grid grid-cols-3 gap-2 text-center">
                <div class="rounded-2xl bg-gray-50 px-3 py-3">
                  <div class="text-[11px] font-bold text-gray-400">總量</div>
                  <div class="mt-1 font-black text-slate-800">{{ equipment.total_quantity }}</div>
                </div>
                <div class="rounded-2xl bg-emerald-50 px-3 py-3">
                  <div class="text-[11px] font-bold text-emerald-600">可用</div>
                  <div class="mt-1 font-black text-emerald-700">{{ getEquipmentRemainingOverallQuantity(equipment) }}</div>
                </div>
                <div class="rounded-2xl bg-primary/5 px-3 py-3">
                  <div class="text-[11px] font-bold text-primary/70">單價</div>
                  <div class="mt-1 font-black text-primary">{{ formatCurrency(equipment.purchase_price) }}</div>
                </div>
              </div>

              <div v-if="getEquipmentSizeInventoryList(equipment).length > 0" class="mt-4 flex flex-wrap gap-2">
                <span
                  v-for="size in getEquipmentSizeInventoryList(equipment).slice(0, 6)"
                  :key="size.size"
                  class="rounded-full border border-gray-100 bg-gray-50 px-3 py-1 text-xs font-bold text-gray-500"
                >
                  {{ size.size }}：{{ size.remaining }}/{{ size.total }}
                </span>
              </div>

              <p v-if="equipment.specs || equipment.notes" class="mt-4 line-clamp-2 text-sm leading-relaxed text-gray-500">
                {{ equipment.specs || equipment.notes }}
              </p>

              <div class="mt-5 flex flex-wrap gap-2">
                <button
                  v-if="canCreate || canEdit"
                  type="button"
                  class="rounded-xl bg-primary px-3 py-2 text-sm font-bold text-white hover:bg-primary-hover transition-colors"
                  @click="openTransactionDialog(equipment, 'borrow')"
                >
                  交易
                </button>
                <button
                  v-if="canCreate || canEdit"
                  type="button"
                  class="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-sm font-bold text-primary hover:bg-primary/10 transition-colors"
                  @click="openTransactionDialog(equipment, 'purchase')"
                >
                  快速購買
                </button>
                <button
                  type="button"
                  class="rounded-xl border border-gray-200 px-3 py-2 text-sm font-bold text-gray-600 hover:border-primary hover:text-primary transition-colors"
                  @click="openHistoryDialog(equipment)"
                >
                  紀錄
                </button>
                <button
                  v-if="canEdit"
                  type="button"
                  class="rounded-xl border border-gray-200 px-3 py-2 text-sm font-bold text-gray-600 hover:border-primary hover:text-primary transition-colors"
                  @click="openEditDialog(equipment)"
                >
                  編輯
                </button>
                <button
                  v-if="canDelete"
                  type="button"
                  class="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm font-bold text-red-500 hover:bg-red-100 transition-colors"
                  @click="removeEquipment(equipment)"
                >
                  刪除
                </button>
              </div>
            </div>
          </article>
        </div>

        <section v-else class="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
          <div class="overflow-x-auto">
            <table class="w-full min-w-[980px] text-left">
              <thead>
                <tr class="border-b border-gray-100 bg-gray-50 text-sm text-gray-500">
                  <th class="px-5 py-3 font-bold">裝備</th>
                  <th class="px-5 py-3 font-bold">分類</th>
                  <th class="px-5 py-3 font-bold">庫存</th>
                  <th class="px-5 py-3 font-bold">單價</th>
                  <th class="px-5 py-3 font-bold">尺寸</th>
                  <th class="px-5 py-3 font-bold text-right">操作</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                <tr v-for="equipment in filteredEquipments" :key="equipment.id" class="hover:bg-gray-50/60">
                  <td class="px-5 py-4">
                    <div class="flex items-center gap-3">
                      <div class="h-12 w-12 overflow-hidden rounded-2xl bg-gray-100">
                        <PreviewableImage
                          v-if="equipment.image_url"
                          :src="equipment.image_url"
                          :alt="equipment.name"
                          class="h-full w-full"
                        />
                        <div v-else class="flex h-full items-center justify-center text-gray-300">
                          <el-icon><Goods /></el-icon>
                        </div>
                      </div>
                      <div>
                        <div class="font-black text-slate-800">{{ equipment.name }}</div>
                        <div class="mt-1 text-xs text-gray-400">{{ equipment.specs || equipment.notes || '-' }}</div>
                      </div>
                    </div>
                  </td>
                  <td class="px-5 py-4 text-sm font-bold text-gray-600">{{ equipment.category }}</td>
                  <td class="px-5 py-4">
                    <div class="font-black text-slate-800">{{ getEquipmentRemainingOverallQuantity(equipment) }} / {{ equipment.total_quantity }}</div>
                    <div class="mt-1 text-xs text-gray-400">{{ equipment.quick_purchase_enabled ? '開放加購' : '未開放加購' }}</div>
                  </td>
                  <td class="px-5 py-4 font-black text-primary">{{ formatCurrency(equipment.purchase_price) }}</td>
                  <td class="px-5 py-4 text-sm text-gray-500">
                    <span v-if="getEquipmentSizeInventoryList(equipment).length === 0">-</span>
                    <span v-else>{{ getEquipmentSizeInventoryList(equipment).map((size) => `${size.size}:${size.remaining}`).join('、') }}</span>
                  </td>
                  <td class="px-5 py-4">
                    <div class="flex justify-end gap-2">
                      <button v-if="canCreate || canEdit" type="button" class="rounded-xl bg-primary px-3 py-2 text-sm font-bold text-white" @click="openTransactionDialog(equipment, 'borrow')">
                        <el-icon><Tickets /></el-icon>
                      </button>
                      <button type="button" class="rounded-xl border border-gray-200 px-3 py-2 text-sm font-bold text-gray-600" @click="openHistoryDialog(equipment)">
                        紀錄
                      </button>
                      <button v-if="canEdit" type="button" class="rounded-xl border border-gray-200 px-3 py-2 text-sm font-bold text-gray-600" @click="openEditDialog(equipment)">
                        <el-icon><Edit /></el-icon>
                      </button>
                      <button v-if="canDelete" type="button" class="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm font-bold text-red-500" @click="removeEquipment(equipment)">
                        <el-icon><Delete /></el-icon>
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>

    <EquipmentFormDialog
      v-model="isFormDialogOpen"
      :equipment="editingEquipment"
      @saved="refresh"
    />

    <EquipmentTransactionDialog
      v-model="isTransactionDialogOpen"
      :equipment="transactionEquipment"
      :default-type="transactionDefaultType"
      @saved="refresh"
    />

    <EquipmentHistoryDialog
      v-model="isHistoryDialogOpen"
      :equipment="historyEquipment"
      :can-delete="canDelete"
    />
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
