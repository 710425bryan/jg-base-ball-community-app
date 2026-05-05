import type {
  MyHomeEquipmentSummary,
  MyHomeMember,
  MyHomeNextEvent,
  MyHomePaymentSummary,
  MyHomeSnapshot,
  MyHomeTodoItem
} from '@/types/myHome'
import type { TrainingSession } from '@/types/training'

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

export const canShowMyHomeTrainingRegistrationAction = (
  nextEvent: MyHomeNextEvent | null,
  sessions: Array<Pick<TrainingSession, 'match_id' | 'is_registration_open'>>
) => {
  if (nextEvent?.match_level !== '特訓課') return false

  return sessions.some((session) =>
    session.match_id === nextEvent.id && session.is_registration_open
  )
}

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
      title: '裝備可領取',
      body: `${equipment.ready_for_pickup_count} 筆裝備已備貨完成，可以查看領取資訊。`,
      severity: 'success',
      actionLabel: '查看裝備狀態',
      route: '/equipment-addons?tab=requests'
    }
  }

  if (equipment.picked_up_unpaid_count > 0) {
    return {
      key: 'equipment-payment',
      title: '裝備付款待回報',
      body: `${equipment.picked_up_unpaid_count} 筆已領取裝備尚未完成付款，金額約 ${formatMyHomeCurrency(equipment.unpaid_amount)}。`,
      severity: 'warning',
      actionLabel: '前往繳費',
      route: '/my-payments'
    }
  }

  if (equipment.pending_payment_count > 0) {
    return {
      key: 'equipment-review',
      title: '裝備付款審核中',
      body: `${equipment.pending_payment_count} 筆裝備付款正在等待確認。`,
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

export const buildMyHomeTodoItems = (
  snapshot: MyHomeSnapshot,
  selectedMemberId?: string | null
): MyHomeTodoItem[] => {
  const selectedMember = getSelectedMyHomeMember(snapshot.members, selectedMemberId)

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

  if (snapshot.next_event) {
    items.push({
      key: 'next-event',
      title: snapshot.next_event.type === 'match' ? '下一場賽事' : '下一個活動',
      body: `${snapshot.next_event.date}${snapshot.next_event.time ? ` ${snapshot.next_event.time}` : ''}｜${snapshot.next_event.title}`,
      severity: 'info',
      actionLabel: snapshot.next_event.type === 'match' ? '查看賽事' : '查看行事曆',
      route: snapshot.next_event.route
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
  } else {
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

  return items
}
