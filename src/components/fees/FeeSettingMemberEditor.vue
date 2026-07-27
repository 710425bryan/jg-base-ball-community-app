<script setup lang="ts">
import { computed } from 'vue'
import { getTrainingProgramTagClass } from '@/utils/trainingPrograms'

export type FeeSettingEditorMember = {
  id: string
  name: string
  role?: string | null
  training_program?: string | null
  training_program_label?: string | null
  is_primary_payer?: boolean | null
  has_active_fee_sibling?: boolean
  billing_label?: string
}

const props = defineProps<{
  kind: 'per_session' | 'monthly_fixed'
  members: FeeSettingEditorMember[]
  values: Record<string, number>
  dirtyMap: Record<string, boolean>
  savingMap: Record<string, boolean>
}>()

const emit = defineEmits<{
  (event: 'update-value', payload: { memberId: string; value: number | undefined }): void
  (event: 'save', memberId: string): void
}>()

const isFixedMonthly = computed(() => props.kind === 'monthly_fixed')
const valueLabel = computed(() => isFixedMonthly.value ? '固定月繳金額 (元)' : '單次收費金額 (元)')
const emptyText = computed(() => isFixedMonthly.value
  ? '目前沒有固定月繳成員'
  : '目前沒有計次月費成員')
const valueStep = computed(() => isFixedMonthly.value ? 100 : 50)

const handleValueChange = (memberId: string, value: number | undefined) => {
  emit('update-value', { memberId, value })
}

const saveButtonClass = (memberId: string) => {
  if (!props.dirtyMap[memberId]) return 'cursor-not-allowed bg-gray-100 text-gray-400'
  return isFixedMonthly.value
    ? 'bg-amber-500 text-white hover:bg-amber-600'
    : 'bg-primary text-white hover:bg-primary/90'
}
</script>

<template>
  <div>
    <div v-if="members.length === 0" class="px-4 py-8 text-center text-sm font-bold text-gray-400">
      {{ emptyText }}
    </div>

    <div v-else class="grid gap-3 p-3 md:hidden">
      <article
        v-for="member in members"
        :key="member.id"
        class="rounded-2xl border border-slate-100 bg-slate-50/70 p-4"
      >
        <div class="flex flex-wrap items-center gap-2">
          <span class="font-black text-gray-800">{{ member.name }}</span>
          <span
            v-if="isFixedMonthly"
            class="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700"
          >
            {{ member.billing_label }}
          </span>
          <span
            v-if="!isFixedMonthly || member.role === '校隊'"
            class="whitespace-nowrap rounded border px-1.5 py-0.5 text-[10px] font-bold"
            :class="getTrainingProgramTagClass(member.training_program)"
          >
            {{ member.training_program_label || (isFixedMonthly ? '新泰總部' : '中港總部') }}
          </span>
          <span
            v-if="member.has_active_fee_sibling"
            class="whitespace-nowrap rounded border px-1.5 py-0.5 text-[10px] font-bold"
            :class="member.is_primary_payer ? 'border-green-200 bg-green-50 text-green-600' : 'border-primary/20 bg-primary/10 text-primary'"
          >
            {{ member.is_primary_payer ? '主要繳費人' : '半價優惠' }}
          </span>
        </div>

        <label class="mt-4 block">
          <span class="mb-1.5 block text-xs font-bold text-gray-500">{{ valueLabel }}</span>
          <el-input-number
            :model-value="values[member.id]"
            :min="0"
            :step="valueStep"
            size="large"
            class="!w-full font-mono font-bold"
            @update:model-value="handleValueChange(member.id, $event)"
          />
        </label>

        <button
          type="button"
          class="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-xl px-4 text-sm font-black transition-colors"
          :class="saveButtonClass(member.id)"
          :disabled="savingMap[member.id] || !dirtyMap[member.id]"
          @click="emit('save', member.id)"
        >
          {{ savingMap[member.id] ? '儲存中...' : '儲存' }}
        </button>
      </article>
    </div>

    <div v-if="members.length > 0" class="hidden overflow-x-auto md:block">
      <table class="w-full min-w-[560px]">
        <thead>
          <tr class="border-b border-gray-100 bg-gray-50/60">
            <th class="w-1/2 px-4 py-3 text-left text-sm font-bold text-gray-500">成員姓名</th>
            <th class="px-4 py-3 text-left text-sm font-bold text-gray-500">{{ valueLabel }}</th>
            <th class="w-32 px-4 py-3 text-center text-sm font-bold text-gray-500">操作</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-100">
          <tr v-for="member in members" :key="member.id" class="transition-colors hover:bg-gray-50/50">
            <td class="px-4 py-3">
              <div class="flex flex-wrap items-center gap-2">
                <span class="font-black text-gray-800">{{ member.name }}</span>
                <span
                  v-if="isFixedMonthly"
                  class="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700"
                >
                  {{ member.billing_label }}
                </span>
                <span
                  v-if="!isFixedMonthly || member.role === '校隊'"
                  class="whitespace-nowrap rounded border px-1.5 py-0.5 text-[10px] font-bold"
                  :class="getTrainingProgramTagClass(member.training_program)"
                >
                  {{ member.training_program_label || (isFixedMonthly ? '新泰總部' : '中港總部') }}
                </span>
                <span
                  v-if="member.has_active_fee_sibling"
                  class="whitespace-nowrap rounded border px-1.5 py-0.5 text-[10px] font-bold"
                  :class="member.is_primary_payer ? 'border-green-200 bg-green-50 text-green-600' : 'border-primary/20 bg-primary/10 text-primary'"
                >
                  {{ member.is_primary_payer ? '主要繳費人' : '半價優惠' }}
                </span>
              </div>
            </td>
            <td class="px-4 py-3">
              <el-input-number
                :model-value="values[member.id]"
                :min="0"
                :step="valueStep"
                size="large"
                class="!w-32 font-mono font-bold"
                @update:model-value="handleValueChange(member.id, $event)"
              />
            </td>
            <td class="px-4 py-3 text-center">
              <button
                type="button"
                class="min-h-11 rounded-xl px-4 text-sm font-bold transition-colors"
                :class="saveButtonClass(member.id)"
                :disabled="savingMap[member.id] || !dirtyMap[member.id]"
                @click="emit('save', member.id)"
              >
                {{ savingMap[member.id] ? '儲存中...' : '儲存' }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
