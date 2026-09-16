type OrderableEquipment = { id: string; created_at?: string }

// Unordered/new items follow the saved list, newest first, with a stable ID tie-breaker.
export const sortEquipments = <T extends OrderableEquipment>(items: T[], orderedIds: string[]): T[] => {
  const positions = new Map(orderedIds.map((id, index) => [id, index]))
  return [...items].sort((left, right) => {
    const leftPosition = positions.get(left.id)
    const rightPosition = positions.get(right.id)
    if (leftPosition !== undefined || rightPosition !== undefined) {
      return (leftPosition ?? Infinity) - (rightPosition ?? Infinity)
    }
    const dateDifference = (Date.parse(right.created_at || '') || 0) - (Date.parse(left.created_at || '') || 0)
    return dateDifference || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
  })
}

export const moveEquipment = <T>(items: T[], from: number, to: number): T[] => {
  const next = [...items]
  if (!Number.isInteger(from) || !Number.isInteger(to) || from < 0 || to < 0 || from >= next.length || to >= next.length) return next
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}
