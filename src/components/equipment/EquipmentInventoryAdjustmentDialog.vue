<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import dayjs from 'dayjs'
import { ElMessage } from 'element-plus'
import { Loading } from '@element-plus/icons-vue'
import { useEquipmentStore } from '@/stores/equipment'
import { useAuthStore } from '@/stores/auth'
import type { Equipment, EquipmentInventoryAdjustmentPayload } from '@/types/equipment'
import { getEquipmentRemainingOverallQuantity } from '@/utils/equipmentInventory'

const props = defineProps<{
  modelValue: boolean
  equipment: Equipment | null
}>()

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
const getSizeStockQuantity = (equipment: Equipment | null | undefined, size?: string | null) => {
  const targetSize = normalizeSize(size)
  if (!targetSize) return 0

  return (equipment?.sizes_stock || []).reduce((total, item) => {
    if (normalizeSize(item.size) !== targetSize) return total
    return total + Math.max(Number(item.quantity || 0), 0)
  }, 0)
}

const sizeOptions = computed(() => props.equipment?.sizes_stock?.filter((item) => item.size) || [])
const requiresSize = computed(() => sizeOptions.value.length > 0)
const selectedSize = computed(() => normalizeSize(form.size))
const quantityDelta = computed(() => Math.max(Number(form.quantity_delta || 0), 0))
const currentTotal = computed(() => Math.max(Number(props.equipment?.total_quantity || 0), 0))
const currentAvailable = computed(() => getEquipmentRemainingOverallQuantity(props.equipment))
const nextTotal = computed(() => currentTotal.value + quantityDelta.value)
const currentSizeStockQuantity = computed(() => getSizeStockQuantity(props.equipment, selectedSize.value))
const nextSizeStockQuantity = computed(() =>
  selectedSize.value ? currentSizeStockQuantity.value + quantityDelta.value : 0
)
const nextSizesStock = computed(() => {
  const size = selectedSize.value
  const sizes = (props.equipment?.sizes_stock || []).map((item) => ({ ...item }))

  if (!size) return sizes

  const existing = sizes.find((item) => normalizeSize(item.size) === size)
  if (existing) {
    existing.quantity = Math.max(Number(existing.quantity || 0), 0) + quantityDelta.value
  } else {
    sizes.push({ size, quantity: quantityDelta.value })
  }

  return sizes
})
const nextEquipment = computed(() => props.equipment
  ? {
    ...props.equipment,
    total_quantity: nextTotal.value,
    sizes_stock: nextSizesStock.value
  }
  : null)
const nextAvailable = computed(() => getEquipmentRemainingOverallQuantity(nextEquipment.value))
const currentOperatorName = computed(() =>
  authStore.profile?.nickname || authStore.profile?.name || authStore.user?.email || '目前登入者'
)

const rules = {
  adjustment_date: [{ required: true, message: '請選擇日期', trigger: 'change' }],
  size: [
    {
      validator: (_rule: unknown, value: string | null, callback: (error?: Error) => void) => {
        if (requiresSize.value && !String(value || '').trim()) {
          callback(new Error('請選擇或輸入尺寸規格'))
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
        if (!Number.isFinite(Number(value)) || Number(value) <= 0) {
          callback(new Error('新增數量需大於 0'))
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
  form.size = null
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
      await equipmentStore.addInventoryAdjustment({
        ...form,
        equipment_id: equipment.id,
        member_id: form.member_id || null,
        handled_by: form.handled_by?.trim() || null,
        size: selectedSize.value || null,
        quantity_delta: Math.max(Number(form.quantity_delta || 0), 1),
        notes: form.notes?.trim() || null
      })
      ElMessage.success('已新增庫存')
      emit('saved')
      isOpen.value = false
    } catch (error: any) {
      ElMessage.error(error?.message || '新增庫存失敗')
    }
  })
}

watch(() => props.modelValue, (value) => {
  if (value) void resetForm()
})
</script>

<template>
  <el-dialog
    v-model="isOpen"
    title="新增庫存"
    width="92%"
    style="max-width: 620px; border-radius: 16px;"
    destroy-on-close
  >
    <div v-if="equipment" class="mb-4 rounded-2xl border border-emerald-100 bg-emerald-50/80 px-4 py-3">
      <div class="text-lg font-black text-slate-800">{{ equipment.name }}</div>
      <div class="mt-3 grid grid-cols-2 gap-2 text-center">
        <div class="rounded-xl bg-white/80 px-3 py-2">
          <div class="text-[11px] font-bold text-gray-400">總量</div>
          <div class="mt-1 font-black text-slate-800">{{ currentTotal }} → {{ nextTotal }}</div>
        </div>
        <div class="rounded-xl bg-white/80 px-3 py-2">
          <div class="text-[11px] font-bold text-emerald-600">可用</div>
          <div class="mt-1 font-black text-emerald-700">{{ currentAvailable }} → {{ nextAvailable }}</div>
        </div>
      </div>
      <div v-if="selectedSize" class="mt-2 rounded-xl bg-white/80 px-3 py-2 text-center">
        <div class="text-[11px] font-bold text-gray-400">{{ selectedSize }}</div>
        <div class="mt-1 font-black text-slate-800">{{ currentSizeStockQuantity }} → {{ nextSizeStockQuantity }}</div>
      </div>
    </div>

    <el-form ref="formRef" :model="form" :rules="rules" label-position="top" class="space-y-4">
      <div class="grid gap-4 md:grid-cols-2">
        <el-form-item label="日期" prop="adjustment_date" class="font-bold">
          <el-date-picker
            v-model="form.adjustment_date"
            type="date"
            value-format="YYYY-MM-DD"
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
            allow-create
            default-first-option
            placeholder="請選擇或輸入"
          >
            <el-option
              v-for="item in sizeOptions"
              :key="item.size"
              :label="`${item.size}｜${item.quantity}`"
              :value="item.size"
            />
          </el-select>
          <el-input v-else v-model="form.size" size="large" placeholder="可留空" />
        </el-form-item>

        <el-form-item label="新增數量" prop="quantity_delta" class="font-bold">
          <el-input-number v-model="form.quantity_delta" class="!w-full" :min="1" size="large" />
        </el-form-item>

      </div>

      <el-form-item label="備註" prop="notes" class="font-bold">
        <el-input v-model="form.notes" type="textarea" :rows="3" maxlength="160" show-word-limit />
      </el-form-item>
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
          :disabled="equipmentStore.isSaving"
          @click="submit"
        >
          <span v-if="equipmentStore.isSaving" class="inline-flex items-center gap-2">
            <el-icon class="is-loading"><Loading /></el-icon>
            儲存中
          </span>
          <span v-else>新增庫存</span>
        </button>
      </div>
    </template>
  </el-dialog>
</template>
