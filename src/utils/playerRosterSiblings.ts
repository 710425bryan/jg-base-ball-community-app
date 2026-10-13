const validSiblingIds = (value: unknown): string[] => Array.isArray(value)
  ? value.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
  : []

export const getVisiblePlayerSiblingIds = (siblingIds: unknown, visibleIds: ReadonlySet<string>) =>
  validSiblingIds(siblingIds).filter((id) => visibleIds.has(id))

/** A filtered roster cannot decide that a relation to an invisible member is gone. */
export const mergeVisiblePlayerSiblingIds = (
  originalSiblingIds: unknown,
  nextVisibleSiblingIds: unknown,
  visibleIds: ReadonlySet<string>
) => [...new Set([
  ...getVisiblePlayerSiblingIds(nextVisibleSiblingIds, visibleIds),
  ...validSiblingIds(originalSiblingIds).filter((id) => !visibleIds.has(id))
])]
