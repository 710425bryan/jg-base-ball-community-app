<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ArrowDown, ArrowUp, Delete, Picture } from '@element-plus/icons-vue'
import type {
  RegistrationFormTemplate,
  RegistrationPlayerRow,
  RegistrationStaffFields,
  RegistrationWizardPayload
} from '@/types/registrationForm'
import {
  createRegistrationPlayerRow,
  createRegistrationStaffFields,
  getRegistrationMemberPhone,
  isActiveRegistrationPlayer,
  isActiveRegistrationStaffMember,
  sortRegistrationMembers,
  validateRegistrationForm
} from '@/utils/registrationForms'
import { inferPlayerULevelFromBirthDate } from '@/utils/playerULevel'

const props = defineProps<{
  modelValue: boolean
  template: RegistrationFormTemplate | null
  members: any[]
  generating?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  generate: [payload: RegistrationWizardPayload]
}>()

const step = ref(0)
const fields = ref<RegistrationStaffFields>(createRegistrationStaffFields())
const selectedIds = ref<string[]>([])
const playerRows = ref<RegistrationPlayerRow[]>([])
const orderCustomized = ref(false)
const quickSelectionNotice = ref('')

const staffFieldConfigs = [
  { key: 'leader', label: '領隊', nameKey: 'leader_name', phoneKey: 'leader_phone', required: true, phoneRequired: false },
  { key: 'head_coach', label: '總教練', nameKey: 'head_coach_name', phoneKey: 'head_coach_phone', required: true, phoneRequired: false },
  { key: 'coach_1', label: '教練一', nameKey: 'coach_1_name', phoneKey: 'coach_1_phone', required: false, phoneRequired: false },
  { key: 'coach_2', label: '教練二', nameKey: 'coach_2_name', phoneKey: 'coach_2_phone', required: false, phoneRequired: false },
  { key: 'manager', label: '管理', nameKey: 'manager_name', phoneKey: 'manager_phone', required: true, phoneRequired: false },
  { key: 'contact', label: '聯絡人', nameKey: 'contact_name', phoneKey: 'contact_phone', required: true, phoneRequired: true }
] as const

type StaffFieldConfig = typeof staffFieldConfigs[number]
type StaffSelectionKey = StaffFieldConfig['key']

const createStaffSelections = (): Record<StaffSelectionKey, string> => ({
  leader: '',
  head_coach: '',
  coach_1: '',
  coach_2: '',
  manager: '',
  contact: ''
})

const staffSelections = ref(createStaffSelections())
const sortedMembers = computed(() => sortRegistrationMembers(
  props.members.filter(isActiveRegistrationPlayer)
))
const uLevelOptions = computed(() => Array.from(new Set(
  sortedMembers.value
    .map((member) => inferPlayerULevelFromBirthDate(member.birth_date))
    .filter((level): level is string => Boolean(level))
)).sort((left, right) =>
  Number(right.replace(/\D/g, '')) - Number(left.replace(/\D/g, ''))
  || left.localeCompare(right, 'zh-Hant')
))
const staffRoleOrder: Record<string, number> = { '教練': 0, '管理群': 1, '球員': 2, '校隊': 3 }
const staffMemberOptions = computed(() => props.members
  .filter(isActiveRegistrationStaffMember)
  .map((member) => ({
    id: String(member.id || ''),
    name: String(member.name || '').trim(),
    role: String(member.role || '').trim(),
    phone: getRegistrationMemberPhone(member)
  }))
  .filter((member) => member.id && member.name)
  .sort((left, right) =>
    (staffRoleOrder[left.role] ?? Number.MAX_SAFE_INTEGER) - (staffRoleOrder[right.role] ?? Number.MAX_SAFE_INTEGER)
    || left.name.localeCompare(right.name, 'zh-Hant')
  ))
const capacity = computed(() => Number(props.template?.max_players || 0))
const isExcelProfile = computed(() => props.template?.profile_key === 'just_baseball_taipei')
const validation = computed(() => props.template
  ? validateRegistrationForm(props.template.profile_key, capacity.value, fields.value, playerRows.value)
  : { blocking: ['尚未選擇範本'], warnings: [] })

const reset = () => {
  step.value = 0
  fields.value = createRegistrationStaffFields()
  staffSelections.value = createStaffSelections()
  selectedIds.value = []
  playerRows.value = []
  orderCustomized.value = false
  quickSelectionNotice.value = ''
}

watch(() => props.modelValue, (open) => {
  if (open) reset()
})

watch(selectedIds, (ids) => {
  if (ids.length < capacity.value) quickSelectionNotice.value = ''
  const existing = new Map(playerRows.value.map((row) => [row.member_id, row]))
  const memberMap = new Map(props.members.map((member) => [String(member.id), member]))
  const nextRows = ids
    .map((id) => existing.get(id) || (memberMap.get(id) ? createRegistrationPlayerRow(memberMap.get(id)) : null))
    .filter(Boolean) as RegistrationPlayerRow[]
  if (orderCustomized.value) {
    playerRows.value = nextRows
    return
  }

  const rosterOrder = new Map(sortedMembers.value.map((member, index) => [String(member.id), index]))
  playerRows.value = nextRows.sort((left, right) =>
    (rosterOrder.get(left.member_id) ?? Number.MAX_SAFE_INTEGER) -
    (rosterOrder.get(right.member_id) ?? Number.MAX_SAFE_INTEGER)
  )
}, { deep: true })

const applyStaffMember = (config: StaffFieldConfig, selectedValue: unknown) => {
  const value = String(selectedValue || '').trim()
  const member = staffMemberOptions.value.find((option) => option.id === value)
  fields.value[config.nameKey] = member?.name || value
  fields.value[config.phoneKey] = member?.phone || ''
}

const selectPlayersBy = (target: 'all' | string) => {
  const matchedMembers = sortedMembers.value.filter((member) =>
    target === 'all' || inferPlayerULevelFromBirthDate(member.birth_date) === target
  )
  const selectedMembers = matchedMembers.slice(0, capacity.value)
  orderCustomized.value = false
  quickSelectionNotice.value = matchedMembers.length > selectedMembers.length
    ? `${target === 'all' ? '所有人' : target}共有 ${matchedMembers.length} 人，此版型最多 ${capacity.value} 人，已依背號選取前 ${selectedMembers.length} 人。`
    : ''
  selectedIds.value = selectedMembers.map((member) => String(member.id))
}

const clearPlayerSelection = () => {
  orderCustomized.value = false
  quickSelectionNotice.value = ''
  selectedIds.value = []
}

const staffMissing = computed(() => [
  fields.value.team_name,
  fields.value.leader_name,
  fields.value.head_coach_name,
  fields.value.manager_name,
  fields.value.contact_name,
  fields.value.contact_phone
].some((value) => !String(value || '').trim()))

const close = () => {
  if (!props.generating) emit('update:modelValue', false)
}

const next = () => {
  if (step.value === 0 && staffMissing.value) return
  if (step.value === 1 && (!playerRows.value.length || playerRows.value.length > capacity.value)) return
  step.value = Math.min(2, step.value + 1)
}

const previous = () => {
  step.value = Math.max(0, step.value - 1)
}

const move = (index: number, direction: -1 | 1) => {
  const target = index + direction
  if (target < 0 || target >= playerRows.value.length) return
  const nextRows = [...playerRows.value]
  ;[nextRows[index], nextRows[target]] = [nextRows[target], nextRows[index]]
  orderCustomized.value = true
  playerRows.value = nextRows
  selectedIds.value = nextRows.map((row) => row.member_id)
}

const remove = (memberId: string) => {
  selectedIds.value = selectedIds.value.filter((id) => id !== memberId)
}

const submit = () => {
  if (!props.template || validation.value.blocking.length) return
  emit('generate', {
    template_id: props.template.id,
    fields: { ...fields.value },
    players: playerRows.value.map((row) => ({
      member_id: row.member_id,
      overrides: { ...row.overrides }
    }))
  })
}
</script>

<template>
  <el-dialog
    :model-value="modelValue"
    :title="`產生報名表－${template?.name || ''}`"
    width="min(1100px, 94vw)"
    destroy-on-close
    :close-on-click-modal="false"
    :close-on-press-escape="!generating"
    class="registration-form-dialog"
    @close="close"
  >
    <el-steps :active="step" finish-status="success" align-center class="mb-6">
      <el-step title="隊職員資料" />
      <el-step title="選擇球員" />
      <el-step title="檢查下載" />
    </el-steps>

    <section v-if="step === 0" aria-label="隊職員資料">
      <el-alert
        v-if="staffMissing"
        title="請完成隊名、領隊、總教練、管理、聯絡人與聯絡手機"
        type="warning"
        :closable="false"
        class="mb-4"
      />
      <el-form :model="fields" label-position="top" size="large">
        <p class="mb-3 text-sm text-slate-500">
          可搜尋有效教練、管理群、球員或校隊成員；選取後會自動帶入名單中的聯絡電話，電話仍可在本次表單調整。
        </p>
        <div class="grid gap-x-4 sm:grid-cols-2 lg:grid-cols-3">
          <el-form-item label="隊名" required>
            <el-input v-model="fields.team_name" />
          </el-form-item>
          <template v-for="config in staffFieldConfigs" :key="config.key">
            <el-form-item :label="config.label" :required="config.required">
              <el-select
                v-model="staffSelections[config.key]"
                filterable
                allow-create
                default-first-option
                clearable
                :placeholder="`搜尋或輸入${config.label}`"
                class="w-full"
                @change="applyStaffMember(config, $event)"
              >
                <el-option
                  v-for="member in staffMemberOptions"
                  :key="member.id"
                  :label="member.name"
                  :value="member.id"
                >
                  <div class="flex min-w-0 items-center justify-between gap-3">
                    <span class="truncate">{{ member.name }}</span>
                    <span class="shrink-0 text-xs text-slate-400">
                      {{ member.role }}<template v-if="member.phone">・{{ member.phone }}</template>
                    </span>
                  </div>
                </el-option>
              </el-select>
            </el-form-item>
            <el-form-item :label="config.key === 'contact' ? '聯絡手機' : `${config.label}電話`" :required="config.phoneRequired">
              <el-input v-model="fields[config.phoneKey]" inputmode="tel" />
            </el-form-item>
          </template>
        </div>
      </el-form>
    </section>

    <section v-else-if="step === 1" aria-label="選擇球員">
      <div class="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <div class="mb-2 flex flex-wrap items-center justify-between gap-2">
          <label class="font-bold text-slate-800">從有效名單選擇球員／校隊</label>
          <el-tag :type="playerRows.length > capacity ? 'danger' : 'info'">
            {{ playerRows.length }} / {{ capacity }} 人
          </el-tag>
        </div>
        <div class="mb-3 flex flex-wrap items-center gap-2" aria-label="快速選取球員">
          <span class="text-sm font-bold text-slate-500">快速選取：</span>
          <button type="button" class="registration-quick-chip" @click="selectPlayersBy('all')">所有人</button>
          <button
            v-for="level in uLevelOptions"
            :key="level"
            type="button"
            class="registration-quick-chip"
            @click="selectPlayersBy(level)"
          >
            {{ level }}
          </button>
          <button type="button" class="registration-quick-chip" @click="clearPlayerSelection">清除全選</button>
        </div>
        <el-alert
          v-if="quickSelectionNotice"
          :title="quickSelectionNotice"
          type="warning"
          :closable="false"
          class="mb-3"
        />
        <el-select
          v-model="selectedIds"
          multiple
          filterable
          collapse-tags
          collapse-tags-tooltip
          :multiple-limit="capacity"
          placeholder="依背號排序，可搜尋姓名或背號"
          size="large"
          class="w-full"
        >
          <el-option
            v-for="member in sortedMembers"
            :key="member.id"
            :label="`#${member.jersey_number || '－'} ${member.name}`"
            :value="String(member.id)"
          />
        </el-select>
      </div>

      <el-empty v-if="!playerRows.length" description="尚未選擇球員" />
      <div v-else class="space-y-3">
        <article
          v-for="(player, index) in playerRows"
          :key="player.member_id"
          class="rounded-2xl border border-slate-200 bg-white p-4"
        >
          <div class="mb-4 flex flex-wrap items-center gap-3">
            <div class="flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl bg-slate-100">
              <img
                v-if="player.portrait_auth && player.avatar_url"
                :src="player.avatar_url"
                :alt="`${player.name}照片`"
                class="h-full w-full object-cover"
              >
              <el-icon v-else class="text-xl text-slate-400"><Picture /></el-icon>
            </div>
            <div class="min-w-0 flex-1">
              <div class="font-bold text-slate-900">{{ index + 1 }}. {{ player.name }}</div>
              <div class="text-xs" :class="player.portrait_auth ? 'text-slate-500' : 'text-amber-700'">
                {{ player.portrait_auth ? (player.avatar_url ? '肖像已授權／有照片' : '肖像已授權／缺照片') : '肖像未授權，照片不會置入' }}
              </div>
            </div>
            <div class="flex gap-1">
              <el-button :icon="ArrowUp" circle :disabled="index === 0" aria-label="上移球員" @click="move(index, -1)" />
              <el-button :icon="ArrowDown" circle :disabled="index === playerRows.length - 1" aria-label="下移球員" @click="move(index, 1)" />
              <el-button :icon="Delete" circle type="danger" plain aria-label="移除球員" @click="remove(player.member_id)" />
            </div>
          </div>

          <el-form label-position="top" size="large">
            <div class="grid gap-x-3 sm:grid-cols-2 lg:grid-cols-4">
              <el-form-item label="背號" required>
                <el-input v-model="player.overrides.jersey_number" />
              </el-form-item>
              <el-form-item label="生日" required>
                <el-date-picker
                  v-model="player.overrides.birth_date"
                  type="date"
                  format="YYYY/MM/DD"
                  value-format="YYYY-MM-DD"
                  placeholder="選擇生日"
                  class="!w-full"
                />
              </el-form-item>
              <template v-if="isExcelProfile">
                <el-form-item label="身分證" required>
                  <el-input v-model="player.overrides.national_id" />
                </el-form-item>
                <el-form-item label="守位（非必填）">
                  <el-select v-model="player.overrides.position" clearable placeholder="選擇守位（非必填）" class="w-full">
                    <el-option label="投手 P" value="P" />
                    <el-option label="捕手 C" value="C" />
                    <el-option label="內野 IF" value="IF" />
                    <el-option label="外野 OF" value="OF" />
                  </el-select>
                </el-form-item>
                <el-form-item label="投球慣用手" required>
                  <el-select v-model="player.overrides.throwing_hand" placeholder="人工確認" class="w-full">
                    <el-option label="右投 R" value="右投" />
                    <el-option label="左投 L" value="左投" />
                  </el-select>
                </el-form-item>
                <el-form-item label="打擊慣用手" required>
                  <el-select v-model="player.overrides.batting_hand" placeholder="人工確認" class="w-full">
                    <el-option label="右打 R" value="右打" />
                    <el-option label="左打 L" value="左打" />
                  </el-select>
                </el-form-item>
                <el-form-item label="學校" required>
                  <el-input v-model="player.overrides.school_name" />
                </el-form-item>
                <el-form-item label="年級" required>
                  <el-input v-model="player.overrides.grade" />
                </el-form-item>
              </template>
            </div>
          </el-form>
        </article>
      </div>
    </section>

    <section v-else aria-label="檢查下載" class="space-y-4">
      <div class="grid gap-3 sm:grid-cols-3">
        <div class="rounded-2xl border border-slate-200 p-4">
          <div class="text-xs font-bold text-slate-500">範本</div>
          <div class="mt-1 font-bold text-slate-900">{{ template?.name }}</div>
        </div>
        <div class="rounded-2xl border border-slate-200 p-4">
          <div class="text-xs font-bold text-slate-500">隊名</div>
          <div class="mt-1 font-bold text-slate-900">{{ fields.team_name }}</div>
        </div>
        <div class="rounded-2xl border border-slate-200 p-4">
          <div class="text-xs font-bold text-slate-500">球員</div>
          <div class="mt-1 font-bold text-slate-900">{{ playerRows.length }} 人</div>
        </div>
      </div>

      <el-alert
        v-if="validation.blocking.length"
        title="尚有必要資料未完成"
        type="error"
        :closable="false"
        show-icon
      >
        <ul class="list-disc pl-5">
          <li v-for="message in validation.blocking" :key="message">{{ message }}</li>
        </ul>
      </el-alert>
      <el-alert
        v-if="validation.warnings.length"
        title="照片與肖像提醒（不阻擋產生）"
        type="warning"
        :closable="false"
        show-icon
      >
        <ul class="list-disc pl-5">
          <li v-for="message in validation.warnings" :key="message">{{ message }}</li>
        </ul>
      </el-alert>
      <el-alert
        v-if="!validation.blocking.length"
        title="資料檢查完成，可以產生原格式報名表"
        type="success"
        :closable="false"
        show-icon
      />
      <p class="text-sm text-slate-500">
        本次補正值只會寫入下載檔，不會更新球員主檔；產出檔不會保存在系統。
      </p>
    </section>

    <template #footer>
      <div class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
        <el-button size="large" :disabled="generating" @click="close">取消</el-button>
        <div class="flex gap-2">
          <el-button v-if="step > 0" size="large" :disabled="generating" @click="previous">上一步</el-button>
          <el-button
            v-if="step < 2"
            type="primary"
            size="large"
            :disabled="(step === 0 && staffMissing) || (step === 1 && !playerRows.length)"
            @click="next"
          >
            下一步
          </el-button>
          <el-button
            v-else
            type="primary"
            size="large"
            :loading="generating"
            :disabled="validation.blocking.length > 0"
            @click="submit"
          >
            產生並下載
          </el-button>
        </div>
      </div>
    </template>
  </el-dialog>
</template>

<style>
.registration-quick-chip {
  min-height: 44px;
  border: 1px solid #dbe3ee;
  border-radius: 999px;
  background: #ffffff;
  padding: 0 14px;
  color: #64748b;
  font-size: 0.8125rem;
  font-weight: 800;
  transition: border-color 160ms ease, color 160ms ease, background-color 160ms ease;
}

.registration-quick-chip:hover,
.registration-quick-chip:focus-visible {
  border-color: rgba(216, 143, 34, 0.55);
  background: #fff7ed;
  color: var(--color-primary);
  outline: none;
}

.registration-quick-chip:focus-visible {
  box-shadow: 0 0 0 3px rgba(216, 143, 34, 0.18);
}

@media (max-width: 767px) {
  .registration-form-dialog {
    width: 100% !important;
    max-width: none;
    min-height: 100%;
    margin: 0 !important;
    border-radius: 0;
  }

  .registration-form-dialog .el-dialog__body {
    max-height: calc(100vh - 190px);
    overflow-y: auto;
  }
}
</style>
