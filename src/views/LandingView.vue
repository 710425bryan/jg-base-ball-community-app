<template>
  <div class="flex-1 bg-white">
    <!-- Hero Section -->
    <section class="relative flex min-h-[calc(100dvh-5rem)] w-full items-center overflow-hidden border-b-[12px] border-primary bg-slate-950 py-16 md:min-h-[720px] md:py-20">
      <div class="absolute inset-0 bg-[url('/hero-bg.jpg')] bg-cover bg-center bg-no-repeat opacity-40"></div>
      <div class="absolute inset-0 bg-gradient-to-r from-slate-950 via-slate-950/75 to-slate-900/20"></div>
      <div class="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-slate-950 to-transparent"></div>
      <div class="absolute right-[-12%] top-0 hidden h-full w-1/2 origin-bottom translate-x-10 skew-x-12 bg-slate-800/40 md:block"></div>
      <HomeHolidayHeroOverlay />

      <div class="relative z-10 mx-auto flex w-full max-w-7xl flex-col items-start gap-8 px-6 text-left md:px-12">
        <div class="max-w-3xl">
          <div class="mb-5 inline-flex items-center gap-2 rounded-full border border-primary/40 bg-slate-950/60 px-4 py-2 text-sm font-black tracking-widest text-primary shadow-xl shadow-black/20 backdrop-blur">
            中港國小社區棒球
          </div>
          <h1 class="text-4xl font-black leading-tight text-white sm:text-5xl md:text-7xl">
            中港熊戰社區棒球
          </h1>
          <p class="mt-5 text-2xl font-black leading-tight text-secondary md:text-4xl">
            新莊孩子的棒球成長基地
          </p>
          <p class="mt-5 max-w-2xl text-base font-medium leading-8 text-slate-100 md:text-xl md:leading-9">
            從零基礎到上場比賽，讓孩子在汗水、紀律與團隊合作中長出自信。
          </p>
        </div>

        <div class="grid w-full gap-3 sm:w-auto sm:grid-cols-2">
          <button
            type="button"
            @click="openJoinModal"
            class="flex min-h-14 items-center justify-center gap-3 rounded-md bg-primary px-7 py-4 text-base font-extrabold tracking-widest text-white shadow-[0_18px_36px_rgba(216,143,34,0.35)] transition-all hover:-translate-y-1 hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary/80 md:text-lg"
          >
            我要報名體驗
          </button>
          <button
            type="button"
            @click="scrollToSchedule"
            class="flex min-h-14 items-center justify-center gap-3 rounded-md border-2 border-white/80 bg-white/5 px-7 py-4 text-base font-extrabold tracking-widest text-white backdrop-blur transition-all hover:-translate-y-1 hover:bg-white hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary/80 md:text-lg"
          >
            <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" /></svg>
            查看近期賽事
          </button>
        </div>

        <!-- 社群連結 -->
        <div class="flex flex-wrap items-center gap-3">
          <a href="https://www.facebook.com/groups/203206672887263" target="_blank" rel="noopener noreferrer" title="加入 Facebook 私密社團" class="flex min-h-11 min-w-[112px] shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-white/10 bg-slate-950/60 py-1 pl-2 pr-5 text-sm font-black text-white shadow-lg shadow-black/20 backdrop-blur transition-all duration-300 hover:-translate-y-0.5 hover:bg-slate-950/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary/80 sm:min-w-[124px]">
            <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#1877F2]/10 text-[#1877F2]">
              <svg viewBox="0 0 24 24" fill="currentColor" class="h-5 w-5"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.469h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.469h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
            </span>
            <span>FB 社團</span>
          </a>
          <a href="https://www.instagram.com/reel/DWIbtw4EZ55/" target="_blank" rel="noopener noreferrer" title="查看 Instagram 精彩 Reels" class="flex min-h-11 min-w-[132px] shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-white/10 bg-slate-950/60 py-1 pl-2 pr-5 text-sm font-black text-white shadow-lg shadow-black/20 backdrop-blur transition-all duration-300 hover:-translate-y-0.5 hover:bg-slate-950/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary/80 sm:min-w-[144px]">
            <span class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-[#feda75] via-[#fa7e1e] to-[#d62976] p-[2px]">
              <span class="flex h-full w-full items-center justify-center rounded-full bg-white text-[#d62976]">
                <svg viewBox="0 0 24 24" fill="currentColor" class="h-5 w-5"><path d="M12 2.16c3.2 0 3.58.01 4.85.07 1.17.05 1.8.25 2.22.41a4.6 4.6 0 0 1 1.69 1.1 4.6 4.6 0 0 1 1.1 1.69c.16.42.36 1.05.41 2.22.06 1.27.07 1.65.07 4.85s-.01 3.58-.07 4.85c-.05 1.17-.25 1.8-.41 2.22a4.6 4.6 0 0 1-1.1 1.69 4.6 4.6 0 0 1-1.69 1.1c-.42.16-1.05.36-2.22.41-1.27.06-1.65.07-4.85.07s-3.58-.01-4.85-.07c-1.17-.05-1.8-.25-2.22-.41a4.6 4.6 0 0 1-1.69-1.1 4.6 4.6 0 0 1-1.1-1.69c-.16-.42-.36-1.05-.41-2.22C2.17 15.58 2.16 15.2 2.16 12s.01-3.58.07-4.85c.05-1.17.25-1.8.41-2.22a4.6 4.6 0 0 1 1.1-1.69 4.6 4.6 0 0 1 1.69-1.1c.42-.16 1.05-.36 2.22-.41 1.27-.06 1.65-.07 4.85-.07M12 0C8.74 0 8.33.01 7.05.07A11.83 11.83 0 0 0 3.12 1.2a6.76 6.76 0 0 0-2.43 1.58A6.76 6.76 0 0 0 .19 5.2 11.83 11.83 0 0 0 .07 7.05C.01 8.33 0 8.74 0 12s.01 3.67.07 4.95a11.83 11.83 0 0 0 1.13 3.93 6.76 6.76 0 0 0 1.58 2.43 6.76 6.76 0 0 0 2.43 1.58 11.83 11.83 0 0 0 3.93 1.13c1.28.06 1.69.07 4.95.07s3.67-.01 4.95-.07a11.83 11.83 0 0 0 3.93-1.13 6.76 6.76 0 0 0 2.43-1.58 6.76 6.76 0 0 0 1.58-2.43 11.83 11.83 0 0 0 1.13-3.93c.06-1.28.07-1.69.07-4.95s-.01-3.67-.07-4.95a11.83 11.83 0 0 0-1.13-3.93 6.76 6.76 0 0 0-1.58-2.43 6.76 6.76 0 0 0-2.43-1.58 11.83 11.83 0 0 0-3.93-1.13C15.67.01 15.26 0 12 0z"/><path d="M12 5.84A6.16 6.16 0 1 0 18.16 12 6.16 6.16 0 0 0 12 5.84zm0 10.16a4 4 0 1 1 4-4 4 4 0 0 1-4 4z"/><circle cx="15.31" cy="8.69" r="1.4"/></svg>
              </span>
            </span>
            <span>最新 Reels</span>
          </a>
        </div>
      </div>
    </section>

    <section class="border-b border-gray-100 bg-white px-6 py-12 md:px-12 md:py-16">
      <div class="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
        <div class="lg:sticky lg:top-24">
          <div class="mb-4 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-sm font-black text-primary">
            報名前先了解
          </div>
          <h2 class="text-3xl font-black leading-tight text-slate-900 md:text-5xl">讓第一次體驗更安心</h2>
          <p class="mt-5 text-base font-medium leading-8 text-slate-600 md:text-lg">
            家長可以先確認訓練型態、年齡分組與體驗流程；送出表單後，教練團會依孩子年齡、程度與近期場地安排回覆。
          </p>
          <button
            type="button"
            @click="openJoinModal"
            class="mt-7 inline-flex min-h-12 items-center justify-center rounded-md bg-primary px-6 text-sm font-extrabold tracking-widest text-white shadow-[0_14px_28px_rgba(216,143,34,0.26)] transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary/80"
          >
            立即安排體驗
          </button>
        </div>

        <div class="grid gap-5">
          <div class="grid gap-4 md:grid-cols-2">
            <article
              v-for="item in recruitmentHighlights"
              :key="item.title"
              class="rounded-2xl border border-gray-100 bg-slate-50 p-5"
            >
              <div class="text-xs font-black tracking-[0.16em] text-primary">{{ item.eyebrow }}</div>
              <h3 class="mt-2 text-xl font-black text-slate-900">{{ item.title }}</h3>
              <p class="mt-3 text-sm font-medium leading-7 text-slate-600">{{ item.body }}</p>
            </article>
          </div>

          <div class="rounded-2xl border border-amber-100 bg-amber-50/70 p-5">
            <button
              type="button"
              class="flex min-h-12 w-full items-center justify-between gap-3 text-left"
              :aria-expanded="isExperienceOpen"
              @click="toggleExperienceSection"
            >
              <div>
                <h3 class="text-xl font-black text-slate-900">報名後會發生什麼</h3>
                <p class="mt-1 text-sm font-bold text-amber-700 md:hidden">體驗流程</p>
              </div>
              <span class="hidden rounded-full bg-white px-3 py-1 text-xs font-black text-primary shadow-sm md:inline-flex">體驗流程</span>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-5 w-5 shrink-0 text-amber-700 transition-transform md:hidden"
                :class="{ 'rotate-180': isExperienceOpen }"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="2"
              >
                <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <div class="mt-4 gap-3 md:grid md:grid-cols-3" :class="isExperienceOpen ? 'grid' : 'hidden md:grid'">
              <div v-for="step in experienceSteps" :key="step.title" class="rounded-xl bg-white p-4 shadow-sm">
                <div class="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-black text-white">{{ step.step }}</div>
                <h4 class="mt-3 text-base font-black text-slate-900">{{ step.title }}</h4>
                <p class="mt-2 text-sm font-medium leading-6 text-slate-600">{{ step.body }}</p>
              </div>
            </div>
          </div>

          <div class="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <button
              type="button"
              class="flex min-h-12 w-full items-center justify-between gap-3 text-left"
              :aria-expanded="isFaqOpen"
              @click="toggleFaqSection"
            >
              <div>
                <h3 class="text-xl font-black text-slate-900">常見問題</h3>
                <p class="mt-1 text-sm font-bold text-gray-400 md:hidden">{{ recruitmentFaqs.length }} 個問題</p>
              </div>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                class="h-5 w-5 shrink-0 text-gray-500 transition-transform md:hidden"
                :class="{ 'rotate-180': isFaqOpen }"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                stroke-width="2"
              >
                <path stroke-linecap="round" stroke-linejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <div class="mt-4 divide-y divide-gray-100" :class="isFaqOpen ? 'block' : 'hidden md:block'">
              <div v-for="faq in recruitmentFaqs" :key="faq.question" class="py-4 first:pt-0 last:pb-0">
                <div class="text-sm font-black text-slate-800">{{ faq.question }}</div>
                <p class="mt-2 text-sm font-medium leading-7 text-slate-600">{{ faq.answer }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- Content Sections -->
    <section class="max-w-7xl mx-auto py-12 px-6 md:py-16 md:px-12 w-full">
      <div class="grid grid-cols-1 gap-14 lg:grid-cols-3 lg:gap-16">
        
        <!-- Schedule Ticker -->
        <div id="schedule" class="scroll-mt-24 lg:col-span-1">
          <div class="mb-8 flex items-end justify-between border-b-2 border-slate-200 pb-4">
            <h3 class="text-3xl font-black text-slate-800 uppercase tracking-wider">賽程表</h3>
            <span class="text-sm font-bold text-slate-400">最近公開賽程</span>
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
                <div class="flex min-h-[78px] w-16 shrink-0 flex-col items-center justify-center rounded-md border border-gray-100 bg-white p-3 shadow-sm">
                  <span class="text-xs font-bold text-gray-400 uppercase">{{ formatScheduleMonth(match.match_date) }}</span>
                  <span class="text-2xl font-black text-slate-800">{{ formatScheduleDay(match.match_date) }}</span>
                  <span
                    v-if="match.category_group"
                    class="mt-1 inline-flex rounded bg-primary px-2 py-0.5 text-[10px] font-black uppercase leading-none tracking-[0.12em] text-white"
                  >
                    {{ match.category_group }}
                  </span>
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
            <span class="text-sm font-bold text-slate-400">點選卡片查看全文</span>
          </div>
          
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6" v-if="latestAnnouncements.length > 0">
            <!-- 第一則大區塊 -->
            <div @click="openAnnouncement(latestAnnouncements[0])" class="bg-white rounded-xl overflow-hidden shadow-md hover:-translate-y-1 transition-transform group cursor-pointer flex flex-col border border-gray-100">
              <div class="h-64 bg-slate-800 relative overflow-hidden">
                <PreviewableImage
                  v-if="latestAnnouncements[0].image_url"
                  :src="latestAnnouncements[0].image_url"
                  :alt="latestAnnouncements[0].title"
                  class="absolute inset-0 z-0 h-full w-full transition-transform duration-700 group-hover:scale-105"
                />
                <div class="pointer-events-none absolute inset-0 bg-gradient-to-tr from-slate-900/80 to-transparent z-10"></div>
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
                   <PreviewableImage
                     v-if="announcement.image_url"
                     :src="announcement.image_url"
                     :alt="announcement.title"
                     class="absolute inset-0 z-0 h-full w-full transition-transform duration-700 group-hover:scale-105"
                   />
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

    <!-- 社群動態 -->
    <section class="relative overflow-hidden border-t border-gray-100/50 bg-slate-50 py-20">
      <div class="container relative z-10 mx-auto px-6">
        <div class="text-center mb-10 md:mb-16">
          <div class="mb-4 inline-flex items-center gap-2 rounded-full border border-gray-200/70 bg-white px-3 py-1 text-sm font-bold text-gray-700 shadow-sm">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
            Follow Us
          </div>
          <h2 class="mb-4 text-3xl font-black tracking-tight text-slate-800 md:text-5xl">關注中港熊戰社群</h2>
          <p class="mx-auto max-w-2xl text-base font-medium leading-8 text-gray-500 md:text-lg">追蹤 Facebook 與 Instagram，隨時掌握球隊訓練動態、賽事照片與精彩片段。</p>
        </div>

        <div class="mx-auto grid max-w-6xl grid-cols-1 gap-6 lg:grid-cols-2">
          <a
            href="https://www.facebook.com/groups/203206672887263"
            target="_blank"
            rel="noopener noreferrer"
            class="group flex min-h-[260px] flex-col justify-between overflow-hidden rounded-2xl border border-blue-100 bg-white p-6 text-left shadow-xl shadow-gray-200/40 transition-all duration-300 hover:-translate-y-1 hover:border-[#1877F2]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1877F2]/50"
          >
            <div class="flex items-center justify-between gap-4">
              <div class="flex items-center gap-3">
                <div class="flex h-12 w-12 items-center justify-center rounded-full bg-[#1877F2]/10 text-[#1877F2]">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-7 w-7" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.469h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.469h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                </div>
                <div>
                  <h3 class="text-xl font-black leading-tight text-slate-900">Facebook 社團</h3>
                  <p class="mt-1 text-sm font-medium text-slate-500">中港熊戰社區棒球隊</p>
                </div>
              </div>
              <span class="hidden rounded-full bg-[#1877F2] px-4 py-2 text-sm font-bold text-white transition-colors group-hover:bg-[#166FE5] sm:inline-flex">加入社團</span>
            </div>
            <div>
              <p class="max-w-md text-base font-medium leading-8 text-slate-600">查看訓練公告、家長交流與隊務提醒，重要消息會同步在社團內更新。</p>
              <span class="mt-6 inline-flex items-center gap-2 text-sm font-black tracking-widest text-[#1877F2]">
                前往 Facebook
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
              </span>
            </div>
          </a>

          <a
            href="https://www.instagram.com/reel/DWIbtw4EZ55/"
            target="_blank"
            rel="noopener noreferrer"
            class="group flex min-h-[260px] flex-col justify-between overflow-hidden rounded-2xl border border-pink-100 bg-white p-6 text-left shadow-xl shadow-gray-200/40 transition-all duration-300 hover:-translate-y-1 hover:border-[#E1306C]/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E1306C]/40"
          >
            <div class="flex items-center justify-between gap-4">
              <div class="flex items-center gap-3">
                <div class="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-tr from-[#feda75] via-[#fa7e1e] to-[#d62976] p-[2px]">
                  <div class="flex h-full w-full items-center justify-center rounded-full bg-white text-[#d62976]">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-7 w-7" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.368-.2 6.792-2.618 6.981-6.98C23.986 15.668 24 15.259 24 12c0-3.259-.014-3.668-.072-4.948-.2-4.358-2.618-6.78-6.98-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
                  </div>
                </div>
                <div>
                  <h3 class="text-xl font-black leading-tight text-slate-900">Instagram 精彩瞬間</h3>
                  <p class="mt-1 text-sm font-medium text-slate-500">@jg_baseball_team</p>
                </div>
              </div>
              <span class="hidden rounded-full bg-[#E1306C] px-4 py-2 text-sm font-bold text-white transition-opacity group-hover:opacity-90 sm:inline-flex">觀看 Reels</span>
            </div>
            <div>
              <p class="max-w-md text-base font-medium leading-8 text-slate-600">看孩子們的練習節奏、比賽片段與球場瞬間，感受中港熊戰的日常。</p>
              <span class="mt-6 inline-flex items-center gap-2 text-sm font-black tracking-widest text-[#E1306C]">
                前往 Instagram
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 transition-transform group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
              </span>
            </div>
          </a>
        </div>
      </div>
    </section>

    <!-- 公告詳細內容 Modal -->
    <el-dialog
      v-model="isAnnouncementModalOpen"
      :title="selectedAnnouncement?.is_pinned ? '置頂公告' : '系統公告'"
      width="90%"
      style="max-width: 600px; border-radius: 16px;"
      class="custom-dialog announcement-dialog"
    >
      <div v-if="selectedAnnouncement" class="-mt-2 pb-4">
        <h3 class="text-2xl font-black text-slate-800 leading-tight mb-2">{{ selectedAnnouncement.title }}</h3>
        <div class="text-sm font-bold text-gray-400 mb-5">{{ dayjs(selectedAnnouncement.created_at).format('YYYY年 MM月 DD日 HH:mm') }}</div>
        
        <div v-if="selectedAnnouncement.image_url" class="mb-6 flex max-h-[300px] items-center justify-center overflow-hidden rounded-xl border border-gray-100 bg-gray-50 shadow-sm">
          <PreviewableImage
            :src="selectedAnnouncement.image_url"
            :alt="selectedAnnouncement.title"
            fit="contain"
            class="h-full w-full"
          />
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
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { ElMessage } from 'element-plus'
import { Bell, Loading } from '@element-plus/icons-vue'
import dayjs from 'dayjs'

import PreviewableImage from '@/components/common/PreviewableImage.vue'
import HomeHolidayHeroOverlay from '@/components/home/HomeHolidayHeroOverlay.vue'
import MatchDetailDialog from '@/components/match-records/MatchDetailDialog.vue'
import { getPublicLandingSnapshot } from '@/services/publicLanding'
import { supabase } from '@/services/supabase'
import { useAuthStore } from '@/stores/auth'
import { useMatchesStore } from '@/stores/matches'
import { usePermissionsStore } from '@/stores/permissions'
import type { PublicLandingAnnouncement, PublicLandingMatch } from '@/types/publicLanding'
import { buildPushEventKey, dispatchPushNotification } from '@/utils/pushNotifications'

const authStore = useAuthStore()
const permissionsStore = usePermissionsStore()
const matchesStore = useMatchesStore()

const isJoinModalOpen = ref(false)
const isSubmitting = ref(false)
const joinFormRef = ref()

const isAnnouncementModalOpen = ref(false)
const selectedAnnouncement = ref<PublicLandingAnnouncement | null>(null)
const latestAnnouncements = ref<PublicLandingAnnouncement[]>([])
const isExperienceOpen = ref(false)
const isFaqOpen = ref(false)

const isLoadingUpcomingMatches = ref(true)
const upcomingMatches = ref<PublicLandingMatch[]>([])

const selectedUpcomingMatchId = ref<string | null>(null)
const upcomingMatchDialogVisible = ref(false)

const recruitmentHighlights = [
  {
    eyebrow: 'TRAINING',
    title: '訓練時間',
    body: '以教練團公告與近期賽程為準，常見安排會落在平日傍晚或週末時段；體驗前會先確認適合的梯次。'
  },
  {
    eyebrow: 'LOCATION',
    title: '訓練地點',
    body: '主要以中港國小與教練公告場地為核心，遇到比賽、移地訓練或天候調整會另外通知。'
  },
  {
    eyebrow: 'AGE',
    title: '適合年齡',
    body: '國小至國中階段皆可先詢問，教練會依年齡、棒球經驗與安全性安排分組。'
  },
  {
    eyebrow: 'FEE',
    title: '費用說明',
    body: '體驗與正式加入費用會依當期方案、訓練頻率與裝備需求確認；送出表單後會由教練團完整說明。'
  }
]

const experienceSteps = [
  {
    step: '1',
    title: '留下資料',
    body: '填寫家長聯絡方式與孩子年齡，讓教練先判斷適合梯次。'
  },
  {
    step: '2',
    title: '確認體驗',
    body: '教練回覆時間、地點、需要準備的用品與注意事項。'
  },
  {
    step: '3',
    title: '到場體驗',
    body: '孩子跟著隊伍練習，家長可同步了解訓練節奏與加入方式。'
  }
]

const recruitmentFaqs = [
  {
    question: '完全沒有棒球經驗可以參加嗎？',
    answer: '可以先報名體驗，教練會依孩子的基礎能力與安全狀況安排合適內容。'
  },
  {
    question: '需要先準備完整裝備嗎？',
    answer: '第一次體驗可先穿適合運動的服裝、帽子與鞋子；球具、手套與正式裝備需求可在體驗後再確認。'
  },
  {
    question: '報名後多久會有人聯絡？',
    answer: '表單送出後會通知管理端，教練團會在方便確認梯次後盡快回覆。'
  }
]

const canViewUpcomingMatchDetails = computed(
  () => authStore.isAuthenticated && permissionsStore.can('matches', 'VIEW')
)

const scrollElementIntoView = (sectionId: string) => {
  document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const scrollToSection = (sectionId: string) => {
  scrollElementIntoView(sectionId)
  window.setTimeout(() => scrollElementIntoView(sectionId), 900)
}

const scrollToSchedule = () => {
  scrollToSection('schedule')
}

const openJoinModal = () => {
  isJoinModalOpen.value = true
}

const toggleExperienceSection = () => {
  isExperienceOpen.value = !isExperienceOpen.value
}

const toggleFaqSection = () => {
  isFaqOpen.value = !isFaqOpen.value
}

const openAnnouncement = (item: PublicLandingAnnouncement) => {
  selectedAnnouncement.value = item
  isAnnouncementModalOpen.value = true
}

const loadPublicLandingSnapshot = async () => {
  isLoadingUpcomingMatches.value = true

  try {
    const snapshot = await getPublicLandingSnapshot(dayjs().format('YYYY-MM-DD'))
    upcomingMatches.value = snapshot.upcomingMatches
    latestAnnouncements.value = snapshot.latestAnnouncements
  } catch (error) {
    console.error('Error fetching public landing snapshot:', error)
    upcomingMatches.value = []
    latestAnnouncements.value = []
  } finally {
    isLoadingUpcomingMatches.value = false
  }
}

const formatScheduleMonth = (matchDate: string) => dayjs(matchDate).format('MMM').toUpperCase()

const formatScheduleDay = (matchDate: string) => dayjs(matchDate).format('DD')

const formatScheduleMeta = (match: PublicLandingMatch) => {
  const normalizedTime = match.match_time?.match(/\d{1,2}:\d{2}/)?.[0] ?? '時間待定'
  const label = match.match_name?.trim() || '賽程'
  return `${label} · ${normalizedTime}`
}

const formatScheduleOpponent = (match: PublicLandingMatch) => {
  if (match.opponent?.trim()) return `vs ${match.opponent.trim()}`
  return match.match_name?.trim() || '對手待確認'
}

const openUpcomingMatch = async (matchId: string) => {
  if (!canViewUpcomingMatchDetails.value) {
    ElMessage.info('需要登入並具備比賽檢視權限，才能查看完整比賽內容。')
    return
  }

  selectedUpcomingMatchId.value = matchId
  upcomingMatchDialogVisible.value = true

  if (matchesStore.matches.some((match) => match.id === matchId)) {
    return
  }

  try {
    await matchesStore.fetchMatch(matchId)

    if (!matchesStore.matches.some((match) => match.id === matchId)) {
      upcomingMatchDialogVisible.value = false
      ElMessage.warning('找不到這場比賽資料。')
    }
  } catch (error) {
    console.error('Error fetching match detail:', error)
    upcomingMatchDialogVisible.value = false
    ElMessage.error('載入比賽資料失敗，請稍後再試。')
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
  } catch {
    return
  }

  isSubmitting.value = true

  try {
    const { data, error } = await supabase
      .from('join_inquiries')
      .insert({
        parent_name: joinForm.parent_name,
        phone: joinForm.phone,
        child_age_or_grade: joinForm.child_age_or_grade,
        message: joinForm.message
      })
      .select('id, parent_name')
      .single()

    if (error) throw error

    void dispatchPushNotification({
      title: `[入隊詢問] 收到 ${data.parent_name} 的聯絡表單`,
      body: `電話：${joinForm.phone}，請到後台查看完整內容。`,
      url: '/join-inquiries',
      feature: 'join_inquiries',
      action: 'VIEW',
      eventKey: buildPushEventKey('join_inquiry', data.id)
    }).catch((pushErr) => {
      console.warn('Join inquiry push notification failed', pushErr)
    })

    ElMessage.success('表單已送出，我們會盡快和你聯絡。')
    isJoinModalOpen.value = false
    Object.assign(joinForm, {
      parent_name: '',
      phone: '',
      child_age_or_grade: '',
      message: ''
    })
  } catch (error: any) {
    console.error('Failed to submit join inquiry:', error)
    ElMessage.error(`送出失敗：${error?.message || '請稍後再試'}`)
  } finally {
    isSubmitting.value = false
  }
}

const handleOpenJoin = () => {
  isJoinModalOpen.value = true
}

onMounted(() => {
  void loadPublicLandingSnapshot()
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

</style>
