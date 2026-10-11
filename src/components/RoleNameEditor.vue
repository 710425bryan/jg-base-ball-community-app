<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { updateAppRoleName } from '@/services/rolesApi'
import type { AppRole } from '@/types/appRole'

const props = defineProps<{ role: AppRole; canEdit: boolean }>()
const emit = defineEmits<{ saved: [role: AppRole] }>()
const inputId = useId()
const name = ref(props.role.role_name)
const saving = ref(false)
const errorMessage = ref('')
const unchanged = computed(() => name.value.trim() === props.role.role_name)

watch([() => props.role.role_key, () => props.role.role_name], () => {
  name.value = props.role.role_name
  errorMessage.value = ''
})
watch(name, () => { errorMessage.value = '' })

const save = async () => {
  if (saving.value || !props.canEdit || unchanged.value) return
  const roleKey = props.role.role_key
  const nextName = name.value.trim()
  if (!nextName || Array.from(nextName).length > 100) {
    errorMessage.value = '顯示名稱請輸入 1 到 100 個字。'
    return
  }
  saving.value = true
  try {
    const updated = await updateAppRoleName(roleKey, nextName)
    if (props.role.role_key === roleKey) name.value = updated.role_name
    emit('saved', updated)
    ElMessage.success('角色顯示名稱已儲存')
  } catch (error: any) {
    if (props.role.role_key === roleKey) errorMessage.value = error.message || '儲存名稱失敗，請稍後再試。'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="role-name-editor w-full min-w-0">
    <p class="mb-2 break-all text-xs text-slate-500">角色識別碼：<span class="font-mono font-bold">{{ role.role_key }}</span>（不可修改）</p>
    <label :for="inputId" class="mb-1 block text-sm font-bold text-slate-700">顯示名稱 (中文)</label>
    <div class="flex min-w-0 flex-wrap items-center gap-2">
      <el-input
        :id="inputId"
        v-model="name"
        :disabled="saving || !canEdit"
        size="large"
        class="!min-h-11 !w-full sm:!w-72"
        aria-label="顯示名稱 (中文)"
        :aria-invalid="Boolean(errorMessage)"
        :aria-describedby="`${inputId}-help ${inputId}-error`"
      />
      <el-button v-if="canEdit" class="!m-0 !min-h-11 !rounded-xl !px-4 !font-bold" :loading="saving" :disabled="saving || unchanged" @click="save">
        儲存名稱
      </el-button>
    </div>
    <p :id="`${inputId}-help`" class="mt-1 text-xs leading-relaxed text-slate-500">1 到 100 個字。只更新顯示名稱，角色識別碼與權限維持不變。</p>
    <p :id="`${inputId}-error`" role="alert" class="mt-1 text-sm text-red-600">{{ errorMessage }}</p>
  </div>
</template>

<style scoped>
.role-name-editor :deep(.el-input__wrapper) {
  min-height: 44px;
}
@media (max-width: 767px) {
  .role-name-editor :deep(.el-input__inner) {
    font-size: 16px;
  }
}
</style>
