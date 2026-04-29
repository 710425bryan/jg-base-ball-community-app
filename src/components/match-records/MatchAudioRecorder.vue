<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { Check, Delete, Document, Loading, Upload, VideoCamera } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { transcribeMatchAudio } from '@/services/matchAudioApi'
import {
  addMatchAudioDraftChunk,
  createMatchAudioDraftId,
  deleteMatchAudioDraft,
  getMatchAudioDraftChunks,
  listMatchAudioDrafts,
  saveMatchAudioDraft,
  updateMatchAudioDraft,
  type MatchAudioDraftRecord,
} from '@/utils/matchAudioDraftStore'
import {
  buildMatchAudioLogText,
  hasUnresolvedMatchAudioPlayers,
  MATCH_AUDIO_TEXT_ONLY,
  type MatchAudioResolutionMap,
  type MatchAudioRosterPlayer,
} from '@/utils/matchAudioTranscription'

const props = defineProps<{
  scopeId: string
  currentInning: string
  matchId?: string | null
  matchName?: string | null
  opponent?: string | null
  matchDate?: string | null
  batFirst?: boolean | null
  isOffensiveHalf?: boolean | null
  roster: MatchAudioRosterPlayer[]
}>()

const emit = defineEmits<{
  (e: 'apply-log', value: { draftId: string; inning: string; log: string; transcript: string }): void
}>()

const audioInputRef = ref<HTMLInputElement | null>(null)
const manualText = ref('')
const manualInning = ref(props.currentInning || '一上')
const drafts = ref<MatchAudioDraftRecord[]>([])
const loadingDrafts = ref(false)
const storeError = ref('')
const recordingError = ref('')
const recordingDraftId = ref('')
const recordingStartedAt = ref(0)
const recordingDurationMs = ref(0)
const chunkIndex = ref(0)
const pendingChunkWrites = ref<Promise<void>[]>([])
const mediaRecorder = ref<MediaRecorder | null>(null)
const mediaStream = ref<MediaStream | null>(null)
const timer = ref<number | null>(null)
const resolutionState = reactive<Record<string, MatchAudioResolutionMap>>({})

const isMediaRecorderSupported = computed(() =>
  typeof window !== 'undefined' &&
  typeof navigator !== 'undefined' &&
  typeof navigator.mediaDevices?.getUserMedia === 'function' &&
  typeof window.MediaRecorder !== 'undefined'
)
const activeDraft = computed(() => drafts.value.find((draft) => draft.id === recordingDraftId.value) || null)
const isRecording = computed(() => activeDraft.value?.status === 'recording')
const isPaused = computed(() => activeDraft.value?.status === 'paused')
const canProcessBatch = computed(() => drafts.value.some((draft) => draft.status === 'ready' || draft.status === 'error'))
const rosterNames = computed(() => props.roster.map((player) => player.name).filter(Boolean))
const draftStatusLabel = (status: MatchAudioDraftRecord['status']) => ({
  recording: '錄音中',
  paused: '已暫停',
  ready: '待處理',
  processing: 'AI 處理中',
  transcribed: '待套用',
  applied: '已套用',
  error: '處理失敗',
}[status])

const formatDuration = (durationMs: number) => {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

const getSupportedMimeType = () => {
  if (typeof window === 'undefined' || typeof window.MediaRecorder === 'undefined') return ''

  return [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/mpeg',
  ].find((mimeType) => window.MediaRecorder.isTypeSupported(mimeType)) || ''
}

const refreshDrafts = async () => {
  if (!props.scopeId) return

  loadingDrafts.value = true
  storeError.value = ''
  try {
    drafts.value = await listMatchAudioDrafts(props.scopeId)
  } catch (error: any) {
    storeError.value = error?.message || '讀取本機錄音草稿失敗'
  } finally {
    loadingDrafts.value = false
  }
}

const stopTimer = () => {
  if (timer.value !== null) {
    window.clearInterval(timer.value)
    timer.value = null
  }
}

const startTimer = () => {
  stopTimer()
  timer.value = window.setInterval(() => {
    if (!recordingStartedAt.value) return
    recordingDurationMs.value = Date.now() - recordingStartedAt.value
  }, 1000)
}

const stopStream = () => {
  mediaStream.value?.getTracks().forEach((track) => track.stop())
  mediaStream.value = null
}

const updateDraftStatus = async (status: MatchAudioDraftRecord['status']) => {
  const draftId = recordingDraftId.value
  if (!draftId) return

  await updateMatchAudioDraft(draftId, (draft) => ({
    ...draft,
    status,
    durationMs: recordingDurationMs.value || draft.durationMs,
  }))
  await refreshDrafts()
}

const startRecording = async () => {
  if (!isMediaRecorderSupported.value) {
    recordingError.value = '此瀏覽器不支援直接錄音，請改用音訊檔上傳。'
    return
  }

  recordingError.value = ''
  const mimeType = getSupportedMimeType()

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
    const draftId = createMatchAudioDraftId()
    const now = new Date().toISOString()

    recordingDraftId.value = draftId
    recordingStartedAt.value = Date.now()
    recordingDurationMs.value = 0
    chunkIndex.value = 0
    pendingChunkWrites.value = []
    mediaStream.value = stream
    mediaRecorder.value = recorder

    await saveMatchAudioDraft({
      id: draftId,
      scopeId: props.scopeId,
      inning: props.currentInning || '一上',
      mimeType: recorder.mimeType || mimeType || 'audio/webm',
      status: 'recording',
      chunkCount: 0,
      durationMs: 0,
      createdAt: now,
      updatedAt: now,
    })

    recorder.ondataavailable = async (event) => {
      if (!event.data || event.data.size === 0) return
      const nextIndex = chunkIndex.value
      chunkIndex.value += 1
      const writePromise = (async () => {
        await addMatchAudioDraftChunk(draftId, nextIndex, event.data)
        await updateMatchAudioDraft(draftId, (draft) => ({
          ...draft,
          chunkCount: nextIndex + 1,
          durationMs: recordingDurationMs.value,
        }))
      })()
      pendingChunkWrites.value.push(writePromise)
      await writePromise
    }

    recorder.onstop = async () => {
      stopTimer()
      stopStream()
      mediaRecorder.value = null
      await Promise.allSettled(pendingChunkWrites.value)
      if (recordingDraftId.value === draftId) recordingDraftId.value = ''
      await updateMatchAudioDraft(draftId, (draft) => ({
        ...draft,
        status: Math.max(draft.chunkCount, chunkIndex.value) > 0 ? 'ready' : 'error',
        chunkCount: Math.max(draft.chunkCount, chunkIndex.value),
        durationMs: recordingDurationMs.value,
        error: Math.max(draft.chunkCount, chunkIndex.value) > 0 ? undefined : '沒有錄到任何音訊',
      }))
      await refreshDrafts()
    }

    recorder.start(5000)
    startTimer()
    await refreshDrafts()
  } catch (error: any) {
    stopTimer()
    stopStream()
    mediaRecorder.value = null
    recordingDraftId.value = ''
    recordingError.value = error?.message || '無法取得麥克風權限'
  }
}

const pauseRecording = async () => {
  if (!mediaRecorder.value || mediaRecorder.value.state !== 'recording') return

  mediaRecorder.value.pause()
  stopTimer()
  await updateDraftStatus('paused')
}

const resumeRecording = async () => {
  if (!mediaRecorder.value || mediaRecorder.value.state !== 'paused') return

  recordingStartedAt.value = Date.now() - recordingDurationMs.value
  mediaRecorder.value.resume()
  startTimer()
  await updateDraftStatus('recording')
}

const stopRecording = () => {
  if (!mediaRecorder.value || mediaRecorder.value.state === 'inactive') return
  mediaRecorder.value.requestData()
  mediaRecorder.value.stop()
}

const processDraft = async (draft: MatchAudioDraftRecord) => {
  if (draft.status === 'processing') return

  try {
    await updateMatchAudioDraft(draft.id, (currentDraft) => ({
      ...currentDraft,
      status: 'processing',
      error: undefined,
    }))
    await refreshDrafts()

    const chunks = await getMatchAudioDraftChunks(draft.id)
    if (!chunks.length) {
      throw new Error('這段錄音沒有可處理的音訊片段')
    }

    const audioBlob = new Blob(chunks, { type: draft.mimeType || chunks[0]?.type || 'audio/webm' })
    const result = await transcribeMatchAudio({
      audioBlob,
      chunks,
      mimeType: draft.mimeType || audioBlob.type || 'audio/webm',
      inning: draft.inning,
      matchContext: {
        matchId: props.matchId,
        matchName: props.matchName,
        opponent: props.opponent,
        matchDate: props.matchDate,
        batFirst: props.batFirst,
        isOffensiveHalf: props.isOffensiveHalf,
      },
      roster: props.roster,
    })

    resolutionState[draft.id] = {}
    await updateMatchAudioDraft(draft.id, (currentDraft) => ({
      ...currentDraft,
      status: 'transcribed',
      transcript: result.transcript,
      result,
      error: undefined,
    }))
    await refreshDrafts()
    ElMessage.success('AI 已完成逐局文字整理')
  } catch (error: any) {
    await updateMatchAudioDraft(draft.id, (currentDraft) => ({
      ...currentDraft,
      status: 'error',
      error: error?.message || 'AI 處理失敗，請稍後再試',
    }))
    await refreshDrafts()
    ElMessage.error(error?.message || 'AI 處理失敗，請稍後再試')
  }
}

const processAllReadyDrafts = async () => {
  for (const draft of drafts.value) {
    if (draft.status === 'ready' || draft.status === 'error') {
      await processDraft(draft)
    }
  }
}

const removeDraft = async (draft: MatchAudioDraftRecord) => {
  try {
    await ElMessageBox.confirm(
      `確定要刪除 ${draft.inning} 的本機錄音草稿嗎？`,
      '刪除錄音草稿',
      {
        type: 'warning',
        confirmButtonText: '刪除',
        cancelButtonText: '取消',
      }
    )
    await deleteMatchAudioDraft(draft.id)
    delete resolutionState[draft.id]
    await refreshDrafts()
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') {
      ElMessage.error('刪除錄音草稿失敗')
    }
  }
}

const exportTranscript = (draft: MatchAudioDraftRecord) => {
  const text = [
    `局數：${draft.inning}`,
    `逐字稿：`,
    draft.transcript || '',
    '',
    `建議逐局轉播：`,
    draft.result?.suggestedLog || '',
  ].join('\n')
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `match-audio-${draft.inning}.txt`
  anchor.click()
  URL.revokeObjectURL(url)
}

const hasBlockingUnresolved = (draft: MatchAudioDraftRecord) => {
  if (!draft.result?.unresolvedPlayers.length) return false
  return hasUnresolvedMatchAudioPlayers(draft.result.unresolvedPlayers, resolutionState[draft.id] || {})
}

const applyDraft = async (draft: MatchAudioDraftRecord) => {
  if (!draft.result) return

  if (hasBlockingUnresolved(draft)) {
    ElMessage.warning('請先處理所有待確認人名')
    return
  }

  const log = buildMatchAudioLogText(draft.result.events, resolutionState[draft.id] || {})
  if (!log.trim()) {
    ElMessage.warning('沒有可套用的逐局轉播內容')
    return
  }

  emit('apply-log', {
    draftId: draft.id,
    inning: draft.inning,
    log,
    transcript: draft.transcript || '',
  })

  await updateMatchAudioDraft(draft.id, (currentDraft) => ({
    ...currentDraft,
    status: 'applied',
    appliedAt: new Date().toISOString(),
  }))
  await refreshDrafts()
}

const triggerAudioUpload = () => {
  audioInputRef.value?.click()
}

const handleAudioUpload = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  const draftId = createMatchAudioDraftId()
  const now = new Date().toISOString()
  await saveMatchAudioDraft({
    id: draftId,
    scopeId: props.scopeId,
    inning: props.currentInning || '一上',
    mimeType: file.type || 'audio/webm',
    status: 'ready',
    chunkCount: 1,
    durationMs: 0,
    createdAt: now,
    updatedAt: now,
  })
  await addMatchAudioDraftChunk(draftId, 0, file)
  await refreshDrafts()
  ElMessage.success('已加入音訊檔草稿')
}

const applyManualText = () => {
  const text = manualText.value.trim()
  if (!text) {
    ElMessage.warning('請先輸入逐局文字')
    return
  }

  emit('apply-log', {
    draftId: `manual-${Date.now()}`,
    inning: manualInning.value || props.currentInning || '一上',
    log: text,
    transcript: text,
  })
  manualText.value = ''
}

watch(
  () => props.scopeId,
  () => {
    void refreshDrafts()
  },
  { immediate: true }
)

watch(
  () => props.currentInning,
  (inning) => {
    manualInning.value = inning || '一上'
  }
)

onMounted(() => {
  void refreshDrafts()
})

onBeforeUnmount(() => {
  stopTimer()
  if (mediaRecorder.value && mediaRecorder.value.state !== 'inactive') {
    mediaRecorder.value.stop()
  }
  stopStream()
})
</script>

<template>
  <section class="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4 shadow-sm">
    <input ref="audioInputRef" type="file" accept="audio/*" class="hidden" @change="handleAudioUpload" />

    <div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
      <div>
        <div class="flex items-center gap-2">
          <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-600 text-white">
            <el-icon><VideoCamera /></el-icon>
          </div>
          <div>
            <h3 class="text-sm font-black text-slate-900">半局錄音轉逐局轉播</h3>
            <p class="mt-0.5 text-xs font-semibold text-slate-500">本機暫存，不會在送 AI 前上傳音訊</p>
          </div>
        </div>
        <div class="mt-2 flex flex-wrap gap-1.5">
          <el-tag size="small" effect="plain" type="success" class="font-bold">目前：{{ currentInning || '一上' }}</el-tag>
          <el-tag size="small" effect="plain" class="font-bold">本場名單 {{ roster.length }} 人</el-tag>
        </div>
      </div>

      <div class="flex flex-wrap gap-2">
        <el-button v-if="!isRecording && !isPaused" type="success" class="font-bold" @click="startRecording" :disabled="!isMediaRecorderSupported">
          開始錄音
        </el-button>
        <el-button v-if="isRecording" plain class="font-bold" @click="pauseRecording">暫停</el-button>
        <el-button v-if="isPaused" type="success" plain class="font-bold" @click="resumeRecording">繼續</el-button>
        <el-button v-if="isRecording || isPaused" type="danger" plain class="font-bold" @click="stopRecording">停止</el-button>
        <el-button plain class="font-bold" @click="triggerAudioUpload">
          <el-icon class="mr-1"><Upload /></el-icon>上傳音訊
        </el-button>
        <el-button type="primary" plain class="font-bold" :disabled="!canProcessBatch" @click="processAllReadyDrafts">
          全部送 AI
        </el-button>
      </div>
    </div>

    <div v-if="recordingError || storeError" class="mt-3 rounded-xl border border-red-100 bg-white p-3 text-sm font-bold text-red-600">
      {{ recordingError || storeError }}
    </div>
    <div v-if="!isMediaRecorderSupported" class="mt-3 rounded-xl border border-amber-100 bg-amber-50 p-3 text-xs font-semibold text-amber-700">
      目前瀏覽器無法直接錄音，請使用「上傳音訊」或下方手動輸入逐局文字。
    </div>

    <div v-if="activeDraft" class="mt-3 rounded-xl border border-emerald-200 bg-white p-3 text-sm font-bold text-emerald-700">
      正在錄製 {{ activeDraft.inning }}，已錄 {{ formatDuration(recordingDurationMs) }}
    </div>

    <div class="mt-4 space-y-3">
      <div v-if="loadingDrafts" class="rounded-xl bg-white p-4 text-center text-sm font-bold text-slate-400">
        <el-icon class="is-loading mr-1"><Loading /></el-icon>讀取錄音草稿中
      </div>

      <div v-for="draft in drafts" :key="draft.id" class="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div class="min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <el-tag effect="dark" class="font-bold">{{ draft.inning }}</el-tag>
              <el-tag size="small" effect="plain" :type="draft.status === 'error' ? 'danger' : draft.status === 'applied' ? 'success' : 'info'" class="font-bold">
                {{ draftStatusLabel(draft.status) }}
              </el-tag>
              <span class="text-xs font-semibold text-slate-400">{{ formatDuration(draft.durationMs) }} · {{ draft.chunkCount }} 段</span>
            </div>
            <p v-if="draft.error" class="mt-2 text-xs font-bold text-red-500">{{ draft.error }}</p>
            <p v-if="draft.result?.summary" class="mt-2 text-sm font-semibold text-slate-600">{{ draft.result.summary }}</p>
          </div>

          <div class="flex flex-wrap gap-2">
            <el-button size="small" type="primary" plain :disabled="draft.status === 'processing' || draft.status === 'recording' || draft.status === 'paused'" @click="processDraft(draft)">
              <el-icon v-if="draft.status === 'processing'" class="is-loading mr-1"><Loading /></el-icon>
              送 AI
            </el-button>
            <el-button v-if="draft.result" size="small" color="#22c55e" class="!text-white font-bold" :disabled="hasBlockingUnresolved(draft)" @click="applyDraft(draft)">
              <el-icon class="mr-1"><Check /></el-icon>套用
            </el-button>
            <el-button v-if="draft.transcript || draft.result" size="small" plain @click="exportTranscript(draft)">
              <el-icon class="mr-1"><Document /></el-icon>匯出
            </el-button>
            <el-button size="small" type="danger" plain @click="removeDraft(draft)">
              <el-icon><Delete /></el-icon>
            </el-button>
          </div>
        </div>

        <div v-if="draft.result" class="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
          <div class="rounded-xl bg-slate-50 p-3">
            <div class="mb-1 text-xs font-black text-slate-400">逐字稿</div>
            <div class="max-h-36 overflow-y-auto whitespace-pre-wrap text-sm font-medium leading-relaxed text-slate-700 custom-scrollbar">
              {{ draft.transcript || '沒有逐字稿' }}
            </div>
          </div>
          <div class="rounded-xl bg-emerald-50 p-3">
            <div class="mb-1 text-xs font-black text-emerald-700">建議逐局轉播</div>
            <div class="max-h-36 overflow-y-auto whitespace-pre-wrap text-sm font-bold leading-relaxed text-slate-800 custom-scrollbar">
              {{ buildMatchAudioLogText(draft.result.events, resolutionState[draft.id] || {}) || '沒有可套用的事件' }}
            </div>
          </div>
        </div>

        <div v-if="draft.result?.unresolvedPlayers.length" class="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <div class="mb-2 text-xs font-black text-amber-700">待確認人名</div>
          <div class="space-y-2">
            <div v-for="player in draft.result.unresolvedPlayers" :key="`${draft.id}-${player.rawName}`" class="grid grid-cols-1 gap-2 md:grid-cols-[minmax(120px,1fr)_minmax(180px,260px)] md:items-center">
              <div class="text-sm font-bold text-slate-700">
                {{ player.rawName }}
                <span class="ml-1 text-xs font-semibold text-slate-400">{{ player.reason }}</span>
              </div>
              <el-select
                :model-value="(resolutionState[draft.id] || {})[player.rawName]"
                placeholder="選本場球員或純文字"
                filterable
                clearable
                class="w-full"
                @update:model-value="(value: string) => {
                  if (!resolutionState[draft.id]) resolutionState[draft.id] = {}
                  resolutionState[draft.id][player.rawName] = value
                }"
              >
                <el-option label="只保留文字，不進統計" :value="MATCH_AUDIO_TEXT_ONLY" />
                <el-option v-for="name in rosterNames" :key="`${draft.id}-${player.rawName}-${name}`" :label="name" :value="name" />
              </el-select>
            </div>
          </div>
        </div>

        <div v-if="draft.result?.warnings.length" class="mt-3 rounded-xl bg-slate-50 p-3 text-xs font-semibold text-slate-500">
          <div v-for="warning in draft.result.warnings" :key="warning">{{ warning }}</div>
        </div>
      </div>

      <div v-if="!loadingDrafts && !drafts.length" class="rounded-2xl border border-dashed border-slate-200 bg-white/70 p-6 text-center text-sm font-bold text-slate-400">
        尚無本場錄音草稿
      </div>
    </div>

    <div class="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
      <div class="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h4 class="text-sm font-black text-slate-800">手動逐局文字備援</h4>
          <p class="mt-0.5 text-xs font-semibold text-slate-400">沒有麥克風或 AI 失敗時，可先把聽打文字放進同一個套用流程</p>
        </div>
        <el-tag size="small" effect="plain" class="font-bold">{{ manualInning || currentInning }}</el-tag>
      </div>
      <el-input v-model="manualText" type="textarea" :autosize="{ minRows: 3, maxRows: 8 }" placeholder="例如：陳奕樺 一安&#10;陳奕樺 回來得分" />
      <div class="mt-2 flex justify-end">
        <el-button type="primary" plain class="font-bold" @click="applyManualText">套用手動文字</el-button>
      </div>
    </div>
  </section>
</template>
