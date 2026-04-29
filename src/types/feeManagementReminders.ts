export const FEE_MANAGEMENT_REMINDER_KINDS = [
  'profilePaymentPending',
  'equipmentPaymentPending',
  'equipmentRequestPending',
  'equipmentRequestInProgress',
  'monthlyUnpaid',
  'quarterlyUnpaid',
  'equipmentUnpaid'
] as const

export type FeeManagementReminderKind = typeof FEE_MANAGEMENT_REMINDER_KINDS[number]

export type FeeManagementReminderSeverity = 'urgent' | 'warning' | 'info'

export type FeeManagementReminderItem = {
  id: string
  kind: FeeManagementReminderKind
  title: string
  body: string
  count: number
  amount: number
  severity: FeeManagementReminderSeverity
  link: string
  created_at: string
}

export type FeeManagementReminderSnapshot = {
  items: FeeManagementReminderItem[]
  total_count: number
  total_amount: number
  generated_at: string | null
  monthly_period: string | null
  quarterly_period: string | null
}

export const createEmptyFeeManagementReminderSnapshot = (): FeeManagementReminderSnapshot => ({
  items: [],
  total_count: 0,
  total_amount: 0,
  generated_at: null,
  monthly_period: null,
  quarterly_period: null
})
