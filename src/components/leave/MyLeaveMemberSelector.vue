<template>
  <section
    data-test="leave-member-selector"
    class="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm md:p-6"
  >
    <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div class="w-full lg:max-w-md">
        <label class="text-xs font-bold uppercase tracking-[0.18em] text-gray-400">送假成員</label>
        <el-select
          v-model="selectedMemberId"
          data-test="leave-member-select"
          class="mt-2 w-full"
          size="large"
          filterable
          placeholder="請選擇成員"
        >
          <el-option
            v-for="member in members"
            :key="member.member_id"
            :label="buildMemberOptionLabel(member)"
            :value="member.member_id"
          />
        </el-select>
        <p data-test="leave-member-helper" class="mt-2 text-xs text-gray-400">
          {{ memberSelectorHelperText }}
        </p>
      </div>

      <div
        v-if="selectedMember"
        class="rounded-2xl border border-primary/15 bg-primary/5 px-4 py-3 text-sm font-bold text-primary"
      >
        目前送假對象：{{ selectedMember.name }} / {{ selectedMember.training_program_label || selectedMember.role }}
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { MyLeaveMember } from '@/types/leaveRequests'

const props = defineProps<{
  members: MyLeaveMember[]
  modelValue: string
}>()

const emit = defineEmits<{
  'update:modelValue': [memberId: string]
}>()

const selectedMemberId = computed({
  get: () => props.modelValue,
  set: (memberId: string) => emit('update:modelValue', memberId)
})

const selectedMember = computed(() => (
  props.members.find((member) => member.member_id === props.modelValue) || null
))

const hasAdminMemberScope = computed(() => (
  props.members.some((member) => member.is_linked === false)
))

const memberSelectorHelperText = computed(() => {
  if (hasAdminMemberScope.value) {
    return 'ADMIN 可切換所有有效成員；切換後會同步顯示對應的假單紀錄。'
  }

  if (props.members.length <= 1) {
    return '系統會自動使用目前可送假的關聯成員。'
  }

  return '切換不同關聯成員時，頁面會同步顯示對應的假單紀錄。'
})

const buildMemberOptionLabel = (member: MyLeaveMember) => (
  `${member.name}｜${member.training_program_label || member.team_group || member.role}`
)
</script>
