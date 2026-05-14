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
              @click="openCreateDialog()"
            >
              新增付款回報
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

          <section
            v-if="paymentReminderCards.length > 0"
            id="payment-reminders-section"
            class="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm"
          >
            <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 class="text-lg font-black text-slate-800">待處理付款</h3>
                <p class="mt-1 text-xs font-bold text-slate-400">月費 / 季費、裝備與比賽費用已整合在下方繳費紀錄。</p>
              </div>
              <button
                type="button"
                class="rounded-2xl bg-slate-900 px-4 py-2 text-sm font-black text-white transition-colors hover:bg-black disabled:opacity-60"
                :disabled="!canCreateSubmissionForSelectedMember"
                @click="openCreateDialog()"
              >
                新增付款回報
              </button>
            </div>

            <div class="mt-4 rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
              <div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div class="min-w-0">
                  <div class="text-xs font-black uppercase tracking-[0.14em] text-slate-400">目前需要處理</div>
                  <div class="mt-2 flex flex-wrap items-center gap-2 text-sm font-black text-slate-700">
                    <span class="rounded-full bg-white px-3 py-1 text-red-600">待付款 {{ unifiedPaymentCounts.unpaid }} 筆</span>
                    <span class="rounded-full bg-white px-3 py-1 text-amber-600">待確認 {{ unifiedPaymentCounts.pending }} 筆</span>
                  </div>
                </div>
                <div class="rounded-2xl bg-white px-4 py-3 text-right shadow-sm">
                  <div class="text-xs font-black text-slate-400">待付款合計</div>
                  <div class="mt-1 font-mono text-xl font-black text-slate-900">
                    {{ formatCurrency(unifiedUnpaidTotalAmount) }}
                  </div>
                </div>
              </div>

              <div class="mt-3 flex flex-wrap gap-2">
                <span
                  v-for="card in paymentReminderCards"
                  :key="card.key"
                  class="rounded-full border px-3 py-1.5 text-xs font-black"
                  :class="card.statusClass"
                >
                  {{ card.eyebrow }} · {{ card.statusLabel }} · {{ card.amountLabel }}
                </span>
              </div>
            </div>
          </section>

          <section id="profile-payment-records-section" class="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
            <div class="px-5 md:px-6 py-4 border-b border-gray-100 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 class="text-lg font-black text-slate-800">繳費紀錄</h3>
                <p class="text-xs text-gray-400 mt-1">月費 / 季費、裝備與比賽費用統一在這裡查看與勾選付款</p>
              </div>
              <div v-if="selectedMember" class="flex flex-wrap items-center gap-2 text-xs font-black text-slate-500">
                <span class="rounded-full bg-slate-100 px-3 py-1">{{ getPaymentMemberBillingLabel(selectedMember) }}</span>
                <span class="rounded-full bg-red-50 px-3 py-1 text-red-600">待付款 {{ unifiedPaymentCounts.unpaid }}</span>
                <span class="rounded-full bg-amber-50 px-3 py-1 text-amber-600">待確認 {{ unifiedPaymentCounts.pending }}</span>
              </div>
            </div>

            <div v-if="isRefreshing" class="p-6 text-sm text-gray-400 font-bold">
              讀取最新繳費紀錄中...
            </div>

            <div v-else-if="unifiedPaymentRecordGroups.length === 0" class="p-6 text-sm text-gray-400 font-bold">
              目前沒有繳費紀錄。
            </div>

            <div v-else class="space-y-5 p-4 md:p-5">
              <section
                v-for="group in unifiedPaymentRecordGroups"
                :key="group.key"
                class="rounded-2xl border p-4"
                :class="group.className"
              >
                <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div class="font-black" :class="group.titleClass">{{ group.title }}</div>
                  <span class="rounded-full bg-white/80 px-3 py-1 text-xs font-black text-slate-500">
                    {{ group.items.length }} 筆
                  </span>
                </div>

                <div class="grid gap-3 md:grid-cols-2">
                  <article
                    v-for="item in group.items"
                    :key="item.id"
                    :data-profile-period-key="item.kind === 'membership' ? item.periodKey : undefined"
                    :data-profile-submission-id="item.kind === 'membership-submission' ? item.sourceId : undefined"
                    :data-equipment-transaction-id="item.kind === 'equipment' ? item.sourceId : undefined"
                    :data-equipment-request-id="item.kind === 'equipment-request' ? item.sourceId : undefined"
                    :data-match-fee-item-id="item.kind === 'match-fee' ? item.sourceId : undefined"
                    class="rounded-2xl border border-white bg-white/90 p-4 shadow-sm"
                  >
                    <div class="flex items-start gap-3">
                      <input
                        v-if="item.selectable"
                        type="checkbox"
                        class="mt-1 h-5 w-5 rounded border-gray-300 text-primary"
                        :checked="isUnifiedRecordSelected(item)"
                        @change="toggleUnifiedRecordSelection(item, ($event.target as HTMLInputElement).checked)"
                      />
                      <div class="min-w-0 flex-1">
                        <div class="flex items-start justify-between gap-3">
                          <div class="min-w-0">
                            <div class="flex flex-wrap items-center gap-2">
                              <span class="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-600">
                                {{ item.typeLabel }}
                              </span>
                              <span :class="getStatusPillClass(item.status)" class="rounded-full border px-2.5 py-1 text-xs font-bold">
                                {{ item.statusLabel }}
                              </span>
                            </div>
                            <div class="mt-2 font-black text-slate-800">{{ item.title }}</div>
                            <p class="mt-1 text-xs font-bold leading-relaxed text-slate-400">{{ item.meta }}</p>
                          </div>
                          <div class="shrink-0 text-right">
                            <div class="font-mono text-lg font-black" :class="item.amountClass">
                              {{ item.amount > 0 ? formatCurrency(item.amount) : '金額待確認' }}
                            </div>
                            <div v-if="item.breakdown" class="mt-1 text-xs font-bold text-slate-400">
                              {{ item.breakdown }}
                            </div>
                          </div>
                        </div>
                        <p v-if="item.note" class="mt-3 border-t border-slate-100 pt-3 text-sm font-semibold leading-relaxed text-slate-500">
                          {{ item.note }}
                        </p>
                      </div>
                    </div>
                  </article>
                </div>
              </section>
            </div>
          </section>

          <div class="hidden">
            <div
              v-for="item in equipmentPendingRequestItems"
              :key="`equipment-request-anchor-${item.request_id}`"
              :data-equipment-request-id="item.request_id"
            ></div>
            <div
              v-for="item in matchFeeItems"
              :key="`match-fee-anchor-${item.id}`"
              :data-match-fee-item-id="item.id"
            ></div>
          </div>
        </template>
     </div>
   </div>

    <el-dialog
      v-model="isCreateDialogOpen"
      title="新增付款回報"
      width="90%"
      style="max-width: 560px; border-radius: 16px;"
      destroy-on-close
    >
      <el-form ref="formRef" :model="submissionForm" :rules="submissionRules" label-position="top" class="space-y-5">
        <div class="grid gap-4 sm:grid-cols-2">
          <el-form-item label="繳費成員" prop="member_id" class="font-bold">
            <el-select v-model="submissionForm.member_id" class="w-full" size="large" disabled>
              <el-option
                v-for="member in linkedMembers"
                :key="member.member_id"
                :label="buildMemberOptionLabel(member)"
                :value="member.member_id"
              />
            </el-select>
          </el-form-item>

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
        </div>

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

        <PaymentAccountInfoCard compact />

        <section class="space-y-4 rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
          <div class="flex items-center justify-between gap-3">
            <div>
              <h4 class="text-sm font-black text-slate-700">本次回報項目</h4>
              <p class="mt-1 text-xs font-bold text-slate-400">可一次勾選月費 / 季費、裝備與比賽費用</p>
            </div>
            <span class="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-600">
              已選 {{ selectedUnifiedLineItems.length }} 筆
            </span>
          </div>

          <article class="rounded-2xl border border-white bg-white p-4 shadow-sm">
            <label
              class="flex items-start gap-3"
              :class="canSelectMembershipFee ? 'cursor-pointer' : 'cursor-not-allowed opacity-75'"
            >
              <input
                v-model="includeMembershipFee"
                type="checkbox"
                class="mt-1 h-5 w-5 rounded border-gray-300 text-primary"
                :disabled="!canSelectMembershipFee"
              />
              <div class="min-w-0 flex-1">
                <div class="flex flex-wrap items-center justify-between gap-2">
                  <div class="font-black text-slate-800">{{ createDialogPaymentItemLabel }}</div>
                  <span :class="getStatusPillClass(createDialogMembershipStatus)" class="rounded-full border px-2.5 py-1 text-xs font-bold">
                    {{ getStatusLabel(createDialogMembershipStatus) }}
                  </span>
                </div>
                <p class="mt-1 text-xs font-bold text-slate-400">
                  {{ createDialogMembershipMetaText }}
                </p>
              </div>
            </label>
            <p
              v-if="membershipSelectionHint"
              class="mt-3 rounded-2xl border border-amber-100 bg-amber-50/70 px-3 py-2 text-xs font-bold leading-relaxed text-amber-700"
            >
              {{ membershipSelectionHint }}
            </p>

            <div v-if="includeMembershipFee" class="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem] sm:items-start">
              <el-form-item label="期別" prop="period_key" class="!mb-0 font-bold">
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

              <el-form-item v-if="createDialogMember?.billing_mode !== 'quarterly'" label="金額" prop="amount" class="!mb-0 font-bold">
                <el-input-number
                  v-model="submissionForm.amount"
                  class="!w-full"
                  :min="0"
                  :step="100"
                  size="large"
                />
              </el-form-item>
            </div>

            <div v-if="isQuarterlyMembershipFlow" class="mt-4 grid gap-3">
              <article
                v-for="member in quarterlyPaymentCandidates"
                :key="`quarterly-member-${member.member_id}`"
                class="grid gap-3 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:grid-cols-[minmax(0,1fr)_minmax(10rem,18rem)] sm:items-start"
                :class="[
                  quarterlyMemberSnapshots[member.member_id]?.status !== 'unpaid' ? 'opacity-60' : '',
                  selectedQuarterlyMemberIds.includes(member.member_id) ? 'border-primary/20 bg-primary/5' : ''
                ]"
              >
                <div class="flex min-w-0 items-start gap-3">
                  <input
                    v-model="selectedQuarterlyMemberIds"
                    type="checkbox"
                    :value="member.member_id"
                    :disabled="quarterlyMemberSnapshots[member.member_id]?.status !== 'unpaid'"
                    class="mt-1 h-5 w-5 rounded border-gray-300 text-primary"
                  />
                  <div class="min-w-0">
                    <div class="font-black text-slate-800">{{ member.name }}</div>
                    <p class="mt-1 text-xs font-bold text-slate-400">
                      {{ submissionForm.period_key }}｜{{ getStatusLabel(quarterlyMemberSnapshots[member.member_id]?.status || 'unpaid') }}｜可用餘額 {{ formatCurrency(member.balance_amount || 0) }}
                    </p>
                  </div>
                </div>
                <div
                  class="grid gap-2"
                  :class="getQuarterlyCandidateAvailableBalance(member) > 0 ? 'sm:grid-cols-2' : ''"
                >
                  <div class="grid gap-1">
                    <span class="text-[11px] font-black text-slate-400">季費金額</span>
                    <el-input-number
                      v-model="quarterlyMemberAmounts[member.member_id]"
                      class="!w-full"
                      :min="0"
                      :step="100"
                      size="large"
                      :disabled="!selectedQuarterlyMemberIds.includes(member.member_id)"
                    />
                  </div>
                  <div v-if="getQuarterlyCandidateAvailableBalance(member) > 0" class="grid gap-1">
                    <span class="text-[11px] font-black text-slate-400">餘額扣抵</span>
                    <el-input-number
                      v-model="quarterlyMemberBalanceAmounts[member.member_id]"
                      class="!w-full"
                      :min="0"
                      :max="Math.min(Number(quarterlyMemberAmounts[member.member_id] || 0), getQuarterlyCandidateAvailableBalance(member))"
                      :step="100"
                      size="large"
                      :disabled="!selectedQuarterlyMemberIds.includes(member.member_id)"
                    />
                  </div>
                </div>
              </article>
            </div>

            <div v-if="includeMembershipFee" class="mt-3 grid gap-1 text-xs leading-relaxed">
              <p class="font-bold text-slate-400">
                {{ isEstimatingAmount ? '依期別重新計算中...' : createDialogEstimateHelperText }}
              </p>
              <p v-if="createDialogMonthlyStatsText" class="font-bold text-amber-600">
                {{ createDialogMonthlyStatsText }}
              </p>
              <p v-if="createDialogMonthlyFormulaText" class="font-bold text-slate-500">
                {{ createDialogMonthlyFormulaText }}
              </p>
              <p class="font-bold text-slate-400">期別格式：{{ createDialogPeriodHint }}</p>
            </div>
          </article>

          <label
            v-for="item in equipmentUnpaidItems"
            :key="`dialog-equipment-${item.transaction_id}`"
            class="flex cursor-pointer gap-3 rounded-2xl border border-white bg-white p-4 shadow-sm"
          >
            <input
              v-model="selectedEquipmentTransactionIds"
              type="checkbox"
              :value="item.transaction_id"
              :disabled="isMultiQuarterlyMembershipSelected"
              class="mt-1 h-5 w-5 rounded border-gray-300 text-primary"
            />
            <div class="min-w-0 flex-1">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <span class="rounded-full bg-sky-50 px-2.5 py-1 text-xs font-black text-sky-700">裝備</span>
                  <div class="mt-2 font-black text-slate-800">{{ item.equipment_name }}</div>
                </div>
                <div class="font-mono font-black text-sky-700">{{ formatCurrency(item.total_amount) }}</div>
              </div>
              <p class="mt-1 text-xs font-bold text-slate-400">
                {{ item.member_name }}｜{{ getEquipmentVariantLabel(item) }}｜{{ item.quantity }} 件｜{{ formatDate(item.transaction_date) }}
              </p>
            </div>
          </label>

          <label
            v-for="item in matchFeeUnpaidItems"
            :key="`dialog-match-${item.id}`"
            class="flex cursor-pointer gap-3 rounded-2xl border border-white bg-white p-4 shadow-sm"
          >
            <input
              v-model="selectedMatchFeeItemIds"
              type="checkbox"
              :value="item.id"
              :disabled="isMultiQuarterlyMembershipSelected"
              class="mt-1 h-5 w-5 rounded border-gray-300 text-primary"
            />
            <div class="min-w-0 flex-1">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <span class="rounded-full bg-violet-50 px-2.5 py-1 text-xs font-black text-violet-700">比賽費用</span>
                  <div class="mt-2 font-black text-slate-800">{{ item.match_name }}</div>
                </div>
                <div class="font-mono font-black text-violet-700">{{ formatCurrency(item.amount) }}</div>
              </div>
              <p class="mt-1 text-xs font-bold text-slate-400">
                {{ getMatchFeeSubtitle(item) }}
              </p>
            </div>
          </label>

          <p
            v-if="!canSelectMembershipFee && equipmentUnpaidItems.length === 0 && matchFeeUnpaidItems.length === 0"
            class="rounded-2xl border border-dashed border-slate-200 bg-white/70 px-4 py-3 text-sm font-bold text-slate-400"
          >
            目前沒有可新增回報的待付款項目。
          </p>
        </section>

        <PaymentSubmissionSummary
          v-model:balance-amount="submissionBalanceAmount"
          :member-name="paymentSummaryMemberName"
          :total-amount="selectedUnifiedTotalAmount"
          :available-balance="createDialogAvailableBalance"
          :external-amount="createDialogExternalPaymentAmount"
          :line-items="selectedUnifiedLineItems"
          line-items-title="本次送出的項目"
          empty-items-text="請先勾選本次要回報的付款項目。"
          :hide-balance-control="isQuarterlyMembershipFlow"
          :disabled="isEstimatingAmount"
          :format-currency="formatCurrency"
        />

        <el-form-item label="備註說明（選填）" prop="note" class="font-bold">
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
            :disabled="isSubmitting || selectedUnifiedTotalAmount <= 0"
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
import PaymentAccountInfoCard from '@/components/payments/PaymentAccountInfoCard.vue'
import PaymentSubmissionSummary from '@/components/payments/PaymentSubmissionSummary.vue'
import {
  createMyQuarterlyPaymentSubmission,
  createMyPaymentSubmission,
  getMyPaymentRecords,
  listMyPaymentMembers,
  listMyPaymentSubmissions,
  getMyPaymentSubmissionEstimate
} from '@/services/myPayments'
import { getPlayerBalance } from '@/services/playerBalances'
import { createMatchPaymentSubmission, listMyMatchFeeItems } from '@/services/matchFees'
import { useAuthStore } from '@/stores/auth'
import { useEquipmentPaymentsStore } from '@/stores/equipmentPayments'
import type {
  CreateMyQuarterlyPaymentSubmissionItemPayload,
  CreateMyPaymentSubmissionPayload,
  MyPaymentMember,
  MyPaymentRecord,
  MyPaymentSubmissionEstimate,
  MyPaymentSubmission
} from '@/types/payments'
import type {
  EquipmentPaymentItem,
  EquipmentPendingRequestPaymentItem,
  EquipmentPaymentSubmission
} from '@/types/equipment'
import type {
  MatchFeeItem,
  MatchPaymentSubmission
} from '@/types/matchFees'
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
import {
  canUseGroupedQuarterlyPaymentSubmission,
  summarizeQuarterlyPaymentSubmissionItems,
  validateQuarterlyPaymentSubmissionItems
} from '@/utils/quarterlyPaymentSubmissions'
import { formatEquipmentVariantLabel } from '@/utils/equipmentPricing'
import {
  getEquipmentRequestStatusLabel,
  isEquipmentPaymentPayableRequestStatus
} from '@/utils/equipmentRequestStatus'
import { buildGroupedPushEventKey, buildPushEventKey, dispatchPushNotification } from '@/utils/pushNotifications'

type PaymentPanelSummary = {
  unpaidCount: number
  unpaidTotal: number
  pendingCount: number
  pendingTotal: number
  firstUnpaidItemId: string | null
}

type PaymentReminderKind = 'membership-fee' | 'equipment' | 'match-fees'

type PaymentReminderCard = {
  key: string
  kind: PaymentReminderKind
  eyebrow: string
  title: string
  statusLabel: string
  description: string
  amountLabel: string
  actionLabel: string
  targetSelector?: string
  fallbackSelector?: string
  cardClass: string
  eyebrowClass: string
  statusClass: string
  amountClass: string
}

type UnifiedPaymentRecordKind =
  | 'membership'
  | 'membership-submission'
  | 'equipment'
  | 'equipment-request'
  | 'match-fee'

type UnifiedPaymentRecordGroupKey = 'unpaid' | 'pending' | 'confirmed' | 'closed'

type UnifiedPaymentRecord = {
  id: string
  sourceId: string
  kind: UnifiedPaymentRecordKind
  groupKey: UnifiedPaymentRecordGroupKey
  typeLabel: string
  title: string
  meta: string
  status: string
  statusLabel: string
  amount: number
  amountClass: string
  dateKey: string
  selectable: boolean
  periodKey?: string
  breakdown?: string
  note?: string | null
}

type QuarterlyPaymentMemberSnapshot = {
  status: 'paid' | 'pending' | 'unpaid'
  amount: number
  balance_amount: number
}

const authStore = useAuthStore()
const equipmentPaymentsStore = useEquipmentPaymentsStore()

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
const currentDueEstimate = ref<MyPaymentSubmissionEstimate | null>(null)
const formRef = ref()
const includeMembershipFee = ref(false)
const selectedQuarterlyMemberIds = ref<string[]>([])
const quarterlyMemberAmounts = reactive<Record<string, number>>({})
const quarterlyMemberBalanceAmounts = reactive<Record<string, number>>({})
const quarterlyMemberSnapshots = ref<Record<string, QuarterlyPaymentMemberSnapshot>>({})
const selectedEquipmentTransactionIds = ref<string[]>([])
const selectedMatchFeeItemIds = ref<string[]>([])
const equipmentPaymentItems = ref<EquipmentPaymentItem[]>([])
const equipmentPendingRequestItems = ref<EquipmentPendingRequestPaymentItem[]>([])
const matchFeeItems = ref<MatchFeeItem[]>([])
const createDialogBalanceOverride = ref<number | null>(null)

const paymentMethodOptions = PAYMENT_METHOD_OPTIONS

const createEmptyPaymentPanelSummary = (): PaymentPanelSummary => ({
  unpaidCount: 0,
  unpaidTotal: 0,
  pendingCount: 0,
  pendingTotal: 0,
  firstUnpaidItemId: null
})

const equipmentPaymentSummary = ref<PaymentPanelSummary>(createEmptyPaymentPanelSummary())
const matchFeeSummary = ref<PaymentPanelSummary>(createEmptyPaymentPanelSummary())

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

const quarterlyPaymentCandidates = computed(() =>
  linkedMembers.value.filter((member) => member.billing_mode === 'quarterly')
)

const isQuarterlyMembershipFlow = computed(() =>
  includeMembershipFee.value && createDialogMember.value?.billing_mode === 'quarterly'
)

const selectedQuarterlyPaymentCandidates = computed(() => {
  const selectedIds = new Set(selectedQuarterlyMemberIds.value)
  return quarterlyPaymentCandidates.value.filter((member) => selectedIds.has(member.member_id))
})

const getQuarterlyCandidateAvailableBalance = (member: MyPaymentMember) =>
  Math.max(0, Number(member.balance_amount || 0))

const latestOfficialRecord = computed(() => records.value[0] || null)
const createDialogAvailableBalance = computed(() =>
  isQuarterlyMembershipFlow.value
    ? selectedQuarterlyPaymentCandidates.value.reduce((total, member) => {
      const amount = Number(quarterlyMemberAmounts[member.member_id] || 0)
      const available = Number(member.balance_amount || 0)
      return total + Math.min(amount, available)
    }, 0)
    : Number(createDialogBalanceOverride.value ?? createDialogMember.value?.balance_amount ?? 0)
)
const submissionBalanceAmount = computed({
  get: () => Number(submissionForm.balance_amount || 0),
  set: (value: number) => {
    submissionForm.balance_amount = value
  }
})
const createDialogExternalPaymentAmount = computed(() =>
  getExternalPaymentAmount(selectedUnifiedTotalAmount.value, submissionForm.balance_amount)
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

const createDialogPaymentItemLabel = computed(() =>
  createDialogMember.value?.billing_mode === 'quarterly' ? '季費' : '月費'
)

const createDialogMembershipPeriodKey = computed(() => {
  if (createDialogMember.value?.billing_mode === 'quarterly') {
    return submissionForm.period_key || currentFeePeriodKey.value
  }

  return currentFeePeriodKey.value
})

const createDialogMembershipMetaText = computed(() => {
  const memberName = createDialogMember.value?.name || '尚未選擇成員'
  const periodKey = createDialogMembershipPeriodKey.value
  const parts = [
    memberName,
    createDialogBillingModeLabel.value,
    periodKey ? `目前可回報 ${periodKey}` : null
  ].filter(Boolean)

  return parts.join('｜')
})

const nextMonthlyFeePeriod = computed(() => {
  const today = dayjs()
  return today.date() >= 25 ? today.add(1, 'month') : today
})

const membershipSelectionHint = computed(() => {
  const member = createDialogMember.value

  if (!member || canSelectMembershipFee.value) {
    return ''
  }

  if (!canCreateSubmissionForSelectedMember.value) {
    return createSubmissionAccessHint.value || '目前只能替自己的關聯成員新增付款回報。'
  }

  if (member.billing_mode === 'quarterly') {
    return '這一季沒有可新增回報的季費；已確認或待確認的項目不能重複回報。'
  }

  const periodKey = currentFeePeriodKey.value
  const nextPeriodKey = nextMonthlyFeePeriod.value.format('YYYY-MM')
  const nextOpenDate = nextMonthlyFeePeriod.value.date(25).format('YYYY-MM-DD')

  if (currentFeeDueStatus.value === 'paid') {
    return `目前可回報的 ${periodKey} 月費已確認；${nextPeriodKey} 月費預計 ${nextOpenDate} 起開放回報。`
  }

  if (currentFeeDueStatus.value === 'pending') {
    return `目前可回報的 ${periodKey} 月費已送出付款回報，等待管理員確認中。`
  }

  return `目前沒有可新增回報的 ${periodKey} 月費項目。`
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

const currentFeePeriodKey = computed(() => {
  if (!selectedMember.value) {
    return ''
  }

  return selectedMember.value.billing_mode === 'quarterly'
    ? getCurrentQuarterKey()
    : getCurrentMonthlyFeePeriodKey()
})

const currentFeeBillingName = computed(() =>
  selectedMember.value?.billing_mode === 'quarterly' ? '季費' : '月費'
)

const currentFeeOfficialRecord = computed(() =>
  records.value.find((record) => record.period_key === currentFeePeriodKey.value) || null
)

const currentFeeSubmissions = computed(() =>
  submissions.value.filter((submission) => submission.period_key === currentFeePeriodKey.value)
)

const currentFeePaidSubmission = computed(() =>
  currentFeeSubmissions.value.find((submission) => isPaidStatus(submission.status)) || null
)

const currentFeePendingSubmission = computed(() =>
  currentFeeSubmissions.value.find((submission) => isPendingStatus(submission.status)) || null
)

const currentFeeDueStatus = computed<'paid' | 'pending' | 'unpaid'>(() => {
  if (
    isPaidStatus(currentFeeOfficialRecord.value?.status)
    || currentFeePaidSubmission.value
  ) {
    return 'paid'
  }

  if (
    isPendingStatus(currentFeeOfficialRecord.value?.status)
    || currentFeePendingSubmission.value
  ) {
    return 'pending'
  }

  return 'unpaid'
})

const createDialogMembershipStatus = computed<'paid' | 'pending' | 'unpaid'>(() => {
  if (createDialogMember.value?.billing_mode !== 'quarterly') {
    return currentFeeDueStatus.value
  }

  const snapshotStatuses = quarterlyPaymentCandidates.value
    .map((member) => quarterlyMemberSnapshots.value[member.member_id]?.status)
    .filter((status): status is 'paid' | 'pending' | 'unpaid' => Boolean(status))

  if (snapshotStatuses.some((status) => status === 'unpaid')) {
    return 'unpaid'
  }

  if (snapshotStatuses.some((status) => status === 'pending')) {
    return 'pending'
  }

  if (snapshotStatuses.some((status) => status === 'paid')) {
    return 'paid'
  }

  return currentFeeDueStatus.value
})

const currentFeeDueAmount = computed(() => {
  const amount = currentFeeOfficialRecord.value?.amount
    ?? currentFeePaidSubmission.value?.amount
    ?? currentFeePendingSubmission.value?.amount
    ?? currentDueEstimate.value?.amount
    ?? 0

  return Math.max(0, Number(amount) || 0)
})

const currentFeeReminderCard = computed<PaymentReminderCard | null>(() => {
  const member = selectedMember.value
  const periodKey = currentFeePeriodKey.value

  if (!member || !periodKey) {
    return null
  }

  const billingName = currentFeeBillingName.value
  const status = currentFeeDueStatus.value
  const amountLabel = currentFeeDueAmount.value > 0 ? formatCurrency(currentFeeDueAmount.value) : '金額待確認'

  if (status === 'paid') {
    const targetSelector = currentFeeOfficialRecord.value
      ? `[data-profile-period-key="${periodKey}"]`
      : currentFeePaidSubmission.value
        ? `[data-profile-submission-id="${currentFeePaidSubmission.value.id}"]`
        : '#profile-payment-records-section'

    return {
      key: `membership-${periodKey}`,
      kind: 'membership-fee',
      eyebrow: `${billingName} ${periodKey}`,
      title: '本期繳費完成',
      statusLabel: '繳費完成',
      description: `${member.name} 的 ${periodKey} ${billingName}已完成繳費。`,
      amountLabel,
      actionLabel: '查看紀錄',
      targetSelector,
      fallbackSelector: '#profile-payment-records-section',
      cardClass: 'border-emerald-100 bg-emerald-50/60',
      eyebrowClass: 'text-emerald-600',
      statusClass: 'border-emerald-200 bg-emerald-50 text-emerald-700',
      amountClass: 'text-emerald-700'
    }
  }

  if (status === 'pending') {
    return {
      key: `membership-${periodKey}`,
      kind: 'membership-fee',
      eyebrow: `${billingName} ${periodKey}`,
      title: '本期付款待確認',
      statusLabel: '待確認',
      description: `${member.name} 的 ${periodKey} ${billingName}已送出付款回報，等待管理員確認。`,
      amountLabel,
      actionLabel: '查看回報',
      targetSelector: currentFeePendingSubmission.value
        ? `[data-profile-submission-id="${currentFeePendingSubmission.value.id}"]`
        : '#profile-payment-submissions-section',
      fallbackSelector: '#profile-payment-submissions-section',
      cardClass: 'border-amber-100 bg-amber-50/70',
      eyebrowClass: 'text-amber-600',
      statusClass: 'border-amber-200 bg-amber-50 text-amber-700',
      amountClass: 'text-amber-700'
    }
  }

  return {
    key: `membership-${periodKey}`,
    kind: 'membership-fee',
    eyebrow: `${billingName} ${periodKey}`,
    title: `本期${billingName}待付款`,
    statusLabel: '待付款',
    description: `${member.name} 的 ${periodKey} ${billingName}繳費時間已到，完成付款後請送出回報。`,
    amountLabel,
    actionLabel: canCreateSubmissionForSelectedMember.value ? '新增回報' : '',
    cardClass: 'border-red-100 bg-red-50/60',
    eyebrowClass: 'text-red-600',
    statusClass: 'border-red-200 bg-red-50 text-red-700',
    amountClass: 'text-red-700'
  }
})

const equipmentReminderCard = computed<PaymentReminderCard | null>(() => {
  const summary = equipmentPaymentSummary.value

  if (summary.unpaidCount <= 0) {
    return null
  }

  return {
    key: 'equipment-unpaid',
    kind: 'equipment',
    eyebrow: '裝備待付款',
    title: '有裝備款項待付款',
    statusLabel: '待付款',
    description: `${summary.unpaidCount} 筆裝備款項尚未回報付款，可直接帶入付款回報。`,
    amountLabel: formatCurrency(summary.unpaidTotal),
    actionLabel: '新增回報',
    targetSelector: summary.firstUnpaidItemId
      ? `[data-equipment-transaction-id="${summary.firstUnpaidItemId}"]`
      : '#equipment-payment-section',
    fallbackSelector: '#equipment-payment-section',
    cardClass: 'border-sky-100 bg-sky-50/70',
    eyebrowClass: 'text-sky-600',
    statusClass: 'border-sky-200 bg-sky-50 text-sky-700',
    amountClass: 'text-sky-700'
  }
})

const matchFeeReminderCard = computed<PaymentReminderCard | null>(() => {
  const summary = matchFeeSummary.value

  if (summary.unpaidCount <= 0) {
    return null
  }

  return {
    key: 'match-fees-unpaid',
    kind: 'match-fees',
    eyebrow: '比賽費用',
    title: '有比賽費用待付款',
    statusLabel: '待付款',
    description: `${summary.unpaidCount} 筆比賽費用尚未回報付款，可直接帶入付款回報。`,
    amountLabel: formatCurrency(summary.unpaidTotal),
    actionLabel: '新增回報',
    targetSelector: summary.firstUnpaidItemId
      ? `[data-match-fee-item-id="${summary.firstUnpaidItemId}"]`
      : '#match-fees-section',
    fallbackSelector: '#match-fees-section',
    cardClass: 'border-violet-100 bg-violet-50/70',
    eyebrowClass: 'text-violet-600',
    statusClass: 'border-violet-200 bg-violet-50 text-violet-700',
    amountClass: 'text-violet-700'
  }
})

const paymentReminderCards = computed(() =>
  [
    currentFeeReminderCard.value,
    equipmentReminderCard.value,
    matchFeeReminderCard.value
  ].filter((card): card is PaymentReminderCard => Boolean(card))
)

const hasSelectableQuarterlyPaymentCandidate = computed(() => {
  if (createDialogMember.value?.billing_mode !== 'quarterly') {
    return false
  }

  return quarterlyPaymentCandidates.value.some((member) => {
    const snapshotStatus = quarterlyMemberSnapshots.value[member.member_id]?.status

    if (snapshotStatus) {
      return snapshotStatus === 'unpaid'
    }

    if (member.member_id === createDialogMember.value?.member_id) {
      return currentFeeDueStatus.value === 'unpaid'
    }

    return true
  })
})

const canSelectMembershipFee = computed(() => {
  if (!canCreateSubmissionForSelectedMember.value) {
    return false
  }

  if (createDialogMember.value?.billing_mode === 'quarterly') {
    return hasSelectableQuarterlyPaymentCandidate.value
  }

  return currentFeeDueStatus.value === 'unpaid'
})

const equipmentUnpaidItems = computed(() =>
  equipmentPaymentItems.value.filter((item) =>
    item.payment_status === 'unpaid' && isEquipmentPaymentItemPayable(item)
  )
)

const matchFeeUnpaidItems = computed(() =>
  matchFeeItems.value.filter((item) => item.payment_status === 'unpaid')
)

const selectedEquipmentPaymentItems = computed(() => {
  const selectedIds = new Set(selectedEquipmentTransactionIds.value)
  return equipmentUnpaidItems.value.filter((item) => selectedIds.has(item.transaction_id))
})

const selectedMatchFeePaymentItems = computed(() => {
  const selectedIds = new Set(selectedMatchFeeItemIds.value)
  return matchFeeUnpaidItems.value.filter((item) => selectedIds.has(item.id))
})

const selectedQuarterlyPaymentItems = computed<CreateMyQuarterlyPaymentSubmissionItemPayload[]>(() => {
  if (!isQuarterlyMembershipFlow.value) {
    return []
  }

  const periodKey = submissionForm.period_key.trim().toUpperCase()

  return selectedQuarterlyPaymentCandidates.value.map((member) => {
    const amount = Number(quarterlyMemberAmounts[member.member_id] || 0)
    const availableBalance = Number(member.balance_amount || 0)
    const balanceAmount = Math.min(
      Number(quarterlyMemberBalanceAmounts[member.member_id] || 0),
      amount,
      availableBalance
    )

    return {
      member_id: member.member_id,
      period_key: periodKey,
      amount,
      balance_amount: balanceAmount
    }
  })
})

const quarterlyPaymentSummary = computed(() =>
  summarizeQuarterlyPaymentSubmissionItems(selectedQuarterlyPaymentItems.value)
)

const isMultiQuarterlyMembershipSelected = computed(() =>
  isQuarterlyMembershipFlow.value && selectedQuarterlyPaymentItems.value.length > 1
)

const paymentSummaryMemberName = computed(() => {
  if (!isQuarterlyMembershipFlow.value) {
    return createDialogMember.value?.name || ''
  }

  if (selectedQuarterlyPaymentCandidates.value.length > 1) {
    return '多位球員季費'
  }

  return selectedQuarterlyPaymentCandidates.value[0]?.name || createDialogMember.value?.name || ''
})

const shouldUseGroupedQuarterlySubmission = computed(() =>
  canUseGroupedQuarterlyPaymentSubmission(selectedQuarterlyPaymentItems.value.length, {
    billingMode: createDialogMember.value?.billing_mode,
    selectedEquipmentCount: selectedEquipmentPaymentItems.value.length,
    selectedMatchFeeCount: selectedMatchFeePaymentItems.value.length
  })
)

const selectedUnifiedLineItems = computed(() => {
  const lineItems: Array<{
    id: string
    typeLabel: string
    title?: string | null
    meta?: string | null
    periodLabel?: string | null
    amount: number
  }> = []

  if (isQuarterlyMembershipFlow.value) {
    selectedQuarterlyPaymentCandidates.value.forEach((member) => {
      const snapshot = quarterlyMemberSnapshots.value[member.member_id]
      lineItems.push({
        id: `membership-${member.member_id}-${submissionForm.period_key || 'new'}`,
        typeLabel: createDialogPaymentItemLabel.value,
        title: member.name,
        periodLabel: submissionForm.period_key,
        meta: `${createDialogBillingModeLabel.value}｜${snapshot?.status || 'unpaid'}`,
        amount: Number(quarterlyMemberAmounts[member.member_id]) || 0
      })
    })
  } else if (includeMembershipFee.value) {
    lineItems.push({
      id: `membership-${submissionForm.period_key || 'new'}`,
      typeLabel: createDialogPaymentItemLabel.value,
      title: createDialogMember.value?.name || createDialogPaymentItemLabel.value,
      periodLabel: submissionForm.period_key,
      meta: createDialogBillingModeLabel.value,
      amount: Number(submissionForm.amount) || 0
    })
  }

  selectedEquipmentPaymentItems.value.forEach((item) => {
    lineItems.push({
      id: `equipment-${item.transaction_id}`,
      typeLabel: '裝備',
      title: item.equipment_name,
      periodLabel: formatDate(item.transaction_date),
      meta: `${item.member_name}｜${getEquipmentVariantLabel(item)}｜${item.quantity} 件`,
      amount: Number(item.total_amount) || 0
    })
  })

  selectedMatchFeePaymentItems.value.forEach((item) => {
    lineItems.push({
      id: `match-fee-${item.id}`,
      typeLabel: '比賽費用',
      title: item.match_name,
      periodLabel: item.fee_month,
      meta: getMatchFeeSubtitle(item),
      amount: Number(item.amount) || 0
    })
  })

  return lineItems
})

const selectedUnifiedTotalAmount = computed(() =>
  selectedUnifiedLineItems.value.reduce((total, item) => total + Number(item.amount || 0), 0)
)

const getUnifiedGroupKey = (status?: string | null): UnifiedPaymentRecordGroupKey => {
  if (status === 'unpaid') return 'unpaid'
  if (status === 'pending_review' || status === 'pending' || status === 'approved_request' || status === 'ready_for_pickup') return 'pending'
  if (status === 'paid' || status === 'approved') return 'confirmed'
  return 'closed'
}

const getUnifiedAmountClass = (status?: string | null) => {
  if (status === 'unpaid') return 'text-red-600'
  if (status === 'pending_review' || status === 'pending' || status === 'approved_request' || status === 'ready_for_pickup') return 'text-amber-700'
  if (status === 'paid' || status === 'approved') return 'text-emerald-700'
  return 'text-slate-500'
}

const getEquipmentRequestRecordStatus = (status?: string | null) => {
  if (status === 'ready_for_pickup') return 'ready_for_pickup'
  if (status === 'approved') return 'approved_request'
  return 'pending'
}

const isEquipmentPaymentItemPayable = (item: EquipmentPaymentItem) =>
  isEquipmentPaymentPayableRequestStatus(item.request_status)

const getEquipmentPaymentItemStatus = (item: EquipmentPaymentItem) => {
  const paymentStatus = item.payment_status || 'unpaid'

  if (paymentStatus === 'unpaid' && !isEquipmentPaymentItemPayable(item)) {
    return getEquipmentRequestRecordStatus(item.request_status)
  }

  return paymentStatus
}

const getUnifiedStatusLabel = (
  status?: string | null,
  kind?: UnifiedPaymentRecordKind
) => {
  if (
    (kind === 'equipment-request' || kind === 'equipment')
    && (status === 'ready_for_pickup' || status === 'approved_request' || status === 'pending')
  ) {
    if (status === 'ready_for_pickup') return '可領取'
    if (status === 'approved_request') return '已核准'
    return '處理中'
  }

  if (status === 'unpaid') return '待付款'
  if (status === 'cancelled') return '已取消'
  return getStatusLabel(status)
}

const unifiedPaymentRecords = computed<UnifiedPaymentRecord[]>(() => {
  const rows: UnifiedPaymentRecord[] = []
  const selectedMemberName = selectedMember.value?.name || ''
  const currentPeriodKey = currentFeePeriodKey.value
  const currentPeriodAlreadyListed = records.value.some((record) => record.period_key === currentPeriodKey)
    || submissions.value.some((submission) => submission.period_key === currentPeriodKey)

  if (
    selectedMember.value
    && currentPeriodKey
    && !currentPeriodAlreadyListed
    && currentFeeDueStatus.value !== 'paid'
  ) {
    const status = currentFeeDueStatus.value
    rows.push({
      id: `membership-due-${currentPeriodKey}`,
      sourceId: currentPeriodKey,
      kind: 'membership',
      groupKey: getUnifiedGroupKey(status),
      typeLabel: currentFeeBillingName.value,
      title: `${currentPeriodKey} ${currentFeeBillingName.value}`,
      meta: `${selectedMemberName}｜${getPaymentMemberBillingLabel(selectedMember.value)}`,
      status,
      statusLabel: getUnifiedStatusLabel(status, 'membership'),
      amount: currentFeeDueAmount.value,
      amountClass: getUnifiedAmountClass(status),
      dateKey: currentPeriodKey,
      selectable: status === 'unpaid' && canCreateSubmissionForSelectedMember.value,
      periodKey: currentPeriodKey
    })
  }

  records.value.forEach((record) => {
    const status = record.status || 'unpaid'
    rows.push({
      id: `membership-record-${record.period_key}-${record.updated_at || 'na'}`,
      sourceId: record.period_key,
      kind: 'membership',
      groupKey: getUnifiedGroupKey(status),
      typeLabel: record.billing_mode === 'quarterly' ? '季費' : '月費',
      title: record.period_label,
      meta: `${record.member_name}｜${record.period_key}｜${formatPaymentInfo(record.payment_method, record.account_last_5, record.remittance_date)}`,
      status,
      statusLabel: getUnifiedStatusLabel(status, 'membership'),
      amount: Number(record.amount) || 0,
      amountClass: getUnifiedAmountClass(status),
      dateKey: record.updated_at || record.period_key,
      selectable: status === 'unpaid' && canCreateSubmissionForSelectedMember.value,
      periodKey: record.period_key,
      breakdown: buildPaymentBreakdownText(record.amount, record.balance_amount, formatCurrency)
    })
  })

  submissions.value.forEach((submission) => {
    const status = submission.status || 'pending_review'
    rows.push({
      id: `membership-submission-${submission.id}`,
      sourceId: submission.id,
      kind: 'membership-submission',
      groupKey: getUnifiedGroupKey(status),
      typeLabel: submission.billing_mode === 'quarterly' ? '季費回報' : '月費回報',
      title: submission.period_label,
      meta: `${submission.member_name}｜${formatPaymentInfo(submission.payment_method, submission.account_last_5, submission.remittance_date)}｜${formatDateTime(submission.created_at)}`,
      status,
      statusLabel: getUnifiedStatusLabel(status, 'membership-submission'),
      amount: Number(submission.amount) || 0,
      amountClass: getUnifiedAmountClass(status),
      dateKey: submission.updated_at || submission.created_at,
      selectable: false,
      periodKey: submission.period_key,
      breakdown: buildPaymentBreakdownText(submission.amount, submission.balance_amount, formatCurrency),
      note: submission.note
    })
  })

  equipmentPaymentItems.value.forEach((item) => {
    const status = getEquipmentPaymentItemStatus(item)
    rows.push({
      id: `equipment-${item.transaction_id}`,
      sourceId: item.transaction_id,
      kind: 'equipment',
      groupKey: getUnifiedGroupKey(status),
      typeLabel: '裝備',
      title: item.equipment_name,
      meta: `${item.member_name}｜${getEquipmentVariantLabel(item)}｜${item.quantity} 件｜${formatDate(item.transaction_date)}`,
      status,
      statusLabel: getUnifiedStatusLabel(status, 'equipment'),
      amount: Number(item.total_amount) || 0,
      amountClass: getUnifiedAmountClass(status),
      dateKey: item.picked_up_at || item.transaction_date,
      selectable: status === 'unpaid' && isEquipmentPaymentItemPayable(item),
      note: item.request_status ? `申請狀態：${getEquipmentRequestStatusLabel(item.request_status)}` : null
    })
  })

  equipmentPendingRequestItems.value.forEach((item) => {
    const status = getEquipmentRequestRecordStatus(item.request_status)
    rows.push({
      id: `equipment-request-${item.request_item_id}`,
      sourceId: item.request_id,
      kind: 'equipment-request',
      groupKey: getUnifiedGroupKey(status),
      typeLabel: '裝備',
      title: item.equipment_name,
      meta: `${item.member_name}｜${getEquipmentVariantLabel(item)}｜${item.quantity} 件`,
      status,
      statusLabel: getUnifiedStatusLabel(status, 'equipment-request'),
      amount: Number(item.total_amount) || 0,
      amountClass: getUnifiedAmountClass(status),
      dateKey: item.ready_at || item.approved_at || item.requested_at,
      selectable: false
    })
  })

  matchFeeItems.value.forEach((item) => {
    const status = item.payment_status || 'unpaid'
    rows.push({
      id: `match-fee-${item.id}`,
      sourceId: item.id,
      kind: 'match-fee',
      groupKey: getUnifiedGroupKey(status),
      typeLabel: '比賽費用',
      title: item.match_name,
      meta: `${item.member_name}｜${getMatchFeeSubtitle(item)}`,
      status,
      statusLabel: getUnifiedStatusLabel(status, 'match-fee'),
      amount: Number(item.amount) || 0,
      amountClass: getUnifiedAmountClass(status),
      dateKey: item.updated_at || item.match_date,
      selectable: status === 'unpaid',
      note: item.cancelled_reason || null
    })
  })

  return rows.sort((left, right) => right.dateKey.localeCompare(left.dateKey))
})

const unifiedPaymentRecordGroups = computed(() => {
  const groupMeta: Array<{
    key: UnifiedPaymentRecordGroupKey
    title: string
    className: string
    titleClass: string
  }> = [
    { key: 'unpaid', title: '待付款', className: 'border-red-100 bg-red-50/40', titleClass: 'text-red-700' },
    { key: 'pending', title: '待確認 / 處理中', className: 'border-amber-100 bg-amber-50/50', titleClass: 'text-amber-700' },
    { key: 'confirmed', title: '已確認', className: 'border-emerald-100 bg-emerald-50/50', titleClass: 'text-emerald-700' },
    { key: 'closed', title: '已退回 / 已取消', className: 'border-slate-100 bg-slate-50/70', titleClass: 'text-slate-600' }
  ]

  return groupMeta
    .map((group) => ({
      ...group,
      items: unifiedPaymentRecords.value.filter((item) => item.groupKey === group.key)
    }))
    .filter((group) => group.items.length > 0)
})

const unifiedPaymentCounts = computed(() => ({
  unpaid: unifiedPaymentRecords.value.filter((item) => item.groupKey === 'unpaid').length,
  pending: unifiedPaymentRecords.value.filter((item) => item.groupKey === 'pending').length
}))

const unifiedUnpaidTotalAmount = computed(() =>
  unifiedPaymentRecords.value
    .filter((item) => item.groupKey === 'unpaid')
    .reduce((total, item) => total + Number(item.amount || 0), 0)
)

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
        if (!includeMembershipFee.value || createDialogMember.value?.billing_mode === 'quarterly') {
          callback()
          return
        }

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
        if (isQuarterlyMembershipFlow.value) {
          callback()
          return
        }

        const normalized = Number(value) || 0
        if (normalized < 0) {
          callback(new Error('餘額扣抵不能小於 0'))
          return
        }
        if (normalized > selectedUnifiedTotalAmount.value) {
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

const getCurrentMonthlyFeePeriodKey = (date = dayjs()) =>
  date.date() >= 25 ? date.format('YYYY-MM') : date.subtract(1, 'month').format('YYYY-MM')

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
  if (status === 'pending_review' || status === 'pending') return '待確認'
  if (status === 'rejected') return '已退回'
  return '未繳 / 未確認'
}

const getStatusPillClass = (status?: string | null) => {
  if (status === 'paid' || status === 'approved') {
    return 'bg-emerald-50 border-emerald-200 text-emerald-700'
  }

  if (status === 'pending_review' || status === 'pending' || status === 'approved_request' || status === 'ready_for_pickup') {
    return 'bg-amber-50 border-amber-200 text-amber-700'
  }

  if (status === 'rejected') {
    return 'bg-red-50 border-red-200 text-red-700'
  }

  if (status === 'unpaid') {
    return 'bg-red-50 border-red-100 text-red-600'
  }

  if (status === 'cancelled') {
    return 'bg-slate-100 border-slate-200 text-slate-500'
  }

  return 'bg-gray-50 border-gray-200 text-gray-600'
}

const isPaidStatus = (status?: string | null) => status === 'paid' || status === 'approved'

const isPendingStatus = (status?: string | null) => status === 'pending_review'

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

const formatDate = (value?: string | null) => {
  if (!value) return '尚無資料'
  const parsed = dayjs(value)
  return parsed.isValid() ? parsed.format('YYYY-MM-DD') : '尚無資料'
}

const getEquipmentVariantLabel = (item: { size?: string | null; jersey_number?: number | string | null }) =>
  formatEquipmentVariantLabel(item)

const getMatchFeeSubtitle = (item: MatchFeeItem) => [
  item.tournament_name || null,
  item.category_group || null,
  formatDate(item.match_date),
  item.match_time || null
].filter(Boolean).join('｜')

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
    return Math.max(0, getQuarterlySubmissionItemAmount(
      exactSubmission,
      createDialogMember.value?.member_id || exactSubmission.member_id
    ))
  }

  return 0
}

const getQuarterlySubmissionItemAmount = (submission: MyPaymentSubmission, memberId: string) => {
  const item = submission.items?.find((item) => item.member_id === memberId)

  return item
    ? Math.max(0, Number(item.amount) || 0)
    : Math.max(0, Number(submission.amount) || 0)
}

const getQuarterlySubmissionItemBalanceAmount = (submission: MyPaymentSubmission, memberId: string) => {
  const item = submission.items?.find((item) => item.member_id === memberId)

  return item
    ? Math.max(0, Number(item.balance_amount) || 0)
    : Math.max(0, Number(submission.balance_amount) || 0)
}

const resolveQuarterlyMemberSnapshot = async (
  member: MyPaymentMember,
  periodKey: string
): Promise<QuarterlyPaymentMemberSnapshot> => {
  const [memberRecords, memberSubmissions, estimate] = await Promise.all([
    member.member_id === selectedMemberId.value ? Promise.resolve(records.value) : getMyPaymentRecords(member.member_id),
    member.member_id === selectedMemberId.value ? Promise.resolve(submissions.value) : listMyPaymentSubmissions(member.member_id),
    getMyPaymentSubmissionEstimate(member.member_id, periodKey).catch(() => null)
  ])

  const officialRecord = memberRecords.find((record) => record.billing_mode === 'quarterly' && record.period_key === periodKey)
  const periodSubmissions = memberSubmissions.filter((submission) =>
    submission.billing_mode === 'quarterly'
    && submission.period_key === periodKey
    && (
      submission.member_id === member.member_id
      || submission.items?.some((item) => item.member_id === member.member_id)
    )
  )
  const paidSubmission = periodSubmissions.find((submission) => isPaidStatus(submission.status))
  const pendingSubmission = periodSubmissions.find((submission) => isPendingStatus(submission.status))

  if (isPaidStatus(officialRecord?.status) || paidSubmission) {
    return {
      status: 'paid',
      amount: Math.max(0, Number(officialRecord?.amount ?? (paidSubmission ? getQuarterlySubmissionItemAmount(paidSubmission, member.member_id) : 0)) || 0),
      balance_amount: Math.max(0, Number(officialRecord?.balance_amount ?? (paidSubmission ? getQuarterlySubmissionItemBalanceAmount(paidSubmission, member.member_id) : 0)) || 0)
    }
  }

  if (isPendingStatus(officialRecord?.status) || pendingSubmission) {
    return {
      status: 'pending',
      amount: Math.max(0, Number(officialRecord?.amount ?? (pendingSubmission ? getQuarterlySubmissionItemAmount(pendingSubmission, member.member_id) : 0)) || 0),
      balance_amount: Math.max(0, Number(officialRecord?.balance_amount ?? (pendingSubmission ? getQuarterlySubmissionItemBalanceAmount(pendingSubmission, member.member_id) : 0)) || 0)
    }
  }

  return {
    status: 'unpaid',
    amount: Math.max(0, Number(officialRecord?.amount ?? estimate?.amount ?? 0) || 0),
    balance_amount: Math.max(0, Number(officialRecord?.balance_amount ?? 0) || 0)
  }
}

const refreshQuarterlyPaymentMemberSnapshots = async () => {
  const periodKey = submissionForm.period_key.trim().toUpperCase()

  if (!isQuarterlyMembershipFlow.value || !periodKey) {
    quarterlyMemberSnapshots.value = {}
    return
  }

  const snapshotPairs = await Promise.all(
    quarterlyPaymentCandidates.value.map(async (member) => [
      member.member_id,
      await resolveQuarterlyMemberSnapshot(member, periodKey)
    ] as const)
  )
  const nextSnapshots = Object.fromEntries(snapshotPairs)

  quarterlyMemberSnapshots.value = nextSnapshots
  quarterlyPaymentCandidates.value.forEach((member) => {
    const snapshot = nextSnapshots[member.member_id]
    const defaultAmount = Math.max(0, Number(snapshot?.amount || 0))
    if (quarterlyMemberAmounts[member.member_id] == null || Number(quarterlyMemberAmounts[member.member_id]) <= 0) {
      quarterlyMemberAmounts[member.member_id] = defaultAmount
    }
    if (quarterlyMemberBalanceAmounts[member.member_id] == null) {
      quarterlyMemberBalanceAmounts[member.member_id] = 0
    }
  })
  selectedQuarterlyMemberIds.value = selectedQuarterlyMemberIds.value.filter((memberId) => {
    const snapshot = nextSnapshots[memberId]
    return !snapshot || snapshot.status === 'unpaid'
  })
  if (selectedQuarterlyMemberIds.value.length === 0 && createDialogMember.value) {
    const preferredMemberId = createDialogMember.value.member_id
    const preferredSnapshot = nextSnapshots[preferredMemberId]
    const fallbackMember = quarterlyPaymentCandidates.value.find((member) =>
      nextSnapshots[member.member_id]?.status === 'unpaid'
    )
    const nextSelectedMemberId = (!preferredSnapshot || preferredSnapshot.status === 'unpaid')
      ? preferredMemberId
      : fallbackMember?.member_id

    if (nextSelectedMemberId) {
      selectedQuarterlyMemberIds.value = [nextSelectedMemberId]
    }
  }
  syncBalanceDeductionLimit()
}

const syncBalanceDeductionLimit = () => {
  if (isQuarterlyMembershipFlow.value) {
    submissionForm.balance_amount = quarterlyPaymentSummary.value.totalBalanceAmount
    return
  }

  submissionForm.balance_amount = clampBalanceDeduction(
    submissionForm.balance_amount,
    selectedUnifiedTotalAmount.value,
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
    await refreshQuarterlyPaymentMemberSnapshots()
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

const refreshCurrentDueEstimate = async () => {
  if (!selectedMember.value || !currentFeePeriodKey.value) {
    currentDueEstimate.value = null
    return
  }

  try {
    currentDueEstimate.value = await getMyPaymentSubmissionEstimate(
      selectedMember.value.member_id,
      currentFeePeriodKey.value
    )
  } catch (error) {
    currentDueEstimate.value = null
    console.warn('讀取本期繳費估算失敗', error)
  }
}

const resetQuarterlyPaymentDrafts = () => {
  Object.keys(quarterlyMemberAmounts).forEach((memberId) => {
    delete quarterlyMemberAmounts[memberId]
  })
  Object.keys(quarterlyMemberBalanceAmounts).forEach((memberId) => {
    delete quarterlyMemberBalanceAmounts[memberId]
  })
  quarterlyMemberSnapshots.value = {}
}

const hydrateSubmissionDefaults = (periodKeyOverride?: string, shouldIncludeMembership = canSelectMembershipFee.value) => {
  const preferredLinkedMember = linkedMembers.value.find((member) => member.member_id === selectedMember.value?.member_id)
    || linkedMembers.value[0]
    || null
  const targetMember = preferredLinkedMember
  const fallbackPeriodKey = targetMember?.billing_mode === 'quarterly'
    ? getCurrentQuarterKey()
    : getDefaultMonthlyPeriodKey()
  const normalizedPeriodKeyOverride = periodKeyOverride?.trim().toUpperCase() || ''

  submissionForm.member_id = targetMember?.member_id || ''
  submissionForm.period_key = normalizedPeriodKeyOverride || latestOfficialRecord.value?.period_key || fallbackPeriodKey
  submissionForm.amount = targetMember?.billing_mode === 'quarterly'
    ? resolveQuarterlyAmount(submissionForm.period_key)
    : 0
  submissionForm.balance_amount = 0
  selectedQuarterlyMemberIds.value = targetMember?.billing_mode === 'quarterly' && targetMember.member_id
    ? [targetMember.member_id]
    : []
  resetQuarterlyPaymentDrafts()
  currentSubmissionEstimate.value = null
  createDialogBalanceOverride.value = null
  includeMembershipFee.value = shouldIncludeMembership
  submissionForm.payment_method = authStore.profile?.preferred_payment_method || paymentMethodOptions[0]
  submissionForm.account_last_5 = authStore.profile?.preferred_account_last_5 || ''
  submissionForm.remittance_date = dayjs().format('YYYY-MM-DD')
  submissionForm.note = ''
}

const refreshUnifiedPaymentSources = async () => {
  const memberId = selectedMemberId.value

  if (!memberId) {
    selectedEquipmentTransactionIds.value = []
    selectedMatchFeeItemIds.value = []
    equipmentPaymentItems.value = []
    equipmentPendingRequestItems.value = []
    matchFeeItems.value = []
    equipmentPaymentSummary.value = createEmptyPaymentPanelSummary()
    matchFeeSummary.value = createEmptyPaymentPanelSummary()
    createDialogBalanceOverride.value = null
    return
  }

  const [equipmentResult, matchFeesResult, balanceResult] = await Promise.allSettled([
    equipmentPaymentsStore.loadMyItems(memberId),
    listMyMatchFeeItems(memberId),
    getPlayerBalance(memberId)
  ])

  if (equipmentResult.status === 'fulfilled') {
    equipmentPaymentItems.value = equipmentPaymentsStore.myItems
    equipmentPendingRequestItems.value = equipmentPaymentsStore.myPendingRequestItems
    const payableUnpaidEquipmentItems = equipmentPaymentItems.value.filter((item) =>
      item.payment_status === 'unpaid' && isEquipmentPaymentItemPayable(item)
    )
    equipmentPaymentSummary.value = {
      unpaidCount: payableUnpaidEquipmentItems.length,
      unpaidTotal: payableUnpaidEquipmentItems
        .reduce((total, item) => total + Number(item.total_amount || 0), 0),
      pendingCount: equipmentPaymentItems.value.filter((item) => item.payment_status === 'pending_review').length,
      pendingTotal: equipmentPaymentItems.value
        .filter((item) => item.payment_status === 'pending_review')
        .reduce((total, item) => total + Number(item.total_amount || 0), 0),
      firstUnpaidItemId: payableUnpaidEquipmentItems[0]?.transaction_id || null
    }
  } else {
    console.warn('讀取裝備付款資料失敗', equipmentResult.reason)
  }

  if (matchFeesResult.status === 'fulfilled') {
    matchFeeItems.value = matchFeesResult.value
    matchFeeSummary.value = {
      unpaidCount: matchFeeItems.value.filter((item) => item.payment_status === 'unpaid').length,
      unpaidTotal: matchFeeItems.value
        .filter((item) => item.payment_status === 'unpaid')
        .reduce((total, item) => total + Number(item.amount || 0), 0),
      pendingCount: matchFeeItems.value.filter((item) => item.payment_status === 'pending_review').length,
      pendingTotal: matchFeeItems.value
        .filter((item) => item.payment_status === 'pending_review')
        .reduce((total, item) => total + Number(item.amount || 0), 0),
      firstUnpaidItemId: matchFeeItems.value.find((item) => item.payment_status === 'unpaid')?.id || null
    }
  } else {
    console.warn('讀取比賽費用資料失敗', matchFeesResult.reason)
  }

  if (balanceResult.status === 'fulfilled') {
    createDialogBalanceOverride.value = balanceResult.value
    syncBalanceDeductionLimit()
  } else {
    console.warn('讀取球員餘額失敗，改用成員摘要餘額。', balanceResult.reason)
  }
}

const refreshCurrentMemberData = async () => {
  if (!selectedMemberId.value) {
    records.value = []
    submissions.value = []
    currentDueEstimate.value = null
    return
  }

  isRefreshing.value = true
  currentDueEstimate.value = null

  try {
    const [nextRecords, nextSubmissions] = await Promise.all([
      getMyPaymentRecords(selectedMemberId.value),
      listMyPaymentSubmissions(selectedMemberId.value)
    ])

    records.value = nextRecords
    submissions.value = nextSubmissions
    await refreshCurrentDueEstimate()
    await refreshUnifiedPaymentSources()
  } catch (error: any) {
    ElMessage.error(error?.message || '讀取繳費資訊失敗')
  } finally {
    isRefreshing.value = false
  }
}

const openCreateDialog = async (
  options: {
    periodKey?: string
    preset?: 'membership-fee' | 'equipment' | 'match-fees'
  } = {}
) => {
  if (!canCreateSubmissionForSelectedMember.value) {
    return
  }

  const preset = options.preset
  const preservedMembershipPeriodKey = includeMembershipFee.value
    ? submissionForm.period_key
    : options.periodKey
  hydrateSubmissionDefaults(
    preservedMembershipPeriodKey,
    preset ? preset === 'membership-fee' : includeMembershipFee.value || canSelectMembershipFee.value || selectedMember.value?.billing_mode === 'quarterly'
  )
  await refreshUnifiedPaymentSources()

  if (preset === 'equipment') {
    includeMembershipFee.value = false
    selectedEquipmentTransactionIds.value = equipmentUnpaidItems.value.map((item) => item.transaction_id)
    selectedMatchFeeItemIds.value = []
  } else if (preset === 'match-fees') {
    includeMembershipFee.value = false
    selectedEquipmentTransactionIds.value = []
    selectedMatchFeeItemIds.value = matchFeeUnpaidItems.value.map((item) => item.id)
  } else if (preset === 'membership-fee') {
    includeMembershipFee.value = true
  }

  await refreshSubmissionEstimate()
  if (includeMembershipFee.value && !canSelectMembershipFee.value) {
    includeMembershipFee.value = false
  }
  syncBalanceDeductionLimit()
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

const allocateBalanceDeduction = (
  requestedAmount: number,
  buckets: Array<{ key: 'membership' | 'equipment' | 'matchFees'; amount: number }>
) => {
  let remaining = clampBalanceDeduction(
    requestedAmount,
    selectedUnifiedTotalAmount.value,
    createDialogAvailableBalance.value
  )

  return buckets.reduce((result, bucket) => {
    const deduction = Math.min(Math.max(0, bucket.amount), remaining)
    remaining -= deduction
    return {
      ...result,
      [bucket.key]: deduction
    }
  }, {
    membership: 0,
    equipment: 0,
    matchFees: 0
  })
}

const buildSharedSubmissionPayload = (amount: number, balanceAmount: number) => {
  const externalAmount = getExternalPaymentAmount(amount, balanceAmount)

  return {
    payment_method: externalAmount > 0 ? submissionForm.payment_method : BALANCE_PAYMENT_METHOD,
    account_last_5: externalAmount > 0 && requiresAccountLast5(submissionForm.payment_method)
      ? normalizeAccountLast5(submissionForm.account_last_5)
      : null,
    remittance_date: externalAmount > 0 ? submissionForm.remittance_date : dayjs().format('YYYY-MM-DD'),
    note: submissionForm.note?.trim() || null,
    balance_amount: balanceAmount
  }
}

const submitPaymentSubmission = async () => {
  if (!formRef.value) {
    return
  }

  syncBalanceDeductionLimit()

  try {
    await formRef.value.validate()
  } catch {
    return
  }

  const quarterlyItemDrafts = isQuarterlyMembershipFlow.value
    ? selectedQuarterlyPaymentItems.value
    : []
  const quarterlyItemsToSubmit = isQuarterlyMembershipFlow.value
    ? quarterlyPaymentSummary.value.items
    : []
  const membershipAmount = includeMembershipFee.value
    ? isQuarterlyMembershipFlow.value
      ? quarterlyPaymentSummary.value.totalAmount
      : Number(submissionForm.amount) || 0
    : 0
  const equipmentItemsToSubmit = selectedEquipmentPaymentItems.value
  const matchFeeItemsToSubmit = selectedMatchFeePaymentItems.value
  const equipmentAmount = equipmentItemsToSubmit.reduce((total, item) => total + Number(item.total_amount || 0), 0)
  const matchFeeAmount = matchFeeItemsToSubmit.reduce((total, item) => total + Number(item.amount || 0), 0)

  if (membershipAmount + equipmentAmount + matchFeeAmount <= 0) {
    ElMessage.warning('請先勾選本次要回報的付款項目')
    return
  }

  if (includeMembershipFee.value && membershipAmount <= 0) {
    ElMessage.warning('請確認月費 / 季費金額大於 0')
    return
  }

  if (isMultiQuarterlyMembershipSelected.value && (equipmentAmount > 0 || matchFeeAmount > 0)) {
    ElMessage.warning('多位球員季費一次繳費時，請不要同時勾選裝備或比賽費用')
    return
  }

  if (isQuarterlyMembershipFlow.value) {
    const validationErrors = validateQuarterlyPaymentSubmissionItems(quarterlyItemDrafts, {
      periodKey: submissionForm.period_key,
      availableBalances: Object.fromEntries(
        quarterlyPaymentCandidates.value.map((member) => [
          member.member_id,
          member.balance_amount || 0
        ])
      )
    })

    if (validationErrors.length > 0) {
      ElMessage.warning(validationErrors[0])
      return
    }
  }

  const balanceAllocations = allocateBalanceDeduction(
    Number(submissionForm.balance_amount) || 0,
    [
      { key: 'membership', amount: membershipAmount },
      { key: 'equipment', amount: equipmentAmount },
      { key: 'matchFees', amount: matchFeeAmount }
    ]
  )

  isSubmitting.value = true

  const successLabels: string[] = []
  const failureLabels: string[] = []

  try {
    if (includeMembershipFee.value && membershipAmount > 0) {
      try {
        const singleQuarterlyItem = quarterlyItemsToSubmit[0]
        const createdSubmission = shouldUseGroupedQuarterlySubmission.value
          ? await createMyQuarterlyPaymentSubmission({
            items: quarterlyItemsToSubmit,
            ...buildSharedSubmissionPayload(membershipAmount, quarterlyPaymentSummary.value.totalBalanceAmount)
          })
          : await createMyPaymentSubmission({
            member_id: isQuarterlyMembershipFlow.value && singleQuarterlyItem
              ? singleQuarterlyItem.member_id
              : submissionForm.member_id,
            period_key: isQuarterlyMembershipFlow.value && singleQuarterlyItem
              ? singleQuarterlyItem.period_key
              : submissionForm.period_key.trim().toUpperCase(),
            amount: membershipAmount,
            ...buildSharedSubmissionPayload(membershipAmount, balanceAllocations.membership)
          })

        if (createdSubmission) {
          submissions.value = [createdSubmission, ...submissions.value]
          includeMembershipFee.value = false
          selectedQuarterlyMemberIds.value = []
          resetQuarterlyPaymentDrafts()
          successLabels.push('月費 / 季費')

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
      } catch (error: any) {
        failureLabels.push(`月費 / 季費：${error?.message || '送出失敗'}`)
      }
    }

    if (equipmentItemsToSubmit.length > 0) {
      const transactionIds = equipmentItemsToSubmit.map((item) => item.transaction_id)

      try {
        const equipmentSubmission: EquipmentPaymentSubmission = await equipmentPaymentsStore.submitPayment(
          {
            transaction_ids: transactionIds,
            ...buildSharedSubmissionPayload(equipmentAmount, balanceAllocations.equipment)
          },
          selectedMemberId.value || null
        )

        selectedEquipmentTransactionIds.value = selectedEquipmentTransactionIds.value.filter((id) => !transactionIds.includes(id))
        successLabels.push('裝備')

        void dispatchPushNotification({
          title: '收到裝備付款回報',
          body: `${equipmentSubmission.member_name} 回報裝備付款 ${formatCurrency(equipmentSubmission.amount)}，請協助確認。`,
          url: `/fees?tab=equipment&highlight_equipment_submission_id=${equipmentSubmission.id}`,
          feature: 'fees',
          action: 'EDIT',
          eventKey: buildGroupedPushEventKey('equipment-payment-submitted', transactionIds)
        }).catch((pushError) => {
          console.warn('裝備付款回報通知發送失敗', pushError)
        })
      } catch (error: any) {
        failureLabels.push(`裝備：${error?.message || '送出失敗'}`)
      }
    }

    if (matchFeeItemsToSubmit.length > 0) {
      const matchFeeItemIds = matchFeeItemsToSubmit.map((item) => item.id)

      try {
        const matchSubmission: MatchPaymentSubmission = await createMatchPaymentSubmission({
          match_fee_item_ids: matchFeeItemIds,
          ...buildSharedSubmissionPayload(matchFeeAmount, balanceAllocations.matchFees)
        })

        selectedMatchFeeItemIds.value = selectedMatchFeeItemIds.value.filter((id) => !matchFeeItemIds.includes(id))
        successLabels.push('比賽費用')

        void dispatchPushNotification({
          title: '收到比賽費用付款回報',
          body: `${matchSubmission.member_name} 回報比賽費用 ${formatCurrency(matchSubmission.amount)}，請協助確認。`,
          url: `/fees?tab=match-fees&highlight_match_submission_id=${matchSubmission.id}`,
          feature: 'fees',
          action: 'EDIT',
          eventKey: buildGroupedPushEventKey('match-fee-payment-submitted', matchFeeItemIds)
        }).catch((pushError) => {
          console.warn('比賽費用付款回報通知發送失敗', pushError)
        })
      } catch (error: any) {
        failureLabels.push(`比賽費用：${error?.message || '送出失敗'}`)
      }
    }

    if (successLabels.length > 0) {
      await refreshCurrentMemberData()
    }

    if (failureLabels.length === 0) {
      isCreateDialogOpen.value = false
      ElMessage.success(`${successLabels.join('、')}付款回報已送出，等待管理員確認`)
    } else if (successLabels.length > 0) {
      ElMessage.warning(`部分付款回報已送出：${successLabels.join('、')}；失敗：${failureLabels.join('；')}`)
    } else {
      ElMessage.error(failureLabels.join('；') || '送出付款回報失敗')
    }
  } finally {
    isSubmitting.value = false
  }
}

const isUnifiedRecordSelected = (item: UnifiedPaymentRecord) => {
  if (item.kind === 'membership') {
    return includeMembershipFee.value && submissionForm.period_key === item.periodKey
  }

  if (item.kind === 'equipment') {
    return selectedEquipmentTransactionIds.value.includes(item.sourceId)
  }

  if (item.kind === 'match-fee') {
    return selectedMatchFeeItemIds.value.includes(item.sourceId)
  }

  return false
}

const setArraySelection = (values: string[], value: string, selected: boolean) => {
  if (selected) {
    return values.includes(value) ? values : [...values, value]
  }

  return values.filter((item) => item !== value)
}

const toggleUnifiedRecordSelection = (item: UnifiedPaymentRecord, selected: boolean) => {
  if (item.kind === 'membership') {
    if (!item.periodKey) return

    includeMembershipFee.value = selected

    if (selected) {
      const targetMember = linkedMembers.value.find((member) => member.member_id === selectedMemberId.value)
        || linkedMembers.value[0]
        || null

      submissionForm.member_id = targetMember?.member_id || ''
      submissionForm.period_key = item.periodKey
      submissionForm.amount = Number(item.amount) || 0
      void refreshSubmissionEstimate()
    }

    return
  }

  if (item.kind === 'equipment') {
    selectedEquipmentTransactionIds.value = setArraySelection(
      selectedEquipmentTransactionIds.value,
      item.sourceId,
      selected
    )
    return
  }

  if (item.kind === 'match-fee') {
    selectedMatchFeeItemIds.value = setArraySelection(
      selectedMatchFeeItemIds.value,
      item.sourceId,
      selected
    )
  }
}

watch(selectedMemberId, async (nextMemberId, previousMemberId) => {
  if (isBootstrapping.value || !nextMemberId || nextMemberId === previousMemberId) {
    return
  }

  equipmentPaymentSummary.value = createEmptyPaymentPanelSummary()
  matchFeeSummary.value = createEmptyPaymentPanelSummary()
  selectedQuarterlyMemberIds.value = []
  resetQuarterlyPaymentDrafts()
  selectedEquipmentTransactionIds.value = []
  selectedMatchFeeItemIds.value = []
  equipmentPaymentItems.value = []
  equipmentPendingRequestItems.value = []
  matchFeeItems.value = []
  createDialogBalanceOverride.value = null
  await refreshCurrentMemberData()
})

watch(
  () => submissionForm.member_id,
  async (nextMemberId, previousMemberId) => {
    if (!isCreateDialogOpen.value || !nextMemberId || nextMemberId === previousMemberId) {
      return
    }

    const targetMember = members.value.find((member) => member.member_id === nextMemberId)
    const nextDefaultPeriodKey = targetMember?.billing_mode === 'quarterly'
      ? getCurrentQuarterKey()
      : getDefaultMonthlyPeriodKey()

    submissionForm.period_key = nextDefaultPeriodKey
    selectedQuarterlyMemberIds.value = targetMember?.billing_mode === 'quarterly' && targetMember.member_id
      ? [targetMember.member_id]
      : []
    resetQuarterlyPaymentDrafts()
    await refreshSubmissionEstimate()
  }
)

watch(
  () => submissionForm.period_key,
  async (nextPeriodKey, previousPeriodKey) => {
    if (!isCreateDialogOpen.value || !nextPeriodKey || nextPeriodKey === previousPeriodKey) {
      return
    }

    if (isQuarterlyMembershipFlow.value) {
      resetQuarterlyPaymentDrafts()
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

watch(
  selectedUnifiedTotalAmount,
  () => {
    syncBalanceDeductionLimit()
  }
)

watch(
  selectedQuarterlyPaymentItems,
  () => {
    syncBalanceDeductionLimit()

    if (isMultiQuarterlyMembershipSelected.value) {
      selectedEquipmentTransactionIds.value = []
      selectedMatchFeeItemIds.value = []
    }
  },
  { deep: true }
)

watch(includeMembershipFee, (enabled) => {
  if (!enabled) {
    formRef.value?.clearValidate?.(['period_key', 'amount'])
  }

  syncBalanceDeductionLimit()
})

watch(equipmentUnpaidItems, (items) => {
  const unpaidIds = new Set(items.map((item) => item.transaction_id))
  selectedEquipmentTransactionIds.value = selectedEquipmentTransactionIds.value.filter((id) => unpaidIds.has(id))
}, { deep: true })

watch(matchFeeUnpaidItems, (items) => {
  const unpaidIds = new Set(items.map((item) => item.id))
  selectedMatchFeeItemIds.value = selectedMatchFeeItemIds.value.filter((id) => unpaidIds.has(id))
}, { deep: true })

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
