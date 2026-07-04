import { parseEventTimeMinutes } from './attendanceLeave'

export const DEFAULT_TRAINING_LOCATION_LEAVE_START_TIME = '09:00'
export const DEFAULT_TRAINING_LOCATION_LEAVE_END_TIME = '12:00'

const MORNING_END_MINUTES = 12 * 60
const MORNING_SETTLE_END_MINUTES = 12 * 60 + 30

type TrainingLocationLeaveTimeSource = {
  start_time?: string | null
  end_time?: string | null
}

const normalizeTrainingLocationTime = (value: unknown) =>
  String(value ?? '').trim()

const shouldClampMorningTrainingEnd = (startTime: string, endTime: string) => {
  const startMinutes = parseEventTimeMinutes(startTime)[0]
  const endMinutes = parseEventTimeMinutes(endTime)[0]

  return startMinutes !== undefined
    && endMinutes !== undefined
    && startMinutes < MORNING_END_MINUTES
    && endMinutes > MORNING_END_MINUTES
    && endMinutes <= MORNING_SETTLE_END_MINUTES
}

export const buildTrainingLocationLeaveEventTimeText = (
  location: TrainingLocationLeaveTimeSource
) => {
  const startTime = normalizeTrainingLocationTime(location.start_time)
  const endTime = normalizeTrainingLocationTime(location.end_time)

  if (startTime && endTime) {
    if (shouldClampMorningTrainingEnd(startTime, endTime)) {
      return `${startTime} - ${DEFAULT_TRAINING_LOCATION_LEAVE_END_TIME}`
    }

    return `${startTime} - ${endTime}`
  }

  if (startTime) return startTime
  if (endTime) {
    if (shouldClampMorningTrainingEnd(DEFAULT_TRAINING_LOCATION_LEAVE_START_TIME, endTime)) {
      return `${DEFAULT_TRAINING_LOCATION_LEAVE_START_TIME} - ${DEFAULT_TRAINING_LOCATION_LEAVE_END_TIME}`
    }

    return `${DEFAULT_TRAINING_LOCATION_LEAVE_START_TIME} - ${endTime}`
  }

  return `${DEFAULT_TRAINING_LOCATION_LEAVE_START_TIME} - ${DEFAULT_TRAINING_LOCATION_LEAVE_END_TIME}`
}
