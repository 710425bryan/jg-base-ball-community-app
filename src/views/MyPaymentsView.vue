<template>
  <div class="h-full flex flex-col relative animate-fade-in bg-gray-50 text-text overflow-hidden">
    <div class="bg-white px-4 md:px-6 py-4 border-b border-gray-200 shadow-sm shrink-0">
      <div class="max-w-6xl mx-auto flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <AppPageHeader
          title="繳費資訊"
          subtitle="查看關聯成員的月繳 / 季繳、比賽費用與裝備付款狀態"
          :icon="Wallet"
          as="h2"
        >
          <template #actions>
            <button
              type="button"
              class="flex-1 sm:flex-none rounded-2xl border border-gray-200 text-gray-600 hover:text-gray-800 hover:border-gray-300 font-bold px-4 py-3 transition-colors"
              :disabled="isRefreshing"
              @click="refreshCurrentMemberData"
            >
              {{ isRefreshing ? '更新中...' : '重新整理' }}
            </button>

            <button
              type="button"
              class="flex-1 sm:flex-none rounded-2xl bg-primary hover:bg-primary-hover text-white font-bold px-5 py-3 transition-colors disabled:opacity-70"
              :disabled="!canCreateSubmissionForSelectedMember || isRefreshing"
              @click="openCreateDialog"
            >
              新增月費 / 季費
            </button>
          </template>
        </AppPageHeader>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto min-h-0 p-4 md:p-6 pb-[calc(4.5rem+env(safe-area-inset-bottom)+20px)] md:pb-6 custom-scrollbar">
      <AppLoadingState v-if="isBootstrapping" text="讀取繳費資訊中..." min-height="50vh" />

      <div v-else class="max-w-6xl mx-auto flex flex-col gap-4">
        <section
          v-if="members.length === 0"
          class="bg-white rounded-3xl border border-gray-100 shadow-sm p-8 md:p-10 text-center"
        >
          <div class="text-xl font-black text-slate-800">目前沒有可查看的繳費成員</div>
          <p class="mt-3 text-sm text-gray-500 leading-relaxed">
            你的帳號尚未綁定球員或校隊成員，若需要查看繳費資訊，請請管理員先完成綁定。
          </p>
        </section>

        <template v-else>
          <section class="bg-white rounded-3xl border border-gray-100 shadow-sm p-5 md:p-6">
            <div class="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div class="w-full lg:max-w-md">
                <label class="text-xs font-bold uppercase tracking-[0.18em] text-gray-400">查看成員</label>
                <el-select
                  v-model="selectedMemberId"
                  class="w-full mt-2"
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
                <p class="mt-2 text-xs text-gray-400">
                  {{ memberSelectorHelperText }}
                </p>
              </div>

              <div
                v-if="selectedMember"
                class="rounded-2xl border border-primary/15 bg-primary/5 px-4 py-3 text-sm text-primary font-bold"
              >
                目前模式：{{ getPaymentMemberBillingLabel(selectedMember) }} / {{ selectedMember.role }}
              </div>
            </div>

            <p
              v-if="createSubmissionAccessHint"
              class="mt-4 rounded-2xl border border-amber-100 bg-amber-50/80 px-4 py-3 text-sm font-bold text-amber-700"
            >
              {{ createSubmissionAccessHint }}
            </p>
          </section>

          <PaymentAccountInfoCard />

          <div v-if="selectedMember" class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <section class="bg-white rounded-3xl border border-gray-100 shadow-sm p-5">
              <div class="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-400">當前成員</div>
              <div class="mt-3 text-xl font-black text-slate-800">{{ selectedMember.name }}</div>
              <p class="mt-2 text-sm font-bold text-primary">
                {{ selectedMember.role }}｜{{ getPaymentMemberBillingLabel(selectedMember) }}
              </p>
            </section>

            <section class="bg-white rounded-3xl border border-gray-100 shadow-sm p-5">
              <div class="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-400">最近一期狀態</div>
              <div v-if="latestOfficialRecord" class="mt-3">
                <div class="text-xl font-black text-slate-800">{{ latestOfficialRecord.period_label }}</div>
                <span :class="getStatusPillClass(latestOfficialRecord.status)" class="inline-flex mt-3 rounded-full px-3 py-1 text-xs font-bold border">
                  {{ getStatusLabel(latestOfficialRecord.status) }}
                </span>
              </div>
              <p v-else class="mt-3 text-sm text-gray-400 leading-relaxed">目前還沒有正式的繳費資料。</p>
            </section>

            <section class="bg-white rounded-3xl border border-gray-100 shadow-sm p-5">
              <div class="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-400">我的常用回報資訊</div>
              <div class="mt-3 text-xl font-black text-slate-800">
                {{ authStore.profile?.preferred_payment_method || '尚未設定' }}
              </div>
              <p class="mt-2 text-sm text-gray-500">
                帳號後五碼：{{ authStore.profile?.preferred_account_last_5 || '未設定' }}
              </p>
            </section>

            <section class="bg-white rounded-3xl border border-gray-100 shadow-sm p-5">
              <div class="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-400">最近送出回報</div>
              <div v-if="latestSubmission" class="mt-3">
                <div class="text-xl font-black text-slate-800">{{ latestSubmission.period_label }}</div>
                <span :class="getStatusPillClass(latestSubmission.status)" class="inline-flex mt-3 rounded-full px-3 py-1 text-xs font-bold border">
                  {{ getStatusLabel(latestSubmission.status) }}
                </span>
              </div>
              <p v-else class="mt-3 text-sm text-gray-400 leading-relaxed">你目前還沒有送出新的付款回報。</p>
            </section>
          </div>

          <section class="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
            <div class="px-5 md:px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
              <div>
                <h3 class="text-lg font-black text-slate-800">正式繳費紀錄</h3>
                <p class="text-xs text-gray-400 mt-1">資料來自現有月費 / 季費正式結算紀錄</p>
              </div>
              <div v-if="selectedMember" class="text-sm font-bold text-gray-500">
                {{ getPaymentMemberBillingLabel(selectedMember) }}
              </div>
            </div>

            <div v-if="isRefreshing" class="p-6 text-sm text-gray-400 font-bold">
              讀取最新繳費紀錄中...
            </div>

            <div v-else-if="records.length === 0" class="p-6 text-sm text-gray-400 font-bold">
              目前沒有正式繳費紀錄。
            </div>

            <template v-else>
              <div class="grid gap-3 p-4 sm:hidden">
                <article
                  v-for="record in records"
                  :key="`mobile-${record.period_key}-${record.updated_at || 'na'}`"
                  class="rounded-2xl border border-gray-100 bg-gray-50/80 p-4"
                >
                  <div class="flex items-start justify-between gap-3">
                    <div class="min-w-0">
                      <div class="text-lg font-black text-slate-800">{{ record.period_label }}</div>
                      <div class="mt-1 text-sm font-bold text-gray-500">{{ record.period_key }}</div>
                    </div>
                    <span :class="getStatusPillClass(record.status)" class="shrink-0 rounded-full px-3 py-1 text-sm font-bold border">
                      {{ getStatusLabel(record.status) }}
                    </span>
                  </div>

                  <div class="mt-4 rounded-2xl bg-white px-4 py-3">
                    <div class="text-sm font-bold text-gray-500">金額</div>
                    <div class="mt-1 font-mono text-xl font-black text-primary">{{ formatCurrency(record.amount) }}</div>
                    <div class="mt-1 text-sm font-bold text-gray-500">
                      {{ buildPaymentBreakdownText(record.amount, record.balance_amount, formatCurrency) }}
                    </div>
                  </div>

                  <div class="mt-4 grid gap-3 text-sm font-bold text-gray-600">
                    <div>
                      <div class="text-gray-400">匯款資訊</div>
                      <div class="mt-1">{{ formatPaymentInfo(record.payment_method, record.account_last_5, record.remittance_date) }}</div>
                    </div>
                    <div>
                      <div class="text-gray-400">最後更新</div>
                      <div class="mt-1">{{ formatDateTime(record.updated_at) }}</div>
                    </div>
                  </div>
                </article>
              </div>

              <div class="hidden overflow-x-auto sm:block">
                <table class="w-full min-w-[760px]">
                  <thead>
                    <tr class="bg-gray-50/80 border-b border-gray-100">
                      <th class="py-3 px-5 text-left text-sm font-bold text-gray-500 whitespace-nowrap">期別</th>
                      <th class="py-3 px-5 text-left text-sm font-bold text-gray-500 whitespace-nowrap">金額</th>
                      <th class="py-3 px-5 text-left text-sm font-bold text-gray-500 whitespace-nowrap">狀態</th>
                      <th class="py-3 px-5 text-left text-sm font-bold text-gray-500 whitespace-nowrap">匯款資訊</th>
                      <th class="py-3 px-5 text-left text-sm font-bold text-gray-500 whitespace-nowrap">最後更新</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-gray-100">
                    <tr v-for="record in records" :key="`${record.period_key}-${record.updated_at || 'na'}`" class="hover:bg-gray-50/60 transition-colors">
                      <td class="py-4 px-5">
                        <div class="font-black text-slate-800">{{ record.period_label }}</div>
                        <div class="text-xs text-gray-400 mt-1">{{ record.period_key }}</div>
                      </td>
                      <td class="py-4 px-5">
                        <div class="font-mono font-black text-primary">{{ formatCurrency(record.amount) }}</div>
                        <div class="mt-1 text-xs font-bold text-gray-400">
                          {{ buildPaymentBreakdownText(record.amount, record.balance_amount, formatCurrency) }}
                        </div>
                      </td>
                      <td class="py-4 px-5">
                        <span :class="getStatusPillClass(record.status)" class="inline-flex rounded-full px-3 py-1 text-xs font-bold border">
                          {{ getStatusLabel(record.status) }}
                        </span>
                      </td>
                      <td class="py-4 px-5 text-sm text-gray-600">
                        {{ formatPaymentInfo(record.payment_method, record.account_last_5, record.remittance_date) }}
                      </td>
                      <td class="py-4 px-5 text-sm text-gray-500">{{ formatDateTime(record.updated_at) }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </template>
          </section>

          <section class="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
            <div class="px-5 md:px-6 py-4 border-b border-gray-100 flex items-center justify-between gap-3">
              <div>
                <h3 class="text-lg font-black text-slate-800">{{ submissionsSectionTitle }}</h3>
                <p class="text-xs text-gray-400 mt-1">{{ submissionsSectionDescription }}</p>
              </div>
              <button
                type="button"
                class="rounded-2xl bg-gray-900 hover:bg-black text-white font-bold px-4 py-2 transition-colors disabled:opacity-70"
                :disabled="!canCreateSubmissionForSelectedMember"
                @click="openCreateDialog"
              >
                新增月費 / 季費
              </button>
            </div>

            <div v-if="isRefreshing" class="p-6 text-sm text-gray-400 font-bold">
              讀取付款回報中...
            </div>

            <div v-else-if="submissions.length === 0" class="p-6 text-sm text-gray-400 font-bold">
              目前還沒有自助付款回報。
            </div>

            <div v-else class="p-4 md:p-5 grid gap-3 md:grid-cols-2">
              <article
                v-for="submission in submissions"
                :key="submission.id"
                class="rounded-2xl border border-gray-100 bg-gray-50/70 p-4 shadow-sm"
              >
                <div class="flex items-start justify-between gap-3">
                  <div>
                    <div class="text-lg font-black text-slate-800">{{ submission.period_label }}</div>
                    <div class="text-xs text-gray-400 mt-1">{{ submission.member_name }}</div>
                  </div>
                  <span :class="getStatusPillClass(submission.status)" class="inline-flex rounded-full px-3 py-1 text-xs font-bold border whitespace-nowrap">
                    {{ getStatusLabel(submission.status) }}
                  </span>
                </div>

                <div class="mt-4 grid gap-2 text-sm text-gray-600">
                  <div class="flex items-center justify-between gap-3">
                    <span class="text-gray-400">金額</span>
                    <span class="font-black text-primary">{{ formatCurrency(submission.amount) }}</span>
                  </div>
                  <div class="flex items-center justify-between gap-3">
                    <span class="text-gray-400">扣款拆分</span>
                    <span class="font-bold text-right">{{ buildPaymentBreakdownText(submission.amount, submission.balance_amount, formatCurrency) }}</span>
                  </div>
                  <div class="flex items-center justify-between gap-3">
                    <span class="text-gray-400">匯款資訊</span>
                    <span class="font-bold text-right">{{ formatPaymentInfo(submission.payment_method, submission.account_last_5, submission.remittance_date) }}</span>
                  </div>
                  <div class="flex items-center justify-between gap-3">
                    <span class="text-gray-400">送出時間</span>
                    <span class="font-medium text-right">{{ formatDateTime(submission.created_at) }}</span>
                  </div>
                </div>

                <p v-if="submission.note" class="mt-3 text-sm text-gray-500 leading-relaxed border-t border-gray-200 pt-3">
                  {{ submission.note }}
                </p>
              </article>
            </div>
          </section>

          <MyEquipmentPaymentsPanel :member-id="selectedMemberId" />

          <MyMatchFeesPanel :member-id="selectedMemberId" />
        </template>
      </div>
    </div>

    <el-dialog
      v-model="isCreateDialogOpen"
      title="新增月費 / 季費"
      width="90%"
      style="max-width: 560px; border-radius: 16px;"
      destroy-on-close
    >
      <el-form ref="formRef" :model="submissionForm" :rules="submissionRules" label-position="top" class="space-y-4">
        <el-form-item label="成員" prop="member_id" class="font-bold">
          <el-select v-model="submissionForm.member_id" class="w-full" size="large" :disabled="linkedMembers.length === 1">
            <el-option
              v-for="member in linkedMembers"
              :key="member.member_id"
              :label="buildMemberOptionLabel(member)"
              :value="member.member_id"
            />
          </el-select>
        </el-form-item>

        <div class="grid gap-4 sm:grid-cols-2">
          <div class="rounded-2xl border border-gray-100 bg-gray-50/80 px-4 py-3">
            <div class="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-400">繳費類型</div>
            <div class="mt-2 text-base font-black text-slate-800">{{ createDialogBillingModeLabel }}</div>
          </div>

          <div class="rounded-2xl border border-gray-100 bg-gray-50/80 px-4 py-3">
            <div class="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-400">期別格式</div>
            <div class="mt-2 text-base font-black text-slate-800">{{ createDialogPeriodHint }}</div>
          </div>
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <el-form-item label="期別" prop="period_key" class="font-bold">
            <el-date-picker
              v-if="createDialogMember?.billing_mode === 'monthly'"
              v-model="selectedMonthlyPeriod"
              type="month"
              value-format="YYYY-MM"
              class="!w-full"
              size="large"
              placeholder="請選擇月份"
            />
            <el-select
              v-else
              v-model="submissionForm.period_key"
              class="w-full"
              size="large"
              placeholder="請選擇季度"
            >
              <el-option
                v-for="option in quarterPeriodOptions"
                :key="option.value"
                :label="option.label"
                :value="option.value"
              />
            </el-select>
          </el-form-item>

          <el-form-item label="金額" prop="amount" class="font-bold">
            <el-input-number
              v-model="submissionForm.amount"
              class="!w-full"
              :min="0"
              :step="100"
              size="large"
            />
            <p class="mt-1 text-xs text-gray-400">
              {{ isEstimatingAmount ? '依期別重新計算中...' : createDialogEstimateHelperText }}
            </p>
            <p v-if="createDialogMonthlyStatsText" class="mt-1 text-xs font-bold text-amber-600">
              {{ createDialogMonthlyStatsText }}
            </p>
            <p v-if="createDialogMonthlyFormulaText" class="mt-1 text-xs text-gray-500">
              {{ createDialogMonthlyFormulaText }}
            </p>
          </el-form-item>
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <div class="rounded-2xl border border-emerald-100 bg-emerald-50/80 px-4 py-3">
            <div class="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-600">目前餘額</div>
            <div class="mt-2 text-xl font-black text-emerald-700">{{ formatCurrency(createDialogAvailableBalance) }}</div>
            <p class="mt-1 text-xs font-bold text-emerald-600/80">送出後待管理員確認，確認時才會正式扣款。</p>
          </div>

          <el-form-item label="使用餘額扣抵" prop="balance_amount" class="font-bold">
            <el-input-number
              v-model="submissionForm.balance_amount"
              class="!w-full"
              :min="0"
              :max="Math.min(createDialogAvailableBalance, Number(submissionForm.amount) || 0)"
              :step="100"
              size="large"
            />
            <p class="mt-1 text-xs text-gray-500">{{ createDialogPaymentBreakdownText }}</p>
          </el-form-item>
        </div>

        <PaymentAccountInfoCard compact class="mb-4" />

        <div class="grid gap-4 sm:grid-cols-2">
          <el-form-item label="匯款方式" prop="payment_method" class="font-bold">
            <el-select
              v-model="submissionForm.payment_method"
              class="w-full"
              size="large"
              placeholder="請選擇匯款方式"
              :disabled="!isExternalPaymentRequired"
              @change="handleSubmissionPaymentMethodChange"
            >
              <el-option
                v-for="option in paymentMethodOptions"
                :key="option"
                :label="option"
                :value="option"
              />
            </el-select>
          </el-form-item>

          <el-form-item label="匯款帳號後五碼" prop="account_last_5" class="font-bold">
            <el-input
              :model-value="submissionForm.account_last_5"
              size="large"
              maxlength="5"
              :disabled="!submissionRequiresAccountLast5"
              placeholder="請輸入後五碼"
              @input="handleSubmissionAccountLast5Input"
            />
          </el-form-item>
        </div>

        <div class="grid gap-4 sm:grid-cols-2">
          <el-form-item label="匯款日期" prop="remittance_date" class="font-bold">
            <el-date-picker
              v-model="submissionForm.remittance_date"
              type="date"
              value-format="YYYY-MM-DD"
              class="!w-full"
              size="large"
              :disabled="!isExternalPaymentRequired"
            />
          </el-form-item>

          <div class="rounded-2xl border border-amber-100 bg-amber-50/80 px-4 py-3 text-sm text-amber-700 leading-relaxed">
            送出後會先進入待確認狀態；若使用餘額，管理員確認時才會正式扣款。
          </div>
        </div>

        <el-form-item label="備註" prop="note" class="font-bold">
          <el-input
            v-model="submissionForm.note"
            type="textarea"
            :rows="3"
            maxlength="120"
            show-word-limit
            placeholder="可補充轉帳說明或款項用途"
          />
        </el-form-item>
      </el-form>

      <template #footer>
        <div class="flex justify-end gap-3 mt-4">
          <button
            type="button"
            class="rounded-2xl border border-gray-200 text-gray-600 hover:text-gray-800 hover:border-gray-300 font-bold px-5 py-3 transition-colors"
            @click="isCreateDialogOpen = false"
          >
            取消
          </button>

          <button
            type="button"
            class="rounded-2xl bg-primary hover:bg-primary-hover text-white font-bold px-6 py-3 transition-colors disabled:opacity-70"
            :disabled="isSubmitting"
            @click="submitPaymentSubmission"
          >
            {{ isSubmitting ? '送出中...' : '送出付款回報' }}
          </button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import dayjs from 'dayjs'
import { ElMessage } from 'element-plus'
import { Wallet } from '@element-plus/icons-vue'
import AppLoadingState from '@/components/common/AppLoadingState.vue'
import AppPageHeader from '@/components/common/AppPageHeader.vue'
import MyEquipmentPaymentsPanel from '@/components/equipment/MyEquipmentPaymentsPanel.vue'
import MyMatchFeesPanel from '@/components/fees/MyMatchFeesPanel.vue'
import PaymentAccountInfoCard from '@/components/payments/PaymentAccountInfoCard.vue'
import {
  createMyPaymentSubmission,
  getMyPaymentRecords,
  listMyPaymentMembers,
  listMyPaymentSubmissions,
  getMyPaymentSubmissionEstimate
} from '@/services/myPayments'
import { useAuthStore } from '@/stores/auth'
import type {
  CreateMyPaymentSubmissionPayload,
  MyPaymentMember,
  MyPaymentRecord,
  MyPaymentSubmissionEstimate,
  MyPaymentSubmission
} from '@/types/payments'
import {
  BALANCE_PAYMENT_METHOD,
  normalizeAccountLast5,
  PAYMENT_METHOD_OPTIONS,
  requiresAccountLast5
} from '@/utils/paymentMethods'
import {
  buildPaymentBreakdownText,
  clampBalanceDeduction,
  getExternalPaymentAmount
} from '@/utils/playerBalance'
import { getMemberBillingLabel } from '@/utils/memberBilling'
import { buildPushEventKey, dispatchPushNotification } from '@/utils/pushNotifications'

const authStore = useAuthStore()

const members = ref<MyPaymentMember[]>([])
const records = ref<MyPaymentRecord[]>([])
const submissions = ref<MyPaymentSubmission[]>([])
const selectedMemberId = ref('')
const isBootstrapping = ref(true)
const isRefreshing = ref(false)
const isCreateDialogOpen = ref(false)
const isSubmitting = ref(false)
const isEstimatingAmount = ref(false)
const currentSubmissionEstimate = ref<MyPaymentSubmissionEstimate | null>(null)
const formRef = ref()

const paymentMethodOptions = PAYMENT_METHOD_OPTIONS

const submissionForm = reactive<CreateMyPaymentSubmissionPayload>({
  member_id: '',
  period_key: '',
  amount: 0,
  balance_amount: 0,
  payment_method: '',
  account_last_5: '',
  remittance_date: dayjs().format('YYYY-MM-DD'),
  note: ''
})

const selectedMember = computed(() => {
  return members.value.find((member) => member.member_id === selectedMemberId.value) || null
})

const linkedMembers = computed(() => {
  return members.value.filter((member) => member.is_linked !== false)
})

const createDialogMember = computed(() => {
  return members.value.find((member) => member.member_id === submissionForm.member_id) || selectedMember.value
})

const latestOfficialRecord = computed(() => records.value[0] || null)
const latestSubmission = computed(() => submissions.value[0] || null)
const createDialogAvailableBalance = computed(() => Number(createDialogMember.value?.balance_amount || 0))
const createDialogExternalPaymentAmount = computed(() =>
  getExternalPaymentAmount(submissionForm.amount, submissionForm.balance_amount)
)
const isExternalPaymentRequired = computed(() => createDialogExternalPaymentAmount.value > 0)
const submissionRequiresAccountLast5 = computed(() =>
  isExternalPaymentRequired.value && requiresAccountLast5(submissionForm.payment_method)
)
const isViewingUnlinkedMember = computed(() => selectedMember.value?.is_linked === false)
const canCreateSubmissionForSelectedMember = computed(() => {
  return Boolean(selectedMember.value) && selectedMember.value?.is_linked !== false && linkedMembers.value.length > 0
})
const selectedMonthlyPeriod = computed({
  get: () => (createDialogMember.value?.billing_mode === 'monthly' ? submissionForm.period_key : ''),
  set: (value: string) => {
    submissionForm.period_key = value || ''
  }
})

const createDialogBillingModeLabel = computed(() => {
  return createDialogMember.value ? getPaymentMemberBillingLabel(createDialogMember.value) : '尚未選擇'
})

const createDialogPeriodHint = computed(() => {
  return createDialogMember.value?.billing_mode === 'quarterly' ? '例如 2026-Q2' : '例如 2026-04'
})

const createDialogEstimateHelperText = computed(() => {
  if (!createDialogMember.value) {
    return '請先選擇成員與期別。'
  }

  if (createDialogMember.value.billing_mode === 'monthly') {
    return createDialogMember.value.role === '球員'
      ? '社區固定月繳會依收費設定的固定金額與既有月費扣減自動帶入金額。'
      : '校隊月繳會依校隊收費設定、請假天數與既有月費扣減自動帶入金額。'
  }

  return '球員季繳目前會先帶入該季度既有金額，若尚無資料可再手動調整。'
})

const memberSelectorHelperText = computed(() => {
  if (authStore.profile?.role === 'ADMIN') {
    return '預設會先顯示你的關聯成員；管理員也可以切換查看其他球員的繳費紀錄。'
  }

  return '切換不同綁定成員時，頁面會同步改成對應的月繳或季繳模式。'
})

const createSubmissionAccessHint = computed(() => {
  if (!isViewingUnlinkedMember.value) {
    return ''
  }

  if (linkedMembers.value.length === 0) {
    return '你目前是以管理員身分查看其他球員，因帳號沒有綁定成員，所以只能檢視紀錄，不能從這裡新增繳費。'
  }

  return '你目前正在查看其他球員的紀錄。管理員可切換檢視，但新增繳費仍只開放自己的關聯成員。'
})

const createDialogMonthlyStatsText = computed(() => {
  if (createDialogMember.value?.billing_mode !== 'monthly') {
    return ''
  }

  const estimate = currentSubmissionEstimate.value

  if (
    !submissionForm.period_key
    || estimate?.leave_sessions == null
    || estimate?.total_sessions == null
  ) {
    return ''
  }

  return `${submissionForm.period_key} 本月堂數 ${estimate.total_sessions} 堂，請假 ${estimate.leave_sessions} 天`
})

const createDialogMonthlyFormulaText = computed(() => {
  if (createDialogMember.value?.billing_mode !== 'monthly') {
    return ''
  }

  const estimate = currentSubmissionEstimate.value

  if (
    !estimate
    || estimate.deduction_amount == null
  ) {
    return ''
  }

  if (estimate.calculation_type === 'monthly_fixed') {
    return `固定月繳 ${formatCurrency(estimate.fixed_monthly_fee || 0)}，扣減 ${formatCurrency(estimate.deduction_amount)}`
  }

  if (
    estimate.total_sessions == null
    || estimate.leave_sessions == null
    || estimate.per_session_fee == null
  ) {
    return ''
  }

  return `單堂 ${formatCurrency(estimate.per_session_fee)}，扣減 ${formatCurrency(estimate.deduction_amount)}`
})

const createDialogPaymentBreakdownText = computed(() =>
  buildPaymentBreakdownText(submissionForm.amount, submissionForm.balance_amount, formatCurrency)
)

const submissionsSectionTitle = computed(() => {
  return isViewingUnlinkedMember.value ? '球員付款回報' : '我的付款回報'
})

const submissionsSectionDescription = computed(() => {
  return isViewingUnlinkedMember.value
    ? '你目前正以管理員身分檢視該球員送出的自助回報。'
    : '這裡會顯示你從個人頁面送出的自助回報'
})

const quarterPeriodOptions = computed(() => {
  const quarterKeys = new Set<string>()
  const now = dayjs()

  for (let offset = -4; offset <= 4; offset += 1) {
    const cursor = now.add(offset * 3, 'month')
    quarterKeys.add(getCurrentQuarterKey(cursor))
  }

  records.value.forEach((record) => {
    if (record.billing_mode === 'quarterly' && record.period_key) {
      quarterKeys.add(record.period_key)
    }
  })

  submissions.value.forEach((submission) => {
    if (submission.billing_mode === 'quarterly' && submission.period_key) {
      quarterKeys.add(submission.period_key)
    }
  })

  return [...quarterKeys]
    .sort((left, right) => right.localeCompare(left))
    .map((periodKey) => ({
      label: periodKey,
      value: periodKey
    }))
})

const submissionRules = {
  member_id: [{ required: true, message: '請選擇成員', trigger: 'change' }],
  period_key: [
    { required: true, message: '請輸入期別', trigger: ['blur', 'change'] },
    {
      validator: (_rule: unknown, value: string, callback: (error?: Error) => void) => {
        const targetMember = createDialogMember.value

        if (!targetMember) {
          callback(new Error('請先選擇成員'))
          return
        }

        const normalizedValue = (value || '').trim().toUpperCase()
        const isValid = targetMember.billing_mode === 'quarterly'
          ? /^[0-9]{4}-Q[1-4]$/.test(normalizedValue)
          : /^[0-9]{4}-[0-9]{2}$/.test(normalizedValue)

        if (!isValid) {
          callback(new Error(targetMember.billing_mode === 'quarterly' ? '請輸入 YYYY-Q1 格式' : '請輸入 YYYY-MM 格式'))
          return
        }

        callback()
      },
      trigger: ['blur', 'change']
    }
  ],
  amount: [
    {
      validator: (_rule: unknown, value: number, callback: (error?: Error) => void) => {
        if (!Number.isFinite(Number(value)) || Number(value) <= 0) {
          callback(new Error('請輸入大於 0 的金額'))
          return
        }

        callback()
      },
      trigger: ['blur', 'change']
    }
  ],
  balance_amount: [
    {
      validator: (_rule: unknown, value: number, callback: (error?: Error) => void) => {
        const normalized = Number(value) || 0
        if (normalized < 0) {
          callback(new Error('餘額扣抵不能小於 0'))
          return
        }
        if (normalized > Number(submissionForm.amount || 0)) {
          callback(new Error('餘額扣抵不能超過本次金額'))
          return
        }
        if (normalized > createDialogAvailableBalance.value) {
          callback(new Error('餘額不足'))
          return
        }

        callback()
      },
      trigger: ['blur', 'change']
    }
  ],
  payment_method: [
    {
      validator: (_rule: unknown, value: string, callback: (error?: Error) => void) => {
        if (!isExternalPaymentRequired.value) {
          callback()
          return
        }

        if (!value) {
          callback(new Error('請選擇匯款方式'))
          return
        }

        callback()
      },
      trigger: 'change'
    }
  ],
  account_last_5: [
    {
      validator: (_rule: unknown, value: string, callback: (error?: Error) => void) => {
        if (!submissionRequiresAccountLast5.value) {
          callback()
          return
        }

        if (!/^\d{5}$/.test(value || '')) {
          callback(new Error('請輸入 5 位數字'))
          return
        }

        callback()
      },
      trigger: ['blur', 'change']
    }
  ],
  remittance_date: [
    {
      validator: (_rule: unknown, value: string, callback: (error?: Error) => void) => {
        if (!isExternalPaymentRequired.value || value) {
          callback()
          return
        }

        callback(new Error('請選擇匯款日期'))
      },
      trigger: 'change'
    }
  ]
}

const getCurrentQuarterKey = (date = dayjs()) => {
  const quarter = Math.floor(date.month() / 3) + 1
  return `${date.year()}-Q${quarter}`
}

const getDefaultMonthlyPeriodKey = () => dayjs().subtract(1, 'month').format('YYYY-MM')

const buildMemberOptionLabel = (member: MyPaymentMember) => {
  const scopeLabel = member.is_linked === false ? '管理員檢視' : '我的關聯'
  return `${member.name}｜${member.role}｜${getPaymentMemberBillingLabel(member)}｜${scopeLabel}`
}

const getPaymentMemberBillingLabel = (member: MyPaymentMember) =>
  getMemberBillingLabel({
    role: member.role,
    fee_billing_mode: member.role === '球員' && member.billing_mode === 'monthly'
      ? 'monthly_fixed'
      : 'role_default'
  })

const getStatusLabel = (status?: string | null) => {
  if (status === 'paid' || status === 'approved') return '已確認'
  if (status === 'pending_review') return '待確認'
  if (status === 'rejected') return '已退回'
  return '未繳 / 未確認'
}

const getStatusPillClass = (status?: string | null) => {
  if (status === 'paid' || status === 'approved') {
    return 'bg-emerald-50 border-emerald-200 text-emerald-700'
  }

  if (status === 'pending_review') {
    return 'bg-amber-50 border-amber-200 text-amber-700'
  }

  if (status === 'rejected') {
    return 'bg-red-50 border-red-200 text-red-700'
  }

  return 'bg-gray-50 border-gray-200 text-gray-600'
}

const formatCurrency = (amount: number) => {
  const normalizedAmount = Number(amount) || 0
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(normalizedAmount)
}

const formatDateTime = (value?: string | null) => {
  if (!value) return '尚無資料'
  const parsed = dayjs(value)
  return parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm') : '尚無資料'
}

const formatPaymentInfo = (
  paymentMethod?: string | null,
  accountLast5?: string | null,
  remittanceDate?: string | null
) => {
  const parts = [
    paymentMethod || '尚未提供方式',
    accountLast5 ? `#${accountLast5}` : null,
    remittanceDate || null
  ].filter(Boolean)

  return parts.length > 0 ? parts.join(' / ') : '尚未提供匯款資訊'
}

const resolveQuarterlyAmount = (periodKey: string) => {
  const exactOfficialRecord = records.value.find((record) => record.period_key === periodKey)
  if (exactOfficialRecord) {
    return Math.max(0, Number(exactOfficialRecord.amount) || 0)
  }

  const exactSubmission = submissions.value.find((submission) => submission.period_key === periodKey)
  if (exactSubmission) {
    return Math.max(0, Number(exactSubmission.amount) || 0)
  }

  return 0
}

const syncBalanceDeductionLimit = () => {
  submissionForm.balance_amount = clampBalanceDeduction(
    submissionForm.balance_amount,
    submissionForm.amount,
    createDialogAvailableBalance.value
  )
}

const refreshSubmissionEstimate = async () => {
  const targetMember = createDialogMember.value
  const normalizedPeriodKey = submissionForm.period_key?.trim().toUpperCase() || ''

  if (!targetMember || !normalizedPeriodKey) {
    currentSubmissionEstimate.value = null
    return
  }

  if (targetMember.billing_mode === 'quarterly') {
    currentSubmissionEstimate.value = null
    submissionForm.amount = resolveQuarterlyAmount(normalizedPeriodKey)
    syncBalanceDeductionLimit()
    return
  }

  isEstimatingAmount.value = true

  try {
    const estimate = await getMyPaymentSubmissionEstimate(targetMember.member_id, normalizedPeriodKey)

    if (!estimate) {
      currentSubmissionEstimate.value = null
      submissionForm.amount = 0
      syncBalanceDeductionLimit()
      return
    }

    currentSubmissionEstimate.value = estimate
    submissionForm.amount = Math.max(0, Number(estimate.amount) || 0)
    syncBalanceDeductionLimit()
  } catch (error: any) {
    currentSubmissionEstimate.value = null
    ElMessage.error(error?.message || '自動計算月繳金額失敗')
  } finally {
    isEstimatingAmount.value = false
  }
}

const hydrateSubmissionDefaults = () => {
  const preferredLinkedMember = linkedMembers.value.find((member) => member.member_id === selectedMember.value?.member_id)
    || linkedMembers.value[0]
    || null
  const targetMember = preferredLinkedMember
  const fallbackPeriodKey = targetMember?.billing_mode === 'quarterly'
    ? getCurrentQuarterKey()
    : getDefaultMonthlyPeriodKey()

  submissionForm.member_id = targetMember?.member_id || ''
  submissionForm.period_key = latestOfficialRecord.value?.period_key || fallbackPeriodKey
  submissionForm.amount = targetMember?.billing_mode === 'quarterly'
    ? resolveQuarterlyAmount(submissionForm.period_key)
    : 0
  submissionForm.balance_amount = 0
  currentSubmissionEstimate.value = null
  submissionForm.payment_method = authStore.profile?.preferred_payment_method || paymentMethodOptions[0]
  submissionForm.account_last_5 = authStore.profile?.preferred_account_last_5 || ''
  submissionForm.remittance_date = dayjs().format('YYYY-MM-DD')
  submissionForm.note = ''
}

const refreshCurrentMemberData = async () => {
  if (!selectedMemberId.value) {
    records.value = []
    submissions.value = []
    return
  }

  isRefreshing.value = true

  try {
    const [nextRecords, nextSubmissions] = await Promise.all([
      getMyPaymentRecords(selectedMemberId.value),
      listMyPaymentSubmissions(selectedMemberId.value)
    ])

    records.value = nextRecords
    submissions.value = nextSubmissions
  } catch (error: any) {
    ElMessage.error(error?.message || '讀取繳費資訊失敗')
  } finally {
    isRefreshing.value = false
  }
}

const openCreateDialog = async () => {
  if (!canCreateSubmissionForSelectedMember.value) {
    return
  }

  hydrateSubmissionDefaults()
  await refreshSubmissionEstimate()
  isCreateDialogOpen.value = true
  await nextTick()
  formRef.value?.clearValidate?.()
}

const handleSubmissionPaymentMethodChange = (value: string) => {
  if (!requiresAccountLast5(value)) {
    submissionForm.account_last_5 = ''
  }
}

const handleSubmissionAccountLast5Input = (value: string) => {
  submissionForm.account_last_5 = normalizeAccountLast5(value)
}

const submitPaymentSubmission = async () => {
  if (!formRef.value) {
    return
  }

  try {
    await formRef.value.validate()
  } catch {
    return
  }

  isSubmitting.value = true

  try {
    const createdSubmission = await createMyPaymentSubmission({
      member_id: submissionForm.member_id,
      period_key: submissionForm.period_key.trim().toUpperCase(),
      amount: Number(submissionForm.amount) || 0,
      balance_amount: Number(submissionForm.balance_amount) || 0,
      payment_method: isExternalPaymentRequired.value ? submissionForm.payment_method : BALANCE_PAYMENT_METHOD,
      account_last_5: submissionRequiresAccountLast5.value ? normalizeAccountLast5(submissionForm.account_last_5) : null,
      remittance_date: isExternalPaymentRequired.value ? submissionForm.remittance_date : dayjs().format('YYYY-MM-DD'),
      note: submissionForm.note?.trim() || null
    })

    if (createdSubmission) {
      submissions.value = [createdSubmission, ...submissions.value]

      void dispatchPushNotification({
        title: `[月費 / 季費] ${createdSubmission.member_name} 提交了付款回報`,
        body: `${createdSubmission.period_label} / ${formatCurrency(createdSubmission.amount)}，請前往收費管理確認。`,
        url: `/fees?highlight_submission_id=${createdSubmission.id}`,
        feature: 'fees',
        action: 'VIEW',
        eventKey: buildPushEventKey('profile_payment_submission', createdSubmission.id)
      }).catch((pushError) => {
        console.warn('個人繳費回報通知發送失敗', pushError)
      })
    }

    isCreateDialogOpen.value = false
    ElMessage.success('付款回報已送出，等待管理員確認')
  } catch (error: any) {
    ElMessage.error(error?.message || '送出付款回報失敗')
  } finally {
    isSubmitting.value = false
  }
}

watch(selectedMemberId, async (nextMemberId, previousMemberId) => {
  if (isBootstrapping.value || !nextMemberId || nextMemberId === previousMemberId) {
    return
  }

  await refreshCurrentMemberData()
})

watch(
  () => submissionForm.member_id,
  async (nextMemberId, previousMemberId) => {
    if (!nextMemberId || nextMemberId === previousMemberId) {
      return
    }

    const targetMember = members.value.find((member) => member.member_id === nextMemberId)
    const nextDefaultPeriodKey = targetMember?.billing_mode === 'quarterly'
      ? getCurrentQuarterKey()
      : getDefaultMonthlyPeriodKey()

    submissionForm.period_key = nextDefaultPeriodKey
    await refreshSubmissionEstimate()
  }
)

watch(
  () => submissionForm.period_key,
  async (nextPeriodKey, previousPeriodKey) => {
    if (!isCreateDialogOpen.value || !nextPeriodKey || nextPeriodKey === previousPeriodKey) {
      return
    }

    await refreshSubmissionEstimate()
  }
)

watch(
  () => submissionForm.amount,
  () => {
    syncBalanceDeductionLimit()
  }
)

onMounted(async () => {
  try {
    await authStore.ensureInitialized()
    members.value = await listMyPaymentMembers()
    selectedMemberId.value = linkedMembers.value[0]?.member_id || members.value[0]?.member_id || ''

    if (selectedMemberId.value) {
      await refreshCurrentMemberData()
    }
  } finally {
    isBootstrapping.value = false
  }
})
</script>
