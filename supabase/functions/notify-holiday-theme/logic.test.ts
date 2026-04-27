import { describe, expect, it } from 'vitest'

import {
  buildHolidayThemePushPayload,
  getDueHolidayThemeActivities,
  markHolidayThemeActivitiesNotified,
  normalizeHolidayThemeNotificationConfig,
  parseHolidayThemeDateTime,
} from './logic'

describe('notify-holiday-theme logic', () => {
  it('wraps legacy single-theme config into a v2 activities array with notify disabled by default', () => {
    const config = normalizeHolidayThemeNotificationConfig({
      enabled: true,
      scheduleEnabled: true,
      scheduleStartAt: '2026-05-11T08:00:00',
      activeTheme: 'mothers_day',
      title: 'Legacy theme',
      messages: ['legacy message'],
    })

    expect(config.version).toBe(2)
    expect(config.activities).toHaveLength(1)
    expect(config.activities[0]).toMatchObject({
      activeTheme: 'mothers_day',
      notifyOnStart: false,
      title: 'Legacy theme',
      messages: ['legacy message'],
    })
  })

  it('treats legacy local datetime strings as Asia/Taipei absolute times', () => {
    const parsed = parseHolidayThemeDateTime('2026-05-11T08:00:00')

    expect(parsed?.toISOString()).toBe('2026-05-11T00:00:00.000Z')
  })

  it('returns only activities that are due and not already auto-sent', () => {
    const dueActivities = getDueHolidayThemeActivities(
      {
        version: 2,
        activities: [
          {
            id: 'a1',
            activeTheme: 'player_mvp',
            scheduleEnabled: true,
            scheduleStartAt: '2026-05-11T08:00:00',
            scheduleEndAt: '2026-05-11T18:00:00',
            title: 'MVP Night',
            messages: ['MVP celebration is live'],
            notifyOnStart: true,
            notificationAutoSentAt: null,
          },
          {
            id: 'a2',
            activeTheme: 'player_first_hit',
            scheduleEnabled: true,
            scheduleStartAt: '2026-05-11T09:00:00',
            scheduleEndAt: '2026-05-11T18:00:00',
            title: 'First hit',
            messages: ['First hit celebration'],
            notifyOnStart: true,
            notificationAutoSentAt: '2026-05-11T01:05:00Z',
          },
          {
            id: 'a3',
            activeTheme: 'mothers_day',
            scheduleEnabled: false,
            scheduleStartAt: null,
            scheduleEndAt: null,
            title: 'Mothers Day',
            messages: ['Celebrate today'],
            notifyOnStart: true,
            notificationAutoSentAt: null,
          },
        ],
      },
      new Date('2026-05-11T00:05:00Z')
    )

    expect(dueActivities.map((activity) => activity.id)).toEqual(['a1'])
  })

  it('marks notified activities without changing unrelated items or extra fields', () => {
    const nextConfig = markHolidayThemeActivitiesNotified(
      {
        version: 2,
        activities: [
          {
            id: 'a1',
            activeTheme: 'mothers_day',
            scheduleEnabled: true,
            scheduleStartAt: '2026-05-11T00:00:00Z',
            scheduleEndAt: null,
            title: 'Mothers Day',
            messages: ['Celebrate today'],
            notifyOnStart: true,
            notificationAutoSentAt: null,
          },
          {
            id: 'a2',
            activeTheme: 'player_mvp',
            scheduleEnabled: true,
            scheduleStartAt: '2026-05-11T00:30:00Z',
            scheduleEndAt: null,
            title: 'MVP',
            messages: ['Player MVP'],
            ribbonMessages: ['Banner MVP'],
            palette: 'player_mvp',
            motionPreset: 'fireworks_champion',
            notifyOnStart: true,
            notificationAutoSentAt: null,
          },
        ],
      },
      ['a2'],
      '2026-05-11T00:31:00Z'
    )

    expect(nextConfig.activities[0].notificationAutoSentAt).toBeNull()
    expect(nextConfig.activities[1].notificationAutoSentAt).toBe('2026-05-11T00:31:00Z')
    expect(nextConfig.activities[1]).toMatchObject({
      ribbonMessages: ['Banner MVP'],
      palette: 'player_mvp',
      motionPreset: 'fireworks_champion',
    })
  })

  it('builds a push payload from the activity title and first message', () => {
    const payload = buildHolidayThemePushPayload({
      activeTheme: 'player_first_hit',
      title: 'Player One First Hit',
      messages: ['The first hit celebration is live now', 'Fallback line'],
    })

    expect(payload).toEqual({
      title: 'Player One First Hit',
      body: 'The first hit celebration is live now',
      url: '/',
    })
  })
})
