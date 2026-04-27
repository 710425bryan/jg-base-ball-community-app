<template>
  <div class="h-full flex flex-col relative animate-fade-in p-2 md:p-6 pb-0 md:pb-6 overflow-hidden">
    <div class="flex flex-col md:flex-row md:justify-between md:items-center mb-6 gap-4 shrink-0">
      <div>
        <h2 class="app-page-title app-page-title--inline">
          使用者名單
          <span class="rounded-full bg-orange-50 px-3 py-1 text-xs font-bold text-primary align-middle md:text-sm">
            {{ users.length }} 名成員
          </span>
        </h2>
        <p class="app-page-subtitle">管理社區內的教練、經理與球員權限</p>
      </div>

      <div class="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-3 self-start md:flex md:w-auto md:items-center">
        <el-input
          v-model="searchQuery"
          placeholder="搜尋使用者或球員姓名"
          :prefix-icon="Search"
          clearable
          size="large"
          class="col-span-2 !w-full md:!w-72"
        />

        <el-select v-model="statusFilter" size="large" class="!w-full md:!w-[10.5rem]">
          <el-option
            v-for="option in accessStatusFilterOptions"
            :key="option.value"
            :label="option.label"
            :value="option.value"
          />
        </el-select>

        <ViewModeSwitch v-model="viewMode" class="justify-self-end" />

        <button @click="openCreateModal" class="col-span-2 w-full bg-primary hover:bg-primary-hover active:scale-95 text-white px-4 sm:px-5 py-2.5 rounded-xl shadow-[0_8px_20px_rgba(216,143,34,0.25)] text-sm font-bold transition-all flex items-center justify-center gap-2 md:col-span-1 md:w-auto md:flex-none min-w-0">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" /></svg>
          新增使用者
        </button>
      </div>
    </div>

    <el-tabs v-model="activeTab" class="flex-1 flex flex-col min-h-0 bg-transparent custom-tabs">
      <el-tab-pane label="系統帳號管理" name="users" class="h-full flex flex-col">
        <div v-if="isLoading" class="flex-1 flex items-center justify-center py-16">
          <el-icon class="is-loading text-primary text-3xl"><Loading /></el-icon>
        </div>

        <div v-else-if="users.length === 0" class="flex-1 flex flex-col items-center justify-center text-gray-400 py-16">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-16 w-16 mb-4 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          <span class="font-bold">目前沒有使用者資料</span>
        </div>

        <div v-else-if="filteredDecoratedUsers.length === 0" class="flex-1 flex flex-col items-center justify-center text-gray-400 py-16">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-16 w-16 mb-4 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L14 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 018 21v-7.586L1.293 6.707A1 1 0 011 6V4a1 1 0 011-1z" /></svg>
          <span class="font-bold">沒有符合篩選條件的使用者</span>
        </div>

        <div v-else class="flex-1 min-h-0 overflow-y-auto pb-[calc(4.5rem+env(safe-area-inset-bottom)+20px)] md:pb-2 pr-1 custom-scrollbar">
          <section v-for="group in groupedUsers" :key="group.roleKey" class="mb-6 last:mb-0">
            <div class="flex items-center justify-between gap-3 mb-3 px-1">
              <div class="flex items-center gap-3 min-w-0">
                <span :class="getRoleTagClass(group.roleKey)" class="px-2.5 py-1 rounded-lg text-xs font-bold border inline-flex items-center gap-1 shrink-0">
                  <span class="w-1.5 h-1.5 rounded-full" :class="getRoleDotClass(group.roleKey)"></span>
                  {{ group.roleKey }}
                </span>
                <h3 class="text-base md:text-lg font-black text-gray-800 truncate">{{ group.roleName }}</h3>
              </div>

              <span class="shrink-0 rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-bold text-gray-500">
                {{ group.users.length }} 人
              </span>
            </div>

            <div v-if="viewMode === 'table'" class="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-[0_2px_12px_rgb(0,0,0,0.05)]">
              <el-table :data="group.users" class="user-table w-full">
                <el-table-column label="使用者" min-width="280">
                  <template #default="{ row }">
                    <div class="flex items-center gap-3 py-1">
                      <div class="relative w-11 h-11 rounded-full overflow-hidden shadow-sm border border-gray-100 bg-gray-50 shrink-0">
                        <PreviewableImage
                          v-if="row.avatar_url"
                          :src="row.avatar_url"
                          :alt="`${row.name} 大頭照`"
                          class="w-full h-full"
                        />
                        <div v-else class="w-full h-full flex items-center justify-center text-gray-400 font-extrabold text-base bg-gradient-to-br from-gray-50 to-gray-200">
                          {{ row.name?.charAt(0) || 'U' }}
                        </div>
                      </div>

                      <div class="min-w-0">
                        <div class="flex flex-wrap items-center gap-2">
                          <span class="font-extrabold text-gray-800 text-sm leading-tight">{{ row.name }}</span>
                          <span v-if="row.nickname" class="text-xs font-bold text-gray-400">({{ row.nickname }})</span>
                        </div>
                        <div class="text-gray-500 text-sm truncate font-medium mt-0.5">{{ row.email }}</div>
                      </div>
                    </div>
                  </template>
                </el-table-column>

                <el-table-column label="角色" min-width="140" align="center">
                  <template #default="{ row }">
                    <span :class="getRoleTagClass(row.role)" class="px-2.5 py-1 rounded-lg text-xs font-bold border inline-flex items-center gap-1">
                      <span class="w-1.5 h-1.5 rounded-full" :class="getRoleDotClass(row.role)"></span>
                      {{ getRoleName(row.role) }}
                    </span>
                  </template>
                </el-table-column>

                <el-table-column label="登入狀態" min-width="220">
                  <template #default="{ row }">
                    <span :class="getAccessStatusTagClass(row.accessState.status)" class="px-2.5 py-1 rounded-lg text-xs font-bold border inline-flex items-center gap-1">
                      <span class="w-1.5 h-1.5 rounded-full" :class="getAccessStatusDotClass(row.accessState.status)"></span>
                      {{ row.accessState.label }}
                    </span>
                    <div class="text-xs text-gray-400 mt-1">{{ getAccessWindowLabel(row) }}</div>
                  </template>
                </el-table-column>

                <el-table-column label="綁定成員" min-width="220">
                  <template #default="{ row }">
                    <div class="text-sm font-bold text-gray-700">{{ getLinkedMemberLabel(row) }}</div>
                    <div class="text-xs text-gray-400 mt-1">{{ getLinkedMemberMeta(row) }}</div>
                  </template>
                </el-table-column>

                <el-table-column label="上線時間" min-width="180">
                  <template #default="{ row }">
                    <div class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-black" :class="getLastSeenBadgeClass(row.last_seen_at)">
                      <span class="w-2.5 h-2.5 rounded-full shadow-sm" :class="getLastSeenDotClass(row.last_seen_at)"></span>
                      {{ getLastSeenStatus(row.last_seen_at) }}
                    </div>
                    <div class="text-xs mt-1" :class="getLastSeenMetaClass(row.last_seen_at)">{{ formatDate(row.last_seen_at, true) }}</div>
                  </template>
                </el-table-column>

                <el-table-column label="建立時間" min-width="160">
                  <template #default="{ row }">
                    <div class="text-sm font-semibold text-gray-700">{{ formatDate(row.created_at, true) }}</div>
                  </template>
                </el-table-column>

                <el-table-column label="操作" width="120" align="center">
                  <template #default="{ row }">
                    <div class="flex justify-center gap-2">
                      <button
                        @click="openEditModal(row)"
                        class="p-2.5 text-gray-400 hover:text-primary hover:bg-orange-50 rounded-xl transition-all border border-transparent hover:border-orange-100"
                        title="編輯"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                      </button>

                      <button
                        @click="confirmDelete(row)"
                        class="p-2.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all border border-transparent hover:border-red-100"
                        title="刪除"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                  </template>
                </el-table-column>
              </el-table>
            </div>

            <div v-else class="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <article
                v-for="row in group.users"
                :key="row.id"
                class="bg-white rounded-2xl shadow-[0_2px_12px_rgb(0,0,0,0.05)] border border-gray-100/80 p-3 sm:p-5 flex flex-col gap-2.5 sm:gap-4"
              >
                <div class="flex items-start justify-between gap-3 sm:gap-4">
                  <div class="flex items-center gap-3 sm:gap-4 min-w-0">
                    <div class="relative w-12 h-12 sm:w-14 sm:h-14 rounded-full overflow-hidden shadow-sm border border-gray-100 bg-gray-50 shrink-0">
                      <PreviewableImage
                        v-if="row.avatar_url"
                        :src="row.avatar_url"
                        :alt="`${row.name} 大頭照`"
                        class="w-full h-full"
                      />
                      <div v-else class="w-full h-full flex items-center justify-center text-gray-400 font-extrabold text-base sm:text-lg bg-gradient-to-br from-gray-50 to-gray-200">
                        {{ row.name?.charAt(0) || 'U' }}
                      </div>
                    </div>

                    <div class="min-w-0">
                      <div class="flex flex-wrap items-center gap-2">
                        <span class="font-extrabold text-gray-800 text-base leading-tight">{{ row.name }}</span>
                        <span v-if="row.nickname" class="text-sm font-bold text-gray-400">({{ row.nickname }})</span>
                      </div>
                      <div class="text-gray-500 text-sm truncate font-medium mt-0.5">{{ row.email }}</div>
                      <div class="flex flex-wrap items-center gap-2 mt-2">
                        <span :class="getRoleTagClass(row.role)" class="px-2.5 py-1 rounded-lg text-xs font-bold border inline-flex items-center gap-1">
                          <span class="w-1.5 h-1.5 rounded-full" :class="getRoleDotClass(row.role)"></span>
                          {{ getRoleName(row.role) }}
                        </span>
                        <span :class="getAccessStatusTagClass(row.accessState.status)" class="hidden sm:inline-flex px-2.5 py-1 rounded-lg text-xs font-bold border items-center gap-1">
                          <span class="w-1.5 h-1.5 rounded-full" :class="getAccessStatusDotClass(row.accessState.status)"></span>
                          {{ row.accessState.label }}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div class="flex gap-1.5 sm:gap-2 shrink-0">
                    <button
                      @click="openEditModal(row)"
                      class="p-2 sm:p-2.5 text-gray-400 hover:text-primary hover:bg-orange-50 rounded-xl transition-all border border-transparent hover:border-orange-100"
                      title="編輯"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                    </button>

                    <button
                      @click="confirmDelete(row)"
                      class="p-2 sm:p-2.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all border border-transparent hover:border-red-100"
                      title="刪除"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                </div>

                <div class="sm:hidden pl-[3.75rem]">
                  <span class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-black" :class="getLastSeenBadgeClass(row.last_seen_at)">
                    <span class="w-2.5 h-2.5 rounded-full shadow-sm" :class="getLastSeenDotClass(row.last_seen_at)"></span>
                    上線時間：{{ getLastSeenStatus(row.last_seen_at) }}
                  </span>
                </div>

                <div class="hidden sm:grid sm:grid-cols-2 xl:grid-cols-4 gap-3">
                  <div class="rounded-2xl border border-gray-100 bg-gray-50/70 p-3">
                    <div class="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-400">綁定成員</div>
                    <div class="mt-2 text-sm font-bold text-gray-800">{{ getLinkedMemberLabel(row) }}</div>
                    <div class="mt-1 text-xs text-gray-500 leading-relaxed">{{ getLinkedMemberMeta(row) }}</div>
                  </div>

                  <div class="rounded-2xl border border-gray-100 bg-gray-50/70 p-3">
                    <div class="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-400">登入狀態</div>
                    <div class="mt-2 text-sm font-bold text-gray-800">{{ row.accessState.label }}</div>
                    <div class="mt-1 text-xs text-gray-500 leading-relaxed">{{ row.accessState.message }}</div>
                  </div>

                  <div class="rounded-2xl border border-gray-100 bg-gray-50/70 p-3">
                    <div class="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-400">有效區間</div>
                    <div class="mt-2 text-sm font-bold text-gray-800">{{ getAccessWindowLabel(row) }}</div>
                    <div class="mt-1 text-xs text-gray-500 leading-relaxed">{{ getAccessWindowMeta(row) }}</div>
                  </div>

                  <div class="rounded-2xl border border-gray-100 bg-gray-50/70 p-3">
                    <div class="text-[11px] font-bold uppercase tracking-[0.18em] text-gray-400">上線時間</div>
                    <div class="mt-2">
                      <span class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-black" :class="getLastSeenBadgeClass(row.last_seen_at)">
                        <span class="w-2.5 h-2.5 rounded-full shadow-sm" :class="getLastSeenDotClass(row.last_seen_at)"></span>
                        {{ getLastSeenStatus(row.last_seen_at) }}
                      </span>
                    </div>
                    <div class="mt-1 text-xs leading-relaxed" :class="getLastSeenMetaClass(row.last_seen_at)">{{ formatDate(row.last_seen_at, true) }}</div>
                  </div>
                </div>
              </article>
            </div>
          </section>
        </div>
      </el-tab-pane>

      <el-tab-pane label="角色與權限設定" name="roles" class="h-full">
        <RolePermissionsManager />
      </el-tab-pane>
    </el-tabs>

    <el-dialog
      v-model="isModalOpen"
      :title="isEditing ? '編輯使用者資料' : '新增使用者'"
      width="90%"
      style="max-width: 560px; border-radius: 16px;"
      :show-close="false"
      class="custom-dialog"
    >
      <el-form :model="form" :rules="rules" ref="formRef" label-position="top" class="mt-2 space-y-4">
        <div class="flex flex-col items-center justify-center mb-6">
          <div class="relative w-24 h-24 rounded-full border-2 border-dashed border-gray-300 bg-gray-50 flex flex-col items-center justify-center overflow-hidden hover:bg-gray-100 transition-colors cursor-pointer" @click="triggerFileInput">
            <PreviewableImage
              v-if="form.avatar_url || avatarPreview"
              :src="avatarPreview || form.avatar_url"
              :alt="`${form.name || '使用者'} 大頭照`"
              class="absolute inset-0 z-10 h-full w-full"
            />
            <div class="z-0 flex flex-col items-center justify-center text-gray-400" :class="{ 'opacity-0': form.avatar_url || avatarPreview }">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 mb-1 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
              <span class="text-sm font-bold">上傳大頭貼</span>
            </div>
            <button
              v-if="form.avatar_url || avatarPreview"
              type="button"
              class="absolute bottom-1 right-1 z-20 rounded-full bg-primary px-2 py-1 text-[10px] font-bold text-white shadow-sm"
              @click.stop="triggerFileInput"
            >
              更換
            </button>
            <input type="file" ref="fileInput" class="hidden" accept="image/*" @change="handleFileSelect" />
          </div>
        </div>

        <el-form-item label="登入信箱 (Email)" prop="email" class="font-bold">
          <el-input v-model="form.email" placeholder="輸入常用 Email" :disabled="isEditing" size="large" />
          <p v-if="isEditing" class="text-sm text-gray-400 font-normal mt-1 w-full">信箱建立後不可直接修改，如需變更請由使用者本人自行更改。</p>
        </el-form-item>

        <el-form-item v-if="!isEditing" label="初始登入密碼" prop="password" class="font-bold">
          <el-input v-model="form.password" type="password" placeholder="請設定 6 碼以上的初始密碼" size="large" show-password />
        </el-form-item>

        <div class="flex gap-4 w-full flex-col sm:flex-row">
          <el-form-item label="真實姓名" prop="name" class="font-bold flex-1">
            <el-input v-model="form.name" placeholder="輸入姓名" size="large" />
          </el-form-item>
          <el-form-item label="綽號 / 稱呼" prop="nickname" class="font-bold flex-1">
            <el-input v-model="form.nickname" placeholder="(選填)" size="large" />
          </el-form-item>
        </div>

        <el-form-item label="角色權限" prop="role" class="font-bold">
          <el-select v-model="form.role" placeholder="請選擇職位角色" size="large" class="w-full">
            <el-option
              v-for="r in permissionsStore.roles"
              :key="r.role_key"
              :label="`${r.role_key} — ${r.role_name}`"
              :value="r.role_key"
            />
          </el-select>
        </el-form-item>

        <div class="rounded-2xl border border-gray-100 bg-gray-50/70 p-4">
          <div class="flex items-center justify-between gap-4">
            <div>
              <div class="text-sm font-extrabold text-gray-800">允許登入</div>
              <div class="mt-1 text-xs font-medium text-gray-500">{{ form.is_active ? '此帳號可在有效時間內登入' : '關閉後使用者將無法登入系統' }}</div>
            </div>
            <el-switch v-model="form.is_active" size="large" active-text="啟用" inactive-text="停權" />
          </div>

          <div class="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <el-form-item label="可登入開始時間" class="font-bold !mb-0">
              <el-date-picker
                v-model="form.access_start"
                type="datetime"
                format="YYYY/MM/DD HH:mm"
                value-format="YYYY-MM-DDTHH:mm:ssZ"
                placeholder="不限制"
                size="large"
                class="!w-full"
                clearable
              />
            </el-form-item>

            <el-form-item label="可登入結束時間" class="font-bold !mb-0">
              <el-date-picker
                v-model="form.access_end"
                type="datetime"
                format="YYYY/MM/DD HH:mm"
                value-format="YYYY-MM-DDTHH:mm:ssZ"
                placeholder="永久有效"
                size="large"
                class="!w-full"
                clearable
              />
            </el-form-item>
          </div>
        </div>

        <el-form-item label="綁定球員 / 校隊" class="font-bold">
          <el-select v-model="form.linked_team_member_ids" placeholder="可不綁定" size="large" class="w-full" multiple collapse-tags collapse-tags-tooltip clearable filterable>
            <el-option-group v-for="group in bindingOptionGroups" :key="group.role" :label="group.label">
              <el-option
                v-for="member in group.members"
                :key="member.id"
                :label="member.optionLabel"
                :value="member.id"
              />
            </el-option-group>
          </el-select>
          <p class="text-sm text-gray-400 font-normal mt-1 w-full">可多選綁定多位球員或校隊成員，方便後續識別與管理。</p>
        </el-form-item>
      </el-form>

      <template #footer>
        <div class="flex justify-end gap-3 mt-4 pt-4 border-t border-gray-100">
          <button @click="isModalOpen = false" class="px-5 py-2.5 text-gray-500 font-bold hover:bg-gray-100 rounded-xl transition-all">取消</button>
          <button @click="submitForm" :disabled="isSubmitting" class="px-6 py-2.5 bg-gray-800 hover:bg-gray-900 active:scale-95 disabled:opacity-70 text-white font-bold rounded-xl shadow-lg shadow-gray-200 transition-all flex items-center justify-center min-w-[100px]">
            <span v-if="isSubmitting" class="flex gap-2 items-center"><el-icon class="is-loading"><Loading /></el-icon> 儲存中</span>
            <span v-else>確認儲存</span>
          </button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Loading, Search } from '@element-plus/icons-vue'
import PreviewableImage from '@/components/common/PreviewableImage.vue'
import RolePermissionsManager from '@/components/RolePermissionsManager.vue'
import ViewModeSwitch from '@/components/ViewModeSwitch.vue'
import { supabase } from '@/services/supabase'
import { usePermissionsStore } from '@/stores/permissions'
import { compressImage } from '@/utils/imageCompressor'
import { getProfileAccessState, type ProfileAccessState, type ProfileAccessStatus } from '@/utils/profileAccess'

type ViewMode = 'table' | 'grid'
type AccessStatusFilter = 'all' | ProfileAccessStatus

type UserRow = {
  id: string
  email: string
  name: string
  nickname?: string | null
  role: string
  avatar_url?: string | null
  created_at?: string | null
  updated_at?: string | null
  linked_team_member_ids?: string[] | null
  linked_team_member_id?: string | null
  last_seen_at?: string | null
  is_active?: boolean | null
  access_start?: string | null
  access_end?: string | null
}

type BindingMember = {
  id: string
  name: string
  role: string
  status?: string | null
  team_group?: string | null
  avatar_url?: string | null
}

type DecoratedUser = UserRow & {
  linkedMemberIds: string[]
  linkedMembers: BindingMember[]
  missingLinkedMemberCount: number
  accessState: ProfileAccessState
}

type UserGroup = {
  roleKey: string
  roleName: string
  users: DecoratedUser[]
}

const permissionsStore = usePermissionsStore()

const activeTab = ref('users')
const viewMode = ref<ViewMode>('grid')
const statusFilter = ref<AccessStatusFilter>('all')
const searchQuery = ref('')
const fallbackRoleNames: Record<string, string> = {
  ADMIN: '系統管理員',
  MANAGER: '管理員',
  HEAD_COACH: '總教練',
  COACH: '教練'
}
const fallbackRolePriority = ['ADMIN', 'MANAGER', 'HEAD_COACH', 'COACH']
const accessStatusOrder: ProfileAccessStatus[] = ['active', 'suspended', 'not_started', 'expired']

const users = ref<UserRow[]>([])
const bindingMembers = ref<BindingMember[]>([])
const isLoading = ref(true)

const isModalOpen = ref(false)
const isEditing = ref(false)
const isSubmitting = ref(false)
const formRef = ref()
const fileInput = ref<HTMLInputElement | null>(null)
const avatarFile = ref<File | null>(null)
const avatarPreview = ref<string | null>(null)

const form = reactive({
  id: '',
  email: '',
  password: '',
  name: '',
  nickname: '',
  role: 'COACH',
  avatar_url: '',
  linked_team_member_ids: [] as string[],
  is_active: true,
  access_start: null as string | null,
  access_end: null as string | null
})

const rules = {
  email: [{ required: true, message: '請輸入電子信箱', trigger: 'blur' }, { type: 'email', message: '信箱格式不正確', trigger: ['blur', 'change'] }],
  password: [{ required: true, message: '請輸入密碼', trigger: 'blur' }, { min: 6, message: '密碼至少需 6 碼', trigger: 'blur' }],
  name: [{ required: true, message: '請輸入姓名', trigger: 'blur' }],
  role: [{ required: true, message: '請選擇權限', trigger: 'change' }]
}

const bindingMemberMap = computed(() => {
  return new Map(bindingMembers.value.map((member) => [member.id, member]))
})

const normalizeLinkedMemberIds = (user: Pick<UserRow, 'linked_team_member_ids' | 'linked_team_member_id'>) => {
  if (Array.isArray(user.linked_team_member_ids)) {
    return user.linked_team_member_ids.filter(Boolean)
  }

  if (user.linked_team_member_id) {
    return [user.linked_team_member_id]
  }

  return []
}

const decoratedUsers = computed<DecoratedUser[]>(() => {
  return users.value.map((user) => {
    const linkedMemberIds = normalizeLinkedMemberIds(user)
    const linkedMembers = linkedMemberIds
      .map((memberId) => bindingMemberMap.value.get(memberId))
      .filter((member): member is BindingMember => Boolean(member))

    return {
      ...user,
      linkedMemberIds,
      linkedMembers,
      missingLinkedMemberCount: Math.max(0, linkedMemberIds.length - linkedMembers.length),
      accessState: getProfileAccessState(user)
    }
  })
})

const normalizeSearchValue = (value: string | null | undefined) =>
  value?.trim().toLowerCase() ?? ''

const searchedDecoratedUsers = computed(() => {
  const keyword = normalizeSearchValue(searchQuery.value)
  if (!keyword) return decoratedUsers.value

  return decoratedUsers.value.filter((user) => {
    const searchableText = [
      user.name,
      user.nickname,
      user.email,
      user.role,
      getRoleName(user.role),
      ...user.linkedMembers.flatMap((member) => [
        member.name,
        member.role,
        member.team_group
      ])
    ]
      .map((value) => normalizeSearchValue(value))
      .filter(Boolean)
      .join(' ')

    return searchableText.includes(keyword)
  })
})

const filteredDecoratedUsers = computed(() => {
  if (statusFilter.value === 'all') {
    return searchedDecoratedUsers.value
  }

  return searchedDecoratedUsers.value.filter((user) => user.accessState.status === statusFilter.value)
})

const accessStatusFilterOptions = computed(() => {
  const counts = searchedDecoratedUsers.value.reduce<Record<ProfileAccessStatus, number>>((summary, user) => {
    summary[user.accessState.status] += 1
    return summary
  }, {
    active: 0,
    suspended: 0,
    not_started: 0,
    expired: 0
  })

  return [
    { value: 'all' as const, label: `全部 ${searchedDecoratedUsers.value.length}` },
    ...accessStatusOrder.map((status) => ({
      value: status,
      label: `${getAccessStatusLabel(status)} ${counts[status]}`
    }))
  ]
})

const roleOrderMap = computed(() => {
  const orderedRoleKeys = permissionsStore.roles.length > 0
    ? permissionsStore.roles.map((role) => role.role_key)
    : fallbackRolePriority

  return new Map(orderedRoleKeys.map((roleKey, index) => [roleKey, index]))
})

const bindingOptionGroups = computed(() => {
  return ['球員', '校隊']
    .map((role) => ({
      role,
      label: `${role}名單`,
      members: bindingMembers.value
        .filter((member) => member.role === role)
        .map((member) => ({
          ...member,
          optionLabel: buildBindingOptionLabel(member)
        }))
    }))
    .filter((group) => group.members.length > 0)
})

const getRoleName = (role: string) => {
  const matchedRole = permissionsStore.roles.find((item) => item.role_key === role)
  return matchedRole ? matchedRole.role_name : fallbackRoleNames[role] || role
}

const getRoleTagClass = (role: string) => {
  if (role === 'ADMIN') return 'bg-red-50 border-red-200 text-red-700'
  if (role === 'MANAGER') return 'bg-purple-50 border-purple-200 text-purple-700'
  if (role === 'HEAD_COACH') return 'bg-orange-50 border-orange-200 text-primary'
  return 'bg-blue-50 border-blue-200 text-blue-700'
}

const getRoleDotClass = (role: string) => {
  if (role === 'ADMIN') return 'bg-red-500'
  if (role === 'MANAGER') return 'bg-purple-500'
  if (role === 'HEAD_COACH') return 'bg-primary'
  return 'bg-blue-500'
}

const getAccessStatusLabel = (status: ProfileAccessStatus) => {
  const labels: Record<ProfileAccessStatus, string> = {
    active: '可登入',
    suspended: '已停權',
    not_started: '尚未開始',
    expired: '已過期'
  }

  return labels[status]
}

const getAccessStatusTagClass = (status: ProfileAccessStatus) => {
  if (status === 'active') return 'bg-emerald-50 border-emerald-200 text-emerald-700'
  if (status === 'suspended') return 'bg-red-50 border-red-200 text-red-700'
  if (status === 'not_started') return 'bg-sky-50 border-sky-200 text-sky-700'
  return 'bg-amber-50 border-amber-200 text-amber-700'
}

const getAccessStatusDotClass = (status: ProfileAccessStatus) => {
  if (status === 'active') return 'bg-emerald-500'
  if (status === 'suspended') return 'bg-red-500'
  if (status === 'not_started') return 'bg-sky-500'
  return 'bg-amber-500'
}

const buildBindingOptionLabel = (member: BindingMember) => {
  const detailParts = [member.team_group, member.status && member.status !== '在隊' ? member.status : null].filter(Boolean)
  return detailParts.length > 0 ? `${member.name}｜${detailParts.join('｜')}` : member.name
}

const getLinkedMemberLabel = (row: DecoratedUser) => {
  if (row.linkedMemberIds.length === 0) return '未綁定'
  if (row.linkedMembers.length === 0) return '綁定資料不存在'

  if (row.linkedMembers.length === 1) {
    return `${row.linkedMembers[0].role}｜${row.linkedMembers[0].name}`
  }

  const previewNames = row.linkedMembers.slice(0, 2).map((member) => member.name).join('、')
  return row.linkedMembers.length > 2 ? `${previewNames} 等 ${row.linkedMembers.length} 位` : previewNames
}

const getLinkedMemberMeta = (row: DecoratedUser) => {
  if (row.linkedMemberIds.length === 0) return '可在編輯視窗多選球員或校隊成員'
  if (row.linkedMembers.length === 0) return '原綁定成員可能已刪除或不在可見清單中'

  if (row.missingLinkedMemberCount > 0) {
    return `共 ${row.linkedMemberIds.length} 筆綁定，其中 ${row.missingLinkedMemberCount} 筆資料不存在`
  }

  const roleSummary = row.linkedMembers.reduce<Record<string, number>>((summary, member) => {
    summary[member.role] = (summary[member.role] || 0) + 1
    return summary
  }, {})

  return Object.entries(roleSummary)
    .map(([role, count]) => `${role} ${count} 位`)
    .join('｜')
}

const groupedUsers = computed<UserGroup[]>(() => {
  const groupedMap = new Map<string, DecoratedUser[]>()

  for (const user of filteredDecoratedUsers.value) {
    const existingGroup = groupedMap.get(user.role) ?? []
    existingGroup.push(user)
    groupedMap.set(user.role, existingGroup)
  }

  return Array.from(groupedMap.entries())
    .sort(([roleA], [roleB]) => {
      const indexA = roleOrderMap.value.get(roleA) ?? Number.MAX_SAFE_INTEGER
      const indexB = roleOrderMap.value.get(roleB) ?? Number.MAX_SAFE_INTEGER

      if (indexA !== indexB) {
        return indexA - indexB
      }

      return getRoleName(roleA).localeCompare(getRoleName(roleB), 'zh-TW')
    })
    .map(([roleKey, roleUsers]) => ({
      roleKey,
      roleName: getRoleName(roleKey),
      users: roleUsers
    }))
})

const formatDate = (dateString?: string | null, includeTime = false) => {
  if (!dateString) return '-'

  const date = new Date(dateString)
  if (Number.isNaN(date.getTime())) return '-'

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')

  if (!includeTime) {
    return `${year}/${month}/${day}`
  }

  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${year}/${month}/${day} ${hours}:${minutes}`
}

const getAccessWindowLabel = (row: Pick<UserRow, 'access_start' | 'access_end'>) => {
  const startLabel = formatDate(row.access_start, true)
  const endLabel = formatDate(row.access_end, true)

  if (!row.access_start && !row.access_end) return '永久有效'
  if (row.access_start && row.access_end) return `${startLabel} - ${endLabel}`
  if (row.access_start) return `${startLabel} 起`
  return `至 ${endLabel}`
}

const getAccessWindowMeta = (row: DecoratedUser) => {
  if (!row.access_start && !row.access_end) return '未設定使用時間限制'
  return row.accessState.allowed ? '目前位於可登入區間內' : row.accessState.message
}

const getLastSeenDiff = (dateString?: string | null) => {
  if (!dateString) return null

  const parsed = new Date(dateString).getTime()
  if (Number.isNaN(parsed)) return null

  return Math.max(0, Date.now() - parsed)
}

type LastSeenStatus = 'online' | 'offline' | 'stale' | 'unknown'

const getLastSeenState = (dateString?: string | null): LastSeenStatus => {
  const diff = getLastSeenDiff(dateString)

  if (diff == null) return 'unknown'
  if (diff <= 10 * 60 * 1000) return 'online'
  if (diff < 7 * 24 * 60 * 60 * 1000) return 'offline'
  return 'stale'
}

const getLastSeenStatus = (dateString?: string | null) => {
  const diff = getLastSeenDiff(dateString)

  if (diff == null) return '尚無紀錄'
  if (diff <= 10 * 60 * 1000) return '在線中'
  if (diff < 60 * 60 * 1000) return `離線 ${Math.max(1, Math.floor(diff / (60 * 1000)))} 分鐘`
  if (diff < 24 * 60 * 60 * 1000) return `離線 ${Math.floor(diff / (60 * 60 * 1000))} 小時`
  if (diff < 7 * 24 * 60 * 60 * 1000) return `離線 ${Math.floor(diff / (24 * 60 * 60 * 1000))} 天`
  return '很久沒上線'
}

const getLastSeenBadgeClass = (dateString?: string | null) => {
  const state = getLastSeenState(dateString)

  if (state === 'online') return 'bg-lime-100 border-lime-300 text-lime-800 shadow-[0_0_0_3px_rgba(132,204,22,0.16)]'
  if (state === 'offline') return 'bg-amber-50 border-amber-200 text-amber-700'
  if (state === 'stale') return 'bg-rose-50 border-rose-200 text-rose-700'
  return 'bg-slate-100 border-slate-200 text-slate-500'
}

const getLastSeenDotClass = (dateString?: string | null) => {
  const state = getLastSeenState(dateString)

  if (state === 'online') return 'bg-lime-500 animate-pulse'
  if (state === 'offline') return 'bg-amber-500'
  if (state === 'stale') return 'bg-rose-500'
  return 'bg-slate-400'
}

const getLastSeenMetaClass = (dateString?: string | null) => {
  const state = getLastSeenState(dateString)

  if (state === 'online') return 'text-lime-700'
  if (state === 'offline') return 'text-amber-600'
  if (state === 'stale') return 'text-rose-600'
  return 'text-slate-400'
}

const fetchUsers = async () => {
  isLoading.value = true

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error
    users.value = (data || []) as UserRow[]
  } catch (error: any) {
    ElMessage.error('無法載入名單：' + error.message)
  } finally {
    isLoading.value = false
  }
}

const fetchBindingMembers = async () => {
  try {
    const { data, error } = await supabase
      .from('team_members')
      .select('id, name, role, status, team_group, avatar_url')
      .in('role', ['球員', '校隊'])
      .order('role', { ascending: true })
      .order('status', { ascending: true })
      .order('name', { ascending: true })

    if (error) throw error
    bindingMembers.value = (data || []) as BindingMember[]
  } catch (error: any) {
    ElMessage.error('無法載入綁定名單：' + error.message)
  }
}

const resetFormItems = () => {
  form.id = ''
  form.email = ''
  form.password = ''
  form.name = ''
  form.nickname = ''
  form.role = 'COACH'
  form.avatar_url = ''
  form.linked_team_member_ids = []
  form.is_active = true
  form.access_start = null
  form.access_end = null
  avatarFile.value = null
  avatarPreview.value = null

  if (formRef.value) formRef.value.clearValidate()
}

const openCreateModal = () => {
  resetFormItems()
  isEditing.value = false
  isModalOpen.value = true
}

const openEditModal = (row: DecoratedUser) => {
  resetFormItems()
  isEditing.value = true
  form.id = row.id
  form.email = row.email
  form.name = row.name
  form.nickname = row.nickname || ''
  form.role = row.role
  form.avatar_url = row.avatar_url || ''
  form.linked_team_member_ids = [...row.linkedMemberIds]
  form.is_active = row.is_active !== false
  form.access_start = row.access_start || null
  form.access_end = row.access_end || null
  isModalOpen.value = true
}

const triggerFileInput = () => {
  fileInput.value?.click()
}

const handleFileSelect = (event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return

  if (file.size > 5 * 1024 * 1024) {
    ElMessage.warning('圖片大小請勿超過 5MB')
    return
  }

  avatarFile.value = file
  avatarPreview.value = URL.createObjectURL(file)
}

const uploadAvatar = async (userId: string) => {
  if (!avatarFile.value) return form.avatar_url

  const compressedFile = await compressImage(avatarFile.value, 800, 800)
  const fileExt = compressedFile.name.split('.').pop()
  const filePath = `user-${userId}-${Math.random().toString(36).substring(7)}.${fileExt}`

  const { error: uploadError } = await supabase.storage.from('avatars').upload(filePath, compressedFile)
  if (uploadError) throw uploadError

  const { data } = supabase.storage.from('avatars').getPublicUrl(filePath)
  return data.publicUrl
}

const normalizeAccessTimestamp = (value?: string | null) => {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

const validateAccessWindow = () => {
  const accessStart = normalizeAccessTimestamp(form.access_start)
  const accessEnd = normalizeAccessTimestamp(form.access_end)

  if (!accessStart || !accessEnd) {
    return true
  }

  const startTime = new Date(accessStart).getTime()
  const endTime = new Date(accessEnd).getTime()

  if (Number.isNaN(startTime) || Number.isNaN(endTime)) {
    ElMessage.warning('請確認可登入時間格式是否正確')
    return false
  }

  if (startTime > endTime) {
    ElMessage.warning('可登入開始時間不可晚於結束時間')
    return false
  }

  return true
}

const submitForm = async () => {
  if (!formRef.value) return

  await formRef.value.validate(async (valid: boolean) => {
    if (!valid) return
    if (!validateAccessWindow()) return

    isSubmitting.value = true

    try {
      const accessStart = normalizeAccessTimestamp(form.access_start)
      const accessEnd = normalizeAccessTimestamp(form.access_end)

      if (isEditing.value) {
        const finalAvatarUrl = avatarFile.value ? await uploadAvatar(form.id) : form.avatar_url
        const { error } = await supabase.rpc('admin_update_profile', {
          target_id: form.id,
          p_name: form.name,
          p_nickname: form.nickname,
          p_role: form.role,
          p_avatar: finalAvatarUrl,
          p_linked_team_member_ids: form.linked_team_member_ids.length > 0 ? form.linked_team_member_ids : null,
          p_is_active: form.is_active,
          p_access_start: accessStart,
          p_access_end: accessEnd
        })

        if (error) throw error
        ElMessage.success('更新成功！')
      } else {
        const authData = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/auth/v1/signup`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: import.meta.env.VITE_SUPABASE_ANON_KEY
            },
            body: JSON.stringify({ email: form.email, password: form.password })
          }
        ).then((response) => response.json())

        if (authData?.msg || authData?.code) {
          throw new Error(authData?.msg || authData?.message || '建立 auth.users 失敗')
        }

        const newUserId = authData?.user?.id || authData?.id
        if (!newUserId) throw new Error('API 並未正確回傳用戶 ID')

        const finalAvatarUrl = avatarFile.value ? await uploadAvatar(newUserId) : form.avatar_url

        const { error: profileError } = await supabase.rpc('admin_insert_profile', {
          target_id: newUserId,
          p_email: form.email,
          p_name: form.name,
          p_nickname: form.nickname,
          p_role: form.role,
          p_avatar: finalAvatarUrl,
          p_is_active: form.is_active,
          p_access_start: accessStart,
          p_access_end: accessEnd
        })

        if (profileError) {
          console.error('Profile Error:', profileError)
          ElMessage.warning('帳號創建成功，但基本資料寫入受阻（可能是資料庫 INSERT 權限不足，可呼叫管理員開放）')
        } else {
          const { error: bindingError } = await supabase
            .from('profiles')
            .update({
              linked_team_member_ids: form.linked_team_member_ids.length > 0 ? form.linked_team_member_ids : null,
              updated_at: new Date().toISOString()
            })
            .eq('id', newUserId)

          if (bindingError) {
            console.error('Binding Error:', bindingError)
            ElMessage.warning(`新增使用者成功，但綁定資料寫入失敗：${bindingError.message}`)
          } else {
            ElMessage.success('新增使用者成功！登入狀態已套用。')
          }
        }
      }

      isModalOpen.value = false
      await fetchUsers()
    } catch (error: any) {
      console.error(error)
      ElMessage.error(error.message || '操作失敗，請檢查權限或連線狀態')
    } finally {
      isSubmitting.value = false
    }
  })
}

const confirmDelete = async (row: DecoratedUser) => {
  try {
    await ElMessageBox.confirm(
      `確定要刪除「${row.name}」嗎？這將會同步移除登入權限與所有基本資料，此操作無法復原！`,
      '⚠️ 刪除確認',
      { confirmButtonText: '確定刪除', cancelButtonText: '取消', type: 'error', buttonSize: 'large' }
    )

    const { error } = await supabase.rpc('admin_delete_user', { target_user_id: row.id })
    if (error) throw error

    ElMessage.success('已成功移除該使用者與身分權限。')
    await fetchUsers()
  } catch (error: any) {
    if (error !== 'cancel') {
      console.error(error)
      ElMessage.error('刪除失敗：' + (error.message || '請確認您是否有執行刪除函數的權限'))
    }
  }
}

onMounted(async () => {
  if (permissionsStore.roles.length === 0) {
    await permissionsStore.fetchRoles()
  }

  await Promise.all([fetchUsers(), fetchBindingMembers()])
})
</script>

<style>
.custom-dialog .el-dialog__header {
  border-bottom: 1px solid #f3f4f6;
  margin-right: 0;
  padding: 24px;
}

.custom-dialog .el-dialog__title {
  font-weight: 800;
  color: #1f2937;
  font-size: 1.25rem;
}

.custom-dialog .el-dialog__body {
  padding: 16px 24px 0 24px;
}

.custom-tabs .el-tabs__content {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 0;
}

.custom-tabs .el-tabs__item {
  font-weight: 800;
  font-size: 1rem;
}

.user-table .el-table__header th {
  background: #f9fafb;
  color: #6b7280;
  font-weight: 800;
}

.user-table .el-table__cell {
  vertical-align: top;
}
</style>
