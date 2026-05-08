const PASSKEY_CANCEL_ERROR_NAMES = new Set(['AbortError', 'NotAllowedError'])

type SupabasePasskeyAuthClient = {
  signInWithPasskey?: unknown
  registerPasskey?: unknown
  passkey?: {
    list?: unknown
    update?: unknown
    delete?: unknown
  }
}

export const isPasskeySupported = () => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return false
  }

  if (!window.isSecureContext) {
    return false
  }

  if (!('PublicKeyCredential' in window)) {
    return false
  }

  return (
    !!navigator.credentials &&
    typeof navigator.credentials.create === 'function' &&
    typeof navigator.credentials.get === 'function'
  )
}

export const isSupabasePasskeyApiAvailable = (authClient?: SupabasePasskeyAuthClient | null) => {
  return (
    !!authClient &&
    typeof authClient.signInWithPasskey === 'function' &&
    typeof authClient.registerPasskey === 'function' &&
    !!authClient.passkey &&
    typeof authClient.passkey.list === 'function' &&
    typeof authClient.passkey.update === 'function' &&
    typeof authClient.passkey.delete === 'function'
  )
}

export const getPasskeyAuthErrorMessage = (
  error: unknown,
  fallback = 'Passkey 驗證失敗，請改用 email 驗證碼登入。'
) => {
  if (
    typeof DOMException !== 'undefined' &&
    error instanceof DOMException &&
    PASSKEY_CANCEL_ERROR_NAMES.has(error.name)
  ) {
    return '已取消 Passkey 驗證，可改用 email 驗證碼登入。'
  }

  if (error instanceof Error && error.message) {
    return error.message
  }

  return fallback
}
