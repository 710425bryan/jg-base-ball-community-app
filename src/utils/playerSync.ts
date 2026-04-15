export type PrimaryPayerSyncOptions = {
  hasPrimaryPayerColumn: boolean
  rawPrimaryPayerValue?: string | null
  fallbackValue?: boolean | null
}

export const resolvePrimaryPayerSyncValue = ({
  hasPrimaryPayerColumn,
  rawPrimaryPayerValue,
  fallbackValue = false
}: PrimaryPayerSyncOptions) => {
  if (!hasPrimaryPayerColumn) return !!fallbackValue

  const normalizedValue = typeof rawPrimaryPayerValue === 'string'
    ? rawPrimaryPayerValue.trim()
    : ''

  if (!normalizedValue) return !!fallbackValue

  return normalizedValue === '是'
}
