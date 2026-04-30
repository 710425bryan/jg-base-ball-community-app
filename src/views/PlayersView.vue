<template>
  <div class="h-full flex flex-col relative animate-fade-in p-2 md:p-6 pb-0 md:pb-6 bg-background text-text overflow-hidden">
    <!-- 頂部標題與操作區 -->
    <div class="flex flex-col xl:flex-row justify-between xl:items-center mb-5 gap-4 shrink-0 players-page-header">
      <div class="shrink-0">
        <AppPageHeader
          title="球員名單"
          subtitle="中港熊戰"
          :icon="Baseball"
          as="h2"
        />
      </div>
      
      <div class="players-toolbar bg-white/90 border border-slate-200 rounded-lg shadow-sm p-2 flex flex-wrap items-center gap-2 xl:justify-end w-full xl:w-auto">
        <!-- 狀態、年齡與所屬群組過濾 -->
        <div class="players-toolbar-filters w-full sm:w-auto flex flex-wrap items-center gap-2 shrink-0">
          <el-select v-model="filterStatus" class="w-24" size="default" placeholder="狀態">
            <el-option label="全狀態" value="全部" />
            <el-option label="在隊" value="在隊" />
            <el-option label="退隊" value="退隊" />
          </el-select>
          <el-select v-model="filterULevel" class="w-24" size="default" placeholder="年齡">
            <el-option label="全年齡" value="全部" />
            <el-option label="U12" value="U12" />
            <el-option label="U11" value="U11" />
            <el-option label="U10" value="U10" />
            <el-option label="U9" value="U9" />
            <el-option label="U8" value="U8" />
          </el-select>
          <el-select v-model="filterMemberGroup" class="w-40" size="default" placeholder="所屬群組">
            <el-option label="全部群組" value="全部" />
            <el-option label="教練" value="教練" />
            <el-option v-for="option in TEAM_GROUP_OPTIONS" :key="option.value" :label="option.label" :value="option.value" />
          </el-select>
        </div>

        <!-- 搜尋列 -->
        <div class="players-search-field w-full sm:w-auto flex-1 min-w-[180px] max-w-md transition-all duration-300">
          <el-input
            v-model="searchQuery"
            placeholder="搜尋姓名..."
            :prefix-icon="Search"
            clearable
          />
        </div>

        <!-- 切換顯示模式 -->
        <div class="players-view-switch bg-slate-100 p-1 rounded-lg flex items-center shrink-0">
          <button @click="viewMode = 'grid'" :class="['px-3 py-2 rounded-md text-sm font-bold transition-all flex items-center gap-1.5 min-h-10', viewMode === 'grid' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700']">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>
            <span class="hidden sm:inline">卡片</span>
          </button>
          <button @click="viewMode = 'table'" :class="['px-3 py-2 rounded-md text-sm font-bold transition-all flex items-center gap-1.5 min-h-10', viewMode === 'table' ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700']">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg>
            <span class="hidden sm:inline">表格</span>
          </button>
        </div>
        <button v-if="canEditPlayers" @click="openPlayerExportDialog" class="players-toolbar-button bg-white hover:bg-slate-50 active:scale-95 text-slate-700 border border-slate-200 px-4 py-2.5 min-h-10 rounded-lg shadow-sm text-sm font-bold transition-all flex items-center gap-2">
          <el-icon class="text-primary"><Download /></el-icon>
          <span class="hidden sm:inline">下載比賽資料</span>
        </button>
        <button v-if="canEditPlayers" @click="syncFromGoogleSheet" :disabled="isSyncing" class="players-toolbar-button bg-[#ca8a04] hover:bg-[#a16207] active:scale-95 text-white px-4 py-2.5 min-h-10 rounded-lg shadow-sm text-sm font-bold transition-all flex items-center gap-2 disabled:opacity-70">
          <el-icon v-if="isSyncing" class="is-loading"><Loading /></el-icon>
          <svg v-else xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3"/></svg>
          <span class="hidden sm:inline">同步表單</span>
        </button>
        <button v-if="canCreatePlayers" @click="openCreateModal()" class="players-toolbar-button bg-primary hover:bg-primary-hover active:scale-95 text-white px-4 py-2.5 min-h-10 rounded-lg shadow-sm text-sm font-bold transition-all flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" /></svg>
          <span class="hidden sm:inline">新增成員</span>
        </button>
      </div>
    </div>

    <!-- 頁籤與過濾區 -->
    <div class="player-tabs-shell mb-4 shrink-0 bg-white/80 border border-slate-200 rounded-lg p-1 shadow-sm">
      <el-tabs v-model="activeTab" class="w-full light-tabs">
        <el-tab-pane label="全體人員" name="全部" />
        <el-tab-pane label="球員列表" name="球員" />
        <el-tab-pane label="校隊成員" name="校隊" />
        <el-tab-pane label="教練團隊" name="教練" />
      </el-tabs>
    </div>

    <!-- 內容展示區 -->
    <div class="players-content flex-1 overflow-y-auto min-h-0 pb-4 relative custom-scrollbar pr-2" v-loading="isLoading" element-loading-background="rgba(255, 255, 255, 0.8)">
      <div v-if="filteredMembers.length === 0 && !isLoading" class="flex flex-col justify-center items-center h-full text-slate-500 bg-white/80 border border-dashed border-slate-200 rounded-lg">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-16 w-16 mb-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
        <span class="font-bold text-lg tracking-widest">NO DATA</span>
      </div>
      
      <!-- 表格模式 -->
      <div v-else-if="viewMode === 'table'" class="bg-white rounded-xl shadow-sm overflow-hidden h-[calc(100vh-230px)] min-h-[600px] sm:min-h-0 flex flex-col">
        <el-table :data="filteredMembers" style="width: 100%" height="100%" row-class-name="cursor-pointer" @row-click="openEditModal" :header-cell-style="{ fontWeight: 'bold', whiteSpace: 'nowrap' }">
          <el-table-column width="76" align="center" fixed="left">
            <template #default="{ row }">
              <PreviewableImage
                v-if="row.avatar_url"
                :src="row.avatar_url"
                :alt="`${row.name} 大頭照`"
                class="players-photo-frame h-11 w-11 rounded-full border border-gray-200 bg-gray-100 shrink-0"
              />
              <el-avatar v-else shape="circle" :size="44" class="players-photo-frame bg-gray-100 border border-gray-200 flex items-center justify-center shrink-0">
                <template #default>
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 text-gray-400 mt-1" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd" /></svg>
                </template>
              </el-avatar>
            </template>
          </el-table-column>
       
          <el-table-column label="姓名" min-width="110" fixed="left">
            <template #default="{ row }">
              <div class="flex flex-col">
                <span class="font-black text-gray-800 text-base leading-tight">{{ row.name }}</span>
                <span v-if="row.sibling_ids && row.sibling_ids.length > 0 && getSiblingName(row.sibling_ids)" class="text-[10px] font-bold border px-1.5 py-0.5 rounded-sm mt-0.5 w-max inline-flex items-center gap-1" :class="row.is_primary_payer ? 'text-emerald-700 border-emerald-200 bg-emerald-50' : 'text-primary border-primary/20 bg-primary/5'">
                  <span class="tracking-wide">{{ row.is_primary_payer ? '主要繳費人' : '半價優惠' }}</span>
                  <span class="opacity-80 font-medium ml-0.5">· 手足: {{ getSiblingName(row.sibling_ids) }}</span>
                </span>
              </div>
            </template>
          </el-table-column>
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
              <span class="players-role-badge font-bold px-2 py-0.5 rounded border uppercase tracking-wider" :class="getRoleClass(row.role)">{{ row.role }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="team_group" label="所屬群組 (熊隊)" min-width="135">
            <template #default="{ row }">
              <span v-if="row.team_group" class="text-[10px] md:text-xs font-bold px-2 py-0.5 rounded border tracking-wider" :class="getTeamGroupClass(row.team_group)">
                {{ row.team_group }}
              </span>
              <span v-else class="text-gray-300">-</span>
            </template>
          </el-table-column>
          <el-table-column label="年齡組" width="95" align="center" sortable :sort-method="sortULevel">
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
              <div class="inline-flex flex-col items-center gap-1">
                <span v-if="row.status === '退隊'" class="text-[10px] md:text-xs font-bold px-2 py-0.5 bg-red-50 text-red-600 rounded border border-red-100">退隊</span>
                <span v-else class="text-[10px] md:text-xs font-bold px-2 py-0.5 bg-green-50 text-green-600 rounded border border-green-100">在隊</span>
                <span v-if="row.is_inactive_or_graduated" class="text-[10px] md:text-xs font-bold px-2 py-0.5 bg-amber-50 text-amber-700 rounded border border-amber-200">關閉/畢業</span>
              </div>
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
          <el-table-column v-if="canEditPlayers" prop="national_id" label="身分證" width="130">
            <template #default="{ row }">
              <span v-if="row.national_id" class="text-xs font-mono text-gray-400">{{ row.national_id }}</span>
            </template>
          </el-table-column>
        </el-table>
      </div>

      <!-- 卡片模式 -->
      <div v-else class="space-y-7">
        <section v-for="group in groupedMembers" :key="group.key" class="space-y-3">
          <div class="players-group-header sticky top-0 z-20 -mx-2 px-2 py-2 bg-background/95 backdrop-blur-md">
            <div class="bg-white/95 border border-slate-200 rounded-lg shadow-sm px-3 py-2 flex items-center justify-between gap-3">
              <h3 class="text-base md:text-lg font-black text-slate-900 flex items-center gap-2">
                <span class="w-1.5 h-6 rounded-full" :class="group.accentClass"></span>
                {{ group.title }}（{{ group.members.length }}人）
              </h3>
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3 md:gap-4">
            <article
              v-for="member in group.members"
              :key="member.id"
              :role="canEditPlayers ? 'button' : undefined"
              :tabindex="canEditPlayers ? 0 : -1"
              :aria-label="canEditPlayers ? `查看 ${member.name} 資料` : undefined"
              class="players-member-card rounded-lg p-2.5 border border-slate-200 hover:border-primary/50 hover:shadow-lg transition-all duration-200 relative group shadow-sm flex flex-col min-h-[326px] overflow-hidden"
              :class="canEditPlayers ? 'cursor-pointer' : 'cursor-default'"
              @click="openEditModal(member)"
              @keydown.enter.space.prevent="openEditModal(member)"
            >
              <span class="absolute inset-x-0 top-0 h-1" :class="getMemberAccentClass(member)"></span>
              <div class="players-card-photo relative aspect-[4/3] overflow-hidden rounded-md border border-white/80 bg-slate-100 shadow-sm">
                <PreviewableImage
                  v-if="member.avatar_url"
                  :src="member.avatar_url"
                  :alt="`${member.name} 大頭照`"
                  class="players-photo h-full w-full"
                  lazy
                />
                <div v-else class="h-full w-full flex items-center justify-center bg-gradient-to-br from-slate-100 via-white to-orange-50 text-slate-300">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-14 w-14" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd" /></svg>
                </div>
                <div class="absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2">
                  <span class="players-role-badge max-w-[70%] truncate font-black px-2 py-1 rounded-md border border-white/70 bg-white/90 shadow-sm backdrop-blur" :class="getRoleClass(member.role)">{{ member.role }}</span>
                  <span v-if="member.jersey_number" class="bg-slate-950/90 text-white font-mono font-black text-sm px-2.5 py-1 rounded-md shadow-sm shrink-0">#{{ member.jersey_number }}</span>
                </div>
                <div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-slate-950/75 via-slate-900/25 to-transparent px-3 pb-2 pt-8">
                  <div class="flex items-center justify-between gap-2 text-white">
                    <h4 class="font-black text-lg leading-tight truncate">{{ member.name }}</h4>
                    <div class="flex shrink-0 flex-wrap justify-end gap-1">
                      <span v-if="member.status === '退隊'" class="text-[10px] font-bold px-2 py-0.5 rounded-md border border-red-200/70 bg-red-500/90 text-white">退隊</span>
                      <span v-else class="text-[10px] font-bold px-2 py-0.5 rounded-md border border-emerald-200/70 bg-emerald-500/90 text-white">在隊</span>
                      <span v-if="member.is_inactive_or_graduated" class="text-[10px] font-bold px-2 py-0.5 rounded-md border border-amber-200/70 bg-amber-500/95 text-white">關閉/畢業</span>
                    </div>
                  </div>
                </div>
              </div>

              <div class="relative px-1 pt-3">
                <div class="flex flex-wrap items-center gap-1.5 min-h-6">
                  <span v-if="member.team_group" class="inline-flex max-w-full text-[10px] md:text-xs font-bold px-2 py-0.5 rounded-md border truncate" :class="getTeamGroupClass(member.team_group)">
                    {{ member.team_group }}
                  </span>
                  <span v-if="getULevel(member)" class="text-[10px] md:text-xs font-black px-2 py-0.5 rounded-md uppercase bg-sky-50 text-sky-700 border border-sky-100">
                    {{ getULevel(member) }}
                  </span>
                </div>
              </div>

              <div class="relative mt-3 grid grid-cols-2 gap-x-3 gap-y-3 text-xs border-t border-slate-100 px-1 pt-3">
                <div class="min-w-0">
                  <span class="block text-[10px] font-bold text-slate-400 mb-0.5">生日</span>
                  <span v-if="member.birth_date" class="block font-bold text-slate-800 truncate">
                    {{ member.birth_date }}
                  </span>
                  <span v-else class="text-gray-300">-</span>
                </div>
                <div class="min-w-0">
                  <span class="block text-[10px] font-bold text-slate-400 mb-0.5">球衣名字</span>
                  <span v-if="member.jersey_name" class="block font-bold text-slate-800 truncate">
                    {{ member.jersey_name }}
                  </span>
                  <span v-else class="text-gray-300">-</span>
                </div>
                <div>
                  <span class="block text-[10px] font-bold text-slate-400 mb-0.5">球衣尺寸</span>
                  <span v-if="member.jersey_size" class="font-bold text-slate-800">
                    {{ member.jersey_size }}
                  </span>
                  <span v-else class="text-gray-300">-</span>
                </div>
                <div>
                  <span class="block text-[10px] font-bold text-slate-400 mb-0.5">投 / 打</span>
                  <span v-if="member.throwing_hand && member.batting_hand" class="font-mono font-bold text-slate-700">
                    {{ member.throwing_hand.slice(0,1) }}/{{ member.batting_hand.slice(0,1) }}
                  </span>
                  <span v-else class="text-gray-300">-</span>
                </div>
              </div>

              <div class="mt-auto pt-3 px-1 flex flex-wrap items-center gap-2">
                <span v-if="member.sibling_ids && member.sibling_ids.length > 0 && getSiblingName(member.sibling_ids)" class="text-[10px] font-bold px-2 py-1 rounded-md border inline-flex items-center gap-1.5 max-w-full" :class="member.is_primary_payer ? 'text-emerald-700 border-emerald-200 bg-emerald-50' : 'bg-primary/5 text-primary border-primary/20'">
                  <span class="shrink-0">{{ member.is_primary_payer ? '主要繳費人' : '半價優惠' }}</span>
                  <span class="opacity-80 font-medium border-l border-current pl-1.5 text-[9px] truncate">手足: {{ getSiblingName(member.sibling_ids) }}</span>
                </span>
                <span v-else-if="member.is_half_price" class="text-[10px] font-bold px-2 py-1 rounded-md border bg-primary/5 text-primary border-primary/20">
                  半價優惠
                </span>
                <span v-if="member.national_id && canEditPlayers" class="text-[10px] font-mono text-gray-400 hidden sm:inline-block">
                  ID: {{ member.national_id }}
                </span>
              </div>
            </article>
          </div>
        </section>
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
            <div class="players-photo-frame w-28 h-28 sm:w-32 sm:h-32 rounded-full overflow-hidden bg-gray-100 border-4 border-white shadow-lg flex items-center justify-center">
              <PreviewableImage
                v-if="previewAvatar"
                :src="previewAvatar"
                :alt="`${form.name || '隊職員'} 大頭照`"
                class="players-photo h-full w-full"
              />
              <svg v-else xmlns="http://www.w3.org/2000/svg" class="h-12 w-12 text-gray-300" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clip-rule="evenodd" /></svg>
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
                <el-option label="校隊" value="校隊" />
                <el-option label="教練" value="教練" />
                <el-option label="管理群" value="管理群" />
                <el-option label="其他" value="其他" />
              </el-select>
            </el-form-item>
            <el-form-item label="所屬群組 (熊隊)" prop="team_group" class="font-bold mb-0" v-if="form.role === '球員' || form.role === '校隊'">
              <el-select v-model="form.team_group" class="w-full">
                <el-option v-for="option in TEAM_GROUP_OPTIONS" :key="option.value" :label="option.label" :value="option.value" />
              </el-select>
            </el-form-item>
            <el-form-item label="在隊狀態" prop="status" class="font-bold mb-0">
              <el-select v-model="form.status" class="w-full text-red-500">
                <el-option label="在隊" value="在隊" />
                <el-option label="退隊" value="退隊" />
              </el-select>
            </el-form-item>
            <el-form-item prop="is_inactive_or_graduated" class="font-bold mb-0 flex items-center h-[52px]" v-if="form.role === '球員' || form.role === '校隊'">
              <template #label>
                <div class="inline-flex items-center gap-1 leading-none mr-3">
                  關閉球員 / 畢業
                  <el-tooltip content="開啟後，使用者名單會提示此球員已退隊或畢業，不會刪除資料或解除綁定。" placement="top">
                    <el-icon class="text-gray-400 cursor-help"><InfoFilled /></el-icon>
                  </el-tooltip>
                </div>
              </template>
              <el-switch v-model="form.is_inactive_or_graduated" active-text="是" inactive-text="否" />
            </el-form-item>
            <el-form-item label="生日 (西元年)" prop="birth_date" class="font-bold mb-0">
              <el-date-picker v-model="form.birth_date" type="date" placeholder="選擇生日" format="YYYY-MM-DD" value-format="YYYY-MM-DD" class="!w-full" />
            </el-form-item>
            <el-form-item v-if="canEditPlayers" label="身分證字號" prop="national_id" class="font-bold mb-0">
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
            <el-form-item prop="is_primary_payer" class="font-bold mb-0 flex items-center h-[52px]" v-if="form.role === '球員' || form.role === '校隊'">
              <template #label>
                <div class="inline-flex items-center gap-1 leading-none mr-3">主要繳費人 <el-tooltip content="開啟代表此球員為主要繳費代表(全額)，相關手足將自動享有半價折扣" placement="top"><el-icon class="text-gray-400 cursor-help"><InfoFilled /></el-icon></el-tooltip></div>
              </template>
              <el-switch v-model="form.is_primary_payer" active-text="是" inactive-text="否" />
            </el-form-item>
            <el-form-item prop="is_half_price" class="font-bold mb-0 flex items-center h-[52px]" v-if="form.role === '球員' || form.role === '校隊'">
              <template #label>
                <div class="inline-flex items-center gap-1 leading-none mr-3">半價優惠 <el-tooltip content="手動標記此球員強制享有半價優惠" placement="top"><el-icon class="text-gray-400 cursor-help"><InfoFilled /></el-icon></el-tooltip></div>
              </template>
              <el-switch v-model="form.is_half_price" active-text="是" inactive-text="否" />
            </el-form-item>
            <el-form-item prop="sibling_ids" class="font-bold mb-0 flex flex-col h-[72px]" v-if="form.role === '球員' || form.role === '校隊'">
              <template #label>
                <div class="inline-flex items-center gap-1 leading-none mr-3">相關手足 (兄弟姊妹) <el-tooltip content="請選擇有在球隊的兄弟姊妹。系統將依據「主要繳費人」設定自動給予半價優惠" placement="top"><el-icon class="text-gray-400 cursor-help"><InfoFilled /></el-icon></el-tooltip></div>
              </template>
              <el-select v-model="form.sibling_ids" multiple placeholder="無" clearable filterable class="w-full">
                <el-option v-for="m in members.filter(x => x.id !== form.id && (x.role === '球員' || x.role === '校隊'))" :key="m.id" :label="m.name" :value="m.id" />
              </el-select>
            </el-form-item>
            <el-form-item label="球衣名字" prop="jersey_name" class="font-bold mb-0" v-if="form.role === '球員' || form.role === '校隊' || form.role === '教練'">
              <el-input v-model="form.jersey_name" placeholder="球衣顯示名稱" />
            </el-form-item>
            <el-form-item label="球衣尺寸" prop="jersey_size" class="font-bold mb-0" v-if="form.role === '球員' || form.role === '校隊' || form.role === '教練'">
              <el-input v-model="form.jersey_size" placeholder="例如: XS, S, M, L, XL" />
            </el-form-item>
          </div>
        </div>

        <!-- 區塊2: 棒球屬性 -->
        <div class="bg-gray-50/50 p-4 rounded-xl border border-gray-100 relative" v-if="form.role === '球員' || form.role === '校隊' || form.role === '教練'">
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
              <el-input v-if="canEditPlayers" v-model="form.contact_line_id" placeholder="LINE ID" />
              <div v-else class="text-sm font-mono text-gray-500 bg-gray-100 px-3 py-2 rounded-lg tracking-wider">{{ form.contact_line_id || '—' }}</div>
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
              <el-input v-if="canEditPlayers" v-model="form.guardian_phone" placeholder="09XX-XXX-XXX" />
              <div v-else class="text-sm font-mono text-gray-500 bg-gray-100 px-3 py-2 rounded-lg tracking-wider">{{ form.guardian_phone || '—' }}</div>
            </el-form-item>
          </div>
        </div>

        <!-- 區塊3-1: 身分調查 -->
        <div class="bg-purple-50/50 p-4 rounded-xl border border-purple-100 relative mt-6" v-if="form.role === '球員' || form.role === '校隊'">
          <div class="absolute -top-3 left-4 bg-white px-2 text-sm font-bold text-purple-500 uppercase tracking-wider">資格設定</div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
            <el-form-item prop="low_income_qualification" class="font-bold mb-0 flex items-center h-[52px]">
              <template #label>
                <div class="inline-flex items-center gap-1 leading-none mr-3">清寒低收資格 <el-tooltip content="具備清寒低收資格的球員免繳月費" placement="top"><el-icon class="text-gray-400 cursor-help"><InfoFilled /></el-icon></el-tooltip></div>
              </template>
              <el-switch v-model="form.low_income_qualification" active-text="是" inactive-text="否" />
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
          <button v-if="isEditing && canDeletePlayers" @click="confirmDelete" class="text-red-500 hover:text-red-600 hover:bg-red-50 font-bold px-4 py-2 rounded-lg transition-colors text-sm flex items-center gap-1">
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

    <!-- 下載比賽球員資料 Modal -->
    <el-dialog
      v-model="isExportDialogOpen"
      title="下載比賽球員資料"
      width="95%"
      style="max-width: 720px; border-radius: 16px;"
      class="export-dialog"
      append-to-body
    >
      <div class="max-h-[65vh] space-y-7 overflow-y-auto pr-2 custom-scrollbar">
        <section class="export-step">
          <h3 class="export-step-title">1. 選擇要匯出的人員</h3>
          <div class="mb-3 flex flex-wrap items-center gap-2">
            <span class="text-sm font-bold text-slate-500">快速選取:</span>
            <button type="button" class="export-chip" @click="selectExportMembersBy('all')">所有人</button>
            <button v-for="level in exportULevelOptions" :key="level" type="button" class="export-chip" @click="selectExportMembersBy(level)">{{ level }}</button>
            <button type="button" class="export-chip" @click="selectExportMembersBy('coach')">教練</button>
            <button type="button" class="export-chip" @click="clearExportMembers">清除全選</button>
          </div>

          <el-select
            v-model="selectedExportMemberIds"
            multiple
            filterable
            clearable
            collapse-tags
            collapse-tags-tooltip
            :max-collapse-tags="3"
            class="w-full"
            placeholder="請選擇球員/教練"
          >
            <el-option
              v-for="member in exportMemberOptions"
              :key="member.id"
              :label="getExportMemberOptionLabel(member)"
              :value="member.id"
            />
          </el-select>
          <p class="mt-2 text-sm font-semibold text-slate-500">已選擇 {{ selectedExportMembers.length }} 人</p>
        </section>

        <section class="export-step">
          <h3 class="export-step-title">2. 選擇要匯出的欄位</h3>
          <div class="mb-3 flex flex-wrap items-center gap-2">
            <button type="button" class="export-chip" @click="setExportColumnPreset('all')">預設全選</button>
            <button type="button" class="export-chip" @click="setExportColumnPreset('basic')">基本資料</button>
            <button type="button" class="export-chip" @click="setExportColumnPreset('clear')">清除選取</button>
          </div>

          <el-checkbox-group v-if="availableExportColumns.length > 0" v-model="selectedExportColumnKeys" class="grid grid-cols-1 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            <el-checkbox
              v-for="column in availableExportColumns"
              :key="column.key"
              :value="column.key"
              class="export-checkbox"
            >
              {{ column.label }}
            </el-checkbox>
          </el-checkbox-group>
          <div v-else class="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm font-semibold text-slate-500">
            目前沒有可匯出的欄位
          </div>
        </section>

        <section class="export-step">
          <h3 class="export-step-title">3. 選擇下載格式</h3>
          <el-radio-group v-model="exportFormat">
            <el-radio value="csv" class="font-bold">CSV 試算表</el-radio>
          </el-radio-group>
        </section>
      </div>

      <template #footer>
        <div class="flex items-center justify-end gap-3 pt-3">
          <button type="button" @click="isExportDialogOpen = false" class="px-5 py-2 text-gray-500 font-bold hover:bg-gray-100 rounded-lg transition-all">取消</button>
          <button
            type="button"
            @click="exportPlayerMatchCsv"
            :disabled="!canExportPlayerCsv"
            class="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-bold text-white shadow-sm transition-all hover:bg-primary/90 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <el-icon><Download /></el-icon>
            匯出並下載
          </button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { supabase } from '@/services/supabase'
import { compressImage } from '@/utils/imageCompressor'
import { buildPushEventKey, dispatchPushNotification } from '@/utils/pushNotifications'
import {
  buildGuardianAccountSyncRows,
  dedupePlayerSyncRows,
  getProtectedFeeFlagsPayloadForGoogleFormSync,
  type GuardianAccountSyncInput,
  type GuardianAccountSyncRow
} from '@/utils/playerSync'
import { normalizeSiblingIds } from '@/utils/siblingGroups'
import { useAuthStore } from '@/stores/auth'
import { usePermissionsStore } from '@/stores/permissions'
import { usePlayerRosterStore } from '@/stores/playerRoster'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Baseball, Loading, InfoFilled, Search, Download } from '@element-plus/icons-vue'
import AppPageHeader from '@/components/common/AppPageHeader.vue'
import PreviewableImage from '@/components/common/PreviewableImage.vue'
import { downloadUtf8BomCsv } from '@/utils/csvExport'
import axios from 'axios'

const authStore = useAuthStore()
const permissionsStore = usePermissionsStore()
const playerRosterStore = usePlayerRosterStore()
const canEditPlayers = computed(() => permissionsStore.can('players', 'EDIT'))
const canCreatePlayers = computed(() => permissionsStore.can('players', 'CREATE'))
const canDeletePlayers = computed(() => permissionsStore.can('players', 'DELETE'))
const canViewUsers = computed(() => permissionsStore.can('users', 'VIEW'))
const canCreateUsers = computed(() => permissionsStore.can('users', 'CREATE'))
const canEditUsers = computed(() => permissionsStore.can('users', 'EDIT'))

const PLAYER_SYNC_SHEET_ID = '1xERmQABQONXNONfw_pz9cDmz5Pb597sYYVQE3AT5ySk'
const PLAYER_SYNC_SHEET_GID = '0'
const PLAYER_SYNC_CSV_URL = `https://docs.google.com/spreadsheets/d/${PLAYER_SYNC_SHEET_ID}/export?format=csv&id=${PLAYER_SYNC_SHEET_ID}&gid=${PLAYER_SYNC_SHEET_GID}`
const DEFAULT_SYNC_USER_PASSWORD = '123456'
const GENERAL_MEMBER_ROLE_FALLBACK = 'MEMBER'
const GENERAL_MEMBER_ROLE_CANDIDATE_KEYS = ['MEMBER', 'PARENT', 'GENERAL_MEMBER']
const TEAM_GROUP_OPTIONS = [
  {
    label: '拉拉熊(小組)',
    value: '拉拉熊(小組)',
    accentClass: 'bg-orange-400',
    badgeClass: 'bg-orange-50 text-orange-600 border-orange-200'
  },
  {
    label: '暴力熊(大組)',
    value: '暴力熊(大組)',
    accentClass: 'bg-red-600',
    badgeClass: 'bg-red-50 text-red-700 border-red-200'
  },
  {
    label: '成灰熊(中組)',
    value: '成灰熊(中組)',
    accentClass: 'bg-zinc-500',
    badgeClass: 'bg-zinc-100 text-zinc-700 border-zinc-300'
  }
] as const
const LEGACY_TEAM_GROUP_RENAMES: Record<string, string> = {
  '泰迪熊(小組)': '拉拉熊(小組)',
  '灰熊(大組)': '暴力熊(大組)',
  '黑熊(中組)': '成灰熊(中組)'
}
const TEAM_GROUP_ORDER = TEAM_GROUP_OPTIONS.map((option) => option.value)

const normalizeTeamGroup = (teamGroup: unknown) => {
  const group = typeof teamGroup === 'string' ? teamGroup.trim() : ''
  return group ? LEGACY_TEAM_GROUP_RENAMES[group] || group : group
}

const isLoading = computed(() => playerRosterStore.loading)
const lastRosterWarning = ref('')
const isSubmitting = ref(false)
const members = computed(() =>
  buildMembersWithNormalizedSiblings(playerRosterStore.members).map(m => ({
    ...m,
    team_group: normalizeTeamGroup(m.team_group),
    is_inactive_or_graduated: !!m.is_inactive_or_graduated,
    is_primary_payer: !!m.is_primary_payer,
    is_half_price: !!m.is_half_price
  }))
)
const activeTab = ref('全部')
const viewMode = ref<'grid' | 'table'>('grid')
const searchQuery = ref('')
const filterStatus = ref('在隊')
const filterULevel = ref('全部')
const filterMemberGroup = ref('全部')

const isSiblingEligibleRole = (role: string | null | undefined) => role === '球員' || role === '校隊'

type MemberGroup = {
  key: string
  title: string
  sort: number
  accentClass: string
  members: any[]
}

const getTeamGroupAccentClass = (group: string) => {
  return TEAM_GROUP_OPTIONS.find((option) => option.value === group)?.accentClass || 'bg-slate-300'
}

const getMemberGroupMeta = (member: any) => {
  if (member.role === '教練') {
    return {
      key: 'role:教練',
      title: '教練',
      sort: 0,
      accentClass: 'bg-secondary'
    }
  }

  if (member.role === '球員' || member.role === '校隊') {
    const group = member.team_group || '未分組'
    const groupIndex = TEAM_GROUP_ORDER.indexOf(group)
    return {
      key: `team_group:${group}`,
      title: group,
      sort: groupIndex >= 0 ? groupIndex + 10 : 50,
      accentClass: getTeamGroupAccentClass(group)
    }
  }

  const role = member.role || '其他'
  return {
    key: `role:${role}`,
    title: role,
    sort: role === '管理群' ? 80 : 90,
    accentClass: 'bg-slate-400'
  }
}

const getMemberAccentClass = (member: any) => getMemberGroupMeta(member).accentClass

const notifyInsertedMembers = (insertedMembers: Array<{ id: string; name: string; role: string | null | undefined }>) => {
  insertedMembers.forEach((member) => {
    void dispatchPushNotification({
      title: `[新進通知] 歡迎 ${member.name} 入隊！`,
      body: `剛從表單收到了 ${member.name} (${member.role || '球員'}) 的球員資料。`,
      url: '/players',
      feature: 'players',
      action: 'VIEW',
      eventKey: buildPushEventKey('team_member', member.id)
    }).catch((error) => {
      console.warn('球員通知推播傳送失敗', error)
    })
  })
}

const buildMembersWithNormalizedSiblings = (memberList: any[]) => {
  const normalizedSiblingMembers = normalizeSiblingIds(
    memberList
      .filter((member) => isSiblingEligibleRole(member.role))
      .map((member) => ({
        ...member,
        sibling_ids: Array.isArray(member.sibling_ids) ? [...member.sibling_ids] : []
      }))
  )

  const normalizedMap = new Map(
    normalizedSiblingMembers.map((member) => [member.id, member.sibling_ids])
  )

  return memberList.map((member) => ({
    ...member,
    sibling_ids: normalizedMap.get(member.id) ? [...normalizedMap.get(member.id)!] : []
  }))
}

const fetchMembersForSiblingSync = async () => {
  const { data, error } = await supabase
    .from('team_members')
    .select('id, name, role, sibling_ids')
    .order('name')

  if (error) throw error

  return (data || []).map((member) => ({
    ...member,
    sibling_ids: Array.isArray(member.sibling_ids) ? [...member.sibling_ids] : []
  }))
}

const persistNormalizedSiblingIds = async (memberList: any[]) => {
  const normalizedMembers = buildMembersWithNormalizedSiblings(memberList)

  for (const member of normalizedMembers) {
    const { error } = await supabase
      .from('team_members')
      .update({
        sibling_ids: member.sibling_ids
      })
      .eq('id', member.id)

    if (error) throw error
  }

  return normalizedMembers
}

// 計算 U-level
const getULevel = (member: any) => {
  if (member.role !== '球員' && member.role !== '校隊') return '';
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

const getSiblingName = (ids: string[] | string) => {
  if (!ids) return '';
  const idArray = Array.isArray(ids) ? ids : [ids];
  return idArray.map(id => members.value.find(m => m.id === id)?.name).filter(Boolean).join(', ');
}

type ExportQuickSelect = 'all' | 'coach' | 'U12' | 'U11' | 'U10' | 'U9' | 'U8'
type ExportColumnPreset = 'all' | 'basic' | 'clear'
type PlayerExportColumn = {
  key: string
  label: string
  sourceKeys?: string[]
  sensitive?: boolean
  basic?: boolean
  always?: boolean
  getValue: (member: any) => unknown
}

const exportULevelOptions: ExportQuickSelect[] = ['U12', 'U11', 'U10', 'U9', 'U8']
const isExportDialogOpen = ref(false)
const selectedExportMemberIds = ref<string[]>([])
const selectedExportColumnKeys = ref<string[]>([])
const exportFormat = ref<'csv'>('csv')

const hasOwnField = (member: any, key: string) =>
  Object.prototype.hasOwnProperty.call(member || {}, key)

const hasExportValue = (value: unknown) => {
  if (value === null || value === undefined) return false
  if (typeof value === 'boolean') return true
  if (Array.isArray(value)) return value.length > 0
  return String(value).trim() !== ''
}

const hasSourceValue = (member: any, keys: string[]) =>
  keys.some((key) => hasOwnField(member, key) && hasExportValue(member[key]))

const formatBoolean = (value: unknown) => value ? '是' : '否'

const formatDateTime = (value: unknown) => {
  if (!value) return ''
  return String(value).replace('T', ' ').slice(0, 16)
}

const playerExportColumns = computed<PlayerExportColumn[]>(() => [
  { key: 'name', label: '姓名', basic: true, always: true, getValue: (member) => member.name },
  { key: 'role', label: '稱謂/身分', basic: true, sourceKeys: ['role'], getValue: (member) => member.role },
  { key: 'status', label: '在隊狀態', basic: true, sourceKeys: ['status'], getValue: (member) => member.status || '在隊' },
  { key: 'is_inactive_or_graduated', label: '關閉球員/畢業', basic: true, sourceKeys: ['is_inactive_or_graduated'], getValue: (member) => formatBoolean(member.is_inactive_or_graduated) },
  { key: 'team_group', label: '所屬群組 (熊隊)', basic: true, sourceKeys: ['team_group'], getValue: (member) => member.team_group },
  { key: 'u_level', label: '年級類別', basic: true, getValue: (member) => getULevel(member) },
  { key: 'jersey_number', label: '背號', basic: true, sourceKeys: ['jersey_number'], getValue: (member) => member.jersey_number },
  { key: 'jersey_name', label: '球衣名字', sourceKeys: ['jersey_name'], getValue: (member) => member.jersey_name },
  { key: 'jersey_size', label: '球衣尺寸', sourceKeys: ['jersey_size'], getValue: (member) => member.jersey_size },
  { key: 'birth_date', label: '生日(西元)', basic: true, sourceKeys: ['birth_date'], getValue: (member) => member.birth_date },
  { key: 'roc_birth_date', label: '生日(民國)', basic: true, getValue: (member) => getROCDate(member.birth_date) },
  { key: 'national_id', label: '身分證字號', sensitive: true, sourceKeys: ['national_id'], getValue: (member) => member.national_id },
  { key: 'throwing_hand', label: '投球習慣', basic: true, sourceKeys: ['throwing_hand'], getValue: (member) => member.throwing_hand },
  { key: 'batting_hand', label: '打擊習慣', basic: true, sourceKeys: ['batting_hand'], getValue: (member) => member.batting_hand },
  { key: 'contact_relation', label: '聯絡人關係', sourceKeys: ['contact_relation'], getValue: (member) => member.contact_relation },
  { key: 'guardian_name', label: '聯絡人1', sourceKeys: ['guardian_name'], getValue: (member) => member.guardian_name },
  { key: 'guardian_phone', label: '連絡電話1', sensitive: true, sourceKeys: ['guardian_phone'], getValue: (member) => member.guardian_phone },
  { key: 'contact_line_id', label: 'LINE ID', sensitive: true, sourceKeys: ['contact_line_id'], getValue: (member) => member.contact_line_id },
  { key: 'is_early_enrollment', label: '提早入學', sourceKeys: ['is_early_enrollment'], getValue: (member) => formatBoolean(member.is_early_enrollment) },
  { key: 'low_income_qualification', label: '清寒低收資格', sourceKeys: ['low_income_qualification'], getValue: (member) => formatBoolean(member.low_income_qualification) },
  { key: 'is_primary_payer', label: '主要繳費人', sourceKeys: ['is_primary_payer'], getValue: (member) => formatBoolean(member.is_primary_payer) },
  { key: 'is_half_price', label: '半價優惠', sourceKeys: ['is_half_price'], getValue: (member) => formatBoolean(member.is_half_price) },
  { key: 'sibling_ids', label: '相關手足', sourceKeys: ['sibling_ids'], getValue: (member) => getSiblingName(member.sibling_ids) },
  { key: 'portrait_auth', label: '肖像授權', sourceKeys: ['portrait_auth'], getValue: (member) => formatBoolean(member.portrait_auth) },
  { key: 'notes', label: '備註', sourceKeys: ['notes'], getValue: (member) => member.notes },
  { key: 'created_at', label: '建立時間', sourceKeys: ['created_at'], getValue: (member) => formatDateTime(member.created_at) },
  { key: 'updated_at', label: '更新時間', sourceKeys: ['updated_at'], getValue: (member) => formatDateTime(member.updated_at) }
])

const exportMemberOptions = computed(() =>
  members.value
    .filter((member) => member?.id && member?.name)
    .map((member) => ({ ...member, id: String(member.id) }))
)

const selectedExportMembers = computed(() => {
  const selectedIds = new Set(selectedExportMemberIds.value)
  return exportMemberOptions.value.filter((member) => selectedIds.has(member.id))
})

const exportColumnSourceMembers = computed(() =>
  selectedExportMembers.value.length > 0 ? selectedExportMembers.value : exportMemberOptions.value
)

const isExportColumnAvailable = (column: PlayerExportColumn, sourceMembers: any[]) => {
  if (sourceMembers.length === 0) return false
  if (column.sensitive && !canEditPlayers.value) return false
  if (column.always) return true

  return sourceMembers.some((member) => {
    if (column.sourceKeys?.length && hasSourceValue(member, column.sourceKeys)) {
      return true
    }

    return hasExportValue(column.getValue(member))
  })
}

const availableExportColumns = computed(() =>
  playerExportColumns.value.filter((column) => isExportColumnAvailable(column, exportColumnSourceMembers.value))
)

const selectedExportColumns = computed(() => {
  const selectedKeys = new Set(selectedExportColumnKeys.value)
  return availableExportColumns.value.filter((column) => selectedKeys.has(column.key))
})

const canExportPlayerCsv = computed(() =>
  canEditPlayers.value && selectedExportMembers.value.length > 0 && selectedExportColumns.value.length > 0 && exportFormat.value === 'csv'
)

const getExportMemberOptionLabel = (member: any) => {
  const tags = [member.role, getULevel(member), member.team_group]
    .filter(Boolean)
    .join(' / ')

  return tags ? `${member.name} (${tags})` : member.name
}

const setExportColumnPreset = (preset: ExportColumnPreset) => {
  if (preset === 'clear') {
    selectedExportColumnKeys.value = []
    return
  }

  selectedExportColumnKeys.value = availableExportColumns.value
    .filter((column) => preset === 'all' || column.basic)
    .map((column) => column.key)
}

const selectExportMembersBy = (target: ExportQuickSelect) => {
  const nextMembers = exportMemberOptions.value.filter((member) => {
    if (target === 'all') return true
    if (target === 'coach') return member.role === '教練'
    return getULevel(member) === target
  })

  selectedExportMemberIds.value = nextMembers.map((member) => member.id)
}

const clearExportMembers = () => {
  selectedExportMemberIds.value = []
}

const openPlayerExportDialog = () => {
  if (!canEditPlayers.value) return

  if (exportMemberOptions.value.length === 0) {
    ElMessage.warning('目前沒有球員資料可匯出')
    return
  }

  selectedExportMemberIds.value = []
  exportFormat.value = 'csv'
  setExportColumnPreset('all')
  isExportDialogOpen.value = true
}

const exportPlayerMatchCsv = () => {
  if (!canEditPlayers.value) return

  if (selectedExportMembers.value.length === 0) {
    ElMessage.warning('請先選擇要匯出的人員')
    return
  }

  if (selectedExportColumns.value.length === 0) {
    ElMessage.warning('請至少選擇一個匯出欄位')
    return
  }

  const rows = [
    selectedExportColumns.value.map((column) => column.label),
    ...selectedExportMembers.value.map((member) =>
      selectedExportColumns.value.map((column) => column.getValue(member))
    )
  ]
  const dateText = new Date().toISOString().slice(0, 10)

  downloadUtf8BomCsv(`比賽球員資料_${dateText}.csv`, rows)
  ElMessage.success(`已匯出 ${selectedExportMembers.value.length} 人的 CSV`)
  isExportDialogOpen.value = false
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

  if (filterMemberGroup.value !== '全部') {
    result = filterMemberGroup.value === '教練'
      ? result.filter(m => m.role === '教練')
      : result.filter(m => (m.role === '球員' || m.role === '校隊') && m.team_group === filterMemberGroup.value)
  }
  
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase().trim()
    result = result.filter(m => m.name && m.name.toLowerCase().includes(q))
  }
  
  // 預設排序：將陣列由 U12 至 U8 (降冪) 排序
  result = [...result].sort((a, b) => {
    // 只有球員互相比較時才套用 U-level 排序
    if ((a.role === '球員' || a.role === '校隊') && (b.role === '球員' || b.role === '校隊')) {
      const uSort = sortULevel(b, a); // b在前，表示降冪
      if (uSort === 0) {
        return (a.name || '').localeCompare(b.name || '', 'zh-TW');
      }
      return uSort;
    }
    // 若不是皆為球員/校隊，則依身分類別與名字的原始順序不變
    return 0;
  });
  
  return result
})

const groupedMembers = computed<MemberGroup[]>(() => {
  const groupMap = new Map<string, MemberGroup>()

  filteredMembers.value.forEach((member) => {
    const meta = getMemberGroupMeta(member)
    const group = groupMap.get(meta.key)

    if (group) {
      group.members.push(member)
      return
    }

    groupMap.set(meta.key, {
      ...meta,
      members: [member]
    })
  })

  return Array.from(groupMap.values()).sort((a, b) => {
    if (a.sort !== b.sort) return a.sort - b.sort
    return a.title.localeCompare(b.title, 'zh-TW')
  })
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
  team_group: TEAM_GROUP_OPTIONS[0].value,
  status: '在隊',
  jersey_number: '',
  jersey_name: '',
  jersey_size: '',
  birth_date: '',
  is_early_enrollment: false,
  is_inactive_or_graduated: false,
  is_primary_payer: false,
  is_half_price: false,
  low_income_qualification: false,
  sibling_ids: [] as string[],
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
  throwing_hand: [{ required: form.role === '球員' || form.role === '校隊' || form.role === '教練', message: '請選擇投球慣用手', trigger: 'change' }],
  batting_hand: [{ required: form.role === '球員' || form.role === '校隊' || form.role === '教練', message: '請選擇打擊慣用方向', trigger: 'change' }],
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

type SyncMemberRow = {
  id: string
  name?: string | null
  role?: string | null
}

type ProfileForGuardianSync = {
  id: string
  email?: string | null
  linked_team_member_ids?: string[] | null
}

type GuardianAccountSyncResult = {
  total: number
  created: number
  existing: number
  updatedExisting: number
  skippedNoLinkedMember: number
  skippedNoPermission: number
  skippedAuthDuplicate: number
}

const resolveGeneralMemberRoleKeyFromRoles = (roles: any[]) => {
  const exactRole = roles.find((role) => role.role_name === '一般成員')
  if (exactRole?.role_key) return exactRole.role_key

  for (const candidateKey of GENERAL_MEMBER_ROLE_CANDIDATE_KEYS) {
    const candidateRole = roles.find((role) => role.role_key === candidateKey)
    if (candidateRole?.role_key) return candidateRole.role_key
  }

  return ''
}

const resolveGeneralMemberRoleKey = async () => {
  const currentRoleKey = resolveGeneralMemberRoleKeyFromRoles(permissionsStore.roles)
  if (currentRoleKey) return currentRoleKey

  const { data, error } = await supabase
    .from('app_roles')
    .select('role_key, role_name')
    .order('weight', { ascending: true })

  if (error) {
    console.warn('[Player Sync] Unable to resolve app role for general member. Using fallback role.', error)
    return GENERAL_MEMBER_ROLE_FALLBACK
  }

  return resolveGeneralMemberRoleKeyFromRoles(data || []) || GENERAL_MEMBER_ROLE_FALLBACK
}

const getProfileLinkedMemberIds = (profile: ProfileForGuardianSync) =>
  Array.isArray(profile.linked_team_member_ids)
    ? profile.linked_team_member_ids.filter(Boolean)
    : []

const hasSameMemberIds = (left: string[], right: string[]) => {
  if (left.length !== right.length) return false

  const rightSet = new Set(right)
  return left.every((id) => rightSet.has(id))
}

const fetchProfilesByEmail = async (emails: string[]) => {
  const emailSet = new Set(emails)
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, linked_team_member_ids')

  if (error) throw error

  const profilesByEmail = new Map<string, ProfileForGuardianSync>()
  ;(data || []).forEach((profile) => {
    const email = profile.email?.trim().toLowerCase()
    if (email && emailSet.has(email) && !profilesByEmail.has(email)) {
      profilesByEmail.set(email, profile)
    }
  })

  return profilesByEmail
}

const resolveGuardianLinkedMemberIds = (
  row: GuardianAccountSyncRow,
  memberByName: Map<string, SyncMemberRow>
) => {
  const memberIds = new Set<string>()

  row.playerNames.forEach((playerName) => {
    const member = memberByName.get(playerName.trim())
    if (member && isSiblingEligibleRole(member.role)) {
      memberIds.add(member.id)
    }
  })

  return Array.from(memberIds)
}

const updateProfileLinkedMemberIds = async (profileId: string, memberIds: string[]) => {
  const { error } = await supabase
    .from('profiles')
    .update({
      linked_team_member_ids: memberIds.length > 0 ? memberIds : null,
      updated_at: new Date().toISOString()
    })
    .eq('id', profileId)

  if (error) throw error
}

const isDuplicateAuthSignupError = (payload: any, message: string) => {
  const errorText = `${payload?.code || ''} ${payload?.msg || ''} ${payload?.message || ''} ${message}`.toLowerCase()
  return errorText.includes('already') || errorText.includes('registered') || errorText.includes('exists')
}

const createGuardianAuthUser = async (row: GuardianAccountSyncRow) => {
  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/auth/v1/signup`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY
      },
      body: JSON.stringify({ email: row.email, password: DEFAULT_SYNC_USER_PASSWORD })
    }
  )
  const authData = await response.json().catch(() => ({}))
  const errorMessage =
    authData?.msg ||
    authData?.message ||
    authData?.error_description ||
    authData?.error ||
    (!response.ok ? `建立 auth.users 失敗 (${response.status})` : '')

  if (!response.ok || authData?.msg || authData?.code || authData?.error) {
    if (isDuplicateAuthSignupError(authData, errorMessage)) {
      return null
    }

    throw new Error(errorMessage || '建立 auth.users 失敗')
  }

  const newUserId = authData?.user?.id || authData?.id
  if (!newUserId) throw new Error('API 並未正確回傳用戶 ID')

  return newUserId as string
}

const syncGuardianAccounts = async (
  rows: GuardianAccountSyncRow[],
  memberList: SyncMemberRow[]
): Promise<GuardianAccountSyncResult> => {
  const result: GuardianAccountSyncResult = {
    total: rows.length,
    created: 0,
    existing: 0,
    updatedExisting: 0,
    skippedNoLinkedMember: 0,
    skippedNoPermission: 0,
    skippedAuthDuplicate: 0
  }

  if (rows.length === 0) return result

  if (!canViewUsers.value) {
    result.skippedNoPermission = rows.length
    return result
  }

  const profilesByEmail = await fetchProfilesByEmail(rows.map((row) => row.email))
  const memberByName = new Map(
    memberList
      .map((member) => [member.name?.trim(), member] as const)
      .filter(([name]) => Boolean(name))
  ) as Map<string, SyncMemberRow>
  let generalMemberRoleKey = ''

  for (const row of rows) {
    const linkedMemberIds = resolveGuardianLinkedMemberIds(row, memberByName)
    if (linkedMemberIds.length === 0) {
      result.skippedNoLinkedMember += 1
      continue
    }

    const existingProfile = profilesByEmail.get(row.email)
    if (existingProfile) {
      result.existing += 1
      const currentLinkedMemberIds = getProfileLinkedMemberIds(existingProfile)
      const mergedMemberIds = Array.from(new Set([...currentLinkedMemberIds, ...linkedMemberIds]))

      if (!hasSameMemberIds(currentLinkedMemberIds, mergedMemberIds)) {
        if (!canEditUsers.value) {
          result.skippedNoPermission += 1
          continue
        }

        await updateProfileLinkedMemberIds(existingProfile.id, mergedMemberIds)
        existingProfile.linked_team_member_ids = mergedMemberIds
        result.updatedExisting += 1
      }

      continue
    }

    if (!canCreateUsers.value || !canEditUsers.value) {
      result.skippedNoPermission += 1
      continue
    }

    if (!generalMemberRoleKey) {
      generalMemberRoleKey = await resolveGeneralMemberRoleKey()
    }

    const newUserId = await createGuardianAuthUser(row)
    if (!newUserId) {
      result.skippedAuthDuplicate += 1
      continue
    }

    const { error: profileError } = await supabase.rpc('admin_insert_profile', {
      target_id: newUserId,
      p_email: row.email,
      p_name: row.guardianName || row.email,
      p_nickname: null,
      p_role: generalMemberRoleKey,
      p_avatar: null,
      p_is_active: true,
      p_access_start: null,
      p_access_end: null
    })

    if (profileError) throw profileError

    await updateProfileLinkedMemberIds(newUserId, linkedMemberIds)
    result.created += 1
  }

  return result
}

const buildGuardianAccountSyncSummary = (result: GuardianAccountSyncResult) => {
  if (result.total === 0) return ''

  const parts = [`使用者新增 ${result.created} 筆`]

  if (result.existing > 0) {
    parts.push(`既有 email ${result.existing} 筆未重複新增`)
  }
  if (result.updatedExisting > 0) {
    parts.push(`補綁既有使用者 ${result.updatedExisting} 筆`)
  }
  if (result.skippedAuthDuplicate > 0) {
    parts.push(`略過 auth 已存在 ${result.skippedAuthDuplicate} 筆`)
  }
  if (result.skippedNoLinkedMember > 0) {
    parts.push(`略過無法對應球員 ${result.skippedNoLinkedMember} 筆`)
  }
  if (result.skippedNoPermission > 0) {
    parts.push(`略過權限不足 ${result.skippedNoPermission} 筆`)
  }

  return `；${parts.join('，')}`
}

const syncFromGoogleSheet = async () => {
  if (!canEditPlayers.value) return;
  try {
    await ElMessageBox.confirm('確定要從 Google 表單同步球員名單？這將會更新同名球員、新增缺漏球員，並依主要聯絡人 email 建立一般成員帳號；重複 email 不會重複新增。', '🔄 同步確認', {
      confirmButtonText: '開始同步', cancelButtonText: '取消', type: 'warning'
    });
    
    isSyncing.value = true;
    
    const response = await axios.get(PLAYER_SYNC_CSV_URL, { responseType: 'text' });
    const csvData = parseCSV(response.data);
    
    if (csvData.length < 2) throw new Error('無法擷取到有效的表單資料或資料為空');

    const existingMap = new Map();
    members.value.forEach(m => {
      existingMap.set(m.name?.trim(), m);
    });

    const inserts: any[] = [];
    const updates: any[] = [];
    const syncRows: Array<{ name: string; siblingNames: string[]; roleMapped: string }> = [];
    const guardianAccountInputs: GuardianAccountSyncInput[] = [];
    
    for (let i = 1; i < csvData.length; i++) {
      const row = csvData[i];
      if (row.length < 10 || !row[0]?.trim()) continue; 
      
      const name = row[0].trim();
      const rawRole = row[1]?.trim();
      let roleMapped = ['教練', '管理群', '其他'].includes(rawRole) ? rawRole : '球員';
      if (row[2]?.trim() === '是') {
        roleMapped = '校隊';
      }
      
      const siblingNamesRaw = row[3]?.trim();
      const siblingNames = siblingNamesRaw ? siblingNamesRaw.split(/[,、]/).map(s => s.trim()).filter(Boolean) : [];
      let sibling_ids: string[] = [];
      siblingNames.forEach(sName => {
        const sibling = existingMap.get(sName);
        if (sibling && sibling.id) sibling_ids.push(sibling.id);
      });

      let birth_date: string | null = row[4]?.trim().replace(/\//g, '-') || null;
      if (birth_date && isNaN(Date.parse(birth_date))) {
          birth_date = null;
      }
      
      const is_early_enrollment = row[6]?.trim() === '有';
      const national_id = row[7]?.trim() || null;
      const throwing_hand = row[8]?.trim() || null;
      const batting_hand = row[9]?.trim() || null;
      const contact_line_id = row[10]?.trim() || null;
      const contact_email = row[11]?.trim() || null;
      const contact_relation = row[12]?.trim() || null;
      const guardian_name = row[13]?.trim() || null;
      const guardian_phone = row[14]?.trim() || null;
      const jersey_number = row[15]?.trim() || null;
      const jersey_size = row[16]?.trim() || null;
      const jersey_name = row[17]?.trim() || null;
      const low_income_qualification = row[18]?.trim() === '是';
      const notes = row[19]?.trim() && !['無', '沒', '無。'].includes(row[19]?.trim()) ? row[19]?.trim() : null;
      const portrait_auth_str = row[20] || '';
      const portrait_auth = portrait_auth_str.includes('同意') || portrait_auth_str.includes('已充分閱讀');
      
      const basePayload: any = {
        name,
        role: roleMapped,
        birth_date,
        is_early_enrollment,
        sibling_ids,
        national_id,
        throwing_hand,
        batting_hand,
        contact_line_id,
        contact_relation,
        guardian_name,
        guardian_phone,
        jersey_number,
        jersey_size,
        jersey_name,
        low_income_qualification,
        notes,
        portrait_auth
      };

      syncRows.push({
        name,
        siblingNames,
        roleMapped
      })

      if (isSiblingEligibleRole(roleMapped)) {
        guardianAccountInputs.push({
          email: contact_email,
          guardianName: guardian_name,
          playerNames: [name]
        })
      }

      const existingMember = existingMap.get(name);
      if (existingMember) {
        // Google 表單同步不得覆蓋手動維護的主要繳費人/半價優惠設定。
        const payload = {
          ...basePayload,
          id: existingMember.id,
          ...getProtectedFeeFlagsPayloadForGoogleFormSync(true)
        };
        updates.push(payload);
      } else {
        // 新增時：主要繳費人與半價優惠都維持系統預設，後續再由系統內手動調整。
        inserts.push({
          ...basePayload,
          ...getProtectedFeeFlagsPayloadForGoogleFormSync(false)
        });
      }
    }

    const { rows: dedupedUpdates, duplicateCount: duplicateUpdateCount } = dedupePlayerSyncRows(
      updates,
      (payload) => payload.id
    )
    const { rows: dedupedInserts, duplicateCount: duplicateInsertCount } = dedupePlayerSyncRows(
      inserts,
      (payload) => payload.name
    )
    const { rows: dedupedSyncRows } = dedupePlayerSyncRows(
      syncRows,
      (row) => row.name
    )
    const duplicateRowCount = duplicateUpdateCount + duplicateInsertCount

    if (duplicateRowCount > 0) {
      console.warn(
        `[Player Sync] Detected ${duplicateRowCount} duplicate row(s) in Google Sheet. Using the last occurrence for each player.`
      )
    }
    
    if (dedupedUpdates.length > 0) {
      const { error } = await supabase.from('team_members').upsert(dedupedUpdates, { onConflict: 'id' });
      if (error) throw error;
    }
    
    if (dedupedInserts.length > 0) {
      const { data: insertedMembers, error } = await supabase
        .from('team_members')
        .insert(dedupedInserts)
        .select('id, name, role');
      if (error) throw error;
      notifyInsertedMembers(insertedMembers || [])
    }

    const refreshedMembers = await fetchMembersForSiblingSync()
    const memberByName = new Map(
      refreshedMembers.map((member) => [member.name?.trim(), member])
    )

    dedupedSyncRows.forEach((row) => {
      const member = memberByName.get(row.name)
      if (!member) return

      member.sibling_ids = isSiblingEligibleRole(row.roleMapped)
        ? row.siblingNames
            .map((siblingName) => memberByName.get(siblingName)?.id)
            .filter(Boolean)
        : []
    })

    const normalizedMembers = await persistNormalizedSiblingIds(refreshedMembers)
    const guardianAccountRows = buildGuardianAccountSyncRows(guardianAccountInputs)
    const guardianAccountSyncResult = await syncGuardianAccounts(guardianAccountRows, normalizedMembers)
    const guardianAccountSummary = buildGuardianAccountSyncSummary(guardianAccountSyncResult)
    
    ElMessage.success(
      duplicateRowCount > 0
        ? `同步完成！新增 ${dedupedInserts.length} 筆，更新 ${dedupedUpdates.length} 筆資料；偵測到 ${duplicateRowCount} 筆重複列，已以最後一筆為準${guardianAccountSummary}`
        : `同步完成！新增 ${dedupedInserts.length} 筆，更新 ${dedupedUpdates.length} 筆資料${guardianAccountSummary}`
    );
    await fetchData({ force: true });
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
const fetchData = async (options: { force?: boolean } = {}) => {
  try {
    const loadOptions = {
      userId: authStore.user?.id || null,
      canEditPlayers: canEditPlayers.value
    }

    if (options.force) {
      await playerRosterStore.refreshRoster(loadOptions)
    } else {
      await playerRosterStore.loadRoster(loadOptions)
    }

    if (
      playerRosterStore.error &&
      playerRosterStore.members.length > 0 &&
      playerRosterStore.error !== lastRosterWarning.value
    ) {
      lastRosterWarning.value = playerRosterStore.error
      ElMessage.warning('暫時無法確認球員名單是否有更新，已保留目前快取')
    }
  } catch (error: any) {
    ElMessage.error('讀取名單失敗：' + error.message)
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
  // 有 EDIT 權限才可開啟編輯，否則直接 return（只讀情境可於此擴充）
  if (!canEditPlayers.value) return
  isEditing.value = true
  Object.assign(form, initialForm)
  Object.assign(form, member)
  if (!form.status) form.status = '在隊'
  form.is_inactive_or_graduated = !!member.is_inactive_or_graduated
  if (!form.sibling_ids) form.sibling_ids = []
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
  const compressedFile = await compressImage(file, 800, 800)

  const fileExt = compressedFile.name.split('.').pop()
  const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`
  const filePath = `avatars/${fileName}`

  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(filePath, compressedFile)

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
      const { data: insertedMember, error } = await supabase
        .from('team_members')
        .insert(payload)
        .select('id, name, role')
        .single()
      if (error) throw error
      notifyInsertedMembers([insertedMember])
      ElMessage.success('新增隊員成功！')
    }

    const siblingSyncMembers = await fetchMembersForSiblingSync()
    const savedMember = siblingSyncMembers.find((member) => member.name === form.name) || siblingSyncMembers.find((member) => member.id === form.id)
    if (savedMember) {
      savedMember.role = payload.role
      savedMember.sibling_ids = isSiblingEligibleRole(payload.role)
        ? (Array.isArray(payload.sibling_ids) ? [...payload.sibling_ids] : [])
        : []
      await persistNormalizedSiblingIds(siblingSyncMembers)
    }

    isModalOpen.value = false
    await fetchData({ force: true })
  } catch (error: any) {
    console.error("Submit Error:", error)
    ElMessage.error(error.message || '發生錯誤')
  } finally {
    isSubmitting.value = false
  }
}

// --- 刪除資料 ---
const confirmDelete = async () => {
  if (!canDeletePlayers.value) return
  try {
    await ElMessageBox.confirm(`確定要刪除「${form.name}」的資料嗎？`, '⚠️ 刪除確認', {
      confirmButtonText: '確定刪除', cancelButtonText: '取消', type: 'error'
    })
    
    isSubmitting.value = true
    const { error } = await supabase.from('team_members').delete().eq('id', form.id)
    if (error) throw error
    
    ElMessage.success('刪除成功')
    isModalOpen.value = false
    await fetchData({ force: true })
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
    case '校隊': return 'border-pink-400 text-pink-600 bg-pink-50 shadow-sm'
    case '教練': return 'border-secondary text-[#ca8a04] bg-secondary/10'
    case '管理群': return 'border-slate-800 text-slate-800 bg-slate-100'
    default: return 'border-gray-500 text-gray-500 bg-gray-50'
  }
}

const getTeamGroupClass = (group: string) => {
  return TEAM_GROUP_OPTIONS.find((option) => option.value === group)?.badgeClass || 'bg-gray-50 text-gray-500 border-gray-200'
}

onMounted(() => {
  void fetchData()
})
</script>

<style>
.players-toolbar .el-input__wrapper,
.players-toolbar .el-select__wrapper {
  min-height: 40px;
  border-radius: 8px;
  background-color: rgba(255, 255, 255, 0.96);
  box-shadow: inset 0 0 0 1px #e2e8f0 !important;
  transition: box-shadow 160ms ease, background-color 160ms ease;
}
.players-toolbar .el-input__wrapper:hover,
.players-toolbar .el-select__wrapper:hover {
  box-shadow: inset 0 0 0 1px #cbd5e1 !important;
}
.players-toolbar .el-input__wrapper.is-focus,
.players-toolbar .el-select__wrapper.is-focused {
  box-shadow: inset 0 0 0 1px var(--color-primary), 0 0 0 3px rgba(216, 143, 34, 0.14) !important;
}

.player-tabs-shell .el-tabs__header {
  margin: 0;
}
.light-tabs .el-tabs__item {
  height: 38px;
  padding: 0 14px !important;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 800;
  color: #64748b;
  transition: color 160ms ease, background-color 160ms ease, box-shadow 160ms ease;
}
.light-tabs .el-tabs__item.is-active {
  color: var(--color-primary);
  background-color: #fff7ed;
  box-shadow: inset 0 0 0 1px rgba(216, 143, 34, 0.2);
}
.light-tabs .el-tabs__active-bar {
  display: none;
}
.light-tabs .el-tabs__nav-wrap::after {
  display: none;
}

.players-member-card {
  background:
    linear-gradient(145deg, rgba(255, 255, 255, 0.98) 0%, rgba(255, 255, 255, 0.94) 58%, rgba(255, 247, 237, 0.82) 100%);
  box-shadow: 0 12px 26px -20px rgba(15, 23, 42, 0.32);
  isolation: isolate;
  transform: translateZ(0);
}
.players-member-card:hover {
  transform: translateY(-2px);
}
.players-member-card:focus-visible {
  outline: 3px solid rgba(216, 143, 34, 0.28);
  outline-offset: 2px;
}
.players-role-badge {
  font-size: 1rem;
  line-height: 1.25rem;
}
.players-card-photo {
  transition: box-shadow 180ms ease, transform 180ms ease;
}
.players-member-card:hover .players-card-photo {
  box-shadow: 0 16px 30px -20px rgba(15, 23, 42, 0.62);
}

.export-dialog.el-dialog {
  border-radius: 16px !important;
  box-shadow: 0 25px 50px -12px rgba(15, 23, 42, 0.28) !important;
}
.export-dialog .el-dialog__header {
  border-bottom: 1px solid #e2e8f0;
  margin-right: 0;
  padding: 20px 24px 14px;
}
.export-dialog .el-dialog__title {
  color: #0f172a !important;
  font-weight: 900;
}
.export-dialog .el-dialog__body {
  padding: 18px 24px 0;
}
.export-step-title {
  margin-bottom: 12px;
  border-bottom: 1px solid var(--color-primary);
  padding-bottom: 8px;
  color: #c56d12;
  font-size: 0.95rem;
  font-weight: 900;
}
.export-chip {
  min-height: 28px;
  border: 1px solid #dbe3ee;
  border-radius: 999px;
  background: #ffffff;
  padding: 0 12px;
  color: #64748b;
  font-size: 0.78rem;
  font-weight: 800;
  transition: border-color 160ms ease, color 160ms ease, background-color 160ms ease;
}
.export-chip:hover {
  border-color: rgba(216, 143, 34, 0.55);
  background: #fff7ed;
  color: var(--color-primary);
}
.export-checkbox {
  margin-right: 0 !important;
  min-width: 0;
}
.export-checkbox .el-checkbox__label {
  min-width: 0;
  overflow-wrap: anywhere;
  color: #2380ff;
  font-weight: 800;
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

.players-photo,
.players-photo-frame img {
  user-select: none;
  -webkit-user-select: none;
  -webkit-user-drag: none;
  -webkit-touch-callout: none;
}

@media (prefers-reduced-motion: reduce) {
  .players-member-card,
  .players-card-photo,
  .players-toolbar .el-input__wrapper,
  .players-toolbar .el-select__wrapper,
  .light-tabs .el-tabs__item {
    transition: none !important;
  }
  .players-member-card:hover {
    transform: none;
  }
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

@media (max-width: 639px) {
  .players-page-header {
    gap: 0.5rem;
    margin-bottom: 0.625rem;
  }
  .players-toolbar {
    gap: 0.375rem;
    padding: 0.375rem;
  }
  .players-toolbar-filters {
    display: grid;
    grid-template-columns: minmax(0, 0.9fr) minmax(0, 0.9fr) minmax(0, 1.35fr);
    gap: 0.375rem;
  }
  .players-toolbar-filters .el-select {
    width: 100% !important;
  }
  .players-toolbar .el-input__wrapper,
  .players-toolbar .el-select__wrapper {
    min-height: 40px;
  }
  .players-search-field {
    flex: 1 1 7.5rem;
    min-width: 0;
    max-width: none;
  }
  .players-view-switch {
    padding: 0;
  }
  .players-view-switch button,
  .players-toolbar-button {
    width: 44px;
    min-width: 44px;
    min-height: 44px;
    justify-content: center;
  }
  .players-view-switch button {
    padding-left: 0;
    padding-right: 0;
  }
  .players-toolbar-button {
    padding: 0 !important;
  }
  .player-tabs-shell {
    margin-bottom: 0.5rem;
  }
  .light-tabs .el-tabs__item {
    height: 38px;
    padding: 0 10px !important;
    font-size: 1rem;
  }
  .players-content {
    padding-right: 0;
    padding-bottom: 5.5rem;
  }
  .players-group-header {
    padding-top: 0.25rem;
    padding-bottom: 0.375rem;
  }
  .players-group-header > div {
    padding: 0.375rem 0.75rem;
  }
  .players-group-header h3 {
    font-size: 0.95rem;
  }
  .custom-dialog .el-form {
    max-height: none !important;
  }
}
</style>
