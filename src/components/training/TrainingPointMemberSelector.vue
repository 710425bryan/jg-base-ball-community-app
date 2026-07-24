<template>
  <el-select
    :model-value="modelValue"
    data-test="training-point-member-select"
    class="w-full"
    size="large"
    multiple
    filterable
    :filter-method="handleFilter"
    :reserve-keyword="false"
    collapse-tags
    collapse-tags-tooltip
    placeholder="選擇或搜尋球員"
    aria-label="選擇或搜尋點數異動球員"
    popper-class="training-select-popper"
    fit-input-width
    @update:model-value="updateModelValue"
    @visible-change="handleSelectVisibilityChange"
  >
    <el-option
      v-for="member in filteredMembers"
      :key="member.id"
      data-test="training-point-member-option"
      :label="getOptionLabel(member)"
      :value="member.id"
    />

    <template #empty>
      <div class="px-3 py-4 text-center text-sm font-bold text-slate-400">
        {{ searchQuery.trim() ? '找不到符合搜尋條件的球員' : '目前沒有可選擇的球員' }}
      </div>
    </template>
  </el-select>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { matchesMemberSearch } from '@/utils/memberSearch'

type TrainingPointMemberOption = {
  id: string
  name: string
  role: string | null
  team_group: string | null
}

const props = defineProps<{
  modelValue: string[]
  members: TrainingPointMemberOption[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string[]]
}>()

const searchQuery = ref('')

const getOptionLabel = (member: TrainingPointMemberOption) =>
  `${member.name}｜${member.role || '球員'}${member.team_group ? `｜${member.team_group}` : ''}`

const filteredMembers = computed(() =>
  props.members.filter((member) =>
    matchesMemberSearch(searchQuery.value, [
      getOptionLabel(member),
      member.name,
      member.role,
      member.team_group
    ])
  )
)

const handleFilter = (query: string) => {
  searchQuery.value = query
}

const updateModelValue = (value: unknown) => {
  if (!Array.isArray(value)) return
  emit('update:modelValue', value.filter((memberId): memberId is string => typeof memberId === 'string'))
}

const handleSelectVisibilityChange = (visible: boolean) => {
  if (!visible) searchQuery.value = ''
}
</script>
