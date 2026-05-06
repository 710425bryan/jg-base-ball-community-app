import {
  createEmptyFeeManagementReminderSnapshot,
  FEE_MANAGEMENT_REMINDER_KINDS,
  type FeeManagementReminderItem,
  type FeeManagementReminderKind,
  type FeeManagementReminderSeverity,
  type FeeManagementReminderSnapshot
} from '@/types/feeManagementReminders'

const FALLBACK_CREATED_AT = '1970-01-01T00:00:00.000Z'
const VALID_SEVERITIES = new Set<FeeManagementReminderSeverity>(['urgent', 'warning', 'info'])
const VALID_KINDS = new Set<FeeManagementReminderKind>(FEE_MANAGEMENT_REMINDER_KINDS)

const ensureObject = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  return value as Record<string, unknown>
}

const ensureArray = (value: unknown): unknown[] => Array.isArray(value) ? value : []

const normalizeText = (value: unknown, fallback: string) => {
  if (typeof value !== 'string') {
    return fallback
  }

  const normalized = value.trim()
  return normalized.length > 0 ? normalized : fallback
}

const normalizeNumber = (value: unknown) => {
  const normalized = Number(value)
  return Number.isFinite(normalized) ? Math.max(0, normalized) : 0
}

const normalizeKind = (value: unknown): FeeManagementReminderKind | null => {
  if (typeof value !== 'string') {
    return null
  }

  return VALID_KINDS.has(value as FeeManagementReminderKind)
    ? value as FeeManagementReminderKind
    : null
}

const normalizeSeverity = (value: unknown): FeeManagementReminderSeverity => {
  if (typeof value === 'string' && VALID_SEVERITIES.has(value as FeeManagementReminderSeverity)) {
    return value as FeeManagementReminderSeverity
  }

  return 'info'
}

export const normalizeFeeManagementReminderItem = (
  item: unknown
): FeeManagementReminderItem | null => {
  const row = ensureObject(item)
  const kind = normalizeKind(row.kind)

  if (!kind) {
    return null
  }

  const id = normalizeText(row.id, kind)
  const title = normalizeText(row.title, '收費待辦提醒')
  const body = normalizeText(row.body, '收費管理有待處理事項。')
  const count = normalizeNumber(row.count)

  if (count <= 0) {
    return null
  }

  return {
    id,
    kind,
    title,
    body,
    count,
    amount: normalizeNumber(row.amount),
    severity: normalizeSeverity(row.severity),
    link: kind === 'equipmentUnpaid'
      ? '/fees?tab=equipment&section=equipment-unpaid'
      : normalizeText(row.link, '/fees'),
    created_at: normalizeText(row.created_at, FALLBACK_CREATED_AT)
  }
}

export const normalizeFeeManagementReminderSnapshot = (
  payload: unknown
): FeeManagementReminderSnapshot => {
  const snapshot = ensureObject(payload)
  const items = ensureArray(snapshot.items)
    .map(normalizeFeeManagementReminderItem)
    .filter((item): item is FeeManagementReminderItem => Boolean(item))

  const fallbackTotalCount = items.reduce((total, item) => total + item.count, 0)
  const fallbackTotalAmount = items.reduce((total, item) => total + item.amount, 0)

  return {
    ...createEmptyFeeManagementReminderSnapshot(),
    items,
    total_count: normalizeNumber(snapshot.total_count) || fallbackTotalCount,
    total_amount: normalizeNumber(snapshot.total_amount) || fallbackTotalAmount,
    generated_at: typeof snapshot.generated_at === 'string' ? snapshot.generated_at : null,
    monthly_period: typeof snapshot.monthly_period === 'string' ? snapshot.monthly_period : null,
    quarterly_period: typeof snapshot.quarterly_period === 'string' ? snapshot.quarterly_period : null
  }
}
