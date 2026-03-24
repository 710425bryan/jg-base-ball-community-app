<template>
  <div class="animate-fade-in">
    <div class="mb-6 flex items-center justify-between">
      <h2 class="text-2xl font-extrabold text-gray-800 tracking-tight">請假系統</h2>
    </div>
    
    <div class="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100/60 overflow-hidden text-sm">
      <div class="p-5 flex items-center justify-between border-b border-gray-100 bg-gray-50/50">
        <span class="font-bold text-gray-700">待審核的請假</span>
        <span class="bg-primary/10 text-primary font-bold px-3 py-1 rounded-full text-xs">2 件</span>
      </div>
      <div class="p-8 flex flex-col items-center justify-center text-gray-400">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-10 w-10 mb-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
        <span>目前顯示近期請假紀錄</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.animate-fade-in { animation: fadeIn 0.4s ease-out; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
</style>

<script setup lang="ts">
</script>
