<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { updateAppRoleWeight } from '@/services/rolesApi'
import type { AppRole } from '@/types/appRole'
import { getRoleWeight } from '@/utils/userRoleOrder'

const props = defineProps<{ role: AppRole; canEdit: boolean }>()
const emit = defineEmits<{ saved: [role: AppRole] }>()
const inputId = useId()
const weight = ref<number | undefined>(getRoleWeight(props.role))
const saving = ref(false)
const validationError = ref('')
const unchanged = computed(() => weight.value === getRoleWeight(props.role))

watch(() => [props.role.role_key, props.role.weight], () => {
  weight.value = getRoleWeight(props.role)
  validationError.value = ''
})
watch(weight, () => { validationError.value = '' })

const save = async () => {
  if (saving.value || !props.canEdit || unchanged.value) return
  if (!Number.isInteger(weight.value) || weight.value === undefined || weight.value < 1 || weight.value > 2147483647) {
    validationError.value = '請輸入 1 到 2147483647 的整數。'
    return
  }
  saving.value = true
  try {
    const updated = await updateAppRoleWeight(props.role.role_key, weight.value)
    emit('saved', updated)
    ElMessage.success('角色排序已儲存')
  } catch (error: any) {
    ElMessage.error('儲存排序失敗：' + (error.message || '請稍後再試'))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="role-sort-editor w-full min-w-0 lg:w-auto">
    <label :for="inputId" class="mb-1 block text-sm font-bold text-slate-700">排序數字</label>
    <div class="flex min-w-0 flex-wrap items-center gap-2">
      <el-input-number
        :id="inputId"
        v-model="weight"
        :min="1"
        :max="2147483647"
        :step="1"
        :precision="0"
        :controls="false"
        step-strictly
        :disabled="saving || !canEdit"
        size="large"
        class="!min-h-11 !w-44 max-w-full"
        aria-label="排序數字"
        :aria-describedby="`${inputId}-help`"
      />
      <el-button v-if="canEdit" type="primary" class="!m-0 !min-h-11 !rounded-xl !px-4 !font-bold" :loading="saving" :disabled="saving || unchanged" @click="save">
        儲存排序
      </el-button>
    </div>
    <p :id="`${inputId}-help`" class="mt-1 text-xs leading-relaxed text-slate-500">數字越小越前面，系統帳號管理會依此排序。</p>
    <p v-if="validationError" role="alert" class="mt-1 text-sm text-red-600">{{ validationError }}</p>
  </div>
</template>

<style>
.role-sort-editor {
  --el-color-primary: var(--color-primary);
  --el-color-primary-dark-2: var(--color-primary-hover);
  --el-color-primary-light-3: var(--color-primary-hover);
  --el-color-primary-light-5: #EBB96C;
  --el-color-primary-light-7: #F2D3A1;
  --el-color-primary-light-9: #FDF7EE;
}
.role-sort-editor .el-input__wrapper {
  min-height: 44px;
}
@media (max-width: 767px) {
  .role-sort-editor .el-input__inner {
    font-size: 16px;
  }
}
</style>
