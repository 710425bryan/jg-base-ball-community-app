export const FEE_PAYMENT_REMINDER_CATEGORIES = [
  'chunggang_school_team',
  'xintai_school_team',
  'community'
] as const

export type FeePaymentReminderCategory = typeof FEE_PAYMENT_REMINDER_CATEGORIES[number]

export type FeePaymentReminderMode = 'preview' | 'send' | 'test'

export type FeePaymentReminderBillingType = 'monthly' | 'quarterly'

export type FeePaymentReminderBillingMode = FeePaymentReminderBillingType | 'none'

export type FeePaymentReminderMemberLike = {
  role?: string | null
  fee_billing_mode?: string | null
  training_program?: string | null
}

export type FeePaymentReminderTargetItem = {
  fee_id: string
  billing_type: FeePaymentReminderBillingType
  period_key: string
  period_label: string
  category: FeePaymentReminderCategory
  member_ids: string[]
  member_names: string[]
  amount: number
}

export type FeePaymentReminderTargetInput = {
  user_id: string
  item: FeePaymentReminderTargetItem
}

export type FeePaymentReminderTargetGroup = {
  user_id: string
  items: FeePaymentReminderTargetItem[]
  member_ids: string[]
  member_names: string[]
  total_amount: number
  title: string
  body: string
  url: string
  event_key?: string
}

export type FeePaymentReminderPeriodOption = {
  value: string
  label: string
}

export const FEE_PAYMENT_REMINDER_CATEGORY_LABELS: Record<FeePaymentReminderCategory, string> = {
  chunggang_school_team: '中港校隊',
  xintai_school_team: '新泰校隊',
  community: '社區'
}

export const FEE_PAYMENT_REMINDER_URL = '/my-payments'
export const FEE_PAYMENT_REMINDER_ACTION = 'PAYMENT_REMINDER'
export const XINTAI_TRAINING_PROGRAM_KEY = 'junior_high_school_team'

const MONTHLY_PERIOD_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/
const QUARTERLY_PERIOD_PATTERN = /^\d{4}-Q[1-4]$/

const normalizeText = (value: unknown) => String(value ?? '').trim()

const normalizeTrainingProgramKey = (value: unknown) =>
  normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9_:-]+/g, '_')
    .replace(/^_+|_+$/g, '')

const normalizeFeeBillingMode = (value: unknown) => {
  const normalized = normalizeText(value)
  return normalized || 'role_default'
}

export const isValidMonthlyReminderPeriod = (value: unknown) =>
  MONTHLY_PERIOD_PATTERN.test(normalizeText(value))

export const isValidQuarterlyReminderPeriod = (value: unknown) =>
  QUARTERLY_PERIOD_PATTERN.test(normalizeText(value).toUpperCase())

export const normalizeMonthlyReminderPeriod = (value: unknown, fallback: string) =>
  isValidMonthlyReminderPeriod(value) ? normalizeText(value) : fallback

export const normalizeQuarterlyReminderPeriod = (value: unknown, fallback: string) => {
  const normalized = normalizeText(value).toUpperCase()
  return isValidQuarterlyReminderPeriod(normalized) ? normalized : fallback
}

export const getFeePaymentReminderCategoryLabel = (category: FeePaymentReminderCategory) =>
  FEE_PAYMENT_REMINDER_CATEGORY_LABELS[category]

export const normalizeFeePaymentReminderCategory = (
  value: unknown
): FeePaymentReminderCategory | null => {
  const normalized = normalizeText(value)
  return (FEE_PAYMENT_REMINDER_CATEGORIES as readonly string[]).includes(normalized)
    ? normalized as FeePaymentReminderCategory
    : null
}

export const normalizeFeePaymentReminderCategories = (
  value: unknown,
  fallback: FeePaymentReminderCategory[] = [...FEE_PAYMENT_REMINDER_CATEGORIES]
) => {
  const rawValues = Array.isArray(value) ? value : []
  const categories = rawValues
    .map(normalizeFeePaymentReminderCategory)
    .filter((category): category is FeePaymentReminderCategory => Boolean(category))

  const uniqueCategories = [...new Set(categories)]
  return uniqueCategories.length > 0 ? uniqueCategories : [...fallback]
}

export const sortFeePaymentReminderCategories = (
  categories: FeePaymentReminderCategory[]
) => [...categories].sort((left, right) =>
  FEE_PAYMENT_REMINDER_CATEGORIES.indexOf(left) - FEE_PAYMENT_REMINDER_CATEGORIES.indexOf(right)
)

export const isNoFeePaymentReminderMember = (member: FeePaymentReminderMemberLike) =>
  (member.role === '球員' || member.role === '校隊') &&
  normalizeFeeBillingMode(member.fee_billing_mode) === 'no_fee'

export const isXintaiPaymentReminderMember = (member: FeePaymentReminderMemberLike) =>
  member.role === '校隊' &&
  !isNoFeePaymentReminderMember(member) &&
  normalizeTrainingProgramKey(member.training_program) === XINTAI_TRAINING_PROGRAM_KEY

export const getFeePaymentReminderMemberCategory = (
  member: FeePaymentReminderMemberLike
): FeePaymentReminderCategory | null => {
  if (isNoFeePaymentReminderMember(member)) return null
  if (isXintaiPaymentReminderMember(member)) return 'xintai_school_team'
  if (member.role === '校隊') return 'chunggang_school_team'
  if (member.role === '球員') return 'community'
  return null
}

export const getFeePaymentReminderBillingMode = (
  member: FeePaymentReminderMemberLike
): FeePaymentReminderBillingMode | null => {
  if (isNoFeePaymentReminderMember(member)) return 'none'
  if (member.role === '校隊') return 'monthly'

  if (member.role === '球員') {
    const billingMode = normalizeFeeBillingMode(member.fee_billing_mode)
    if (billingMode === 'monthly_fixed' || billingMode === 'monthly_per_session') {
      return 'monthly'
    }

    return 'quarterly'
  }

  return null
}

const formatDateInTaipei = (date: Date) => {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })
  const parts = formatter.formatToParts(date)
  const partMap = new Map(parts.map((part) => [part.type, part.value]))

  return {
    year: Number(partMap.get('year')),
    month: Number(partMap.get('month')),
    day: Number(partMap.get('day'))
  }
}

export const getTaipeiDateString = (date = new Date()) => {
  const parts = formatDateInTaipei(date)
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`
}

const formatMonthPeriod = (year: number, month: number) =>
  `${year}-${String(month).padStart(2, '0')}`

const addMonths = (year: number, month: number, offset: number) => {
  const monthIndex = year * 12 + (month - 1) + offset
  const nextYear = Math.floor(monthIndex / 12)
  const nextMonth = (monthIndex % 12) + 1
  return { year: nextYear, month: nextMonth }
}

export const getDefaultMonthlyReminderPeriod = (date = new Date()) => {
  const parts = formatDateInTaipei(date)
  const offset = parts.day >= 25 ? 0 : -1
  const period = addMonths(parts.year, parts.month, offset)

  return formatMonthPeriod(period.year, period.month)
}

const formatQuarterPeriod = (year: number, quarter: number) => `${year}-Q${quarter}`

const getQuarterFromMonth = (month: number) => Math.floor((month - 1) / 3) + 1

const addQuarters = (year: number, quarter: number, offset: number) => {
  const quarterIndex = year * 4 + (quarter - 1) + offset
  const nextYear = Math.floor(quarterIndex / 4)
  const nextQuarter = (quarterIndex % 4) + 1
  return { year: nextYear, quarter: nextQuarter }
}

export const getDefaultQuarterlyReminderPeriod = (date = new Date()) => {
  const parts = formatDateInTaipei(date)
  return formatQuarterPeriod(parts.year, getQuarterFromMonth(parts.month))
}

export const getDefaultFeePaymentReminderPeriods = (date = new Date()) => ({
  monthly_period: getDefaultMonthlyReminderPeriod(date),
  quarterly_period: getDefaultQuarterlyReminderPeriod(date)
})

export const buildQuarterlyReminderPeriodOptions = (
  date = new Date(),
  before = 4,
  after = 3
): FeePaymentReminderPeriodOption[] => {
  const parts = formatDateInTaipei(date)
  const currentQuarter = getQuarterFromMonth(parts.month)
  const options: FeePaymentReminderPeriodOption[] = []

  for (let offset = -Math.max(0, before); offset <= Math.max(0, after); offset += 1) {
    const period = addQuarters(parts.year, currentQuarter, offset)
    const value = formatQuarterPeriod(period.year, period.quarter)
    options.push({
      value,
      label: `${period.year} 年第 ${period.quarter} 季`
    })
  }

  return options
}

export const formatFeePaymentReminderCurrency = (amount: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(Number(amount) || 0)

const uniqueTexts = (values: string[]) =>
  [...new Set(values.map((value) => normalizeText(value)).filter(Boolean))]

const uniqueIds = (values: string[]) =>
  uniqueTexts(values)

export const buildFeePaymentReminderTitle = () => '繳費提醒'

const getBillingLabel = (item: Pick<FeePaymentReminderTargetItem, 'billing_type' | 'period_label'>) =>
  item.billing_type === 'monthly'
    ? `${item.period_label} 月費`
    : `${item.period_label} 季費`

export const buildFeePaymentReminderBody = (
  group: Pick<FeePaymentReminderTargetGroup, 'items' | 'member_names' | 'total_amount'>
) => {
  if (group.items.length === 1) {
    const item = group.items[0]
    return `${item.member_names.join('、')} 的 ${getBillingLabel(item)} 尚未繳費，金額 ${formatFeePaymentReminderCurrency(item.amount)}。請至繳費資訊查看。`
  }

  return `${group.member_names.length} 位球員有 ${group.items.length} 筆未繳款項，合計 ${formatFeePaymentReminderCurrency(group.total_amount)}。請至繳費資訊查看。`
}

export const buildFeePaymentReminderEventKey = (input: {
  userId: string
  monthlyPeriod: string
  quarterlyPeriod: string
  categories: FeePaymentReminderCategory[]
  dispatchDate: string
}) => [
  'fee_payment_reminder',
  normalizeText(input.userId),
  normalizeText(input.monthlyPeriod),
  normalizeText(input.quarterlyPeriod),
  sortFeePaymentReminderCategories(input.categories).join(','),
  normalizeText(input.dispatchDate)
].join(':')

export const buildFeePaymentReminderTestEventKey = (userId: string, timestamp: string) =>
  ['fee_payment_reminder_test', normalizeText(userId), normalizeText(timestamp)].join(':')

export const groupFeePaymentReminderTargets = (
  targets: FeePaymentReminderTargetInput[],
  context?: {
    monthlyPeriod?: string
    quarterlyPeriod?: string
    categories?: FeePaymentReminderCategory[]
    dispatchDate?: string
  }
): FeePaymentReminderTargetGroup[] => {
  const groups = new Map<string, FeePaymentReminderTargetItem[]>()

  for (const target of targets) {
    const userId = normalizeText(target.user_id)
    if (!userId || !target.item.fee_id) continue

    const nextItems = groups.get(userId) || []
    if (!nextItems.some((item) => item.fee_id === target.item.fee_id && item.billing_type === target.item.billing_type)) {
      nextItems.push({
        ...target.item,
        member_ids: uniqueIds(target.item.member_ids),
        member_names: uniqueTexts(target.item.member_names),
        amount: Math.max(0, Number(target.item.amount) || 0)
      })
    }
    groups.set(userId, nextItems)
  }

  return [...groups.entries()]
    .map(([userId, items]) => {
      const memberIds = uniqueIds(items.flatMap((item) => item.member_ids))
      const memberNames = uniqueTexts(items.flatMap((item) => item.member_names))
      const totalAmount = items.reduce((total, item) => total + Math.max(0, Number(item.amount) || 0), 0)
      const group = {
        user_id: userId,
        items,
        member_ids: memberIds,
        member_names: memberNames,
        total_amount: totalAmount,
        title: buildFeePaymentReminderTitle(),
        body: '',
        url: FEE_PAYMENT_REMINDER_URL
      }

      const body = buildFeePaymentReminderBody(group)
      const eventKey = context?.monthlyPeriod && context?.quarterlyPeriod && context?.dispatchDate
        ? buildFeePaymentReminderEventKey({
          userId,
          monthlyPeriod: context.monthlyPeriod,
          quarterlyPeriod: context.quarterlyPeriod,
          categories: context.categories || [...FEE_PAYMENT_REMINDER_CATEGORIES],
          dispatchDate: context.dispatchDate
        })
        : undefined

      return {
        ...group,
        body,
        event_key: eventKey
      }
    })
    .sort((left, right) => left.member_names.join('、').localeCompare(right.member_names.join('、'), 'zh-Hant'))
}
