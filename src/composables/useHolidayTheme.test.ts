// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest'

const supabaseMocks = vi.hoisted(() => {
  const rpc = vi.fn()

  return { rpc }
})

vi.mock('@/services/supabase', () => ({
  supabase: {
    rpc: supabaseMocks.rpc,
  },
}))

import {
  buildHolidayThemeDisplayState,
  buildHolidayThemeNotificationPayload,
  fetchHolidayThemeConfig,
  normalizeHolidayThemeActivity,
  normalizeHolidayThemeConfig,
  parseHolidayThemeDateTime,
} from './useHolidayTheme'

describe('useHolidayTheme', () => {
  beforeEach(() => {
    supabaseMocks.rpc.mockReset()
  })

  it('upgrades legacy single-theme config into a v2 activities array', () => {
    const config = normalizeHolidayThemeConfig({
      enabled: true,
      activeTheme: 'mothers_day',
      title: '',
      messages: [],
      palette: 'mothers_day',
      motionPreset: 'soft_petals',
      showGlobalRibbon: true,
    })

    expect(config.version).toBe(2)
    expect(config.activities).toHaveLength(1)
    expect(config.activeActivity).toMatchObject({
      enabled: true,
      manualEnabled: true,
      activeTheme: 'mothers_day',
      palette: 'mothers_day',
      motionPreset: 'soft_petals',
      showGlobalRibbon: true,
    })
    expect(config.activeActivity.messages.length).toBeGreaterThan(0)
  })

  it('returns no active activity for unsupported legacy theme input', () => {
    const config = normalizeHolidayThemeConfig({
      enabled: true,
      activeTheme: 'valentines_day',
      messages: ['hello'],
    })

    expect(config.enabled).toBe(false)
    expect(config.activities).toEqual([])
    expect(config.activeActivity).toMatchObject({
      enabled: false,
      activeTheme: null,
      title: '',
      messages: [],
    })
  })

  it('maps legacy combined coaches birthday theme to coach dai birthday', () => {
    const config = normalizeHolidayThemeConfig({
      enabled: true,
      activeTheme: 'coaches_birthday',
      palette: 'coaches_birthday',
      messages: ['Legacy coach birthday'],
    })

    expect(config.activeActivity).toMatchObject({
      enabled: true,
      activeTheme: 'coach_dai_birthday',
      palette: 'coach_dai_birthday',
      messages: ['Legacy coach birthday'],
    })
  })

  it('picks the first enabled activity when multiple schedules overlap', () => {
    const config = normalizeHolidayThemeConfig(
      {
        version: 2,
        activities: [
          {
            id: 'first',
            scheduleEnabled: true,
            scheduleStartAt: '2026-05-01T08:00:00',
            scheduleEndAt: '2026-05-10T23:59:00',
            activeTheme: 'player_mvp',
            playerId: 'p1',
            playerName: 'Player One',
            title: 'First active activity',
            messages: ['First wins'],
          },
          {
            id: 'second',
            scheduleEnabled: true,
            scheduleStartAt: '2026-05-02T08:00:00',
            scheduleEndAt: '2026-05-10T23:59:00',
            activeTheme: 'mothers_day',
            title: 'Second active activity',
            messages: ['Second wins'],
          },
        ],
      },
      { now: new Date('2026-05-03T04:00:00Z') }
    )

    expect(config.activeActivityId).toBe('first')
    expect(config.activeActivity.title).toBe('First active activity')
  })

  it('treats legacy datetime strings as Asia/Taipei absolute times', () => {
    const parsed = parseHolidayThemeDateTime('2026-05-01T08:00:00')
    expect(parsed?.toISOString()).toBe('2026-05-01T00:00:00.000Z')
  })

  it('builds player theme defaults with the selected player name', () => {
    const activity = normalizeHolidayThemeActivity({
      activeTheme: 'player_first_hit',
      playerId: 'p9',
      playerName: 'Player Nine',
      title: '',
      messages: [],
    })

    expect(activity.title).toContain('Player Nine')
    expect(activity.messages[0]).toContain('Player Nine')
  })

  it('normalizes legacy fireworks motion presets into the gold fireworks style', () => {
    const activity = normalizeHolidayThemeActivity({
      activeTheme: 'mothers_day',
      title: 'Fireworks Night',
      messages: ['Celebrate together'],
      motionPreset: 'fireworks_burst',
    })

    expect(activity.motionPreset).toBe('fireworks_gold')
  })

  it('keeps the new fireworks variants when normalizing activities', () => {
    const activity = normalizeHolidayThemeActivity({
      activeTheme: 'mothers_day',
      title: 'Champion Night',
      messages: ['Celebrate together'],
      motionPreset: 'fireworks_champion',
    })

    expect(activity.motionPreset).toBe('fireworks_champion')
  })

  it('keeps the snowfall preset when normalizing activities', () => {
    const activity = normalizeHolidayThemeActivity({
      activeTheme: 'mothers_day',
      title: 'Winter Morning',
      messages: ['Snow keeps drifting over the field.'],
      motionPreset: 'snowfall_drift',
    })

    expect(activity.motionPreset).toBe('snowfall_drift')
  })

  it('uses custom ribbon messages for the ribbon while keeping hero messages for notifications', () => {
    const activity = normalizeHolidayThemeActivity({
      manualEnabled: true,
      activeTheme: 'player_mvp',
      playerId: 'p1',
      playerName: 'Player One',
      title: 'Player One MVP',
      ribbonTitle: '首安時刻祝福',
      messages: ['Hero celebration copy'],
      ribbonMessages: ['Ribbon copy one', 'Ribbon copy two'],
    })

    const displayState = buildHolidayThemeDisplayState(activity)
    const payload = buildHolidayThemeNotificationPayload(activity)

    expect(displayState.ribbonTitle).toBe('首安時刻祝福')
    expect(displayState.ribbonMessages).toEqual(['Ribbon copy one', 'Ribbon copy two'])
    expect(displayState.ribbonMessage).toBe('Ribbon copy one')
    expect(displayState.messages).toEqual(['Hero celebration copy'])
    expect(payload.body).toBe('Hero celebration copy')
  })

  it('falls back to a generated ribbon title when custom ribbon title is not provided', () => {
    const activity = normalizeHolidayThemeActivity({
      manualEnabled: true,
      activeTheme: 'player_first_hit',
      playerId: 'p1',
      playerName: 'Player One',
      title: 'Player One First Hit',
      messages: ['Hero celebration copy'],
    })

    const displayState = buildHolidayThemeDisplayState(activity)

    expect(displayState.ribbonTitle).toContain('祝福')
    expect(displayState.ribbonTitle.length).toBeGreaterThan(2)
  })

  it('builds push payload from the resolved theme title and first message', () => {
    const payload = buildHolidayThemeNotificationPayload({
      activeTheme: 'player_mvp',
      playerId: 'p1',
      playerName: 'Player One',
      title: 'Player One MVP',
      messages: ['Hero celebration copy'],
    })

    expect(payload).toEqual({
      title: 'Player One MVP',
      body: 'Hero celebration copy',
      url: '/',
    })
  })

  it('fetches and normalizes v2 holiday config from the public RPC', async () => {
    supabaseMocks.rpc.mockResolvedValue({
      data: {
        version: 2,
        activities: [
          {
            id: 'graduation-1',
            manualEnabled: true,
            scheduleEnabled: true,
            scheduleStartAt: '2026-06-01T00:00:00Z',
            scheduleEndAt: '2026-06-30T15:59:00Z',
            activeTheme: 'player_graduation',
            title: 'Graduation theme',
            ribbonTitle: 'Graduation banner',
            messages: ['Graduation copy one', 'Graduation copy two'],
            ribbonMessages: ['Banner copy one'],
            palette: 'player_graduation',
            motionPreset: 'gentle_glow',
            showGlobalRibbon: true,
            notifyOnStart: true,
          },
        ],
      },
      error: null,
    })

    const config = await fetchHolidayThemeConfig({ force: true })

    expect(supabaseMocks.rpc).toHaveBeenCalledWith('get_public_holiday_theme_config')
    expect(config).toMatchObject({
      version: 2,
      enabled: true,
      activeActivityId: 'graduation-1',
    })
    expect(config.activeActivity).toMatchObject({
      activeTheme: 'player_graduation',
      title: 'Graduation theme',
      ribbonTitle: 'Graduation banner',
      messages: ['Graduation copy one', 'Graduation copy two'],
      ribbonMessages: ['Banner copy one'],
      palette: 'player_graduation',
      motionPreset: 'gentle_glow',
      showGlobalRibbon: true,
      notifyOnStart: true,
    })
  })
})
