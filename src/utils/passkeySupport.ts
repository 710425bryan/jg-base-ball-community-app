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

let passkeyServerEnabledPromise: Promise<boolean> | null = null

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

export const isSupabasePasskeyServerEnabled = async () => {
  if (passkeyServerEnabledPromise) {
    return passkeyServerEnabledPromise
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

  if (!supabaseUrl || !supabaseAnonKey || typeof fetch === 'undefined') {
    return false
  }

  passkeyServerEnabledPromise = fetch(`${supabaseUrl}/auth/v1/settings`, {
    headers: {
      apikey: supabaseAnonKey
    }
  })
    .then(async (response) => {
      if (!response.ok) {
        return false
      }

      const settings = await response.json()
      return settings?.passkeys_enabled === true
    })
    .catch(() => false)

  return passkeyServerEnabledPromise
}

export const clearPasskeyServerSupportCache = () => {
  passkeyServerEnabledPromise = null
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
    if (/passkeys?\s+(are|is)\s+disabled/i.test(error.message)) {
      return 'Supabase 專案端尚未啟用 Passkey，請先到 Auth 設定開啟後再試。'
    }

    return error.message
  }

  return fallback
}
