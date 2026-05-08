// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest'
import {
  getPasskeyAuthErrorMessage,
  isPasskeySupported,
  isSupabasePasskeyApiAvailable
} from './passkeySupport'

const setSecureContext = (value: boolean) => {
  Object.defineProperty(window, 'isSecureContext', {
    configurable: true,
    value
  })
}

const setPublicKeyCredential = (value: unknown) => {
  Object.defineProperty(window, 'PublicKeyCredential', {
    configurable: true,
    value
  })
}

const setNavigatorCredentials = (value: unknown) => {
  Object.defineProperty(navigator, 'credentials', {
    configurable: true,
    value
  })
}

describe('passkey support utilities', () => {
  afterEach(() => {
    setSecureContext(false)
    Reflect.deleteProperty(window, 'PublicKeyCredential')
    setNavigatorCredentials(undefined)
  })

  it('requires a secure context and WebAuthn credential APIs', () => {
    setSecureContext(false)
    setPublicKeyCredential(function PublicKeyCredential() {})
    setNavigatorCredentials({
      create: () => undefined,
      get: () => undefined
    })

    expect(isPasskeySupported()).toBe(false)

    setSecureContext(true)

    expect(isPasskeySupported()).toBe(true)
  })

  it('maps browser cancel errors to an otp fallback message', () => {
    expect(getPasskeyAuthErrorMessage(new DOMException('User cancelled', 'NotAllowedError')))
      .toBe('已取消 Passkey 驗證，可改用 email 驗證碼登入。')
  })

  it('detects whether the loaded Supabase auth client exposes passkey methods', () => {
    const completeAuthClient = {
      signInWithPasskey: () => undefined,
      registerPasskey: () => undefined,
      passkey: {
        list: () => undefined,
        update: () => undefined,
        delete: () => undefined
      }
    }

    expect(isSupabasePasskeyApiAvailable(completeAuthClient)).toBe(true)
    expect(isSupabasePasskeyApiAvailable({ ...completeAuthClient, passkey: undefined })).toBe(false)
  })
})
