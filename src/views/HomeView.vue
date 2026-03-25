<template>
  <div class="h-full flex flex-col relative animate-fade-in p-2 md:p-6 pb-20 md:pb-6">
    <div class="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <h2 class="text-3xl font-extrabold text-primary tracking-tight">首頁大廳</h2>
        <p class="text-gray-500 font-medium text-sm mt-1">歡迎回來，這裡是球隊戰情中心</p>
      </div>
      <div class="flex gap-2">
        <router-link to="/calendar" class="bg-white border border-gray-200 text-gray-700 hover:text-primary hover:border-primary/50 px-4 py-2 rounded-xl text-sm font-bold shadow-sm transition-all flex items-center gap-2">
          賽程與行事曆
        </router-link>
        <router-link to="/leave-requests" class="bg-primary hover:bg-primary-hover text-white px-4 py-2 rounded-xl shadow-[0_4px_10px_rgba(216,143,34,0.3)] text-sm font-bold transition-all flex items-center gap-2">
          我要請假
        </router-link>
      </div>
    </div>
    
    <!-- 快覽數據卡片 -->
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      <div class="bg-white p-5 rounded-2xl shadow-sm border border-gray-100/80 flex flex-col justify-center relative overflow-hidden">
        <div class="absolute -right-4 -top-4 w-16 h-16 bg-primary/5 rounded-full blur-xl"></div>
        <span class="text-gray-400 font-bold text-sm mb-1">球隊總人數</span>
        <div class="flex items-end gap-2">
          <span class="text-4xl font-extrabold text-gray-800">{{ stats.totalMembers }}</span>
          <span class="text-gray-400 font-medium text-sm mb-1">人</span>
        </div>
      </div>
      <div class="bg-white p-5 rounded-2xl shadow-sm border border-gray-100/80 flex flex-col justify-center relative overflow-hidden">
        <div class="absolute -right-4 -top-4 w-16 h-16 bg-red-50 rounded-full blur-xl"></div>
        <span class="text-gray-400 font-bold text-sm mb-1">今日請假人數</span>
        <div class="flex items-end gap-2">
          <span class="text-4xl font-extrabold text-red-500">{{ stats.todayLeaves }}</span>
          <span class="text-gray-400 font-medium text-sm mb-1">人</span>
        </div>
      </div>
      <div class="bg-white p-5 rounded-2xl shadow-sm border border-gray-100/80 flex flex-col justify-center col-span-2 relative overflow-hidden group cursor-pointer" @click="$router.push('/players')">
        <div class="flex items-center justify-between">
          <div>
            <span class="text-gray-400 font-bold text-sm mb-1 block">球員管理</span>
            <span class="text-xl font-extrabold text-gray-800">查看完整球員名單</span>
          </div>
          <div class="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 group-hover:bg-primary group-hover:text-white transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clip-rule="evenodd" /></svg>
          </div>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-5 flex-1 min-h-0">
      <!-- 近期通知/公告 -->
      <div class="bg-white p-0 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100/60 overflow-hidden flex flex-col">
        <div class="p-5 border-b border-gray-100 flex items-center gap-3 bg-gray-50/50">
          <div class="p-2 bg-yellow-50 rounded-lg text-secondary">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd" /></svg>
          </div>
          <h3 class="font-bold text-lg text-gray-800">最新公告</h3>
        </div>
        <div class="p-5 flex-1 overflow-y-auto" v-loading="isLoading">
          <div v-if="recentAnnouncements.length === 0 && !isLoading" class="p-8 text-center text-gray-400 font-medium h-full flex items-center justify-center">
            目前沒有最新公告 📢
          </div>
          <div v-else>
            <div v-for="ann in recentAnnouncements" :key="ann.id" class="p-4 bg-gradient-to-r from-primary/5 to-secondary/10 rounded-xl border border-primary/20 mb-3 hover:shadow-md transition-shadow cursor-pointer" @click="$router.push('/announcements')">
              <div class="flex items-center justify-between mb-2">
                <span v-if="ann.is_pinned" class="text-[10px] font-extrabold text-white bg-red-500 px-2 py-0.5 rounded shadow-sm">置頂消息</span>
                <span v-else class="text-[10px] font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-md">系統公告</span>
                <span class="text-xs text-gray-400 font-medium">{{ dayjs(ann.created_at).format('MM/DD HH:mm') }}</span>
              </div>
              <p class="text-gray-800 font-extrabold mb-1 line-clamp-1">{{ ann.title }}</p>
              <p class="text-gray-500 text-sm line-clamp-2">{{ ann.content }}</p>
            </div>
          </div>
        </div>
      </div>

      <!-- 近期請假動態 -->
      <div class="bg-white p-0 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100/60 overflow-hidden flex flex-col">
        <div class="p-5 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
          <div class="flex items-center gap-3">
            <div class="p-2 bg-primary/10 rounded-lg text-primary">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clip-rule="evenodd" /></svg>
            </div>
            <h3 class="font-bold text-lg text-gray-800">近期請假動態</h3>
          </div>
          <router-link to="/leave-requests" class="text-sm font-bold text-primary hover:text-primary-hover transition-colors">查看全部</router-link>
        </div>
        <div class="flex-1 overflow-y-auto p-0" v-loading="isLoading">
          <div v-if="recentLeaves.length === 0 && !isLoading" class="p-8 text-center text-gray-400 font-medium">
            近期沒有人員請假 ⚾
          </div>
          <div v-else class="divide-y divide-gray-100">
            <div v-for="leave in recentLeaves" :key="leave.id" class="p-4 hover:bg-gray-50/50 transition-colors flex items-center justify-between">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-full bg-gray-100 overflow-hidden shrink-0">
                  <img v-if="leave.team_members?.avatar_url" :src="leave.team_members.avatar_url" class="w-full h-full object-cover">
                  <div v-else class="w-full h-full flex items-center justify-center text-gray-400 font-bold">{{ leave.team_members?.name?.charAt(0) || '?' }}</div>
                </div>
                <div>
                  <div class="font-bold text-gray-800 text-sm mb-0.5">{{ leave.team_members?.name || '未知' }}</div>
                  <div class="text-xs text-gray-500 font-medium">{{ leave.start_date === leave.end_date ? leave.start_date : `${leave.start_date} ~ ${leave.end_date}` }}</div>
                </div>
              </div>
              <span class="text-xs font-bold px-2 py-1 rounded border" 
                    :class="leave.leave_type === '事假' ? 'bg-orange-50 text-primary border-orange-100' : 'bg-red-50 text-red-600 border-red-100'">
                {{ leave.leave_type }}
              </span>
            </div>
          </div>
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
import { ref, reactive, onMounted } from 'vue'
import { supabase } from '@/services/supabase'
import dayjs from 'dayjs'

const isLoading = ref(true)
const recentLeaves = ref<any[]>([])
const recentAnnouncements = ref<any[]>([])

const stats = reactive({
  totalMembers: 0,
  todayLeaves: 0
})

const fetchDashboardData = async () => {
  isLoading.value = true
  try {
    // 取得總人數
    const { count: membersCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true })
    stats.totalMembers = membersCount || 0

    // 取得今日請假人數
    const todayStr = dayjs().format('YYYY-MM-DD')
    const { data: todayLeavesData } = await supabase.from('leave_requests')
      .select('id')
      .lte('start_date', todayStr)
      .gte('end_date', todayStr)
    stats.todayLeaves = todayLeavesData?.length || 0

    // 取得近期系統公告
    const { data: announcementsData } = await supabase.from('announcements')
      .select('*')
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(5)
    recentAnnouncements.value = announcementsData || []

    // 取得近期請假即將發生的
    const { data: recentLeavesData } = await supabase.from('leave_requests')
      .select('id, user_id, leave_type, start_date, end_date, team_members(name, avatar_url)')
      .gte('end_date', todayStr) // 結束時間大於等於今天的
      .order('start_date', { ascending: true })
      .limit(5)
    
    recentLeaves.value = recentLeavesData || []

  } catch (error) {
    console.error('Error fetching dashboard data:', error)
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  fetchDashboardData()
})
</script>
