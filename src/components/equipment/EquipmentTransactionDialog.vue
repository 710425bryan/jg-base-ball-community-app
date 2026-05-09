<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import dayjs from 'dayjs'
import { ElMessage } from 'element-plus'
import { Loading } from '@element-plus/icons-vue'
import { useEquipmentStore } from '@/stores/equipment'
import type { Equipment, EquipmentTransactionPayload, EquipmentTransactionType } from '@/types/equipment'
import {
  getEquipmentAvailablePurchaseQuantity,
  getEquipmentRemainingOverallQuantity,
  getEquipmentSizeInventoryList,
  isOutgoingEquipmentTransactionType
} from '@/utils/equipmentInventory'

const props = defineProps<{
  modelValue: boolean
  equipment: Equipment | null
  defaultType?: EquipmentTransactionType
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'saved'): void
}>()

const equipmentStore = useEquipmentStore()
const formRef = ref()
const isSubmitting = ref(false)

const form = reactive<EquipmentTransactionPayload>({
  equipment_id: '',
  transaction_type: 'purchase',
  transaction_date: dayjs().format('YYYY-MM-DD'),
  member_id: null,
  handled_by: '',
  size: null,
  jersey_number: null,
  quantity: 1,
  notes: '',
  unit_price: null
})

const isOpen = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value)
})

const typeOptions: Array<{ value: EquipmentTransactionType; label: string; helper: string }> = [
  { value: 'purchase', label: '購買', helper: '管理端直接記錄購買交易。' },
  { value: 'receive', label: '領取', helper: '永久發放給成員。' },
  { value: 'borrow', label: '借出', helper: '會扣除可用庫存，歸還後補回。' },
  { value: 'return', label: '歸還', helper: '會補回已借出數量。' }
]

const currentType = computed(() => typeOptions.find((option) => option.value === form.transaction_type))
const sizeOptions = computed(() => props.equipment ? getEquipmentSizeInventoryList(props.equipment) : [])
const jerseyNumberOptions = computed(() =>
  Array.isArray(props.equipment?.jersey_number_options)
    ? props.equipment.jersey_number_options
      .map((option) => Number(option))
      .filter((option) => Number.isInteger(option) && option >= 0 && option <= 999)
    : []
)
const requiresSize = computed(() => sizeOptions.value.length > 0)
const requiresMember = computed(() => form.transaction_type === 'purchase')
const requiresJerseyNumber = computed(() =>
  Boolean(props.equipment?.requires_jersey_number) && form.transaction_type === 'purchase'
)
const normalizeSize = (value?: string | null) => String(value || '').trim()
const isOutgoingTransaction = computed(() => isOutgoingEquipmentTransactionType(form.transaction_type))
const selectedSize = computed(() => (requiresSize.value ? normalizeSize(form.size) : null))
const availableQuantity = computed(() => {
  if (!props.equipment || !isOutgoingTransaction.value) return null
  return getEquipmentAvailablePurchaseQuantity(props.equipment, selectedSize.value)
})
const quantityInputMax = computed(() => {
  if (!isOutgoingTransaction.value) return undefined
  const available = Number(availableQuantity.value ?? 0)
  if (available <= 0) return 1
  return requiresJerseyNumber.value ? 1 : available
})
const isQuantityInputDisabled = computed(() =>
  requiresJerseyNumber.value
  || (isOutgoingTransaction.value && Number(availableQuantity.value ?? 0) <= 0)
)
const overallRemainingLabel = computed(() =>
  props.equipment ? getEquipmentRemainingOverallQuantity(props.equipment) : 0
)
const getSizeOptionLabel = (item: ReturnType<typeof getEquipmentSizeInventoryList>[number]) =>
  isOutgoingTransaction.value
    ? `${item.size}｜可用 ${item.remaining}/${item.total}`
    : `${item.size}｜${item.total}`
const getSelectedStockLabel = () => {
  if (!isOutgoingTransaction.value) return ''
  if (requiresSize.value && !selectedSize.value) return '請先選擇尺寸或序號'
  const available = Number(availableQuantity.value ?? 0)
  if (requiresSize.value && selectedSize.value) return `此尺寸可用 ${available} 件`
  return `目前可用 ${available} 件`
}

const syncQuantityWithAvailability = () => {
  if (requiresJerseyNumber.value) {
    form.quantity = 1
    return
  }

  if (!Number.isFinite(Number(form.quantity)) || Number(form.quantity) < 1) {
    form.quantity = 1
  }

  if (!isOutgoingTransaction.value) return
  const available = Number(availableQuantity.value ?? 0)
  if (available > 0 && Number(form.quantity) > available) {
    form.quantity = available
  }
}

const rules = {
  transaction_type: [{ required: true, message: '請選擇交易類型', trigger: 'change' }],
  transaction_date: [{ required: true, message: '請選擇日期', trigger: 'change' }],
  member_id: [
    {
      validator: (_rule: unknown, value: string | null, callback: (error?: Error) => void) => {
        if (requiresMember.value && !value) {
          callback(new Error('請選擇付款歸屬成員'))
          return
        }
        callback()
      },
      trigger: ['blur', 'change']
    }
  ],
  size: [
    {
      validator: (_rule: unknown, value: string | null, callback: (error?: Error) => void) => {
        if (requiresSize.value && !normalizeSize(value)) {
          callback(new Error('請選擇尺寸或序號'))
          return
        }
        callback()
      },
      trigger: ['blur', 'change']
    }
  ],
  quantity: [
    {
      validator: (_rule: unknown, value: number, callback: (error?: Error) => void) => {
        if (!Number.isFinite(Number(value)) || Number(value) <= 0) {
          callback(new Error('數量需大於 0'))
          return
        }
        if (requiresJerseyNumber.value && Number(value) !== 1) {
          callback(new Error('球衣每筆交易固定 1 件'))
          return
        }
        if (isOutgoingTransaction.value) {
          const available = Number(availableQuantity.value ?? 0)
          if (available <= 0) {
            callback(new Error(requiresSize.value ? '此尺寸目前沒有可用庫存' : '此裝備目前沒有可用庫存'))
            return
          }
          if (Number(value) > available) {
            callback(new Error(`可用庫存剩 ${available} 件`))
            return
          }
        }
        callback()
      },
      trigger: ['blur', 'change']
    }
  ],
  jersey_number: [
    {
      validator: (_rule: unknown, value: number | null, callback: (error?: Error) => void) => {
        if (!requiresJerseyNumber.value) {
          callback()
          return
        }

        if (value === null || value === undefined || String(value).trim() === '') {
          callback(new Error('請選擇球衣號碼'))
          return
        }

        const parsed = Number(value)
        const min = Number(props.equipment?.jersey_number_min ?? 0)
        const max = Number(props.equipment?.jersey_number_max ?? 99)
        if (jerseyNumberOptions.value.length > 0 && !jerseyNumberOptions.value.includes(parsed)) {
          callback(new Error('請選擇目前開放的球衣號碼'))
          return
        }
        if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
          callback(new Error(`請輸入 ${min} - ${max} 的球衣號碼`))
          return
        }
        callback()
      },
      trigger: ['blur', 'change']
    }
  ]
}

const resetForm = async () => {
  const nextType = props.defaultType || 'purchase'
  form.equipment_id = props.equipment?.id || ''
  form.transaction_type = nextType
  form.transaction_date = dayjs().format('YYYY-MM-DD')
  form.member_id = null
  form.handled_by = ''
  const autoSizeOptions = isOutgoingEquipmentTransactionType(nextType)
    ? sizeOptions.value.filter((item) => item.remaining > 0)
    : sizeOptions.value
  form.size = autoSizeOptions.length === 1 ? autoSizeOptions[0].size : null
  form.jersey_number = null
  form.quantity = 1
  form.notes = ''
  form.unit_price = nextType === 'purchase' ? Number(props.equipment?.purchase_price || 0) : null
  syncQuantityWithAvailability()
  formRef.value?.clearValidate?.()

  if (equipmentStore.members.length === 0) {
    await equipmentStore.loadMembers()
  }
}

const submit = async () => {
  if (!props.equipment || !formRef.value) return
  const equipment = props.equipment

  await formRef.value.validate(async (valid: boolean) => {
    if (!valid) return

    isSubmitting.value = true
    try {
      await equipmentStore.addTransaction({
        ...form,
        equipment_id: equipment.id,
        handled_by: form.handled_by?.trim() || null,
        size: normalizeSize(form.size) || null,
        jersey_number: requiresJerseyNumber.value ? Number(form.jersey_number) : null,
        notes: form.notes?.trim() || null,
        unit_price: form.transaction_type === 'purchase'
          ? Number(form.unit_price ?? equipment.purchase_price ?? 0)
          : null
      })
      ElMessage.success('已新增交易紀錄')
      emit('saved')
      isOpen.value = false
    } catch (error: any) {
      ElMessage.error(error?.message || '新增交易紀錄失敗')
    } finally {
      isSubmitting.value = false
    }
  })
}

watch(() => props.modelValue, (value) => {
  if (value) void resetForm()
})

watch(() => form.transaction_type, (type) => {
  if (type === 'purchase') {
    form.unit_price = Number(props.equipment?.purchase_price || 0)
  } else {
    form.unit_price = null
  }
  formRef.value?.clearValidate?.(['member_id', 'jersey_number'])
  syncQuantityWithAvailability()
})

watch([() => form.size, availableQuantity, requiresJerseyNumber], () => {
  syncQuantityWithAvailability()
  formRef.value?.clearValidate?.(['quantity'])
})
</script>

<template>
  <el-dialog
    v-model="isOpen"
    title="新增裝備交易"
    width="92%"
    style="max-width: 620px; border-radius: 16px;"
    destroy-on-close
  >
    <div v-if="equipment" class="mb-4 rounded-2xl border border-primary/10 bg-primary/5 px-4 py-3">
      <div class="text-lg font-black text-slate-800">{{ equipment.name }}</div>
      <p class="mt-1 text-xs text-primary font-bold">
        {{ equipment.category }}｜總數量 {{ equipment.total_quantity }}｜可用 {{ overallRemainingLabel }}
      </p>
    </div>

    <el-form ref="formRef" :model="form" :rules="rules" label-position="top" class="space-y-4">
      <el-form-item label="交易類型" prop="transaction_type" class="font-bold">
        <el-radio-group v-model="form.transaction_type" class="transaction-type-group w-full">
          <el-radio-button v-for="option in typeOptions" :key="option.value" :label="option.value">
            {{ option.label }}
          </el-radio-button>
        </el-radio-group>
        <p class="mt-2 text-xs text-gray-400">{{ currentType?.helper }}</p>
      </el-form-item>

      <div class="grid gap-4 md:grid-cols-2">
        <el-form-item label="日期" prop="transaction_date" class="font-bold">
          <el-date-picker
            v-model="form.transaction_date"
            type="date"
            value-format="YYYY-MM-DD"
            class="!w-full"
            size="large"
          />
        </el-form-item>

        <el-form-item
          :label="form.transaction_type === 'purchase' ? '付款歸屬成員' : '成員'"
          prop="member_id"
          class="font-bold"
        >
          <el-select
            v-model="form.member_id"
            class="w-full"
            size="large"
            clearable
            filterable
            :placeholder="form.transaction_type === 'purchase' ? '請選擇付款歸屬成員' : '請選擇成員'"
          >
            <el-option
              v-for="member in equipmentStore.members"
              :key="member.id"
              :label="`${member.name}｜${member.role || '成員'}`"
              :value="member.id"
            />
          </el-select>
          <p v-if="form.transaction_type === 'purchase'" class="mt-2 text-xs text-gray-400">
            這位成員綁定的帳號會看到裝備待付款。
          </p>
        </el-form-item>
      </div>

      <div class="grid gap-4 md:grid-cols-3">
        <el-form-item label="尺寸 / 序號" prop="size" class="font-bold">
          <el-select
            v-if="sizeOptions.length > 0"
            v-model="form.size"
            class="w-full"
            size="large"
            clearable
            placeholder="請選擇"
          >
            <el-option
              v-for="item in sizeOptions"
              :key="item.size"
              :label="getSizeOptionLabel(item)"
              :value="item.size"
              :disabled="isOutgoingTransaction && item.remaining <= 0"
            />
          </el-select>
          <el-input v-else v-model="form.size" size="large" placeholder="可留空" />
        </el-form-item>

        <el-form-item v-if="requiresJerseyNumber" label="球衣號碼" prop="jersey_number" class="font-bold">
          <el-select
            v-if="jerseyNumberOptions.length > 0"
            v-model="form.jersey_number"
            class="w-full"
            size="large"
            filterable
            placeholder="請選擇"
          >
            <el-option
              v-for="number in jerseyNumberOptions"
              :key="number"
              :label="`#${number}`"
              :value="number"
            />
          </el-select>
          <el-input-number
            v-else
            v-model="form.jersey_number"
            class="!w-full"
            :min="equipment?.jersey_number_min ?? 0"
            :max="equipment?.jersey_number_max ?? 99"
            :precision="0"
            size="large"
          />
        </el-form-item>

        <el-form-item label="數量" prop="quantity" class="font-bold">
          <el-input-number
            v-model="form.quantity"
            class="!w-full"
            :min="1"
            :max="quantityInputMax"
            :precision="0"
            size="large"
            :disabled="isQuantityInputDisabled"
          />
          <p v-if="getSelectedStockLabel()" class="mt-2 text-xs text-gray-400">
            {{ getSelectedStockLabel() }}
          </p>
        </el-form-item>

        <el-form-item v-if="form.transaction_type === 'purchase'" label="單價" prop="unit_price" class="font-bold">
          <el-input-number v-model="form.unit_price" class="!w-full" :min="0" :step="100" size="large" />
        </el-form-item>
      </div>

      <div class="grid gap-4 md:grid-cols-2">
        <el-form-item label="經手人" prop="handled_by" class="font-bold">
          <el-input v-model="form.handled_by" size="large" placeholder="可留空" />
        </el-form-item>

        <el-form-item label="備註" prop="notes" class="font-bold">
          <el-input v-model="form.notes" type="textarea" :rows="2" maxlength="120" show-word-limit />
        </el-form-item>
      </div>
    </el-form>

    <template #footer>
      <div class="flex justify-end gap-3">
        <button
          type="button"
          class="rounded-2xl border border-gray-200 px-5 py-3 font-bold text-gray-600 hover:border-gray-300 hover:text-gray-800 transition-colors"
          @click="isOpen = false"
        >
          取消
        </button>
        <button
          type="button"
          class="rounded-2xl bg-primary px-6 py-3 font-bold text-white hover:bg-primary-hover transition-colors disabled:opacity-70"
          :disabled="isSubmitting"
          @click="submit"
        >
          <span v-if="isSubmitting" class="inline-flex items-center gap-2">
            <el-icon class="is-loading"><Loading /></el-icon>
            儲存中
          </span>
          <span v-else>新增交易</span>
        </button>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.transaction-type-group {
  display: flex;
  align-items: stretch;
}

.transaction-type-group :deep(.el-radio-button) {
  flex: 1 1 0;
  min-width: 0;
}

.transaction-type-group :deep(.el-radio-button__inner) {
  display: flex;
  width: 100%;
  min-height: 40px;
  align-items: center;
  justify-content: center;
  padding-inline: 0.75rem;
  font-weight: 700;
}
</style>
