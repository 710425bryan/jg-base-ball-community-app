import { createClient } from '@supabase/supabase-js'

const args = process.argv.slice(2)
const isWriteMode = args.includes('--write')
const quarterArg = args.find((arg) => arg.startsWith('--quarter='))

const getCurrentQuarterLabel = () => {
  const now = new Date()
  const quarter = Math.floor(now.getMonth() / 3) + 1
  return `${now.getFullYear()}-Q${quarter}`
}

const quarterLabel = quarterArg?.split('=')[1] || getCurrentQuarterLabel()
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

const eligibleRoles = new Set(['球員', '校隊'])

const toSiblingIdList = (value) =>
  Array.isArray(value)
    ? value.filter((id) => typeof id === 'string' && id.trim().length > 0)
    : []

const sortIds = (ids, orderMap) =>
  [...new Set(ids)].sort((left, right) => {
    const leftOrder = orderMap.get(left)
    const rightOrder = orderMap.get(right)

    if (leftOrder !== undefined && rightOrder !== undefined) {
      return leftOrder - rightOrder
    }

    if (leftOrder !== undefined) return -1
    if (rightOrder !== undefined) return 1
    return left.localeCompare(right)
  })

const buildSiblingGroupMap = (members) => {
  const orderMap = new Map()
  const adjacency = new Map()

  members.forEach((member, index) => {
    orderMap.set(member.id, index)
    adjacency.set(member.id, new Set())
  })

  members.forEach((member) => {
    toSiblingIdList(member.sibling_ids).forEach((siblingId) => {
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
    const component = new Set()
    visited.add(member.id)

    while (queue.length > 0) {
      const currentId = queue.shift()
      if (!currentId) continue

      component.add(currentId)

      adjacency.get(currentId)?.forEach((neighborId) => {
        if (visited.has(neighborId)) return
        visited.add(neighborId)
        queue.push(neighborId)
      })
    }

    const componentIds = sortIds(component, orderMap)
    componentIds.forEach((id) => {
      siblingGroupMap.set(id, componentIds)
    })
  })

  return siblingGroupMap
}

const normalizeSiblingMembers = (members) => {
  const eligibleMembers = members
    .filter((member) => eligibleRoles.has(member.role))
    .map((member) => ({
      ...member,
      sibling_ids: toSiblingIdList(member.sibling_ids)
    }))

  const siblingGroupMap = buildSiblingGroupMap(eligibleMembers)

  const normalizedMembers = members.map((member) => {
    const groupIds = siblingGroupMap.get(member.id) || [member.id]
    return {
      ...member,
      sibling_ids: eligibleRoles.has(member.role)
        ? groupIds.filter((id) => id !== member.id)
        : []
    }
  })

  return {
    normalizedMembers,
    siblingGroupMap
  }
}

const resolveLinkedMemberIds = (record, siblingGroupMap) => {
  const baseIds = toSiblingIdList(record.member_ids)
  const seedIds = baseIds.length > 0
    ? baseIds
    : toSiblingIdList(record.member_id ? [record.member_id] : [])

  if (seedIds.length === 0) return []

  const linkedIds = new Set()
  const orderMap = new Map()

  seedIds.forEach((id, index) => {
    orderMap.set(id, index)
    ;(siblingGroupMap.get(id) || [id]).forEach((linkedId) => {
      linkedIds.add(linkedId)
      if (!orderMap.has(linkedId)) {
        orderMap.set(linkedId, seedIds.length + orderMap.size)
      }
    })
  })

  return sortIds(linkedIds, orderMap)
}

const sameIdList = (left, right) => {
  const leftIds = toSiblingIdList(left)
  const rightIds = toSiblingIdList(right)

  if (leftIds.length !== rightIds.length) return false
  return leftIds.every((id, index) => id === rightIds[index])
}

const selectCanonicalRecord = (records) =>
  [...records].sort((left, right) => {
    const rightTime = new Date(right.updated_at || right.created_at || 0).getTime()
    const leftTime = new Date(left.updated_at || left.created_at || 0).getTime()
    return rightTime - leftTime
  })[0]

const fetchTeamMembers = async () => {
  const { data, error } = await supabase
    .from('team_members')
    .select('id, name, role, sibling_ids, is_primary_payer')
    .order('name')

  if (error) throw error
  return data || []
}

const fetchQuarterlyFees = async () => {
  const { data, error } = await supabase
    .from('quarterly_fees')
    .select('id, member_id, member_ids, year_quarter, status, amount, created_at, updated_at, paid_at, payment_items, payment_method, account_last_5, remittance_date, other_item_note')
    .eq('year_quarter', quarterLabel)

  if (error) throw error
  return data || []
}

const run = async () => {
  const teamMembers = await fetchTeamMembers()
  const { normalizedMembers, siblingGroupMap } = normalizeSiblingMembers(teamMembers)

  const siblingUpdates = normalizedMembers
    .filter((member) => {
      const originalMember = teamMembers.find((item) => item.id === member.id)
      return !sameIdList(originalMember?.sibling_ids, member.sibling_ids)
    })
    .map((member) => ({
      id: member.id,
      name: member.name,
      sibling_ids: member.sibling_ids
    }))

  const quarterlyFees = await fetchQuarterlyFees()
  const familyGroups = new Map()

  quarterlyFees.forEach((record) => {
    const linkedMemberIds = resolveLinkedMemberIds(record, siblingGroupMap)
    const familyKey = `${record.year_quarter}:${linkedMemberIds.join('|') || record.id}`
    const familyRecords = familyGroups.get(familyKey) || []

    familyRecords.push({
      ...record,
      linkedMemberIds
    })

    familyGroups.set(familyKey, familyRecords)
  })

  const feeUpdates = []
  const duplicateDeletes = []

  familyGroups.forEach((records) => {
    const canonicalRecord = selectCanonicalRecord(records)
    const normalizedMemberIds = canonicalRecord.linkedMemberIds.length > 1
      ? canonicalRecord.linkedMemberIds
      : toSiblingIdList(canonicalRecord.member_ids).length > 0
        ? toSiblingIdList(canonicalRecord.member_ids)
        : toSiblingIdList(canonicalRecord.member_id ? [canonicalRecord.member_id] : [])

    if (!sameIdList(canonicalRecord.member_ids, normalizedMemberIds)) {
      feeUpdates.push({
        id: canonicalRecord.id,
        member_id: canonicalRecord.member_id,
        member_ids: normalizedMemberIds,
        linked_member_ids: canonicalRecord.linkedMemberIds
      })
    }

    records
      .filter((record) => record.id !== canonicalRecord.id)
      .forEach((record) => {
        duplicateDeletes.push({
          id: record.id,
          keep_id: canonicalRecord.id,
          linked_member_ids: record.linkedMemberIds
        })
      })
  })

  console.log(JSON.stringify({
    mode: isWriteMode ? 'write' : 'dry-run',
    quarter: quarterLabel,
    sibling_updates: siblingUpdates,
    quarterly_fee_updates: feeUpdates,
    duplicate_fee_records_to_delete: duplicateDeletes
  }, null, 2))

  if (!isWriteMode) {
    return
  }

  for (const update of siblingUpdates) {
    const { error } = await supabase
      .from('team_members')
      .update({
        sibling_ids: update.sibling_ids
      })
      .eq('id', update.id)

    if (error) throw error
  }

  for (const update of feeUpdates) {
    const { error } = await supabase
      .from('quarterly_fees')
      .update({
        member_ids: update.member_ids
      })
      .eq('id', update.id)

    if (error) throw error
  }

  for (const duplicate of duplicateDeletes) {
    const { error } = await supabase
      .from('quarterly_fees')
      .delete()
      .eq('id', duplicate.id)

    if (error) throw error
  }

  console.log(`Applied ${siblingUpdates.length} sibling updates, ${feeUpdates.length} quarterly fee updates, and deleted ${duplicateDeletes.length} duplicate quarterly fee records.`)
}

run().catch((error) => {
  console.error(error)
  process.exit(1)
})
