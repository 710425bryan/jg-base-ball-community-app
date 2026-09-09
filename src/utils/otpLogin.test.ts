import { describe, expect, it } from 'vitest'
import { getOtpAuthErrorMessage, isValidOtpCode, normalizeLoginEmail, normalizeOtpCode } from './otpLogin'

describe('OTP login input and recovery', () => {
  it('uses the same email identity for sending and verifying', () => {
    expect(normalizeLoginEmail(' Test@Example.com ')).toBe('test@example.com')
  })

  it('keeps leading zeroes and removes email paste formatting', () => {
    expect(normalizeOtpCode(' ０１２３\u200b ４５６７\n')).toBe('01234567')
    expect(isValidOtpCode(' ０１２３ ４５６７ ')).toBe(true)
  })

  it.each(['1234567', '123456789', '1234abcd', '1234-5678', 'code12345678'])('rejects malformed code %s without truncating it', (token) => {
    expect(isValidOtpCode(token)).toBe(false)
  })

  it.each([
    { code: 'otp_expired', message: 'Different server wording' },
    { message: 'Token has expired or is invalid' }
  ])('explains invalid and expired codes without claiming an exact cause', (error) => {
    expect(getOtpAuthErrorMessage(error, 'fallback')).toContain('驗證碼已失效或不正確')
    expect(getOtpAuthErrorMessage(error, 'fallback')).toContain('重新寄送')
  })

  it('distinguishes throttling, network failures and account access errors', () => {
    expect(getOtpAuthErrorMessage({ status: 429 }, '')).toContain('操作太頻繁')
    expect(getOtpAuthErrorMessage({ code: 'over_email_send_rate_limit' }, '')).toContain('操作太頻繁')
    expect(getOtpAuthErrorMessage(new TypeError('Failed to fetch'), '')).toContain('網路連線')
    expect(getOtpAuthErrorMessage(new Error('帳號已停權'), '')).toBe('帳號已停權')
    expect(getOtpAuthErrorMessage(new Error('Unexpected server detail'), '驗證未完成')).toBe('驗證未完成')
    expect(getOtpAuthErrorMessage(null, '驗證未完成')).toBe('驗證未完成')
  })
})
