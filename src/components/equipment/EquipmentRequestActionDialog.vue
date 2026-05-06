<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { Loading } from '@element-plus/icons-vue'
import EquipmentPhotoCarousel from '@/components/equipment/EquipmentPhotoCarousel.vue'

const props = defineProps<{
  modelValue: boolean
  title: string
  confirmText: string
  noteLabel?: string
  notePlaceholder?: string
  allowImage?: boolean
  allowPaymentReceived?: boolean
  isSubmitting?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'confirm', payload: { note: string; imageFiles: File[]; markPaid: boolean }): void
}>()

const note = ref('')
const markPaid = ref(false)
const imageFiles = ref<File[]>([])
const imagePreviews = ref<string[]>([])
const uploadRef = ref()

const isOpen = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value)
})

const revokeImagePreviews = () => {
  for (const preview of imagePreviews.value) {
    if (preview.startsWith('blob:')) URL.revokeObjectURL(preview)
  }
  imagePreviews.value = []
}

const handleImageChange = (_file: any, uploadFiles: any[] = []) => {
  revokeImagePreviews()
  imageFiles.value = uploadFiles
    .map((file) => file?.raw)
    .filter(Boolean) as File[]
  imagePreviews.value = imageFiles.value.map((file) => URL.createObjectURL(file))
}

const resetImages = () => {
  revokeImagePreviews()
  imageFiles.value = []
  uploadRef.value?.clearFiles?.()
}

const submit = () => {
  emit('confirm', {
    note: note.value.trim(),
    imageFiles: imageFiles.value,
    markPaid: props.allowPaymentReceived && markPaid.value
  })
}

watch(() => props.modelValue, (value) => {
  if (value) {
    note.value = ''
    markPaid.value = false
  }
  resetImages()
})

onBeforeUnmount(() => {
  revokeImagePreviews()
})
</script>

<template>
  <el-dialog
    v-model="isOpen"
    :title="title"
    width="90%"
    style="max-width: 520px; border-radius: 16px;"
    destroy-on-close
  >
    <div class="space-y-4">
      <el-form label-position="top">
        <el-form-item :label="noteLabel || '備註'" class="font-bold">
          <el-input
            v-model="note"
            type="textarea"
            :rows="4"
            maxlength="160"
            show-word-limit
            :placeholder="notePlaceholder || '可補充這次處理狀況'"
          />
        </el-form-item>

        <el-form-item v-if="allowPaymentReceived" label="付款狀態" class="font-bold">
          <el-checkbox v-model="markPaid" size="large">
            領取時已收款，直接標記為已付款
          </el-checkbox>
        </el-form-item>

        <el-form-item v-if="allowImage" label="照片" class="font-bold">
          <div class="space-y-3">
            <el-upload
              accept="image/*"
              :auto-upload="false"
              :limit="8"
              multiple
              :on-change="handleImageChange"
              :on-remove="handleImageChange"
              ref="uploadRef"
            >
              <button type="button" class="rounded-2xl border border-gray-200 px-5 py-3 font-bold text-gray-600 hover:border-primary hover:text-primary transition-colors">
                選擇照片
              </button>
            </el-upload>
            <EquipmentPhotoCarousel
              v-if="imagePreviews.length > 0"
              :photos="imagePreviews"
              alt="處理照片"
              class="h-40 w-full rounded-2xl border border-gray-100"
            />
          </div>
        </el-form-item>
      </el-form>
    </div>

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
            處理中
          </span>
          <span v-else>{{ confirmText }}</span>
        </button>
      </div>
    </template>
  </el-dialog>
</template>
