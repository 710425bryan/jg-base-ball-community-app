export const normalizeMoneyAmount = (value: unknown) =>
  Math.max(0, Math.trunc(Number(value) || 0))

export const clampBalanceDeduction = (
  requestedAmount: unknown,
  payableAmount: unknown,
  currentBalance: unknown
) => {
  const requested = normalizeMoneyAmount(requestedAmount)
  const payable = normalizeMoneyAmount(payableAmount)
  const balance = normalizeMoneyAmount(currentBalance)

  return Math.min(requested, payable, balance)
}

export const getExternalPaymentAmount = (payableAmount: unknown, balanceAmount: unknown) =>
  Math.max(0, normalizeMoneyAmount(payableAmount) - normalizeMoneyAmount(balanceAmount))

export const formatPlayerBalanceSource = (source?: string | null) => {
  if (source === 'payment_deduction') return '餘額扣抵'
  if (source === 'overpayment') return '溢繳入帳'
  return '手動調整'
}

export const buildPaymentBreakdownText = (
  amount: unknown,
  balanceAmount: unknown,
  formatCurrency: (amount: number) => string
) => {
  const total = normalizeMoneyAmount(amount)
  const balance = Math.min(normalizeMoneyAmount(balanceAmount), total)
  const external = getExternalPaymentAmount(total, balance)

  if (balance <= 0) {
    return `外部付款 ${formatCurrency(external)}`
  }

  if (external <= 0) {
    return `全額使用餘額 ${formatCurrency(balance)}`
  }

  return `餘額扣抵 ${formatCurrency(balance)}，外部付款 ${formatCurrency(external)}`
}
