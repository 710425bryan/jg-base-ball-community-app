<template>
  <div class="h-full flex-1 flex flex-col animate-fade-in relative">
    <div class="flex justify-between items-center mb-6 shrink-0">
      <h2 class="text-2xl font-extrabold text-gray-800 tracking-tight">行事曆與賽事</h2>
      <button @click="showParserInfo = true" class="bg-white border border-gray-200 hover:bg-gray-50 active:scale-95 text-gray-600 px-4 py-2.5 rounded-xl shadow-sm text-sm font-bold transition-all flex items-center gap-2">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
        同步說明
      </button>
    </div>

    <!-- Google Calendar 嵌入區塊 -->
    <div class="flex-1 bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100/60 p-2 md:p-4 w-full relative min-h-[calc(100dvh-240px)] md:min-h-[calc(100vh-160px)] overflow-hidden">
      <iframe 
        class="absolute inset-0 p-2 md:p-4"
        src="https://calendar.google.com/calendar/embed?src=jg.baseball.bear@gmail.com&ctz=Asia/Taipei&bgcolor=%23ffffff&color=%23ea580c&showTitle=0&showNav=1&showPrint=0&showCalendars=0&showTz=0" 
        style="border:none; border-radius: 8px;" 
        width="100%" 
        height="100%" 
        frameborder="0" 
        scrolling="no">
      </iframe>
    </div>

    <!-- 同步說明彈窗 -->
    <div v-if="showParserInfo" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm animate-fade-in">
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col max-h-[80vh]">
        <div class="px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
          <h3 class="font-bold text-gray-800 text-lg flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-orange-500" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clip-rule="evenodd" /></svg>
            賽事解析與同步機制
          </h3>
          <button @click="showParserInfo = false" class="text-gray-400 hover:text-gray-600 transition-colors p-1">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
        <div class="p-6 overflow-y-auto text-sm text-gray-600 space-y-4">
          <p>系統已於底層實作了 <strong><code>googleCalendarParser.ts</code></strong> 模組，具備以下能力：</p>
          <ul class="list-disc pl-5 space-y-2 text-gray-700">
            <li>自動透過 Regex 擷取標題中的「賽事名稱」與「對戰對手」。</li>
            <li>完整支援您的「組別/類別、賽事等級、集合時間、帶隊教練、參賽球員」多行格式解析。</li>
            <li><strong class="text-orange-600">自動防重複機制</strong>：同步時會比對 Google 原始 ID；若建立新賽事，也會比對「日期+時間+標題」，徹底解決同時間戳記重複產生的 Bug。</li>
          </ul>
          <div class="bg-orange-50 p-3 rounded-lg border border-orange-100 text-orange-800 text-xs mt-4">
            要將這份 Google 行事曆資料真正寫進您的資料庫，需經過您的後端環境允許（像是串聯 Zapier 或開啟 API 金鑰）。當前畫面已為您嵌入預設的 Google Calendar 介面。
          </div>
        </div>
        <div class="p-4 border-t border-gray-100 bg-gray-50 flex justify-end">
          <button @click="showParserInfo = false" class="px-5 py-2 bg-gray-800 hover:bg-gray-900 text-white font-medium rounded-xl shadow-sm transition-all text-sm">
            了解
          </button>
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
.animate-fade-in { animation: fadeIn 0.3s ease-out; }
@keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
</style>

<script setup lang="ts">
import { ref } from 'vue'

const showParserInfo = ref(false)
</script>
