<template>
  <el-dialog
    v-model="isOpen"
    title="系統推播通知 (Web Push)"
    width="90%"
    style="max-width: 500px; border-radius: 16px;"
    :show-close="false"
    class="custom-dialog"
  >
    <div v-loading="isFetchingSettings" class="mt-4 space-y-6">
      <div class="bg-primary/5 p-4 rounded-xl border border-primary/20">
        <div class="flex items-center justify-between gap-4 mb-2">
          <span class="font-extrabold text-gray-800">啟用此裝置推播</span>
          <el-switch v-model="settingsForm.receive_notifications" active-color="var(--color-primary)" @change="handleTogglePush" />
        </div>
        <p class="text-sm text-gray-500 leading-relaxed">
          開啟後，將綁定「目前這台裝置與瀏覽器」。之後明日賽事提醒、請假通知與其他系統通知，會直接推播到這台裝置。
        </p>
      </div>

      <section class="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p class="text-sm font-extrabold text-gray-800">開啟教學提示</p>
            <p class="mt-1 text-xs font-medium text-gray-500">選擇目前使用的裝置，照步驟允許通知權限。</p>
          </div>

          <div class="grid grid-cols-2 overflow-hidden rounded-xl border border-gray-200 bg-gray-50 p-1 text-xs font-black">
            <button
              type="button"
              class="rounded-lg px-3 py-2 transition-colors"
              :class="guideMode === 'mobile' ? 'bg-primary text-white shadow-sm' : 'text-gray-500 hover:bg-white hover:text-gray-700'"
              @click="guideMode = 'mobile'"
            >
              手機模式
            </button>
            <button
              type="button"
              class="rounded-lg px-3 py-2 transition-colors"
              :class="guideMode === 'desktop' ? 'bg-primary text-white shadow-sm' : 'text-gray-500 hover:bg-white hover:text-gray-700'"
              @click="guideMode = 'desktop'"
            >
              網頁 / 平板
            </button>
          </div>
        </div>

        <ol class="mt-4 space-y-3">
          <li
            v-for="(step, index) in activeGuideSteps"
            :key="step"
            class="flex gap-3 rounded-xl border border-gray-100 bg-gray-50/80 p-3 text-sm text-gray-600"
          >
            <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-black text-white">{{ index + 1 }}</span>
            <span class="leading-relaxed">{{ step }}</span>
          </li>
        </ol>
      </section>

      <div v-if="settingsForm.support_message" class="bg-amber-50 p-4 rounded-xl text-sm text-amber-700 space-y-2 border border-amber-200">
        <p class="font-bold">啟用前請先確認</p>
        <p class="leading-relaxed">{{ settingsForm.support_message }}</p>
      </div>

      <div v-if="settingsForm.receive_notifications" class="space-y-3 animate-fade-in">
        <div class="bg-green-50 p-4 rounded-xl text-sm text-green-700 space-y-2 border border-green-100 flex items-center gap-2">
          <el-icon class="text-green-500 text-xl"><CircleCheckFilled /></el-icon>
          <span class="font-bold">此裝置已成功綁定系統推播通知！</span>
        </div>

        <div class="bg-white p-4 rounded-xl text-sm text-gray-600 space-y-2 border border-green-100">
          <p v-if="settingsForm.platform_label">
            <span class="font-bold text-gray-700">目前裝置：</span>{{ settingsForm.platform_label }}
          </p>
          <p v-if="settingsForm.provider_label">
            <span class="font-bold text-gray-700">推播供應商：</span>{{ settingsForm.provider_label }}
          </p>
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
        <button @click="isOpen = false" class="px-6 py-2.5 bg-primary hover:bg-primary-hover active:scale-95 disabled:opacity-70 text-white font-bold rounded-xl shadow-lg shadow-primary/20 transition-all flex items-center justify-center min-w-[100px]">關閉設定</button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { CircleCheckFilled, InfoFilled } from '@element-plus/icons-vue'
import { supabase } from '@/services/supabase'
import { useAuthStore } from '@/stores/auth'

const props = defineProps<{
  modelValue: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: boolean]
}>()

const authStore = useAuthStore()

const VAPID_PUBLIC_KEY = 'BIrzQ2oSy_bdMkLjQMDZCnBMzpkFzNHYa1QlcFKNQ3OCjDsMLeKC-2WazmnkSFUK7nwSlM3n8XFahxUxNrLMCmg'

const isFetchingSettings = ref(false)
const guideMode = ref<'mobile' | 'desktop'>('mobile')

const isOpen = computed({
  get: () => props.modelValue,
  set: (value: boolean) => emit('update:modelValue', value)
})

const guideSteps = {
  mobile: [
    '請先用手機開啟系統並登入；iPhone 請從 Safari 分享選單加入主畫面後，再從主畫面開啟。',
    '回到此視窗上方，打開「啟用此裝置推播」開關。',
    '手機跳出通知權限時，請選擇「允許」。若曾封鎖，需到瀏覽器或系統設定解除通知封鎖。',
    '看到「此裝置已成功綁定系統推播通知」後，這台手機就能收到明日賽事提醒與系統通知。'
  ],
  desktop: [
    '請用 Chrome、Edge、Safari 或平板瀏覽器開啟系統並登入。',
    '回到此視窗上方，打開「啟用此裝置推播」開關。',
    '瀏覽器在網址列附近跳出通知權限時，請選擇「允許」。若沒有跳出，請點網址列左側鎖頭或網站設定確認通知權限。',
    '看到「此裝置已成功綁定系統推播通知」後，這台電腦或平板就能收到明日賽事提醒與系統通知。'
  ]
}

const activeGuideSteps = computed(() => guideSteps[guideMode.value])

const settingsForm = reactive({
  receive_notifications: false,
  web_push_sub: null as PushSubscriptionJSON | null,
  current_endpoint: '',
  subscription_id: '',
  provider_label: '',
  platform_label: '',
  support_message: '',
  is_supported: true
})

type PushSupportState = {
  isSupported: boolean
  supportMessage: string
  isIOS: boolean
  isStandalone: boolean
}

type WebPushSubscriptionRow = {
  id: string
  endpoint: string
  subscription: PushSubscriptionJSON
  enabled: boolean
  platform: string | null
}

const getPushSupportState = (): PushSupportState => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {
      isSupported: false,
      supportMessage: '目前環境無法使用 Web Push 通知。',
      isIOS: false,
      isStandalone: false
    }
  }

  const hasCoreSupport =
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    typeof Notification !== 'undefined'

  const isIOS =
    /iP(hone|ad|od)/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

  const isStandalone =
    window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true

  if (!hasCoreSupport) {
    return {
      isSupported: false,
      supportMessage: '此瀏覽器不支援 Web Push 通知。',
      isIOS,
      isStandalone
    }
  }

  if (isIOS && !isStandalone) {
    return {
      isSupported: false,
      supportMessage: 'iPhone 請先從 Safari 的分享選單選擇「加入主畫面」，並改從主畫面開啟系統後，再啟用推播通知。',
      isIOS,
      isStandalone
    }
  }

  return {
    isSupported: true,
    supportMessage: '',
    isIOS,
    isStandalone
  }
}

const getCurrentPlatformLabel = (state = getPushSupportState()) => {
  if (typeof navigator === 'undefined') return '目前裝置'

  const ua = navigator.userAgent || ''
  if (state.isIOS) {
    return state.isStandalone ? 'iPhone / iPad（主畫面 App）' : 'iPhone / iPad（瀏覽器）'
  }
  if (/Android/i.test(ua)) return 'Android'
  if (/Windows/i.test(ua)) return 'Windows'
  if (/Macintosh|Mac OS X/i.test(ua)) return 'macOS'
  if (/Linux/i.test(ua)) return 'Linux'
  return '目前裝置'
}

const getDefaultGuideMode = (state = getPushSupportState()) => {
  if (typeof navigator === 'undefined') return 'desktop'

  const ua = navigator.userAgent || ''
  const isMobileLike =
    state.isIOS ||
    /Android|Mobile|iPhone|iPad|iPod/i.test(ua) ||
    (navigator.maxTouchPoints > 1 && window.innerWidth < 900)

  return isMobileLike ? 'mobile' : 'desktop'
}

const detectPushProvider = (endpoint?: string | null) => {
  if (!endpoint) return ''
  if (endpoint.includes('push.apple.com')) return 'Apple Web Push'
  if (endpoint.includes('fcm.googleapis.com')) return 'FCM Web Push'
  if (endpoint.includes('updates.push.services.mozilla.com')) return 'Mozilla Web Push'
  return 'Web Push'
}

const resetPushSettingsState = (state = getPushSupportState()) => {
  guideMode.value = getDefaultGuideMode(state)
  settingsForm.receive_notifications = false
  settingsForm.web_push_sub = null
  settingsForm.current_endpoint = ''
  settingsForm.subscription_id = ''
  settingsForm.provider_label = ''
  settingsForm.platform_label = getCurrentPlatformLabel(state)
  settingsForm.support_message = state.supportMessage
  settingsForm.is_supported = state.isSupported
}

const getPushRegistration = async () => {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return null
  }

  const existingRegistration = await navigator.serviceWorker.getRegistration()
  if (existingRegistration) {
    return existingRegistration
  }

  return navigator.serviceWorker.ready
}

const loadCurrentDevicePushState = async () => {
  const userId = authStore.user?.id
  const supportState = getPushSupportState()
  resetPushSettingsState(supportState)

  if (!userId || !supportState.isSupported) {
    return
  }

  const registration = await getPushRegistration()
  const currentSubscription = await registration?.pushManager.getSubscription()

  if (!currentSubscription) {
    return
  }

  const endpoint = currentSubscription.endpoint || currentSubscription.toJSON().endpoint || ''
  settingsForm.web_push_sub = currentSubscription.toJSON()
  settingsForm.current_endpoint = endpoint
  settingsForm.provider_label = detectPushProvider(endpoint)

  const { data, error } = await supabase
    .from('web_push_subscriptions')
    .select('id, endpoint, subscription, enabled, platform')
    .eq('user_id', userId)
    .eq('endpoint', endpoint)
    .maybeSingle<WebPushSubscriptionRow>()

  if (error) throw error

  if (data?.enabled) {
    settingsForm.receive_notifications = true
    settingsForm.subscription_id = data.id
    settingsForm.platform_label = data.platform || settingsForm.platform_label
  }
}

const loadSettings = async () => {
  isFetchingSettings.value = true
  try {
    await loadCurrentDevicePushState()
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
  if (Boolean(val)) {
    isFetchingSettings.value = true
    try {
      const userId = authStore.user?.id
      if (!userId) {
        throw new Error('請先登入後再設定推播通知。')
      }

      const supportState = getPushSupportState()
      settingsForm.support_message = supportState.supportMessage
      settingsForm.platform_label = getCurrentPlatformLabel(supportState)
      settingsForm.is_supported = supportState.isSupported

      if (!supportState.isSupported || typeof Notification === 'undefined') {
        throw new Error(supportState.supportMessage || '此裝置目前無法啟用推播通知。')
      }

      const permission =
        Notification.permission === 'granted'
          ? 'granted'
          : await Notification.requestPermission()

      if (permission !== 'granted') {
        settingsForm.receive_notifications = false
        throw new Error('您封鎖了通知權限，請從瀏覽器設定解開。')
      }

      const registration = await getPushRegistration()
      if (!registration) {
        throw new Error('目前找不到可用的 Service Worker，請重新整理後再試一次。')
      }

      let subscription = await registration.pushManager.getSubscription()

      if (!subscription) {
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlB64ToUint8Array(VAPID_PUBLIC_KEY)
        })
      }

      const subJSON = subscription.toJSON()
      const endpoint = subscription.endpoint || subJSON.endpoint || ''
      if (!endpoint) {
        throw new Error('推播訂閱缺少 endpoint，請稍後再試。')
      }

      const platformLabel = getCurrentPlatformLabel(supportState)
      const providerLabel = detectPushProvider(endpoint)
      settingsForm.web_push_sub = subJSON
      settingsForm.current_endpoint = endpoint
      settingsForm.provider_label = providerLabel
      settingsForm.platform_label = platformLabel

      const { data, error } = await supabase
        .rpc('upsert_my_web_push_subscription', {
          p_endpoint: endpoint,
          p_subscription: subJSON,
          p_platform: platformLabel,
          p_user_agent: navigator.userAgent,
          p_enabled: true
        })
        .single()

      if (error) throw error

      const savedSubscription = data as { id?: string } | null
      settingsForm.subscription_id = savedSubscription?.id || ''

      ElMessage.success(`此裝置推播綁定成功${providerLabel ? `：${providerLabel}` : '！'}`)
    } catch (e: any) {
      settingsForm.receive_notifications = false
      ElMessage.error(e.message)
    } finally {
      isFetchingSettings.value = false
    }
  } else {
    isFetchingSettings.value = true
    try {
      const userId = authStore.user?.id
      if (!userId) {
        throw new Error('請先登入後再設定推播通知。')
      }

      const registration = await getPushRegistration()
      const subscription = await registration?.pushManager.getSubscription()
      const endpoint =
        subscription?.endpoint ||
        settingsForm.current_endpoint ||
        settingsForm.web_push_sub?.endpoint ||
        ''

      let unsubscribeError: Error | null = null
      if (subscription) {
        try {
          await subscription.unsubscribe()
        } catch (error: any) {
          unsubscribeError = error
        }
      }

      if (endpoint) {
        const { error } = await supabase
          .from('web_push_subscriptions')
          .delete()
          .eq('user_id', userId)
          .eq('endpoint', endpoint)

        if (error) throw error
      }

      resetPushSettingsState()

      if (unsubscribeError) {
        ElMessage.warning('伺服器已停用這台裝置的推播，但本機訂閱解除失敗，請重新整理後再確認。')
      } else {
        ElMessage.info('已關閉此裝置的推播通知')
      }
    } catch (e: any) {
      ElMessage.error('關閉推播時發生錯誤：' + e.message)
      settingsForm.receive_notifications = true
    } finally {
      isFetchingSettings.value = false
    }
  }
}

watch(
  () => props.modelValue,
  (open) => {
    if (open) {
      void loadSettings()
    }
  },
  { immediate: true }
)
</script>
