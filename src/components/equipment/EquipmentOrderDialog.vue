<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ArrowDown, ArrowUp, Rank } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import AppDialogFooter from '@/components/common/AppDialogFooter.vue'
import { useEquipmentStore } from '@/stores/equipment'
import type { Equipment } from '@/types/equipment'
import { moveEquipment } from '@/utils/equipmentOrder'

const props = defineProps<{ modelValue: boolean; equipments: Equipment[] }>()
const emit = defineEmits<{ (event: 'update:modelValue', value: boolean): void }>()
const store = useEquipmentStore()
const draft = ref<Equipment[]>([])
const expectedIds = ref<string[]>([])
const draggingId = ref<string | null>(null)
const saving = ref(false)
const errorMessage = ref('')
const hasChanges = computed(() => draft.value.some((item, index) => item.id !== expectedIds.value[index]))

watch(() => props.modelValue, (open) => {
  if (!open) return
  draft.value = [...props.equipments]
  expectedIds.value = props.equipments.map((item) => item.id)
  errorMessage.value = ''
  draggingId.value = null
}, { immediate: true })

const close = () => {
  if (!saving.value) emit('update:modelValue', false)
}

const move = (from: number, to: number) => {
  if (!saving.value) draft.value = moveEquipment(draft.value, from, to)
}

const startDrag = (event: DragEvent, id: string) => {
  if (saving.value) return event.preventDefault()
  draggingId.value = id
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', id)
  }
}

const drop = (index: number) => {
  const from = draft.value.findIndex((item) => item.id === draggingId.value)
  move(from, index)
  draggingId.value = null
}

const save = async () => {
  if (saving.value || !hasChanges.value) return
  saving.value = true
  errorMessage.value = ''
  try {
    await store.reorderEquipments(draft.value.map((item) => item.id), [...expectedIds.value])
    ElMessage.success('已儲存裝備排序，所有使用者將共用此順序')
    emit('update:modelValue', false)
  } catch (error: any) {
    errorMessage.value = error?.message || '儲存排序失敗，請稍後再試。'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    title="調整裝備排序"
    width="600px"
    class="equipment-order-dialog"
    :close-on-click-modal="false"
    :close-on-press-escape="!saving"
    :show-close="!saving"
    @update:model-value="(open: boolean) => { if (!open) close() }"
  >
    <p class="mb-4 text-sm leading-relaxed text-slate-500">
      使用上下按鈕調整，電腦也可拖曳左側圖示。此處顯示全部裝備；儲存後，裝備管理與家長加購將共用此順序，新裝備接在最後。
    </p>
    <p v-if="errorMessage" role="alert" class="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{{ errorMessage }}</p>
    <ol class="space-y-2" aria-label="裝備排列順序" :aria-busy="saving">
      <li
        v-for="(equipment, index) in draft"
        :key="equipment.id"
        :data-equipment-id="equipment.id"
        class="flex min-w-0 items-center gap-2 rounded-xl border border-slate-200 bg-white p-2"
        :class="{ 'opacity-50': draggingId === equipment.id }"
        @dragover.prevent
        @drop.prevent="drop(index)"
      >
        <span
          class="hidden h-11 w-11 shrink-0 cursor-grab items-center justify-center text-slate-400 md:inline-flex"
          :draggable="!saving"
          title="拖曳調整順序"
          aria-hidden="true"
          @dragstart="startDrag($event, equipment.id)"
          @dragend="draggingId = null"
        ><el-icon><Rank /></el-icon></span>
        <span class="w-6 shrink-0 text-center text-sm text-slate-400">{{ index + 1 }}</span>
        <div class="min-w-0 flex-1">
          <p class="break-words font-bold text-slate-800">{{ equipment.name }}</p>
          <p class="text-xs text-slate-500">{{ equipment.category }}</p>
        </div>
        <div class="flex shrink-0 gap-1">
          <button
            type="button"
            class="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 text-slate-600 enabled:hover:bg-slate-50 enabled:active:bg-slate-100 disabled:opacity-30"
            :aria-label="`上移${equipment.name}`"
            :title="`上移${equipment.name}`"
            :disabled="saving || index === 0"
            @click="move(index, index - 1)"
          ><el-icon><ArrowUp /></el-icon></button>
          <button
            type="button"
            class="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 text-slate-600 enabled:hover:bg-slate-50 enabled:active:bg-slate-100 disabled:opacity-30"
            :aria-label="`下移${equipment.name}`"
            :title="`下移${equipment.name}`"
            :disabled="saving || index === draft.length - 1"
            @click="move(index, index + 1)"
          ><el-icon><ArrowDown /></el-icon></button>
        </div>
      </li>
    </ol>
    <template #footer>
      <AppDialogFooter
        :show-cancel="!saving"
        :loading="saving"
        :confirm-disabled="!hasChanges || saving"
        confirm-label="儲存排序"
        @cancel="close"
        @confirm="save"
      />
    </template>
  </el-dialog>
</template>

<style scoped>
@media (min-width: 768px) {
  :global(.equipment-order-dialog) {
    display: flex;
    flex-direction: column;
    max-height: 85dvh;
    margin-top: 7vh;
  }

  :global(.equipment-order-dialog .el-dialog__body) {
    min-height: 0;
    overflow-y: auto;
  }
}
</style>
