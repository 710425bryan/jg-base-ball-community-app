export const BALANCE_PAYMENT_METHOD = '餘額扣款'

export const PAYMENT_METHOD_OPTIONS = ['銀行轉帳', '郵局', '現金', 'ATM存款'] as const

const PAYMENT_METHODS_REQUIRING_ACCOUNT_LAST_5 = new Set([
  '銀行轉帳',
  '郵局',
  '郵局無摺',
  'ATM存款'
])

export const requiresAccountLast5 = (paymentMethod?: string | null) => {
  if (!paymentMethod) {
    return false
  }

  return PAYMENT_METHODS_REQUIRING_ACCOUNT_LAST_5.has(paymentMethod)
}

export const normalizeAccountLast5 = (value?: string | null) => {
  return (value || '').replace(/\D/g, '').slice(0, 5)
}
