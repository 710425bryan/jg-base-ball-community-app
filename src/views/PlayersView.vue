<template>
  <div class="animate-fade-in">
    <div class="flex justify-between items-center mb-6">
      <h2 class="text-2xl font-extrabold text-gray-800 tracking-tight">球員名單</h2>
      <button class="text-primary font-bold text-sm bg-primary/10 px-4 py-2 rounded-xl hover:bg-primary/20 transition-colors">管理</button>
    </div>
    <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
      <div v-for="i in 8" :key="i" class="bg-white rounded-2xl p-5 text-center shadow-[0_4px_20px_rgb(0,0,0,0.03)] border border-gray-100/80 hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)] hover:-translate-y-1 transition-all duration-300">
        <div class="w-16 h-16 bg-gradient-to-tr from-gray-100 to-gray-200 rounded-full mx-auto mb-4 border-2 border-white shadow-sm flex items-center justify-center text-gray-400">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd" /></svg>
        </div>
        <div class="font-bold text-gray-800">王大明 {{ i }}</div>
        <div class="text-xs font-semibold text-primary bg-primary/10 inline-block px-2 py-0.5 rounded-full mt-2">背號: #{{ i * 10 }}</div>
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
