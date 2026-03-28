<template>
  <div class="h-full flex flex-col relative animate-fade-in p-2 md:p-6 pb-20 md:pb-6">
    <!-- 頂部標題區 -->
    <div class="flex flex-col md:flex-row md:justify-between md:items-center mb-6 gap-4 shrink-0">
      <div>
        <h2 class="text-3xl font-extrabold text-primary tracking-tight flex items-center gap-2">
          出缺勤管理
        </h2>
        <p class="text-gray-500 font-medium text-sm mt-1">管理各級球員與教練的請假紀錄、統計與月曆，請假將自動生效。</p>
      </div>

      <div class="flex items-center gap-3">
        <!-- 齒輪按鈕 (推播設定用) -->
        <button v-if="isAdminOrManager" @click="openSettingsModal" class="bg-white border border-gray-200 text-gray-500 hover:text-gray-700 hover:bg-gray-50 p-2.5 rounded-xl shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-gray-200" title="通知推播設定">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clip-rule="evenodd" /></svg>
        </button>

        <button @click="openCreateModal" class="bg-primary hover:bg-primary-hover active:scale-95 text-white px-5 py-2.5 rounded-xl shadow-[0_8px_20px_rgba(216,143,34,0.25)] text-sm font-bold transition-all flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" /></svg>
          新增假單
        </button>
      </div>
    </div>

    <!-- 頁籤與內容區塊 -->
    <div class="flex-1 flex flex-col min-h-0 custom-tabs-container">
      <el-tabs v-model="activeTab" class="w-full h-full flex flex-col">
        <!-- 1. 詳細列表 -->
        <el-tab-pane label="詳細列表" name="list" class="h-full">
          <div class="h-full bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100/80 flex flex-col min-h-0">
             
            <!-- 篩選列 -->
            <div class="p-4 border-b border-gray-100 flex flex-col sm:flex-row gap-4 items-center justify-between">
              <el-date-picker
                v-model="dateRange"
                type="daterange"
                range-separator="至"
                start-placeholder="開始日期"
                end-placeholder="結束日期"
                format="YYYY-MM-DD"
                value-format="YYYY-MM-DD"
                @change="fetchData"
                class="!w-full sm:!w-[300px]"
              />
            </div>

            <!-- 列表 -->
            <el-table 
              :data="leaveRequests" 
              style="width: 100%; height: 100%" 
              height="100%"
              v-loading="isLoading" 
              empty-text="目前沒有請假紀錄"
              row-class-name="transition-colors hover:bg-orange-50/30"
              header-cell-class-name="bg-gray-50/50 text-gray-500 font-bold"
            >
              <el-table-column label="日期" min-width="120">
                <template #default="{ row }">
                  <span class="font-bold text-gray-700">{{ row.start_date === row.end_date ? row.start_date : `${row.start_date.slice(5)} ~ ${row.end_date.slice(5)}` }}</span>
                </template>
              </el-table-column>
              
              <el-table-column label="球員" min-width="160">
                <template #default="{ row }">
                  <div class="flex items-center gap-3 py-1">
                    <div class="w-8 h-8 rounded-full overflow-hidden bg-gray-100 shrink-0">
                      <img v-if="row.team_members?.avatar_url" :src="row.team_members.avatar_url" class="w-full h-full object-cover" />
                      <div v-else class="w-full h-full flex items-center justify-center text-gray-400 font-bold text-sm">
                        {{ row.team_members?.name?.charAt(0) || '?' }}
                      </div>
                    </div>
                    <div class="flex flex-col">
                      <span class="font-bold text-gray-800">{{ row.team_members?.name || '未知人員' }}</span>
                    </div>
                  </div>
                </template>
              </el-table-column>

              <el-table-column label="假別" width="80">
                <template #default="{ row }">
                  <span class="bg-orange-50 text-primary px-2.5 py-1 rounded-md text-sm font-bold border border-orange-100">
                    {{ row.leave_type }}
                  </span>
                </template>
              </el-table-column>

              <el-table-column prop="reason" label="原因" min-width="180">
                <template #default="{ row }">
                  <span class="text-gray-500 text-sm truncate block">{{ row.reason || '無說明' }}</span>
                </template>
              </el-table-column>

              <el-table-column label="操作" width="60" align="right" fixed="right">
                <template #default="{ row }">
                  <!-- 只有自己或是管理員可以刪除 -->
                   <button v-if="row.user_id === authStore.user?.id || isAdminOrManager" @click="confirmDelete(row)" class="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all" title="刪除紀錄">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </template>
              </el-table-column>
            </el-table>
          </div>
        </el-tab-pane>

        <!-- 2. 月曆視圖 -->
        <el-tab-pane label="月曆視圖" name="calendar" class="h-full">
          <div class="h-full bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100/80 p-2 sm:p-4 flex flex-col min-h-0 overflow-y-auto custom-scrollbar">
            <el-calendar v-model="calendarDate" class="custom-calendar">
              <template #date-cell="{ data }">
                <div class="w-full h-full flex flex-col p-1">
                  <span class="text-sm font-bold w-6 h-6 flex items-center justify-center rounded-full mb-1" :class="data.isSelected ? 'bg-primary text-white' : 'text-gray-700'">{{ data.day.split('-').slice(2).join('') }}</span>
                  <div class="flex flex-col gap-1 flex-1 overflow-y-auto custom-scrollbar relative z-10">
                    <template v-for="leave in getLeavesForDate(data.day)" :key="leave.id">
                      <div class="text-sm sm:text-sm leading-tight px-1 py-0.5 rounded sm:rounded-md shadow-sm border truncate font-bold flex items-center justify-between gap-0.5"
                           :class="getLeaveBadgeClass(leave.leave_type)">
                        <span class="truncate">{{ leave.team_members?.name || '未知' }}</span>
                        <span class="opacity-75 shrink-0 scale-75 sm:scale-100 origin-right">({{ leave.leave_type.slice(0,1) }})</span>
                      </div>
                    </template>
                  </div>
                </div>
              </template>
            </el-calendar>
          </div>
        </el-tab-pane>

        <!-- 3. 統計報表 -->
        <el-tab-pane label="統計報表" name="stats" class="h-full">
          <div class="h-full flex flex-col min-h-0 space-y-4 pt-4 pb-20 md:pb-6 overflow-y-auto custom-scrollbar pr-1">
            
            <!-- 統計區間篩選 -->
            <div class="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 p-4 shrink-0 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <span class="font-extrabold text-gray-800 block">統計區間</span>
                <span class="text-sm text-gray-400">選擇日期範圍來統計球員請假次數</span>
              </div>
              <el-date-picker
                v-model="dateRange"
                type="daterange"
                range-separator="至"
                start-placeholder="開始日期"
                end-placeholder="結束日期"
                format="YYYY-MM-DD"
                value-format="YYYY-MM-DD"
                @change="fetchData"
                :shortcuts="dateShortcuts"
                class="!w-full sm:!w-[400px]"
              />
            </div>

            <!-- 五大數據卡片 -->
            <div class="grid grid-cols-2 md:grid-cols-5 gap-3 shrink-0">
              <div class="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 p-4 flex flex-col items-center justify-center col-span-2 md:col-span-1">
                <span class="text-gray-500 font-bold text-sm mb-1">總請假次數</span>
                <span class="text-4xl font-extrabold text-gray-800">{{ statsByType.總數 }}</span>
              </div>
              <div class="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 p-4 flex flex-col items-center justify-center">
                <span class="text-gray-500 font-bold text-sm mb-1">事假</span>
                <span class="text-3xl font-extrabold text-primary">{{ statsByType.事假 }}</span>
              </div>
              <div class="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 p-4 flex flex-col items-center justify-center">
                <span class="text-gray-500 font-bold text-sm mb-1">病假</span>
                <span class="text-3xl font-extrabold text-red-500">{{ statsByType.病假 }}</span>
              </div>
              <div class="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 p-4 flex flex-col items-center justify-center">
                <span class="text-gray-500 font-bold text-sm mb-1">公假</span>
                <span class="text-3xl font-extrabold text-blue-500">{{ statsByType.公假 }}</span>
              </div>
              <div class="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 p-4 flex flex-col items-center justify-center">
                <span class="text-gray-500 font-bold text-sm mb-1">其他</span>
                <span class="text-3xl font-extrabold text-gray-500">{{ statsByType.其他 }}</span>
              </div>
            </div>

            <!-- 各月份請假趨勢圖 -->
            <div class="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100 p-4 shrink-0 h-[320px] flex flex-col">
              <span class="font-bold text-gray-800 mb-2">各月份請假趨勢</span>
              <v-chart class="flex-1 w-full" :option="monthlyChartOption" autoresize />
            </div>

            <!-- 排行榜列表 -->
            <div class="bg-white rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100/80 flex-1 flex flex-col min-h-[400px] md:min-h-0 overflow-hidden shrink-0 md:shrink">
              <div class="p-5 border-b border-gray-100 bg-gray-50/30">
                <h3 class="font-bold text-gray-800">球員請假排行榜 (由多到少)</h3>
              </div>
              <el-table 
                :data="rankingByPlayer" 
                style="width: 100%; height: 100%" 
                height="100%"
                row-class-name="transition-colors hover:bg-gray-50/50"
                header-cell-class-name="bg-white text-gray-400 font-medium text-sm"
              >
                <el-table-column label="球員" min-width="100">
                  <template #default="{ row }">
                    <span class="font-bold text-gray-700">{{ row.name }}</span>
                  </template>
                </el-table-column>
                <el-table-column label="請假日期" min-width="260">
                  <template #default="{ row }">
                    <div class="flex flex-wrap gap-1.5 mt-1 mb-1">
                      <span v-for="date in row.dates" :key="date" class="text-[11px] bg-gray-50 text-gray-500 px-1.5 py-0.5 rounded border border-gray-200 font-medium">
                        {{ date }}
                      </span>
                    </div>
                  </template>
                </el-table-column>
                <el-table-column prop="total" label="總次數" width="90" align="center">
                  <template #default="{ row }">
                     <span class="font-extrabold text-gray-800 text-lg">{{ row.total }}</span>
                  </template>
                </el-table-column>
                <el-table-column label="假別分佈" min-width="180">
                  <template #default="{ row }">
                    <div class="flex flex-wrap gap-2">
                       <span v-if="row.types.事假 > 0" class="bg-orange-50 text-primary px-2 py-0.5 rounded text-sm font-bold border border-orange-100">事假: {{ row.types.事假 }}</span>
                       <span v-if="row.types.病假 > 0" class="bg-red-50 text-red-600 px-2 py-0.5 rounded text-sm font-bold border border-red-100">病假: {{ row.types.病假 }}</span>
                       <span v-if="row.types.公假 > 0" class="bg-blue-50 text-blue-600 px-2 py-0.5 rounded text-sm font-bold border border-blue-100">公假: {{ row.types.公假 }}</span>
                       <span v-if="row.types.其他 > 0" class="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-sm font-bold border border-gray-200">其他: {{ row.types.其他 }}</span>
                    </div>
                  </template>
                </el-table-column>
              </el-table>
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>
    </div>

    <!-- 假單表單 Modal -->
    <el-dialog
      v-model="isModalOpen"
      title="新增假單"
      width="90%"
      style="max-width: 500px; border-radius: 16px;"
      :show-close="false"
      class="custom-dialog"
    >
      <el-form :model="form" :rules="rules" ref="formRef" label-position="top" class="mt-4 space-y-4">
        
        <!-- 當是管理員代為請假時，可選擇球員 -->
        <el-form-item v-if="isAdminOrManager" label="選擇請假球員" prop="user_id" class="font-bold">
          <el-select v-model="form.user_id" placeholder="請選擇要請假的人員" size="large" class="w-full" filterable>
            <el-option v-for="p in team_members_list" :key="p.id" :label="`${p.name} (${p.role})`" :value="p.id" />
          </el-select>
        </el-form-item>

        <div class="flex gap-4 w-full flex-col sm:flex-row">
          <el-form-item label="請假類別" prop="leave_type" class="font-bold flex-1 mb-0 sm:mb-4">
            <el-select v-model="form.leave_type" size="large" class="w-full">
              <el-option label="事假" value="事假" />
              <el-option label="病假" value="病假" />
              <el-option label="公假" value="公假" />
              <el-option label="其他" value="其他" />
            </el-select>
          </el-form-item>
        </div>

        <el-form-item label="請假模式" prop="leave_mode" class="font-bold mb-5">
          <el-radio-group v-model="form.leave_mode" class="w-full flex custom-segmented">
            <el-radio-button label="單日請假" class="flex-1" />
            <el-radio-button label="連續多日" class="flex-1" />
            <el-radio-button label="固定週期" class="flex-1" />
          </el-radio-group>
        </el-form-item>

        <!-- 單日請假 -->
        <template v-if="form.leave_mode === '單日請假'">
          <el-form-item label="請假日期" prop="date_single" class="font-bold">
            <el-date-picker
              v-model="form.date_single"
              type="date"
              placeholder="選擇日期"
              format="YYYY-MM-DD"
              value-format="YYYY-MM-DD"
              size="large"
              class="!w-full"
            />
          </el-form-item>
        </template>

        <!-- 連續多日 -->
        <template v-else-if="form.leave_mode === '連續多日'">
          <el-form-item label="請假日期區間" prop="date_range" class="font-bold">
            <el-date-picker
              v-model="form.date_range"
              type="daterange"
              range-separator="至"
              start-placeholder="開始日期"
              end-placeholder="結束日期"
              format="YYYY-MM-DD"
              value-format="YYYY-MM-DD"
              size="large"
              class="!w-full"
            />
          </el-form-item>
        </template>

        <!-- 固定週期 -->
        <template v-else-if="form.leave_mode === '固定週期'">
          <div class="bg-purple-50/40 rounded-xl p-4 border border-purple-100 flex flex-col gap-4 mb-4">
            <el-form-item label="固定星期請假" class="font-bold text-primary mb-0 custom-week-selector">
              <el-checkbox-group v-model="form.recurring_days" size="default" class="w-full flex justify-between sm:justify-start gap-1 sm:gap-2">
                <el-checkbox-button :label="1">一</el-checkbox-button>
                <el-checkbox-button :label="2">二</el-checkbox-button>
                <el-checkbox-button :label="3">三</el-checkbox-button>
                <el-checkbox-button :label="4">四</el-checkbox-button>
                <el-checkbox-button :label="5">五</el-checkbox-button>
                <el-checkbox-button :label="6">六</el-checkbox-button>
                <el-checkbox-button :label="0">日</el-checkbox-button>
              </el-checkbox-group>
            </el-form-item>

            <el-form-item label="生效期限 (必填)" class="font-bold text-primary mb-0">
               <el-date-picker
                v-model="form.recurring_range"
                type="daterange"
                range-separator="至"
                start-placeholder="開始日期"
                end-placeholder="結束日期"
                format="YYYY-MM-DD"
                value-format="YYYY-MM-DD"
                class="!w-full"
              />
            </el-form-item>
          </div>
        </template>

        <el-form-item label="請假時段 (選填)" class="font-bold">
          <div class="flex items-center w-full gap-2">
            <el-time-picker
              v-model="form.time_range"
              is-range
              range-separator="至"
              start-placeholder="開始時間"
              end-placeholder="結束時間"
              format="HH:mm"
              value-format="HH:mm"
              size="large"
              class="!w-full"
            />
          </div>
        </el-form-item>

        <el-form-item label="請假原因說明" prop="reason" class="font-bold">
          <el-input v-model="form.reason" type="textarea" :rows="3" placeholder="請簡述請假事由 (選填)" />
          <p class="text-sm text-gray-400 font-normal mt-1 w-full">假單送出後將自動生效並加入出缺勤紀錄中。</p>
        </el-form-item>

      </el-form>

      <template #footer>
        <div class="flex justify-end gap-3 mt-4 pt-4 border-t border-gray-100">
          <button @click="isModalOpen = false" class="px-5 py-2.5 text-gray-500 font-bold hover:bg-gray-100 rounded-xl transition-all">取消</button>
          <button @click="submitForm" :disabled="isSubmitting" class="px-6 py-2.5 bg-primary hover:bg-primary-hover active:scale-95 disabled:opacity-70 text-white font-bold rounded-xl shadow-lg shadow-primary/20 transition-all flex items-center justify-center min-w-[100px]">
            <span v-if="isSubmitting" class="flex gap-2 items-center"><el-icon class="is-loading"><Loading /></el-icon> 送出假單</span>
            <span v-else>確認送出</span>
          </button>
        </div>
      </template>
    </el-dialog>

    <!-- 推播通知設定 Modal -->
    <el-dialog
      v-model="isSettingsOpen"
      title="通知推播設定 (Web Push)"
      width="90%"
      style="max-width: 500px; border-radius: 16px;"
      :show-close="false"
      class="custom-dialog"
    >
      <div v-loading="isFetchingSettings" class="mt-4 space-y-6">
        <div class="bg-primary/5 p-4 rounded-xl border border-primary/20">
          <div class="flex items-center justify-between mb-2">
            <span class="font-extrabold text-gray-800">啟用此裝置推送</span>
            <el-switch v-model="settingsForm.receive_notifications" active-color="var(--color-primary)" @change="handleTogglePush" />
          </div>
          <p class="text-sm text-gray-500 leading-relaxed">
            開啟後，將綁定「目前這台裝置與瀏覽器」。當有新請假申請時，系統會直接推播到這台裝置上。
          </p>
        </div>

        <div v-if="settingsForm.receive_notifications" class="space-y-3 animate-fade-in">
          <div class="bg-green-50 p-4 rounded-xl text-sm text-green-700 space-y-2 border border-green-100 flex items-center gap-2">
            <el-icon class="text-green-500 text-xl"><CircleCheckFilled /></el-icon>
            <span class="font-bold">此裝置已成功綁定推播通知！</span>
          </div>
          
          <div class="bg-gray-50 p-4 rounded-xl text-sm text-gray-500 space-y-2 border border-gray-100">
            <p class="font-bold text-gray-700 flex items-center gap-1">
              <el-icon><InfoFilled /></el-icon> 裝置限制注意事項
            </p>
            <ul class="list-disc pl-5 space-y-1">
              <li>如果您更換手機或電腦，需要重新登入並在此開啟推播。</li>
              <li><span class="font-bold text-primary">iOS / iPhone 用戶請注意：</span>由於 Apple 的限制，您必須先點擊分享圖示 ⍐ 並選擇「加入主畫面 (Add to Home Screen)」，然後從主畫面開啟這套系統，才能成功允許推播通知。</li>
              <li>如果您不小心在瀏覽器封鎖了通知權限，請至網址列左側點擊鎖頭解開權限。</li>
            </ul>
          </div>
        </div>
      </div>

      <template #footer>
        <div class="flex justify-end gap-3 mt-4 pt-4 border-t border-gray-100">
          <button @click="isSettingsOpen = false" class="px-6 py-2.5 bg-primary hover:bg-primary-hover active:scale-95 disabled:opacity-70 text-white font-bold rounded-xl shadow-lg shadow-primary/20 transition-all flex items-center justify-center min-w-[100px]">關閉設定</button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted, computed } from 'vue'
import { supabase } from '@/services/supabase'
import { useAuthStore } from '@/stores/auth'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Loading, InfoFilled, CircleCheckFilled } from '@element-plus/icons-vue'
import dayjs from 'dayjs'

import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart } from 'echarts/charts'
import { TitleComponent, TooltipComponent, LegendComponent, GridComponent } from 'echarts/components'
import VChart from 'vue-echarts'

use([CanvasRenderer, BarChart, TitleComponent, TooltipComponent, LegendComponent, GridComponent])

const authStore = useAuthStore()
const activeTab = ref('list')
const isModalOpen = ref(false)
const isSettingsOpen = ref(false)

// --- Web Push Key ---
const VAPID_PUBLIC_KEY = 'BIrzQ2oSy_bdMkLjQMDZCnBMzpkFzNHYa1QlcFKNQ3OCjDsMLeKC-2WazmnkSFUK7nwSlM3n8XFahxUxNrLMCmg'

// --- 資料狀態 ---
const leaveRequests = ref<any[]>([])
const team_members_list = ref<any[]>([])
const isLoading = ref(true)
const isSubmitting = ref(false)
const isFetchingSettings = ref(false)
const isSavingSettings = ref(false)
const formRef = ref()

// --- 篩選區間 ---
const defaultStartDate = dayjs().startOf('month').format('YYYY-MM-DD')
const defaultEndDate = dayjs().add(2, 'month').endOf('month').format('YYYY-MM-DD')
const dateRange = ref<[string, string]>([defaultStartDate, defaultEndDate])

const dateShortcuts = [
  { text: '本月', value: () => [dayjs().startOf('month').format('YYYY-MM-DD'), dayjs().endOf('month').format('YYYY-MM-DD')] },
  { text: '上個月', value: () => [dayjs().subtract(1, 'month').startOf('month').format('YYYY-MM-DD'), dayjs().subtract(1, 'month').endOf('month').format('YYYY-MM-DD')] },
  { text: '最近三個月', value: () => [dayjs().subtract(3, 'month').startOf('month').format('YYYY-MM-DD'), dayjs().endOf('month').format('YYYY-MM-DD')] },
  { text: '今年', value: () => [dayjs().startOf('year').format('YYYY-MM-DD'), dayjs().endOf('year').format('YYYY-MM-DD')] }
]

// --- 表單狀態 ---
const form = reactive({
  user_id: '',
  leave_type: '事假',
  leave_mode: '單日請假',
  date_single: dayjs().format('YYYY-MM-DD'),
  date_range: [dayjs().format('YYYY-MM-DD'), dayjs().format('YYYY-MM-DD')] as [string, string],
  recurring_days: [] as number[],
  recurring_range: [dayjs().format('YYYY-MM-DD'), dayjs().add(1, 'month').format('YYYY-MM-DD')] as [string, string],
  time_range: null as [string, string] | null,
  reason: ''
})

const rules = {
  user_id: [{ required: true, message: '請選擇請假人員', trigger: 'change' }],
  leave_type: [{ required: true, message: '請選擇假別', trigger: 'change' }]
}

const settingsForm = reactive({
  receive_notifications: false,
  web_push_sub: null as any
})

// --- 權限判斷 ---
const isAdminOrManager = computed(() => {
  const role = authStore.profile?.role
  return role === 'ADMIN' || role === 'MANAGER' || role === 'HEAD_COACH'
})

// --- 月曆邏輯 ---
const calendarDate = ref(new Date())

const getLeavesForDate = (dateStr: string) => {
  return leaveRequests.value.filter(leave => {
    return dateStr >= leave.start_date && dateStr <= leave.end_date
  })
}

const getLeaveBadgeClass = (type: string) => {
  switch (type) {
    case '事假': return 'bg-orange-50 text-primary border-orange-100'
    case '病假': return 'bg-red-50 text-red-600 border-red-100'
    case '公假': return 'bg-blue-50 text-blue-600 border-blue-100'
    default: return 'bg-gray-50 text-gray-600 border-gray-200'
  }
}

// --- 統計邏輯 ---
const statsByType = computed(() => {
  let stats: Record<string, number> = { 事假: 0, 病假: 0, 公假: 0, 其他: 0, 總數: leaveRequests.value.length }
  for (const r of leaveRequests.value) {
    if (r.leave_type in stats) {
      stats[r.leave_type]++
    } else {
      stats['其他']++
    }
  }
  return stats
})

// === Echarts 月份趨勢圖選項 ===
const monthlyChartOption = computed(() => {
  const monthMap: Record<string, Record<string, number>> = {}
  
  leaveRequests.value.forEach(r => {
    // 依據 start_date 解析 YYYY-MM
    const month = r.start_date.substring(0, 7)
    if (!monthMap[month]) {
      monthMap[month] = { 事假: 0, 病假: 0, 公假: 0, 其他: 0 }
    }
    const type = r.leave_type in monthMap[month] ? r.leave_type : '其他'
    monthMap[month][type]++
  })

  // 將月份排序
  const months = Object.keys(monthMap).sort()

  const seriesData = ['事假', '病假', '公假', '其他'].map(type => {
    return {
      name: type,
      type: 'bar',
      stack: 'total', // 堆積長條圖
      barMaxWidth: 35,
      itemStyle: { borderRadius: [2, 2, 0, 0] },
      data: months.map(m => monthMap[m][type])
    }
  })

  // 如果這整段區間完全沒有資料，顯示預設值
  const isNoData = months.length === 0

  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' }
    },
    legend: {
      data: ['事假', '病假', '公假', '其他'],
      bottom: 0,
      icon: 'circle',
      textStyle: { color: '#6b7280' }
    },
    grid: {
      left: '2%',
      right: '2%',
      bottom: '10%',
      top: '10%',
      containLabel: true
    },
    xAxis: {
      type: 'category',
      data: isNoData ? ['無資料'] : months,
      axisLabel: { color: '#6b7280', fontSize: 12 },
      axisLine: { lineStyle: { color: '#e5e7eb' } }
    },
    yAxis: {
      type: 'value',
      minInterval: 1, // 只能是整數人次
      splitLine: { lineStyle: { type: 'dashed', color: '#f3f4f6' } },
      axisLabel: { color: '#9ca3af' }
    },
    color: ['#D88F22', '#ef4444', '#3b82f6', '#9ca3af'],
    series: isNoData ? [] : seriesData
  }
})

const rankingByPlayer = computed(() => {
  const map: Record<string, any> = {}
  leaveRequests.value.forEach(r => {
    const pId = r.user_id
    if (!map[pId]) {
      map[pId] = {
        name: r.team_members?.name || '未知',
        avatar_url: r.team_members?.avatar_url,
        total: 0,
        types: { 事假: 0, 病假: 0, 公假: 0, 其他: 0 },
        dates: []
      }
    }
    map[pId].total++
    if (r.leave_type in map[pId].types) {
      map[pId].types[r.leave_type]++
    } else {
      map[pId].types.其他++
    }

    // 整理請假日期字串 (例如 "2026-03-28(事)" 或 "2026-03-28~2026-03-29(病)")
    const typeLabel = r.leave_type.charAt(0)
    let dateStr = ''
    if (r.start_date === r.end_date) {
      dateStr = r.start_date // 完整 YYYY-MM-DD
    } else {
      dateStr = `${r.start_date}~${r.end_date}`
    }
    map[pId].dates.push(`${dateStr}(${typeLabel})`)
  })
  
  Object.values(map).forEach((p: any) => p.dates.sort())

  return Object.values(map).sort((a, b) => b.total - a.total)
})

// --- 讀取資料 ---
const fetchData = async () => {
  isLoading.value = true
  try {
    // 1. 撈取使用者名單 (給下拉選單用)
    if (team_members_list.value.length === 0) {
      const { data: pData } = await supabase.from('team_members').select('*').order('role', { ascending: true }).order('name', { ascending: true })
      team_members_list.value = pData || []
    }

    // 2. 撈取請假紀錄
    const [start, end] = dateRange.value || [null, null]
    let query = supabase
      .from('leave_requests')
      .select(`
        id, user_id, leave_type, start_date, end_date, reason, created_at,
        team_members ( name, role, avatar_url )
      `)
      .order('start_date', { ascending: false })

    if (start && end) {
      query = query.gte('start_date', start).lte('end_date', end)
    }

    const { data, error } = await query
    if (error) throw error
    
    leaveRequests.value = data || []
  } catch (error: any) {
    ElMessage.error('資料讀取失敗：' + error.message)
  } finally {
    isLoading.value = false
  }
}

// --- 表單操作 ---
const openCreateModal = () => {
  form.user_id = isAdminOrManager.value ? '' : authStore.user?.id || ''
  form.leave_type = '事假'
  form.leave_mode = '單日請假'
  form.date_single = dayjs().format('YYYY-MM-DD')
  form.date_range = [dayjs().format('YYYY-MM-DD'), dayjs().format('YYYY-MM-DD')]
  form.recurring_days = []
  form.recurring_range = [dayjs().format('YYYY-MM-DD'), dayjs().add(1, 'month').format('YYYY-MM-DD')]
  form.time_range = null
  form.reason = ''
  if(formRef.value) formRef.value.clearValidate()
  isModalOpen.value = true
}

const submitForm = async () => {
  if (!formRef.value) return
  await formRef.value.validate(async (valid: boolean) => {
    if (!valid) return

    // 前端驗證日期必填
    if (form.leave_mode === '單日請假' && !form.date_single) return ElMessage.warning('請選擇請假日期')
    if (form.leave_mode === '連續多日' && (!form.date_range || form.date_range.length !== 2)) return ElMessage.warning('請選擇日期區間')

    isSubmitting.value = true
    try {
      let recordsToInsert = []

      // 組合詳細時間與備註
      let finalReason = form.reason
      if (form.time_range && form.time_range.length === 2 && form.time_range[0]) {
        const timeText = `[時段: ${form.time_range[0]} - ${form.time_range[1]}]`
        finalReason = finalReason ? `${timeText}\n${finalReason}` : timeText
      }

      if (form.leave_mode === '單日請假') {
        recordsToInsert.push({
          user_id: form.user_id,
          leave_type: form.leave_type,
          start_date: form.date_single,
          end_date: form.date_single,
          reason: finalReason || null
        })
      } else if (form.leave_mode === '連續多日') {
        recordsToInsert.push({
          user_id: form.user_id,
          leave_type: form.leave_type,
          start_date: form.date_range[0],
          end_date: form.date_range[1],
          reason: finalReason || null
        })
      } else if (form.leave_mode === '固定週期') {
        if (!form.recurring_range || form.recurring_range.length !== 2) throw new Error('請選擇生效期限')
        if (!form.recurring_days || form.recurring_days.length === 0) throw new Error('請至少選擇一天固定星期')
        
        let curr = dayjs(form.recurring_range[0])
        let end = dayjs(form.recurring_range[1])
        const daysMask = form.recurring_days
        
        // 防呆迴圈 (最多限制 180 天以內，或更少)
        let loops = 0
        while ((curr.isBefore(end) || curr.isSame(end, 'day')) && loops < 365) {
          if (daysMask.includes(curr.day())) {
            recordsToInsert.push({
              user_id: form.user_id,
              leave_type: form.leave_type,
              start_date: curr.format('YYYY-MM-DD'),
              end_date: curr.format('YYYY-MM-DD'),
              reason: finalReason || null
            })
          }
          curr = curr.add(1, 'day')
          loops++
        }
        if (recordsToInsert.length === 0) throw new Error('所選期限內沒有符合該星期的日期')
      }

      const { error } = await supabase.from('leave_requests').insert(recordsToInsert)

      if (error) throw error
      
      // --- Trigger PWA Push Notifications to Admins ---
      try {
        let playerName = '未知球員'
        const playerRecord = team_members_list.value.find(p => p.id === form.user_id)
        if (playerRecord) playerName = playerRecord.name

        const title = `[新增假單] ${playerName} 的${form.leave_type}`
        let bodyDate = ''
        if (form.leave_mode === '單日請假') bodyDate = `日期：${form.date_single}`
        else if (form.leave_mode === '連續多日') bodyDate = `日期：${form.date_range[0]} ~ ${form.date_range[1]}`
        else if (form.leave_mode === '固定週期') bodyDate = `週期請假：共 ${recordsToInsert.length} 天`
        
        await supabase.functions.invoke('send-push-notification', {
          body: {
            title,
            body: `${bodyDate}\n原因：${finalReason || '無'}`,
            url: '/leave-requests'
          }
        })
      } catch (pushErr) {
        console.warn('推播傳送失敗', pushErr)
      }

      ElMessage.success('新增假單成功！')
      isModalOpen.value = false
      fetchData()
    } catch (error: any) {
      ElMessage.error('報錯：' + error.message)
    } finally {
      isSubmitting.value = false
    }
  })
}

// --- 刪除操作 ---
const confirmDelete = async (row: any) => {
  try {
    await ElMessageBox.confirm('確定要刪除這筆請假紀錄嗎？', '⚠️ 刪除確認', {
      confirmButtonText: '確定刪除', cancelButtonText: '取消', type: 'error'
    })
    
    const { error } = await supabase.from('leave_requests').delete().eq('id', row.id)
    if (error) throw error
    
    ElMessage.success('刪除成功')
    fetchData()
  } catch (err: any) {
    if (err !== 'cancel') ElMessage.error('刪除失敗：' + err.message)
  }
}

// --- 推播設定操作 (Web Push) ---
const openSettingsModal = async () => {
  isSettingsOpen.value = true
  isFetchingSettings.value = true
  try {
    const userId = authStore.user?.id
    if (!userId) return

    const { data, error } = await supabase
      .from('profiles')
      .select('web_push_sub')
      .eq('id', userId)
      .single()
    if (error) throw error

    // 檢查目前瀏覽器是否有訂閱以及 DB 裡是否有舊的 JSON
    const registration = await navigator.serviceWorker?.getRegistration()
    let currentSub = registration ? await registration.pushManager.getSubscription() : null

    if (currentSub && data && data.web_push_sub) {
      settingsForm.receive_notifications = true
      settingsForm.web_push_sub = data.web_push_sub
    } else {
      settingsForm.receive_notifications = false
      settingsForm.web_push_sub = null
    }

  } catch (error: any) {
    ElMessage.error('讀取設定失敗：' + error.message)
  } finally {
    isFetchingSettings.value = false
  }
}

const urlB64ToUint8Array = (base64String: string) => {
  const padding = '='.repeat((4 - base64String.length % 4) % 4)
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

const handleTogglePush = async (val: boolean | string | number) => {
  if (val) {
    // 開啟推播：請求權限並註冊
    isFetchingSettings.value = true
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        throw new Error('此瀏覽器不支援推播通知！')
      }

      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        settingsForm.receive_notifications = false
        throw new Error('您封鎖了通知權限，請從瀏覽器設定解開。')
      }

      const registration = await navigator.serviceWorker.ready
      let subscription = await registration.pushManager.getSubscription()

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlB64ToUint8Array(VAPID_PUBLIC_KEY)
        })
      }

      const subJSON = subscription.toJSON()
      settingsForm.web_push_sub = subJSON

      // 儲存進 DB
      const { error } = await supabase.from('profiles').update({ 
        web_push_sub: subJSON,
        receive_notifications: true
      }).eq('id', authStore.user?.id)
      if (error) throw error

      ElMessage.success('推播裝置綁定成功！')
    } catch (e: any) {
      settingsForm.receive_notifications = false
      ElMessage.error(e.message)
    } finally {
      isFetchingSettings.value = false
    }
  } else {
    // 關閉推播：清空 DB
    isFetchingSettings.value = true
    try {
      const registration = await navigator.serviceWorker?.ready
      const subscription = await registration?.pushManager.getSubscription()
      if (subscription) {
        await subscription.unsubscribe()
      }

      settingsForm.web_push_sub = null
      const { error } = await supabase.from('profiles').update({ 
        web_push_sub: null,
        receive_notifications: false
      }).eq('id', authStore.user?.id)
      if (error) throw error
      ElMessage.info('已關閉推播通知')
    } catch (e: any) {
      ElMessage.error('關閉推播時發生錯誤：' + e.message)
      settingsForm.receive_notifications = true
    } finally {
      isFetchingSettings.value = false
    }
  }
}

// --- Supabase Realtime 訂閱 ---
let realtimeChannel: any

// --- 初始掛載 ---
onMounted(() => {
  fetchData()

  // 監聽 leave_requests 資料表變更
  realtimeChannel = supabase.channel('leave-requests-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'leave_requests' }, () => {
      fetchData()
    })
    .subscribe()
})

onUnmounted(() => {
  if (realtimeChannel) {
    supabase.removeChannel(realtimeChannel)
  }
})
</script>

<style>
/* Tab 標籤客製化 */
.custom-tabs-container .el-tabs__item {
  font-size: 1rem;
  font-weight: 700;
  color: #9ca3af;
  padding: 0 20px;
  height: 50px;
  transition: all 0.3s ease;
}
.custom-tabs-container .el-tabs__item.is-active {
  color: #D88F22;
}
.custom-tabs-container .el-tabs__active-bar {
  background-color: #D88F22;
  height: 3px;
  border-radius: 3px;
}
.custom-tabs-container .el-tabs__nav-wrap::after {
  height: 1px;
  background-color: #f3f4f6;
}
/* 讓 Tab 內容區塊自動延伸填滿，並具備 Flex 行為 */
.custom-tabs-container .el-tabs__content {
  flex-grow: 1;
  padding: 16px 0 0 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
/* 讓分頁具備高度約束，使子元素 overflow 可正常觸發 */
.custom-tabs-container .el-tab-pane {
  height: 100%;
}
/* 客製化 Dialog 圓角與標題 */
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
  padding: 16px 24px 0px 24px;
}

/* 客製化月曆樣式 */
.custom-calendar {
  --el-calendar-cell-width: auto;
}
.custom-calendar .el-calendar__body {
  padding: 12px 20px 20px;
}
.custom-calendar .el-calendar-table .el-calendar-day {
  height: 100px;
  padding: 4px;
}
@media (min-width: 640px) {
  .custom-calendar .el-calendar-table .el-calendar-day {
    height: 120px;
  }
}
.custom-calendar .el-calendar-table td.is-selected {
  background-color: transparent;
}
.custom-calendar .el-calendar-table td.is-today {
  color: inherit;
}
.custom-scrollbar::-webkit-scrollbar {
  width: 4px;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: #e5e7eb;
  border-radius: 4px;
}

.custom-segmented {
  --el-radio-button-checked-bg-color: var(--color-primary);
  --el-radio-button-checked-border-color: var(--color-primary);
  --el-radio-button-checked-text-color: #fff;
}
.custom-segmented .el-radio-button__inner {
  width: 100%;
  border-radius: 0;
  border-color: #e5e7eb;
  color: #6b7280;
  font-weight: bold;
}
.custom-segmented .el-radio-button:first-child .el-radio-button__inner {
  border-top-left-radius: 8px;
  border-bottom-left-radius: 8px;
}
.custom-segmented .el-radio-button:last-child .el-radio-button__inner {
  border-top-right-radius: 8px;
  border-bottom-right-radius: 8px;
}
.custom-segmented .el-radio-button__original-radio:checked + .el-radio-button__inner {
  background-color: var(--color-primary) !important;
  border-color: var(--color-primary) !important;
  box-shadow: -1px 0 0 0 var(--color-primary) !important;
  color: #fff !important;
}

.custom-week-selector .el-checkbox-button__inner {
  border-radius: 4px !important;
  border-left: 1px solid #e5e7eb;
  padding: 8px 12px;
  background-color: white;
}
.custom-week-selector .el-checkbox-button.is-checked .el-checkbox-button__inner {
  background-color: transparent !important;
  border-color: var(--color-primary);
  color: var(--color-primary);
  box-shadow: inset 0 0 0 1px var(--color-primary);
}
</style>
