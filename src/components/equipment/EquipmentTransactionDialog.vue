<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import dayjs from 'dayjs'
import { ElMessage } from 'element-plus'
import { Loading } from '@element-plus/icons-vue'
import { useEquipmentStore } from '@/stores/equipment'
import type { Equipment, EquipmentTransactionPayload, EquipmentTransactionType } from '@/types/equipment'

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
  transaction_type: 'borrow',
  transaction_date: dayjs().format('YYYY-MM-DD'),
  member_id: null,
  handled_by: '',
  size: null,
  quantity: 1,
  notes: '',
  unit_price: null
})

const isOpen = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value)
})

const typeOptions: Array<{ value: EquipmentTransactionType; label: string; helper: string }> = [
  { value: 'borrow', label: '借出', helper: '會扣除可用庫存，歸還後補回。' },
  { value: 'return', label: '歸還', helper: '會補回已借出數量。' },
  { value: 'receive', label: '領取', helper: '永久發放給成員。' },
  { value: 'purchase', label: '購買', helper: '管理端直接記錄購買交易。' }
]

const currentType = computed(() => typeOptions.find((option) => option.value === form.transaction_type))
const sizeOptions = computed(() => props.equipment?.sizes_stock?.filter((item) => item.size) || [])

const rules = {
  transaction_type: [{ required: true, message: '請選擇交易類型', trigger: 'change' }],
  transaction_date: [{ required: true, message: '請選擇日期', trigger: 'change' }],
  quantity: [
    {
      validator: (_rule: unknown, value: number, callback: (error?: Error) => void) => {
        if (!Number.isFinite(Number(value)) || Number(value) <= 0) {
          callback(new Error('數量需大於 0'))
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
  form.transaction_type = props.defaultType || 'borrow'
  form.transaction_date = dayjs().format('YYYY-MM-DD')
  form.member_id = null
  form.handled_by = ''
  form.size = null
  form.quantity = 1
  form.notes = ''
  form.unit_price = props.defaultType === 'purchase' ? Number(props.equipment?.purchase_price || 0) : null
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
      <p class="mt-1 text-xs text-primary font-bold">{{ equipment.category }}｜總數量 {{ equipment.total_quantity }}</p>
    </div>

    <el-form ref="formRef" :model="form" :rules="rules" label-position="top" class="space-y-4">
      <el-form-item label="交易類型" prop="transaction_type" class="font-bold">
        <el-radio-group v-model="form.transaction_type" class="grid w-full grid-cols-2 gap-2 md:grid-cols-4">
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

        <el-form-item label="成員" prop="member_id" class="font-bold">
          <el-select v-model="form.member_id" class="w-full" size="large" clearable filterable placeholder="請選擇成員">
            <el-option
              v-for="member in equipmentStore.members"
              :key="member.id"
              :label="`${member.name}｜${member.role || '成員'}`"
              :value="member.id"
            />
          </el-select>
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
              :label="`${item.size}｜${item.quantity}`"
              :value="item.size"
            />
          </el-select>
          <el-input v-else v-model="form.size" size="large" placeholder="可留空" />
        </el-form-item>

        <el-form-item label="數量" prop="quantity" class="font-bold">
          <el-input-number v-model="form.quantity" class="!w-full" :min="1" size="large" />
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
