<template>
  <div class="animate-fade-in">
    <h2 class="text-2xl font-extrabold text-gray-800 mb-6 tracking-tight">後台帳號管理</h2>
    <div class="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100/80 overflow-hidden">
      <ul class="divide-y divide-gray-100/80">
        <li v-for="i in 3" :key="i" class="p-4 sm:p-5 flex items-center justify-between hover:bg-gray-50/80 transition-colors cursor-pointer group">
          <div class="flex items-center space-x-4">
            <div class="w-11 h-11 bg-orange-50 text-primary rounded-xl flex items-center justify-center font-extrabold shadow-sm border border-orange-100/50 group-hover:bg-primary group-hover:text-white transition-colors">
              U{{ i }}
            </div>
            <div>
              <div class="font-bold text-gray-800">總教練 {{ i }}</div>
              <div class="text-xs font-medium text-gray-500 mt-0.5">coach{{ i }}@example.com</div>
            </div>
          </div>
          <button class="text-gray-400 hover:text-primary p-2 rounded-lg hover:bg-orange-50 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" /></svg>
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>

<style scoped>
.animate-fade-in { animation: fadeIn 0.4s ease-out; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
</style>

<script setup lang="ts">
</script>
