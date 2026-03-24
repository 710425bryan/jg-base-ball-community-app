<template>
  <div class="h-full flex flex-col animate-fade-in">
    <div class="flex justify-between items-center mb-6">
      <h2 class="text-2xl font-extrabold text-gray-800 tracking-tight">行事曆</h2>
      <button class="bg-primary hover:bg-primary-hover active:scale-95 text-white px-5 py-2.5 rounded-xl shadow-md shadow-primary/30 text-sm font-bold transition-all">
        <span class="flex items-center gap-1">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" /></svg>
          新增
        </span>
      </button>
    </div>
    <div class="flex-1 bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100/60 p-6 flex flex-col items-center justify-center min-h-[400px]">
      <div class="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4 text-gray-300">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
      </div>
      <p class="text-gray-400 font-medium">行事曆元件建置中</p>
    </div>
  </div>
</template>

<style scoped>
.animate-fade-in { animation: fadeIn 0.4s ease-out; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
</style>

<script setup lang="ts">
</script>
