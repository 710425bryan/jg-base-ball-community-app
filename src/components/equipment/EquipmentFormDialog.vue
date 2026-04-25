<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Plus, Delete, Loading } from '@element-plus/icons-vue'
import { useEquipmentStore } from '@/stores/equipment'
import type { Equipment, EquipmentCategory, EquipmentFormPayload, EquipmentSizeStock } from '@/types/equipment'

const props = defineProps<{
  modelValue: boolean
  equipment?: Equipment | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'saved'): void
}>()

const equipmentStore = useEquipmentStore()
const formRef = ref()
const imageFile = ref<File | null>(null)

const categories: EquipmentCategory[] = ['服飾類', '球具類', '消耗品', '其他']

const form = reactive<EquipmentFormPayload>({
  name: '',
  category: '球具類',
  specs: '',
  notes: '',
  image_url: null,
  purchase_price: 0,
  quick_purchase_enabled: false,
  total_quantity: 0,
  purchased_by: '',
  sizes_stock: []
})

const isOpen = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value)
})

const dialogTitle = computed(() => props.equipment ? '編輯裝備' : '新增裝備')

const rules = {
  name: [{ required: true, message: '請輸入裝備名稱', trigger: 'blur' }],
  category: [{ required: true, message: '請選擇分類', trigger: 'change' }],
  total_quantity: [
    {
      validator: (_rule: unknown, value: number, callback: (error?: Error) => void) => {
        if (!Number.isFinite(Number(value)) || Number(value) < 0) {
          callback(new Error('總數量不可小於 0'))
          return
        }
        callback()
      },
      trigger: ['blur', 'change']
    }
  ]
}

const resetForm = () => {
  form.name = props.equipment?.name || ''
  form.category = props.equipment?.category || '球具類'
  form.specs = props.equipment?.specs || ''
  form.notes = props.equipment?.notes || ''
  form.image_url = props.equipment?.image_url || null
  form.purchase_price = Number(props.equipment?.purchase_price || 0)
  form.quick_purchase_enabled = Boolean(props.equipment?.quick_purchase_enabled)
  form.total_quantity = Number(props.equipment?.total_quantity || 0)
  form.purchased_by = props.equipment?.purchased_by || ''
  form.sizes_stock = Array.isArray(props.equipment?.sizes_stock)
    ? props.equipment.sizes_stock.map((item) => ({ ...item }))
    : []
  imageFile.value = null
  formRef.value?.clearValidate?.()
}

const addSizeStock = () => {
  form.sizes_stock.push({ size: '', quantity: 0 })
}

const removeSizeStock = (index: number) => {
  form.sizes_stock.splice(index, 1)
}

const handleImageChange = (file: any) => {
  imageFile.value = file?.raw || null
}

const normalizeSizesStock = () => {
  const merged = new Map<string, number>()

  for (const item of form.sizes_stock) {
    const size = String(item.size || '').trim()
    if (!size) continue
    merged.set(size, (merged.get(size) || 0) + Math.max(Number(item.quantity || 0), 0))
  }

  return [...merged.entries()].map(([size, quantity]) => ({ size, quantity })) as EquipmentSizeStock[]
}

const submit = async () => {
  if (!formRef.value) return

  await formRef.value.validate(async (valid: boolean) => {
    if (!valid) return

    try {
      const payload: EquipmentFormPayload = {
        ...form,
        name: form.name.trim(),
        specs: form.specs?.trim() || null,
        notes: form.notes?.trim() || null,
        purchased_by: form.purchased_by?.trim() || null,
        purchase_price: Math.max(Number(form.purchase_price || 0), 0),
        total_quantity: Math.max(Number(form.total_quantity || 0), 0),
        sizes_stock: normalizeSizesStock()
      }

      await equipmentStore.saveEquipment(payload, {
        id: props.equipment?.id,
        imageFile: imageFile.value
      })

      ElMessage.success(props.equipment ? '已更新裝備' : '已新增裝備')
      emit('saved')
      isOpen.value = false
    } catch (error: any) {
      ElMessage.error(error?.message || '儲存裝備失敗')
    }
  })
}

watch(() => props.modelValue, (value) => {
  if (value) resetForm()
})
</script>

<template>
  <el-dialog
    v-model="isOpen"
    :title="dialogTitle"
    width="92%"
    style="max-width: 720px; border-radius: 16px;"
    destroy-on-close
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-position="top" class="space-y-4">
      <div class="grid gap-4 md:grid-cols-2">
        <el-form-item label="裝備名稱" prop="name" class="font-bold">
          <el-input v-model="form.name" size="large" placeholder="例如：打擊手套" />
        </el-form-item>

        <el-form-item label="分類" prop="category" class="font-bold">
          <el-select v-model="form.category" class="w-full" size="large">
            <el-option v-for="category in categories" :key="category" :label="category" :value="category" />
          </el-select>
        </el-form-item>
      </div>

      <div class="grid gap-4 md:grid-cols-3">
        <el-form-item label="單價" prop="purchase_price" class="font-bold">
          <el-input-number v-model="form.purchase_price" class="!w-full" :min="0" :step="100" size="large" />
        </el-form-item>

        <el-form-item label="總數量" prop="total_quantity" class="font-bold">
          <el-input-number v-model="form.total_quantity" class="!w-full" :min="0" size="large" />
        </el-form-item>

        <el-form-item label="購買人 / 經手人" prop="purchased_by" class="font-bold">
          <el-input v-model="form.purchased_by" size="large" placeholder="可留空" />
        </el-form-item>
      </div>

      <div class="rounded-2xl border border-gray-100 bg-gray-50/80 p-4">
        <div class="flex items-center justify-between gap-3">
          <div>
            <div class="font-black text-slate-800">尺寸 / 序號庫存</div>
            <p class="mt-1 text-xs text-gray-400">沒有尺寸時可留空，系統會用總數量計算。</p>
          </div>
          <button
            type="button"
            class="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-600 hover:border-primary hover:text-primary transition-colors"
            @click="addSizeStock"
          >
            <el-icon><Plus /></el-icon>
            新增
          </button>
        </div>

        <div v-if="form.sizes_stock.length > 0" class="mt-4 grid gap-3">
          <div
            v-for="(item, index) in form.sizes_stock"
            :key="index"
            class="grid gap-3 md:grid-cols-[1fr_160px_auto] items-center"
          >
            <el-input v-model="item.size" size="large" placeholder="尺寸或序號，例如 M / SN-001" />
            <el-input-number v-model="item.quantity" class="!w-full" :min="0" size="large" />
            <button
              type="button"
              class="rounded-xl border border-red-100 bg-red-50 px-3 py-3 text-red-500 hover:bg-red-100 transition-colors"
              title="移除"
              @click="removeSizeStock(index)"
            >
              <el-icon><Delete /></el-icon>
            </button>
          </div>
        </div>
      </div>

      <div class="grid gap-4 md:grid-cols-2">
        <el-form-item label="規格" prop="specs" class="font-bold">
          <el-input v-model="form.specs" type="textarea" :rows="3" maxlength="160" show-word-limit />
        </el-form-item>

        <el-form-item label="備註" prop="notes" class="font-bold">
          <el-input v-model="form.notes" type="textarea" :rows="3" maxlength="160" show-word-limit />
        </el-form-item>
      </div>

      <div class="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
        <el-form-item label="裝備照片" class="font-bold">
          <el-upload
            accept="image/*"
            :auto-upload="false"
            :limit="1"
            :on-change="handleImageChange"
          >
            <button type="button" class="rounded-2xl border border-gray-200 px-5 py-3 font-bold text-gray-600 hover:border-primary hover:text-primary transition-colors">
              選擇照片
            </button>
          </el-upload>
        </el-form-item>

        <el-switch
          v-model="form.quick_purchase_enabled"
          active-text="開放加購"
          inactive-text="不開放加購"
          class="md:justify-self-end"
        />
      </div>

      <img
        v-if="form.image_url"
        :src="form.image_url"
        alt="裝備照片"
        class="h-32 w-full rounded-2xl border border-gray-100 object-cover"
      />
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
          <span v-else>儲存</span>
        </button>
      </div>
    </template>
  </el-dialog>
</template>
