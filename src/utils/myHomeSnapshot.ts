import type {
  MyHomeEquipmentSummary,
  MyHomeMatchFeeSummary,
  MyHomeMember,
  MyHomeNextEvent,
  MyHomePaymentSummary,
  MyHomeSnapshot,
  MyHomeTodoItem
} from '@/types/myHome'
import dayjs, { type Dayjs } from 'dayjs'
import { isActiveTrainingRegistrationStatus } from '@/utils/training'

const TIME_TOKEN_PATTERN = /\d{1,2}:\d{2}/g
const PLAYER_LIST_SEPARATOR_PATTERN = /[,，、\n\r;；/]+/
const LEADING_PLAYER_NUMBER_PATTERN = /^#?(\d{1,3})(?:\D|$)/

const safeNumber = (value: unknown) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

export const formatMyHomeCurrency = (amount: number) =>
  new Intl.NumberFormat('zh-TW', {
    style: 'currency',
    currency: 'TWD',
    maximumFractionDigits: 0
  }).format(safeNumber(amount))

export const getSelectedMyHomeMember = (
  members: MyHomeMember[],
  selectedMemberId?: string | null
) => members.find((member) => member.id === selectedMemberId) || members[0] || null

export const getMyHomeMemberLeave = (
  snapshot: MyHomeSnapshot,
  memberId?: string | null
) => snapshot.today_leaves.find((leave) => leave.member_id === memberId) || null

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object')

const optionalString = (value: unknown) => {
  if (value === null || value === undefined) return null

  const normalized = String(value).trim()
  return normalized || null
}

const normalizeComparableName = (value: unknown) =>
  String(value || '').trim().replace(/\s+/g, '')

const normalizeJerseyNumber = (value: unknown) =>
  String(value ?? '').trim().replace(/^#/, '')

const cleanPlayerListEntryName = (value: string) =>
  normalizeComparableName(value)
    .replace(/^#?\d{1,3}[.．、:\-：]*/, '')
    .replace(/[（(].*?[）)]/g, '')

const normalizeNextEventRoute = (route: string | null, id: string) => {
  const fallbackRoute = `/calendar?match_id=${encodeURIComponent(id)}`

  if (!route) return fallbackRoute
  if (route.startsWith('/match-records?')) return route.replace('/match-records', '/calendar')
  if (route === '/match-records' || route === '/calendar') return fallbackRoute

  return route
}

export const normalizeMyHomeNextEvent = (value: unknown): MyHomeNextEvent | null => {
  if (!isRecord(value) || value.type !== 'match') return null

  const id = optionalString(value.id)
  const date = optionalString(value.date)
  if (!id || !date) return null

  return {
    id,
    type: 'match',
    title: optionalString(value.title) || '賽事',
    date,
    time: optionalString(value.time),
    location: optionalString(value.location),
    opponent: optionalString(value.opponent),
    category_group: optionalString(value.category_group),
    match_level: optionalString(value.match_level),
    coaches: optionalString(value.coaches),
    players: optionalString(value.players),
    route: normalizeNextEventRoute(optionalString(value.route), id),
    training_registration_status: optionalString(value.training_registration_status) as MyHomeNextEvent['training_registration_status'],
    is_training_registration_open: Boolean(value.is_training_registration_open)
  }
}

export const canShowMyHomeTrainingRegistrationAction = (
  nextEvent: MyHomeNextEvent | null
) => {
  if (nextEvent?.type !== 'match' || nextEvent.match_level !== '特訓課') return false
  return isActiveTrainingRegistrationStatus(nextEvent.training_registration_status)
    && nextEvent.is_training_registration_open === true
}

const getMyHomeNextEventTimeTokens = (nextEvent: MyHomeNextEvent | null) =>
  nextEvent?.time?.match(TIME_TOKEN_PATTERN) ?? []

const buildMyHomeNextEventDateTime = (nextEvent: MyHomeNextEvent | null, time: string) => {
  if (!nextEvent?.date) return null

  const value = dayjs(`${nextEvent.date}T${time}`)
  return value.isValid() ? value : null
}

export const getMyHomeNextEventEnd = (
  nextEvent: MyHomeNextEvent | null
): Dayjs | null => {
  if (!nextEvent?.date) return null

  const [startTime, endTime] = getMyHomeNextEventTimeTokens(nextEvent)
  if (endTime) return buildMyHomeNextEventDateTime(nextEvent, endTime)

  const start = buildMyHomeNextEventDateTime(nextEvent, startTime ?? '23:59')
  if (!start) return null

  if (startTime) {
    return start.add(2, 'hour')
  }

  return start.endOf('day')
}

export const isMyHomeNextEventExpired = (
  nextEvent: MyHomeNextEvent | null,
  now: Dayjs = dayjs()
) => {
  const end = getMyHomeNextEventEnd(nextEvent)
  return end ? !now.isBefore(end) : false
}

const parsePlayerListEntries = (value?: string | null) =>
  String(value || '')
    .split(PLAYER_LIST_SEPARATOR_PATTERN)
    .map((entry) => entry.trim())
    .filter(Boolean)

export const isMyHomeMemberInEventPlayers = (
  event: MyHomeNextEvent | null,
  member: MyHomeMember | null
) => {
  if (!event || !member) return false

  const entries = parsePlayerListEntries(event.players)
  if (entries.length === 0) return false

  const memberName = normalizeComparableName(member.name)
  const memberNumber = normalizeJerseyNumber(member.jersey_number)

  return entries.some((entry) => {
    const entryName = cleanPlayerListEntryName(entry)
    if (entryName && entryName === memberName) return true

    const numberMatch = entry.match(LEADING_PLAYER_NUMBER_PATTERN)
    return Boolean(memberNumber && numberMatch?.[1] === memberNumber)
  })
}

const normalizeTodoToday = (today: Dayjs | string | null | undefined) => {
  if (dayjs.isDayjs(today)) return today.startOf('day')

  const parsed = today ? dayjs(today) : dayjs()
  return parsed.isValid() ? parsed.startOf('day') : dayjs().startOf('day')
}

const isTodayOrTomorrow = (dateValue: string | null | undefined, today: Dayjs) => {
  if (!dateValue) return false

  const date = dayjs(dateValue)
  if (!date.isValid()) return false

  return date.isSame(today, 'day') || date.isSame(today.add(1, 'day'), 'day')
}

const hasTrainingDateInLeavePromptWindow = (
  snapshot: MyHomeSnapshot,
  today: Dayjs
) => snapshot.training_month_dates.some((item) => isTodayOrTomorrow(item.date, today))

const hasRosteredEventInLeavePromptWindow = (
  snapshot: MyHomeSnapshot,
  selectedMember: MyHomeMember,
  today: Dayjs
) => (
  isTodayOrTomorrow(snapshot.next_event?.date, today) &&
  isMyHomeMemberInEventPlayers(snapshot.next_event, selectedMember)
)

const buildPaymentTodo = (payment: MyHomePaymentSummary): MyHomeTodoItem | null => {
  if (payment.unpaid_count > 0) {
    const amountLabel = payment.total_unpaid_amount > 0
      ? `，合計 ${formatMyHomeCurrency(payment.total_unpaid_amount)}`
      : ''

    return {
      key: 'payment-unpaid',
      title: '有待處理繳費',
      body: `${payment.unpaid_count} 筆繳費尚未完成${amountLabel}。`,
      severity: 'warning',
      actionLabel: '查看繳費',
      route: '/my-payments'
    }
  }

  if (payment.pending_review_count > 0) {
    return {
      key: 'payment-review',
      title: '付款回報審核中',
      body: `${payment.pending_review_count} 筆繳費或付款回報正在等待管理員確認。`,
      severity: 'info',
      actionLabel: '查看紀錄',
      route: '/my-payments'
    }
  }

  return null
}

const buildEquipmentTodo = (equipment: MyHomeEquipmentSummary): MyHomeTodoItem | null => {
  if (equipment.ready_for_pickup_count > 0) {
    return {
      key: 'equipment-ready',
      title: '裝備已備貨',
      body: `${equipment.ready_for_pickup_count} 筆裝備已備貨完成，可以領取；若尚未付款，也可先回報付款。`,
      severity: 'success',
      actionLabel: '前往繳費',
      route: '/my-payments'
    }
  }

  if (equipment.picked_up_unpaid_count > 0) {
    return {
      key: 'equipment-payment',
      title: '裝備付款待回報',
      body: `${equipment.picked_up_unpaid_count} 筆已核准、可取貨或已領取裝備尚未完成付款，金額約 ${formatMyHomeCurrency(equipment.unpaid_amount)}。`,
      severity: 'warning',
      actionLabel: '前往繳費',
      route: '/my-payments'
    }
  }

  if (equipment.pending_payment_count > 0) {
    return {
      key: 'equipment-review',
      title: '裝備付款審核中',
      body: `${equipment.pending_payment_count} 筆裝備付款正在等待審核。`,
      severity: 'info',
      actionLabel: '查看繳費',
      route: '/my-payments'
    }
  }

  if (equipment.active_request_count > 0) {
    return {
      key: 'equipment-active',
      title: '裝備申請處理中',
      body: `${equipment.active_request_count} 筆裝備申請正在審核或備貨中。`,
      severity: 'info',
      actionLabel: '查看裝備狀態',
      route: '/equipment-addons?tab=requests'
    }
  }

  return null
}

const buildMatchFeeTodo = (matchFees: MyHomeMatchFeeSummary): MyHomeTodoItem | null => {
  if (matchFees.unpaid_count > 0) {
    const amountLabel = matchFees.unpaid_amount > 0
      ? `，合計 ${formatMyHomeCurrency(matchFees.unpaid_amount)}`
      : ''

    return {
      key: 'match-fee-payment',
      title: '比賽費用待回報',
      body: `${matchFees.unpaid_count} 筆比賽費用尚未完成付款${amountLabel}。`,
      severity: 'warning',
      actionLabel: '前往繳費',
      route: '/my-payments'
    }
  }

  if (matchFees.pending_review_count > 0) {
    return {
      key: 'match-fee-review',
      title: '比賽費用審核中',
      body: `${matchFees.pending_review_count} 筆比賽費用付款正在等待確認。`,
      severity: 'info',
      actionLabel: '查看繳費',
      route: '/my-payments'
    }
  }

  return null
}

export const buildMyHomeTodoItems = (
  snapshot: MyHomeSnapshot,
  selectedMemberId?: string | null,
  todayInput?: Dayjs | string | null
): MyHomeTodoItem[] => {
  const selectedMember = getSelectedMyHomeMember(snapshot.members, selectedMemberId)
  const today = normalizeTodoToday(todayInput)

  if (!selectedMember) {
    return [{
      key: 'member-binding',
      title: '尚未綁定球員',
      body: '請管理員在使用者名單完成成員綁定，之後這裡會顯示請假、繳費與裝備狀態。',
      severity: 'warning',
      actionLabel: '查看個人設定',
      route: '/profile'
    }]
  }

  const items: MyHomeTodoItem[] = []
  const todayLeave = getMyHomeMemberLeave(snapshot, selectedMember.id)
  const nextEvent = snapshot.next_event

  if (nextEvent && isMyHomeMemberInEventPlayers(nextEvent, selectedMember)) {
    items.push({
      key: 'next-event',
      title: '下一場賽事',
      body: `${nextEvent.date}${nextEvent.time ? ` ${nextEvent.time}` : ''}｜${nextEvent.title}`,
      severity: 'info',
      actionLabel: '查看賽事',
      route: nextEvent.route
    })
  }

  if (todayLeave) {
    items.push({
      key: 'today-leave',
      title: '今天已請假',
      body: `${selectedMember.name} 今日已登記${todayLeave.leave_type}，教練端可同步看到。`,
      severity: 'success',
      actionLabel: '查看假單',
      route: '/my-leave-requests'
    })
  } else if (
    hasTrainingDateInLeavePromptWindow(snapshot, today) ||
    hasRosteredEventInLeavePromptWindow(snapshot, selectedMember, today)
  ) {
    items.push({
      key: 'leave-action',
      title: '需要請假嗎？',
      body: `若 ${selectedMember.name} 今天或近期無法出席，可以直接送出假單。`,
      severity: 'info',
      actionLabel: '我要請假',
      route: '/my-leave-requests'
    })
  }

  const paymentTodo = buildPaymentTodo(snapshot.payment_summary)
  if (paymentTodo) items.push(paymentTodo)

  const equipmentTodo = buildEquipmentTodo(snapshot.equipment_summary)
  if (equipmentTodo) items.push(equipmentTodo)

  const matchFeeTodo = buildMatchFeeTodo(snapshot.match_fee_summary)
  if (matchFeeTodo) items.push(matchFeeTodo)

  return items
}
