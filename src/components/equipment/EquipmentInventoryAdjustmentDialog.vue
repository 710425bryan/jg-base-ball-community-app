<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox } from 'element-plus'
import AppDialogFooter from '@/components/common/AppDialogFooter.vue'
import { useEquipmentStore } from '@/stores/equipment'
import { useAuthStore } from '@/stores/auth'
import type {
  Equipment,
  EquipmentInventoryAdjustmentPayload,
  EquipmentInventoryAdjustmentType
} from '@/types/equipment'
import {
  getEquipmentInventoryAdjustmentPreview,
  getEquipmentInventoryReductionLimit,
  getSignedEquipmentInventoryAdjustmentQuantity
} from '@/utils/equipmentInventoryAdjustment'

const props = withDefaults(defineProps<{
  modelValue: boolean
  equipment: Equipment | null
  adjustmentType?: EquipmentInventoryAdjustmentType
}>(), {
  adjustmentType: 'stock_in'
})

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'saved'): void
}>()

const equipmentStore = useEquipmentStore()
const authStore = useAuthStore()
const formRef = ref()

const form = reactive<EquipmentInventoryAdjustmentPayload>({
  equipment_id: '',
  adjustment_date: dayjs().format('YYYY-MM-DD'),
  member_id: null,
  handled_by: '',
  size: null,
  quantity_delta: 1,
  notes: ''
})

const isOpen = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value)
})

const normalizeSize = (value?: string | null) => String(value || '').trim()
const sizeOptions = computed(() => props.equipment?.sizes_stock?.filter((item) => item.size) || [])
const requiresSize = computed(() => sizeOptions.value.length > 0)
const selectedSize = computed(() => normalizeSize(form.size))
const quantityDelta = computed(() => Math.max(Math.floor(Number(form.quantity_delta || 0)), 0))
const isStockOut = computed(() => props.adjustmentType === 'stock_out')
const dialogTitle = computed(() => isStockOut.value ? '減少庫存' : '新增庫存')
const actionLabel = computed(() => isStockOut.value ? '確認減少庫存' : '新增庫存')
const quantityLabel = computed(() => isStockOut.value ? '減少數量' : '新增數量')
const preview = computed(() => getEquipmentInventoryAdjustmentPreview(
  props.equipment,
  props.adjustmentType,
  selectedSize.value,
  quantityDelta.value
))
const reductionLimit = computed(() => isStockOut.value
  ? getEquipmentInventoryReductionLimit(props.equipment, selectedSize.value)
  : null)
const quantityInputMax = computed(() => {
  if (!isStockOut.value) return undefined
  return Math.max(Number(reductionLimit.value || 0), 1)
})
const isQuantityInputDisabled = computed(() =>
  isStockOut.value
  && (!props.equipment || (requiresSize.value && !selectedSize.value) || Number(reductionLimit.value || 0) <= 0)
)
const currentOperatorName = computed(() =>
  authStore.profile?.nickname || authStore.profile?.name || authStore.user?.email || '目前登入者'
)
const getSizeOptionReductionLimit = (size: string) =>
  getEquipmentInventoryReductionLimit(props.equipment, size)
const getSizeOptionLabel = (size: string, quantity: number) => isStockOut.value
  ? `${size}｜可減 ${getSizeOptionReductionLimit(size)}`
  : `${size}｜${quantity}`

const rules = {
  adjustment_date: [{ required: true, message: '請選擇日期', trigger: 'change' }],
  size: [
    {
      validator: (_rule: unknown, value: string | null, callback: (error?: Error) => void) => {
        if (requiresSize.value && !String(value || '').trim()) {
          callback(new Error(isStockOut.value ? '請選擇要減少的尺寸規格' : '請選擇或輸入尺寸規格'))
          return
        }
        callback()
      },
      trigger: ['blur', 'change']
    }
  ],
  quantity_delta: [
    {
      validator: (_rule: unknown, value: number, callback: (error?: Error) => void) => {
        if (!Number.isInteger(Number(value)) || Number(value) <= 0) {
          callback(new Error(`${quantityLabel.value}需為整數且大於 0`))
          return
        }
        if (isStockOut.value && Number(value) > Number(reductionLimit.value || 0)) {
          callback(new Error(`目前最多可減少 ${Number(reductionLimit.value || 0)} 件`))
          return
        }
        callback()
      },
      trigger: ['blur', 'change']
    }
  ],
  notes: [
    {
      validator: (_rule: unknown, value: string | null, callback: (error?: Error) => void) => {
        if (isStockOut.value && !String(value || '').trim()) {
          callback(new Error('請填寫減少庫存原因'))
          return
        }
        callback()
      },
      trigger: ['blur', 'change']
    }
  ]
}

const resetForm = async () => {
  form.equipment_id = props.equipment?.id || ''
  form.adjustment_date = dayjs().format('YYYY-MM-DD')
  form.member_id = null
  form.handled_by = currentOperatorName.value
  const availableSizes = isStockOut.value
    ? sizeOptions.value.filter((item) => getSizeOptionReductionLimit(item.size) > 0)
    : []
  form.size = availableSizes.length === 1 ? availableSizes[0].size : null
  form.quantity_delta = 1
  form.notes = ''
  formRef.value?.clearValidate?.()
}

const submit = async () => {
  if (!props.equipment || !formRef.value) return
  const equipment = props.equipment

  await formRef.value.validate(async (valid: boolean) => {
    if (!valid) return

    try {
      if (isStockOut.value) {
        const sizeLabel = selectedSize.value ? `（${selectedSize.value}）` : ''
        await ElMessageBox.confirm(
          `確定要將「${equipment.name}」${sizeLabel}庫存減少 ${quantityDelta.value} 件嗎？此動作會保留庫存異動紀錄。`,
          '確認減少庫存',
          {
            confirmButtonText: '確認減少',
            cancelButtonText: '取消',
            type: 'warning'
          }
        )
      }

      await equipmentStore.addInventoryAdjustment({
        ...form,
        equipment_id: equipment.id,
        member_id: form.member_id || null,
        handled_by: form.handled_by?.trim() || null,
        size: selectedSize.value || null,
        quantity_delta: getSignedEquipmentInventoryAdjustmentQuantity(
          props.adjustmentType,
          form.quantity_delta
        ),
        notes: form.notes?.trim() || null
      })
      ElMessage.success(isStockOut.value ? '已減少庫存' : '已新增庫存')
      emit('saved')
      isOpen.value = false
    } catch (error: any) {
      if (error === 'cancel' || error === 'close') return
      ElMessage.error(error?.message || `${dialogTitle.value}失敗`)
    }
  })
}

watch(() => [props.modelValue, props.adjustmentType] as const, ([value]) => {
  if (value) void resetForm()
})
</script>

<template>
  <el-dialog
    v-model="isOpen"
    :title="dialogTitle"
    width="92%"
    style="max-width: 620px; border-radius: 16px;"
    destroy-on-close
  >
    <div
      v-if="equipment"
      class="mb-4 rounded-2xl px-4 py-3"
      :class="isStockOut ? 'border border-rose-100 bg-rose-50/80' : 'border border-emerald-100 bg-emerald-50/80'"
    >
      <div class="text-lg font-black text-slate-800">{{ equipment.name }}</div>
      <div class="mt-3 grid grid-cols-2 gap-2 text-center">
        <div class="rounded-xl bg-white/80 px-3 py-2">
          <div class="text-[11px] font-bold text-gray-400">總量</div>
          <div class="mt-1 font-black text-slate-800">{{ preview.currentTotal }} → {{ preview.nextTotal }}</div>
        </div>
        <div class="rounded-xl bg-white/80 px-3 py-2">
          <div class="text-[11px] font-bold" :class="isStockOut ? 'text-rose-600' : 'text-emerald-600'">可用</div>
          <div class="mt-1 font-black" :class="isStockOut ? 'text-rose-700' : 'text-emerald-700'">
            {{ preview.currentAvailable }} → {{ preview.nextAvailable }}
          </div>
        </div>
      </div>
      <div v-if="selectedSize" class="mt-2 rounded-xl bg-white/80 px-3 py-2 text-center">
        <div class="text-[11px] font-bold text-gray-400">{{ selectedSize }}</div>
        <div class="mt-1 font-black text-slate-800">
          {{ preview.currentSizeStockQuantity }} → {{ preview.nextSizeStockQuantity }}
        </div>
      </div>
    </div>

    <el-form ref="formRef" :model="form" :rules="rules" label-position="top" class="space-y-4">
      <div class="grid gap-4 md:grid-cols-2">
        <el-form-item label="日期" prop="adjustment_date" class="font-bold">
          <el-date-picker
            v-model="form.adjustment_date"
            type="date"
            format="YYYY-MM-DD"
            value-format="YYYY-MM-DD"
            placeholder="請選擇日期"
            :clearable="false"
            class="!w-full"
            size="large"
          />
        </el-form-item>

        <el-form-item label="人員" prop="handled_by" class="font-bold">
          <el-input
            :model-value="currentOperatorName || '目前登入者'"
            size="large"
            disabled
          />
        </el-form-item>
      </div>

      <div class="grid gap-4 md:grid-cols-2">
        <el-form-item label="尺寸規格" prop="size" class="font-bold">
          <el-select
            v-if="sizeOptions.length > 0"
            v-model="form.size"
            class="w-full"
            size="large"
            clearable
            filterable
            :allow-create="!isStockOut"
            default-first-option
            :placeholder="isStockOut ? '請選擇要減少的規格' : '請選擇或輸入'"
          >
            <el-option
              v-for="item in sizeOptions"
              :key="item.size"
              :label="getSizeOptionLabel(item.size, item.quantity)"
              :value="item.size"
              :disabled="isStockOut && getSizeOptionReductionLimit(item.size) <= 0"
            />
          </el-select>
          <el-input
            v-else
            v-model="form.size"
            size="large"
            :disabled="isStockOut"
            :placeholder="isStockOut ? '此裝備沒有尺寸規格' : '可留空'"
          />
        </el-form-item>

        <el-form-item :label="quantityLabel" prop="quantity_delta" class="font-bold">
          <el-input-number
            v-model="form.quantity_delta"
            class="!w-full"
            :min="1"
            :max="quantityInputMax"
            :disabled="isQuantityInputDisabled"
            size="large"
          />
          <p v-if="isStockOut" class="mt-1 text-xs font-medium text-rose-600">
            {{ selectedSize || !requiresSize ? `目前最多可減少 ${Number(reductionLimit || 0)} 件` : '請先選擇尺寸規格' }}
          </p>
        </el-form-item>

      </div>

      <el-form-item :label="isStockOut ? '減少原因' : '備註'" prop="notes" class="font-bold">
        <el-input
          v-model="form.notes"
          type="textarea"
          :rows="3"
          maxlength="160"
          show-word-limit
          :placeholder="isStockOut ? '例如：盤點短少、損壞報廢' : '可留空'"
        />
      </el-form-item>
    </el-form>

    <template #footer>
      <AppDialogFooter
        :confirm-label="actionLabel"
        :loading="equipmentStore.isSaving"
        :confirm-disabled="isQuantityInputDisabled"
        :danger="isStockOut"
        @cancel="isOpen = false"
        @confirm="submit"
      />
    </template>
  </el-dialog>
</template>
