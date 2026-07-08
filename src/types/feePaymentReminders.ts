import type {
  FeePaymentReminderCategory,
  FeePaymentReminderMode,
  FeePaymentReminderTargetGroup
} from '@/utils/feePaymentReminders'

export {
  FEE_PAYMENT_REMINDER_ACTION,
  FEE_PAYMENT_REMINDER_CATEGORIES,
  FEE_PAYMENT_REMINDER_CATEGORY_LABELS,
  FEE_PAYMENT_REMINDER_URL
} from '@/utils/feePaymentReminders'

export type {
  FeePaymentReminderBillingMode,
  FeePaymentReminderBillingType,
  FeePaymentReminderCategory,
  FeePaymentReminderMemberLike,
  FeePaymentReminderMode,
  FeePaymentReminderPeriodOption,
  FeePaymentReminderTargetGroup,
  FeePaymentReminderTargetInput,
  FeePaymentReminderTargetItem
} from '@/utils/feePaymentReminders'

export type FeePaymentReminderDispatchPayload = {
  mode: FeePaymentReminderMode
  categories: FeePaymentReminderCategory[]
  monthly_period: string
  quarterly_period: string
}

export type FeePaymentReminderDispatchRequest = Omit<FeePaymentReminderDispatchPayload, 'mode'>

export type FeePaymentReminderDispatchResult = {
  success?: boolean
  mode?: FeePaymentReminderMode
  dry_run?: boolean
  monthly_period?: string
  quarterly_period?: string
  categories?: FeePaymentReminderCategory[]
  member_count?: number
  target_user_count?: number
  subscription_count?: number
  total_amount?: number
  created_count?: number
  duplicate_count?: number
  dispatched_count?: number
  expired_count?: number
  failed_count?: number
  provider_counts?: Record<string, number>
  targets?: FeePaymentReminderTargetGroup[]
  error?: string
}
