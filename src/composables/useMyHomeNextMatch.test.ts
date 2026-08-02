import { beforeEach, describe, expect, it, vi } from 'vitest'
import dayjs from 'dayjs'
import { computed, ref } from 'vue'
import { createEmptyMyHomeSnapshot, type MyHomeNextEvent } from '@/types/myHome'

const getMyHomeNextEventMock = vi.hoisted(() => vi.fn())

vi.mock('@/services/myHome', () => ({
  getMyHomeNextEvent: getMyHomeNextEventMock
}))

const member = {
  id: 'member-1',
  name: '小安',
  role: '球員',
  team_group: null,
  status: '在隊',
  jersey_number: '8',
  avatar_url: null
}

const buildEvent = (overrides: Partial<MyHomeNextEvent> = {}): MyHomeNextEvent => ({
  id: 'match-1',
  type: 'match',
  title: '週末友誼賽',
  date: '2026-05-03',
  time: '09:00 - 11:00',
  location: '中港國小',
  opponent: '測試隊',
  category_group: 'U12',
  match_level: '友誼賽',
  coaches: null,
  players: '小安',
  route: '/calendar?match_id=match-1',
  ...overrides
})

const setup = async () => {
  const { useMyHomeNextMatch } = await import('./useMyHomeNextMatch')
  const snapshot = ref({
    ...createEmptyMyHomeSnapshot(),
    members: [member]
  })
  const selectedMemberId = ref(member.id)
  const enabled = ref(true)
  const now = ref(dayjs('2026-05-01T12:00:00'))
  const state = useMyHomeNextMatch({
    snapshot,
    selectedMemberId,
    enabled: computed(() => enabled.value),
    now
  })

  return { ...state, snapshot, selectedMemberId, enabled, now }
}

describe('useMyHomeNextMatch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads a verified selected-member match', async () => {
    getMyHomeNextEventMock.mockResolvedValue(buildEvent())
    const { fetchNextMatch, nextMatch } = await setup()

    await fetchNextMatch()

    expect(getMyHomeNextEventMock).toHaveBeenCalledWith({
      memberId: 'member-1',
      today: '2026-05-01'
    })
    expect(nextMatch.value).toMatchObject({ id: 'match-1' })
  })

  it.each([
    ['training class', buildEvent({ match_level: '特訓課' })],
    ['blank roster', buildEvent({ players: '' })],
    ['another member roster', buildEvent({ players: '小宇' })],
    ['outside seven dates', buildEvent({ date: '2026-05-08' })],
    ['already ended today', buildEvent({ date: '2026-05-01', time: '09:00 - 11:00' })]
  ])('hides an ineligible %s', async (_label, event) => {
    getMyHomeNextEventMock.mockResolvedValue(event)
    const { fetchNextMatch, nextMatch } = await setup()

    expect(await fetchNextMatch()).toBeNull()
    expect(nextMatch.value).toBeNull()
  })

  it('does not query without an enabled linked member', async () => {
    const { fetchNextMatch, selectedMemberId, enabled } = await setup()

    selectedMemberId.value = ''
    expect(await fetchNextMatch()).toBeNull()
    enabled.value = false
    expect(await fetchNextMatch('member-1')).toBeNull()
    expect(getMyHomeNextEventMock).not.toHaveBeenCalled()
  })

  it('keeps the latest selected-member request result', async () => {
    let resolveFirst: ((event: MyHomeNextEvent) => void) | undefined
    getMyHomeNextEventMock
      .mockImplementationOnce(() => new Promise<MyHomeNextEvent>((resolve) => {
        resolveFirst = resolve
      }))
      .mockResolvedValueOnce(buildEvent({ id: 'match-latest' }))
    const { fetchNextMatch, nextMatch } = await setup()

    const firstRequest = fetchNextMatch()
    await fetchNextMatch()
    resolveFirst?.(buildEvent({ id: 'match-stale' }))
    await firstRequest

    expect(nextMatch.value).toMatchObject({ id: 'match-latest' })
  })

  it('hides the card when the RPC fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    getMyHomeNextEventMock.mockRejectedValue(new Error('RPC unavailable'))
    const { fetchNextMatch, nextMatch } = await setup()

    expect(await fetchNextMatch()).toBeNull()
    expect(nextMatch.value).toBeNull()
  })
})
