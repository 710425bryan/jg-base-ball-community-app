<template>
  <div class="h-full flex flex-col relative animate-fade-in p-2 md:p-6 pb-20 md:pb-6 bg-background text-text overflow-hidden">
    <!-- 頂部標題與操作區 -->
    <div class="flex flex-col xl:flex-row justify-between xl:items-center mb-6 gap-4 shrink-0">
      <div class="flex items-center gap-4 shrink-0">
        <!-- 黑熊 Logo -->
        <div class="w-12 h-12 bg-white rounded-xl border-2 border-primary flex items-center justify-center shadow-sm">
          <span class="text-2xl">🐻</span>
        </div>
        <div>
          <h2 class="text-3xl font-black text-slate-800 tracking-wider flex items-center gap-2">
            球員名單
          </h2>
          <p class="text-secondary font-bold text-sm mt-1 uppercase tracking-[0.2em] flex items-center gap-2">
            中港熊戰<span class="w-10 h-0.5 bg-secondary inline-block"></span>
          </p>
        </div>
      </div>
      
      <div class="flex flex-wrap items-center gap-3 xl:justify-end w-full xl:w-auto">
        <!-- 狀態與組別過濾 -->
        <div class="w-full sm:w-auto flex items-center gap-2 shrink-0">
          <el-select v-model="filterStatus" class="w-24" size="default" placeholder="狀態">
            <el-option label="全狀態" value="全部" />
            <el-option label="在隊" value="在隊" />
            <el-option label="退隊" value="退隊" />
          </el-select>
          <el-select v-model="filterULevel" class="w-24" size="default" placeholder="組別">
            <el-option label="全組別" value="全部" />
            <el-option label="U12" value="U12" />
            <el-option label="U11" value="U11" />
            <el-option label="U10" value="U10" />
            <el-option label="U9" value="U9" />
            <el-option label="U8" value="U8" />
          </el-select>
        </div>

        <!-- 搜尋列 -->
        <div class="w-full sm:w-auto flex-1 min-w-[150px] max-w-md transition-all duration-300">
          <el-input
            v-model="searchQuery"
            placeholder="搜尋姓名..."
            :prefix-icon="Search"
            clearable
          />
        </div>

        <!-- 切換顯示模式 -->
        <div class="bg-gray-100 p-1 rounded-lg flex items-center shadow-inner shrink-0">
          <button @click="viewMode = 'grid'" :class="['px-3 py-1.5 rounded-md text-sm font-bold transition-all flex items-center gap-1.5', viewMode === 'grid' ? 'bg-white text-primary shadow-sm' : 'text-gray-400 hover:text-gray-600']">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
            <span class="hidden sm:inline">卡片</span>
          </button>
          <button @click="viewMode = 'table'" :class="['px-3 py-1.5 rounded-md text-sm font-bold transition-all flex items-center gap-1.5', viewMode === 'table' ? 'bg-white text-primary shadow-sm' : 'text-gray-400 hover:text-gray-600']">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
            <span class="hidden sm:inline">表格</span>
          </button>
        </div>
        <button v-if="isAdmin" @click="syncFromGoogleSheet" :disabled="isSyncing" class="bg-[#ca8a04] hover:bg-[#a16207] active:scale-95 text-white px-5 py-2.5 rounded-lg shadow-md text-sm font-bold transition-all flex items-center gap-2 tracking-wide disabled:opacity-70">
          <el-icon v-if="isSyncing" class="is-loading"><Loading /></el-icon>
          <svg v-else xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3"/></svg>
          <span class="hidden sm:inline">同步表單</span>
        </button>
        <button v-if="isAdmin" @click="openCreateModal()" class="bg-primary hover:bg-primary-hover active:scale-95 text-white px-5 py-2.5 rounded-lg shadow-md text-sm font-bold transition-all flex items-center gap-2 tracking-wide">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" /></svg>
          <span class="hidden sm:inline">新增成員</span>
        </button>
      </div>
    </div>

    <!-- 頁籤與過濾區 -->
    <div class="mb-4 shrink-0">
      <el-tabs v-model="activeTab" class="w-full light-tabs">
        <el-tab-pane label="全體人員" name="全部" />
        <el-tab-pane label="球員列表" name="球員" />
        <el-tab-pane label="教練團隊" name="教練" />
      </el-tabs>
    </div>

    <!-- 內容展示區 -->
    <div class="flex-1 overflow-y-auto min-h-0 pb-4 relative custom-scrollbar pr-2" v-loading="isLoading" element-loading-background="rgba(255, 255, 255, 0.8)">
      <div v-if="filteredMembers.length === 0 && !isLoading" class="flex flex-col justify-center items-center h-full text-slate-500">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-16 w-16 mb-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
        <span class="font-bold text-lg tracking-widest">NO DATA</span>
      </div>
      
      <!-- 表格模式 -->
      <div v-else-if="viewMode === 'table'" class="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden h-[calc(100vh-230px)] flex flex-col">
        <el-table :data="filteredMembers" style="width: 100%" height="100%" row-class-name="cursor-pointer" @row-click="openEditModal" :header-cell-style="{ background: '#f8fafc', color: '#475569', fontWeight: 'bold', whiteSpace: 'nowrap' }">
          <el-table-column width="65" align="center" fixed="left">
            <template #default="{ row }">
              <el-avatar :src="row.avatar_url" shape="circle" :size="36" class="bg-gray-100 border border-gray-200 flex items-center justify-center shrink-0">
                <template #default>
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-gray-400 mt-1" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd" /></svg>
                </template>
              </el-avatar>
            </template>
          </el-table-column>
       
          <el-table-column prop="name" label="姓名" min-width="90" fixed="left" class-name="font-black text-gray-800 text-base" />
          <el-table-column prop="birth_date" label="生日" width="115" sortable>
            <template #default="{ row }">
              <div v-if="row.birth_date" class="flex flex-col leading-tight">
                <span class="font-bold text-gray-800 text-[13px] md:text-sm">{{ row.birth_date }}</span>
                <span class="text-slate-400 font-bold text-[11px] md:text-xs tracking-wide">{{ getROCDate(row.birth_date) }}</span>
              </div>
              <span v-else class="text-gray-300">-</span>
            </template>
          </el-table-column>
          <el-table-column prop="role" label="身分" width="90">
            <template #default="{ row }">
              <span class="text-[10px] md:text-xs font-bold px-2 py-0.5 rounded border uppercase tracking-wider" :class="getRoleClass(row.role)">{{ row.role }}</span>
            </template>
          </el-table-column>
          <el-table-column label="組別" width="95" align="center" sortable :sort-method="sortULevel">
            <template #default="{ row }">
              <span v-if="getULevel(row)" class="text-[10px] md:text-xs font-black px-2 py-0.5 rounded uppercase tracking-wider bg-blue-50 text-blue-600 border border-blue-100">
                {{ getULevel(row) }}
              </span>
              <span v-else class="text-gray-300">-</span>
            </template>
          </el-table-column>
          <el-table-column label="打/投" width="100" align="center">
            <template #default="{ row }">
              <span v-if="row.throwing_hand && row.batting_hand" class="text-xs font-mono font-bold text-gray-500 bg-gray-100 border border-gray-200 rounded px-1.5 py-0.5">
                {{ row.throwing_hand.slice(0,1) }}/{{ row.batting_hand.slice(0,1) }}
              </span>
              <span v-else class="text-gray-300">-</span>
            </template>
          </el-table-column>
          <el-table-column label="狀態" width="80" align="center">
            <template #default="{ row }">
              <span v-if="row.status === '退隊'" class="text-[10px] md:text-xs font-bold px-2 py-0.5 bg-red-50 text-red-600 rounded border border-red-100">退隊</span>
              <span v-else class="text-[10px] md:text-xs font-bold px-2 py-0.5 bg-green-50 text-green-600 rounded border border-green-100">在隊</span>
            </template>
          </el-table-column>
          <el-table-column prop="guardian_name" label="法定代理人" min-width="100" />
          <el-table-column prop="guardian_phone" label="代理人(手機)" min-width="110" />
          <el-table-column prop="jersey_number" label="背號" width="80" align="center">
            <template #default="{ row }">
              <span v-if="row.jersey_number" class="text-xs font-mono font-bold bg-gray-100 px-1.5 py-0.5 rounded">#{{ row.jersey_number }}</span>
              <span v-else class="text-gray-300">-</span>
            </template>
          </el-table-column>
          <el-table-column prop="contact_line_id" label="LINE ID" min-width="140" />
          <el-table-column prop="national_id" label="身分證" width="120">
            <template #default="{ row }">
              <span v-if="row.national_id" class="text-xs font-mono text-gray-400">{{ row.national_id.slice(0, 4) }}***</span>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <!-- 卡片模式 -->
      <div v-else class="flex flex-col gap-3">
        <div v-for="member in filteredMembers" :key="member.id" 
             class="bg-white rounded-xl p-3 md:p-4 border border-gray-200 hover:border-primary/50 hover:shadow-md transition-all duration-300 relative group cursor-pointer flex items-center justify-between shadow-sm"
             @click="openEditModal(member)">
          
          <div class="flex items-center gap-4">
            <div class="w-14 h-14 md:w-16 md:h-16 rounded-full border-2 border-gray-100 group-hover:border-primary flex items-center justify-center text-gray-400 overflow-hidden relative shrink-0 transition-colors bg-gray-50">
              <img v-if="member.avatar_url" :src="member.avatar_url" class="w-full h-full object-cover" />
              <svg v-else xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd" /></svg>
            </div>
            
            <div class="flex flex-col gap-1 text-left">
              <div class="font-black text-slate-800 md:text-xl tracking-wide flex items-baseline gap-2">
                {{ member.name }}
                <span v-if="member.birth_date" class="text-xs md:text-sm text-slate-500 font-bold tracking-wide">
                  {{ member.birth_date }} <span class="text-slate-400 font-medium">({{ getROCDate(member.birth_date) }})</span>
                </span>
              </div>
              <div class="flex flex-wrap items-center gap-2">
                <span v-if="member.status === '退隊'" class="text-xs md:text-sm font-bold px-2 py-0.5 rounded border bg-red-50 text-red-600 border-red-200 tracking-wider">退隊</span>
                <span class="text-xs md:text-sm font-bold px-2 py-0.5 rounded border uppercase tracking-wider" :class="getRoleClass(member.role)">[{{ member.role }}]</span>
                <span v-if="getULevel(member)" class="text-[10px] md:text-xs font-black px-2 py-0.5 rounded uppercase tracking-wider bg-blue-50 text-blue-600 border border-blue-100">
                  {{ getULevel(member) }}
                </span>
                <span v-if="member.jersey_number" class="bg-gray-100 text-gray-500 font-mono font-bold text-xs md:text-sm px-1.5 py-0.5 rounded border border-gray-200">#{{ member.jersey_number }}</span>
                <span v-if="member.throwing_hand && member.batting_hand" class="text-xs md:text-sm font-mono font-bold text-gray-500 px-2 py-0.5 rounded bg-gray-100 border border-gray-200">
                  {{ member.throwing_hand.slice(0,1) }}/{{ member.batting_hand.slice(0,1) }}
                </span>
                <span v-if="member.national_id" class="text-xs md:text-sm font-mono text-gray-400 hidden sm:inline-block">
                  ID: {{ member.national_id.slice(0, 4) }}***
                </span>
              </div>
            </div>
          </div>
          
          <div class="flex items-center gap-4">
            <div class="hidden md:flex flex-col text-right">
              <span class="text-xs uppercase font-bold tracking-widest text-gray-400">Status</span>
              <span v-if="member.status === '退隊'" class="text-sm font-black text-red-500">INACTIVE</span>
              <span v-else class="text-sm font-black text-green-500">ACTIVE</span>
            </div>
          </div>

        </div>
      </div>
    </div>

    <!-- 新增/編輯 Modal -->
    <el-dialog
      v-model="isModalOpen"
      :title="isEditing ? '編輯隊職員資料' : '新增隊職員'"
      width="95%"
      style="max-width: 700px; border-radius: 16px;"
      :show-close="false"
      class="custom-dialog"
    >
      <el-form :model="form" :rules="rules" ref="formRef" label-position="top" class="mt-4 space-y-6 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
        
        <!-- 大頭貼上傳 -->
        <div class="flex justify-center mb-6">
          <div class="relative group cursor-pointer">
            <div class="w-24 h-24 rounded-full overflow-hidden bg-gray-100 border-4 border-white shadow-lg flex items-center justify-center">
              <img v-if="previewAvatar" :src="previewAvatar" class="w-full h-full object-cover"/>
              <svg v-else xmlns="http://www.w3.org/2000/svg" class="h-10 w-10 text-gray-300" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd" /></svg>
            </div>
            <label class="absolute bottom-0 right-0 bg-primary text-white p-2 rounded-full shadow-md cursor-pointer hover:bg-primary/90 transition-transform hover:scale-105 active:scale-95">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              <input type="file" class="hidden" accept="image/*" @change="handleFileSelect" />
            </label>
          </div>
        </div>

        <!-- 區塊1: 基本資料 -->
        <div class="bg-gray-50/50 p-4 rounded-xl border border-gray-100 relative">
          <div class="absolute -top-3 left-4 bg-white px-2 text-sm font-bold text-gray-500 uppercase tracking-wider">個人資料</div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
            <el-form-item label="姓名" prop="name" class="font-bold mb-0">
              <el-input v-model="form.name" placeholder="隊職員姓名" />
            </el-form-item>
            <el-form-item label="身分" prop="role" class="font-bold mb-0">
              <el-select v-model="form.role" class="w-full">
                <el-option label="球員" value="球員" />
                <el-option label="教練" value="教練" />
                <el-option label="管理群" value="管理群" />
                <el-option label="其他" value="其他" />
              </el-select>
            </el-form-item>
            <el-form-item label="在隊狀態" prop="status" class="font-bold mb-0">
              <el-select v-model="form.status" class="w-full text-red-500">
                <el-option label="在隊" value="在隊" />
                <el-option label="退隊" value="退隊" />
              </el-select>
            </el-form-item>
            <el-form-item label="生日 (西元年)" prop="birth_date" class="font-bold mb-0">
              <el-date-picker v-model="form.birth_date" type="date" placeholder="選擇生日" format="YYYY-MM-DD" value-format="YYYY-MM-DD" class="!w-full" />
            </el-form-item>
            <el-form-item label="身分證字號" prop="national_id" class="font-bold mb-0">
              <el-input v-model="form.national_id" placeholder="身分證字號" />
            </el-form-item>
            <el-form-item label="背號" prop="jersey_number" class="font-bold mb-0" v-if="form.role === '球員' || form.role === '教練'">
              <el-input v-model="form.jersey_number" placeholder="隊上背號" />
            </el-form-item>
            <el-form-item prop="is_early_enrollment" class="font-bold mb-0 flex items-center h-[52px]">
              <template #label>
                <div class="inline-flex items-center gap-1 leading-none mr-3">提早入學 <el-tooltip content="9/2以後出生，但提前就讀" placement="top"><el-icon class="text-gray-400 cursor-help"><InfoFilled /></el-icon></el-tooltip></div>
              </template>
              <el-switch v-model="form.is_early_enrollment" active-text="有" inactive-text="無" />
            </el-form-item>
          </div>
        </div>

        <!-- 區塊2: 棒球屬性 -->
        <div class="bg-gray-50/50 p-4 rounded-xl border border-gray-100 relative" v-if="form.role === '球員' || form.role === '教練'">
          <div class="absolute -top-3 left-4 bg-white px-2 text-sm font-bold text-gray-500 uppercase tracking-wider">棒球屬性</div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
            <el-form-item label="投球慣用手" prop="throwing_hand" class="font-bold mb-0">
              <el-select v-model="form.throwing_hand" class="w-full" clearable>
                <el-option label="右投" value="右投" />
                <el-option label="左投" value="左投" />
                <el-option label="左右開弓" value="左右開弓" />
              </el-select>
            </el-form-item>
            <el-form-item label="打擊慣用方向" prop="batting_hand" class="font-bold mb-0">
              <el-select v-model="form.batting_hand" class="w-full" clearable>
                <el-option label="右打" value="右打" />
                <el-option label="左打" value="左打" />
                <el-option label="左右開弓" value="左右開弓" />
              </el-select>
            </el-form-item>
          </div>
        </div>

        <!-- 區塊3: 聯絡資訊 -->
        <div class="bg-gray-50/50 p-4 rounded-xl border border-gray-100 relative">
          <div class="absolute -top-3 left-4 bg-white px-2 text-sm font-bold text-gray-500 uppercase tracking-wider">聯絡資訊</div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
            <el-form-item label="主要聯絡人 LINE ID" prop="contact_line_id" class="font-bold mb-0">
              <el-input v-model="form.contact_line_id" placeholder="LINE ID" />
            </el-form-item>
            <el-form-item label="主要聯絡人關係" prop="contact_relation" class="font-bold mb-0">
              <el-select v-model="form.contact_relation" class="w-full" clearable>
                <el-option label="爸爸" value="爸爸" />
                <el-option label="媽媽" value="媽媽" />
                <el-option label="阿公" value="阿公" />
                <el-option label="阿媽" value="阿媽" />
                <el-option label="自己" value="自己" />
                <el-option label="其他" value="其他" />
              </el-select>
            </el-form-item>
            <el-form-item label="法定代理人 (姓名)" prop="guardian_name" class="font-bold mb-0">
              <el-input v-model="form.guardian_name" placeholder="請填寫姓名" />
            </el-form-item>
            <el-form-item label="法定代理人 (手機)" prop="guardian_phone" class="font-bold mb-0">
              <el-input v-model="form.guardian_phone" placeholder="09XX-XXX-XXX" />
            </el-form-item>
          </div>
        </div>

        <!-- 區塊4: 條款與備註 -->
        <div class="bg-blue-50/30 p-4 rounded-xl border border-blue-100 relative">
          <div class="absolute -top-3 left-4 bg-white px-2 text-sm font-bold text-blue-500 uppercase tracking-wider">條款與其他</div>
          <div class="mt-4">
            <el-form-item prop="portrait_auth" class="mb-4">
              <div class="flex items-start gap-3 w-full bg-white p-4 rounded-xl border border-blue-50 shadow-sm">
                <el-checkbox v-model="form.portrait_auth" size="large" class="mt-1" />
                <div>
                  <div class="font-bold text-gray-800 text-sm mb-1 leading-tight">同意肖像授權</div>
                  <div class="text-sm leading-relaxed text-gray-500 p-0 text-balance text-left" style="white-space: normal;">
                    中港熊戰棒球隊為紀錄隊職員成長過程及參賽紀錄等，需進行活動影音紀錄，因此隊職員的肖像（包含活動照片及影片）可能會出現在臉書之公開粉絲專頁、臉書之私密社團、其他網路公開社群或學校活動海報。
                  </div>
                </div>
              </div>
            </el-form-item>
            
            <el-form-item label="備註" prop="notes" class="font-bold mb-0">
              <el-input v-model="form.notes" type="textarea" :rows="2" placeholder="附加說明或注意事項" />
            </el-form-item>
          </div>
        </div>

      </el-form>

      <template #footer>
        <div class="flex justify-between items-center mt-4 pt-4 border-t border-gray-100">
          <button v-if="isEditing" @click="confirmDelete" class="text-red-500 hover:text-red-600 hover:bg-red-50 font-bold px-4 py-2 rounded-lg transition-colors text-sm flex items-center gap-1">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            刪除
          </button>
          <div v-else></div>

          <div class="flex gap-2">
            <button @click="isModalOpen = false" class="px-5 py-2 text-gray-500 font-bold hover:bg-gray-100 rounded-xl transition-all">取消</button>
            <button @click="submitForm" :disabled="isSubmitting" class="px-6 py-2 bg-primary hover:bg-primary/90 active:scale-95 disabled:opacity-70 text-white font-bold rounded-xl shadow-md transition-all flex items-center justify-center min-w-[100px]">
              <span v-if="isSubmitting" class="flex gap-2 items-center"><el-icon class="is-loading"><Loading /></el-icon> 儲存中</span>
              <span v-else>儲存資料</span>
            </button>
          </div>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { supabase } from '@/services/supabase'
import { useAuthStore } from '@/stores/auth'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Loading, InfoFilled, Search } from '@element-plus/icons-vue'
import axios from 'axios'

const authStore = useAuthStore()
const isAdmin = computed(() => authStore.profile?.role === 'ADMIN')

const isLoading = ref(true)
const isSubmitting = ref(false)
const members = ref<any[]>([])
const activeTab = ref('全部')
const viewMode = ref<'grid' | 'table'>('table')
const searchQuery = ref('')
const filterStatus = ref('在隊')
const filterULevel = ref('全部')

// 計算 U-level
const getULevel = (member: any) => {
  if (member.role !== '球員') return '';
  if (!member.birth_date) return '';
  const bd = new Date(member.birth_date);
  let cohortYear = bd.getFullYear();
  const month = bd.getMonth() + 1;
  const date = bd.getDate();
  
  // 台灣學制：9月2日含以後出生，算次年學長姐同屆（較晚入學），除非標記為提早入學
  if ((month > 9 || (month === 9 && date >= 2)) && !member.is_early_enrollment) {
    cohortYear += 1;
  }
  
  const now = new Date();
  // 基準年：少棒學年度如果在8月前，視為當年賽季；8月後視為次年賽季
  const baseYear = (now.getMonth() + 1) <= 8 ? now.getFullYear() : now.getFullYear() + 1;
  const u = baseYear - cohortYear;
  
  if (u >= 12) return 'U12';
  if (u === 11) return 'U11';
  if (u === 10) return 'U10';
  if (u === 9) return 'U9';
  if (u <= 8) return 'U8';
  return '';
}

// 民國年轉換
const getROCDate = (dateStr: string) => {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length < 3) return '';
  const rocYear = parseInt(parts[0], 10) - 1911;
  return `${rocYear}-${parts[1]}-${parts[2]}`;
}

// U-level 排序邏輯
const sortULevel = (a: any, b: any) => {
  const levelA = getULevel(a);
  const levelB = getULevel(b);
  
  const numA = levelA ? parseInt(levelA.replace(/[^0-9]/g, ''), 10) || 0 : -1;
  const numB = levelB ? parseInt(levelB.replace(/[^0-9]/g, ''), 10) || 0 : -1;
  
  return numA - numB;
}

// 篩選列表
const filteredMembers = computed(() => {
  let result = members.value
  
  if (activeTab.value !== '全部') {
    result = result.filter(m => m.role === activeTab.value)
  }

  if (filterStatus.value !== '全部') {
    result = result.filter(m => (m.status || '在隊') === filterStatus.value)
  }

  if (filterULevel.value !== '全部') {
    result = result.filter(m => getULevel(m) === filterULevel.value)
  }
  
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase().trim()
    result = result.filter(m => m.name && m.name.toLowerCase().includes(q))
  }
  
  // 預設排序：將陣列由 U12 至 U8 (降冪) 排序
  result = [...result].sort((a, b) => {
    // 只有球員互相比較時才套用 U-level 排序
    if (a.role === '球員' && b.role === '球員') {
      const uSort = sortULevel(b, a); // b在前，表示降冪
      if (uSort === 0) {
        return (a.name || '').localeCompare(b.name || '', 'zh-TW');
      }
      return uSort;
    }
    // 若不是皆為球員，則依身分類別與名字的原始順序不變
    return 0;
  });
  
  return result
})

// --- 表單狀態 ---
const isModalOpen = ref(false)
const isEditing = ref(false)
const formRef = ref()
const previewAvatar = ref('')
let selectedFile: File | null = null

const initialForm = {
  id: '',
  name: '',
  role: '球員',
  status: '在隊',
  jersey_number: '',
  birth_date: '',
  is_early_enrollment: false,
  national_id: '',
  throwing_hand: '',
  batting_hand: '',
  contact_line_id: '',
  contact_relation: '',
  guardian_name: '',
  guardian_phone: '',
  portrait_auth: false,
  notes: '',
  avatar_url: ''
}

const form = reactive({ ...initialForm })

const rules = computed(() => ({
  name: [{ required: true, message: '請填寫姓名', trigger: 'blur' }],
  role: [{ required: true, message: '請選擇身分', trigger: 'change' }],
  birth_date: [{ required: true, message: '請選擇生日', trigger: 'change' }],
  national_id: [{ required: true, message: '請填寫身分證字號', trigger: 'blur' }],
  throwing_hand: [{ required: form.role === '球員' || form.role === '教練', message: '請選擇投球慣用手', trigger: 'change' }],
  batting_hand: [{ required: form.role === '球員' || form.role === '教練', message: '請選擇打擊慣用方向', trigger: 'change' }],
  contact_line_id: [{ required: true, message: '請填寫主要聯絡人 LINE ID', trigger: 'blur' }],
  contact_relation: [{ required: true, message: '請選擇主要聯絡人關係', trigger: 'change' }],
  guardian_name: [{ required: true, message: '請填寫法定代理人姓名', trigger: 'blur' }],
  guardian_phone: [{ required: true, message: '請填寫法定代理人手機', trigger: 'blur' }],
  portrait_auth: [{
    required: true,
    message: '請同意肖像授權',
    trigger: 'change',
    validator: (rule: any, value: boolean, callback: any) => {
      if (!value) callback(new Error('請同意肖像授權'))
      else callback()
    }
  }]
}))

// --- 表單同步邏輯 ---
const isSyncing = ref(false)

function parseCSV(text: string) {
  const result: string[][] = [];
  let row: string[] = [];
  let currentToken = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          currentToken += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        currentToken += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        row.push(currentToken);
        currentToken = '';
      } else if (char === '\n' || char === '\r') {
        row.push(currentToken);
        if (row.length > 1 || currentToken !== '') result.push(row);
        row = [];
        currentToken = '';
        if (char === '\r' && i + 1 < text.length && text[i + 1] === '\n') i++;
      } else {
        currentToken += char;
      }
    }
  }
  if (row.length > 0 || currentToken !== '') {
    row.push(currentToken);
    result.push(row);
  }
  return result;
}

const syncFromGoogleSheet = async () => {
  if (!isAdmin.value) return;
  try {
    await ElMessageBox.confirm('確定要從 Google 表單同步球員名單？這將會更新同名的球員資料並新增缺漏的球員。', '🔄 同步確認', {
      confirmButtonText: '開始同步', cancelButtonText: '取消', type: 'warning'
    });
    
    isSyncing.value = true;
    
    const url = 'https://docs.google.com/spreadsheets/d/1WdxX0sv6rlP_Z-9AV0sf4R5CEcZFQiFbRbn30m8g2F0/export?format=csv&id=1WdxX0sv6rlP_Z-9AV0sf4R5CEcZFQiFbRbn30m8g2F0&gid=0';
    const response = await axios.get(url, { responseType: 'text' });
    const csvData = parseCSV(response.data);
    
    if (csvData.length < 2) throw new Error('無法擷取到有效的表單資料或資料為空');

    const existingMap = new Map();
    members.value.forEach(m => {
      existingMap.set(m.name?.trim(), m);
    });

    const inserts: any[] = [];
    const updates: any[] = [];
    
    for (let i = 1; i < csvData.length; i++) {
      const row = csvData[i];
      if (row.length < 10 || !row[0]?.trim()) continue; 
      
      const name = row[0].trim();
      const rawRole = row[1]?.trim();
      const roleMapped = ['教練', '管理群', '其他'].includes(rawRole) ? rawRole : '球員';
      let birth_date: string | null = row[2]?.trim().replace(/\//g, '-') || null;
      if (birth_date && isNaN(Date.parse(birth_date))) {
          birth_date = null;
      }
      
      const is_early_enrollment = row[4]?.trim() === '有';
      const national_id = row[5]?.trim() || null;
      const throwing_hand = row[6]?.trim() || null;
      const batting_hand = row[7]?.trim() || null;
      const contact_line_id = row[8]?.trim() || null;
      const contact_relation = row[9]?.trim() || null;
      const guardian_name = row[10]?.trim() || null;
      const guardian_phone = row[11]?.trim() || null;
      const notes = row[12]?.trim() && !['無', '沒', '無。'].includes(row[12]?.trim()) ? row[12]?.trim() : null;
      const portrait_auth_str = row[13] || '';
      const portrait_auth = portrait_auth_str.includes('同意') || portrait_auth_str.includes('已充分閱讀');
      
      const payload: any = {
        name,
        role: roleMapped,
        birth_date,
        is_early_enrollment,
        national_id,
        throwing_hand,
        batting_hand,
        contact_line_id,
        contact_relation,
        guardian_name,
        guardian_phone,
        notes,
        portrait_auth
      };

      const existingMember = existingMap.get(name);
      if (existingMember) {
        payload.id = existingMember.id;
        updates.push(payload);
      } else {
        inserts.push(payload);
      }
    }
    
    if (updates.length > 0) {
      const { error } = await supabase.from('team_members').upsert(updates, { onConflict: 'id' });
      if (error) throw error;
    }
    
    if (inserts.length > 0) {
      const { error } = await supabase.from('team_members').insert(inserts);
      if (error) throw error;
    }
    
    ElMessage.success(`同步完成！新增 ${inserts.length} 筆，更新 ${updates.length} 筆資料`);
    await fetchData();
  } catch (err: any) {
    if (err !== 'cancel') {
      console.error("Sync Error:", err);
      ElMessage.error('同步失敗：' + (err.message || '發生錯誤'));
    }
  } finally {
    isSyncing.value = false;
  }
}

// --- 讀取資料 ---
const fetchData = async () => {
  isLoading.value = true
  try {
    const { data, error } = await supabase
      .from('team_members')
      .select('*')
      .order('role')
      .order('name')
    if (error) throw error
    members.value = data || []
  } catch (error: any) {
    ElMessage.error('讀取名單失敗：' + error.message)
  } finally {
    isLoading.value = false
  }
}

// --- Modal 操作 ---
const openCreateModal = () => {
  isEditing.value = false
  Object.assign(form, initialForm)
  previewAvatar.value = ''
  selectedFile = null
  if(formRef.value) formRef.value.clearValidate()
  isModalOpen.value = true
}

const openEditModal = (member: any) => {
  if (!isAdmin.value) {
    // 若非管理員，仍可提供彈窗檢視詳情模式(唯讀)，但根據需求這裡直接return，或依照你的設計進行
    return
  }
  isEditing.value = true
  Object.assign(form, member)
  if (!form.status) form.status = '在隊' // 確保舊資料有預設在隊狀態
  previewAvatar.value = member.avatar_url || ''
  selectedFile = null
  if(formRef.value) formRef.value.clearValidate()
  isModalOpen.value = true
}

// --- 圖片上傳邏輯 ---
const handleFileSelect = (event: Event) => {
  const target = event.target as HTMLInputElement
  if (target.files && target.files.length > 0) {
    selectedFile = target.files[0]
    previewAvatar.value = URL.createObjectURL(selectedFile)
  }
}

const uploadAvatar = async (file: File): Promise<string> => {
  const fileExt = file.name.split('.').pop()
  const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`
  const filePath = `avatars/${fileName}`

  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(filePath, file)

  if (uploadError) throw new Error('圖片上傳失敗，請確認 Storage 是否已建立 avatars 儲存桶。')
  
  const { data } = supabase.storage.from('avatars').getPublicUrl(filePath)
  return data.publicUrl
}

// --- 表單送出 ---
const submitForm = async () => {
  if (!formRef.value) return
  
  try {
    const valid = await formRef.value.validate()
    if (!valid) return
  } catch (err) {
    // validation failed
    return
  }
  
  isSubmitting.value = true
  try {
    // 1. 若有選擇新頭像，先上傳
    if (selectedFile) {
      form.avatar_url = await uploadAvatar(selectedFile)
    }

    // 2. 構建 payload (拔除不需要的空 ID，且過濾空字串為 null 以免日期欄位報錯)
    const payload: any = { ...form }
    if (!isEditing.value) delete payload.id // 新增不需要傳入 id
    
    for (const key in payload) {
      if (payload[key] === '') {
        payload[key] = null
      }
    }
    
    console.log("Submitting payload to team_members:", payload)

    // 3. 執行 UPSERT 或 INSERT
    if (isEditing.value) {
      const { error } = await supabase.from('team_members').update(payload).eq('id', form.id)
      if (error) throw error
      ElMessage.success('更新資料成功！')
    } else {
      const { error } = await supabase.from('team_members').insert(payload)
      if (error) throw error
      ElMessage.success('新增隊員成功！')
    }

    isModalOpen.value = false
    fetchData()
  } catch (error: any) {
    console.error("Submit Error:", error)
    ElMessage.error(error.message || '發生錯誤')
  } finally {
    isSubmitting.value = false
  }
}

// --- 刪除資料 ---
const confirmDelete = async () => {
  try {
    await ElMessageBox.confirm(`確定要刪除「${form.name}」的資料嗎？`, '⚠️ 刪除確認', {
      confirmButtonText: '確定刪除', cancelButtonText: '取消', type: 'error'
    })
    
    isSubmitting.value = true
    const { error } = await supabase.from('team_members').delete().eq('id', form.id)
    if (error) throw error
    
    ElMessage.success('刪除成功')
    isModalOpen.value = false
    fetchData()
  } catch (err: any) {
    if (err !== 'cancel') ElMessage.error('刪除失敗：' + err.message)
  } finally {
    isSubmitting.value = false
  }
}

// --- 介面輔助 ---
const getRoleClass = (role: string) => {
  switch (role) {
    case '球員': return 'border-primary text-primary bg-primary/10'
    case '教練': return 'border-secondary text-[#ca8a04] bg-secondary/10'
    case '管理群': return 'border-slate-800 text-slate-800 bg-slate-100'
    default: return 'border-gray-500 text-gray-500 bg-gray-50'
  }
}

onMounted(() => {
  fetchData()
})
</script>

<style>
/* Light Theme Custom Tabs */
.light-tabs .el-tabs__item {
  font-size: 1rem;
  font-weight: 800;
  color: #64748b;
}
.light-tabs .el-tabs__item.is-active {
  color: var(--color-primary);
}
.light-tabs .el-tabs__active-bar {
  background-color: var(--color-primary);
  height: 3px;
}
.light-tabs .el-tabs__nav-wrap::after {
  height: 2px;
  background-color: #e2e8f0;
}

/* Modal Styling */
.custom-dialog.el-dialog {
  border-radius: 16px !important;
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25) !important;
}
.custom-dialog .el-dialog__header {
  border-bottom: 2px solid var(--color-primary);
  margin-right: 0;
  padding: 24px;
}
.custom-dialog .el-dialog__title {
  color: #1e293b !important; 
  font-weight: 900;
  font-size: 1.25rem;
}
.custom-dialog .el-dialog__body {
  padding: 16px 24px 0px 24px;
}
.custom-dialog .el-form-item__label {
  color: #475569 !important;
}

/* Scrollbar */
.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: #cbd5e1;
  border-radius: 10px;
}

/* 行動裝置滿版設定 (含 iOS 瀏海 / 安全區域調整) */
@media (max-width: 639px) {
  .custom-dialog {
    --el-dialog-width: 100% !important;
    --el-dialog-margin-top: 0 !important;
    margin: 0 !important;
    height: 100dvh;
    border-radius: 0 !important;
    display: flex;
    flex-direction: column;
    padding-top: env(safe-area-inset-top);
    padding-bottom: env(safe-area-inset-bottom);
  }
  .custom-dialog .el-dialog__header {
    padding-top: max(24px, env(safe-area-inset-top)) !important;
  }
  .custom-dialog .el-dialog__body {
    flex: 1;
    overflow-y: hidden;
    display: flex;
    flex-direction: column;
    padding: 16px !important;
  }
  .custom-dialog .el-form {
    max-height: none !important;
    flex: 1;
    overflow-y: auto;
  }
}
</style>
