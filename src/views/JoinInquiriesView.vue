<template>
  <div class="p-4 md:p-8 animate-fade-in max-w-6xl mx-auto w-full h-full flex flex-col">
    <!-- Header -->
    <div class="mb-6 flex flex-col md:flex-row justify-between items-start md:items-end gap-4 shrink-0">
      <div>
        <h2 class="text-3xl font-extrabold text-primary flex items-center gap-3 tracking-tight">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 text-secondary" viewBox="0 0 20 20" fill="currentColor">
            <path d="M8 9a3 3 0 100-6 3 3 0 000 6zM8 11a6 6 0 016 6H2a6 6 0 016-6zM16 7a1 1 0 10-2 0v1h-1a1 1 0 100 2h1v1a1 1 0 102 0v-1h1a1 1 0 100-2h-1V7z" />
          </svg>
          家長入隊申請
        </h2>
        <p class="text-gray-500 font-medium text-sm mt-2">
          查看並聯繫從首頁送出入隊詢問的家長。
        </p>
      </div>
      <div>
        <button @click="fetchInquiries" class="bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold px-4 py-2 rounded-xl text-sm transition-colors flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
          重新整理
        </button>
      </div>
    </div>

    <!-- Error State -->
    <div v-if="!hasPermission" class="bg-red-50 text-red-600 p-4 rounded-xl border border-red-100 flex items-center gap-3 mb-6">
      <el-icon><Warning /></el-icon>
      <span class="font-bold">權限不足：您必須是球隊管理員或教練才能查看入隊申請。</span>
    </div>

    <!-- Data Table -->
    <div v-else class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex-1 flex flex-col p-4 w-full">
      <el-table 
        :data="inquiries" 
        style="width: 100%" 
        v-loading="isLoading" 
        class="custom-table"
        stripe
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
              size="small"
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
            <button @click="deleteInquiry(scope.row.id)" class="text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 p-2 rounded-lg transition-colors cursor-pointer" title="刪除此紀錄">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clip-rule="evenodd" /></svg>
            </button>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { supabase } from '@/services/supabase'
import { useAuthStore } from '@/stores/auth'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox } from 'element-plus'
import { Warning } from '@element-plus/icons-vue'

const authStore = useAuthStore()
const inquiries = ref<any[]>([])
const isLoading = ref(false)

const hasPermission = computed(() => {
  const role = authStore.profile?.role
  return role === 'ADMIN' || role === 'MANAGER'
})

const fetchInquiries = async () => {
  if (!hasPermission.value) return

  isLoading.value = true
  try {
    const { data, error } = await supabase
      .from('join_inquiries')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) throw error
    inquiries.value = data || []
  } catch (error: any) {
    console.error('Error fetching inquiries:', error)
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

:deep(.custom-table) {
  --el-table-border-color: #f1f5f9;
  --el-table-header-bg-color: #f8fafc;
  --el-table-header-text-color: #64748b;
  border-radius: 12px;
}
:deep(.el-table th.el-table__cell) {
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-size: 0.85rem;
}
:deep(.el-table--striped .el-table__body tr.el-table__row--striped td.el-table__cell) {
  background-color: #f8fafc;
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
