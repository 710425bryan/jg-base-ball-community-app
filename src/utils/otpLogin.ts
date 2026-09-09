export const OTP_CODE_LENGTH = 8
export const OTP_RESEND_COOLDOWN_SECONDS = 60
const otpCodePattern = new RegExp(`^\\d{${OTP_CODE_LENGTH}}$`)

export const normalizeLoginEmail = (email: string) => email.trim().toLowerCase()

// 保留前導零；允許從郵件貼上帶空白或全形數字的驗證碼，不截斷多餘數字。
export const normalizeOtpCode = (token: string) =>
  token.normalize('NFKC').replace(/[\s\u200B-\u200D\uFEFF]/g, '')

export const isValidOtpCode = (token: string) => otpCodePattern.test(normalizeOtpCode(token))

export const getOtpAuthErrorMessage = (error: unknown, fallback: string): string => {
  const authError = error as { code?: string; message?: string; status?: number } | null
  const message = authError?.message || ''

  if (authError?.code === 'otp_expired' || /token has expired or is invalid/i.test(message)) {
    return '驗證碼已失效或不正確，請輸入最新一封信中的 8 碼驗證碼，或重新寄送驗證碼。'
  }

  if (
    authError?.status === 429 ||
    ['over_email_send_rate_limit', 'over_request_rate_limit'].includes(authError?.code || '')
  ) {
    return '操作太頻繁，請稍候再試；若已收到信件，請使用最新一封的驗證碼。'
  }

  if (/fetch|network|load failed/i.test(message)) {
    return '網路連線不穩，請確認連線後再試。'
  }

  // 保留既有停權／可登入期間等中文業務錯誤，不直接顯示 Auth 的英文訊息。
  return /[\u4e00-\u9fff]/.test(message) ? message : fallback
}
