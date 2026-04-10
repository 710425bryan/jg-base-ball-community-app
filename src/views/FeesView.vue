<template>
  <div class="h-full flex flex-col relative animate-fade-in bg-gray-50 text-text overflow-hidden">
    <!-- Header -->
    <div class="bg-white px-4 md:px-6 py-4 border-b border-gray-200 shadow-sm shrink-0 flex flex-col gap-3 z-10">
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 class="text-xl md:text-2xl font-black text-slate-800 leading-tight flex items-center gap-2">
            <el-icon class="text-primary"><Money /></el-icon>
            收費管理系統
          </h2>
          <p class="text-xs md:text-sm font-bold text-gray-500 mt-1">
            管理校隊月費、球員季費與收費設定
          </p>
        </div>
      </div>
      
      <!-- Tabs -->
      <div class="overflow-x-auto custom-scrollbar pt-2">
        <div class="flex gap-2 min-w-max">
          <button 
            v-for="tab in tabs" 
            :key="tab.id"
            @click="activeTab = tab.id"
            class="px-5 py-2 rounded-t-xl text-sm font-bold transition-all border-b-2"
            :class="[
              activeTab === tab.id 
                ? 'text-primary border-primary bg-primary/5' 
                : 'text-gray-500 border-transparent hover:text-gray-700 hover:bg-gray-50'
            ]"
          >
            {{ tab.name }}
          </button>
        </div>
      </div>
    </div>

    <!-- Content Area -->
    <div class="flex-1 overflow-y-auto min-h-0 p-4 md:p-6 pb-[calc(4.5rem+env(safe-area-inset-bottom)+20px)] md:pb-6 relative custom-scrollbar">
      <div class="max-w-6xl mx-auto min-h-full">
        <!-- Not authorized -->
        <div v-if="!hasAccess" class="flex flex-col items-center justify-center min-h-[50vh] text-center">
          <el-icon class="text-6xl text-gray-300 mb-4"><Lock /></el-icon>
          <h3 class="text-lg font-bold text-gray-700">無權限存取</h3>
          <p class="text-sm text-gray-500 mt-2">此頁面僅限系統管理員 (ADMIN) 使用</p>
        </div>
        
        <!-- Tab Contents -->
        <template v-else>
          <!-- 延遲載入元件以提高效能，並在切換時保持實例 -->
          <keep-alive>
            <component :is="currentComponent" />
          </keep-alive>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { Money, Lock } from '@element-plus/icons-vue'

// Import Sub Components
import SchoolTeamFees from '@/components/fees/SchoolTeamFees.vue'
import QuarterlyFees from '@/components/fees/QuarterlyFees.vue'
import FeeSettings from '@/components/fees/FeeSettings.vue'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const hasAccess = computed(() => ['ADMIN'].includes(authStore.profile?.role))

const tabs = [
  { id: 'monthly', name: '校隊月費結算' },
  { id: 'quarterly', name: '球員季費表單' },
  { id: 'settings', name: '校隊收費設定' }
]

const activeTab = ref('monthly')

watch(() => route.query.tab, (newTab) => {
  if (newTab === 'monthly' || newTab === 'quarterly' || newTab === 'settings') {
    activeTab.value = newTab as string
  }
}, { immediate: true })

const currentComponent = computed(() => {
  switch (activeTab.value) {
    case 'monthly': return SchoolTeamFees
    case 'quarterly': return QuarterlyFees
    case 'settings': return FeeSettings
    default: return SchoolTeamFees
  }
})
</script>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  height: 4px;
  width: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: #cbd5e1;
  border-radius: 10px;
}
</style>
