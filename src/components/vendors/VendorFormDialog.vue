<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Delete, Loading, Upload } from '@element-plus/icons-vue'
import VendorPhotoGallery from '@/components/vendors/VendorPhotoGallery.vue'
import { useVendorsStore } from '@/stores/vendors'
import type { Vendor, VendorFormPayload, VendorTradeCategory } from '@/types/vendor'
import { normalizeVendorText } from '@/utils/vendors'

const props = defineProps<{
  modelValue: boolean
  vendor?: Vendor | null
  categories?: VendorTradeCategory[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'saved'): void
}>()

const vendorsStore = useVendorsStore()
const formRef = ref()
const uploadRef = ref()
const imageFiles = ref<File[]>([])
const imagePreviews = ref<string[]>([])
const existingImagePaths = ref<string[]>([])
const existingImageUrls = ref<string[]>([])

const form = reactive<VendorFormPayload>({
  name: '',
  trade_category: '',
  contact_name: '',
  phone: '',
  purchase_price_note: '',
  address: '',
  website_url: '',
  image_paths: []
})

const isOpen = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value)
})

const dialogTitle = computed(() => props.vendor ? '編輯廠商' : '新增廠商')
const categoryOptions = computed(() => {
  const names = [
    ...(props.categories || []).map((category) => category.name),
    form.trade_category
  ].map(normalizeVendorText).filter(Boolean)

  return [...new Set(names)].sort((left, right) => left.localeCompare(right, 'zh-Hant'))
})
const displayedImageUrls = computed(() => [
  ...existingImageUrls.value,
  ...imagePreviews.value
])

const rules = {
  name: [{ required: true, message: '請輸入廠商名稱', trigger: 'blur' }],
  trade_category: [{ required: true, message: '請輸入或選擇交易類別', trigger: 'change' }]
}

const revokeImagePreviews = () => {
  for (const preview of imagePreviews.value) {
    if (preview.startsWith('blob:')) URL.revokeObjectURL(preview)
  }
  imagePreviews.value = []
}

const syncSelectedImageFiles = (uploadFiles: any[] = []) => {
  revokeImagePreviews()
  imageFiles.value = uploadFiles
    .map((file) => file?.raw)
    .filter(Boolean) as File[]
  imagePreviews.value = imageFiles.value.map((file) => URL.createObjectURL(file))
}

const resetForm = () => {
  revokeImagePreviews()
  form.name = props.vendor?.name || ''
  form.trade_category = props.vendor?.trade_category || ''
  form.contact_name = props.vendor?.contact_name || ''
  form.phone = props.vendor?.phone || ''
  form.purchase_price_note = props.vendor?.purchase_price_note || ''
  form.address = props.vendor?.address || ''
  form.website_url = props.vendor?.website_url || ''
  existingImagePaths.value = props.vendor?.image_paths ? [...props.vendor.image_paths] : []
  existingImageUrls.value = props.vendor?.image_urls ? [...props.vendor.image_urls] : []
  form.image_paths = [...existingImagePaths.value]
  imageFiles.value = []
  uploadRef.value?.clearFiles?.()
  formRef.value?.clearValidate?.()
}

const handleImageChange = (_file: any, uploadFiles: any[] = []) => {
  syncSelectedImageFiles(uploadFiles)
}

const removeExistingImage = (index: number) => {
  existingImagePaths.value.splice(index, 1)
  existingImageUrls.value.splice(index, 1)
}

const submit = async () => {
  if (!formRef.value) return

  await formRef.value.validate(async (valid: boolean) => {
    if (!valid) return

    try {
      const payload: VendorFormPayload = {
        name: normalizeVendorText(form.name),
        trade_category: normalizeVendorText(form.trade_category),
        contact_name: normalizeVendorText(form.contact_name) || null,
        phone: normalizeVendorText(form.phone) || null,
        purchase_price_note: normalizeVendorText(form.purchase_price_note) || null,
        address: normalizeVendorText(form.address) || null,
        website_url: normalizeVendorText(form.website_url) || null,
        image_paths: [...existingImagePaths.value]
      }

      await vendorsStore.saveVendor(payload, {
        id: props.vendor?.id,
        imageFiles: imageFiles.value
      })

      ElMessage.success(props.vendor ? '已更新廠商' : '已新增廠商')
      emit('saved')
      isOpen.value = false
    } catch (error: any) {
      ElMessage.error(error?.message || '儲存廠商失敗')
    }
  })
}

watch(() => props.modelValue, (value) => {
  if (value) {
    resetForm()
  } else {
    revokeImagePreviews()
    imageFiles.value = []
    uploadRef.value?.clearFiles?.()
  }
})

onBeforeUnmount(() => {
  revokeImagePreviews()
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
      <el-form-item label="廠商名稱" prop="name" class="font-bold">
        <el-input v-model="form.name" size="large" placeholder="例如：安新衣坊客製化服務" />
      </el-form-item>

      <el-form-item label="交易類別" prop="trade_category" class="font-bold">
        <el-select
          v-model="form.trade_category"
          class="w-full"
          size="large"
          filterable
          allow-create
          clearable
          default-first-option
          placeholder="選擇或輸入新類別"
        >
          <el-option
            v-for="category in categoryOptions"
            :key="category"
            :label="category"
            :value="category"
          />
        </el-select>
      </el-form-item>

      <div class="grid gap-4 md:grid-cols-2">
        <el-form-item label="聯絡人" prop="contact_name" class="font-bold">
          <el-input v-model="form.contact_name" size="large" placeholder="例如：陳先生" />
        </el-form-item>
        <el-form-item label="電話" prop="phone" class="font-bold">
          <el-input v-model="form.phone" size="large" type="tel" placeholder="例如：02-23456789" />
        </el-form-item>
      </div>

      <el-form-item label="採購價" prop="purchase_price_note" class="font-bold">
        <el-input v-model="form.purchase_price_note" size="large" placeholder="例如：$700，或折扣方式" />
      </el-form-item>

      <el-form-item label="地址" prop="address" class="font-bold">
        <el-input v-model="form.address" size="large" placeholder="例如：三重區三光街23號" />
      </el-form-item>

      <el-form-item label="官網" prop="website_url" class="font-bold">
        <el-input v-model="form.website_url" size="large" placeholder="例如：https://..." />
      </el-form-item>

      <el-form-item label="照片" class="font-bold">
        <el-upload
          ref="uploadRef"
          drag
          accept="image/*"
          :auto-upload="false"
          :limit="8"
          multiple
          :on-change="handleImageChange"
          :on-remove="handleImageChange"
        >
          <div class="flex min-h-[120px] flex-col items-center justify-center px-4 text-center text-slate-400">
            <el-icon class="text-2xl"><Upload /></el-icon>
            <div class="mt-2 text-sm font-bold">點擊上傳圖片</div>
          </div>
        </el-upload>
      </el-form-item>

      <VendorPhotoGallery
        v-if="displayedImageUrls.length > 0"
        :photos="displayedImageUrls"
        alt="廠商照片"
        class="h-44 w-full border border-gray-100"
      />

      <div v-if="existingImagePaths.length > 0" class="flex flex-wrap gap-2">
        <button
          v-for="(path, index) in existingImagePaths"
          :key="path"
          type="button"
          class="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-gray-500 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-500"
          @click="removeExistingImage(index)"
        >
          <el-icon><Delete /></el-icon>
          移除第 {{ index + 1 }} 張
        </button>
      </div>
    </el-form>

    <template #footer>
      <div class="flex justify-end gap-3">
        <button
          type="button"
          class="rounded-2xl border border-gray-200 px-5 py-3 font-bold text-gray-600 transition-colors hover:border-gray-300 hover:text-gray-800"
          @click="isOpen = false"
        >
          取消
        </button>
        <button
          type="button"
          class="rounded-2xl bg-primary px-6 py-3 font-bold text-white transition-colors hover:bg-primary-hover disabled:opacity-70"
          :disabled="vendorsStore.isSaving"
          @click="submit"
        >
          <span v-if="vendorsStore.isSaving" class="inline-flex items-center gap-2">
            <el-icon class="is-loading"><Loading /></el-icon>
            儲存中
          </span>
          <span v-else>儲存</span>
        </button>
      </div>
    </template>
  </el-dialog>
</template>
