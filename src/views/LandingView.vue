<template>
  <div class="flex-1 bg-white">
    <!-- Hero Section -->
    <section class="relative w-full h-[600px] md:h-[700px] bg-slate-900 border-b-[12px] border-primary flex items-center justify-center overflow-hidden">
      <!-- 帶有多重漸層與背景圖的 Hero 區塊 -->
      <div class="absolute inset-0 bg-[url('/hero-bg.jpg')] bg-cover bg-center bg-no-repeat opacity-40"></div>
      
      <!-- 斜角裝飾保持運動感 -->
      <div class="absolute top-0 right-0 w-1/2 h-full bg-slate-800 transform skew-x-12 opacity-50 translate-x-32 origin-bottom"></div>

      <div class="relative z-10 flex flex-col items-center justify-end text-center px-4 w-full h-full max-w-5xl mx-auto pb-12 md:pb-28">
        <!-- 由於背景圖已有隊名與口號，這裡隱藏重複的標題文字，保留底部的行動呼籲按鈕即可 -->
        
        <div class="flex flex-col sm:flex-row gap-4 w-full sm:w-auto justify-center">
          <button class="px-8 py-4 bg-primary text-white font-extrabold text-lg md:text-xl uppercase tracking-widest rounded-sm hover:-translate-y-1 hover:shadow-[0_15px_30px_rgba(216,143,34,0.5)] transition-all flex items-center justify-center gap-3">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" /></svg>
            最新賽事
          </button>
          <button @click="isJoinModalOpen = true" class="px-8 py-4 bg-transparent border-2 border-white text-white font-extrabold text-lg md:text-xl uppercase tracking-widest rounded-sm hover:bg-white hover:text-slate-900 transition-all">
            加入我們
          </button>
        </div>
        
        <!-- 社群連結 -->
        <div class="mt-8 flex items-center gap-6 justify-center">
          <a href="https://www.facebook.com/groups/203206672887263" target="_blank" title="加入 Facebook 私密社團" class="text-white/80 hover:text-[#1877F2] hover:-translate-y-1 transition-all duration-300 drop-shadow-md cursor-pointer flex items-center gap-2 font-bold tracking-widest text-sm">
            <svg viewBox="0 0 24 24" fill="currentColor" class="w-7 h-7"><path d="M22 12c0-5.52-4.48-10-10-10S2 6.48 2 12c0 4.84 3.44 8.87 8 9.8V15H8v-3h2V9.5C10 7.57 11.57 6 13.5 6H16v3h-2c-.55 0-1 .45-1 1v2h3v3h-3v6.95c5.05-.5 9-4.76 9-9.95z"/></svg>
            FB 社團
          </a>
          <a href="https://www.instagram.com/reel/DWIbtw4EZ55/" target="_blank" title="查看 Instagram 精彩 Reels" class="text-white/80 hover:text-[#E4405F] hover:-translate-y-1 transition-all duration-300 drop-shadow-md cursor-pointer flex items-center gap-2 font-bold tracking-widest text-sm">
            <svg viewBox="0 0 24 24" fill="currentColor" class="w-7 h-7"><path d="M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.22.41a4.6 4.6 0 0 1 1.69 1.1 4.6 4.6 0 0 1 1.1 1.69c.16.42.36 1.05.41 2.22.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.22a4.6 4.6 0 0 1-1.1 1.69 4.6 4.6 0 0 1-1.69 1.1c-.42.16-1.05.36-2.22.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.22-.41a4.6 4.6 0 0 1-1.69-1.1 4.6 4.6 0 0 1-1.1-1.69c-.16-.42-.36-1.05-.41-2.22C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.22a4.6 4.6 0 0 1 1.1-1.69 4.6 4.6 0 0 1 1.69-1.1c.42-.16 1.05-.36 2.22-.41 1.27-.06 1.65-.07 4.85-.07M12 0C8.74 0 8.33.01 7.05.07A11.83 11.83 0 0 0 3.12 1.2a6.76 6.76 0 0 0-2.43 1.58A6.76 6.76 0 0 0 .19 5.2 11.83 11.83 0 0 0 .07 7.05C.01 8.33 0 8.74 0 12s.01 3.67.07 4.95a11.83 11.83 0 0 0 1.13 3.93 6.76 6.76 0 0 0 1.58 2.43 6.76 6.76 0 0 0 2.43 1.58 11.83 11.83 0 0 0 3.93 1.13c1.28.06 1.69.07 4.95.07s3.67-.01 4.95-.07a11.83 11.83 0 0 0 3.93-1.13 6.76 6.76 0 0 0 2.43-1.58 6.76 6.76 0 0 0 1.58-2.43 11.83 11.83 0 0 0 1.13-3.93c.06-1.28.07-1.69.07-4.95s-.01-3.67-.07-4.95a11.83 11.83 0 0 0-1.13-3.93 6.76 6.76 0 0 0-1.58-2.43 6.76 6.76 0 0 0-2.43-1.58 11.83 11.83 0 0 0-3.93-1.13C15.67.01 15.26 0 12 0z"/><path d="M12 5.84A6.16 6.16 0 1 0 18.16 12 6.16 6.16 0 0 0 12 5.84zm0 10.16a4 4 0 1 1 4-4 4 4 0 0 1-4 4z"/><circle cx="15.31" cy="8.69" r="1.4"/></svg>
            最新 Reels
          </a>
        </div>
      </div>
      
      <div class="absolute bottom-0 left-0 w-full h-32 bg-gradient-to-t from-slate-900 to-transparent z-0"></div>
    </section>

    <!-- Content Sections -->
    <section class="max-w-7xl mx-auto py-16 px-6 md:px-12 w-full">
      <!-- 今日點名狀況 (全寬置頂區塊) -->
      <div class="w-full mb-20 md:mb-24">
        <div class="bg-white p-0 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-blue-100/60 overflow-hidden flex flex-col">
          <div class="p-5 border-b border-blue-100 flex items-center justify-between bg-blue-50/30">
            <div class="flex items-center gap-3">
               <div class="p-2 bg-blue-100 rounded-lg text-blue-600">
                 <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clip-rule="evenodd" /></svg>
               </div>
               <h3 class="font-bold text-lg text-blue-900">今日點名請假狀況 <span class="text-xs ml-2 bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full border border-blue-200">當日限定</span></h3>
            </div>
          </div>
          <div class="p-5" v-loading="isLoadingAttendance">
            <div v-if="!todayEvent" class="flex flex-col items-center justify-center text-gray-400 font-medium py-8">
               <svg xmlns="http://www.w3.org/2000/svg" class="h-10 w-10 mb-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
               今天無訓練點名
            </div>
            <div v-else>
               <div class="mb-4">
                  <h4 class="font-black text-gray-800 text-xl">{{ todayEvent.title }}</h4>
                  <span class="text-sm font-bold text-gray-500">{{ todayEvent.date }}</span>
               </div>
               <div class="bg-gray-50 rounded-xl p-4 border border-gray-100">
                  <h5 class="font-bold text-gray-700 mb-3 flex items-center gap-2">
                     <span class="w-2 h-2 rounded-full bg-red-400"></span>今日請假名單 ({{ todayLeaveNames.length }}人)
                  </h5>
                  <div v-if="todayLeaveNames.length === 0" class="text-sm text-gray-500 font-medium tracking-wide">無人請假，全員到齊！🎉</div>
                  <div v-else class="flex flex-wrap gap-2">
                     <span v-for="(name, idx) in todayLeaveNames" :key="idx" class="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-sm font-bold text-gray-700 shadow-sm tracking-widest">
                       {{ maskName(name) }}
                     </span>
                  </div>
               </div>
            </div>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-16">
        
        <!-- Schedule Ticker -->
        <div class="lg:col-span-1">
          <div class="mb-8 flex items-end justify-between border-b-2 border-slate-200 pb-4">
            <h3 class="text-3xl font-black text-slate-800 uppercase tracking-wider">賽程表</h3>
            <span class="text-primary font-bold hover:underline cursor-pointer">查看全部</span>
          </div>
          <div class="flex flex-col gap-4" v-loading="isLoadingUpcomingMatches">
            <button
              v-for="match in upcomingMatches"
              :key="match.id"
              type="button"
              class="bg-gray-50 border border-gray-100 rounded-lg p-5 flex items-center justify-between shadow-sm hover:border-primary/50 transition-colors group cursor-pointer text-left"
              @click="openUpcomingMatch(match.id)"
            >
              <div class="flex items-center gap-4 min-w-0">
                <div class="flex flex-col items-center justify-center bg-white p-3 rounded-md border border-gray-100 shadow-sm w-16 shrink-0">
                  <span class="text-xs font-bold text-gray-400 uppercase">{{ formatScheduleMonth(match.match_date) }}</span>
                  <span class="text-2xl font-black text-slate-800">{{ formatScheduleDay(match.match_date) }}</span>
                </div>
                <div class="min-w-0">
                  <div class="text-sm font-bold text-gray-500 mb-1 line-clamp-1">{{ formatScheduleMeta(match) }}</div>
                  <div class="font-black text-lg text-slate-800 group-hover:text-primary transition-colors line-clamp-1">
                    {{ formatScheduleOpponent(match) }}
                  </div>
                  <div v-if="match.location" class="mt-1 text-xs font-semibold text-gray-400 line-clamp-1">{{ match.location }}</div>
                </div>
              </div>
              <span class="bg-slate-800 text-white p-2 rounded-full hidden sm:flex shrink-0 items-center justify-center">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
              </span>
            </button>
            <!-- Game Card 2 -->
            <div v-if="false" class="bg-gray-50 border border-gray-100 rounded-lg p-5 flex items-center justify-between shadow-sm hover:border-primary/50 transition-colors group cursor-pointer">
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
            <div v-if="false" class="bg-gray-50 border border-gray-100 rounded-lg p-5 flex items-center justify-between shadow-sm hover:border-primary/50 transition-colors group cursor-pointer">
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
            <div
              v-if="!isLoadingUpcomingMatches && upcomingMatches.length === 0"
              class="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-5 py-10 text-center text-sm font-bold text-gray-400"
            >
              目前沒有未來賽事
            </div>
          </div>
        </div>

        <!-- Latest News -->
        <div id="announcements" class="lg:col-span-2 scroll-mt-24">
          <div class="mb-8 flex items-end justify-between border-b-2 border-slate-200 pb-4">
            <h3 class="text-3xl font-black text-slate-800 uppercase tracking-wider">最新公告</h3>
            <span class="text-primary font-bold hover:underline cursor-pointer">更多公告</span>
          </div>
          
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6" v-if="latestAnnouncements.length > 0">
            <!-- 第一則大區塊 -->
            <div @click="openAnnouncement(latestAnnouncements[0])" class="bg-white rounded-xl overflow-hidden shadow-md hover:-translate-y-1 transition-transform group cursor-pointer flex flex-col border border-gray-100">
              <div class="h-64 bg-slate-800 relative overflow-hidden">
                <img v-if="latestAnnouncements[0].image_url" :src="latestAnnouncements[0].image_url" class="absolute inset-0 w-full h-full object-cover z-0 group-hover:scale-105 transition-transform duration-700" />
                <div class="absolute inset-0 bg-gradient-to-tr from-slate-900/80 to-transparent z-10"></div>
                <!-- 若無圖片則顯示原有的裝飾背景 -->
                <div v-if="!latestAnnouncements[0].image_url" class="absolute inset-0 bg-primary/20 group-hover:scale-105 transition-transform duration-700 z-10"></div>
                <div v-if="latestAnnouncements[0].is_pinned" class="absolute bottom-4 left-4 z-20">
                  <span class="bg-red-500 text-white text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-sm shadow-sm">置頂</span>
                </div>
                <div v-else class="absolute bottom-4 left-4 z-20">
                  <span class="bg-secondary text-slate-900 text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-sm shadow-sm">最新公告</span>
                </div>
              </div>
              <div class="p-6 flex flex-col flex-1">
                <div class="text-sm font-bold text-gray-400 mb-2">{{ dayjs(latestAnnouncements[0].created_at).format('YYYY年 MM月 DD日') }}</div>
                <h4 class="text-2xl font-black text-slate-800 mb-3 group-hover:text-primary transition-colors leading-tight">{{ latestAnnouncements[0].title }}</h4>
                <p class="text-gray-600 font-medium mb-4 flex-1 whitespace-pre-line line-clamp-3">{{ latestAnnouncements[0].content }}</p>
                <!-- <div class="text-primary font-bold flex items-center gap-1 uppercase tracking-wider text-sm mt-auto">
                  閱讀全文 <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd" /></svg>
                </div> -->
              </div>
            </div>

            <div class="flex flex-col gap-6" v-if="latestAnnouncements.length > 1">
              <!-- 第2到3則小區塊 -->
              <div v-for="announcement in latestAnnouncements.slice(1)" :key="announcement.id" @click="openAnnouncement(announcement)" class="bg-white rounded-xl overflow-hidden shadow-sm border border-gray-100 flex hover:-translate-y-1 transition-transform group cursor-pointer h-full min-h-[140px]">
                <div class="w-1/3 bg-slate-800 overflow-hidden relative shrink-0">
                   <img v-if="announcement.image_url" :src="announcement.image_url" class="absolute inset-0 w-full h-full object-cover z-0 group-hover:scale-105 transition-transform duration-700" />
                   <div v-if="!announcement.image_url" class="absolute inset-0 transition-transform duration-700 group-hover:scale-105" 
                        :class="announcement.is_pinned ? 'bg-red-500/30' : 'bg-secondary/20'"></div>
                   <div v-if="announcement.is_pinned" class="absolute top-2 left-2 z-20">
                     <span class="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded shadow-sm">置頂</span>
                   </div>
                </div>
                <div class="p-4 w-2/3 flex flex-col justify-center">
                  <div class="text-xs font-bold text-gray-400 mb-1">{{ dayjs(announcement.created_at).format('YYYY-MM-DD') }}</div>
                  <h4 class="text-lg font-black text-slate-800 group-hover:text-primary transition-colors leading-tight line-clamp-2 mb-2">{{ announcement.title }}</h4>
                  <p class="text-sm text-gray-500 line-clamp-2 font-medium">{{ announcement.content }}</p>
                </div>
              </div>
            </div>
          </div>
          <div v-else class="text-center py-16 bg-gray-50/50 rounded-2xl border border-gray-200/50 border-dashed">
             <el-icon class="text-4xl text-gray-300 mb-2"><Bell /></el-icon>
             <p class="text-gray-400 font-bold">目前沒有最新系統公告</p>
             <p class="text-gray-400 text-sm mt-1">未來若有重要消息，將會展示於此區塊</p>
          </div>
        </div>

      </div>
    </section>

    <!-- 社群動態 (Social Media Embeds) -->
    <section class="py-20 bg-gray-50/50 relative overflow-hidden border-t border-gray-100/50">
      <div class="container mx-auto px-6 relative z-10">
        <div class="text-center mb-10 md:mb-16">
          <div class="inline-flex items-center gap-2 px-3 py-1 bg-gradient-to-r from-[#1877F2]/10 to-[#E1306C]/10 rounded-full text-sm font-bold text-gray-700 mb-4 shadow-sm border border-gray-200/50">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
            Follow Us
          </div>
          <h2 class="text-3xl md:text-5xl font-black text-slate-800 tracking-tight mb-4">關注我們的社群</h2>
          <p class="text-base md:text-lg text-gray-500 max-w-2xl mx-auto font-medium">追蹤 Facebook 與 Instagram，隨時掌握球隊最新訓練動態與賽事精華！</p>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 max-w-6xl mx-auto">
          <!-- Facebook Page Plugin -->
          <div class="bg-white rounded-2xl shadow-xl shadow-gray-200/40 border border-gray-100 overflow-hidden flex flex-col p-6 hover:-translate-y-1 transition-transform duration-300">
            <div class="w-full flex items-center justify-between mb-6 border-b border-gray-100 pb-4">
               <div class="flex items-center gap-3">
                 <div class="w-10 h-10 rounded-full bg-[#1877F2]/10 flex items-center justify-center">
                   <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-[#1877F2]" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.469h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.469h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                 </div>
                 <div>
                   <h3 class="font-extrabold text-lg text-slate-800 leading-tight">Facebook 社團</h3>
                   <p class="text-xs text-gray-500 font-medium">中港熊戰社區棒球隊</p>
                 </div>
               </div>
               <a href="https://www.facebook.com/groups/203206672887263" target="_blank" class="px-4 py-1.5 bg-[#1877F2] hover:bg-[#1877F2]/90 text-white text-xs font-bold rounded-full transition-colors hidden sm:block">加入社團</a>
            </div>
            <!-- FB Iframe -->
            <div class="w-full flex-1 flex items-center justify-center bg-gray-50/50 rounded-xl overflow-hidden relative" style="min-height: 400px">
              <div class="absolute inset-0 flex items-center justify-center opacity-50 z-0">
                <el-icon class="is-loading text-3xl"><Loading /></el-icon>
              </div>
              <!-- Facebook 會社團外掛只顯示基本資訊，因為隱私政策無法嵌入整面動態牆 -->
              <iframe class="relative z-10" src="https://www.facebook.com/plugins/group.php?href=https%3A%2F%2Fwww.facebook.com%2Fgroups%2F203206672887263&width=500&show_social_context=true&show_metadata=false&appId" width="500" height="300" style="border:none;overflow:hidden;max-width:100%;" scrolling="no" frameborder="0" allowfullscreen="true" allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"></iframe>
            </div>
          </div>

          <!-- Instagram Post Embed -->
          <div class="bg-white rounded-2xl shadow-xl shadow-gray-200/40 border border-gray-100 overflow-hidden flex flex-col p-6 hover:-translate-y-1 transition-transform duration-300">
            <div class="w-full flex items-center justify-between mb-6 border-b border-gray-100 pb-4">
               <div class="flex items-center gap-3">
                 <div class="w-10 h-10 rounded-full bg-gradient-to-tr from-[#feda75] via-[#fa7e1e] to-[#d62976] p-[1.5px] flex items-center justify-center">
                   <div class="w-full h-full bg-white rounded-full flex items-center justify-center">
                     <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 text-[#d62976]" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.368-.2 6.792-2.618 6.981-6.98C23.986 15.668 24 15.259 24 12c0-3.259-.014-3.668-.072-4.948-.2-4.358-2.618-6.78-6.98-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
                   </div>
                 </div>
                 <div>
                   <h3 class="font-extrabold text-lg text-slate-800 leading-tight">Instagram 精彩瞬間</h3>
                   <p class="text-xs text-gray-500 font-medium">@jg_baseball_team</p>
                 </div>
               </div>
               <a href="https://www.instagram.com/reel/DWIbtw4EZ55/" target="_blank" class="px-4 py-1.5 bg-gradient-to-tr from-[#feda75] via-[#fa7e1e] to-[#d62976] hover:opacity-90 text-white text-xs font-bold rounded-full transition-opacity hidden sm:block">去追蹤最新動態</a>
            </div>
            <!-- IG Iframe -->
            <div class="w-full flex-1 flex justify-center bg-gray-50/50 rounded-xl overflow-hidden relative" style="min-height: 500px">
              <div class="absolute inset-0 flex items-center justify-center opacity-50 z-0">
                <el-icon class="is-loading text-3xl"><Loading /></el-icon>
              </div>
              <iframe class="relative z-10 bg-white shadow-sm" src="https://www.instagram.com/p/DWIbtw4EZ55/embed" width="400" height="500" frameborder="0" scrolling="no" allowtransparency="true"></iframe>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 公告詳細內容 Modal -->
    <el-dialog
      v-model="isAnnouncementModalOpen"
      :title="selectedAnnouncement?.is_pinned ? '📌 置頂公告' : '📣 系統公告'"
      width="90%"
      style="max-width: 600px; border-radius: 16px;"
      class="custom-dialog announcement-dialog"
    >
      <div v-if="selectedAnnouncement" class="-mt-2 pb-4">
        <h3 class="text-2xl font-black text-slate-800 leading-tight mb-2">{{ selectedAnnouncement.title }}</h3>
        <div class="text-sm font-bold text-gray-400 mb-5">{{ dayjs(selectedAnnouncement.created_at).format('YYYY年 MM月 DD日 HH:mm') }}</div>
        
        <div v-if="selectedAnnouncement.image_url" class="rounded-xl overflow-hidden mb-6 border border-gray-100 shadow-sm max-h-[300px] bg-gray-50 flex items-center justify-center">
          <img :src="selectedAnnouncement.image_url" class="w-full h-full object-contain" />
        </div>
        
        <div class="text-gray-700 whitespace-pre-line leading-relaxed text-[15px] max-h-[40dvh] overflow-y-auto custom-scrollbar pr-2">
          {{ selectedAnnouncement.content }}
        </div>
      </div>
      <template #footer>
        <div class="flex justify-end mt-2">
          <button @click="isAnnouncementModalOpen = false" class="px-6 py-2 bg-primary hover:bg-primary-hover active:scale-95 text-white font-bold rounded-xl shadow-md transition-all">
            關閉視窗
          </button>
        </div>
      </template>
    </el-dialog>

    <!-- 加入我們 表單 Modal -->
    <el-dialog
      v-model="isJoinModalOpen"
      title="聯絡我們 / 加入球隊"
      width="90%"
      style="max-width: 500px; border-radius: 16px;"
      class="custom-dialog"
    >
      <div class="mb-4 text-gray-500 text-sm leading-relaxed">
        歡迎對棒球有熱誠的孩子加入我們！請留下您的基本聯絡資訊，教練團會盡快與您聯繫並安排體驗。
      </div>
      <el-form :model="joinForm" :rules="joinRules" ref="joinFormRef" label-position="top">
        <el-form-item label="家長姓名" prop="parent_name" class="font-bold">
          <el-input v-model="joinForm.parent_name" placeholder="請輸入家長姓名" />
        </el-form-item>
        <el-form-item label="聯絡電話" prop="phone" class="font-bold">
          <el-input v-model="joinForm.phone" placeholder="09XX-XXX-XXX" />
        </el-form-item>
        <el-form-item label="小孩年紀或年級" prop="child_age_or_grade" class="font-bold">
          <el-input v-model="joinForm.child_age_or_grade" placeholder="例如：二年級、8歲" />
        </el-form-item>
        <el-form-item label="想問的問題或備註" prop="message" class="font-bold">
          <el-input v-model="joinForm.message" type="textarea" :rows="3" placeholder="有什麼想先了解的嗎？" />
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="flex gap-2 justify-end mt-4">
          <button @click="isJoinModalOpen = false" class="px-5 py-2 text-gray-500 font-bold hover:bg-gray-100 rounded-xl transition-all">取消</button>
          <button @click="submitJoinForm" :disabled="isSubmitting" class="px-6 py-2 bg-primary hover:bg-primary-hover active:scale-95 disabled:opacity-70 text-white font-bold rounded-xl shadow-md transition-all flex items-center justify-center min-w-[100px]">
            <span v-if="isSubmitting" class="flex gap-2 items-center"><el-icon class="is-loading"><Loading /></el-icon> 傳送中</span>
            <span v-else>送出資料</span>
          </button>
        </div>
      </template>
    </el-dialog>

    <MatchDetailDialog
      v-model="upcomingMatchDialogVisible"
      :match-id="selectedUpcomingMatchId"
      :readonly="true"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import { supabase } from '@/services/supabase'
import { buildPushEventKey, dispatchPushNotification } from '@/utils/pushNotifications'
import { ElMessage } from 'element-plus'
import { Loading } from '@element-plus/icons-vue'
import dayjs from 'dayjs'
import MatchDetailDialog from '@/components/match-records/MatchDetailDialog.vue'
import { useMatchesStore } from '@/stores/matches'
import type { MatchRecord } from '@/types/match'

type UpcomingMatchCard = Pick<
  MatchRecord,
  'id' | 'match_name' | 'opponent' | 'match_date' | 'match_time' | 'location' | 'category_group'
>

const isJoinModalOpen = ref(false)
const isSubmitting = ref(false)
const joinFormRef = ref()
const matchesStore = useMatchesStore()

const isAnnouncementModalOpen = ref(false)
const selectedAnnouncement = ref<any>(null)
const upcomingMatches = ref<UpcomingMatchCard[]>([])
const isLoadingUpcomingMatches = ref(false)
const selectedUpcomingMatchId = ref<string | null>(null)
const upcomingMatchDialogVisible = ref(false)

const openAnnouncement = (item: any) => {
  selectedAnnouncement.value = item
  isAnnouncementModalOpen.value = true
}

const isLoadingAttendance = ref(true)
const todayEvent = ref<any>(null)
const todayLeaveNames = ref<string[]>([])

const maskName = (name: string) => {
  if (!name) return '未知'
  if (name.length <= 1) return name
  if (name.length === 2) return name[0] + '*'
  return name[0] + '*'.repeat(name.length - 2) + name[name.length - 1]
}

const fetchTodayAttendance = async () => {
  isLoadingAttendance.value = true
  try {
    const todayStr = dayjs().format('YYYY-MM-DD')
    const { data: evData } = await supabase.from('attendance_events')
      .select('*')
      .eq('date', todayStr)
      .limit(1)
      .maybeSingle()
    
    if (evData) {
      todayEvent.value = evData
      
      const { data: tLeaves } = await supabase.from('leave_requests')
        .select('id, team_members(name)')
        .lte('start_date', todayStr)
        .gte('end_date', todayStr)
      const formalLeaveNames = (tLeaves || []).map((l: any) => l.team_members?.name).filter(Boolean)
        
      const { data: rLeaves } = await supabase.from('attendance_records')
        .select('member_id')
        .eq('event_id', evData.id)
        .eq('status', '請假')
      
      let rollCallLeaveNames: string[] = []
      if (rLeaves && rLeaves.length > 0) {
        const memberIds = rLeaves.map(r => r.member_id)
        const { data: members } = await supabase.from('team_members')
          .select('name')
          .in('id', memberIds)
        if (members) rollCallLeaveNames = members.map(m => m.name).filter(Boolean)
      }

      const allLeaveNames = [...formalLeaveNames, ...rollCallLeaveNames]
      todayLeaveNames.value = Array.from(new Set(allLeaveNames))
    }
  } catch (error) {
    console.error('Error fetching today attendance:', error)
  } finally {
    isLoadingAttendance.value = false
  }
}

const getUpcomingMatchTimestamp = (match: UpcomingMatchCard) => {
  if (!match.match_date) return Number.POSITIVE_INFINITY

  const startTime = match.match_time?.match(/\d{1,2}:\d{2}/)?.[0] || '23:59'
  const value = dayjs(`${match.match_date}T${startTime}`).valueOf()
  return Number.isNaN(value) ? Number.POSITIVE_INFINITY : value
}

const formatScheduleMonth = (matchDate: string) => dayjs(matchDate).format('MMM').toUpperCase()

const formatScheduleDay = (matchDate: string) => dayjs(matchDate).format('DD')

const formatScheduleMeta = (match: UpcomingMatchCard) => {
  const startTime = match.match_time?.match(/\d{1,2}:\d{2}/)?.[0] || '時間待定'
  return `${match.match_name || '比賽'} • ${startTime}`
}

const formatScheduleOpponent = (match: UpcomingMatchCard) => {
  if (match.opponent) return `vs ${match.opponent}`
  return match.match_name || '對手待確認'
}

const fetchUpcomingMatches = async () => {
  isLoadingUpcomingMatches.value = true

  try {
    const todayStr = dayjs().format('YYYY-MM-DD')
    const { data, error } = await supabase
      .from('matches')
      .select('id, match_name, opponent, match_date, match_time, location, category_group')
      .gte('match_date', todayStr)
      .order('match_date', { ascending: true })
      .order('match_time', { ascending: true })
      .limit(20)

    if (error) throw error

    const nowValue = dayjs().valueOf()
    upcomingMatches.value = ((data || []) as UpcomingMatchCard[])
      .filter((match) => getUpcomingMatchTimestamp(match) >= nowValue)
      .sort((a, b) => getUpcomingMatchTimestamp(a) - getUpcomingMatchTimestamp(b))
      .slice(0, 3)
  } catch (error) {
    console.error('Failed to fetch upcoming matches:', error)
    upcomingMatches.value = []
  } finally {
    isLoadingUpcomingMatches.value = false
  }
}

const openUpcomingMatch = async (matchId: string) => {
  selectedUpcomingMatchId.value = matchId
  upcomingMatchDialogVisible.value = true

  if (matchesStore.matches.some((match) => match.id === matchId)) {
    return
  }

  try {
    await matchesStore.fetchMatches()
    if (!matchesStore.matches.some((match) => match.id === matchId)) {
      upcomingMatchDialogVisible.value = false
      ElMessage.warning('找不到這筆比賽資料')
    }
  } catch (error) {
    console.error('Error fetching match detail:', error)
    upcomingMatchDialogVisible.value = false
    ElMessage.error('讀取比賽資料失敗，請稍後再試')
  }
}

const joinForm = reactive({
  parent_name: '',
  phone: '',
  child_age_or_grade: '',
  message: ''
})

const joinRules = {
  parent_name: [{ required: true, message: '請填寫家長姓名', trigger: 'blur' }],
  phone: [{ required: true, message: '請填寫聯絡電話', trigger: 'blur' }]
}

const submitJoinForm = async () => {
  if (!joinFormRef.value) return
  
  try {
    const valid = await joinFormRef.value.validate()
    if (!valid) return
  } catch(err) {
    return
  }

  isSubmitting.value = true
  try {
    const { data, error } = await supabase.from('join_inquiries').insert({
      parent_name: joinForm.parent_name,
      phone: joinForm.phone,
      child_age_or_grade: joinForm.child_age_or_grade,
      message: joinForm.message
    }).select('id, parent_name').single()

    if (error) throw error

    void dispatchPushNotification({
      title: `[入隊詢問] 收到來自 ${data.parent_name} 的聯絡`,
      body: `電話: ${joinForm.phone}。請盡快與家長聯繫！`,
      url: '/join-inquiries',
      feature: 'join_inquiries',
      action: 'VIEW',
      eventKey: buildPushEventKey('join_inquiry', data.id)
    }).catch((pushErr) => {
      console.warn('入隊詢問推播傳送失敗', pushErr)
    })
    
    ElMessage.success('送出成功！教練團會盡快與您聯繫。')
    isJoinModalOpen.value = false
    Object.assign(joinForm, { parent_name: '', phone: '', child_age_or_grade: '', message: '' })
  } catch (error: any) {
    console.error(error)
    ElMessage.error('送出失敗：' + error.message)
  } finally {
    isSubmitting.value = false
  }
}

// 取得最新公告
const latestAnnouncements = ref<any[]>([])

const fetchAnnouncements = async () => {
  try {
    const { data, error } = await supabase
      .from('announcements')
      .select('*')
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(3)
    
    if (error) throw error
    latestAnnouncements.value = data || []
  } catch(err) {
    console.error('Failed to fetch announcements:', err)
  }
}

const handleOpenJoin = () => {
  isJoinModalOpen.value = true
}

onMounted(() => {
  fetchAnnouncements()
  fetchTodayAttendance()
  fetchUpcomingMatches()
  window.addEventListener('openJoinModal', handleOpenJoin)
})

onUnmounted(() => {
  window.removeEventListener('openJoinModal', handleOpenJoin)
})
</script>

<style scoped>
:deep(.custom-dialog.el-dialog) {
  border-radius: 16px !important;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25) !important;
}
:deep(.custom-dialog .el-dialog__header) {
  border-bottom: 2px solid var(--color-primary);
  margin-right: 0;
  padding: 24px;
}
:deep(.custom-dialog .el-dialog__title) {
  color: #1e293b !important; 
  font-weight: 900;
  font-size: 1.25rem;
}
:deep(.custom-dialog .el-dialog__body) {
  padding: 16px 24px 0px 24px;
}
:deep(.custom-dialog .el-form-item__label) {
  color: #475569 !important;
}

/* Scrollbar styling for announcement content */
:deep(.announcement-dialog .custom-scrollbar::-webkit-scrollbar) {
  width: 6px;
}
:deep(.announcement-dialog .custom-scrollbar::-webkit-scrollbar-track) {
  background: transparent;
}
:deep(.announcement-dialog .custom-scrollbar::-webkit-scrollbar-thumb) {
  background-color: #cbd5e1;
  border-radius: 10px;
}

/* 行動裝置對話框滿版與捲動處理 */
@media (max-width: 639px) {
  :deep(.custom-dialog) {
    margin: 0 !important;
    max-width: 100% !important;
    width: 100% !important;
    border-radius: 16px 16px 0 0 !important;
    position: absolute;
    bottom: 0;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
  }
  
  :deep(.custom-dialog .el-dialog__body) {
    flex: 1;
    overflow-y: auto;
  }
}
</style>
