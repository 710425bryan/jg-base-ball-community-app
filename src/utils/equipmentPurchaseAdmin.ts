import type { LocationQuery, LocationQueryRaw } from 'vue-router'
import type {
  EquipmentPaymentItem,
  EquipmentPaymentSubmission,
  EquipmentPurchaseRequest
} from '@/types/equipment'
import {
  EQUIPMENT_REQUEST_STATUS,
  getEquipmentRequestStatusLabel
} from '@/utils/equipmentRequestStatus'
import { getEquipmentRequestItemTotalPrice } from '@/utils/equipmentPricing'

export type EquipmentAdminArea = 'payments' | 'requests'
export type EquipmentPaymentAdminStatus = 'action' | 'unpaid' | 'review' | 'refundable'
export type EquipmentRequestAdminStatus = 'action' | 'pending' | 'processing' | 'history'
export type EquipmentAdminStatus = EquipmentPaymentAdminStatus | EquipmentRequestAdminStatus
export type EquipmentAdminRecordType = 'request' | 'payment_submission' | 'transaction'

type EquipmentAdminRecordBase = {
  key: string
  id: string
  area: EquipmentAdminArea
  recordType: EquipmentAdminRecordType
  status: Exclude<EquipmentAdminStatus, 'action'>
  statusLabel: string
  memberName: string
  equipmentSummary: string
  amount: number
  date: string
  searchText: string
  subtype: string
}

export type EquipmentPaymentTransactionAdminRecord = EquipmentAdminRecordBase & {
  area: 'payments'
  recordType: 'transaction'
  status: 'unpaid' | 'refundable'
  source: EquipmentPaymentItem
}

export type EquipmentPaymentSubmissionAdminRecord = EquipmentAdminRecordBase & {
  area: 'payments'
  recordType: 'payment_submission'
  status: 'review' | 'refundable'
  source: EquipmentPaymentSubmission
}

export type EquipmentRequestAdminRecord = EquipmentAdminRecordBase & {
  area: 'requests'
  recordType: 'request'
  status: 'pending' | 'processing' | 'history'
  source: EquipmentPurchaseRequest
}

export type EquipmentPaymentAdminRecord =
  | EquipmentPaymentTransactionAdminRecord
  | EquipmentPaymentSubmissionAdminRecord

export type EquipmentAdminRecord = EquipmentPaymentAdminRecord | EquipmentRequestAdminRecord

export type EquipmentAdminFilters = {
  area: EquipmentAdminArea
  status: EquipmentAdminStatus
  search?: string
  dateFrom?: string
  dateTo?: string
  subtype?: string
}

export type EquipmentAdminSummary = {
  status: Exclude<EquipmentAdminStatus, 'action'>
  label: string
  count: number
  amount: number
}

export type EquipmentRequestQuantitySummaryRow = {
  key: string
  equipmentId: string
  equipmentName: string
  size: string | null
  jerseyNumber: number | null
  requestCount: number
  totalQuantity: number
}

export type EquipmentAdminListContext = {
  area: EquipmentAdminArea
  status: EquipmentAdminStatus
}

export type EquipmentAdminStatusPresentation = {
  title: string
  description: string
  panelClass: string
  titleClass: string
  descriptionClass: string
  optionIdleClass: string
  optionActiveClass: string
  summaryClass: string
  badgeClass: string
  selectedRowClass: string
  idleRowClass: string
}

const STATUS_TONE_CLASSES = {
  slate: {
    panelClass: 'border-gray-100 bg-white',
    titleClass: 'text-slate-800',
    descriptionClass: 'text-slate-600',
    optionIdleClass: 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
    optionActiveClass: 'border-slate-800 bg-slate-800 text-white shadow-sm',
    summaryClass: 'border-gray-100 bg-white',
    badgeClass: 'border-gray-200 bg-gray-100 text-gray-600',
    selectedRowClass: 'border-slate-300 bg-slate-50 ring-1 ring-slate-200',
    idleRowClass: 'border-gray-100 bg-white hover:border-slate-200 hover:bg-slate-50/70'
  },
  sky: {
    panelClass: 'border-sky-100 bg-sky-50/70',
    titleClass: 'text-sky-900',
    descriptionClass: 'text-sky-700/80',
    optionIdleClass: 'border-sky-200 bg-white text-sky-700 hover:bg-sky-50',
    optionActiveClass: 'border-sky-700 bg-sky-700 text-white shadow-sm',
    summaryClass: 'border-sky-100 bg-sky-50/70',
    badgeClass: 'border-sky-200 bg-sky-50 text-sky-700',
    selectedRowClass: 'border-sky-300 bg-sky-50 ring-1 ring-sky-200',
    idleRowClass: 'border-sky-100 bg-white hover:border-sky-200 hover:bg-sky-50/50'
  },
  emerald: {
    panelClass: 'border-emerald-100 bg-emerald-50/70',
    titleClass: 'text-emerald-900',
    descriptionClass: 'text-emerald-700/80',
    optionIdleClass: 'border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50',
    optionActiveClass: 'border-emerald-600 bg-emerald-600 text-white shadow-sm',
    summaryClass: 'border-emerald-100 bg-emerald-50/70',
    badgeClass: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    selectedRowClass: 'border-emerald-300 bg-emerald-50 ring-1 ring-emerald-200',
    idleRowClass: 'border-emerald-100 bg-white hover:border-emerald-200 hover:bg-emerald-50/50'
  },
  orange: {
    panelClass: 'border-orange-100 bg-orange-50/70',
    titleClass: 'text-orange-900',
    descriptionClass: 'text-orange-700/80',
    optionIdleClass: 'border-orange-200 bg-white text-orange-700 hover:bg-orange-50',
    optionActiveClass: 'border-orange-200 bg-orange-50 text-orange-700 ring-1 ring-orange-100 shadow-sm',
    summaryClass: 'border-orange-100 bg-orange-50/70',
    badgeClass: 'border-orange-200 bg-orange-50 text-orange-700',
    selectedRowClass: 'border-orange-300 bg-orange-50 ring-1 ring-orange-200',
    idleRowClass: 'border-orange-100 bg-white hover:border-orange-200 hover:bg-orange-50/50'
  },
  amber: {
    panelClass: 'border-amber-100 bg-amber-50/70',
    titleClass: 'text-amber-900',
    descriptionClass: 'text-amber-700/80',
    optionIdleClass: 'border-amber-200 bg-white text-amber-700 hover:bg-amber-50',
    optionActiveClass: 'border-amber-300 bg-amber-50 text-amber-900 ring-1 ring-amber-100 shadow-sm',
    summaryClass: 'border-amber-100 bg-amber-50/70',
    badgeClass: 'border-amber-200 bg-amber-50 text-amber-700',
    selectedRowClass: 'border-amber-300 bg-amber-50 ring-1 ring-amber-200',
    idleRowClass: 'border-amber-100 bg-white hover:border-amber-200 hover:bg-amber-50/50'
  },
  blue: {
    panelClass: 'border-blue-100 bg-blue-50/60',
    titleClass: 'text-blue-900',
    descriptionClass: 'text-blue-700/80',
    optionIdleClass: 'border-blue-200 bg-white text-blue-700 hover:bg-blue-50',
    optionActiveClass: 'border-blue-600 bg-blue-600 text-white shadow-sm',
    summaryClass: 'border-blue-100 bg-blue-50/60',
    badgeClass: 'border-blue-200 bg-blue-50 text-blue-700',
    selectedRowClass: 'border-blue-300 bg-blue-50 ring-1 ring-blue-200',
    idleRowClass: 'border-blue-100 bg-white hover:border-blue-200 hover:bg-blue-50/50'
  }
} as const

const buildStatusPresentation = (
  tone: keyof typeof STATUS_TONE_CLASSES,
  title: string,
  description: string
): EquipmentAdminStatusPresentation => ({
  title,
  description,
  ...STATUS_TONE_CLASSES[tone]
})

const PAYMENT_STATUS_PRESENTATIONS: Record<EquipmentPaymentAdminStatus, EquipmentAdminStatusPresentation> = {
  action: buildStatusPresentation(
    'slate',
    '裝備付款 / 待處理',
    '集中顯示尚未付款與待審核的裝備款項，先處理收款與家長付款回報。'
  ),
  unpaid: buildStatusPresentation(
    'sky',
    '裝備款項 / 尚未付款',
    '列出已核准、可取貨、已領取或管理員新增，且目前仍標記為尚未付款的裝備交易；若已收款可直接標記為已付款。'
  ),
  review: buildStatusPresentation(
    'emerald',
    '裝備付款 / 待審核',
    '家長在繳費資訊送出的裝備付款回報，確認後會同步把對應裝備交易標記為已收款完成，不代表商品已領取。'
  ),
  refundable: buildStatusPresentation(
    'orange',
    '裝備付款 / 已收款可退款',
    '已確認收款但需要作廢或退款時，先退款再刪除測試請購；退款不會自動把商品狀態改成已領取。'
  )
}

const REQUEST_STATUS_PRESENTATIONS: Record<EquipmentRequestAdminStatus, EquipmentAdminStatusPresentation> = {
  action: buildStatusPresentation(
    'slate',
    '裝備請購審核 / 待處理',
    '集中顯示待審核與處理中的加購申請；核准後即可付款，備貨與領取另外更新。'
  ),
  pending: buildStatusPresentation(
    'amber',
    '裝備請購審核 / 待審核',
    '處理家長送出的加購申請；核准後即可付款，備貨與領取另外更新。'
  ),
  processing: buildStatusPresentation(
    'blue',
    '裝備請購審核 / 處理中',
    '已核准或已備貨完成的加購申請，依實際進度更新備貨完成與領取狀態。'
  ),
  history: buildStatusPresentation(
    'slate',
    '裝備請購審核 / 歷史紀錄',
    '查看已領取、已退回或已取消的請購紀錄；顯示金額為申請當下的價格快照。'
  )
}

export const getEquipmentAdminStatusPresentation = (
  area: EquipmentAdminArea,
  status: EquipmentAdminStatus
) => area === 'payments'
  ? PAYMENT_STATUS_PRESENTATIONS[status as EquipmentPaymentAdminStatus] || PAYMENT_STATUS_PRESENTATIONS.action
  : REQUEST_STATUS_PRESENTATIONS[status as EquipmentRequestAdminStatus] || REQUEST_STATUS_PRESENTATIONS.action

export const EQUIPMENT_PAYMENT_ADMIN_STATUSES: Array<{ value: EquipmentPaymentAdminStatus; label: string }> = [
  { value: 'action', label: '待處理' },
  { value: 'unpaid', label: '尚未付款' },
  { value: 'review', label: '付款待審' },
  { value: 'refundable', label: '已收款可退款' }
]

export const EQUIPMENT_REQUEST_ADMIN_STATUSES: Array<{ value: EquipmentRequestAdminStatus; label: string }> = [
  { value: 'action', label: '待處理' },
  { value: 'pending', label: '待審核' },
  { value: 'processing', label: '處理中' },
  { value: 'history', label: '歷史紀錄' }
]

const normalizeAmount = (value: unknown) => {
  const amount = Number(value)
  return Number.isFinite(amount) ? Math.max(amount, 0) : 0
}

const getEquipmentSummary = (names: string[]) => {
  const normalizedNames = [...new Set(names.map((name) => String(name || '').trim()).filter(Boolean))]
  if (normalizedNames.length === 0) return '未命名裝備'
  if (normalizedNames.length === 1) return normalizedNames[0]
  return `${normalizedNames[0]} 等 ${normalizedNames.length} 項`
}

const getRequestAdminStatus = (
  request: EquipmentPurchaseRequest
): EquipmentRequestAdminRecord['status'] => {
  if (request.status === EQUIPMENT_REQUEST_STATUS.PENDING) return 'pending'
  if (
    request.status === EQUIPMENT_REQUEST_STATUS.APPROVED
    || request.status === EQUIPMENT_REQUEST_STATUS.READY_FOR_PICKUP
  ) return 'processing'
  return 'history'
}

const getPaymentStatusLabel = (status: EquipmentPaymentAdminRecord['status']) => {
  if (status === 'unpaid') return '尚未付款'
  if (status === 'review') return '付款待審'
  return '已收款可退款'
}

export const buildEquipmentPaymentAdminRecords = (payload: {
  unpaidItems: EquipmentPaymentItem[]
  submissions: EquipmentPaymentSubmission[]
  refundableDirectItems: EquipmentPaymentItem[]
}): EquipmentPaymentAdminRecord[] => {
  const unpaidRecords: EquipmentPaymentTransactionAdminRecord[] = payload.unpaidItems.map((item) => ({
    key: `transaction:${item.transaction_id}`,
    id: item.transaction_id,
    area: 'payments',
    recordType: 'transaction',
    status: 'unpaid',
    statusLabel: getPaymentStatusLabel('unpaid'),
    memberName: item.member_name,
    equipmentSummary: item.equipment_name,
    amount: normalizeAmount(item.total_amount),
    date: item.picked_up_at || item.transaction_date || '',
    searchText: `${item.member_name} ${item.equipment_name} ${item.size || ''} ${item.jersey_number || ''}`.toLocaleLowerCase(),
    subtype: 'transaction',
    source: item
  }))

  const submissionRecords: EquipmentPaymentSubmissionAdminRecord[] = payload.submissions
    .filter((submission) => submission.status === 'pending_review' || submission.status === 'approved')
    .map((submission) => {
      const status = submission.status === 'pending_review' ? 'review' : 'refundable'
      const equipmentNames = submission.items.map((item) => item.equipment_name)
      return {
        key: `payment_submission:${submission.id}`,
        id: submission.id,
        area: 'payments',
        recordType: 'payment_submission',
        status,
        statusLabel: getPaymentStatusLabel(status),
        memberName: submission.member_name,
        equipmentSummary: getEquipmentSummary(equipmentNames),
        amount: normalizeAmount(submission.amount),
        date: (status === 'refundable' ? submission.reviewed_at : submission.created_at) || submission.created_at,
        searchText: `${submission.member_name} ${equipmentNames.join(' ')} ${submission.payment_method} ${submission.account_last_5 || ''}`.toLocaleLowerCase(),
        subtype: 'payment_submission',
        source: submission
      }
    })

  const refundableDirectRecords: EquipmentPaymentTransactionAdminRecord[] = payload.refundableDirectItems.map((item) => ({
    key: `transaction:${item.transaction_id}`,
    id: item.transaction_id,
    area: 'payments',
    recordType: 'transaction',
    status: 'refundable',
    statusLabel: getPaymentStatusLabel('refundable'),
    memberName: item.member_name,
    equipmentSummary: item.equipment_name,
    amount: normalizeAmount(item.total_amount),
    date: item.picked_up_at || item.transaction_date || '',
    searchText: `${item.member_name} ${item.equipment_name} ${item.size || ''} ${item.jersey_number || ''}`.toLocaleLowerCase(),
    subtype: 'transaction',
    source: item
  }))

  return [...unpaidRecords, ...submissionRecords, ...refundableDirectRecords]
    .sort((left, right) => String(right.date).localeCompare(String(left.date)))
}

export const buildEquipmentRequestAdminRecords = (
  requests: EquipmentPurchaseRequest[]
): EquipmentRequestAdminRecord[] => {
  const records: EquipmentRequestAdminRecord[] = requests.map((request): EquipmentRequestAdminRecord => {
    const status = getRequestAdminStatus(request)
    const equipmentNames = request.items.map((item) => item.equipment_name_snapshot)
    const amount = request.items.reduce(
      (total, item) => total + getEquipmentRequestItemTotalPrice(item),
      0
    )

    return {
      key: `request:${request.id}`,
      id: request.id,
      area: 'requests',
      recordType: 'request',
      status,
      statusLabel: status === 'history' ? getEquipmentRequestStatusLabel(request.status) : status === 'pending' ? '待審核' : '處理中',
      memberName: request.member?.name || '未知成員',
      equipmentSummary: getEquipmentSummary(equipmentNames),
      amount,
      date: request.updated_at || request.requested_at || request.created_at,
      searchText: `${request.member?.name || ''} ${equipmentNames.join(' ')} ${request.notes || ''}`.toLocaleLowerCase(),
      subtype: String(request.status || ''),
      source: request
    }
  })

  return records.sort((left, right) => String(right.date).localeCompare(String(left.date)))
}

const matchesActionStatus = (record: EquipmentAdminRecord) => (
  record.area === 'payments'
    ? record.status === 'unpaid' || record.status === 'review'
    : record.status === 'pending' || record.status === 'processing'
)

export const filterEquipmentAdminRecords = (
  records: EquipmentAdminRecord[],
  filters: EquipmentAdminFilters
) => {
  const normalizedSearch = String(filters.search || '').trim().toLocaleLowerCase()
  const normalizedSubtype = String(filters.subtype || '').trim()

  return records.filter((record) => {
    if (record.area !== filters.area) return false
    if (filters.status === 'action') {
      if (!matchesActionStatus(record)) return false
    } else if (record.status !== filters.status) {
      return false
    }
    if (normalizedSearch && !record.searchText.includes(normalizedSearch)) return false
    if (filters.dateFrom && record.date.slice(0, 10) < filters.dateFrom) return false
    if (filters.dateTo && record.date.slice(0, 10) > filters.dateTo) return false
    if (normalizedSubtype && record.subtype !== normalizedSubtype) return false
    return true
  })
}

export const summarizeEquipmentAdminRecords = (
  records: EquipmentAdminRecord[],
  area: EquipmentAdminArea
): EquipmentAdminSummary[] => {
  const statuses = area === 'payments'
    ? EQUIPMENT_PAYMENT_ADMIN_STATUSES.filter((status) => status.value !== 'action')
    : EQUIPMENT_REQUEST_ADMIN_STATUSES.filter((status) => status.value !== 'action')

  return statuses.map(({ value, label }) => {
    const matchingRecords = records.filter((record) => record.area === area && record.status === value)
    return {
      status: value as EquipmentAdminSummary['status'],
      label,
      count: matchingRecords.length,
      amount: matchingRecords.reduce((total, record) => total + record.amount, 0)
    }
  })
}

export const summarizeEquipmentRequestQuantities = (
  records: EquipmentAdminRecord[]
): EquipmentRequestQuantitySummaryRow[] => {
  const collator = new Intl.Collator('zh-Hant', { numeric: true, sensitivity: 'base' })
  const summaries = new Map<string, EquipmentRequestQuantitySummaryRow & { requestIds: Set<string> }>()

  records.forEach((record) => {
    if (record.area !== 'requests' || record.recordType !== 'request') return

    record.source.items.forEach((item) => {
      const quantity = Number(item.quantity)
      if (!Number.isFinite(quantity) || quantity <= 0) return

      const equipmentId = String(item.equipment_id || '').trim()
      const equipmentName = String(item.equipment_name_snapshot || '').trim() || '未命名裝備'
      const size = String(item.size || '').trim() || null
      const rawJerseyNumber = item.jersey_number == null ? null : Number(item.jersey_number)
      const jerseyNumber = rawJerseyNumber != null && Number.isFinite(rawJerseyNumber)
        ? rawJerseyNumber
        : null
      const equipmentIdentity = equipmentId || `name:${equipmentName.toLocaleLowerCase()}`
      const key = JSON.stringify([equipmentIdentity, size, jerseyNumber])
      const existing = summaries.get(key)

      if (existing) {
        existing.totalQuantity += quantity
        existing.requestIds.add(record.id)
        return
      }

      summaries.set(key, {
        key,
        equipmentId,
        equipmentName,
        size,
        jerseyNumber,
        requestCount: 0,
        totalQuantity: quantity,
        requestIds: new Set([record.id])
      })
    })
  })

  return [...summaries.values()]
    .map(({ requestIds, ...summary }) => ({
      ...summary,
      requestCount: requestIds.size
    }))
    .sort((left, right) => (
      collator.compare(left.equipmentName, right.equipmentName)
      || collator.compare(left.size || '', right.size || '')
      || (left.jerseyNumber ?? -1) - (right.jerseyNumber ?? -1)
    ))
}

export const hasEquipmentAdminListContextChanged = (
  current: EquipmentAdminListContext,
  next: EquipmentAdminListContext
) => current.area !== next.area || current.status !== next.status

export const clampEquipmentAdminPage = (
  page: number,
  recordCount: number,
  pageSize = 10
) => {
  const safePageSize = Math.max(Math.floor(Number(pageSize) || 0), 1)
  const lastPage = Math.max(Math.ceil(Math.max(Number(recordCount) || 0, 0) / safePageSize), 1)
  const safePage = Math.max(Math.floor(Number(page) || 0), 1)
  return Math.min(safePage, lastPage)
}

const firstQueryValue = (value: LocationQuery[string] | undefined) => {
  const rawValue = Array.isArray(value) ? value[0] : value
  return typeof rawValue === 'string' ? rawValue.trim() : ''
}

export const isEquipmentAdminStatusForArea = (
  area: EquipmentAdminArea,
  status: string
): status is EquipmentAdminStatus => (
  (area === 'payments' ? EQUIPMENT_PAYMENT_ADMIN_STATUSES : EQUIPMENT_REQUEST_ADMIN_STATUSES)
    .some((option) => option.value === status)
)

export const getEquipmentAdminRouteState = (query: LocationQuery) => {
  const rawArea = firstQueryValue(query.area)
  const area: EquipmentAdminArea = rawArea === 'requests' ? 'requests' : 'payments'
  const rawStatus = firstQueryValue(query.status)
  const status: EquipmentAdminStatus = isEquipmentAdminStatusForArea(area, rawStatus) ? rawStatus : 'action'
  const rawRecordType = firstQueryValue(query.record_type)
  const recordType: EquipmentAdminRecordType | null = ['request', 'payment_submission', 'transaction'].includes(rawRecordType)
    ? rawRecordType as EquipmentAdminRecordType
    : null

  return {
    area,
    status,
    recordType,
    recordId: firstQueryValue(query.record_id)
  }
}

export const buildEquipmentAdminQuery = (payload: {
  area: EquipmentAdminArea
  status?: EquipmentAdminStatus
  recordType?: EquipmentAdminRecordType | null
  recordId?: string | null
}): LocationQueryRaw => {
  const query: LocationQueryRaw = {
    area: payload.area,
    status: isEquipmentAdminStatusForArea(payload.area, String(payload.status || ''))
      ? payload.status
      : 'action'
  }

  if (payload.recordType && payload.recordId) {
    query.record_type = payload.recordType
    query.record_id = payload.recordId
  }

  return query
}

export const buildEquipmentAdminUrl = (payload: Parameters<typeof buildEquipmentAdminQuery>[0]) => {
  const query = buildEquipmentAdminQuery(payload)
  const search = new URLSearchParams()
  Object.entries(query).forEach(([key, value]) => {
    if (typeof value === 'string') search.set(key, value)
  })
  return `/equipment-purchases?${search.toString()}`
}

export const getLegacyEquipmentAdminRedirect = (query: LocationQuery): LocationQueryRaw | null => {
  const tab = firstQueryValue(query.tab)
  const section = firstQueryValue(query.section)
  const equipmentSubmissionId = firstQueryValue(query.highlight_equipment_submission_id)
  const genericSubmissionId = firstQueryValue(query.highlight_submission_id)
  const requestId = firstQueryValue(query.highlight_id)
  const isEquipmentLink = tab === 'equipment' || section === 'equipment-unpaid' || Boolean(equipmentSubmissionId)

  if (!isEquipmentLink) return null

  if (section === 'equipment-unpaid') {
    return buildEquipmentAdminQuery({ area: 'payments', status: 'unpaid' })
  }

  if (equipmentSubmissionId || (tab === 'equipment' && genericSubmissionId)) {
    return buildEquipmentAdminQuery({
      area: 'payments',
      status: 'review',
      recordType: 'payment_submission',
      recordId: equipmentSubmissionId || genericSubmissionId
    })
  }

  if (tab === 'equipment' && requestId) {
    return buildEquipmentAdminQuery({
      area: 'requests',
      status: 'action',
      recordType: 'request',
      recordId: requestId
    })
  }

  return buildEquipmentAdminQuery({ area: 'payments', status: 'action' })
}

export const findEquipmentAdminRecord = (
  records: EquipmentAdminRecord[],
  recordType: EquipmentAdminRecordType | null,
  recordId: string
) => recordType && recordId
  ? records.find((record) => record.recordType === recordType && record.id === recordId) || null
  : null
