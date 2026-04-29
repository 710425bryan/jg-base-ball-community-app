// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MatchAudioRecorder from '../MatchAudioRecorder.vue'

const storeMock = vi.hoisted(() => ({
  drafts: [] as any[],
  listMatchAudioDrafts: vi.fn(async () => [] as any[]),
  getMatchAudioDraftChunks: vi.fn(async () => [] as Blob[]),
  updateMatchAudioDraft: vi.fn(async (_draftId: string, updater: (draft: any) => any) => updater({})),
  deleteMatchAudioDraft: vi.fn(async () => undefined),
  saveMatchAudioDraft: vi.fn(async () => undefined),
  addMatchAudioDraftChunk: vi.fn(async () => undefined),
  createMatchAudioDraftId: vi.fn(() => 'draft-new'),
}))

vi.mock('@/utils/matchAudioDraftStore', () => ({
  listMatchAudioDrafts: storeMock.listMatchAudioDrafts,
  getMatchAudioDraftChunks: storeMock.getMatchAudioDraftChunks,
  updateMatchAudioDraft: storeMock.updateMatchAudioDraft,
  deleteMatchAudioDraft: storeMock.deleteMatchAudioDraft,
  saveMatchAudioDraft: storeMock.saveMatchAudioDraft,
  addMatchAudioDraftChunk: storeMock.addMatchAudioDraftChunk,
  createMatchAudioDraftId: storeMock.createMatchAudioDraftId,
}))

vi.mock('@/services/matchAudioApi', () => ({
  transcribeMatchAudio: vi.fn(),
}))

const ElButtonStub = {
  props: ['disabled'],
  emits: ['click'],
  template: '<button :disabled="disabled" @click="$emit(\'click\')"><slot /></button>',
}

const mountRecorder = async () => {
  const wrapper = mount(MatchAudioRecorder, {
    props: {
      scopeId: 'match-1',
      currentInning: '一上',
      matchId: 'match-1',
      matchName: '測試賽',
      opponent: '對手',
      matchDate: '2026-04-29',
      batFirst: true,
      isOffensiveHalf: true,
      roster: [
        { name: '王小明', number: '10' },
        { name: '李投手', number: '12' },
      ],
    },
    global: {
      stubs: {
        ElButton: ElButtonStub,
        ElTag: { props: ['type'], template: '<span><slot /></span>' },
        ElIcon: { template: '<span><slot /></span>' },
        ElInput: { props: ['modelValue'], template: '<textarea :value="modelValue"></textarea>' },
        ElSelect: { template: '<select><slot /></select>' },
        ElOption: { props: ['label'], template: '<option>{{ label }}</option>' },
        Check: true,
        Delete: true,
        Document: true,
        Loading: true,
        Upload: true,
        VideoCamera: true,
      },
    },
  })

  await flushPromises()
  return wrapper
}

describe('MatchAudioRecorder', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    storeMock.listMatchAudioDrafts.mockResolvedValue([])
  })

  it('shows recording fallback and empty draft state', async () => {
    storeMock.listMatchAudioDrafts.mockResolvedValueOnce([])
    const wrapper = await mountRecorder()

    expect(wrapper.text()).toContain('半局錄音轉逐局轉播')
    expect(wrapper.text()).toContain('目前瀏覽器無法直接錄音')
    expect(wrapper.text()).toContain('尚無本場錄音草稿')
    expect(wrapper.text()).toContain('手動逐局文字備援')
  })

  it('renders processing, unresolved, and applied draft states', async () => {
    storeMock.listMatchAudioDrafts.mockResolvedValue([
      {
        id: 'draft-processing',
        scopeId: 'match-1',
        inning: '一上',
        mimeType: 'audio/webm',
        status: 'processing',
        chunkCount: 2,
        durationMs: 12000,
        createdAt: '2026-04-29T01:00:00.000Z',
        updatedAt: '2026-04-29T01:00:00.000Z',
      },
      {
        id: 'draft-transcribed',
        scopeId: 'match-1',
        inning: '一下',
        mimeType: 'audio/webm',
        status: 'transcribed',
        chunkCount: 1,
        durationMs: 5000,
        transcript: '疑似小明一安',
        result: {
          transcript: '疑似小明一安',
          suggestedLog: '一安',
          summary: '待確認打者',
          warnings: ['音訊人名不清楚'],
          events: [
            { playerName: '', rawPlayerName: '疑似小明', action: '一安', detail: '', unknownNames: ['疑似小明'], confidence: 0.4 },
          ],
          unresolvedPlayers: [
            { rawName: '疑似小明', reason: 'AI 標記為待確認人名', suggestedPlayers: ['王小明'] },
          ],
        },
        createdAt: '2026-04-29T01:00:00.000Z',
        updatedAt: '2026-04-29T01:00:00.000Z',
      },
      {
        id: 'draft-applied',
        scopeId: 'match-1',
        inning: '二上',
        mimeType: 'audio/webm',
        status: 'applied',
        chunkCount: 1,
        durationMs: 8000,
        transcript: '王小明四壞',
        result: {
          transcript: '王小明四壞',
          suggestedLog: '王小明 四壞',
          summary: '已套用',
          warnings: [],
          events: [
            { playerName: '王小明', rawPlayerName: '', action: '四壞', detail: '', unknownNames: [], confidence: 0.9 },
          ],
          unresolvedPlayers: [],
        },
        createdAt: '2026-04-29T01:00:00.000Z',
        updatedAt: '2026-04-29T01:00:00.000Z',
      },
    ])

    const wrapper = await mountRecorder()

    expect(wrapper.text()).toContain('AI 處理中')
    expect(wrapper.text()).toContain('待套用')
    expect(wrapper.text()).toContain('已套用')
    expect(wrapper.text()).toContain('待確認人名')
    expect(wrapper.text()).toContain('疑似小明')
    expect(wrapper.text()).toContain('只保留文字，不進統計')
  })
})
