<template>
  <el-dialog
    v-model="isOpen"
    title="所屬群組設定"
    width="95%"
    style="max-width: 760px; border-radius: 16px;"
    class="team-group-settings-dialog"
    append-to-body
  >
    <div class="space-y-5">
      <section v-if="canCreate" class="rounded-lg border border-slate-200 bg-slate-50 p-4">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-end">
          <el-form-item label="新增群組" class="mb-0 flex-1 font-bold">
            <el-input
              v-model="newGroupName"
              placeholder="例如：小白熊(小組)"
              maxlength="40"
              show-word-limit
              clearable
              @keyup.enter="createGroup"
            />
          </el-form-item>
          <button
            type="button"
            class="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-black text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
            :disabled="teamGroupsStore.saving || !newGroupName.trim()"
            @click="createGroup"
          >
            <el-icon><Plus /></el-icon>
            新增
          </button>
        </div>
      </section>

      <el-table
        v-loading="teamGroupsStore.loading"
        :data="teamGroupOptions"
        style="width: 100%"
        empty-text="尚無群組設定"
      >
        <el-table-column label="群組名稱" min-width="240">
          <template #default="{ row }">
            <div v-if="editingId === row.id" class="flex items-center gap-2">
              <el-input
                v-model="editingName"
                maxlength="40"
                show-word-limit
                size="small"
                @keyup.enter="saveEdit(row.id)"
              />
              <button
                type="button"
                class="rounded-md bg-primary px-2.5 py-1 text-xs font-black text-white disabled:opacity-60"
                :disabled="teamGroupsStore.saving || !editingName.trim()"
                @click="saveEdit(row.id)"
              >
                儲存
              </button>
              <button
                type="button"
                class="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-black text-slate-500"
                @click="cancelEdit"
              >
                取消
              </button>
            </div>
            <span
              v-else
              class="inline-flex max-w-full rounded border px-2 py-0.5 text-xs font-bold"
              :class="row.badgeClass"
            >
              {{ row.name }}
            </span>
          </template>
        </el-table-column>

        <el-table-column label="使用中" width="100" align="center">
          <template #default="{ row }">
            <span class="font-black text-slate-700">{{ row.member_count }}</span>
            <span class="ml-1 text-xs font-bold text-slate-400">人</span>
          </template>
        </el-table-column>

        <el-table-column label="排序" width="88" align="center">
          <template #default="{ row }">
            <span class="text-xs font-bold text-slate-400">{{ row.sort_order }}</span>
          </template>
        </el-table-column>

        <el-table-column label="操作" width="150" align="right">
          <template #default="{ row }">
            <div class="flex justify-end gap-2">
              <button
                v-if="canEdit && isPersistedGroup(row) && editingId !== row.id"
                type="button"
                class="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition-colors hover:border-primary hover:text-primary"
                title="編輯群組"
                @click="startEdit(row)"
              >
                <el-icon><Edit /></el-icon>
              </button>
              <button
                v-if="canDelete && isPersistedGroup(row) && (row.member_count === 0 || canEdit)"
                type="button"
                class="inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-100 bg-red-50 text-red-500 transition-colors hover:bg-red-100"
                title="刪除群組"
                @click="startDelete(row)"
              >
                <el-icon><Delete /></el-icon>
              </button>
            </div>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <template #footer>
      <div class="flex justify-end">
        <button
          type="button"
          class="rounded-lg px-5 py-2 text-sm font-bold text-slate-500 transition-colors hover:bg-slate-100"
          @click="isOpen = false"
        >
          關閉
        </button>
      </div>
    </template>

    <el-dialog
      v-model="isDeleteDialogOpen"
      title="刪除群組"
      width="92%"
      style="max-width: 520px; border-radius: 16px;"
      append-to-body
    >
      <div v-if="deletingGroup" class="space-y-4">
        <p class="text-sm font-bold text-slate-600">
          確定要刪除「{{ deletingGroup.name }}」？
        </p>
        <el-alert
          v-if="deletingGroup.member_count > 0"
          type="warning"
          :closable="false"
          show-icon
          title="此群組仍有球員使用，刪除前必須選擇要轉移到哪個群組。"
        />
        <el-form-item
          v-if="deletingGroup.member_count > 0"
          label="轉移目標群組"
          class="mb-0 font-bold"
        >
          <el-select v-model="transferToId" class="w-full" placeholder="請選擇群組">
            <el-option
              v-for="group in transferTargetOptions"
              :key="group.id"
              :label="group.name"
              :value="group.id"
            />
          </el-select>
        </el-form-item>
      </div>

      <template #footer>
        <div class="flex justify-end gap-2">
          <button
            type="button"
            class="rounded-lg px-4 py-2 text-sm font-bold text-slate-500 transition-colors hover:bg-slate-100"
            @click="isDeleteDialogOpen = false"
          >
            取消
          </button>
          <button
            type="button"
            class="rounded-lg bg-red-500 px-4 py-2 text-sm font-black text-white transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
            :disabled="teamGroupsStore.saving || deleteDisabled"
            @click="confirmDelete"
          >
            刪除
          </button>
        </div>
      </template>
    </el-dialog>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { Delete, Edit, Plus } from '@element-plus/icons-vue'
import { usePermissionsStore } from '@/stores/permissions'
import { useTeamGroupsStore } from '@/stores/teamGroups'
import type { TeamGroupOption } from '@/types/teamGroup'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  (event: 'update:modelValue', value: boolean): void
  (event: 'changed', affectsRoster: boolean): void
}>()

const permissionsStore = usePermissionsStore()
const teamGroupsStore = useTeamGroupsStore()

const newGroupName = ref('')
const editingId = ref<string | null>(null)
const editingName = ref('')
const isDeleteDialogOpen = ref(false)
const deletingGroup = ref<TeamGroupOption | null>(null)
const transferToId = ref('')

const isOpen = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value)
})

const canCreate = computed(() => permissionsStore.can('players', 'CREATE'))
const canEdit = computed(() => permissionsStore.can('players', 'EDIT'))
const canDelete = computed(() => permissionsStore.can('players', 'DELETE'))
const teamGroupOptions = computed(() => teamGroupsStore.options)
const transferTargetOptions = computed(() =>
  teamGroupOptions.value.filter((group) => group.id !== deletingGroup.value?.id)
)
const deleteDisabled = computed(() =>
  Boolean(deletingGroup.value && deletingGroup.value.member_count > 0 && !transferToId.value)
)
const isPersistedGroup = (group: TeamGroupOption) => !group.id.includes(':')

watch(isOpen, (open) => {
  if (open) {
    teamGroupsStore.loadGroups().catch((error: any) => {
      ElMessage.error(error?.message || '無法載入所屬群組設定')
    })
  }
})

const createGroup = async () => {
  const name = newGroupName.value.trim()
  if (!name || !canCreate.value) return

  try {
    await teamGroupsStore.createGroup(name)
    newGroupName.value = ''
    ElMessage.success('群組已新增')
    emit('changed', false)
  } catch (error: any) {
    ElMessage.error(error?.message || '新增群組失敗')
  }
}

const startEdit = (group: TeamGroupOption) => {
  editingId.value = group.id
  editingName.value = group.name
}

const cancelEdit = () => {
  editingId.value = null
  editingName.value = ''
}

const saveEdit = async (id: string) => {
  const name = editingName.value.trim()
  if (!name || !canEdit.value) return

  try {
    await teamGroupsStore.updateGroup(id, name)
    cancelEdit()
    ElMessage.success('群組已更新')
    emit('changed', true)
  } catch (error: any) {
    ElMessage.error(error?.message || '更新群組失敗')
  }
}

const startDelete = (group: TeamGroupOption) => {
  deletingGroup.value = group
  transferToId.value = transferTargetOptions.value[0]?.id || ''
  isDeleteDialogOpen.value = true
}

const confirmDelete = async () => {
  if (!deletingGroup.value || !canDelete.value) return

  try {
    const result = await teamGroupsStore.deleteGroup(
      deletingGroup.value.id,
      deletingGroup.value.member_count > 0 ? transferToId.value : null
    )
    isDeleteDialogOpen.value = false
    deletingGroup.value = null
    transferToId.value = ''
    ElMessage.success(
      result.transferred_member_count > 0
        ? `已刪除群組，並轉移 ${result.transferred_member_count} 位球員`
        : '群組已刪除'
    )
    emit('changed', result.transferred_member_count > 0)
  } catch (error: any) {
    ElMessage.error(error?.message || '刪除群組失敗')
  }
}
</script>

<style scoped>
.team-group-settings-dialog :deep(.el-dialog__header) {
  border-bottom: 1px solid #e2e8f0;
  margin-right: 0;
  padding-bottom: 14px;
}

.team-group-settings-dialog :deep(.el-dialog__title) {
  color: #0f172a;
  font-weight: 900;
}
</style>
