<script setup lang="ts">
import { Lock } from '@element-plus/icons-vue'

defineProps<{ message: string }>()
defineEmits<{ dismiss: [] }>()
</script>

<template>
  <main class="auth-access-notice flex items-center justify-center bg-slate-50 px-4 py-8">
    <section role="alert" aria-labelledby="access-notice-title" class="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-8">
      <img src="/logo.jpg" alt="中港熊戰棒球隊" class="mx-auto mb-6 h-24 w-24 rounded-2xl object-contain" />
      <div class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-50 text-red-600">
        <Lock class="h-7 w-7" aria-hidden="true" />
      </div>
      <h1 id="access-notice-title" class="text-2xl font-black text-slate-800">已自動登出</h1>
      <p class="mt-4 break-words text-base font-bold leading-relaxed text-red-600">{{ message }}</p>
      <p class="mt-3 text-sm leading-relaxed text-slate-500">如有疑問，請聯絡球隊管理員。</p>
      <button type="button" class="mt-7 min-h-11 w-full rounded-xl bg-primary px-4 py-3 font-bold text-white transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2" @click="$emit('dismiss')">
        返回首頁
      </button>
    </section>
  </main>
</template>

<style scoped>
.auth-access-notice {
  min-height: 100vh;
  min-height: 100dvh;
  padding-top: max(2rem, env(safe-area-inset-top));
  padding-bottom: max(2rem, env(safe-area-inset-bottom));
}
</style>
