<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import AppSearchInput from '@/components/common/AppSearchInput.vue'
import { matchesMemberSearch } from '@/utils/memberSearch'

type LeaveMemberOption = {
  id: string
  name?: string | null
  role?: string | null
  team_group?: string | null
  jersey_number?: string | number | null
}

const props = defineProps<{
  modelValue: string
  members: LeaveMemberOption[]
  open: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [memberId: string]
}>()

const searchQuery = ref('')

const filteredMembers = computed(() =>
  props.members.filter((member) =>
    matchesMemberSearch(searchQuery.value, [
      member.name,
      member.role,
      member.team_group,
      member.jersey_number
    ])
  )
)

watch(() => props.open, (open) => {
  if (open) searchQuery.value = ''
})
</script>

<template>
  <div class="w-full space-y-2">
    <AppSearchInput
      v-model="searchQuery"
      data-test="leave-member-search"
      placeholder="搜尋姓名、組別、背號"
      aria-label="搜尋請假球員"
    />

    <div
      class="max-h-[38dvh] space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-2 custom-scrollbar"
      role="radiogroup"
      aria-label="選擇請假球員"
    >
      <button
        v-for="member in filteredMembers"
        :key="member.id"
        type="button"
        role="radio"
        :aria-checked="modelValue === member.id"
        data-test="leave-member-option"
        class="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left text-sm transition-colors"
        :class="modelValue === member.id
          ? 'border-primary bg-primary/5 text-primary ring-1 ring-primary/20'
          : 'border-slate-100 bg-white text-slate-700 active:bg-slate-100'"
        @click="emit('update:modelValue', member.id)"
      >
        <span class="min-w-0">
          <span class="block truncate font-black">{{ member.name }}</span>
          <span class="mt-0.5 block truncate text-xs font-bold opacity-70">
            {{ [member.role, member.team_group, member.jersey_number ? `#${member.jersey_number}` : ''].filter(Boolean).join('｜') }}
          </span>
        </span>
        <span
          class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-sm font-black"
          :class="modelValue === member.id ? 'border-primary bg-primary text-white' : 'border-slate-200 text-transparent'"
          aria-hidden="true"
        >
          ✓
        </span>
      </button>

      <p
        v-if="filteredMembers.length === 0"
        class="px-3 py-6 text-center text-sm font-bold text-slate-400"
        data-test="leave-member-empty"
      >
        找不到符合搜尋條件的球員
      </p>
    </div>
  </div>
</template>
