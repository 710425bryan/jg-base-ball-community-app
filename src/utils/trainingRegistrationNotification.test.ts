import { describe, expect, it } from 'vitest'
import {
  buildTrainingRegistrationNotificationBody,
  buildTrainingRegistrationNotificationEventKey,
  buildTrainingRegistrationNotificationTitle,
  buildTrainingRegistrationNotificationUrl,
  hasRemainingTrainingRegistrationSlots,
  isTrainingRegistrationDeadlineReminderDue,
  type TrainingRegistrationNotificationSession
} from './trainingRegistrationNotification'

const buildSession = (
  overrides: Partial<TrainingRegistrationNotificationSession> = {}
): TrainingRegistrationNotificationSession => ({
  session_id: 'session-1',
  match_id: 'match-1',
  match_name: '五月特訓課',
  match_date: '2026-05-02',
  match_time: '09:00 - 11:00',
  location: '中港國小',
  registration_start_at: '2026-04-30T01:00:00.000Z',
  registration_end_at: '2026-05-01T15:30:00.000Z',
  point_cost: 1,
  capacity: 20,
  selected_count: 12,
  ...overrides
})

describe('trainingRegistrationNotification', () => {
  it('builds stable event keys and target urls', () => {
    const session = buildSession()

    expect(buildTrainingRegistrationNotificationEventKey(session))
      .toBe('training_registration_open:session-1:2026-04-30T01:00:00.000Z')
    expect(buildTrainingRegistrationNotificationEventKey(session, 'deadline_reminder'))
      .toBe('training_registration_deadline:session-1:2026-05-01T15:30:00.000Z')
    expect(buildTrainingRegistrationNotificationUrl(session)).toBe('/training?session_id=session-1')
  })

  it('builds notification title and body for registration opening', () => {
    const session = buildSession()

    expect(buildTrainingRegistrationNotificationTitle(session)).toBe('特訓課開放報名：五月特訓課')
    expect(buildTrainingRegistrationNotificationBody(session)).toBe([
      '課程：五月特訓課',
      '日期：2026-05-02',
      '時間：09:00 - 11:00',
      '地點：中港國小',
      '報名截止：2026-05-01 23:30',
      '扣點：1 點',
      '名額：20 人'
    ].join('\n'))
  })

  it('builds deadline reminder copy with remaining slots', () => {
    const session = buildSession()

    expect(buildTrainingRegistrationNotificationTitle(session, 'deadline_reminder'))
      .toBe('特訓課報名即將截止：五月特訓課')
    expect(buildTrainingRegistrationNotificationBody(session, 'deadline_reminder')).toBe([
      '課程：五月特訓課',
      '日期：2026-05-02',
      '時間：09:00 - 11:00',
      '地點：中港國小',
      '報名截止：2026-05-01 23:30',
      '扣點：1 點',
      '名額：20 人',
      '剩餘名額：8 人'
    ].join('\n'))
  })

  it('detects deadline reminder window and remaining slots', () => {
    const session = buildSession({
      registration_end_at: '2026-05-08T10:00:00.000Z',
      capacity: 16,
      selected_count: 15
    })

    expect(isTrainingRegistrationDeadlineReminderDue(
      session,
      new Date('2026-05-07T10:00:00.000Z')
    )).toBe(true)
    expect(isTrainingRegistrationDeadlineReminderDue(
      session,
      new Date('2026-05-07T09:59:59.000Z')
    )).toBe(false)
    expect(hasRemainingTrainingRegistrationSlots(session)).toBe(true)
    expect(hasRemainingTrainingRegistrationSlots({ capacity: 16, selected_count: 16 })).toBe(false)
    expect(hasRemainingTrainingRegistrationSlots({ capacity: null, selected_count: 99 })).toBe(true)
  })

  it('falls back when optional fields are empty', () => {
    expect(buildTrainingRegistrationNotificationBody(buildSession({
      match_time: '',
      location: null,
      registration_end_at: null,
      capacity: null
    }))).toContain('名額：不限')
  })
})
