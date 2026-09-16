<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Filter, Goods, Plus, Refresh, Sort } from '@element-plus/icons-vue'
import ViewModeSwitch from '@/components/ViewModeSwitch.vue'
import AppPageHeader from '@/components/common/AppPageHeader.vue'
import AppLoadingState from '@/components/common/AppLoadingState.vue'
import AppMobileFilterSheet from '@/components/common/AppMobileFilterSheet.vue'
import EquipmentFormDialog from '@/components/equipment/EquipmentFormDialog.vue'
import EquipmentHistoryDialog from '@/components/equipment/EquipmentHistoryDialog.vue'
import EquipmentInventoryAdjustmentDialog from '@/components/equipment/EquipmentInventoryAdjustmentDialog.vue'
import EquipmentCatalogList from '@/components/equipment/EquipmentCatalogList.vue'
import EquipmentOrderDialog from '@/components/equipment/EquipmentOrderDialog.vue'
import EquipmentTransactionDialog from '@/components/equipment/EquipmentTransactionDialog.vue'
import { useEquipmentStore } from '@/stores/equipment'
import { usePermissionsStore } from '@/stores/permissions'
import type {
  Equipment,
  EquipmentInventoryAdjustmentType,
  EquipmentTransactionType
} from '@/types/equipment'
import { getEquipmentRemainingOverallQuantity } from '@/utils/equipmentInventory'

const equipmentStore = useEquipmentStore()
const permissionsStore = usePermissionsStore()

const searchKeyword = ref('')
const selectedCategory = ref('all')
const viewMode = ref<'grid' | 'table'>('grid')
const isMobileFiltersOpen = ref(false)
const isFormDialogOpen = ref(false)
const isOrderDialogOpen = ref(false)
const editingEquipment = ref<Equipment | null>(null)
const isInventoryDialogOpen = ref(false)
const inventoryAdjustmentEquipment = ref<Equipment | null>(null)
const inventoryAdjustmentType = ref<EquipmentInventoryAdjustmentType>('stock_in')
const isTransactionDialogOpen = ref(false)
const transactionEquipment = ref<Equipment | null>(null)
const transactionDefaultType = ref<EquipmentTransactionType>('purchase')
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

const hasActiveFilters = computed(() =>
  searchKeyword.value.trim().length > 0 || selectedCategory.value !== 'all'
)

const activeAdvancedFilterCount = computed(() => Number(selectedCategory.value !== 'all'))

const clearFilters = () => {
  searchKeyword.value = ''
  selectedCategory.value = 'all'
  isMobileFiltersOpen.value = false
}

const clearAdvancedFilters = () => {
  selectedCategory.value = 'all'
}

const openCreateDialog = () => {
  editingEquipment.value = null
  isFormDialogOpen.value = true
}

const openEditDialog = (equipment: Equipment) => {
  editingEquipment.value = equipment
  isFormDialogOpen.value = true
}

const openInventoryDialog = (
  equipment: Equipment,
  adjustmentType: EquipmentInventoryAdjustmentType = 'stock_in'
) => {
  inventoryAdjustmentEquipment.value = equipment
  inventoryAdjustmentType.value = adjustmentType
  isInventoryDialogOpen.value = true
}

const openTransactionDialog = (equipment: Equipment, type: EquipmentTransactionType = 'purchase') => {
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
  <div class="min-h-full flex flex-col relative animate-fade-in bg-gray-50 text-text">
    <div class="bg-white px-3 py-3 md:px-6 md:py-4 border-b border-gray-200 shadow-sm shrink-0 z-10">
      <div class="max-w-7xl mx-auto flex flex-col gap-3 md:gap-4">
        <div class="flex items-center justify-between gap-3">
          <AppPageHeader
            title="裝備管理"
            subtitle="管理裝備庫存、借還領取、加購品項與交易紀錄"
            :icon="Goods"
            as="h2"
          >
            <template #actions>
              <button
                type="button"
                class="inline-flex h-11 w-11 items-center justify-center gap-2 rounded-2xl border border-gray-200 text-sm font-bold text-gray-600 hover:border-primary hover:text-primary transition-colors disabled:opacity-70 md:w-auto md:px-4"
                :disabled="equipmentStore.isLoading"
                title="重新整理"
                @click="refresh"
              >
                <el-icon :class="{ 'is-loading': equipmentStore.isLoading }"><Refresh /></el-icon>
                <span class="hidden md:inline">重新整理</span>
              </button>
              <button
                v-if="canCreate"
                type="button"
                class="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-3 text-sm font-bold text-white transition-colors hover:bg-primary-hover md:px-5"
                @click="openCreateDialog"
              >
                <el-icon><Plus /></el-icon>
                <span class="md:hidden">新增</span>
                <span class="hidden md:inline">新增裝備</span>
              </button>
            </template>
          </AppPageHeader>
        </div>

        <div class="grid grid-cols-4 gap-1.5 md:gap-3">
          <section class="rounded-xl border border-primary/15 bg-primary/5 px-2.5 py-2 md:rounded-2xl md:px-4 md:py-3">
            <p class="text-[10px] font-bold text-primary/70 md:text-[11px] md:uppercase md:tracking-[0.16em]">品項</p>
            <p class="mt-0.5 text-lg font-black text-primary md:mt-2 md:text-2xl">{{ summary.totalItems }}</p>
          </section>
          <section class="rounded-xl border border-sky-100 bg-sky-50 px-2.5 py-2 md:rounded-2xl md:px-4 md:py-3">
            <p class="text-[10px] font-bold text-sky-700 md:text-[11px] md:uppercase md:tracking-[0.16em]">總數量</p>
            <p class="mt-0.5 text-lg font-black text-sky-800 md:mt-2 md:text-2xl">{{ summary.totalQuantity }}</p>
          </section>
          <section class="rounded-xl border border-emerald-100 bg-emerald-50 px-2.5 py-2 md:rounded-2xl md:px-4 md:py-3">
            <p class="text-[10px] font-bold text-emerald-700 md:text-[11px] md:uppercase md:tracking-[0.16em]">可用庫存</p>
            <p class="mt-0.5 text-lg font-black text-emerald-700 md:mt-2 md:text-2xl">{{ summary.remainingQuantity }}</p>
          </section>
          <section class="rounded-xl border border-amber-100 bg-amber-50 px-2.5 py-2 md:rounded-2xl md:px-4 md:py-3">
            <p class="text-[10px] font-bold text-amber-700 md:text-[11px] md:uppercase md:tracking-[0.16em]">開放加購</p>
            <p class="mt-0.5 text-lg font-black text-amber-700 md:mt-2 md:text-2xl">{{ summary.quickPurchaseCount }}</p>
          </section>
        </div>

        <div class="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div class="app-search-filter-bar md:grid-cols-[minmax(0,1fr)_220px] lg:min-w-[560px]">
            <el-input v-model="searchKeyword" size="large" clearable class="app-search-control" placeholder="搜尋裝備名稱、規格或備註" />
            <button
              type="button"
              class="app-mobile-filter-trigger md:hidden"
              aria-label="開啟裝備篩選"
              title="開啟裝備篩選"
              :aria-expanded="isMobileFiltersOpen"
              @click="isMobileFiltersOpen = true"
            >
              <el-icon><Filter /></el-icon>
              <span v-if="activeAdvancedFilterCount > 0" class="app-mobile-filter-badge">{{ activeAdvancedFilterCount }}</span>
            </button>
            <el-select v-model="selectedCategory" size="large" class="hidden w-full md:block">
              <el-option
                v-for="category in categories"
                :key="category"
                :label="category === 'all' ? '全部分類' : category"
                :value="category"
              />
            </el-select>
          </div>
          <div class="flex shrink-0 flex-wrap items-center gap-2">
            <button
              v-if="canEdit"
              type="button"
              class="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-600 enabled:hover:border-primary enabled:hover:text-primary disabled:opacity-50"
              :disabled="equipmentStore.isLoading || equipmentStore.equipments.length < 2"
              @click="isOrderDialogOpen = true"
            >
              <el-icon><Sort /></el-icon>調整排序
            </button>
            <ViewModeSwitch v-model="viewMode" class="hidden md:inline-flex" />
          </div>

          <div class="flex items-center justify-between text-xs font-bold text-gray-400 md:hidden">
            <span>顯示 {{ filteredEquipments.length }} / {{ summary.totalItems }}</span>
            <button
              v-if="hasActiveFilters"
              type="button"
              class="min-h-11 rounded-xl px-3 text-primary hover:bg-orange-50"
              @click="clearFilters"
            >
              清除篩選
            </button>
          </div>

        </div>
      </div>
    </div>

    <AppMobileFilterSheet
      v-model="isMobileFiltersOpen"
      title="裝備篩選"
      :active-count="activeAdvancedFilterCount"
      :clear-disabled="activeAdvancedFilterCount === 0"
      @clear="clearAdvancedFilters"
    >
      <div class="space-y-4">
        <div>
          <label class="mb-1.5 block text-sm font-bold text-slate-600">裝備分類</label>
          <el-select v-model="selectedCategory" size="large" class="w-full">
            <el-option
              v-for="category in categories"
              :key="category"
              :label="category === 'all' ? '全部分類' : category"
              :value="category"
            />
          </el-select>
        </div>
        <div>
          <label class="mb-1.5 block text-sm font-bold text-slate-600">顯示方式</label>
          <div class="rounded-xl border border-slate-200 bg-white p-2">
            <ViewModeSwitch v-model="viewMode" />
          </div>
        </div>
      </div>
    </AppMobileFilterSheet>

    <div class="min-h-0 flex-1 p-3 pb-5 md:p-6 md:pb-6">
      <div class="max-w-7xl mx-auto">
        <AppLoadingState v-if="equipmentStore.isLoading" text="裝備資料載入中..." />

        <section v-else-if="filteredEquipments.length === 0" class="rounded-3xl border border-gray-100 bg-white p-10 text-center shadow-sm">
          <el-icon class="text-6xl text-gray-200"><Goods /></el-icon>
          <h3 class="mt-4 text-lg font-black text-slate-800">沒有符合條件的裝備</h3>
          <p class="mt-2 text-sm text-gray-400">調整搜尋條件，或新增第一筆裝備資料。</p>
        </section>

        <EquipmentCatalogList
          v-else
          :equipments="filteredEquipments"
          :view-mode="viewMode"
          :can-create="canCreate"
          :can-edit="canEdit"
          :can-delete="canDelete"
          @transaction="openTransactionDialog"
          @history="openHistoryDialog"
          @inventory="openInventoryDialog"
          @edit="openEditDialog"
          @remove="removeEquipment"
        />
      </div>
    </div>

    <EquipmentOrderDialog
      v-if="canEdit"
      v-model="isOrderDialogOpen"
      :equipments="equipmentStore.equipments"
    />

    <EquipmentFormDialog
      v-model="isFormDialogOpen"
      :equipment="editingEquipment"
      @saved="refresh"
    />

    <EquipmentInventoryAdjustmentDialog
      v-model="isInventoryDialogOpen"
      :equipment="inventoryAdjustmentEquipment"
      :adjustment-type="inventoryAdjustmentType"
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
