<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import {
  ArrowDown,
  ArrowUp,
  Bell,
  Calendar,
  Check,
  Clock,
  Delete,
  PictureFilled,
  Plus,
  Refresh,
  Setting,
  StarFilled,
  User,
} from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'

import { supabase } from '@/services/supabase'
import { usePermissionsStore } from '@/stores/permissions'
import HolidayThemePreviewStage from '@/components/settings/HolidayThemePreviewStage.vue'
import {
  HOLIDAY_THEME_MOTION_PICKER_OPTIONS,
  buildHolidayThemeRibbonTitle,
  buildHolidayThemeConfigPayload,
  buildHolidayThemeDisplayState,
  buildHolidayThemeMessageDraft,
  createHolidayThemeActivityDraft,
  fetchHolidayThemeConfig,
  formatHolidayThemeDisplayDateTime,
  getHolidayThemePresetContent,
  isHolidayThemePlayerTheme,
  normalizeHolidayThemeActivity,
  normalizeHolidayThemeConfig,
  parseHolidayThemeInput,
} from '@/composables/useHolidayTheme'

type HolidayThemeActivityDraft = {
  id: string
  manualEnabled: boolean
  scheduleEnabled: boolean
  scheduleStartAt: string
  scheduleEndAt: string
  activeTheme: string
  playerId: string | null
  playerName: string
  title: string
  ribbonTitle: string
  messages: string[]
  ribbonMessages: string[]
  palette: string
  motionPreset: string
  showGlobalRibbon: boolean
  notifyOnStart: boolean
  notificationAutoSentAt: string | null
  [key: string]: any
}

type PlayerOption = {
  id: string
  name: string
  role?: string | null
  team_group?: string | null
  status?: string | null
  [key: string]: any
}

type ActivityStatusMeta = {
  label: string
  badgeClass: string
  selectedCardClass: string
  idleCardClass: string
}

type PresetSyncOptions = {
  previousTheme?: string | null
  previousPlayerName?: string | null
  forceCopy?: boolean
}

const TEXTS = {
  pageTitle: '節日主題設定',
  pageIntro: '管理多筆首頁主題活動、球員主題、顯示文案與自動推播通知。',
  reload: '重新讀取',
  save: '儲存設定',
  addActivity: '新增活動',
  activitySection: '活動列表',
  activityIntro: '可同時建立多筆節日或球員主題活動，首頁會依列表順序選出目前生效的第一筆。',
  emptyTitle: '目前沒有主題活動',
  emptyIntro: '建立第一筆活動後，就能設定時段、文案、球員與通知。',
  activationSection: '啟用方式',
  activationIntro: '可手動立即啟用，也可指定活動時間自動上線。',
  styleSection: '主題風格',
  styleIntro: '選擇主題、配色、動畫與橫幅顯示方式。球員主題可指定對應球員。',
  copySection: '顯示文案',
  copyIntro: '標題與祝福文案會顯示在首頁 Hero 區塊，也會作為通知內容來源。',
  notifySection: '通知設定',
  notifyIntro: '可在活動開始時間自動推播，也可隨時手動補送一次。',
  previewSection: '即時預覽',
  previewIntro: '預覽會套用目前選取活動的文案、主題與目前選定的動畫 preset。',
  readOnlyHint: '你目前只有檢視節日主題設定的權限，無法儲存或發送通知。',
  selectThemeWarning: '請先選擇主題類型',
  rangeWarning: '自動關閉時間不能早於自動開始時間',
  playerRequiredWarning: '球員主題請先選擇球員',
  loadErrorPrefix: '讀取節日主題設定失敗：',
  saveErrorPrefix: '儲存節日主題設定失敗：',
  saveSuccess: '節日主題設定已儲存',
  sendConfirmTitle: '發送主題通知',
  sendConfirmPrefix: '確定要發送這筆主題通知給所有已訂閱使用者嗎？',
  sendSuccess: '主題通知已發送',
  sendNoSubscriptions: '目前沒有可接收通知的裝置，請先在手機登入並允許通知。',
  sendPartialSuccessPrefix: '主題通知已部分發送：',
  sendErrorPrefix: '發送主題通知失敗：',
  deleteConfirmTitle: '刪除活動',
  deleteConfirmPrefix: '確定要刪除這筆主題活動嗎？此操作無法復原。',
  manualEnable: '立即啟用',
  manualEnableHint: '開啟後不受時間限制，首頁與橫幅會立刻套用。',
  scheduleEnable: '啟用自動時段',
  scheduleEnableHint: '依開始與結束時間自動上線與下線。',
  scheduleStart: '開始時間',
  scheduleEnd: '結束時間',
  selectStartAt: '選擇開始時間',
  selectEndAt: '選擇結束時間',
  scheduleGuide: '時段摘要',
  scheduleOff: '未啟用自動時段',
  scheduleEmpty: '已啟用自動時段，但尚未設定開始或結束時間',
  themeLabel: '主題類型',
  themePlaceholder: '請選擇主題',
  paletteLabel: '色彩 preset',
  motionLabel: '動畫 preset',
  ribbonLabel: '全站橫幅',
  ribbonToggleText: '顯示頂部祝福橫幅',
  playerLabel: '指定球員',
  playerPlaceholder: '請選擇球員',
  heroTitle: '首頁主標',
  heroTitlePlaceholder: '請輸入首頁主標',
  messagePrefix: '祝福文案',
  messagePlaceholder: '請輸入會顯示在首頁輪播與通知中的文字',
  applyDefaults: '帶入預設文案',
  sendNow: '立即發送通知',
  notifyToggle: '活動開始時自動推播',
  notifyHint: '到達開始時間且尚未自動發送過時，系統會自動推播一次。',
  lastAutoSent: '上次自動推播',
  neverAutoSent: '尚未自動推播',
  notConfigured: '未設定',
  statusLabel: '生效狀態',
  scheduleLabel: '活動時段',
  messageCountLabel: '文案數量',
  countUnit: '句',
  statusManualAndScheduled: '手動與時段啟用中',
  statusManual: '手動啟用中',
  statusScheduled: '時段啟用中',
  statusWaiting: '等待開始時間',
  statusDisabled: '目前未啟用',
  activityTitleFallback: '未命名活動',
  emptyPreview: '請先建立或選擇一筆活動。',
}

const THEME_OPTIONS = [
  { value: 'mothers_day', label: '母親節' },
  { value: 'fathers_day', label: '父親節' },
  { value: 'player_graduation', label: '球員畢業' },
  { value: 'player_mvp', label: '球員 MVP' },
  { value: 'player_first_hit', label: '首安時刻' },
  { value: 'coach_dai_birthday', label: '戴總教練生日' },
  { value: 'coach_chang_birthday', label: '張教練生日' },
  { value: 'coach_wu_birthday', label: '吳教練生日' },
]

const MOTION_OPTIONS = HOLIDAY_THEME_MOTION_PICKER_OPTIONS

const THEME_SET = new Set(THEME_OPTIONS.map((item) => item.value))
const ACTIVITY_SIGNATURE_KEYS = [
  'scheduleStartAt',
  'scheduleEndAt',
  'activeTheme',
  'playerId',
  'playerName',
  'title',
  'messages',
  'notifyOnStart',
]

const normalizeText = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

const createManualNotificationRequestKey = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

const replacePlayerReference = (
  value: unknown,
  previousPlayerName: unknown,
  nextPlayerName: unknown
): unknown => {
  if (typeof value !== 'string') return value

  const previousName = normalizeText(previousPlayerName)
  const nextName = normalizeText(nextPlayerName)

  if (!previousName || !nextName || previousName === nextName || !value.includes(previousName)) {
    return value
  }

  return value.split(previousName).join(nextName)
}

const syncDraftMessages = ({
  currentMessages,
  previousDefaults = [],
  nextDefaults = [],
  previousPlayerName,
  nextPlayerName,
  forceCopy = false,
}: {
  currentMessages?: unknown
  previousDefaults?: string[]
  nextDefaults?: string[]
  previousPlayerName?: unknown
  nextPlayerName?: unknown
  forceCopy?: boolean
}): string[] => {
  const draftMessages = buildHolidayThemeMessageDraft(currentMessages, previousDefaults)
  const nextMessages = draftMessages.map((message, index) => {
    const previousMessage = previousDefaults[index] || ''
    const presetMessage = nextDefaults[index] || ''

    if (forceCopy || !normalizeText(message) || normalizeText(message) === previousMessage) {
      return presetMessage
    }

    return replacePlayerReference(message, previousPlayerName, nextPlayerName)
  })

  return buildHolidayThemeMessageDraft(nextMessages, nextDefaults)
}

const permissionsStore = usePermissionsStore()

const isLoading = ref(false)
const isSaving = ref(false)
const isSendingNotification = ref(false)
const activities = ref<HolidayThemeActivityDraft[]>([])
const selectedActivityId = ref('')
const loadedActivitySignatures = ref<Record<string, string>>({})
const playerOptions = ref<PlayerOption[]>([])

const canEditHolidayTheme = computed(() => permissionsStore.can('holiday_theme_settings', 'EDIT'))
const isReadOnlyHolidayTheme = computed(() => !canEditHolidayTheme.value)
const hasActivities = computed(() => activities.value.length > 0)

const paletteOptions = computed(() => THEME_OPTIONS)

const selectablePlayers = computed(() => {
  return [...playerOptions.value]
    .filter((player) => {
      if (!player) return false
      if (['離隊', '退隊'].includes(String(player.status || '').trim())) return false
      if (!['球員', '校隊'].includes(String(player.role || '').trim())) return false
      return true
    })
    .sort((left, right) => String(left.name || '').localeCompare(String(right.name || ''), 'zh-Hant'))
})

const selectedActivityIndex = computed(() => {
  return activities.value.findIndex((activity) => activity.id === selectedActivityId.value)
})

const selectedActivity = computed(() => {
  if (!activities.value.length) return null
  return activities.value[selectedActivityIndex.value >= 0 ? selectedActivityIndex.value : 0] || null
})

const normalizedSelectedActivity = computed(() => {
  if (!selectedActivity.value) return null
  return normalizeHolidayThemeActivity(selectedActivity.value)
})

const selectedPreset = computed(() => {
  if (!selectedActivity.value) return getHolidayThemePresetContent('mothers_day')
  return getHolidayThemePresetContent(selectedActivity.value.activeTheme, {
    playerName: selectedActivity.value.playerName,
  })
})

const selectedActivityUsesPlayerTheme = computed(() => {
  return isHolidayThemePlayerTheme(selectedActivity.value?.activeTheme)
})

const previewTheme = computed(() => {
  if (!selectedActivity.value) return buildHolidayThemeDisplayState(null)

  return buildHolidayThemeDisplayState({
    ...normalizeHolidayThemeActivity(selectedActivity.value),
    enabled: true,
    manualEnabled: true,
    activationSource: 'manual',
  })
})

const scheduleSummary = computed(() => {
  if (!selectedActivity.value) return TEXTS.emptyPreview
  if (!selectedActivity.value.scheduleEnabled) return TEXTS.scheduleOff

  const parts: string[] = []
  if (selectedActivity.value.scheduleStartAt) {
    parts.push(`開始 ${formatHolidayThemeDisplayDateTime(selectedActivity.value.scheduleStartAt)}`)
  }
  if (selectedActivity.value.scheduleEndAt) {
    parts.push(`結束 ${formatHolidayThemeDisplayDateTime(selectedActivity.value.scheduleEndAt)}`)
  }

  if (!parts.length) return TEXTS.scheduleEmpty
  return parts.join(' ｜ ')
})

const getActivityStatusMeta = (activity: HolidayThemeActivityDraft | null): ActivityStatusMeta => {
  const normalizedActivity = normalizeHolidayThemeActivity(activity)

  if (normalizedActivity.activationSource === 'manual_and_scheduled') {
    return {
      label: TEXTS.statusManualAndScheduled,
      badgeClass: 'border-violet-200 bg-violet-100 text-violet-700',
      selectedCardClass: 'border-violet-300 bg-violet-50 shadow-[0_12px_32px_-24px_rgba(139,92,246,0.65)]',
      idleCardClass: 'border-violet-200 bg-violet-50/70 hover:border-violet-300 hover:bg-violet-50',
    }
  }

  if (normalizedActivity.activationSource === 'manual') {
    return {
      label: TEXTS.statusManual,
      badgeClass: 'border-emerald-200 bg-emerald-100 text-emerald-700',
      selectedCardClass: 'border-emerald-300 bg-emerald-50 shadow-[0_12px_32px_-24px_rgba(16,185,129,0.65)]',
      idleCardClass: 'border-emerald-200 bg-emerald-50/70 hover:border-emerald-300 hover:bg-emerald-50',
    }
  }

  if (normalizedActivity.activationSource === 'scheduled') {
    return {
      label: TEXTS.statusScheduled,
      badgeClass: 'border-sky-200 bg-sky-100 text-sky-700',
      selectedCardClass: 'border-sky-300 bg-sky-50 shadow-[0_12px_32px_-24px_rgba(14,165,233,0.65)]',
      idleCardClass: 'border-sky-200 bg-sky-50/70 hover:border-sky-300 hover:bg-sky-50',
    }
  }

  if (activity?.scheduleEnabled) {
    return {
      label: TEXTS.statusWaiting,
      badgeClass: 'border-amber-200 bg-amber-100 text-amber-700',
      selectedCardClass: 'border-amber-300 bg-amber-50 shadow-[0_12px_32px_-24px_rgba(217,144,38,0.7)]',
      idleCardClass: 'border-amber-200 bg-amber-50/70 hover:border-amber-300 hover:bg-amber-50',
    }
  }

  return {
    label: TEXTS.statusDisabled,
    badgeClass: 'border-slate-200 bg-slate-100 text-slate-600',
    selectedCardClass: 'border-slate-300 bg-slate-100 shadow-[0_12px_32px_-24px_rgba(100,116,139,0.55)]',
    idleCardClass: 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white',
  }
}

const statusMeta = computed(() => {
  if (!normalizedSelectedActivity.value) return getActivityStatusMeta(null)
  return getActivityStatusMeta(selectedActivity.value)
})

const notificationSummary = computed(() => {
  if (!selectedActivity.value?.notificationAutoSentAt) return TEXTS.neverAutoSent
  return formatHolidayThemeDisplayDateTime(selectedActivity.value.notificationAutoSentAt)
})

const buildActivitySignature = (activity: unknown): string => {
  const normalizedActivity = normalizeHolidayThemeActivity(activity)

  return JSON.stringify(
    ACTIVITY_SIGNATURE_KEYS.reduce<Record<string, any>>((result, key) => {
      result[key] = normalizedActivity[key]
      return result
    }, {})
  )
}

const updateLoadedActivitySignatures = (payloadActivities: any[] = []) => {
  loadedActivitySignatures.value = Object.fromEntries(
    payloadActivities.map((activity) => [activity.id, buildActivitySignature(activity)])
  )
}

const syncActivityPlayerNamesFromStore = () => {
  if (!selectablePlayers.value.length) return

  activities.value.forEach((activity) => {
    if (!activity?.playerId || !isHolidayThemePlayerTheme(activity.activeTheme)) return

    const matchedPlayer = selectablePlayers.value.find(
      (player) => String(player.id) === String(activity.playerId)
    )

    if (matchedPlayer) {
      const previousPlayerName = activity.playerName
      activity.playerName = matchedPlayer.name

      applyPresetToActivity(activity, {
        previousTheme: activity.activeTheme,
        previousPlayerName,
      })
    }
  })
}

const sanitizeIncomingConfig = (value: unknown): HolidayThemeActivityDraft[] => {
  const parsed = parseHolidayThemeInput(value)
  const normalizedConfig = normalizeHolidayThemeConfig(parsed)

  if (!parsed) {
    return [createHolidayThemeActivityDraft({ activeTheme: 'mothers_day' }) as HolidayThemeActivityDraft]
  }

  if (normalizedConfig.activities.length === 0) {
    return Array.isArray(parsed.activities)
      ? []
      : [createHolidayThemeActivityDraft({ activeTheme: 'mothers_day' }) as HolidayThemeActivityDraft]
  }

  return normalizedConfig.activities.map((activity: any) =>
    createHolidayThemeActivityDraft(activity) as HolidayThemeActivityDraft
  )
}

const ensureSelectedActivity = () => {
  if (!activities.value.length) {
    selectedActivityId.value = ''
    return
  }

  const exists = activities.value.some((activity) => activity.id === selectedActivityId.value)
  if (!exists) {
    selectedActivityId.value = activities.value[0].id
  }
}

const applyPresetToActivity = (
  activity: HolidayThemeActivityDraft | null,
  { previousTheme, previousPlayerName, forceCopy = false }: PresetSyncOptions = {}
) => {
  if (!activity) return

  const previousPreset = getHolidayThemePresetContent(previousTheme || activity.activeTheme, {
    playerName: previousPlayerName,
  })
  const nextPreset = getHolidayThemePresetContent(activity.activeTheme, {
    playerName: activity.playerName,
  })
  const previousRibbonTitleDefault = buildHolidayThemeRibbonTitle(previousTheme || activity.activeTheme, {
    playerName: previousPlayerName,
  })
  const nextRibbonTitleDefault = buildHolidayThemeRibbonTitle(activity.activeTheme, {
    playerName: activity.playerName,
  })

  if (!activity.palette || activity.palette === previousTheme || !THEME_SET.has(activity.palette)) {
    activity.palette = activity.activeTheme
  }

  if (!activity.motionPreset || activity.motionPreset === previousPreset.defaultMotionPreset) {
    activity.motionPreset = nextPreset.defaultMotionPreset
  }

  const nextTitle = replacePlayerReference(activity.title, previousPlayerName, activity.playerName) as string

  if (forceCopy || !normalizeText(activity.title) || normalizeText(activity.title) === previousPreset.defaultTitle) {
    activity.title = nextPreset.defaultTitle
  } else if (nextTitle !== activity.title) {
    activity.title = nextTitle
  }

  const nextRibbonTitle = replacePlayerReference(
    activity.ribbonTitle,
    previousPlayerName,
    activity.playerName
  ) as string

  if (
    forceCopy ||
    !normalizeText(activity.ribbonTitle) ||
    normalizeText(activity.ribbonTitle) === previousRibbonTitleDefault
  ) {
    activity.ribbonTitle = nextRibbonTitleDefault
  } else if (nextRibbonTitle !== activity.ribbonTitle) {
    activity.ribbonTitle = nextRibbonTitle
  }

  activity.messages = syncDraftMessages({
    currentMessages: activity.messages,
    previousDefaults: previousPreset.defaultMessages,
    nextDefaults: nextPreset.defaultMessages,
    previousPlayerName,
    nextPlayerName: activity.playerName,
    forceCopy,
  })

  activity.ribbonMessages = syncDraftMessages({
    currentMessages: activity.ribbonMessages,
    previousDefaults: previousPreset.defaultMessages,
    nextDefaults: nextPreset.defaultMessages,
    previousPlayerName,
    nextPlayerName: activity.playerName,
    forceCopy,
  })
}

const addActivity = () => {
  const nextActivity = createHolidayThemeActivityDraft({ activeTheme: 'mothers_day' }) as HolidayThemeActivityDraft
  activities.value.push(nextActivity)
  selectedActivityId.value = nextActivity.id
}

const moveActivity = (activityId: string, direction: 'up' | 'down') => {
  const index = activities.value.findIndex((activity) => activity.id === activityId)
  if (index < 0) return

  const targetIndex = direction === 'up' ? index - 1 : index + 1
  if (targetIndex < 0 || targetIndex >= activities.value.length) return

  const nextActivities = [...activities.value]
  const [item] = nextActivities.splice(index, 1)
  nextActivities.splice(targetIndex, 0, item)
  activities.value = nextActivities
}

const removeActivity = async (activityId: string) => {
  if (!canEditHolidayTheme.value) return

  try {
    await ElMessageBox.confirm(TEXTS.deleteConfirmPrefix, TEXTS.deleteConfirmTitle, {
      type: 'warning',
      confirmButtonText: '刪除',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }

  activities.value = activities.value.filter((activity) => activity.id !== activityId)
  ensureSelectedActivity()
}

const handleThemeChange = (activity: HolidayThemeActivityDraft | null, nextTheme: string) => {
  if (!activity) return

  const previousTheme = activity.activeTheme
  const previousPlayerName = activity.playerName

  activity.activeTheme = nextTheme

  if (!isHolidayThemePlayerTheme(nextTheme)) {
    activity.playerId = null
    activity.playerName = ''
  }

  applyPresetToActivity(activity, {
    previousTheme,
    previousPlayerName,
  })
}

const handlePlayerChange = (activity: HolidayThemeActivityDraft | null, nextPlayerId: string | null) => {
  if (!activity) return

  const previousTheme = activity.activeTheme
  const previousPlayerName = activity.playerName
  const matchedPlayer = selectablePlayers.value.find((player) => String(player.id) === String(nextPlayerId))

  activity.playerId = nextPlayerId || null
  activity.playerName = matchedPlayer?.name || ''

  applyPresetToActivity(activity, {
    previousTheme,
    previousPlayerName,
  })
}

const applyPresetCopy = () => {
  if (!selectedActivity.value) return

  applyPresetToActivity(selectedActivity.value, {
    previousTheme: selectedActivity.value.activeTheme,
    previousPlayerName: selectedActivity.value.playerName,
    forceCopy: true,
  })
}

const validateActivities = () => {
  for (const activity of activities.value) {
    if (!activity.activeTheme) {
      ElMessage.warning(TEXTS.selectThemeWarning)
      return false
    }

    if (isHolidayThemePlayerTheme(activity.activeTheme) && !activity.playerId) {
      ElMessage.warning(TEXTS.playerRequiredWarning)
      return false
    }

    const normalizedActivity = normalizeHolidayThemeActivity(activity)
    if (
      activity.scheduleEnabled &&
      normalizedActivity.scheduleStartAt &&
      normalizedActivity.scheduleEndAt &&
      new Date(normalizedActivity.scheduleEndAt) < new Date(normalizedActivity.scheduleStartAt)
    ) {
      ElMessage.warning(TEXTS.rangeWarning)
      return false
    }
  }

  return true
}

const buildPersistedPayload = () => {
  const payload = buildHolidayThemeConfigPayload(activities.value)

  payload.activities = payload.activities.map((activity) => {
    const signature = buildActivitySignature(activity)
    const previousSignature = loadedActivitySignatures.value[activity.id]

    return {
      ...activity,
      notificationAutoSentAt: activity.notifyOnStart && previousSignature === signature
        ? activity.notificationAutoSentAt
        : null,
    }
  })

  return payload
}

const loadConfig = async () => {
  isLoading.value = true
  try {
    const { data, error } = await supabase.rpc('get_public_holiday_theme_config')

    if (error) throw error

    activities.value = sanitizeIncomingConfig(data)
    ensureSelectedActivity()
    const payload = buildHolidayThemeConfigPayload(activities.value)
    updateLoadedActivitySignatures(payload.activities)
  } catch (error) {
    console.error('Failed to load holiday theme config:', error)
    activities.value = [createHolidayThemeActivityDraft({ activeTheme: 'mothers_day' }) as HolidayThemeActivityDraft]
    ensureSelectedActivity()
    ElMessage.error(`${TEXTS.loadErrorPrefix}${(error as any).message || error}`)
  } finally {
    isLoading.value = false
  }
}

const saveConfig = async () => {
  if (!canEditHolidayTheme.value) return
  if (!validateActivities()) return

  isSaving.value = true
  try {
    const payload = buildPersistedPayload()
    const currentSelectedId = selectedActivityId.value

    const { error } = await supabase.rpc('save_holiday_theme_config', {
      p_config: payload,
    })

    if (error) throw error

    activities.value = payload.activities.map((activity: any) =>
      createHolidayThemeActivityDraft(activity) as HolidayThemeActivityDraft
    )
    selectedActivityId.value = activities.value.some((activity) => activity.id === currentSelectedId)
      ? currentSelectedId
      : activities.value[0]?.id || ''
    updateLoadedActivitySignatures(payload.activities)
    await fetchHolidayThemeConfig({ force: true })
    ElMessage.success(TEXTS.saveSuccess)
  } catch (error) {
    console.error('Failed to save holiday theme config:', error)
    ElMessage.error(`${TEXTS.saveErrorPrefix}${(error as any).message || error}`)
  } finally {
    isSaving.value = false
  }
}

const sendSelectedActivityNotification = async () => {
  if (!selectedActivity.value || !canEditHolidayTheme.value) return
  if (!validateActivities()) return

  try {
    await ElMessageBox.confirm(TEXTS.sendConfirmPrefix, TEXTS.sendConfirmTitle, {
      type: 'warning',
      confirmButtonText: '發送',
      cancelButtonText: '取消',
    })
  } catch {
    return
  }

  isSendingNotification.value = true
  try {
    const {
      data: { session } = {},
    } = await supabase.auth.getSession()
    const { data, error } = await supabase.functions.invoke('notify-holiday-theme', {
      body: {
        mode: 'manual',
        activity: normalizeHolidayThemeActivity(selectedActivity.value),
        request_key: createManualNotificationRequestKey(),
      },
      headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : undefined,
    })

    if (error) throw error
    if ((data?.total_targets ?? 0) === 0) {
      ElMessage.warning(TEXTS.sendNoSubscriptions)
      return
    }

    if ((data?.failed_count ?? 0) > 0 && (data?.dispatched_count ?? 0) > 0) {
      ElMessage.warning(
        `${TEXTS.sendPartialSuccessPrefix}${data.dispatched_count} 台成功，${data.failed_count} 台失敗`
      )
      return
    }

    ElMessage.success(TEXTS.sendSuccess)
  } catch (error) {
    console.error('Failed to send holiday theme notification:', error)
    ElMessage.error(`${TEXTS.sendErrorPrefix}${(error as any).message || error}`)
  } finally {
    isSendingNotification.value = false
  }
}

const getActivityCardMeta = (activity: HolidayThemeActivityDraft) => {
  const preset = getHolidayThemePresetContent(activity.activeTheme, {
    playerName: activity.playerName,
  })
  const activityStatusMeta = getActivityStatusMeta(activity)

  const schedule = !activity.scheduleEnabled
    ? TEXTS.scheduleOff
    : [
        activity.scheduleStartAt ? `開始 ${formatHolidayThemeDisplayDateTime(activity.scheduleStartAt)}` : '',
        activity.scheduleEndAt ? `結束 ${formatHolidayThemeDisplayDateTime(activity.scheduleEndAt)}` : '',
      ].filter(Boolean).join(' ｜ ') || TEXTS.scheduleEmpty

  return {
    label: preset.label,
    title: normalizeText(activity.title) || preset.defaultTitle || TEXTS.activityTitleFallback,
    status: activityStatusMeta.label,
    statusBadgeClass: activityStatusMeta.badgeClass,
    selectedCardClass: activityStatusMeta.selectedCardClass,
    idleCardClass: activityStatusMeta.idleCardClass,
    schedule,
  }
}

watch(
  activities,
  () => {
    ensureSelectedActivity()
  },
  { deep: true }
)

watch(
  () => playerOptions.value,
  () => {
    syncActivityPlayerNamesFromStore()
  },
  { deep: true }
)

const fetchHolidayThemePlayerOptions = async () => {
  try {
    const { data, error } = await supabase.rpc('get_holiday_theme_player_options')
    if (error) throw error
    playerOptions.value = Array.isArray(data) ? data as PlayerOption[] : []
  } catch (error) {
    console.error('Failed to fetch players for holiday theme settings:', error)
    playerOptions.value = []
  }
}

onMounted(async () => {
  await Promise.all([
    loadConfig(),
    fetchHolidayThemePlayerOptions(),
  ])

  syncActivityPlayerNamesFromStore()
})
</script>

<template>
  <div class="holiday-theme-settings-container w-full min-h-[calc(100vh-60px)] bg-slate-50 px-4 py-4 md:px-6 md:py-6">
    <div class="sticky top-0 z-40 mb-8 rounded-3xl border border-white/70 bg-white/88 p-4 shadow-sm backdrop-blur-md">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div class="flex items-center gap-4">
          <div class="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500 to-amber-400 text-white shadow-lg">
            <el-icon :size="24"><StarFilled /></el-icon>
          </div>
          <div>
            <h1 class="app-page-title">{{ TEXTS.pageTitle }}</h1>
            <p class="app-page-subtitle">{{ TEXTS.pageIntro }}</p>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-3">
          <el-button :loading="isLoading" class="rounded-full px-5" plain @click="loadConfig">
            <el-icon class="mr-1"><Refresh /></el-icon>
            {{ TEXTS.reload }}
          </el-button>
          <el-button
            v-if="canEditHolidayTheme"
            type="primary"
            class="rounded-full px-6"
            :loading="isSaving"
            data-test="holiday-save"
            @click="saveConfig"
          >
            {{ TEXTS.save }}
          </el-button>
        </div>
      </div>
    </div>

    <div
      v-if="isReadOnlyHolidayTheme"
      class="mb-6 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium leading-6 text-amber-700"
    >
      {{ TEXTS.readOnlyHint }}
    </div>

    <div class="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(340px,0.95fr)]">
      <div class="space-y-6">
        <section class="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
          <div class="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div class="flex items-center gap-3">
              <div class="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-50 text-amber-500">
                <el-icon :size="22"><Calendar /></el-icon>
              </div>
              <div>
                <h2 class="m-0 text-lg font-black text-slate-800">{{ TEXTS.activitySection }}</h2>
                <p class="mt-1 text-sm text-slate-500">{{ TEXTS.activityIntro }}</p>
              </div>
            </div>

            <el-button
              v-if="canEditHolidayTheme"
              type="primary"
              plain
              class="rounded-full px-5"
              data-test="holiday-add-activity"
              @click="addActivity"
            >
              <el-icon class="mr-1"><Plus /></el-icon>
              {{ TEXTS.addActivity }}
            </el-button>
          </div>

          <div v-if="!hasActivities" class="rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center">
            <div class="text-lg font-black text-slate-700">{{ TEXTS.emptyTitle }}</div>
            <p class="mt-2 text-sm leading-6 text-slate-500">{{ TEXTS.emptyIntro }}</p>
            <el-button
              v-if="canEditHolidayTheme"
              type="primary"
              class="mt-5 rounded-full px-5"
              @click="addActivity"
            >
              {{ TEXTS.addActivity }}
            </el-button>
          </div>

          <div
            v-else
            class="grid grid-cols-1 gap-3"
            data-test="holiday-activity-list"
          >
            <button
              v-for="activity in activities"
              :key="activity.id"
              type="button"
              class="rounded-3xl border px-4 py-4 text-left transition-all duration-200"
              :class="activity.id === selectedActivityId
                ? getActivityCardMeta(activity).selectedCardClass
                : getActivityCardMeta(activity).idleCardClass"
              :data-test="`holiday-activity-card-${activity.id}`"
              @click="selectedActivityId = activity.id"
            >
              <div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div class="min-w-0">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="rounded-full bg-white px-3 py-1 text-xs font-black tracking-[0.2em] text-slate-500">
                      {{ getActivityCardMeta(activity).label }}
                    </span>
                    <span
                      class="rounded-full border px-3 py-1 text-xs font-black"
                      :class="getActivityCardMeta(activity).statusBadgeClass"
                      :data-test="`holiday-activity-status-${activity.id}`"
                    >
                      {{ getActivityCardMeta(activity).status }}
                    </span>
                  </div>

                  <div class="mt-3 truncate text-base font-black text-slate-800">
                    {{ getActivityCardMeta(activity).title }}
                  </div>
                  <div class="mt-2 text-sm leading-6 text-slate-500">
                    {{ getActivityCardMeta(activity).schedule }}
                  </div>
                </div>

                <div
                  v-if="canEditHolidayTheme"
                  class="flex shrink-0 items-center gap-2"
                >
                  <el-button
                    circle
                    plain
                    :disabled="activities[0]?.id === activity.id"
                    @click.stop="moveActivity(activity.id, 'up')"
                  >
                    <el-icon><ArrowUp /></el-icon>
                  </el-button>
                  <el-button
                    circle
                    plain
                    :disabled="activities[activities.length - 1]?.id === activity.id"
                    @click.stop="moveActivity(activity.id, 'down')"
                  >
                    <el-icon><ArrowDown /></el-icon>
                  </el-button>
                  <el-button circle plain type="danger" @click.stop="removeActivity(activity.id)">
                    <el-icon><Delete /></el-icon>
                  </el-button>
                </div>
              </div>
            </button>
          </div>
        </section>

        <template v-if="selectedActivity">
          <section class="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
            <div class="mb-6 flex items-center gap-3">
              <div class="flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-50 text-rose-500">
                <el-icon :size="22"><Setting /></el-icon>
              </div>
              <div>
                <h2 class="m-0 text-lg font-black text-slate-800">{{ TEXTS.activationSection }}</h2>
                <p class="mt-1 text-sm text-slate-500">{{ TEXTS.activationIntro }}</p>
              </div>
            </div>

            <div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div class="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <div class="mb-3 flex items-center justify-between gap-4">
                  <div>
                    <div class="text-sm font-black text-slate-700">{{ TEXTS.manualEnable }}</div>
                    <div class="mt-1 text-xs leading-5 text-slate-500">{{ TEXTS.manualEnableHint }}</div>
                  </div>
                  <el-switch v-model="selectedActivity.manualEnabled" size="large" />
                </div>
              </div>

              <div class="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <div class="mb-3 flex items-center justify-between gap-4">
                  <div>
                    <div class="text-sm font-black text-slate-700">{{ TEXTS.scheduleEnable }}</div>
                    <div class="mt-1 text-xs leading-5 text-slate-500">{{ TEXTS.scheduleEnableHint }}</div>
                  </div>
                  <el-switch v-model="selectedActivity.scheduleEnabled" size="large" />
                </div>
              </div>
            </div>

            <div class="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <el-form-item :label="TEXTS.scheduleStart" class="m-0">
                <el-date-picker
                  v-model="selectedActivity.scheduleStartAt"
                  type="datetime"
                  class="w-full"
                  :placeholder="TEXTS.selectStartAt"
                  value-format="YYYY-MM-DDTHH:mm:ss"
                  format="YYYY/MM/DD HH:mm"
                  :disabled="!selectedActivity.scheduleEnabled"
                  clearable
                />
              </el-form-item>

              <el-form-item :label="TEXTS.scheduleEnd" class="m-0">
                <el-date-picker
                  v-model="selectedActivity.scheduleEndAt"
                  type="datetime"
                  class="w-full"
                  :placeholder="TEXTS.selectEndAt"
                  value-format="YYYY-MM-DDTHH:mm:ss"
                  format="YYYY/MM/DD HH:mm"
                  :disabled="!selectedActivity.scheduleEnabled"
                  clearable
                />
              </el-form-item>
            </div>

            <div class="mt-4 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
              <div class="font-bold text-slate-700">{{ TEXTS.scheduleGuide }}</div>
              <div class="mt-1 leading-6">{{ scheduleSummary }}</div>
            </div>
          </section>

          <section class="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
            <div class="mb-6 flex items-center gap-3">
              <div class="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-50 text-amber-500">
                <el-icon :size="22"><PictureFilled /></el-icon>
              </div>
              <div>
                <h2 class="m-0 text-lg font-black text-slate-800">{{ TEXTS.styleSection }}</h2>
                <p class="mt-1 text-sm text-slate-500">{{ TEXTS.styleIntro }}</p>
              </div>
            </div>

            <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
              <el-form-item :label="TEXTS.themeLabel" class="m-0">
                <el-select
                  :model-value="selectedActivity.activeTheme"
                  class="w-full"
                  :placeholder="TEXTS.themePlaceholder"
                  data-test="holiday-theme-select"
                  @update:model-value="(value: string) => handleThemeChange(selectedActivity, value)"
                >
                  <el-option
                    v-for="item in THEME_OPTIONS"
                    :key="item.value"
                    :label="item.label"
                    :value="item.value"
                  />
                </el-select>
              </el-form-item>

              <el-form-item :label="TEXTS.ribbonLabel" class="m-0">
                <div class="flex h-[40px] items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4">
                  <span class="text-sm font-semibold text-slate-600">{{ TEXTS.ribbonToggleText }}</span>
                  <el-switch v-model="selectedActivity.showGlobalRibbon" />
                </div>
              </el-form-item>

              <el-form-item v-if="selectedActivityUsesPlayerTheme" :label="TEXTS.playerLabel" class="m-0">
                <el-select
                  :model-value="selectedActivity.playerId"
                  class="w-full"
                  filterable
                  clearable
                  :placeholder="TEXTS.playerPlaceholder"
                  data-test="holiday-player-select"
                  @update:model-value="(value: string | null) => handlePlayerChange(selectedActivity, value)"
                >
                  <el-option
                    v-for="player in selectablePlayers"
                    :key="player.id"
                    :label="player.name"
                    :value="player.id"
                  />
                </el-select>
              </el-form-item>

              <el-form-item :label="TEXTS.paletteLabel" class="m-0">
                <el-select v-model="selectedActivity.palette" class="w-full">
                  <el-option
                    v-for="item in paletteOptions"
                    :key="`palette-${item.value}`"
                    :label="item.label"
                    :value="item.value"
                  />
                </el-select>
              </el-form-item>

              <el-form-item :label="TEXTS.motionLabel" class="m-0">
                <el-select v-model="selectedActivity.motionPreset" class="w-full">
                  <el-option
                    v-for="item in MOTION_OPTIONS"
                    :key="item.value"
                    :label="item.label"
                    :value="item.value"
                  />
                </el-select>
              </el-form-item>
            </div>
          </section>

          <section class="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
            <div class="mb-6 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div class="flex items-center gap-3">
                <div class="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-50 text-sky-500">
                  <el-icon :size="22"><Calendar /></el-icon>
                </div>
                <div>
                  <h2 class="m-0 text-lg font-black text-slate-800">{{ TEXTS.copySection }}</h2>
                  <p class="mt-1 text-sm text-slate-500">{{ TEXTS.copyIntro }}</p>
                </div>
              </div>

              <el-button
                v-if="canEditHolidayTheme"
                class="rounded-full px-5"
                plain
                @click="applyPresetCopy"
              >
                {{ TEXTS.applyDefaults }}
              </el-button>
            </div>

            <el-form-item :label="TEXTS.heroTitle" class="m-0">
              <el-input
                v-model="selectedActivity.title"
                maxlength="60"
                show-word-limit
                data-test="holiday-title-input"
                :placeholder="TEXTS.heroTitlePlaceholder"
              />
            </el-form-item>

            <div class="mt-5 grid grid-cols-1 gap-4">
              <div
                v-for="(message, index) in selectedActivity.messages"
                :key="`message-${index}`"
                class="rounded-2xl border border-slate-200 bg-slate-50 p-4"
              >
                <div class="mb-2 flex items-center justify-between">
                  <span class="text-sm font-black text-slate-700">{{ TEXTS.messagePrefix }} {{ index + 1 }}</span>
                </div>
                <el-input
                  v-model="selectedActivity.messages[index]"
                  type="textarea"
                  :rows="2"
                  maxlength="90"
                  show-word-limit
                  :data-test="`holiday-message-${index}`"
                  :placeholder="selectedPreset.defaultMessages[index] || TEXTS.messagePlaceholder"
                />
              </div>
            </div>

            <div class="mt-6 rounded-3xl border border-slate-200 bg-slate-50/80 p-4">
              <div class="flex flex-col gap-1">
                <div class="text-sm font-black text-slate-700">全站橫幅文案</div>
                <div class="text-xs leading-5 text-slate-500">
                  可單獨設定橫幅輪播文字，未另外設定時會沿用祝福文案。
                </div>
              </div>

              <div class="mt-4">
                <el-form-item label="橫幅標題" class="m-0">
                  <el-input
                    v-model="selectedActivity.ribbonTitle"
                    maxlength="40"
                    show-word-limit
                    :disabled="!selectedActivity.showGlobalRibbon"
                    data-test="holiday-ribbon-title-input"
                    :placeholder="`${selectedPreset.label}祝福`"
                  />
                </el-form-item>
              </div>

              <div class="mt-4 grid grid-cols-1 gap-4">
                <div
                  v-for="(message, index) in selectedActivity.ribbonMessages"
                  :key="`ribbon-message-${index}`"
                  class="rounded-2xl border border-slate-200 bg-white p-4"
                >
                  <div class="mb-2 flex items-center justify-between">
                    <span class="text-sm font-black text-slate-700">橫幅文案 {{ index + 1 }}</span>
                  </div>
                  <el-input
                    v-model="selectedActivity.ribbonMessages[index]"
                    type="textarea"
                    :rows="2"
                    maxlength="90"
                    show-word-limit
                    :disabled="!selectedActivity.showGlobalRibbon"
                    :data-test="`holiday-ribbon-message-${index}`"
                    :placeholder="selectedPreset.defaultMessages[index] || TEXTS.messagePlaceholder"
                  />
                </div>
              </div>
            </div>
          </section>

          <section class="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm">
            <div class="mb-6 flex items-center gap-3">
              <div class="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-500">
                <el-icon :size="22"><Bell /></el-icon>
              </div>
              <div>
                <h2 class="m-0 text-lg font-black text-slate-800">{{ TEXTS.notifySection }}</h2>
                <p class="mt-1 text-sm text-slate-500">{{ TEXTS.notifyIntro }}</p>
              </div>
            </div>

            <div class="rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <div class="text-sm font-black text-slate-700">{{ TEXTS.notifyToggle }}</div>
                  <div class="mt-1 text-xs leading-5 text-slate-500">{{ TEXTS.notifyHint }}</div>
                </div>
                <el-switch v-model="selectedActivity.notifyOnStart" size="large" />
              </div>

              <div class="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                <div class="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-3">
                  <div class="text-xs font-black uppercase tracking-[0.2em] text-slate-400">{{ TEXTS.lastAutoSent }}</div>
                  <div class="mt-2 text-sm font-semibold text-slate-700">{{ notificationSummary }}</div>
                </div>

                <el-button
                  v-if="canEditHolidayTheme"
                  type="primary"
                  plain
                  class="rounded-full px-5"
                  :loading="isSendingNotification"
                  data-test="holiday-send-notification"
                  @click="sendSelectedActivityNotification"
                >
                  {{ TEXTS.sendNow }}
                </el-button>
              </div>
            </div>
          </section>
        </template>
      </div>

      <div class="space-y-6">
        <section class="rounded-3xl border border-slate-100 bg-white p-6 shadow-sm xl:sticky xl:top-28">
          <div class="flex items-center justify-between gap-4">
            <div>
              <h2 class="m-0 text-lg font-black text-slate-800">{{ TEXTS.previewSection }}</h2>
              <p class="mt-1 text-sm text-slate-500">{{ TEXTS.previewIntro }}</p>
            </div>
            <span
              class="rounded-full border px-3 py-1 text-xs font-black tracking-widest"
              :class="statusMeta.badgeClass"
            >
              {{ statusMeta.label }}
            </span>
          </div>

          <div v-if="selectedActivity" class="mt-5">
            <HolidayThemePreviewStage :theme="previewTheme" />
          </div>
          <div
            v-else
            class="mt-5 rounded-3xl border border-dashed border-slate-300 bg-slate-50 px-6 py-12 text-center text-sm font-medium leading-6 text-slate-500"
          >
            {{ TEXTS.emptyPreview }}
          </div>

          <div class="mt-5 grid grid-cols-1 gap-3">
            <div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div class="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-slate-400">
                <el-icon><Clock /></el-icon>
                {{ TEXTS.statusLabel }}
              </div>
              <div class="mt-2 text-sm font-semibold text-slate-700">{{ statusMeta.label }}</div>
            </div>

            <div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div class="text-xs font-black uppercase tracking-[0.2em] text-slate-400">{{ TEXTS.scheduleLabel }}</div>
              <div class="mt-2 text-sm font-semibold leading-6 text-slate-700">{{ scheduleSummary }}</div>
            </div>

            <div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div class="text-xs font-black uppercase tracking-[0.2em] text-slate-400">{{ TEXTS.messageCountLabel }}</div>
              <div class="mt-2 text-sm font-semibold text-slate-700">
                {{ selectedActivity ? selectedActivity.messages.filter((message) => message?.trim?.()).length : 0 }}
                {{ TEXTS.countUnit }}
              </div>
            </div>

            <div v-if="selectedActivityUsesPlayerTheme" class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div class="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-slate-400">
                <el-icon><User /></el-icon>
                {{ TEXTS.playerLabel }}
              </div>
              <div class="mt-2 text-sm font-semibold text-slate-700">
                {{ selectedActivity?.playerName || TEXTS.notConfigured }}
              </div>
            </div>

            <div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <div class="flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-slate-400">
                <el-icon><Check /></el-icon>
                {{ TEXTS.lastAutoSent }}
              </div>
              <div class="mt-2 text-sm font-semibold text-slate-700">{{ notificationSummary }}</div>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.holiday-theme-settings-container :deep(.el-form-item__label) {
  padding-bottom: 6px;
  font-weight: 800;
  color: #334155;
}

.holiday-theme-settings-container :deep(.el-input__wrapper),
.holiday-theme-settings-container :deep(.el-select__wrapper),
.holiday-theme-settings-container :deep(.el-textarea__inner) {
  border-radius: 1rem;
  background: #f8fafc;
  box-shadow: 0 0 0 1px #e2e8f0 inset;
}

.holiday-theme-settings-container :deep(.el-input__wrapper.is-focus),
.holiday-theme-settings-container :deep(.el-select__wrapper.is-focused),
.holiday-theme-settings-container :deep(.el-textarea__inner:focus) {
  box-shadow: 0 0 0 1px #d99026 inset;
}
</style>
