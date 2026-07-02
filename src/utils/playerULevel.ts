const parseDateParts = (value: Date | string | null | undefined) => {
  if (!value) return null

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    return {
      year: value.getFullYear(),
      month: value.getMonth() + 1,
      day: value.getDate()
    }
  }

  const match = String(value).trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(year, month - 1, day)

  if (
    date.getFullYear() !== year ||
    date.getMonth() + 1 !== month ||
    date.getDate() !== day
  ) {
    return null
  }

  return { year, month, day }
}

export const inferPlayerULevelFromBirthDate = (
  birthDate: Date | string | null | undefined,
  options: {
    today?: Date | string
  } = {}
) => {
  const birth = parseDateParts(birthDate)
  const today = parseDateParts(options.today || new Date())

  if (!birth || !today) return ''

  const hasReachedBirthday =
    today.month > birth.month ||
    (today.month === birth.month && today.day >= birth.day)
  const uLevel = today.year - birth.year + (hasReachedBirthday ? 1 : 0)

  if (!Number.isFinite(uLevel)) return ''
  if (uLevel <= 8) return 'U8'
  return `U${uLevel}`
}
