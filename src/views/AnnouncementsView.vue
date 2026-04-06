<template>
  <div class="h-full flex flex-col relative animate-fade-in p-2 md:p-6 pb-0 md:pb-6">
    <div class="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div>
        <h2 class="text-3xl font-extrabold text-primary tracking-tight">系統公告設定</h2>
        <p class="text-gray-500 font-medium text-sm mt-1">管理官方佈告欄，將會同步顯示於前台首頁</p>
      </div>

      <!-- 操作按鈕 -->
      <div class="flex gap-2">
        <button v-if="hasPermission" @click="openCreateDialog" class="bg-primary hover:bg-primary-hover text-white px-4 py-2 rounded-xl text-sm font-bold shadow-sm transition-all flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fill-rule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clip-rule="evenodd" />
          </svg>
          新增公告
        </button>
      </div>
    </div>

    <!-- 列表區塊 -->
    <div class="bg-white p-0 rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-gray-100/60 overflow-hidden flex-1 flex flex-col relative min-h-0">
      <div v-if="isLoading" class="absolute inset-0 z-10 flex items-center justify-center bg-white/80 backdrop-blur-sm">
        <div class="flex items-center gap-3 text-primary font-bold">
          <svg class="animate-spin h-5 w-5 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
          載入中...
        </div>
      </div>

      <div class="overflow-x-auto flex-1 h-full">
        <table class="w-full text-left border-collapse min-w-[800px]">
          <thead>
            <tr class="bg-gray-50/80 border-b border-gray-100/80">
              <th class="p-4 text-xs font-bold text-gray-500 uppercase tracking-widest min-w-[120px]">建立時間</th>
              <th class="p-4 text-xs font-bold text-gray-500 uppercase tracking-widest w-24">封面</th>
              <th class="p-4 text-xs font-bold text-gray-500 uppercase tracking-widest min-w-[200px]">標題</th>
              <th class="p-4 text-xs font-bold text-gray-500 uppercase tracking-widest">內文預覽</th>
              <th class="p-4 text-xs font-bold text-gray-500 uppercase tracking-widest w-24 text-center">置頂</th>
              <th class="p-4 text-xs font-bold text-gray-500 uppercase tracking-widest w-24 text-center">操作</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-100/80 bg-white">
            <template v-if="announcements.length > 0">
              <tr v-for="item in announcements" :key="item.id" class="hover:bg-primary/5 transition-colors group">
                <td class="p-4">
                  <div class="text-sm font-bold text-gray-800">{{ dayjs(item.created_at).format('YYYY-MM-DD') }}</div>
                  <div class="text-xs text-gray-400 font-medium">{{ dayjs(item.created_at).format('HH:mm') }}</div>
                </td>
                <td class="p-4">
                   <div v-if="item.image_url" class="w-16 h-10 rounded border border-gray-100 overflow-hidden shrink-0 shadow-sm relative group/img">
                     <img :src="item.image_url" class="w-full h-full object-cover">
                   </div>
                   <div v-else class="w-16 h-10 rounded bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0">
                     <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                   </div>
                </td>
                <td class="p-4">
                  <div class="text-sm font-bold text-gray-800">{{ item.title }}</div>
                </td>
                <td class="p-4">
                  <div class="text-sm text-gray-500 line-clamp-2 max-w-md">{{ item.content }}</div>
                </td>
                <td class="p-4 text-center">
                  <div v-if="item.is_pinned" class="inline-flex items-center justify-center p-1.5 bg-red-50 text-red-500 rounded-md">
                    <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M5 5a3 3 0 015-2.236A3 3 0 0114.83 6h-.08a1 1 0 01-.64.24H6a1 1 0 01-.64-.24H5a3 3 0 010-4zm-1 5a1 1 0 100 2h1v4.5a1.5 1.5 0 003 0V12h2v4.5a1.5 1.5 0 003 0V12h1a1 1 0 100-2H4z" />
                    </svg>
                  </div>
                </td>
                <td class="p-4 text-center">
                  <div class="flex items-center justify-center gap-2">
                    <button v-if="hasPermission" @click="openEditDialog(item)" class="p-2 text-gray-400 hover:text-primary hover:bg-primary/10 rounded-lg transition-colors" title="編輯">
                      <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                    </button>
                    <button v-if="hasPermission" @click="confirmDelete(item.id)" class="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="刪除">
                      <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                </td>
              </tr>
            </template>
            <tr v-else>
              <td colspan="5" class="p-12 text-center">
                <div class="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-3">
                  <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10l6 6v10a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <h3 class="text-sm font-bold text-gray-800">目前沒有公告</h3>
                <p class="text-xs text-gray-400 mt-1">點擊右上角新增公告來發佈第一則消息吧！</p>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 新增/編輯公告 Dialog -->
    <el-dialog v-model="dialogVisible" :title="isEditing ? '編輯系統公告' : '發布新公告'" width="90%" max-width="600px" custom-class="rounded-2xl" :show-close="false">
      <div v-loading="isSubmitting" class="-mt-4">
        <div class="mb-4">
          <label class="block text-sm font-bold text-gray-700 mb-1">封面圖片 <span class="text-gray-400 font-normal">(選填)</span></label>
          <div class="flex items-center gap-4">
            <div class="w-32 h-20 bg-gray-50 rounded-lg border border-dashed border-gray-300 flex items-center justify-center overflow-hidden shrink-0 relative hover:bg-gray-100 transition-colors">
              <img v-if="imagePreview || form.image_url" :src="imagePreview || form.image_url || undefined" class="w-full h-full object-cover" />
              <div v-else class="text-gray-400 flex flex-col items-center">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-6 w-6 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                <span class="text-[10px] font-bold">上傳圖片</span>
              </div>
              <input type="file" accept="image/*" class="absolute inset-0 w-full h-full opacity-0 cursor-pointer" @change="handleFileSelect" />
            </div>
            <div class="flex-1">
              <p class="text-xs text-gray-500 font-medium leading-relaxed">支援 JPG, PNG, GIF 格式。<br>建議比例為 16:9，以獲得最佳前台顯示效果。</p>
              <p v-if="selectedFile" class="text-xs text-primary font-bold mt-1 line-clamp-1">已選取：{{ selectedFile.name }}</p>
            </div>
          </div>
        </div>
        <div class="mb-4">
          <label class="block text-sm font-bold text-gray-700 mb-1">標題 <span class="text-red-500">*</span></label>
          <input v-model="form.title" type="text" class="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-sm font-medium" placeholder="例如：新學期訓練費繳費通知" />
        </div>
        <div class="mb-5">
          <label class="block text-sm font-bold text-gray-700 mb-1">內容 <span class="text-red-500">*</span></label>
          <textarea v-model="form.content" rows="6" class="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all text-sm font-medium resize-none" placeholder="請輸入公告內文..."></textarea>
        </div>
        <div class="mb-2">
          <label class="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" v-model="form.is_pinned" class="rounded text-primary focus:ring-primary w-4 h-4" />
            <span class="text-sm font-bold text-gray-700">設為置頂</span>
            <span class="text-xs text-gray-400 font-medium">(將優先顯示在最上方)</span>
          </label>
        </div>
      </div>
      <template #footer>
        <div class="flex justify-between items-center mt-4">
          <button v-if="isEditing" @click="confirmDelete(form.id)" class="px-4 py-2 rounded-xl text-sm font-bold text-red-500 hover:bg-red-50 transition-colors flex items-center gap-1">
            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
            刪除
          </button>
          <div v-else></div>

          <div class="flex gap-3">
            <button @click="dialogVisible = false" class="px-5 py-2.5 rounded-xl text-sm font-bold text-gray-500 bg-gray-100 hover:bg-gray-200 transition-colors">取消</button>
            <button @click="submitAnnounce" :disabled="isSubmitting || !form.title || !form.content" class="px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-primary hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm">
              {{ isEditing ? '儲存變更' : '發布公告' }}
            </button>
          </div>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed, reactive } from 'vue'
import { supabase } from '@/services/supabase'
import { useAuthStore } from '@/stores/auth'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox } from 'element-plus'

const authStore = useAuthStore()
const isLoading = ref(true)
const isSubmitting = ref(false)
const announcements = ref<any[]>([])
const dialogVisible = ref(false)
const isEditing = ref(false)

const selectedFile = ref<File | null>(null)
const imagePreview = ref('')

const form = reactive({
  id: '',
  title: '',
  content: '',
  is_pinned: false,
  image_url: null as string | null
})

// 權限：只有 ADMIN 和 MANAGER 可以新增刪除
const hasPermission = computed(() => {
  return authStore.profile?.role === 'ADMIN' || authStore.profile?.role === 'MANAGER'
})

const fetchAnnouncements = async () => {
  isLoading.value = true
  try {
    const { data, error } = await supabase
      .from('announcements')
      .select('*')
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })
    
    if (error) throw error
    announcements.value = data || []
  } catch (err: any) {
    console.error('Fetch error:', err)
    ElMessage.error('無法載入公告資料：' + err.message)
  } finally {
    isLoading.value = false
  }
}

const openCreateDialog = () => {
  isEditing.value = false
  form.id = ''
  form.title = ''
  form.content = ''
  form.is_pinned = false
  form.image_url = null
  selectedFile.value = null
  imagePreview.value = ''
  dialogVisible.value = true
}

const openEditDialog = (item: any) => {
  isEditing.value = true
  form.id = item.id
  form.title = item.title
  form.content = item.content
  form.is_pinned = item.is_pinned
  form.image_url = item.image_url
  selectedFile.value = null
  imagePreview.value = ''
  dialogVisible.value = true
}

const handleFileSelect = (event: Event) => {
  const target = event.target as HTMLInputElement
  if (target.files && target.files.length > 0) {
    selectedFile.value = target.files[0]
    // 建立預覽 URL
    imagePreview.value = URL.createObjectURL(selectedFile.value)
  }
}

const uploadImage = async (file: File): Promise<string> => {
  const fileExt = file.name.split('.').pop()
  const fileName = `announcement-${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`
  const filePath = `avatars/${fileName}` // 借用 avatars bucket 上傳

  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(filePath, file)

  if (uploadError) throw new Error('圖片上傳失敗，請確認 Storage 是否有足夠權限。')
  
  const { data } = supabase.storage.from('avatars').getPublicUrl(filePath)
  return data.publicUrl
}

const submitAnnounce = async () => {
  if (!form.title.trim() || !form.content.trim()) return

  isSubmitting.value = true
  try {
    // 1. 若有選擇圖片先上傳
    if (selectedFile.value) {
      form.image_url = await uploadImage(selectedFile.value)
    }

    // 2. 準備存檔資料
    const payload = {
      title: form.title,
      content: form.content,
      is_pinned: form.is_pinned,
      image_url: form.image_url
    }

    // 3. 判斷新增或編輯
    if (isEditing.value) {
      const { error } = await supabase.from('announcements').update(payload).eq('id', form.id)
      if (error) throw error
      ElMessage.success('公告更新成功！')
    } else {
      const { error } = await supabase.from('announcements').insert(payload)
      if (error) throw error
      ElMessage.success('公告發布成功！')
    }
    
    dialogVisible.value = false
    fetchAnnouncements()
  } catch (err: any) {
    console.error('Submit error:', err)
    ElMessage.error((isEditing.value ? '更新' : '發布') + '失敗：' + err.message)
  } finally {
    isSubmitting.value = false
  }
}

const confirmDelete = (id: string) => {
  ElMessageBox.confirm(
    '確定要刪除這筆公告嗎？此動作無法復原。',
    '警告',
    {
      confirmButtonText: '確定刪除',
      cancelButtonText: '取消',
      type: 'warning',
      confirmButtonClass: 'el-button--danger'
    }
  ).then(async () => {
    isSubmitting.value = true
    try {
      const { error } = await supabase.from('announcements').delete().eq('id', id)
      if (error) throw error
      ElMessage.success('已刪除公告')
      if (dialogVisible.value && form.id === id) {
        dialogVisible.value = false // 若正在編輯時刪除，一併關閉對話框
      }
      fetchAnnouncements()
    } catch (err: any) {
      ElMessage.error('刪除失敗：' + err.message)
    } finally {
      isSubmitting.value = false
    }
  }).catch(() => {})
}

onMounted(() => {
  fetchAnnouncements()
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
</style>
