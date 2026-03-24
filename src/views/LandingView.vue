<template>
  <div class="flex-1 bg-white">
    <!-- Hero Section -->
    <section class="relative w-full h-[600px] md:h-[700px] bg-slate-900 border-b-[12px] border-primary flex items-center justify-center overflow-hidden">
      <!-- 帶有多重漸層與背景圖的 Hero 區塊 -->
      <div class="absolute inset-0 bg-[url('/hero-bg.jpg')] bg-cover bg-center bg-no-repeat opacity-40"></div>
      
      <!-- 斜角裝飾保持運動感 -->
      <div class="absolute top-0 right-0 w-1/2 h-full bg-slate-800 transform skew-x-12 opacity-50 translate-x-32 origin-bottom"></div>

      <div class="relative z-10 flex flex-col items-center justify-center text-center px-4 w-full h-full max-w-5xl mx-auto pt-32">
        <!-- 由於背景圖已有隊名與口號，這裡隱藏重複的標題文字，保留底部的行動呼籲按鈕即可 -->
        
        <div class="flex flex-col sm:flex-row gap-4 w-full sm:w-auto justify-center">
          <button class="px-8 py-4 bg-primary text-white font-extrabold text-lg md:text-xl uppercase tracking-widest rounded-sm hover:-translate-y-1 hover:shadow-[0_15px_30px_rgba(216,143,34,0.5)] transition-all flex items-center justify-center gap-3">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" /></svg>
            最新賽事
          </button>
          <button class="px-8 py-4 bg-transparent border-2 border-white text-white font-extrabold text-lg md:text-xl uppercase tracking-widest rounded-sm hover:bg-white hover:text-slate-900 transition-all">
            球迷專區
          </button>
        </div>
      </div>
      
      <div class="absolute bottom-0 left-0 w-full h-32 bg-gradient-to-t from-slate-900 to-transparent z-0"></div>
    </section>

    <!-- Content Sections -->
    <section class="max-w-7xl mx-auto py-24 px-6 md:px-12 w-full">
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-16">
        
        <!-- Schedule Ticker -->
        <div class="lg:col-span-1">
          <div class="mb-8 flex items-end justify-between border-b-2 border-slate-200 pb-4">
            <h3 class="text-3xl font-black text-slate-800 uppercase tracking-wider">賽程表</h3>
            <span class="text-primary font-bold hover:underline cursor-pointer">查看全部</span>
          </div>
          <div class="flex flex-col gap-4">
            <!-- Game Card -->
            <div class="bg-gray-50 border border-gray-100 rounded-lg p-5 flex items-center justify-between shadow-sm hover:border-primary/50 transition-colors group cursor-pointer">
              <div class="flex items-center gap-4">
                <div class="flex flex-col items-center justify-center bg-white p-3 rounded-md border border-gray-100 shadow-sm w-16">
                  <span class="text-xs font-bold text-gray-400 uppercase">Aug</span>
                  <span class="text-2xl font-black text-slate-800">18</span>
                </div>
                <div>
                  <div class="text-sm font-bold text-gray-500 mb-1">Home • 18:30</div>
                  <div class="font-black text-lg text-slate-800 group-hover:text-primary transition-colors">vs Dragons</div>
                </div>
              </div>
              <button class="bg-slate-800 text-white p-2 rounded-full hidden sm:block">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
              </button>
            </div>
            <!-- Game Card 2 -->
            <div class="bg-gray-50 border border-gray-100 rounded-lg p-5 flex items-center justify-between shadow-sm hover:border-primary/50 transition-colors group cursor-pointer">
              <div class="flex items-center gap-4">
                <div class="flex flex-col items-center justify-center bg-white p-3 rounded-md border border-gray-100 shadow-sm w-16">
                  <span class="text-xs font-bold text-gray-400 uppercase">Aug</span>
                  <span class="text-2xl font-black text-slate-800">20</span>
                </div>
                <div>
                  <div class="text-sm font-bold text-gray-500 mb-1">Away • 17:00</div>
                  <div class="font-black text-lg text-slate-800 group-hover:text-primary transition-colors">@ Monkeys</div>
                </div>
              </div>
              <button class="bg-slate-800 text-white p-2 rounded-full hidden sm:block">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
              </button>
            </div>
            <!-- Game Card 3 -->
            <div class="bg-gray-50 border border-gray-100 rounded-lg p-5 flex items-center justify-between shadow-sm hover:border-primary/50 transition-colors group cursor-pointer">
              <div class="flex items-center gap-4">
                <div class="flex flex-col items-center justify-center bg-white p-3 rounded-md border border-gray-100 shadow-sm w-16">
                  <span class="text-xs font-bold text-gray-400 uppercase">Aug</span>
                  <span class="text-2xl font-black text-slate-800">22</span>
                </div>
                <div>
                  <div class="text-sm font-bold text-gray-500 mb-1">Home • 19:00</div>
                  <div class="font-black text-lg text-slate-800 group-hover:text-primary transition-colors">vs Brothers</div>
                </div>
              </div>
              <button class="bg-slate-800 text-white p-2 rounded-full hidden sm:block">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
              </button>
            </div>
          </div>
        </div>

        <!-- Latest News -->
        <div class="lg:col-span-2">
          <div class="mb-8 flex items-end justify-between border-b-2 border-slate-200 pb-4">
            <h3 class="text-3xl font-black text-slate-800 uppercase tracking-wider">最新公告</h3>
            <span class="text-primary font-bold hover:underline cursor-pointer">更多公告</span>
          </div>
          
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <!-- News Card Big -->
            <div class="bg-white rounded-xl overflow-hidden shadow-md hover:-translate-y-1 transition-transform group cursor-pointer flex flex-col border border-gray-100">
              <div class="h-64 bg-slate-800 relative overflow-hidden">
                <div class="absolute inset-0 bg-gradient-to-tr from-slate-900/80 to-transparent z-10"></div>
                <!-- Mock image block -->
                <div class="absolute inset-0 bg-primary/20 group-hover:scale-105 transition-transform duration-700"></div>
                <div class="absolute bottom-4 left-4 z-20">
                  <span class="bg-secondary text-slate-900 text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-sm">Featured</span>
                </div>
              </div>
              <div class="p-6 flex flex-col flex-1">
                <div class="text-sm font-bold text-gray-400 mb-2">2026年 3月 24日</div>
                <h4 class="text-2xl font-black text-slate-800 mb-3 group-hover:text-primary transition-colors leading-tight">球隊春訓正式展開！球員展現絕佳防守默契</h4>
                <p class="text-gray-600 font-medium mb-4 flex-1">台灣黑熊棒球隊在季前春訓中展現了驚人的團隊默契，不論是教練團的戰術執行或是球員間的守備搭配都達到絕佳狀態...</p>
                <div class="text-primary font-bold flex items-center gap-1 uppercase tracking-wider text-sm">
                  閱讀全文 <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd" /></svg>
                </div>
              </div>
            </div>

            <div class="flex flex-col gap-6">
              <!-- Small News 1 -->
              <div class="bg-white rounded-xl overflow-hidden shadow-sm border border-gray-100 flex hover:-translate-y-1 transition-transform group cursor-pointer h-full">
                <div class="w-1/3 bg-slate-800 overflow-hidden relative">
                   <div class="absolute inset-0 bg-secondary/20 group-hover:scale-105 transition-transform duration-700"></div>
                </div>
                <div class="p-5 w-2/3 flex flex-col justify-center">
                  <div class="text-xs font-bold text-gray-400 mb-1">2026年 3月 22日</div>
                  <h4 class="text-lg font-black text-slate-800 group-hover:text-primary transition-colors leading-tight">全新應援周邊商品上架！快來支持球隊</h4>
                </div>
              </div>
              
              <!-- Small News 2 -->
              <div class="bg-white rounded-xl overflow-hidden shadow-sm border border-gray-100 flex hover:-translate-y-1 transition-transform group cursor-pointer h-full">
                <div class="w-1/3 bg-slate-800 overflow-hidden relative">
                   <div class="absolute inset-0 bg-primary/20 group-hover:scale-105 transition-transform duration-700"></div>
                </div>
                <div class="p-5 w-2/3 flex flex-col justify-center">
                  <div class="text-xs font-bold text-gray-400 mb-1">2026年 3月 20日</div>
                  <h4 class="text-lg font-black text-slate-800 group-hover:text-primary transition-colors leading-tight">狂賀！李家豪榮獲首週單週最有價值球員</h4>
                </div>
              </div>

            </div>

          </div>
        </div>

      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
// Logic for landing page (e.g. fetching news or schedule if backend connected)
</script>
