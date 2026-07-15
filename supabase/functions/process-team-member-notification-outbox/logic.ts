export const TEAM_MEMBER_OUTBOX_MAX_ATTEMPTS = 6
export const TEAM_MEMBER_OUTBOX_RETRY_DELAYS_MINUTES = [1, 5, 15, 60, 360] as const

export type DeliveryFailureDisposition = {
  status: 'pending' | 'failed'
  nextAttemptAt: string
}

export const clampBatchLimit = (value: unknown, fallback: number, maximum: number) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(Math.max(Math.trunc(parsed), 1), maximum)
}

export const getDeliveryFailureDisposition = (
  attemptCount: number,
  now: Date = new Date()
): DeliveryFailureDisposition => {
  const normalizedAttempt = Math.max(1, Math.trunc(attemptCount || 1))

  if (normalizedAttempt >= TEAM_MEMBER_OUTBOX_MAX_ATTEMPTS) {
    return {
      status: 'failed',
      nextAttemptAt: now.toISOString(),
    }
  }

  const delayMinutes = TEAM_MEMBER_OUTBOX_RETRY_DELAYS_MINUTES[normalizedAttempt - 1]
  return {
    status: 'pending',
    nextAttemptAt: new Date(now.getTime() + delayMinutes * 60_000).toISOString(),
  }
}

export const getOutboxDispatchStatus = (counts: {
  total: number
  pending: number
  sent: number
  failed: number
}) => {
  if (counts.total === 0) return 'no_targets'
  if (counts.pending > 0) return 'retrying'
  if (counts.failed === 0) return 'completed'
  if (counts.sent > 0) return 'partial_failed'
  return 'failed'
}

export const mapWithConcurrency = async <Input, Output>(
  values: Input[],
  concurrency: number,
  worker: (value: Input, index: number) => Promise<Output>
): Promise<Output[]> => {
  if (values.length === 0) return []

  const results = new Array<Output>(values.length)
  let nextIndex = 0
  const workerCount = Math.min(Math.max(Math.trunc(concurrency), 1), values.length)

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < values.length) {
      const index = nextIndex
      nextIndex += 1
      results[index] = await worker(values[index], index)
    }
  }))

  return results
}
