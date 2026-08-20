<template>
  <el-dialog
    v-model="dialogVisible"
    title="聯絡我們 / 加入球隊"
    width="90%"
    style="max-width: 500px; border-radius: 16px;"
    class="custom-dialog"
  >
    <div class="mb-4 text-sm leading-relaxed text-gray-500">
      歡迎對棒球有熱誠的孩子加入我們！請留下您的基本聯絡資訊，教練團會盡快與您聯繫並安排體驗。也可以直接加 LINE 預約：
      <span class="inline-block text-lg font-black leading-none text-primary sm:text-xl">cloud019</span>
      或
      <span class="inline-block text-lg font-black leading-none text-primary sm:text-xl">yayu0215</span>。
    </div>

    <el-form ref="joinFormRef" :model="joinForm" :rules="joinRules" label-position="top">
      <el-form-item label="家長姓名" prop="parent_name" class="font-bold">
        <el-input v-model="joinForm.parent_name" placeholder="請輸入家長姓名" />
      </el-form-item>
      <el-form-item label="LINE ID" prop="line_id" class="font-bold">
        <el-input v-model="joinForm.line_id" placeholder="請輸入方便聯絡的 LINE ID" />
      </el-form-item>
      <el-form-item label="聯絡電話" prop="phone" class="font-bold">
        <el-input v-model="joinForm.phone" placeholder="選填，例如：09XX-XXX-XXX" />
      </el-form-item>
      <el-form-item label="小孩年紀或年級" prop="child_age_or_grade" class="font-bold">
        <el-input v-model="joinForm.child_age_or_grade" placeholder="例如：二年級、8歲" />
      </el-form-item>
      <el-form-item label="想問的問題或備註" prop="message" class="font-bold">
        <el-input v-model="joinForm.message" type="textarea" :rows="3" placeholder="有什麼想先了解的嗎？" />
      </el-form-item>
    </el-form>

    <template #footer>
      <div class="mt-4 flex justify-end gap-2">
        <button
          type="button"
          class="min-h-11 rounded-xl px-5 py-2 font-bold text-gray-500 transition-all hover:bg-gray-100"
          @click="dialogVisible = false"
        >
          取消
        </button>
        <button
          type="button"
          :disabled="isSubmitting"
          class="flex min-h-11 min-w-[100px] items-center justify-center rounded-xl bg-primary px-6 py-2 font-bold text-white shadow-md transition-all hover:bg-primary-hover active:scale-95 disabled:opacity-70"
          @click="submitJoinForm"
        >
          <span v-if="isSubmitting" class="flex items-center gap-2">
            <el-icon class="is-loading"><Loading /></el-icon>
            傳送中
          </span>
          <span v-else>送出資料</span>
        </button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { ElMessage, type FormInstance, type FormRules } from 'element-plus'
import { Loading } from '@element-plus/icons-vue'

import { createPublicJoinInquiry } from '@/services/publicLanding'
import { buildPushEventKey, dispatchPushNotification } from '@/utils/pushNotifications'

type JoinFormModel = {
  parent_name: string
  phone: string
  line_id: string
  child_age_or_grade: string
  message: string
}

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const dialogVisible = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value)
})

const isSubmitting = ref(false)
const joinFormRef = ref<FormInstance>()
const joinForm = reactive<JoinFormModel>({
  parent_name: '',
  phone: '',
  line_id: '',
  child_age_or_grade: '',
  message: ''
})

const joinRules: FormRules<JoinFormModel> = {
  parent_name: [{ required: true, message: '請填寫家長姓名', trigger: 'blur' }],
  line_id: [{ required: true, whitespace: true, message: '請填寫 LINE ID', trigger: 'blur' }]
}

const buildJoinContactSummary = () => {
  const contacts = [`LINE ID：${joinForm.line_id.trim()}`]
  const phone = joinForm.phone.trim()

  if (phone) {
    contacts.push(`電話：${phone}`)
  }

  return contacts.join('，')
}

const submitJoinForm = async () => {
  if (!joinFormRef.value) return

  try {
    const valid = await joinFormRef.value.validate()
    if (!valid) return
  } catch {
    return
  }

  isSubmitting.value = true

  try {
    const inquiryId = await createPublicJoinInquiry({
      parent_name: joinForm.parent_name,
      phone: joinForm.phone.trim() || null,
      line_id: joinForm.line_id.trim(),
      child_age_or_grade: joinForm.child_age_or_grade,
      message: joinForm.message
    })

    void dispatchPushNotification({
      title: `[入隊詢問] 收到 ${joinForm.parent_name} 的聯絡表單`,
      body: `${buildJoinContactSummary()}，請到後台查看完整內容。`,
      url: '/join-inquiries',
      feature: 'join_inquiries',
      action: 'VIEW',
      eventKey: buildPushEventKey('join_inquiry', inquiryId)
    }).catch((pushErr) => {
      console.warn('Join inquiry push notification failed', pushErr)
    })

    ElMessage.success('表單已送出，我們會盡快和你聯絡。')
    dialogVisible.value = false
    Object.assign(joinForm, {
      parent_name: '',
      phone: '',
      line_id: '',
      child_age_or_grade: '',
      message: ''
    })
  } catch (error: any) {
    console.error('Failed to submit join inquiry:', error)
    ElMessage.error(`送出失敗：${error?.message || '請稍後再試'}`)
  } finally {
    isSubmitting.value = false
  }
}
</script>
