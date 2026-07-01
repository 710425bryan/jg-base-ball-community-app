export const PLAYER_GRADE_OPTIONS = [
  { label: '幼稚園小班', value: '幼稚園小班' },
  { label: '幼稚園中班', value: '幼稚園中班' },
  { label: '幼稚園大班', value: '幼稚園大班' },
  { label: '國小一年級', value: '國小一年級' },
  { label: '國小二年級', value: '國小二年級' },
  { label: '國小三年級', value: '國小三年級' },
  { label: '國小四年級', value: '國小四年級' },
  { label: '國小五年級', value: '國小五年級' },
  { label: '國小六年級', value: '國小六年級' },
  { label: '國中一年級', value: '國中一年級' },
  { label: '國中二年級', value: '國中二年級' },
  { label: '國中三年級', value: '國中三年級' },
  { label: '高中一年級', value: '高中一年級' },
  { label: '高中二年級', value: '高中二年級' },
  { label: '高中三年級', value: '高中三年級' }
] as const

export type PlayerGradeValue = (typeof PLAYER_GRADE_OPTIONS)[number]['value']

const PLAYER_GRADE_VALUES = PLAYER_GRADE_OPTIONS.map((option) => option.value)
const PLAYER_GRADE_VALUE_SET = new Set<string>(PLAYER_GRADE_VALUES)
const GRADE_ROLLOVER_MONTH = 6
const GRADE_ROLLOVER_DAY = 19

const GRADE_BY_INDEX = new Map<number, PlayerGradeValue>([
  [-2, '幼稚園小班'],
  [-1, '幼稚園中班'],
  [0, '幼稚園大班'],
  [1, '國小一年級'],
  [2, '國小二年級'],
  [3, '國小三年級'],
  [4, '國小四年級'],
  [5, '國小五年級'],
  [6, '國小六年級'],
  [7, '國中一年級'],
  [8, '國中二年級'],
  [9, '國中三年級'],
  [10, '高中一年級'],
  [11, '高中二年級'],
  [12, '高中三年級']
])

const NUMBER_BY_CHINESE_GRADE: Record<string, number> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9
}

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

export const getAcademicYearStart = (today: Date | string = new Date()) => {
  const parts = parseDateParts(today)
  if (!parts) return new Date().getFullYear()

  return parts.month > GRADE_ROLLOVER_MONTH ||
    (parts.month === GRADE_ROLLOVER_MONTH && parts.day >= GRADE_ROLLOVER_DAY)
    ? parts.year
    : parts.year - 1
}

export const inferPlayerGradeFromBirthDate = (
  birthDate: Date | string | null | undefined,
  options: {
    isEarlyEnrollment?: boolean | null
    today?: Date | string
  } = {}
) => {
  const birth = parseDateParts(birthDate)
  if (!birth) return ''

  const isAfterEnrollmentCutoff = birth.month > 9 || (birth.month === 9 && birth.day >= 2)
  const cohortYear = birth.year + (isAfterEnrollmentCutoff && !options.isEarlyEnrollment ? 1 : 0)
  const gradeIndex = getAcademicYearStart(options.today || new Date()) - cohortYear - 5

  return GRADE_BY_INDEX.get(gradeIndex) || ''
}

const getGradeNumber = (value: string) => {
  const digit = value.match(/\d+/)?.[0]
  if (digit) return Number(digit)

  const chinese = value.match(/[一二三四五六七八九]/)?.[0]
  return chinese ? NUMBER_BY_CHINESE_GRADE[chinese] : 0
}

export const normalizePlayerGrade = (value: unknown): PlayerGradeValue | '' => {
  const text = String(value || '').trim().replace(/\s+/g, '')
  if (!text) return ''
  if (PLAYER_GRADE_VALUE_SET.has(text)) return text as PlayerGradeValue

  if (text.includes('小班')) return '幼稚園小班'
  if (text.includes('中班')) return '幼稚園中班'
  if (text.includes('大班')) return '幼稚園大班'

  const gradeNumber = getGradeNumber(text)
  if (!gradeNumber) return ''

  if (text.includes('高中') || text.startsWith('高')) {
    return GRADE_BY_INDEX.get(gradeNumber + 9) || ''
  }

  if (text.includes('國中') || (/^國[一二三123]/.test(text) && !text.includes('國小'))) {
    return GRADE_BY_INDEX.get(gradeNumber + 6) || ''
  }

  if (/^國[七八九789]/.test(text)) {
    return GRADE_BY_INDEX.get(gradeNumber) || ''
  }

  if (gradeNumber >= 7 && gradeNumber <= 9) {
    return GRADE_BY_INDEX.get(gradeNumber) || ''
  }

  if (gradeNumber >= 10 && gradeNumber <= 12) {
    return GRADE_BY_INDEX.get(gradeNumber) || ''
  }

  return GRADE_BY_INDEX.get(gradeNumber) || ''
}
