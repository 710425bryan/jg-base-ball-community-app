import type {
  TrainingManualStatus,
  TrainingPointStatus,
  TrainingRegistrationStatus,
  TrainingSession
} from '@/types/training'

export const TRAINING_MANUAL_STATUS_LABELS: Record<TrainingManualStatus, string> = {
  draft: '草稿',
  open: '開放報名',
  paused: '暫停報名',
  closed: '已關閉',
  finalized: '已結案'
}

export const TRAINING_REGISTRATION_STATUS_LABELS: Record<TrainingRegistrationStatus, string> = {
  applied: '審核中',
  selected: '已錄取',
  waitlisted: '候補',
  rejected: '未錄取',
  cancelled: '已取消'
}

export const TRAINING_POINT_STATUS_LABELS: Record<TrainingPointStatus, string> = {
  none: '未保留',
  reserved: '已保留',
  spent: '已扣點',
  released: '已釋放'
}

export const getTrainingManualStatusLabel = (status?: string | null) =>
  TRAINING_MANUAL_STATUS_LABELS[status as TrainingManualStatus] || '未設定'

export const getTrainingRegistrationStatusLabel = (status?: string | null) =>
  TRAINING_REGISTRATION_STATUS_LABELS[status as TrainingRegistrationStatus] || '尚未報名'

export const getTrainingPointStatusLabel = (status?: string | null) =>
  TRAINING_POINT_STATUS_LABELS[status as TrainingPointStatus] || '未保留'

export const isActiveTrainingRegistrationStatus = (status?: string | null) =>
  status === 'applied' || status === 'selected' || status === 'waitlisted'

export const canSubmitTrainingRegistration = (
  session: Pick<
    TrainingSession,
    | 'session_id'
    | 'is_registration_open'
    | 'is_blocked'
    | 'point_cost'
    | 'registration_status'
  >,
  availablePoints: number
) => {
  if (!session.session_id) return false
  if (!session.is_registration_open) return false
  if (session.is_blocked) return false
  if (isActiveTrainingRegistrationStatus(session.registration_status)) return false
  return availablePoints >= Math.max(0, Number(session.point_cost || 0))
}

export const getTrainingRegistrationBlockReason = (
  session: Pick<
    TrainingSession,
    | 'session_id'
    | 'manual_status'
    | 'is_registration_open'
    | 'is_blocked'
    | 'block_reason'
    | 'point_cost'
    | 'registration_status'
  >,
  availablePoints: number
) => {
  if (!session.session_id) return '尚未建立特訓報名設定'
  if (isActiveTrainingRegistrationStatus(session.registration_status)) return '已報名這場特訓'
  if (session.is_blocked) return session.block_reason || '上次特訓未到，下一場暫停報名'
  if (session.manual_status === 'paused') return '教練已暫停報名'
  if (session.manual_status === 'closed') return '報名已關閉'
  if (session.manual_status === 'finalized') return '特訓已結案'
  if (!session.is_registration_open) return '目前不在報名時間內'
  if (availablePoints < Math.max(0, Number(session.point_cost || 0))) return '點數不足'
  return ''
}

export const normalizeTrainingSelectedMembers = (value: unknown) => {
  if (!Array.isArray(value)) return []
  return value.map((item: any) => ({
    member_id: String(item?.member_id || ''),
    name: String(item?.name || ''),
    role: item?.role ? String(item.role) : null,
    team_group: item?.team_group ? String(item.team_group) : null,
    jersey_number: item?.jersey_number ?? null
  })).filter((item) => item.member_id && item.name)
}
