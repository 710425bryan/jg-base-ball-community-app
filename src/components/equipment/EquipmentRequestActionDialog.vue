<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { Loading } from '@element-plus/icons-vue'
import PreviewableImage from '@/components/common/PreviewableImage.vue'

const props = defineProps<{
  modelValue: boolean
  title: string
  confirmText: string
  noteLabel?: string
  notePlaceholder?: string
  allowImage?: boolean
  isSubmitting?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'confirm', payload: { note: string; imageFile: File | null }): void
}>()

const note = ref('')
const imageFile = ref<File | null>(null)
const imagePreview = ref<string | null>(null)

const isOpen = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value)
})

const revokeImagePreview = () => {
  if (imagePreview.value?.startsWith('blob:')) {
    URL.revokeObjectURL(imagePreview.value)
  }
  imagePreview.value = null
}

const handleImageChange = (file: any) => {
  revokeImagePreview()
  imageFile.value = file?.raw || null
  imagePreview.value = imageFile.value ? URL.createObjectURL(imageFile.value) : null
}

const submit = () => {
  emit('confirm', {
    note: note.value.trim(),
    imageFile: imageFile.value
  })
}

watch(() => props.modelValue, (value) => {
  if (value) {
    note.value = ''
    revokeImagePreview()
    imageFile.value = null
  }
})

onBeforeUnmount(() => {
  revokeImagePreview()
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

        <el-form-item v-if="allowImage" label="照片" class="font-bold">
          <div class="space-y-3">
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
            <PreviewableImage
              v-if="imagePreview"
              :src="imagePreview"
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
