import { createClient } from '@supabase/supabase-js'

const args = process.argv.slice(2)
const isWriteMode = args.includes('--write')
const quarterArg = args.find((arg) => arg.startsWith('--quarter='))
const scopeLabel = quarterArg?.split('=')[1] || 'all'

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseKey = isWriteMode
  ? process.env.SUPABASE_SERVICE_ROLE_KEY
  : process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error(
    isWriteMode
      ? 'Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.'
      : 'Missing VITE_SUPABASE_URL and a readable key (SUPABASE_SERVICE_ROLE_KEY or VITE_SUPABASE_ANON_KEY).'
  )
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false
  }
})

const FULL_QUARTERLY_FEE_AMOUNT = 6000
const HALF_QUARTERLY_FEE_AMOUNT = 3000
const DEFAULT_QUARTERLY_PAYMENT_ITEM = '學費(季繳$6000/3000)'
const ACCOUNT_LAST_5_METHODS = new Set(['銀行轉帳', '郵局無摺', 'ATM存款'])

const toIdList = (value) =>
  Array.isArray(value)
    ? value.filter((id) => typeof id === 'string' && id.trim().length > 0)
    : []

const uniqueSortedIds = (ids) => [...new Set(toIdList(ids))].sort((left, right) => left.localeCompare(right))

const sameStringList = (left, right) => {
  const leftValues = Array.isArray(left) ? left : []
  const rightValues = Array.isArray(right) ? right : []

  if (leftValues.length !== rightValues.length) return false
  return leftValues.every((value, index) => value === rightValues[index])
}

const buildSiblingGroupMap = (members) => {
  const adjacency = new Map()

  members.forEach((member) => {
    adjacency.set(member.id, new Set())
  })

  members.forEach((member) => {
    toIdList(member.sibling_ids).forEach((siblingId) => {
      if (!adjacency.has(member.id) || !adjacency.has(siblingId) || siblingId === member.id) {
        return
      }

      adjacency.get(member.id).add(siblingId)
      adjacency.get(siblingId).add(member.id)
    })
  })

  const siblingGroupMap = new Map()
  const visited = new Set()

  members.forEach((member) => {
    if (visited.has(member.id)) return

    const queue = [member.id]
    const component = []
    visited.add(member.id)

    while (queue.length > 0) {
      const currentId = queue.shift()
      if (!currentId) continue

      component.push(currentId)

      adjacency.get(currentId)?.forEach((neighborId) => {
        if (visited.has(neighborId)) return
        visited.add(neighborId)
        queue.push(neighborId)
      })
    }

    const componentIds = uniqueSortedIds(component)
    componentIds.forEach((id) => {
      siblingGroupMap.set(id, componentIds)
    })
  })

  return siblingGroupMap
}

const getSiblingGroupIds = (memberId, siblingGroupMap) => {
  if (!memberId) return []
  return siblingGroupMap.get(memberId) || [memberId]
}

const resolveLinkedMemberIds = (record, siblingGroupMap) => {
  const seedIds = toIdList(record.member_ids)
  const baseIds = seedIds.length > 0
    ? seedIds
    : toIdList(record.member_id ? [record.member_id] : [])

  if (baseIds.length === 0) return []

  const linkedIds = new Set()
  baseIds.forEach((memberId) => {
    getSiblingGroupIds(memberId, siblingGroupMap).forEach((linkedMemberId) => {
      linkedIds.add(linkedMemberId)
    })
  })

  return uniqueSortedIds([...linkedIds])
}

const selectLatestRecord = (records) =>
  [...records].sort((left, right) => {
    const rightTime = new Date(right.updated_at || right.created_at || 0).getTime()
    const leftTime = new Date(left.updated_at || left.created_at || 0).getTime()

    if (rightTime !== leftTime) {
      return rightTime - leftTime
    }

    return String(right.id || '').localeCompare(String(left.id || ''))
  })[0] || null

const getExpectedQuarterlyAmount = (member, members, siblingGroupMap) => {
  if (member.is_half_price) {
    return HALF_QUARTERLY_FEE_AMOUNT
  }

  const memberMap = new Map(members.map((item) => [item.id, item]))
  const familyMembers = getSiblingGroupIds(member.id, siblingGroupMap)
    .map((id) => memberMap.get(id))
    .filter(Boolean)

  if (familyMembers.length <= 1) {
    return FULL_QUARTERLY_FEE_AMOUNT
  }

  const primaryPayerId = familyMembers
    .filter((item) => item.is_primary_payer && !item.is_half_price)
    .map((item) => item.id)
    .sort((left, right) => left.localeCompare(right))[0]
    || uniqueSortedIds(familyMembers.map((item) => item.id))[0]

  return member.id === primaryPayerId
    ? FULL_QUARTERLY_FEE_AMOUNT
    : HALF_QUARTERLY_FEE_AMOUNT
}

const buildFamilyKey = (yearQuarter, linkedMemberIds) => `${yearQuarter}:${uniqueSortedIds(linkedMemberIds).join('|')}`

const buildRecordPayload = (member, sourceRecord, linkedMemberIds, expectedAmount) => {
  const paymentItems = Array.isArray(sourceRecord?.payment_items) && sourceRecord.payment_items.length > 0
    ? [...sourceRecord.payment_items]
    : [DEFAULT_QUARTERLY_PAYMENT_ITEM]
  const paymentMethod = sourceRecord?.payment_method || '銀行轉帳'
  const status = sourceRecord?.status || 'unpaid'

  return {
    member_id: member.id,
    member_ids: [...linkedMemberIds],
    year_quarter: sourceRecord?.year_quarter || null,
    amount: expectedAmount,
    status,
    payment_items: paymentItems,
    other_item_note: paymentItems.includes('加購其他項目:') ? sourceRecord?.other_item_note || '' : null,
    payment_method: paymentMethod,
    account_last_5: ACCOUNT_LAST_5_METHODS.has(paymentMethod) ? sourceRecord?.account_last_5 || '' : null,
    remittance_date: sourceRecord?.remittance_date || null,
    paid_at: status === 'paid'
      ? sourceRecord?.paid_at || sourceRecord?.updated_at || sourceRecord?.created_at || new Date().toISOString()
      : null
  }
}

const recordNeedsUpdate = (record, payload) => {
  return (
    record.member_id !== payload.member_id ||
    record.year_quarter !== payload.year_quarter ||
    !sameStringList(uniqueSortedIds(record.member_ids), uniqueSortedIds(payload.member_ids)) ||
    (Number(record.amount) || 0) !== (Number(payload.amount) || 0) ||
    (record.status || 'unpaid') !== payload.status ||
    !sameStringList(record.payment_items || [], payload.payment_items || []) ||
    (record.other_item_note || null) !== payload.other_item_note ||
    (record.payment_method || '') !== (payload.payment_method || '') ||
    (record.account_last_5 || null) !== payload.account_last_5 ||
    (record.remittance_date || null) !== payload.remittance_date ||
    (record.paid_at || null) !== payload.paid_at
  )
}

const fetchTeamMembers = async () => {
  const { data, error } = await supabase
    .from('team_members')
    .select('id, name, role, sibling_ids, is_primary_payer, is_half_price')

  if (error) throw error
  return (data || []).map((member) => ({
    ...member,
    sibling_ids: toIdList(member.sibling_ids)
  }))
}

const fetchQuarterlyFees = async () => {
  let query = supabase
    .from('quarterly_fees')
    .select('id, member_id, member_ids, year_quarter, amount, status, paid_at, payment_items, payment_method, account_last_5, remittance_date, other_item_note, created_at, updated_at')

  if (quarterArg?.split('=')[1]) {
    query = query.eq('year_quarter', quarterArg.split('=')[1])
  }

  const { data, error } = await query
  if (error) throw error
  return data || []
}

const run = async () => {
  const teamMembers = await fetchTeamMembers()
  const siblingGroupMap = buildSiblingGroupMap(teamMembers)
  const memberMap = new Map(teamMembers.map((member) => [member.id, member]))
  const quarterlyFees = await fetchQuarterlyFees()

  const familyGroups = new Map()

  quarterlyFees.forEach((record) => {
    const linkedMemberIds = resolveLinkedMemberIds(record, siblingGroupMap)
    if (linkedMemberIds.length === 0) return

    const familyMembers = linkedMemberIds
      .map((id) => memberMap.get(id))
      .filter(Boolean)

    const shouldNormalizeFamily =
      familyMembers.some((member) => member.role === '球員') &&
      (linkedMemberIds.length > 1 || familyMembers.some((member) => member.is_half_price))

    if (!shouldNormalizeFamily) return

    const familyKey = buildFamilyKey(record.year_quarter, linkedMemberIds)
    const familyRecords = familyGroups.get(familyKey) || []
    familyRecords.push({
      ...record,
      linkedMemberIds
    })
    familyGroups.set(familyKey, familyRecords)
  })

  const updates = []
  const inserts = []
  const duplicateDeletes = []

  familyGroups.forEach((records) => {
    const canonicalRecord = selectLatestRecord(records)
    if (!canonicalRecord) return

    const linkedMemberIds = canonicalRecord.linkedMemberIds
    const familyMembers = linkedMemberIds
      .map((id) => memberMap.get(id))
      .filter(Boolean)

    if (familyMembers.length === 0) return

    const latestRecordByMemberId = new Map()

    records.forEach((record) => {
      if (!record.member_id || !linkedMemberIds.includes(record.member_id)) return

      const currentRecord = latestRecordByMemberId.get(record.member_id)
      if (!currentRecord) {
        latestRecordByMemberId.set(record.member_id, record)
        return
      }

      const winner = selectLatestRecord([currentRecord, record])
      const loser = winner?.id === currentRecord.id ? record : currentRecord
      latestRecordByMemberId.set(record.member_id, winner)
      duplicateDeletes.push({
        id: loser.id,
        member_id: loser.member_id,
        year_quarter: loser.year_quarter,
        keep_id: winner.id
      })
    })

    familyMembers.forEach((member) => {
      const expectedAmount = getExpectedQuarterlyAmount(member, teamMembers, siblingGroupMap)
      const currentRecord = latestRecordByMemberId.get(member.id) || null
      const sourceRecord = currentRecord || canonicalRecord
      const payload = buildRecordPayload(member, sourceRecord, linkedMemberIds, expectedAmount)

      if (currentRecord) {
        if (recordNeedsUpdate(currentRecord, payload)) {
          updates.push({
            id: currentRecord.id,
            member_id: member.id,
            member_name: member.name,
            year_quarter: payload.year_quarter,
            payload
          })
        }
        return
      }

      inserts.push({
        member_id: member.id,
        member_name: member.name,
        year_quarter: payload.year_quarter,
        payload
      })
    })
  })

  const deleteIds = [...new Set(duplicateDeletes.map((item) => item.id))]

  console.log(JSON.stringify({
    mode: isWriteMode ? 'write' : 'dry-run',
    scope: scopeLabel,
    update_count: updates.length,
    insert_count: inserts.length,
    delete_count: deleteIds.length,
    updates,
    inserts,
    duplicate_deletes: duplicateDeletes
  }, null, 2))

  if (!isWriteMode) {
    return
  }

  for (const update of updates) {
    const { error } = await supabase
      .from('quarterly_fees')
      .update({
        ...update.payload,
        updated_at: new Date().toISOString()
      })
      .eq('id', update.id)

    if (error) throw error
  }

  if (inserts.length > 0) {
    const { error } = await supabase
      .from('quarterly_fees')
      .insert(inserts.map((insert) => ({
        ...insert.payload,
        updated_at: new Date().toISOString()
      })))

    if (error) throw error
  }

  if (deleteIds.length > 0) {
    const { error } = await supabase
      .from('quarterly_fees')
      .delete()
      .in('id', deleteIds)

    if (error) throw error
  }

  console.log(`Applied ${updates.length} updates, inserted ${inserts.length} missing member rows, and deleted ${deleteIds.length} duplicate rows.`)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
