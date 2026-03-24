<template>
  <div class="animate-fade-in">
    <div class="mb-6 flex items-center justify-between">
      <h2 class="text-2xl font-extrabold text-gray-800 tracking-tight">首頁大廳</h2>
    </div>
    
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <!-- 近期賽事卡片 -->
      <div class="relative overflow-hidden bg-white p-6 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100/60 transition-transform duration-300 hover:-translate-y-1">
        <div class="absolute top-0 left-0 w-1 h-full bg-primary"></div>
        <div class="flex items-center gap-3 mb-4">
          <div class="p-2.5 bg-orange-50 rounded-xl text-primary">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <h3 class="font-bold text-lg text-gray-800">近期賽事</h3>
        </div>
        <div class="p-4 bg-gray-50 rounded-xl border border-dashed border-gray-200 text-center">
          <p class="text-gray-500 font-medium text-sm">目前暫無賽事排程 ⚾</p>
        </div>
      </div>

      <!-- 最新公告卡片 -->
      <div class="relative overflow-hidden bg-white p-6 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100/60 transition-transform duration-300 hover:-translate-y-1">
        <div class="absolute top-0 left-0 w-1 h-full bg-secondary"></div>
        <div class="flex items-center gap-3 mb-4">
          <div class="p-2.5 bg-yellow-50 rounded-xl text-yellow-600">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
            </svg>
          </div>
          <h3 class="font-bold text-lg text-gray-800">最新公告</h3>
        </div>
        <div class="p-4 bg-gradient-to-r from-orange-50 to-yellow-50 rounded-xl border border-orange-100/50">
          <p class="text-orange-800 font-semibold mb-1">🎉 歡迎使用棒球社區</p>
          <p class="text-orange-600/80 text-sm">全新的介面與體驗，讓我們一起揮灑汗水！</p>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.animate-fade-in {
  animation: fadeIn 0.4s ease-out;
}
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>

<script setup lang="ts">
</script>
