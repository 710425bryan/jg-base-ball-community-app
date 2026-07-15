<template>
  <div class="p-4 md:p-8 animate-fade-in max-w-6xl mx-auto w-full min-h-full flex flex-col">
    <!-- Header -->
    <div class="mb-6 flex flex-col md:flex-row justify-between items-start md:items-end gap-4 shrink-0">
      <AppPageHeader
        title="家長入隊申請"
        subtitle="查看並聯繫從首頁送出入隊詢問的家長。"
        :icon="UserFilled"
        as="h2"
      >
        <template #actions>
          <button type="button" @click="fetchInquiries" class="flex min-h-11 items-center gap-2 rounded-xl bg-gray-100 px-4 py-2 text-sm font-bold text-gray-700 transition-colors hover:bg-gray-200">
            <el-icon><Refresh /></el-icon>
            重新整理
          </button>
        </template>
      </AppPageHeader>
    </div>

    <!-- Error State -->
    <div v-if="!hasPermission" class="bg-red-50 text-red-600 p-4 rounded-xl border border-red-100 flex items-center gap-3 mb-6">
      <el-icon><Warning /></el-icon>
      <span class="font-bold">權限不足：您必須是球隊管理員或教練才能查看入隊申請。</span>
    </div>

    <div v-else class="flex w-full flex-1 flex-col gap-3">
      <AppLoadingState v-if="isLoading" text="讀取家長入隊申請中..." min-height="50vh" />

      <section v-else-if="loadError" role="alert" class="rounded-2xl border border-red-100 bg-red-50 px-4 py-10 text-center">
        <el-icon class="text-4xl text-red-400"><Warning /></el-icon>
        <h3 class="mt-3 text-base font-black text-red-700">無法載入入隊申請</h3>
        <p class="mt-1 text-sm font-medium text-red-600">{{ loadError }}</p>
        <button type="button" class="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-4 text-sm font-bold text-red-600 transition-colors hover:bg-red-100" @click="fetchInquiries">
          <el-icon><Refresh /></el-icon>
          重新載入
        </button>
      </section>

      <section v-else-if="inquiries.length === 0" class="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-12 text-center shadow-sm">
        <div class="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-orange-50 text-2xl text-primary">
          <el-icon><UserFilled /></el-icon>
        </div>
        <h3 class="mt-4 text-base font-black text-slate-700">目前沒有家長入隊申請</h3>
        <p class="mt-1 text-sm font-medium text-slate-400">新的申請送出後會顯示在這裡。</p>
      </section>

      <template v-else>
      <div class="grid gap-3 md:hidden">
        <article v-for="inquiry in inquiries" :key="inquiry.id" class="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <div class="flex items-start justify-between gap-3">
            <div>
              <div class="font-black text-slate-800">{{ inquiry.parent_name }}</div>
              <div class="mt-1 text-sm font-bold text-primary">{{ inquiry.phone }}</div>
              <div class="mt-1 text-xs text-gray-400">{{ formatDate(inquiry.created_at) }}</div>
            </div>
            <button type="button" class="app-icon-button !border-red-100 !bg-red-50 !text-red-500" aria-label="刪除入隊申請" title="刪除入隊申請" @click="deleteInquiry(inquiry.id)">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" /></svg>
            </button>
          </div>
          <div class="mt-3 grid gap-2 text-sm text-slate-600">
            <div>Line ID：{{ inquiry.line_id || '未填寫' }}</div>
            <div>孩子年紀／年級：{{ inquiry.child_age_or_grade || '未填寫' }}</div>
            <div class="whitespace-pre-line">備註：{{ inquiry.message || '無內容' }}</div>
          </div>
          <el-select v-model="inquiry.status" size="large" class="mt-4 w-full" @change="updateStatus(inquiry.id, $event)">
            <el-option label="待處理" value="pending" />
            <el-option label="聯繫中" value="processing" />
            <el-option label="已結案" value="completed" />
          </el-select>
        </article>
      </div>

      <div class="hidden min-h-[600px] flex-1 flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white p-4 shadow-sm md:flex">
      <el-table 
        :data="inquiries" 
        style="width: 100%" 
        class="custom-table"
        height="100%"
        :empty-text="'目前沒有任何新的入隊申請 ⚾'"
      >
        <el-table-column label="申請日期" min-width="120" sortable prop="created_at">
          <template #default="scope">
            <span class="font-bold text-gray-500">{{ formatDate(scope.row.created_at) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="家長姓名" min-width="120">
          <template #default="scope">
            <div class="font-bold text-gray-800">{{ scope.row.parent_name }}</div>
          </template>
        </el-table-column>
        <el-table-column label="聯絡電話" min-width="140">
          <template #default="scope">
            <div class="text-primary font-bold tracking-wider">{{ scope.row.phone }}</div>
          </template>
        </el-table-column>
        <el-table-column label="Line ID" min-width="130">
          <template #default="scope">
            <span class="font-bold text-emerald-600">{{ scope.row.line_id || '未填寫' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="孩子年紀/年級" min-width="130">
          <template #default="scope">
            <span>{{ scope.row.child_age_or_grade || '未填寫' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="想了解的備註" min-width="200" show-overflow-tooltip>
          <template #default="scope">
            <span class="text-gray-500">{{ scope.row.message || '無內容' }}</span>
          </template>
        </el-table-column>
        <el-table-column label="處理狀態" width="130" align="center">
          <template #default="scope">
            <el-select 
              v-model="scope.row.status" 
              size="large"
              @change="updateStatus(scope.row.id, $event)"
              class="status-select"
              :class="`is-${scope.row.status || 'pending'}`"
            >
              <el-option label="待處理" value="pending" />
              <el-option label="聯繫中" value="processing" />
              <el-option label="已結案" value="completed" />
            </el-select>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="80" align="center" fixed="right">
          <template #default="scope">
            <button type="button" @click="deleteInquiry(scope.row.id)" class="app-icon-button !border-red-100 !bg-red-50 !text-red-500 hover:!bg-red-100" aria-label="刪除此紀錄" title="刪除此紀錄">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" /></svg>
            </button>
          </template>
        </el-table-column>
      </el-table>
      </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { supabase } from '@/services/supabase'
import { useAuthStore } from '@/stores/auth'
import { usePermissionsStore } from '@/stores/permissions'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Refresh, UserFilled, Warning } from '@element-plus/icons-vue'
import AppPageHeader from '@/components/common/AppPageHeader.vue'
import AppLoadingState from '@/components/common/AppLoadingState.vue'

const authStore = useAuthStore()
const permissionsStore = usePermissionsStore()
const inquiries = ref<any[]>([])
const isLoading = ref(false)
const loadError = ref('')

const hasPermission = computed(() => {
  return permissionsStore.can('join_inquiries', 'VIEW')
})

const fetchInquiries = async () => {
  if (!hasPermission.value) return

  isLoading.value = true
  loadError.value = ''
  try {
    const { data, error } = await supabase
      .from('join_inquiries')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error
    inquiries.value = data || []
  } catch (error: any) {
    console.error('Error fetching inquiries:', error)
    loadError.value = '目前無法取得資料，請稍後再試。'
    ElMessage.error('無法載入名單：' + error.message)
  } finally {
    isLoading.value = false
  }
}

const deleteInquiry = async (id: string) => {
  try {
    await ElMessageBox.confirm(
      '確認要刪除這筆詢問紀錄嗎？刪除後將無法恢復。',
      '永久刪除',
      {
        confirmButtonText: '確定刪除',
        cancelButtonText: '取消',
        type: 'warning',
        confirmButtonClass: 'el-button--danger'
      }
    )
    
    // Proceed to delete
    isLoading.value = true
    const { error } = await supabase.from('join_inquiries').delete().eq('id', id)
    if (error) throw error
    
    ElMessage.success('已刪除並移除該筆名單！')
    await fetchInquiries()
  } catch (err: any) {
    if (err !== 'cancel') {
      ElMessage.error('刪除失敗：' + err.message)
    }
  } finally {
    isLoading.value = false
  }
}

const updateStatus = async (id: string, newStatus: string) => {
  try {
    const { error } = await supabase.from('join_inquiries').update({ status: newStatus }).eq('id', id)
    if (error) throw error
    ElMessage.success('狀態更新成功')
  } catch (error: any) {
    ElMessage.error('狀態更新失敗：' + error.message)
    await fetchInquiries() // 發生錯誤時重置畫面
  }
}

const formatDate = (dateString: string) => {
  return dayjs(dateString).format('YYYY-MM-DD HH:mm')
}

onMounted(() => {
  if (hasPermission.value) {
    fetchInquiries()
  }
})
</script>

<style scoped>
.animate-fade-in {
  animation: fadeIn 0.4s ease-out;
}
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}

:deep(.el-table th.el-table__cell) {
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-size: 0.85rem;
}

/* 狀態下拉選單的顏色自訂 */
:deep(.status-select.is-pending .el-input__wrapper) {
  background-color: #fef2f2 !important;
  box-shadow: 0 0 0 1px #fecaca inset !important;
}
:deep(.status-select.is-pending .el-input__inner) {
  color: #ef4444 !important;
  font-weight: bold;
}

:deep(.status-select.is-processing .el-input__wrapper) {
  background-color: #eff6ff !important;
  box-shadow: 0 0 0 1px #bfdbfe inset !important;
}
:deep(.status-select.is-processing .el-input__inner) {
  color: #3b82f6 !important;
  font-weight: bold;
}

:deep(.status-select.is-completed .el-input__wrapper) {
  background-color: #f0fdf4 !important;
  box-shadow: 0 0 0 1px #bbf7d0 inset !important;
}
:deep(.status-select.is-completed .el-input__inner) {
  color: #22c55e !important;
  font-weight: bold;
}
</style>
