<template>
  <section class="rounded-3xl border border-gray-100 bg-white p-5 shadow-sm md:p-6">
    <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div class="w-full lg:max-w-md">
        <label class="text-xs font-bold uppercase tracking-[0.18em] text-gray-400">查看成員</label>

        <div class="mt-2 md:hidden">
          <el-select
            :model-value="modelValue"
            data-test="payment-member-mobile-select"
            class="w-full"
            size="large"
            placeholder="請選擇成員"
            aria-label="查看繳費成員"
            fit-input-width
            @update:model-value="updateModelValue"
            @visible-change="handleMobileSelectVisibilityChange"
          >
            <template #label>
              <span>{{ selectedMember ? getOptionLabel(selectedMember) : '' }}</span>
            </template>

            <template #header>
              <el-input
                ref="mobileSearchInputRef"
                v-model="mobileSearchQuery"
                data-test="payment-member-mobile-search"
                :prefix-icon="Search"
                size="large"
                clearable
                autocomplete="off"
                placeholder="輸入姓名搜尋成員"
                aria-label="搜尋繳費成員"
                @click.stop
                @keydown.stop
              />
            </template>

            <el-option
              v-for="member in filteredMobileMembers"
              :key="member.member_id"
              data-test="payment-member-option"
              :label="getOptionLabel(member)"
              :value="member.member_id"
            />

            <template #empty>
              <div class="px-3 py-4 text-center text-sm font-bold text-slate-400">
                {{ mobileSearchQuery.trim() ? '找不到符合搜尋條件的成員' : '目前沒有可選擇的成員' }}
              </div>
            </template>
          </el-select>
        </div>

        <div class="mt-2 hidden md:block">
          <el-select
            :model-value="modelValue"
            data-test="payment-member-desktop-select"
            class="w-full"
            size="large"
            filterable
            placeholder="請選擇成員"
            aria-label="查看繳費成員"
            fit-input-width
            @update:model-value="updateModelValue"
          >
            <el-option
              v-for="member in members"
              :key="member.member_id"
              :label="getOptionLabel(member)"
              :value="member.member_id"
            />
          </el-select>
        </div>

        <p class="mt-2 text-xs text-gray-400">
          {{ helperText }}
        </p>
      </div>

      <div
        v-if="selectedMember"
        class="rounded-2xl border border-primary/15 bg-primary/5 px-4 py-3 text-sm font-bold text-primary"
      >
        目前模式：{{ getBillingLabel(selectedMember) }} / {{ selectedMember.role }}
      </div>
    </div>

    <p
      v-if="accessHint"
      class="mt-4 rounded-2xl border border-amber-100 bg-amber-50/80 px-4 py-3 text-sm font-bold text-amber-700"
    >
      {{ accessHint }}
    </p>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { Search } from '@element-plus/icons-vue'
import type { MyPaymentMember } from '@/types/payments'
import { matchesMemberSearch } from '@/utils/memberSearch'

const props = defineProps<{
  modelValue: string
  members: MyPaymentMember[]
  helperText: string
  accessHint?: string
  getOptionLabel: (member: MyPaymentMember) => string
  getBillingLabel: (member: MyPaymentMember) => string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const mobileSearchQuery = ref('')
const mobileSearchInputRef = ref<{ focus?: () => void } | null>(null)

const selectedMember = computed(() =>
  props.members.find((member) => member.member_id === props.modelValue) || null
)

const filteredMobileMembers = computed(() => {
  return props.members.filter((member) =>
    matchesMemberSearch(mobileSearchQuery.value, [
      props.getOptionLabel(member),
      member.name,
      member.role,
      member.training_program,
      member.training_program_label
    ])
  )
})

const updateModelValue = (value: unknown) => {
  if (typeof value === 'string') {
    emit('update:modelValue', value)
  }
}

const handleMobileSelectVisibilityChange = (visible: boolean) => {
  if (visible) {
    void nextTick(() => mobileSearchInputRef.value?.focus?.())
  } else {
    mobileSearchQuery.value = ''
  }
}
</script>
