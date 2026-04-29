import type { LineupEntry } from '@/types/match'

export const FIELD_SLOT_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const
export const SPECIAL_SLOT_KEYS = ['DH', '預備'] as const

export type FieldSlotKey = typeof FIELD_SLOT_KEYS[number]
export type SpecialSlotKey = typeof SPECIAL_SLOT_KEYS[number]
export type LineupPositionKey = FieldSlotKey | SpecialSlotKey

export interface FieldSlotLayout {
  key: FieldSlotKey
  shortLabel: string
  label: string
  top: string
  left: string
}

export interface PlayerMeta {
  name?: string
  number?: string | number | null
  photo_url?: string | null
  avatar_url?: string | null
}

export interface EditableFieldPlayer {
  editorId: string
  order: number
  position: LineupPositionKey
  name: string
  number: string
  remark: string
  photoUrl: string
  initials: string
}

export interface HiddenLineupEntry {
  order: number
  position: string
  name: ''
  number: string
  remark: string
}

export const FIELD_SLOT_LAYOUT: FieldSlotLayout[] = [
  { key: '8', shortLabel: 'CF', label: '中外野', top: '12%', left: '50%' },
  { key: '7', shortLabel: 'LF', label: '左外野', top: '20%', left: '20%' },
  { key: '9', shortLabel: 'RF', label: '右外野', top: '20%', left: '80%' },
  { key: '6', shortLabel: 'SS', label: '游擊', top: '39%', left: '34%' },
  { key: '4', shortLabel: '2B', label: '二壘', top: '39%', left: '66%' },
  { key: '5', shortLabel: '3B', label: '三壘', top: '58%', left: '19%' },
  { key: '1', shortLabel: 'P', label: '投手丘', top: '54%', left: '50%' },
  { key: '3', shortLabel: '1B', label: '一壘', top: '58%', left: '81%' },
  { key: '2', shortLabel: 'C', label: '捕手', top: '83%', left: '50%' }
]

const ALL_SLOT_KEYS = new Set<string>([...FIELD_SLOT_KEYS, ...SPECIAL_SLOT_KEYS])

let nextEditorId = 1

const cloneLineupPlayer = (player: Partial<LineupEntry> = {}) => ({
  order: Number(player.order) || 0,
  position: String(player.position || '').trim(),
  name: String(player.name || '').trim(),
  number: String(player.number || '').trim(),
  remark: String(player.remark || '').trim()
})

export const normalizeLineupPosition = (position = ''): LineupPositionKey => {
  const normalized = String(position || '').trim()
  if (!normalized) return '預備'
  if (ALL_SLOT_KEYS.has(normalized)) return normalized as LineupPositionKey
  return '預備'
}

export const getFieldPlayerSignature = (player: Partial<LineupEntry | EditableFieldPlayer> = {}) =>
  [
    String(player.name || '').trim(),
    String(player.number || '').trim(),
    String(player.remark || '').trim()
  ].join('::')

export const getPlayerInitials = (name = '') => {
  const trimmed = String(name || '').trim()
  if (!trimmed) return '?'
  if (trimmed.length <= 2) return trimmed
  return trimmed.slice(-2)
}

const buildEditorIdBuckets = (players: EditableFieldPlayer[] = []) => {
  const buckets = new Map<string, string>()
  const counts = new Map<string, number>()

  players.forEach((player) => {
    const signature = getFieldPlayerSignature(player)
    const occurrence = counts.get(signature) || 0
    counts.set(signature, occurrence + 1)
    buckets.set(`${signature}::${occurrence}`, player.editorId)
  })

  return buckets
}

const getNextEditorId = () => {
  const id = `field-editor-${nextEditorId}`
  nextEditorId += 1
  return id
}

export const buildEditableFieldPlayers = (
  lineup: LineupEntry[] = [],
  playerMetaByName: Record<string, PlayerMeta> = {},
  previousPlayers: EditableFieldPlayer[] = []
) => {
  const existingBuckets = buildEditorIdBuckets(previousPlayers)
  const signatureCounts = new Map<string, number>()
  const usedSlots = new Set<LineupPositionKey>()
  const hiddenEntries: HiddenLineupEntry[] = []
  const editorPlayers: EditableFieldPlayer[] = []

  ;(Array.isArray(lineup) ? lineup : []).forEach((rawPlayer) => {
    const player = cloneLineupPlayer(rawPlayer)
    if (!player.name) {
      hiddenEntries.push({ ...player, name: '' })
      return
    }

    const signature = getFieldPlayerSignature(player)
    const occurrence = signatureCounts.get(signature) || 0
    signatureCounts.set(signature, occurrence + 1)
    const bucketKey = `${signature}::${occurrence}`
    const normalizedName = player.name.trim()
    const meta = playerMetaByName[normalizedName] || {}
    const requestedPosition = normalizeLineupPosition(player.position)
    const safePosition = requestedPosition !== '預備' && usedSlots.has(requestedPosition)
      ? '預備'
      : requestedPosition

    if (safePosition !== '預備') {
      usedSlots.add(safePosition)
    }

    editorPlayers.push({
      editorId: existingBuckets.get(bucketKey) || getNextEditorId(),
      order: player.order,
      position: safePosition,
      name: normalizedName,
      number: player.number || String(meta.number || '').trim(),
      remark: player.remark,
      photoUrl: String(meta.photo_url || meta.avatar_url || '').trim(),
      initials: getPlayerInitials(normalizedName)
    })
  })

  editorPlayers.sort((left, right) => {
    const leftOrder = Number(left.order) || Number.MAX_SAFE_INTEGER
    const rightOrder = Number(right.order) || Number.MAX_SAFE_INTEGER
    if (leftOrder !== rightOrder) return leftOrder - rightOrder
    return String(left.name || '').localeCompare(String(right.name || ''), 'zh-Hant')
  })

  return {
    editorPlayers: editorPlayers.map((player, index) => ({
      ...player,
      order: index + 1
    })),
    hiddenEntries
  }
}

export const buildFieldSlotMap = (players: EditableFieldPlayer[] = []) => {
  const slotMap = Object.fromEntries(
    FIELD_SLOT_LAYOUT.map((slot) => [slot.key, null])
  ) as Record<FieldSlotKey, EditableFieldPlayer | null>

  ;(Array.isArray(players) ? players : []).forEach((player) => {
    const position = normalizeLineupPosition(player.position)
    if (FIELD_SLOT_KEYS.includes(position as FieldSlotKey) && !slotMap[position as FieldSlotKey]) {
      slotMap[position as FieldSlotKey] = player
    }
  })

  return slotMap
}

export const moveEditablePlayerToSlot = (
  players: EditableFieldPlayer[] = [],
  editorId: string,
  targetPosition: string
) => {
  const normalizedTarget = normalizeLineupPosition(targetPosition)
  const nextPlayers = (Array.isArray(players) ? players : []).map((player) => ({ ...player }))
  const sourceIndex = nextPlayers.findIndex((player) => player.editorId === editorId)

  if (sourceIndex === -1) return nextPlayers

  const sourcePlayer = nextPlayers[sourceIndex]
  const previousPosition = normalizeLineupPosition(sourcePlayer.position)

  if (normalizedTarget === previousPosition) return nextPlayers

  if (normalizedTarget === '預備') {
    sourcePlayer.position = '預備'
    return nextPlayers
  }

  const targetIndex = nextPlayers.findIndex((player, index) =>
    index !== sourceIndex && normalizeLineupPosition(player.position) === normalizedTarget
  )

  if (targetIndex === -1) {
    sourcePlayer.position = normalizedTarget
    return nextPlayers
  }

  nextPlayers[sourceIndex].position = normalizedTarget
  nextPlayers[targetIndex].position = previousPosition === '預備' ? '預備' : previousPosition

  return nextPlayers
}

export const reorderEditablePlayers = (players: EditableFieldPlayer[] = [], orderedIds: string[] = []) => {
  const currentPlayers = (Array.isArray(players) ? players : []).map((player) => ({ ...player }))
  const playerById = new Map(currentPlayers.map((player) => [player.editorId, player]))
  const orderedPlayers: EditableFieldPlayer[] = []

  orderedIds.forEach((editorId) => {
    const player = playerById.get(editorId)
    if (!player) return
    orderedPlayers.push(player)
    playerById.delete(editorId)
  })

  playerById.forEach((player) => {
    orderedPlayers.push(player)
  })

  return orderedPlayers.map((player, index) => ({
    ...player,
    order: index + 1
  }))
}

export const mergeEditablePlayersWithHiddenEntries = (
  players: EditableFieldPlayer[] = [],
  hiddenEntries: HiddenLineupEntry[] = []
): LineupEntry[] => {
  const visiblePlayers = (Array.isArray(players) ? players : [])
    .map((player) => ({
      order: Number(player.order) || 0,
      position: normalizeLineupPosition(player.position),
      name: String(player.name || '').trim(),
      number: String(player.number || '').trim(),
      remark: String(player.remark || '').trim()
    }))
    .filter((player) => player.name)
    .sort((left, right) => left.order - right.order)
    .map((player, index) => ({
      ...player,
      order: index + 1
    }))

  const trailingEntries = (Array.isArray(hiddenEntries) ? hiddenEntries : []).map((player, index) => ({
    order: visiblePlayers.length + index + 1,
    position: String(player.position || '').trim(),
    name: '',
    number: String(player.number || '').trim(),
    remark: String(player.remark || '').trim()
  }))

  return [...visiblePlayers, ...trailingEntries]
}
