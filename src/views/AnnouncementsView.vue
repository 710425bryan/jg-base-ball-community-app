<template>
  <div class="h-full flex flex-col relative animate-fade-in bg-gray-50 text-text overflow-hidden">
    <div class="bg-white px-4 md:px-6 py-4 border-b border-gray-200 shadow-sm shrink-0">
      <div class="max-w-6xl mx-auto flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <AppPageHeader
          title="系統公告設定"
          subtitle="管理官方佈告欄，將會同步顯示於前台首頁"
          :icon="Bell"
          as="h2"
        >
          <template #actions>
            <div class="flex flex-col sm:flex-row sm:items-center gap-3">
              <div class="inline-grid grid-cols-2 gap-1 rounded-2xl border border-gray-200 bg-gray-100 p-1 text-sm font-black">
                <button
                  type="button"
                  class="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 transition-colors"
                  :class="viewMode === 'card' ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-slate-700'"
                  @click="viewMode = 'card'"
                >
                  <el-icon><Grid /></el-icon>
                  卡片
                </button>
                <button
                  type="button"
                  class="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 transition-colors"
                  :class="viewMode === 'table' ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-slate-700'"
                  @click="viewMode = 'table'"
                >
                  <el-icon><List /></el-icon>
                  表格
                </button>
              </div>

              <button
                v-if="canCreateAnnouncements"
                type="button"
                class="inline-flex min-h-10 items-center justify-center gap-2 rounded-2xl bg-primary px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-primary-hover active:scale-95"
                @click="openCreateDialog"
              >
                <el-icon><Plus /></el-icon>
                新增公告
              </button>
            </div>
          </template>
        </AppPageHeader>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto min-h-0 p-4 md:p-6 pb-[calc(4.5rem+env(safe-area-inset-bottom)+20px)] md:pb-6 custom-scrollbar">
      <div class="max-w-6xl mx-auto relative">
        <AppLoadingState v-if="isLoading" text="載入公告資料中..." />

        <template v-else>
          <section
            v-if="announcements.length === 0"
            class="rounded-3xl border border-dashed border-gray-200 bg-white px-6 py-14 text-center shadow-sm"
          >
            <div class="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-50 text-gray-300">
              <el-icon :size="30"><Document /></el-icon>
            </div>
            <h3 class="text-base font-black text-slate-800">目前沒有公告</h3>
            <p class="mt-2 text-sm font-bold text-gray-400">新增第一則公告後，前台首頁就會開始顯示最新消息。</p>
          </section>

          <section v-else-if="viewMode === 'card'" class="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            <article
              v-for="item in announcements"
              :id="getAnnouncementElementId(item.id)"
              :key="item.id"
              class="announcement-card group flex min-h-[420px] flex-col overflow-hidden rounded-3xl border bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
              :class="getAnnouncementSurfaceClass(item.id)"
            >
              <div class="relative aspect-[16/9] overflow-hidden bg-gray-100">
                <PreviewableImage
                  v-if="item.image_url"
                  :src="item.image_url"
                  :alt="`${item.title} 封面圖片`"
                  class="h-full w-full"
                />
                <div v-else class="flex h-full w-full items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 text-gray-300">
                  <el-icon :size="42"><Picture /></el-icon>
                </div>

                <div class="absolute left-3 top-3 flex flex-wrap gap-2">
                  <span class="inline-flex items-center gap-1 rounded-full bg-white/95 px-3 py-1 text-xs font-black text-slate-700 shadow-sm">
                    {{ formatDate(item.created_at) }}
                  </span>
                  <span
                    v-if="item.is_pinned"
                    class="inline-flex items-center gap-1 rounded-full bg-red-500 px-3 py-1 text-xs font-black text-white shadow-sm"
                  >
                    <el-icon><StarFilled /></el-icon>
                    置頂
                  </span>
                </div>
              </div>

              <div class="flex flex-1 flex-col p-5">
                <div class="mb-3">
                  <h3 class="line-clamp-2 text-lg font-black leading-snug text-slate-800">{{ item.title }}</h3>
                  <p class="mt-2 line-clamp-4 whitespace-pre-line text-sm font-medium leading-6 text-gray-500">{{ item.content || '尚未填寫內文' }}</p>
                </div>

                <div class="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4">
                  <div class="text-xs font-bold text-gray-400">
                    {{ dayjs(item.created_at).format('HH:mm') }}
                  </div>

                  <div class="flex items-center gap-2">
                    <button
                      v-if="canSendAnnouncementNotifications"
                      type="button"
                      class="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3 text-sm font-bold text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-60"
                      :disabled="isSendingAnnouncementNotification(item.id)"
                      title="發送通知"
                      @click="confirmSendNotification(item)"
                    >
                      <el-icon :class="{ 'is-loading': isSendingAnnouncementNotification(item.id) }">
                        <Loading v-if="isSendingAnnouncementNotification(item.id)" />
                        <Bell v-else />
                      </el-icon>
                      發送通知
                    </button>
                    <button
                      v-if="canEditAnnouncements"
                      type="button"
                      class="inline-flex h-10 w-10 items-center justify-center rounded-xl text-gray-400 transition-colors hover:bg-primary/10 hover:text-primary"
                      title="編輯"
                      @click="openEditDialog(item)"
                    >
                      <el-icon><EditPen /></el-icon>
                    </button>
                    <button
                      v-if="canDeleteAnnouncements"
                      type="button"
                      class="inline-flex h-10 w-10 items-center justify-center rounded-xl text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
                      title="刪除"
                      @click="confirmDelete(item.id)"
                    >
                      <el-icon><Delete /></el-icon>
                    </button>
                  </div>
                </div>
              </div>
            </article>
          </section>

          <section v-else class="overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-sm">
            <div class="overflow-x-auto">
              <table class="w-full min-w-[900px] border-collapse text-left">
                <thead>
                  <tr class="border-b border-gray-100 bg-gray-50/80">
                    <th class="p-4 text-xs font-black uppercase tracking-widest text-gray-400">建立時間</th>
                    <th class="w-28 p-4 text-xs font-black uppercase tracking-widest text-gray-400">封面</th>
                    <th class="min-w-[220px] p-4 text-xs font-black uppercase tracking-widest text-gray-400">標題</th>
                    <th class="p-4 text-xs font-black uppercase tracking-widest text-gray-400">內文預覽</th>
                    <th class="w-24 p-4 text-center text-xs font-black uppercase tracking-widest text-gray-400">置頂</th>
                    <th class="w-44 p-4 text-center text-xs font-black uppercase tracking-widest text-gray-400">操作</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-100 bg-white">
                  <tr
                    v-for="item in announcements"
                    :id="getAnnouncementElementId(item.id)"
                    :key="item.id"
                    class="transition-colors hover:bg-primary/5"
                    :class="getAnnouncementSurfaceClass(item.id)"
                  >
                    <td class="p-4">
                      <div class="text-sm font-black text-slate-800">{{ formatDate(item.created_at) }}</div>
                      <div class="text-xs font-bold text-gray-400">{{ dayjs(item.created_at).format('HH:mm') }}</div>
                    </td>
                    <td class="p-4">
                      <div v-if="item.image_url" class="h-12 w-20 overflow-hidden rounded-xl border border-gray-100 shadow-sm">
                        <PreviewableImage
                          :src="item.image_url"
                          :alt="`${item.title} 封面圖片`"
                          class="h-full w-full"
                        />
                      </div>
                      <div v-else class="flex h-12 w-20 items-center justify-center rounded-xl border border-gray-100 bg-gray-50 text-gray-300">
                        <el-icon><Picture /></el-icon>
                      </div>
                    </td>
                    <td class="p-4">
                      <div class="line-clamp-2 text-sm font-black text-slate-800">{{ item.title }}</div>
                    </td>
                    <td class="p-4">
                      <div class="line-clamp-2 max-w-md whitespace-pre-line text-sm font-medium text-gray-500">{{ item.content || '尚未填寫內文' }}</div>
                    </td>
                    <td class="p-4 text-center">
                      <span
                        v-if="item.is_pinned"
                        class="inline-flex items-center justify-center rounded-lg bg-red-50 p-2 text-red-500"
                        title="置頂公告"
                      >
                        <el-icon><StarFilled /></el-icon>
                      </span>
                      <span v-else class="text-gray-300">-</span>
                    </td>
                    <td class="p-4">
                      <div class="flex items-center justify-center gap-2">
                        <button
                          v-if="canSendAnnouncementNotifications"
                          type="button"
                          class="inline-flex h-10 w-10 items-center justify-center rounded-xl text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-60"
                          :disabled="isSendingAnnouncementNotification(item.id)"
                          title="發送通知"
                          @click="confirmSendNotification(item)"
                        >
                          <el-icon :class="{ 'is-loading': isSendingAnnouncementNotification(item.id) }">
                            <Loading v-if="isSendingAnnouncementNotification(item.id)" />
                            <Bell v-else />
                          </el-icon>
                        </button>
                        <button
                          v-if="canEditAnnouncements"
                          type="button"
                          class="inline-flex h-10 w-10 items-center justify-center rounded-xl text-gray-400 transition-colors hover:bg-primary/10 hover:text-primary"
                          title="編輯"
                          @click="openEditDialog(item)"
                        >
                          <el-icon><EditPen /></el-icon>
                        </button>
                        <button
                          v-if="canDeleteAnnouncements"
                          type="button"
                          class="inline-flex h-10 w-10 items-center justify-center rounded-xl text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
                          title="刪除"
                          @click="confirmDelete(item.id)"
                        >
                          <el-icon><Delete /></el-icon>
                        </button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </template>
      </div>
    </div>

    <el-dialog
      v-model="dialogVisible"
      :title="isEditing ? '編輯系統公告' : '發布新公告'"
      width="90%"
      style="max-width: 640px; border-radius: 16px;"
      :show-close="false"
      destroy-on-close
      class="custom-dialog"
    >
      <el-form label-position="top" class="mt-4 space-y-5" v-loading="isSubmitting">
        <section class="rounded-2xl border border-gray-100 bg-gray-50/80 p-4">
          <div class="mb-3 flex items-center justify-between gap-3">
            <div>
              <div class="text-sm font-black text-slate-800">封面圖片</div>
              <p class="mt-1 text-xs font-medium text-gray-400">選填，建議 16:9 比例。</p>
            </div>
            <label class="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 text-sm font-bold text-gray-600 transition-colors hover:border-primary hover:text-primary">
              <el-icon><UploadFilled /></el-icon>
              {{ imagePreview || form.image_url ? '更換圖片' : '選擇圖片' }}
              <input type="file" accept="image/*" class="hidden" @change="handleFileSelect" />
            </label>
          </div>

          <div class="overflow-hidden rounded-2xl border border-dashed border-gray-200 bg-white">
            <PreviewableImage
              v-if="imagePreview || form.image_url"
              :src="imagePreview || form.image_url"
              :alt="`${form.title || '公告'} 封面圖片`"
              class="aspect-video w-full"
            />
            <label
              v-else
              class="flex aspect-video cursor-pointer flex-col items-center justify-center text-gray-300 transition-colors hover:bg-gray-50 hover:text-primary"
            >
              <el-icon :size="36"><Picture /></el-icon>
              <span class="mt-2 text-xs font-black text-gray-400">點擊上傳公告封面</span>
              <input type="file" accept="image/*" class="hidden" @change="handleFileSelect" />
            </label>
          </div>

          <p v-if="selectedFile" class="mt-2 line-clamp-1 text-xs font-bold text-primary">已選取：{{ selectedFile.name }}</p>
        </section>

        <el-form-item label="標題" required class="font-bold">
          <el-input
            v-model="form.title"
            size="large"
            maxlength="80"
            show-word-limit
            placeholder="例如：新學期訓練費繳費通知"
          />
        </el-form-item>

        <el-form-item label="內容" required class="font-bold">
          <el-input
            v-model="form.content"
            type="textarea"
            :rows="6"
            maxlength="1200"
            show-word-limit
            placeholder="請輸入公告內文..."
          />
        </el-form-item>

        <div class="rounded-2xl border border-primary/15 bg-primary/5 px-4 py-3">
          <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div class="text-sm font-black text-slate-800">置頂公告</div>
              <p class="mt-1 text-xs font-medium text-gray-500">開啟後會優先顯示在公告列表最上方。</p>
            </div>
            <el-switch v-model="form.is_pinned" size="large" active-text="置頂" inactive-text="一般" />
          </div>
        </div>
      </el-form>

      <template #footer>
        <div class="flex flex-col gap-3 border-t border-gray-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
          <button
            v-if="isEditing && canDeleteAnnouncements"
            type="button"
            class="inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold text-red-500 transition-colors hover:bg-red-50"
            :disabled="isSubmitting"
            @click="confirmDelete(form.id)"
          >
            <el-icon><Delete /></el-icon>
            刪除
          </button>
          <div v-else></div>

          <div class="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button
              type="button"
              class="rounded-2xl border border-gray-200 px-5 py-3 font-bold text-gray-600 transition-colors hover:border-gray-300 hover:text-gray-800"
              @click="closeDialog"
            >
              取消
            </button>
            <button
              type="button"
              class="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-primary px-6 py-3 font-bold text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-70"
              :disabled="isSubmitting || !form.title.trim() || !form.content.trim()"
              @click="submitAnnounce"
            >
              <el-icon v-if="isSubmitting" class="is-loading"><Loading /></el-icon>
              {{ isEditing ? '儲存變更' : '發布公告' }}
            </button>
          </div>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import dayjs from 'dayjs'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Bell,
  Delete,
  Document,
  EditPen,
  Grid,
  List,
  Loading,
  Picture,
  Plus,
  StarFilled,
  UploadFilled
} from '@element-plus/icons-vue'
import AppPageHeader from '@/components/common/AppPageHeader.vue'
import AppLoadingState from '@/components/common/AppLoadingState.vue'
import { supabase } from '@/services/supabase'
import { usePermissionsStore } from '@/stores/permissions'
import { useNotificationFeed } from '@/composables/useNotificationFeed'
import PreviewableImage from '@/components/common/PreviewableImage.vue'
import { compressImage } from '@/utils/imageCompressor'
import {
  buildPushEventKey,
  describePushDispatchIssue,
  dispatchPushNotification
} from '@/utils/pushNotifications'
import { buildNotificationFeedItemId, type NotificationFeedItem } from '@/types/dashboard'

type Announcement = {
  id: string
  title: string
  content: string | null
  is_pinned: boolean
  image_url: string | null
  created_at: string
}

type ViewMode = 'card' | 'table'

const route = useRoute()
const permissionsStore = usePermissionsStore()
const { upsertNotification } = useNotificationFeed()

const isLoading = ref(true)
const isSubmitting = ref(false)
const announcements = ref<Announcement[]>([])
const dialogVisible = ref(false)
const isEditing = ref(false)
const viewMode = ref<ViewMode>('card')
const sendingNotificationIds = ref<string[]>([])

const selectedFile = ref<File | null>(null)
const imagePreview = ref('')

const form = reactive({
  id: '',
  title: '',
  content: '',
  is_pinned: false,
  image_url: null as string | null
})

const canCreateAnnouncements = computed(() => permissionsStore.can('announcements', 'CREATE'))
const canEditAnnouncements = computed(() => permissionsStore.can('announcements', 'EDIT'))
const canDeleteAnnouncements = computed(() => permissionsStore.can('announcements', 'DELETE'))
const canSendAnnouncementNotifications = computed(() =>
  canCreateAnnouncements.value || canEditAnnouncements.value
)
const highlightedAnnouncementId = computed(() =>
  typeof route.query.highlight_announcement_id === 'string'
    ? route.query.highlight_announcement_id
    : ''
)

const formatDate = (value: string) => dayjs(value).format('YYYY-MM-DD')

const getAnnouncementElementId = (id: string) => `announcement-${id}`

const getAnnouncementSurfaceClass = (id: string) =>
  highlightedAnnouncementId.value === id
    ? 'border-primary/60 ring-2 ring-primary/20'
    : 'border-gray-100'

const scrollToHighlightedAnnouncement = async () => {
  if (!highlightedAnnouncementId.value) return
  await nextTick()
  document
    .getElementById(getAnnouncementElementId(highlightedAnnouncementId.value))
    ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
}

const isSendingAnnouncementNotification = (id: string) =>
  sendingNotificationIds.value.includes(id)

const setAnnouncementNotificationSending = (id: string, isSending: boolean) => {
  sendingNotificationIds.value = isSending
    ? [...new Set([...sendingNotificationIds.value, id])]
    : sendingNotificationIds.value.filter((currentId) => currentId !== id)
}

const revokeImagePreview = () => {
  if (imagePreview.value.startsWith('blob:')) {
    URL.revokeObjectURL(imagePreview.value)
  }
  imagePreview.value = ''
}

const resetForm = () => {
  revokeImagePreview()
  form.id = ''
  form.title = ''
  form.content = ''
  form.is_pinned = false
  form.image_url = null
  selectedFile.value = null
}

const closeDialog = () => {
  dialogVisible.value = false
  resetForm()
}

const normalizeNotificationBody = (content: string | null) => {
  const normalized = (content || '').replace(/\s+/g, ' ').trim()
  if (!normalized) return '請查看最新公告內容。'
  return normalized.length > 120 ? `${normalized.slice(0, 120)}...` : normalized
}

const buildAnnouncementNotificationUrl = (id: string) =>
  `/announcements?highlight_announcement_id=${encodeURIComponent(id)}`

const buildAnnouncementNotification = (item: Announcement) => ({
  title: `[系統公告] ${item.title.trim()}`,
  body: normalizeNotificationBody(item.content),
  url: buildAnnouncementNotificationUrl(item.id)
})

const fetchAnnouncements = async () => {
  isLoading.value = true
  try {
    const { data, error } = await supabase
      .from('announcements')
      .select('id, title, content, is_pinned, image_url, created_at')
      .order('is_pinned', { ascending: false })
      .order('created_at', { ascending: false })

    if (error) throw error
    announcements.value = (data || []) as Announcement[]
    await scrollToHighlightedAnnouncement()
  } catch (err: any) {
    console.error('Fetch error:', err)
    ElMessage.error('無法載入公告資料：' + err.message)
  } finally {
    isLoading.value = false
  }
}

const openCreateDialog = () => {
  if (!canCreateAnnouncements.value) {
    ElMessage.error('沒有新增公告權限')
    return
  }

  isEditing.value = false
  resetForm()
  dialogVisible.value = true
}

const openEditDialog = (item: Announcement) => {
  if (!canEditAnnouncements.value) {
    ElMessage.error('沒有編輯公告權限')
    return
  }

  isEditing.value = true
  resetForm()
  form.id = item.id
  form.title = item.title
  form.content = item.content || ''
  form.is_pinned = item.is_pinned
  form.image_url = item.image_url
  dialogVisible.value = true
}

const handleFileSelect = (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0] || null
  if (!file) return

  revokeImagePreview()
  selectedFile.value = file
  imagePreview.value = URL.createObjectURL(file)
  target.value = ''
}

const uploadImage = async (file: File): Promise<string> => {
  const compressedFile = await compressImage(file, 1920, 1080)
  const fileExt = compressedFile.name.split('.').pop()
  const fileName = `announcement-${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`
  const filePath = `avatars/${fileName}`

  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(filePath, compressedFile)

  if (uploadError) throw new Error('圖片上傳失敗，請確認 Storage 是否有足夠權限。')

  const { data } = supabase.storage.from('avatars').getPublicUrl(filePath)
  return data.publicUrl
}

const submitAnnounce = async () => {
  if (!form.title.trim() || !form.content.trim()) return

  if (isEditing.value && !canEditAnnouncements.value) {
    ElMessage.error('沒有編輯公告權限')
    return
  }

  if (!isEditing.value && !canCreateAnnouncements.value) {
    ElMessage.error('沒有新增公告權限')
    return
  }

  isSubmitting.value = true
  try {
    if (selectedFile.value) {
      form.image_url = await uploadImage(selectedFile.value)
    }

    const payload = {
      title: form.title.trim(),
      content: form.content.trim(),
      is_pinned: form.is_pinned,
      image_url: form.image_url
    }

    if (isEditing.value) {
      const { error } = await supabase.from('announcements').update(payload).eq('id', form.id)
      if (error) throw error
      ElMessage.success('公告更新成功！')
    } else {
      const { error } = await supabase.from('announcements').insert(payload)
      if (error) throw error
      ElMessage.success('公告發布成功！')
    }

    closeDialog()
    await fetchAnnouncements()
  } catch (err: any) {
    console.error('Submit error:', err)
    ElMessage.error((isEditing.value ? '更新' : '發布') + '失敗：' + err.message)
  } finally {
    isSubmitting.value = false
  }
}

const sendAnnouncementNotification = async (item: Announcement) => {
  if (!canSendAnnouncementNotifications.value) {
    ElMessage.error('沒有發送公告通知權限')
    return
  }

  const requestKey = buildPushEventKey('announcement_manual', `${item.id}:${Date.now()}`)
  const notificationPayload = buildAnnouncementNotification(item)

  setAnnouncementNotificationSending(item.id, true)
  try {
    const result = await dispatchPushNotification({
      ...notificationPayload,
      feature: 'announcements',
      action: 'VIEW',
      eventKey: requestKey
    })

    const localNotification: NotificationFeedItem = {
      id: buildNotificationFeedItemId('announcement', requestKey),
      source: 'announcement',
      title: notificationPayload.title,
      body: notificationPayload.body,
      createdAt: new Date().toISOString(),
      link: notificationPayload.url,
      highlightMemberId: null
    }
    upsertNotification(localNotification)

    const dispatchIssue = describePushDispatchIssue(result)
    if (dispatchIssue) {
      ElMessage.warning(`站內通知已建立。${dispatchIssue}`)
      return
    }

    ElMessage.success('公告通知已發送，站內通知也已建立。')
  } catch (err: any) {
    console.error('Announcement notification error:', err)
    ElMessage.error('發送公告通知失敗：' + (err?.message || '未知錯誤'))
  } finally {
    setAnnouncementNotificationSending(item.id, false)
  }
}

const confirmSendNotification = (item: Announcement) => {
  ElMessageBox.confirm(
    `確定要將「${item.title}」發送為站內通知與瀏覽器通知嗎？`,
    '發送公告通知',
    {
      confirmButtonText: '發送通知',
      cancelButtonText: '取消',
      type: 'info'
    }
  ).then(() => {
    void sendAnnouncementNotification(item)
  }).catch(() => {})
}

const confirmDelete = (id: string) => {
  if (!canDeleteAnnouncements.value) {
    ElMessage.error('沒有刪除公告權限')
    return
  }

  ElMessageBox.confirm(
    '確定要刪除這筆公告嗎？此動作無法復原。',
    '刪除公告',
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
        closeDialog()
      }
      await fetchAnnouncements()
    } catch (err: any) {
      ElMessage.error('刪除失敗：' + err.message)
    } finally {
      isSubmitting.value = false
    }
  }).catch(() => {})
}

watch(highlightedAnnouncementId, () => {
  void scrollToHighlightedAnnouncement()
})

onMounted(() => {
  void fetchAnnouncements()
})

onBeforeUnmount(() => {
  revokeImagePreview()
})
</script>

<style scoped>
.animate-fade-in {
  animation: fadeIn 0.4s ease-out;
}

.announcement-card :deep(img) {
  object-fit: cover;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
