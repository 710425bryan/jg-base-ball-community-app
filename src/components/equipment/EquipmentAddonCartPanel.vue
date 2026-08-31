<script setup lang="ts">
import { computed } from 'vue'
import type { Equipment } from '@/types/equipment'
import type { EquipmentPurchaseAvailabilityFailure } from '@/utils/equipmentInventory'
import { formatEquipmentVariantLabel } from '@/utils/equipmentPricing'

type EquipmentAddonCartPanelItem = {
  equipment_id: string
  size: string | null
  jersey_number: number | null
  quantity: number
  equipment: Equipment | null
  availabilityFailure: EquipmentPurchaseAvailabilityFailure | null
}

const props = withDefaults(defineProps<{
  items: EquipmentAddonCartPanelItem[]
  note: string
  total: number
  hasInvalidQuantity?: boolean
  availabilityMessage?: string
  hasCustomOrderItems?: boolean
  showHeader?: boolean
}>(), {
  hasInvalidQuantity: false,
  availabilityMessage: '',
  hasCustomOrderItems: false,
  showHeader: true
})

const emit = defineEmits<{
  (event: 'update:note', value: string): void
  (event: 'update-quantity', index: number, value: number | undefined): void
  (event: 'remove', index: number): void
}>()

const noteModel = computed({
  get: () => props.note,
  set: (value: string) => emit('update:note', value)
})

const formatCurrency = (amount: number) => new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0
}).format(Number(amount) || 0)

const isValidQuantity = (value: unknown) => {
  const quantity = Number(value)
  return Number.isFinite(quantity) && quantity > 0
}
</script>

<template>
  <div data-test="equipment-addon-cart-panel">
    <div v-if="showHeader" class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
      <div>
        <h3 class="text-lg font-black text-slate-800">請購表單</h3>
        <p class="mt-1 text-xs text-gray-500 md:text-sm">
          一張請購單只對應一位成員，但可以加入多個裝備品項。
        </p>
      </div>
      <span class="self-start rounded-full bg-primary/10 px-3 py-1 text-xs font-black text-primary">
        {{ items.length }} 項
      </span>
    </div>

    <div
      v-if="items.length === 0"
      class="mt-5 rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-8 text-center text-sm font-bold text-gray-400"
    >
      請從「可加購裝備」加入品項。
    </div>

    <div v-else class="mt-5 space-y-3">
      <article
        v-for="(item, index) in items"
        :key="`${item.equipment_id}-${item.size || 'none'}-${item.jersey_number ?? 'no-number'}`"
        class="rounded-2xl border p-4"
        :class="item.availabilityFailure ? 'border-red-100 bg-red-50/70' : 'border-gray-100 bg-gray-50/70'"
      >
        <div class="flex flex-col gap-4 md:flex-row md:items-center">
          <div class="min-w-0 flex-1">
            <div class="text-xs font-black text-gray-400">品項 {{ index + 1 }}</div>
            <div class="mt-1 font-black text-slate-800">{{ item.equipment?.name || '未知裝備' }}</div>
            <p class="mt-1 text-xs text-gray-400">{{ formatEquipmentVariantLabel(item) }}</p>
            <p v-if="item.equipment?.is_custom_order" class="mt-2 text-xs font-black text-amber-700">
              訂製品｜需等待備貨
            </p>
          </div>

          <div class="md:w-40">
            <div class="mb-1 text-xs font-bold text-gray-400">數量</div>
            <div
              v-if="item.equipment?.requires_jersey_number"
              class="rounded-xl border border-gray-100 bg-white px-3 py-3 text-sm font-black text-gray-600"
            >
              1 件
            </div>
            <el-input-number
              v-else
              :model-value="item.quantity"
              :min="1"
              :precision="0"
              size="large"
              class="!w-full"
              :aria-label="`${item.equipment?.name || '裝備'}數量`"
              @update:model-value="(value: number | undefined) => emit('update-quantity', index, value)"
            />
          </div>

          <div class="md:w-28 md:text-right">
            <div class="mb-1 text-xs font-bold text-gray-400">小計</div>
            <div class="font-black text-primary">
              {{ formatCurrency(Number(item.equipment?.purchase_price || 0) * (isValidQuantity(item.quantity) ? item.quantity : 0)) }}
            </div>
          </div>

          <button
            type="button"
            class="min-h-11 self-start rounded-xl px-3 text-sm font-bold text-red-500 transition-colors hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400 md:self-center"
            :aria-label="`移除${item.equipment?.name || '裝備'}`"
            @click="emit('remove', index)"
          >
            移除
          </button>
        </div>
        <p
          v-if="item.availabilityFailure"
          class="mt-3 rounded-xl border border-red-100 bg-white px-3 py-2 text-sm font-bold text-red-600"
          role="alert"
        >
          {{ item.availabilityFailure.reason }}
        </p>
      </article>
    </div>

    <div class="mt-5 rounded-2xl border border-gray-100 bg-white px-4 py-4">
      <div class="grid gap-4 md:grid-cols-[1fr_auto] md:items-start">
        <el-input
          v-model="noteModel"
          type="textarea"
          :rows="3"
          maxlength="120"
          show-word-limit
          placeholder="可補充尺寸需求、備註或聯絡資訊"
          aria-label="請購備註"
        />
        <div class="md:min-w-36 md:text-right">
          <div class="text-xs font-bold text-gray-400">預估合計</div>
          <div class="mt-1 text-2xl font-black text-primary">{{ formatCurrency(total) }}</div>
        </div>
      </div>

      <div
        v-if="hasInvalidQuantity"
        class="mt-3 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm font-bold text-red-600"
        role="alert"
      >
        請確認每個加購項目都有填寫大於 0 的數量。
      </div>
      <div
        v-else-if="availabilityMessage"
        class="mt-3 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm font-bold text-red-600"
        role="alert"
      >
        {{ availabilityMessage }}
      </div>
      <div
        v-if="hasCustomOrderItems"
        class="mt-3 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-700"
      >
        清單含訂製品，送出後需等待管理員通知備貨狀態。
      </div>

      <slot name="actions" />
    </div>
  </div>
</template>
