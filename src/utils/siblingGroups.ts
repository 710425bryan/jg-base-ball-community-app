export type SiblingNode = {
  id: string
  sibling_ids?: string[] | null
}

type LinkedMemberRecord = {
  member_id?: string | null
  member_ids?: string[] | null
}

const toSiblingIdList = (value: string[] | null | undefined) =>
  Array.isArray(value)
    ? value.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
    : []

const sortIds = (ids: Iterable<string>, orderMap: Map<string, number>) =>
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

export const buildSiblingGroupMap = <T extends SiblingNode>(nodes: T[]) => {
  const orderMap = new Map<string, number>()
  const adjacency = new Map<string, Set<string>>()

  nodes.forEach((node, index) => {
    orderMap.set(node.id, index)
    adjacency.set(node.id, new Set())
  })

  nodes.forEach((node) => {
    const siblingIds = toSiblingIdList(node.sibling_ids)

    siblingIds.forEach((siblingId) => {
      if (!adjacency.has(node.id) || !adjacency.has(siblingId) || siblingId === node.id) {
        return
      }

      adjacency.get(node.id)?.add(siblingId)
      adjacency.get(siblingId)?.add(node.id)
    })
  })

  const visited = new Set<string>()
  const siblingGroupMap = new Map<string, string[]>()

  nodes.forEach((node) => {
    if (visited.has(node.id)) return

    const queue = [node.id]
    const component = new Set<string>()
    visited.add(node.id)

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

export const getSiblingGroupIds = (
  memberId: string | null | undefined,
  siblingGroupMap: Map<string, string[]>
) => {
  if (!memberId) return []
  return siblingGroupMap.get(memberId) ?? [memberId]
}

export const normalizeSiblingIds = <T extends SiblingNode>(nodes: T[]) => {
  const siblingGroupMap = buildSiblingGroupMap(nodes)

  return nodes.map((node) => {
    const groupIds = getSiblingGroupIds(node.id, siblingGroupMap)

    return {
      ...node,
      sibling_ids: groupIds.filter((id) => id !== node.id)
    }
  })
}

export const buildSiblingIdPatchMap = <T extends SiblingNode>(nodes: T[]) => {
  const normalizedNodes = normalizeSiblingIds(nodes)

  return new Map(
    normalizedNodes.map((node) => [
      node.id,
      toSiblingIdList(node.sibling_ids)
    ])
  )
}

export const resolveLinkedMemberIds = (
  record: LinkedMemberRecord,
  siblingGroupMap: Map<string, string[]>
) => {
  const seedIds = toSiblingIdList(record.member_ids)
  const baseIds = seedIds.length > 0 ? seedIds : toSiblingIdList(record.member_id ? [record.member_id] : [])

  if (baseIds.length === 0) return []

  const linkedIds = new Set<string>()

  baseIds.forEach((memberId) => {
    getSiblingGroupIds(memberId, siblingGroupMap).forEach((linkedId) => {
      linkedIds.add(linkedId)
    })
  })

  const orderMap = new Map<string, number>()
  baseIds.forEach((id, index) => orderMap.set(id, index))

  getSiblingGroupIds(baseIds[0], siblingGroupMap).forEach((id, index) => {
    if (!orderMap.has(id)) {
      orderMap.set(id, baseIds.length + index)
    }
  })

  return sortIds(linkedIds, orderMap)
}
