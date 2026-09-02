export type PaymentReconciliationStatus =
  | 'matched'
  | 'underpaid'
  | 'overpaid'
  | 'unverifiable'

export type PaymentReconciliationResult = {
  expectedAmount: number | null
  balanceAmount: number
  expectedExternalAmount: number | null
  reportedExternalAmount: number | null
  amountDifference: number | null
  status: PaymentReconciliationStatus
}

const toFiniteMoney = (value: unknown) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : null
}

export const normalizePaymentMoney = (value: unknown) => toFiniteMoney(value) ?? 0

export const getExpectedExternalPaymentAmount = (
  expectedAmount: unknown,
  balanceAmount: unknown
) => {
  const expected = toFiniteMoney(expectedAmount)
  if (expected == null) return null

  return Math.max(0, expected - normalizePaymentMoney(balanceAmount))
}

export const reconcilePaymentAmounts = (
  expectedAmount: unknown,
  balanceAmount: unknown,
  reportedExternalAmount: unknown
): PaymentReconciliationResult => {
  const expected = toFiniteMoney(expectedAmount)
  const balance = normalizePaymentMoney(balanceAmount)
  const reported = toFiniteMoney(reportedExternalAmount)
  const expectedExternalAmount = getExpectedExternalPaymentAmount(expected, balance)

  if (expected == null || expected <= 0 || reported == null || expectedExternalAmount == null) {
    return {
      expectedAmount: expected,
      balanceAmount: balance,
      expectedExternalAmount,
      reportedExternalAmount: reported,
      amountDifference: null,
      status: 'unverifiable'
    }
  }

  const amountDifference = reported - expectedExternalAmount
  return {
    expectedAmount: expected,
    balanceAmount: balance,
    expectedExternalAmount,
    reportedExternalAmount: reported,
    amountDifference,
    status: amountDifference === 0
      ? 'matched'
      : amountDifference < 0
        ? 'underpaid'
        : 'overpaid'
  }
}

export const getPaymentReconciliationLabel = (status: PaymentReconciliationStatus) => ({
  matched: '金額正確',
  underpaid: '短繳',
  overpaid: '多繳',
  unverifiable: '無法核對'
})[status]

export const requiresPaymentMismatchReason = (status: PaymentReconciliationStatus) =>
  status === 'underpaid' || status === 'overpaid'
