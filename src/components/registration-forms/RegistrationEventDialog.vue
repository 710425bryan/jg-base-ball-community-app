<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import AppDialogFooter from '@/components/common/AppDialogFooter.vue'
import type {
  RegistrationFormEvent,
  RegistrationFormEventInput,
  RegistrationFormEventStatus,
  RegistrationFormTemplate
} from '@/types/registrationForm'

const props = defineProps<{
  modelValue: boolean
  event: RegistrationFormEvent | null
  templates: RegistrationFormTemplate[]
  saving?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  save: [input: RegistrationFormEventInput]
}>()

const statusOptions: Array<{ value: RegistrationFormEventStatus; label: string }> = [
  { value: 'draft', label: '草稿' },
  { value: 'in_progress', label: '準備中' },
  { value: 'submitted', label: '已送出' },
  { value: 'closed', label: '已截止' }
]

const createForm = (): RegistrationFormEventInput => ({
  id: null,
  name: '',
  season_year: new Date().getFullYear(),
  category: '',
  organizer: '',
  registration_deadline: null,
  status: 'draft',
  notes: '',
  template_ids: []
})

const form = ref<RegistrationFormEventInput>(createForm())
const valid = computed(() => (
  Boolean(form.value.name.trim())
  && Number.isInteger(form.value.season_year)
  && form.value.season_year >= 2000
  && form.value.season_year <= 2200
))

const reset = () => {
  form.value = props.event
    ? {
        id: props.event.id,
        name: props.event.name,
        season_year: props.event.season_year,
        category: props.event.category,
        organizer: props.event.organizer,
        registration_deadline: props.event.registration_deadline,
        status: props.event.status,
        notes: props.event.notes,
        template_ids: [...props.event.template_ids]
      }
    : createForm()
}

watch([() => props.modelValue, () => props.event], ([open]) => {
  if (open) reset()
}, { immediate: true })

const close = () => {
  if (!props.saving) emit('update:modelValue', false)
}

const submit = () => {
  if (!valid.value || props.saving) return
  emit('save', {
    ...form.value,
    name: form.value.name.trim(),
    category: form.value.category.trim(),
    organizer: form.value.organizer.trim(),
    notes: form.value.notes.trim(),
    template_ids: [...new Set(form.value.template_ids)]
  })
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    :title="event ? '編輯賽事報名' : '新增賽事報名'"
    width="min(720px, 94vw)"
    destroy-on-close
    :close-on-click-modal="false"
    :close-on-press-escape="!saving"
    class="registration-event-dialog"
    @close="close"
  >
    <el-form :model="form" label-position="top" size="large">
      <div class="grid gap-x-4 md:grid-cols-2">
        <el-form-item label="賽事名稱" required class="md:col-span-2">
          <el-input v-model="form.name" maxlength="180" show-word-limit placeholder="例如：115 年主委盃 U9" />
        </el-form-item>

        <el-form-item label="年度" required>
          <el-input-number v-model="form.season_year" :min="2000" :max="2200" :step="1" class="!w-full" />
        </el-form-item>

        <el-form-item label="組別">
          <el-input v-model="form.category" maxlength="80" placeholder="例如：U9、少棒組" />
        </el-form-item>

        <el-form-item label="主辦單位">
          <el-input v-model="form.organizer" maxlength="120" placeholder="選填" />
        </el-form-item>

        <el-form-item label="報名截止日">
          <el-date-picker
            v-model="form.registration_deadline"
            type="date"
            format="YYYY/MM/DD"
            value-format="YYYY-MM-DD"
            placeholder="選擇截止日"
            class="!w-full"
          />
        </el-form-item>

        <el-form-item label="狀態">
          <el-select v-model="form.status" class="w-full">
            <el-option
              v-for="option in statusOptions"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="使用範本" class="md:col-span-2">
          <el-select
            v-model="form.template_ids"
            multiple
            filterable
            collapse-tags
            collapse-tags-tooltip
            placeholder="可先建立賽事，之後再掛上範本"
            class="w-full"
          >
            <el-option
              v-for="template in templates"
              :key="template.id"
              :label="`${template.name}（${template.file_type.toUpperCase()}／${template.max_players} 人）`"
              :value="template.id"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="備註" class="md:col-span-2">
          <el-input
            v-model="form.notes"
            type="textarea"
            :rows="3"
            maxlength="1000"
            show-word-limit
            placeholder="報名方式、繳交窗口或其他提醒"
          />
        </el-form-item>
      </div>
    </el-form>

    <template #footer>
      <AppDialogFooter
        confirm-label="儲存賽事"
        :loading="saving"
        :confirm-disabled="!valid"
        @cancel="close"
        @confirm="submit"
      />
    </template>
  </el-dialog>
</template>

