export type QuarterlyPaymentSubmissionItemDraft = {
  member_id: string
  period_key: string
  amount: number
  balance_amount?: number | null
}

export type QuarterlyPaymentSubmissionScope = {
  billingMode?: string | null
  selectedEquipmentCount?: number
  selectedMatchFeeCount?: number
}

const normalizeMoney = (value: unknown) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0
}

const QUARTERLY_PERIOD_KEY_PATTERN = /^[0-9]{4}-Q[1-4]$/

export const normalizeQuarterlyPeriodKey = (value: unknown) =>
  typeof value === 'string' ? value.trim().toUpperCase() : ''

export const isQuarterlyPeriodKey = (value: unknown) =>
  QUARTERLY_PERIOD_KEY_PATTERN.test(normalizeQuarterlyPeriodKey(value))

export const resolveQuarterlyDefaultPeriodKey = (preferredPeriodKey: unknown, fallbackPeriodKey: string) => {
  const normalizedPreferredPeriodKey = normalizeQuarterlyPeriodKey(preferredPeriodKey)

  if (isQuarterlyPeriodKey(normalizedPreferredPeriodKey)) {
    return normalizedPreferredPeriodKey
  }

  return normalizeQuarterlyPeriodKey(fallbackPeriodKey)
}

export const normalizeQuarterlyPaymentSubmissionItems = (
  items: QuarterlyPaymentSubmissionItemDraft[]
) => items
  .map((item) => {
    const amount = normalizeMoney(item.amount)

    return {
      member_id: item.member_id,
      period_key: normalizeQuarterlyPeriodKey(item.period_key),
      amount,
      balance_amount: Math.min(normalizeMoney(item.balance_amount), amount)
    }
  })
  .filter((item) => item.member_id && item.period_key && item.amount > 0)

export const summarizeQuarterlyPaymentSubmissionItems = (
  items: QuarterlyPaymentSubmissionItemDraft[]
) => {
  const normalizedItems = normalizeQuarterlyPaymentSubmissionItems(items)
  const totalAmount = normalizedItems.reduce((total, item) => total + item.amount, 0)
  const totalBalanceAmount = normalizedItems.reduce((total, item) => total + item.balance_amount, 0)

  return {
    items: normalizedItems,
    totalAmount,
    totalBalanceAmount,
    externalAmount: Math.max(0, totalAmount - totalBalanceAmount)
  }
}

export const validateQuarterlyPaymentSubmissionItems = (
  items: QuarterlyPaymentSubmissionItemDraft[],
  options: {
    periodKey?: string | null
    availableBalances?: Record<string, number | null | undefined>
  } = {}
) => {
  const normalizedItems = normalizeQuarterlyPaymentSubmissionItems(items)
  const errors: string[] = []
  const expectedPeriodKey = normalizeQuarterlyPeriodKey(options.periodKey || '')
  const seenMemberIds = new Set<string>()

  if (normalizedItems.length === 0) {
    errors.push('quarterly payment items are required')
  }

  if (normalizedItems.length !== items.length) {
    errors.push('all quarterly payment item amounts must be greater than 0')
  }

  normalizedItems.forEach((item) => {
    if (!isQuarterlyPeriodKey(item.period_key)) {
      errors.push('quarterly period_key must look like YYYY-Q1')
    }

    if (expectedPeriodKey && item.period_key !== expectedPeriodKey) {
      errors.push('all quarterly payment items must use the same period_key')
    }

    if (seenMemberIds.has(item.member_id)) {
      errors.push('quarterly payment items must not duplicate members')
    }
    seenMemberIds.add(item.member_id)

    const availableBalance = normalizeMoney(options.availableBalances?.[item.member_id])
    if (item.balance_amount > availableBalance) {
      errors.push('balance_amount cannot exceed member balance')
    }
  })

  return [...new Set(errors)]
}

export const canUseGroupedQuarterlyPaymentSubmission = (
  itemCount: number,
  scope: QuarterlyPaymentSubmissionScope
) => {
  if (itemCount <= 1) {
    return false
  }

  return scope.billingMode === 'quarterly'
    && normalizeMoney(scope.selectedEquipmentCount) === 0
    && normalizeMoney(scope.selectedMatchFeeCount) === 0
}
