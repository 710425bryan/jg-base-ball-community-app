export type DedupePlayerSyncRowsResult<T> = {
  rows: T[]
  duplicateCount: number
}

export type GuardianAccountSyncInput = {
  email?: string | null
  guardianName?: string | null
  playerNames?: Array<string | null | undefined>
}

export type GuardianAccountSyncRow = {
  email: string
  guardianName: string
  playerNames: string[]
}

const normalizePlayerSyncKey = (value: string | null | undefined) => value?.trim() ?? ''
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PLAYER_NAME_DELIMITER_PATTERN = /[,、，/／;；\r\n]+/

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

export const normalizePlayerSyncEmail = (value: string | null | undefined) =>
  value?.trim().toLowerCase() ?? ''

export const isValidPlayerSyncEmail = (value: string | null | undefined) => {
  const normalizedEmail = normalizePlayerSyncEmail(value)
  return EMAIL_PATTERN.test(normalizedEmail)
}

export const splitPlayerSyncNames = (value: string | null | undefined) =>
  (value || '')
    .split(PLAYER_NAME_DELIMITER_PATTERN)
    .map((name) => name.trim())
    .filter(Boolean)

export const buildGuardianAccountSyncRows = (
  inputs: GuardianAccountSyncInput[]
): GuardianAccountSyncRow[] => {
  const orderedEmails: string[] = []
  const rowByEmail = new Map<string, GuardianAccountSyncRow>()

  inputs.forEach((input) => {
    const email = normalizePlayerSyncEmail(input.email)
    if (!isValidPlayerSyncEmail(email)) return

    if (!rowByEmail.has(email)) {
      orderedEmails.push(email)
      rowByEmail.set(email, {
        email,
        guardianName: '',
        playerNames: []
      })
    }

    const row = rowByEmail.get(email)!
    const guardianName = input.guardianName?.trim()
    if (guardianName) {
      row.guardianName = guardianName
    }

    input.playerNames?.forEach((playerName) => {
      splitPlayerSyncNames(playerName).forEach((name) => {
        if (!row.playerNames.includes(name)) {
          row.playerNames.push(name)
        }
      })
    })
  })

  return orderedEmails
    .map((email) => rowByEmail.get(email))
    .filter((row): row is GuardianAccountSyncRow => row !== undefined)
}
