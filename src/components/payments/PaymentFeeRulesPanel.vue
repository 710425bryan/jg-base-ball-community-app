<template>
  <div data-test="payment-fee-rules" class="mt-4 border-t border-slate-100 pt-4">
    <button
      type="button"
      data-test="payment-fee-rules-toggle"
      class="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left transition-colors hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
      :aria-expanded="expanded"
      :aria-controls="contentId"
      @click="expanded = !expanded"
    >
      <span class="flex min-w-0 flex-wrap items-center gap-2">
        <span class="text-sm font-bold text-slate-700">收費時間與規則</span>
        <span class="rounded-full bg-primary/5 px-2 py-1 text-xs font-bold text-primary">管理員專用</span>
      </span>
      <span class="flex shrink-0 items-center gap-2 text-sm font-bold text-slate-500">
        {{ expanded ? '收起' : '展開' }}
        <ArrowDown class="h-4 w-4 transition-transform" :class="{ 'rotate-180': expanded }" aria-hidden="true" />
      </span>
    </button>

    <div v-if="expanded" :id="contentId" data-test="payment-fee-rules-content" class="mt-3 space-y-4">
      <p class="text-sm leading-relaxed text-slate-500">
        開放時間以台灣時間計算；已開放的過去未繳期別仍可補繳。月費扣減後最低為 0 元；實際金額以個別收費設定與當期帳款為準。
      </p>

      <div class="grid min-w-0 gap-3 md:grid-cols-2">
        <article
          v-for="rule in feeRules"
          :key="rule.id"
          :data-test="`payment-fee-rule-${rule.id}`"
          class="min-w-0 rounded-2xl border border-slate-100 bg-slate-50/60 p-4"
        >
          <h4 class="text-sm font-bold text-slate-800">{{ rule.title }}</h4>
          <dl class="mt-3 space-y-2 text-sm leading-relaxed">
            <div>
              <dt class="font-bold text-primary">開放時間</dt>
              <dd class="mt-1 break-words text-slate-600">{{ rule.opening }}</dd>
            </div>
            <div>
              <dt class="font-bold text-slate-500">計算與適用規則</dt>
              <dd class="mt-1 break-words text-slate-600">{{ rule.calculation }}</dd>
            </div>
          </dl>
        </article>
      </div>

      <div class="rounded-2xl border border-primary/10 bg-primary/5 p-4">
        <h4 class="text-sm font-bold text-slate-800">共通規則</h4>
        <ul class="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-slate-600">
          <li>月費最早從加入月份起算，季費最早從包含加入月份的季度起算；退隊、離隊、關閉或畢業成員不產生新期別隊費，既有付款紀錄保留。</li>
          <li>半價與手足優惠依收費模式及個別設定判定；符合條件的手足即使分屬月繳與季繳仍可納入優惠，主要繳費人及手足須維持有效身分。</li>
          <li>隊費、比賽費與裝備款可使用球員餘額扣抵，付款確認後才正式扣除；餘額不足不可扣成負數，系統應收金額不因扣抵而改變。</li>
          <li>月費／季費實付與系統應付不同時，須填寫原因並再次確認；短繳不可核准，多繳經確認後才依系統差額轉入球員餘額。</li>
          <li>待確認或已確認的款項不可重複回報。原回報者可更正或刪除仍待審且未入帳的回報；更換球員、期別或品項需刪除後重填，已付款及有付款歷史的金額快照保留。</li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, useId } from 'vue'
import { ArrowDown } from '@element-plus/icons-vue'
import { MONTHLY_ADVANCE_PAYMENT_NEXT_PERIOD_SWITCH_DAY } from '@/utils/monthlyPaymentPeriods'
import { QUARTERLY_PAYMENT_NEXT_PERIOD_SWITCH_DAY } from '@/utils/quarterlyPaymentSubmissions'

const expanded = ref(false)
const contentId = `payment-fee-rules-${useId()}`
const advanceOpening = `每月 ${MONTHLY_ADVANCE_PAYMENT_NEXT_PERIOD_SWITCH_DAY} 日起開放下個月，例如 10 月費用於 9 月 ${MONTHLY_ADVANCE_PAYMENT_NEXT_PERIOD_SWITCH_DAY} 日開放。`
const arrearsOpening = '月份結束後，次月 1 日開放，例如 10 月費用於 11 月 1 日開放。'

const feeRules = [
  {
    id: 'chunggang-monthly',
    title: '中港校隊計次月費',
    opening: arrearsOpening,
    calculation: '（中港總部當月訓練日數 − 訓練日內全日／上午請假日數）× 校隊單次費率 − 手動扣減；下午請假不扣堂。一般與優惠費率依中港校隊設定。'
  },
  {
    id: 'junior-single-monthly',
    title: '國中部單次月費',
    opening: advanceOpening,
    calculation: '國中部設定的單次月費 − 手動扣減；符合半價／手足優惠者按規則折半。訓練日內請假天數只作紀錄，不扣月費。'
  },
  {
    id: 'junior-training-monthly',
    title: '國中部訓練日期月費',
    opening: advanceOpening,
    calculation: '國中部當月訓練日數 × 國中部單次費率 − 手動扣減；一般與優惠費率依國中部設定。請假天數只作紀錄，不扣金額，仍採預繳。'
  },
  {
    id: 'community-fixed-monthly',
    title: '社區球員固定月繳',
    opening: advanceOpening,
    calculation: '球員個別設定的固定月費 − 手動扣減；不依訓練堂數或請假計算，也不另收季費。'
  },
  {
    id: 'community-session-monthly',
    title: '社區球員計次月費',
    opening: arrearsOpening,
    calculation: '（所屬訓練項目當月訓練日數 − 訓練日內全日／上午請假日數）× 球員個別單次費率 − 手動扣減；下午請假不扣堂，不另收季費。'
  },
  {
    id: 'community-quarterly',
    title: '社區球員季繳',
    opening: `每季最後一個月 ${QUARTERLY_PAYMENT_NEXT_PERIOD_SWITCH_DAY} 日起開放下一季，即 3／6／9／12 月 ${QUARTERLY_PAYMENT_NEXT_PERIOD_SWITCH_DAY} 日。`,
    calculation: '依當季學費、加收品項與半價／手足優惠計算，已有本人帳款時優先採用本人金額。訓練堂數不足的補償另由管理員審核，核准後才轉入球員餘額。'
  },
  {
    id: 'match',
    title: '比賽費',
    opening: '依單場賽事，由具費用編輯權限的管理者確認費用並手動開放；沒有固定月／季開放日。',
    calculation: '依單場每人費用、比賽費獨立開關及生效日期、參賽與請假狀態、單場免繳判斷。尚未開放或已取消的費用不可回報付款；不收隊費不代表免繳比賽費。'
  },
  {
    id: 'equipment',
    title: '裝備款',
    opening: '加購申請核准後即可回報，或已有待付款裝備交易時可回報；不需等備貨或領取，沒有固定開放日。',
    calculation: '依裝備交易金額（單價 × 數量）計算。付款確認與備貨／領取分開處理；付款完成不代表商品已領取。'
  },
  {
    id: 'no-membership-fee',
    title: '不收隊費',
    opening: '不產生新的月費／季費，沒有隊費開放期別；既有帳款與付款歷史仍保留。',
    calculation: '只免收隊費；比賽費依個別開關與單場規則另計，裝備自費及付款流程仍適用。'
  }
] as const
</script>
