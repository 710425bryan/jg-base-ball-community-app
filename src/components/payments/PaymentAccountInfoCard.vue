<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { ArrowDown, ArrowUp, CopyDocument, Wallet } from '@element-plus/icons-vue'

const props = withDefaults(defineProps<{
  compact?: boolean
}>(), {
  compact: false
})

const paymentAccount = {
  bankName: '中華郵政',
  bankCode: '700',
  accountNumber: '2445012-0006187',
  accountName: '陳雅妤',
  branchName: '新莊郵局',
  imageUrl: '/payment-account/post-office-account.jpg'
}

const isExpanded = ref(false)

const cardClass = computed(() => [
  'rounded-3xl border border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-amber-50 shadow-sm overflow-hidden',
  props.compact ? 'p-4' : 'p-5 md:p-6'
])

const contentId = computed(() => props.compact ? 'payment-account-info-compact' : 'payment-account-info')

const layoutClass = computed(() => [
  'grid gap-4',
  props.compact
    ? 'md:grid-cols-[minmax(0,1fr)_minmax(12rem,16rem)] md:items-start'
    : 'lg:grid-cols-[minmax(0,1.05fr)_minmax(18rem,0.95fr)] lg:items-stretch'
])

const imageClass = computed(() => [
  'h-auto w-full object-contain',
  props.compact ? 'max-h-48 md:max-h-44' : 'max-h-[22rem]'
])

const accountRows = computed(() => [
  { label: '銀行代號', value: paymentAccount.bankCode },
  { label: '戶名', value: paymentAccount.accountName },
  { label: '分局', value: paymentAccount.branchName }
])

const copyWithTextarea = (value: string) => {
  const textarea = document.createElement('textarea')
  textarea.value = value
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)

  try {
    textarea.select()

    if (!document.execCommand('copy')) {
      throw new Error('copy failed')
    }
  } finally {
    document.body.removeChild(textarea)
  }
}

const copyToClipboard = async (value: string, label: string) => {
  try {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(value)
      } catch {
        copyWithTextarea(value)
      }
    } else {
      copyWithTextarea(value)
    }

    ElMessage.success(`${label}已複製`)
  } catch {
    ElMessage.warning('無法自動複製，請手動複製帳戶資訊')
  }
}
</script>

<template>
  <section :class="cardClass">
    <button
      type="button"
      class="flex w-full flex-col gap-3 text-left sm:flex-row sm:items-center sm:justify-between"
      :aria-expanded="isExpanded"
      :aria-controls="contentId"
      @click="isExpanded = !isExpanded"
    >
      <span class="flex min-w-0 items-center gap-3">
        <span class="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white">
          <el-icon><Wallet /></el-icon>
        </span>
        <span class="min-w-0">
          <span class="block text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">繳費帳戶</span>
          <span class="mt-1 block text-lg font-black text-slate-800">球隊收款帳戶</span>
          <span class="mt-1 block truncate text-sm font-bold text-slate-500">
            {{ paymentAccount.bankName }} {{ paymentAccount.bankCode }}｜{{ paymentAccount.accountName }}
          </span>
        </span>
      </span>

      <span class="flex w-full items-center justify-between gap-3 rounded-2xl border border-white/80 bg-white/80 px-4 py-3 text-sm font-black text-emerald-700 shadow-sm sm:w-auto">
        <span>{{ isExpanded ? '收起帳戶資訊' : '查看帳戶資訊' }}</span>
        <el-icon>
          <ArrowUp v-if="isExpanded" />
          <ArrowDown v-else />
        </el-icon>
      </span>
    </button>

    <div v-show="isExpanded" :id="contentId" :class="layoutClass" class="mt-4 border-t border-emerald-100/80 pt-4">
      <div class="min-w-0 self-center">
        <p class="text-sm font-bold text-slate-500">
          轉帳或郵局匯款後，請在付款回報填寫匯款方式、日期與帳號後五碼。
        </p>

        <div class="mt-4 rounded-2xl border border-white/80 bg-white/90 p-4 shadow-sm">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div class="min-w-0">
              <div class="text-xs font-bold text-gray-400">帳號</div>
              <div class="mt-1 break-all font-mono text-xl font-black text-slate-900 sm:text-2xl">
                {{ paymentAccount.accountNumber }}
              </div>
            </div>
            <button
              type="button"
              class="inline-flex h-11 w-full shrink-0 items-center justify-center gap-2 rounded-2xl border border-emerald-100 bg-emerald-50 px-4 text-sm font-black text-emerald-700 transition-colors hover:border-emerald-200 hover:bg-emerald-100 sm:w-auto"
              aria-label="複製繳費帳號"
              title="複製繳費帳號"
              @click="copyToClipboard(paymentAccount.accountNumber.replace('-', ''), '繳費帳號')"
            >
              <el-icon><CopyDocument /></el-icon>
              <span>複製帳號</span>
            </button>
          </div>

          <div class="mt-4 grid gap-3 sm:grid-cols-3">
            <div v-for="row in accountRows" :key="row.label" class="min-w-0">
              <div class="text-xs font-bold text-gray-400">{{ row.label }}</div>
              <div class="mt-1 break-words font-black text-slate-800">{{ row.value }}</div>
            </div>
          </div>

          <div class="mt-4 flex flex-col gap-3 border-t border-gray-100 pt-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <span class="font-bold text-slate-500">{{ paymentAccount.bankName }}</span>
            <button
              type="button"
              class="inline-flex h-10 w-full shrink-0 items-center justify-center gap-2 rounded-xl border border-gray-200 px-3 font-bold text-gray-500 transition-colors hover:border-emerald-200 hover:text-emerald-700 sm:w-auto"
              aria-label="複製銀行代號"
              title="複製銀行代號"
              @click="copyToClipboard(paymentAccount.bankCode, '銀行代號')"
            >
              <el-icon><CopyDocument /></el-icon>
              <span>複製代號</span>
            </button>
          </div>
        </div>
      </div>

      <figure class="overflow-hidden rounded-2xl border border-white/80 bg-white/90 shadow-sm">
        <img
          :src="paymentAccount.imageUrl"
          alt="中華郵政繳費帳戶圖片"
          :class="imageClass"
          loading="lazy"
          decoding="async"
        />
        <figcaption class="border-t border-gray-100 px-4 py-3 text-xs font-bold text-slate-500">
          中華郵政帳戶圖片，可與上方帳號資訊核對。
        </figcaption>
      </figure>
    </div>
  </section>
</template>
