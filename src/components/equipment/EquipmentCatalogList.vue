<script setup lang="ts">
import { Delete, Edit, Goods, Minus, Plus, Tickets } from '@element-plus/icons-vue'
import AppActionOverflow from '@/components/common/AppActionOverflow.vue'
import EquipmentPhotoCarousel from '@/components/equipment/EquipmentPhotoCarousel.vue'
import type { Equipment, EquipmentInventoryAdjustmentType, EquipmentTransactionType } from '@/types/equipment'
import {
  getEquipmentOverAllocatedSizeQuantity,
  getEquipmentRemainingOverallQuantity,
  getEquipmentSizeInventoryList,
  getEquipmentUnassignedAllocatedQuantity
} from '@/utils/equipmentInventory'

defineProps<{
  equipments: Equipment[]
  viewMode: 'grid' | 'table'
  canCreate: boolean
  canEdit: boolean
  canDelete: boolean
}>()
const emit = defineEmits<{
  (event: 'transaction', equipment: Equipment, type?: EquipmentTransactionType): void
  (event: 'history' | 'edit' | 'remove', equipment: Equipment): void
  (event: 'inventory', equipment: Equipment, type?: EquipmentInventoryAdjustmentType): void
}>()

const formatCurrency = (amount: number) => new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0
}).format(Number(amount) || 0)

const getJerseyNumberOptions = (equipment: Equipment) =>
  Array.isArray(equipment.jersey_number_options)
    ? equipment.jersey_number_options
      .map((option) => Number(option))
      .filter((option) => Number.isInteger(option) && option >= 0 && option <= 999)
    : []

const getJerseyNumberSummary = (equipment: Equipment) => {
  const options = getJerseyNumberOptions(equipment)
  if (options.length === 0) {
    return `號碼 ${equipment.jersey_number_min}-${equipment.jersey_number_max}`
  }

  const preview = options.slice(0, 8).map((option) => `#${option}`).join('、')
  return `${preview}${options.length > 8 ? '…' : ''}（可選 ${options.length} 個）`
}

</script>

<template>
  <div v-if="viewMode === 'grid'" class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
    <article
      v-for="equipment in equipments"
      :key="equipment.id"
      class="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm"
    >
      <div class="aspect-[16/9] bg-gray-100">
        <EquipmentPhotoCarousel
          v-if="equipment.image_urls.length > 0"
          :photos="equipment.image_urls"
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
          <div class="flex shrink-0 flex-col items-end gap-2">
            <span
              class="rounded-full px-3 py-1 text-xs font-bold"
              :class="equipment.quick_purchase_enabled ? 'bg-primary/10 text-primary' : 'bg-gray-100 text-gray-400'"
            >
              {{ equipment.quick_purchase_enabled ? '可加購' : '庫存品' }}
            </span>
            <span
              v-if="equipment.is_custom_order"
              class="rounded-full border border-amber-100 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700"
            >
              訂製品
            </span>
          </div>
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
            v-if="equipment.requires_jersey_number"
            class="rounded-full border border-sky-100 bg-sky-50 px-3 py-1 text-xs font-bold text-sky-700"
          >
            {{ getJerseyNumberSummary(equipment) }}
          </span>
          <span
            v-for="size in getEquipmentSizeInventoryList(equipment).slice(0, 6)"
            :key="size.size"
            class="rounded-full border border-gray-100 bg-gray-50 px-3 py-1 text-xs font-bold text-gray-500"
          >
            {{ size.size }}：{{ size.remaining }}/{{ size.total }}
          </span>
          <span
            v-if="getEquipmentUnassignedAllocatedQuantity(equipment) > 0"
            class="rounded-full border border-amber-100 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700"
          >
            未指定尺寸扣除 {{ getEquipmentUnassignedAllocatedQuantity(equipment) }}
          </span>
          <span
            v-if="getEquipmentOverAllocatedSizeQuantity(equipment) > 0"
            class="rounded-full border border-amber-100 bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700"
          >
            尺寸超量扣除 {{ getEquipmentOverAllocatedSizeQuantity(equipment) }}
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
            @click="emit('transaction', equipment)"
          >
            交易
          </button>
          <button
            v-if="!(canCreate || canEdit)"
            type="button"
            class="rounded-xl border border-gray-200 px-3 py-2 text-sm font-bold text-gray-600 hover:border-primary hover:text-primary transition-colors"
            @click="emit('history', equipment)"
          >
            紀錄
          </button>
          <AppActionOverflow v-if="canCreate || canEdit || canDelete">
            <el-dropdown-item v-if="canCreate || canEdit" @click="emit('history', equipment)">查看紀錄</el-dropdown-item>
            <el-dropdown-item v-if="canCreate || canEdit" @click="emit('inventory', equipment)">新增庫存</el-dropdown-item>
            <el-dropdown-item v-if="canEdit" class="!text-red-600" @click="emit('inventory', equipment, 'stock_out')">減少庫存</el-dropdown-item>
            <el-dropdown-item v-if="canCreate || canEdit" @click="emit('transaction', equipment, 'purchase')">快速購買</el-dropdown-item>
            <el-dropdown-item v-if="canEdit" @click="emit('edit', equipment)">編輯</el-dropdown-item>
            <el-dropdown-item v-if="canDelete" class="!text-red-600" @click="emit('remove', equipment)">刪除</el-dropdown-item>
          </AppActionOverflow>
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
          <tr v-for="equipment in equipments" :key="equipment.id" class="hover:bg-gray-50/60">
            <td class="px-5 py-4">
              <div class="flex items-center gap-3">
                <div class="h-12 w-12 overflow-hidden rounded-2xl bg-gray-100">
                  <EquipmentPhotoCarousel
                    v-if="equipment.image_urls.length > 0"
                    :photos="equipment.image_urls"
                    :alt="equipment.name"
                    :show-controls="false"
                    :show-counter="false"
                    class="h-full w-full"
                  />
                  <div v-else class="flex h-full items-center justify-center text-gray-300">
                    <el-icon><Goods /></el-icon>
                  </div>
                </div>
                <div>
                  <div class="font-black text-slate-800">{{ equipment.name }}</div>
                  <div class="mt-1 text-xs text-gray-400">{{ equipment.specs || equipment.notes || '-' }}</div>
                  <div
                    v-if="equipment.is_custom_order"
                    class="mt-1 text-xs font-bold text-amber-600"
                  >
                    訂製品，家長端會顯示需等待備貨
                  </div>
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
              <span v-if="equipment.requires_jersey_number" class="font-bold text-sky-700">
                {{ getJerseyNumberSummary(equipment) }}
              </span>
              <span v-if="equipment.requires_jersey_number && getEquipmentSizeInventoryList(equipment).length > 0">｜</span>
              <span v-if="getEquipmentSizeInventoryList(equipment).length === 0 && !equipment.requires_jersey_number">-</span>
              <span v-else>
                {{ getEquipmentSizeInventoryList(equipment).map((size) => `${size.size}:${size.remaining}`).join('、') }}
                <span v-if="getEquipmentUnassignedAllocatedQuantity(equipment) > 0" class="font-bold text-amber-600">
                  ｜未指定尺寸扣除 {{ getEquipmentUnassignedAllocatedQuantity(equipment) }}
                </span>
                <span v-if="getEquipmentOverAllocatedSizeQuantity(equipment) > 0" class="font-bold text-amber-600">
                  ｜尺寸超量扣除 {{ getEquipmentOverAllocatedSizeQuantity(equipment) }}
                </span>
              </span>
            </td>
            <td class="px-5 py-4">
              <div class="flex justify-end gap-2">
                <button v-if="canCreate || canEdit" type="button" class="min-h-11 rounded-xl bg-primary px-3 py-2 text-sm font-bold text-white" aria-label="新增裝備交易" title="新增裝備交易" @click="emit('transaction', equipment)">
                  <el-icon><Tickets /></el-icon>
                </button>
                <button v-if="!(canCreate || canEdit)" type="button" class="min-h-11 rounded-xl border border-gray-200 px-3 py-2 text-sm font-bold text-gray-600" @click="emit('history', equipment)">
                  紀錄
                </button>
                <AppActionOverflow v-if="canCreate || canEdit || canDelete">
                  <el-dropdown-item v-if="canCreate || canEdit" @click="emit('history', equipment)">查看紀錄</el-dropdown-item>
                  <el-dropdown-item v-if="canCreate || canEdit" @click="emit('inventory', equipment)">
                    <el-icon><Plus /></el-icon>新增庫存
                  </el-dropdown-item>
                  <el-dropdown-item v-if="canEdit" class="!text-red-600" @click="emit('inventory', equipment, 'stock_out')">
                    <el-icon><Minus /></el-icon>減少庫存
                  </el-dropdown-item>
                  <el-dropdown-item v-if="canEdit" @click="emit('edit', equipment)">
                    <el-icon><Edit /></el-icon>編輯
                  </el-dropdown-item>
                  <el-dropdown-item v-if="canDelete" class="!text-red-600" @click="emit('remove', equipment)">
                    <el-icon><Delete /></el-icon>刪除
                  </el-dropdown-item>
                </AppActionOverflow>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
