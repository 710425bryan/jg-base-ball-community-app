export const decodeWebPushPublicKey = (publicKey: string): Uint8Array<ArrayBuffer> => {
  const padding = '='.repeat((4 - publicKey.length % 4) % 4)
  const raw = atob((publicKey + padding).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(raw, (character) => character.charCodeAt(0))
}

export const hasCurrentWebPushKey = (
  subscription: Pick<PushSubscription, 'options'>,
  publicKey: string
) => {
  const existingKey = subscription.options?.applicationServerKey
  if (!existingKey) return false
  const actual = new Uint8Array(existingKey)
  const expected = decodeWebPushPublicKey(publicKey)
  return actual.length === expected.length && actual.every((byte, index) => byte === expected[index])
}

// Called only from the user's enable action. Reading subscription state must not
// automatically revoke an old subscription or request notification permission.
export const ensureCurrentWebPushSubscription = async (
  pushManager: Pick<PushManager, 'getSubscription' | 'subscribe'>,
  publicKey: string
) => {
  const existing = await pushManager.getSubscription()
  if (existing && hasCurrentWebPushKey(existing, publicKey)) return existing

  if (existing && !await existing.unsubscribe()) {
    throw new Error('舊推播訂閱解除失敗，請重新整理後再啟用。')
  }

  return pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: decodeWebPushPublicKey(publicKey)
  })
}
