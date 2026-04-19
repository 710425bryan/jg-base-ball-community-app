export type DedupePlayerSyncRowsResult<T> = {
  rows: T[]
  duplicateCount: number
}

const normalizePlayerSyncKey = (value: string | null | undefined) => value?.trim() ?? ''

export const getProtectedFeeFlagsPayloadForGoogleFormSync = (isExistingMember: boolean) =>
  isExistingMember
    ? {}
    : {
        is_primary_payer: false,
        is_half_price: false
      }

export const dedupePlayerSyncRows = <T>(
  rows: T[],
  getKey: (row: T) => string | null | undefined
): DedupePlayerSyncRowsResult<T> => {
  const orderedKeys: string[] = []
  const rowByKey = new Map<string, T>()
  let duplicateCount = 0

  rows.forEach((row, index) => {
    const normalizedKey = normalizePlayerSyncKey(getKey(row))
    const key = normalizedKey || `__row_${index}`

    if (rowByKey.has(key)) {
      duplicateCount += 1
    } else {
      orderedKeys.push(key)
    }

    rowByKey.set(key, row)
  })

  return {
    rows: orderedKeys
      .map((key) => rowByKey.get(key))
      .filter((row): row is T => row !== undefined),
    duplicateCount
  }
}
