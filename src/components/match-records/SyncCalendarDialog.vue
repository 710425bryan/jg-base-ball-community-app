<template>
  <el-dialog
    v-model="visible"
    title="Google 行事曆同步"
    width="95%"
    class="max-w-4xl custom-dialog !rounded-2xl"
    destroy-on-close
  >
    <div class="space-y-6">
      <div class="bg-blue-50/70 border border-blue-100 rounded-xl p-4 md:p-6">
        <h3 class="text-lg font-extrabold text-blue-900 mb-2">以 Google Calendar 為比賽排程來源</h3>
        <p class="text-sm text-blue-700/90 leading-relaxed font-medium">
          這次同步會先解析公開 `.ics` 行事曆，再和現有比賽紀錄比對。
          同一場比賽會優先用 Google UID 命中，舊資料沒有 UID 時才退回「標題 + 日期 + 開始時間」更新。
        </p>

        <div class="mt-4 bg-white rounded-lg border border-blue-100 p-3 shadow-sm">
          <label class="text-xs font-bold text-gray-500 mb-1 block">公開 iCal (.ics) 行事曆連結</label>
          <div class="flex gap-2">
            <el-input
              v-model="calendarUrl"
              placeholder="https://calendar.google.com/calendar/ical/..."
              clearable
              class="flex-1"
            />
            <el-button type="primary" :loading="isFetching" class="!font-bold" @click="handleFetch">
              解析同步
            </el-button>
          </div>
        </div>
      </div>

      <div v-if="hasFetched" class="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <div class="bg-gray-50 border border-gray-200 rounded-xl p-4">
          <div class="text-xs font-bold text-gray-500 mb-1">解析到事件</div>
          <div class="text-2xl font-black text-gray-900">{{ syncItems.length }}</div>
        </div>
        <div class="bg-green-50 border border-green-100 rounded-xl p-4">
          <div class="text-xs font-bold text-green-600 mb-1">將新增</div>
          <div class="text-2xl font-black text-green-700">{{ createItems.length }}</div>
        </div>
        <div class="bg-amber-50 border border-amber-100 rounded-xl p-4">
          <div class="text-xs font-bold text-amber-600 mb-1">將更新</div>
          <div class="text-2xl font-black text-amber-700">{{ updateItems.length }}</div>
        </div>
        <div class="bg-red-50 border border-red-100 rounded-xl p-4">
          <div class="text-xs font-bold text-red-600 mb-1">需檢查</div>
          <div class="text-2xl font-black text-red-700">{{ blockedItems.length }}</div>
        </div>
      </div>

      <div
        v-if="hasFetched && actionableItems.length === 0 && blockedItems.length === 0"
        class="text-center py-8 text-gray-500 font-bold border-2 border-dashed border-gray-200 rounded-xl bg-gray-50"
      >
        目前沒有可同步的新增或更新資料。
      </div>

      <div v-if="blockedItems.length > 0" class="border border-red-100 rounded-xl overflow-hidden">
        <div class="bg-red-50 px-4 py-3 border-b border-red-100">
          <h4 class="font-extrabold text-sm text-red-800">需要檢查的賽事 ({{ blockedItems.length }})</h4>
        </div>

        <div class="max-h-[280px] overflow-y-auto custom-scrollbar p-2 bg-red-50/30">
          <div
            v-for="item in blockedItems"
            :key="`blocked-${item.parsedMatch.id}-${item.parsedMatch.matchTime}`"
            class="bg-white border border-red-100 rounded-lg p-3 mb-2 shadow-sm"
          >
            <div class="flex flex-wrap gap-2 mb-2">
              <span class="text-[10px] font-black tracking-widest bg-red-100 text-red-700 px-2 py-1 rounded-full">
                CHECK
              </span>
              <span v-if="item.action !== 'create'" class="text-[10px] bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                {{ getExistingMatchLabel(item.existingMatchId) }}
              </span>
            </div>
            <h5 class="font-bold text-gray-900 leading-tight">{{ getItemTitle(item) }}</h5>
            <p class="text-sm text-gray-600 mt-1">對手：{{ getItemOpponent(item) }}</p>
            <p class="text-xs text-gray-500 mt-1">
              {{ getItemDate(item) }}<span v-if="getItemTime(item)"> ・ {{ getItemTime(item) }}</span>
            </p>
            <p v-if="Number(item.payload.match_fee_amount || 0) > 0" class="text-xs font-black text-amber-700 mt-1">
              比賽費用：{{ formatCurrency(item.payload.match_fee_amount || 0) }} / 人
            </p>
            <div class="mt-3 space-y-1">
              <p
                v-for="issue in item.validationIssues"
                :key="issue.message"
                class="text-xs font-bold"
                :class="getIssueClass(issue.severity)"
              >
                {{ issue.message }}
              </p>
            </div>
            <div v-if="item.scheduleDiffs.length" class="mt-3 rounded-lg bg-red-50/70 border border-red-100 p-2">
              <div v-for="diff in item.scheduleDiffs" :key="`${diff.field}-${diff.after}`" class="text-xs text-red-800">
                {{ diff.label }}：{{ diff.before }} → {{ diff.after }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="createItems.length > 0" class="border border-green-100 rounded-xl overflow-hidden">
        <div class="bg-green-50 px-4 py-3 border-b border-green-100">
          <h4 class="font-extrabold text-sm text-green-800">準備新增的賽事 ({{ createItems.length }})</h4>
        </div>

        <div class="max-h-[260px] overflow-y-auto custom-scrollbar p-2 bg-green-50/30">
          <div
            v-for="item in createItems"
            :key="`create-${item.parsedMatch.id}-${item.parsedMatch.matchTime}`"
            class="bg-white border border-green-100 rounded-lg p-3 mb-2 shadow-sm"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <div class="flex flex-wrap gap-2 mb-2">
                  <span class="text-[10px] font-black tracking-widest bg-green-100 text-green-700 px-2 py-1 rounded-full">
                    CREATE
                  </span>
                  <span v-if="item.parsedMatch.category" class="text-[10px] bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                    {{ item.parsedMatch.category }}
                  </span>
                  <span v-if="item.parsedMatch.level" class="text-[10px] bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                    {{ item.parsedMatch.level }}
                  </span>
                </div>
                <h5 class="font-bold text-gray-900 leading-tight">{{ item.payload.match_name }}</h5>
                <p v-if="item.payload.tournament_name" class="text-sm text-gray-600 mt-1">
                  盃賽：{{ item.payload.tournament_name }}
                </p>
                <p class="text-sm text-gray-600 mt-1">對手：{{ item.payload.opponent }}</p>
                <p class="text-xs text-gray-500 mt-2">
                  {{ item.payload.match_date }}<span v-if="item.payload.match_time"> ・ {{ item.payload.match_time }}</span>
                </p>
                <p v-if="item.payload.location" class="text-xs text-gray-500 mt-1">{{ item.payload.location }}</p>
                <p v-if="Number(item.payload.match_fee_amount || 0) > 0" class="text-xs font-black text-amber-700 mt-1">
                  比賽費用：{{ formatCurrency(item.payload.match_fee_amount || 0) }} / 人
                </p>
                <p class="text-xs text-gray-500 mt-2">參賽球員：{{ getPlayerCheckSummary(item) }}</p>
                <div v-if="item.validationIssues.length" class="mt-2 space-y-1">
                  <p
                    v-for="issue in item.validationIssues"
                    :key="issue.message"
                    class="text-xs font-bold"
                    :class="getIssueClass(issue.severity)"
                  >
                    {{ issue.message }}
                  </p>
                </div>
                <div v-if="getReviewPlayers(item).length" class="mt-2 flex flex-wrap gap-1">
                  <span
                    v-for="player in getReviewPlayers(item)"
                    :key="`${player.sourceName}-${player.sourceNumber}`"
                    class="text-[11px] font-bold bg-red-50 text-red-700 border border-red-100 rounded px-2 py-0.5"
                  >
                    {{ player.sourceName }}{{ player.sourceNumber ? ` #${player.sourceNumber}` : '' }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div v-if="updateItems.length > 0" class="border border-amber-100 rounded-xl overflow-hidden">
        <div class="bg-amber-50 px-4 py-3 border-b border-amber-100">
          <h4 class="font-extrabold text-sm text-amber-800">準備更新的賽事 ({{ updateItems.length }})</h4>
        </div>

        <div class="max-h-[320px] overflow-y-auto custom-scrollbar p-2 bg-amber-50/30">
          <div
            v-for="item in updateItems"
            :key="`update-${item.existingMatchId}-${item.parsedMatch.id}`"
            class="bg-white border border-amber-100 rounded-lg p-3 mb-2 shadow-sm"
          >
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <div class="flex flex-wrap gap-2 mb-2">
                  <span class="text-[10px] font-black tracking-widest bg-amber-100 text-amber-700 px-2 py-1 rounded-full">
                    UPDATE
                  </span>
                  <span v-if="item.parsedMatch.category" class="text-[10px] bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                    {{ item.parsedMatch.category }}
                  </span>
                  <span v-if="item.parsedMatch.level" class="text-[10px] bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                    {{ item.parsedMatch.level }}
                  </span>
                </div>
                <h5 class="font-bold text-gray-900 leading-tight">{{ item.payload.match_name }}</h5>
                <p v-if="item.payload.tournament_name" class="text-sm text-gray-600 mt-1">
                  盃賽：{{ item.payload.tournament_name }}
                </p>
                <p class="text-sm text-gray-600 mt-1">對手：{{ item.payload.opponent }}</p>
                <p class="text-xs text-amber-700 mt-2 font-medium">
                  只更新排程欄位：{{ getExistingMatchLabel(item.existingMatchId) }}
                </p>
                <p class="text-xs text-gray-500 mt-1">
                  {{ item.payload.match_date }}<span v-if="item.payload.match_time"> ・ {{ item.payload.match_time }}</span>
                </p>
                <p v-if="item.payload.location" class="text-xs text-gray-500 mt-1">{{ item.payload.location }}</p>
                <p v-if="Number(item.payload.match_fee_amount || 0) > 0" class="text-xs font-black text-amber-700 mt-1">
                  比賽費用：{{ formatCurrency(item.payload.match_fee_amount || 0) }} / 人
                </p>
                <div v-if="item.scheduleDiffs.length" class="mt-3 rounded-lg bg-amber-50/70 border border-amber-100 p-2">
                  <div v-for="diff in item.scheduleDiffs" :key="`${diff.field}-${diff.after}`" class="text-xs text-amber-800">
                    {{ diff.label }}：{{ diff.before }} → {{ diff.after }}
                  </div>
                </div>
                <p class="text-xs text-gray-500 mt-2">參賽球員：{{ getPlayerCheckSummary(item) }}</p>
                <div v-if="item.validationIssues.length" class="mt-2 space-y-1">
                  <p
                    v-for="issue in item.validationIssues"
                    :key="issue.message"
                    class="text-xs font-bold"
                    :class="getIssueClass(issue.severity)"
                  >
                    {{ issue.message }}
                  </p>
                </div>
                <div v-if="getReviewPlayers(item).length" class="mt-2 flex flex-wrap gap-1">
                  <span
                    v-for="player in getReviewPlayers(item)"
                    :key="`${player.sourceName}-${player.sourceNumber}`"
                    class="text-[11px] font-bold bg-red-50 text-red-700 border border-red-100 rounded px-2 py-0.5"
                  >
                    {{ player.sourceName }}{{ player.sourceNumber ? ` #${player.sourceNumber}` : '' }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="flex items-center justify-between border-t border-gray-100 pt-4 -mx-4 px-4 bg-gray-50 rounded-b-2xl">
        <span class="text-xs text-gray-400 font-bold">既有紀錄不會被刪除；更新時不覆蓋比數、照片與賽後紀錄。</span>
        <div class="flex gap-2">
          <el-button class="!rounded-xl" @click="visible = false">取消</el-button>
          <el-button
            type="primary"
            class="!rounded-xl font-bold shadow-md shadow-primary/30"
            :disabled="actionableItems.length === 0"
            :loading="isSaving"
            @click="handleConfirmSync"
          >
            寫入同步 ({{ actionableItems.length }})
          </el-button>
        </div>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import {
  fetchAndParseICal,
  planCalendarSync,
  type CalendarSyncIssueSeverity,
  type CalendarSyncItem,
  type CalendarSyncPlayerCheckItem,
  type CalendarSyncRosterMember
} from '@/utils/googleCalendarParser'
import { useMatchesStore } from '@/stores/matches'
import { supabase } from '@/services/supabase'

const props = defineProps<{ modelValue: boolean }>()
const emit = defineEmits<{ (e: 'update:modelValue', value: boolean): void }>()

const visible = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

const matchesStore = useMatchesStore()
const calendarUrl = ref('https://calendar.google.com/calendar/ical/jg.baseball.bear%40gmail.com/public/basic.ics')
const isFetching = ref(false)
const hasFetched = ref(false)
const isSaving = ref(false)
const syncItems = ref<CalendarSyncItem[]>([])
const rosterMembers = ref<CalendarSyncRosterMember[]>([])

const isCreateItem = (item: CalendarSyncItem): item is Extract<CalendarSyncItem, { action: 'create' }> =>
  item.action === 'create'
const isUpdateItem = (item: CalendarSyncItem): item is Extract<CalendarSyncItem, { action: 'update' }> =>
  item.action === 'update'
const isActionableItem = (item: CalendarSyncItem): item is Extract<CalendarSyncItem, { action: 'create' | 'update' }> =>
  item.action !== 'skip' && !item.isBlocked

const actionableItems = computed(() => syncItems.value.filter(isActionableItem))
const createItems = computed(() => syncItems.value.filter((item) => isCreateItem(item) && !item.isBlocked))
const updateItems = computed(() => syncItems.value.filter((item) => isUpdateItem(item) && !item.isBlocked))
const blockedItems = computed(() => syncItems.value.filter((item) => item.isBlocked))

const getIssueClass = (severity: CalendarSyncIssueSeverity) =>
  severity === 'blocking' ? 'text-red-700' : 'text-amber-700'

const getReviewPlayers = (item: CalendarSyncItem): CalendarSyncPlayerCheckItem[] =>
  item.playerCheck.items.filter((player) => player.status === 'needs_review').slice(0, 6)

const getPlayerCheckSummary = (item: CalendarSyncItem) => {
  const { total, matched, needsReview } = item.playerCheck
  if (total === 0) return '未填'
  const reviewText = needsReview > 0 ? `，待確認 ${needsReview} 位` : ''
  return `共 ${total} 位，已比對 ${matched} 位${reviewText}`
}

const getItemTitle = (item: CalendarSyncItem) =>
  item.payload.match_name || item.parsedMatch.matchName || item.parsedMatch.title || '未命名賽事'

const getItemOpponent = (item: CalendarSyncItem) =>
  item.payload.opponent || item.parsedMatch.opponent || '待確認'

const getItemDate = (item: CalendarSyncItem) =>
  item.payload.match_date || item.parsedMatch.date || '日期待確認'

const getItemTime = (item: CalendarSyncItem) =>
  item.payload.match_time || item.parsedMatch.matchTime || ''

const formatCurrency = (amount: number) => new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0
}).format(Number(amount) || 0)

const ensureMatchesLoaded = async () => {
  if (matchesStore.matches.length === 0 && !matchesStore.loading) {
    await matchesStore.fetchMatches()
  }
}

const fetchRosterMembers = async () => {
  const { data, error } = await supabase
    .from('team_members_safe')
    .select('id, name, role, status, jersey_number')
    .in('role', ['球員', '校隊'])
    .order('name', { ascending: true })

  if (error) throw error
  rosterMembers.value = data || []
}

const getExistingMatchLabel = (matchId: string | null) => {
  if (!matchId) return '未命名紀錄'
  const match = matchesStore.matches.find((item) => item.id === matchId)
  if (!match) return '既有紀錄'
  return `${match.match_name} (${match.match_date}${match.match_time ? ` ${match.match_time}` : ''})`
}

const handleFetch = async () => {
  if (!calendarUrl.value) {
    ElMessage.warning('請先輸入 iCal 連結')
    return
  }

  isFetching.value = true
  hasFetched.value = false
  syncItems.value = []

  try {
    await Promise.all([
      ensureMatchesLoaded(),
      fetchRosterMembers()
    ])
    const parsedMatches = await fetchAndParseICal(calendarUrl.value)
    syncItems.value = planCalendarSync(matchesStore.matches, parsedMatches, {
      rosterMembers: rosterMembers.value
    })
    hasFetched.value = true

    if (actionableItems.value.length === 0) {
      ElMessage.info(blockedItems.value.length > 0 ? '有賽事需要先檢查，尚無可直接寫入的變更' : '目前沒有可同步的變更')
      return
    }

    ElMessage.success(`解析完成：新增 ${createItems.value.length} 筆，更新 ${updateItems.value.length} 筆，需檢查 ${blockedItems.value.length} 筆`)
  } catch (error: any) {
    ElMessage.error(`解析失敗：${error.message}`)
  } finally {
    isFetching.value = false
  }
}

const handleConfirmSync = async () => {
  if (actionableItems.value.length === 0) return

  isSaving.value = true

  try {
    let createdCount = 0
    let updatedCount = 0

    for (const item of actionableItems.value) {
      if (item.action === 'create') {
        await matchesStore.createMatch(item.payload)
        createdCount += 1
        continue
      }

      if (item.action === 'update' && item.existingMatchId) {
        await matchesStore.updateMatch(item.existingMatchId, item.payload)
        updatedCount += 1
      }
    }

    await matchesStore.fetchMatches()
    ElMessage.success(`同步完成：新增 ${createdCount} 筆，更新 ${updatedCount} 筆`)
    visible.value = false
  } catch (error: any) {
    ElMessage.error(`同步失敗：${error.message}`)
  } finally {
    isSaving.value = false
  }
}
</script>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: #e5e7eb;
  border-radius: 999px;
}
</style>
