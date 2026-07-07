export const ROLE_DEFAULT_FEE_BILLING_MODE = 'role_default'
export const FIXED_MONTHLY_FEE_BILLING_MODE = 'monthly_fixed'
export const MONTHLY_PER_SESSION_FEE_BILLING_MODE = 'monthly_per_session'
export const NO_FEE_BILLING_MODE = 'no_fee'
export const DEFAULT_FIXED_MONTHLY_FEE = 2000
export const XINTAI_FIXED_MONTHLY_TRAINING_PROGRAM_KEY = 'junior_high_school_team'

export type MemberFeeBillingMode =
  | typeof ROLE_DEFAULT_FEE_BILLING_MODE
  | typeof FIXED_MONTHLY_FEE_BILLING_MODE
  | typeof MONTHLY_PER_SESSION_FEE_BILLING_MODE
  | typeof NO_FEE_BILLING_MODE

export type EffectivePaymentBillingMode = 'monthly' | 'quarterly' | 'none'
export type MonthlyFeeCalculationType = 'per_session' | 'monthly_fixed'

export type BillingModeMember = {
  role?: string | null
  fee_billing_mode?: string | null
  training_program?: string | null
}

const normalizeTrainingProgramKeyForBilling = (value?: string | null) =>
  String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_:-]+/g, '_')
    .replace(/^_+|_+$/g, '')

export const normalizeMemberFeeBillingMode = (value?: string | null): MemberFeeBillingMode =>
  value === FIXED_MONTHLY_FEE_BILLING_MODE ||
  value === MONTHLY_PER_SESSION_FEE_BILLING_MODE ||
  value === NO_FEE_BILLING_MODE
    ? value
    : ROLE_DEFAULT_FEE_BILLING_MODE

export const isNoFeeBillingMember = (member: BillingModeMember) =>
  (member.role === '球員' || member.role === '校隊') &&
  normalizeMemberFeeBillingMode(member.fee_billing_mode) === NO_FEE_BILLING_MODE

export const isXintaiFixedMonthlyBillingMember = (member: BillingModeMember) =>
  member.role === '校隊' &&
  normalizeMemberFeeBillingMode(member.fee_billing_mode) !== NO_FEE_BILLING_MODE &&
  normalizeTrainingProgramKeyForBilling(member.training_program) === XINTAI_FIXED_MONTHLY_TRAINING_PROGRAM_KEY

export const isFixedMonthlyBillingMember = (member: BillingModeMember) =>
  (member.role === '球員' && normalizeMemberFeeBillingMode(member.fee_billing_mode) === FIXED_MONTHLY_FEE_BILLING_MODE) ||
  isXintaiFixedMonthlyBillingMember(member)

export const isMonthlyPerSessionBillingMember = (member: BillingModeMember) =>
  member.role === '球員' &&
  normalizeMemberFeeBillingMode(member.fee_billing_mode) === MONTHLY_PER_SESSION_FEE_BILLING_MODE

export const getEffectivePaymentBillingMode = (
  member: BillingModeMember
): EffectivePaymentBillingMode | null => {
  if (isNoFeeBillingMember(member)) return 'none'
  if (member.role === '校隊') return 'monthly'
  if (isFixedMonthlyBillingMember(member)) return 'monthly'
  if (isMonthlyPerSessionBillingMember(member)) return 'monthly'
  if (member.role === '球員') return 'quarterly'
  return null
}

export const isMonthlyBillingMember = (member: BillingModeMember) =>
  getEffectivePaymentBillingMode(member) === 'monthly'

export const isQuarterlyBillingMember = (member: BillingModeMember) =>
  getEffectivePaymentBillingMode(member) === 'quarterly'

export const getMonthlyFeeCalculationType = (member: BillingModeMember): MonthlyFeeCalculationType =>
  isFixedMonthlyBillingMember(member) ? 'monthly_fixed' : 'per_session'

export const isPerSessionMonthlyBillingMember = (member: BillingModeMember) =>
  isMonthlyBillingMember(member) && getMonthlyFeeCalculationType(member) === 'per_session'

export const normalizeFixedMonthlyFee = (
  value: unknown,
  fallback = DEFAULT_FIXED_MONTHLY_FEE
) => {
  if (value === null || value === undefined || value === '') {
    return Math.max(0, Math.trunc(Number(fallback) || DEFAULT_FIXED_MONTHLY_FEE))
  }

  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return Math.max(0, Math.trunc(Number(fallback) || DEFAULT_FIXED_MONTHLY_FEE))
  }

  return Math.max(0, Math.trunc(parsed))
}

export const calculateFixedMonthlyPayableAmount = (
  fixedMonthlyFee: unknown,
  deductionAmount: unknown
) => normalizeFixedMonthlyFee(fixedMonthlyFee) - (Number(deductionAmount) || 0)

export const calculatePerSessionMonthlyPayableAmount = (
  totalSessions: unknown,
  leaveSessions: unknown,
  perSessionFee: unknown,
  deductionAmount: unknown
) => {
  const attendedSessions = Math.max(0, (Number(totalSessions) || 0) - (Number(leaveSessions) || 0))
  return attendedSessions * (Number(perSessionFee) || 0) - (Number(deductionAmount) || 0)
}

export const calculateDiscountedPerSessionFee = (
  perSessionFee: unknown,
  isDiscounted: boolean
) => {
  const normalizedFee = Math.max(0, Math.trunc(Number(perSessionFee) || 0))

  return isDiscounted ? Math.round(normalizedFee / 2) : normalizedFee
}

export const getMemberBillingLabel = (member: BillingModeMember) => {
  if (isNoFeeBillingMember(member)) return '不收費'
  if (isXintaiFixedMonthlyBillingMember(member)) return '新泰月繳'
  if (isFixedMonthlyBillingMember(member)) return '社區月繳'
  if (isMonthlyPerSessionBillingMember(member)) return '計次月費'
  if (member.role === '校隊') return '校隊月繳'
  if (member.role === '球員') return '球員季繳'
  return '未設定'
}
