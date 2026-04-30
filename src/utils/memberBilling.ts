export const ROLE_DEFAULT_FEE_BILLING_MODE = 'role_default'
export const FIXED_MONTHLY_FEE_BILLING_MODE = 'monthly_fixed'
export const DEFAULT_FIXED_MONTHLY_FEE = 2000

export type MemberFeeBillingMode =
  | typeof ROLE_DEFAULT_FEE_BILLING_MODE
  | typeof FIXED_MONTHLY_FEE_BILLING_MODE

export type EffectivePaymentBillingMode = 'monthly' | 'quarterly'
export type MonthlyFeeCalculationType = 'per_session' | 'monthly_fixed'

export type BillingModeMember = {
  role?: string | null
  fee_billing_mode?: string | null
}

export const normalizeMemberFeeBillingMode = (value?: string | null): MemberFeeBillingMode =>
  value === FIXED_MONTHLY_FEE_BILLING_MODE
    ? FIXED_MONTHLY_FEE_BILLING_MODE
    : ROLE_DEFAULT_FEE_BILLING_MODE

export const isFixedMonthlyBillingMember = (member: BillingModeMember) =>
  member.role === '球員' && normalizeMemberFeeBillingMode(member.fee_billing_mode) === FIXED_MONTHLY_FEE_BILLING_MODE

export const getEffectivePaymentBillingMode = (
  member: BillingModeMember
): EffectivePaymentBillingMode | null => {
  if (member.role === '校隊') return 'monthly'
  if (isFixedMonthlyBillingMember(member)) return 'monthly'
  if (member.role === '球員') return 'quarterly'
  return null
}

export const isQuarterlyBillingMember = (member: BillingModeMember) =>
  getEffectivePaymentBillingMode(member) === 'quarterly'

export const getMonthlyFeeCalculationType = (member: BillingModeMember): MonthlyFeeCalculationType =>
  isFixedMonthlyBillingMember(member) ? 'monthly_fixed' : 'per_session'

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

export const getMemberBillingLabel = (member: BillingModeMember) => {
  if (isFixedMonthlyBillingMember(member)) return '社區月繳'
  if (member.role === '校隊') return '校隊月繳'
  if (member.role === '球員') return '球員季繳'
  return '未設定'
}
