import type { LineupEntry } from '@/types/match'

export interface ParsedLineupItem {
  order?: number | string | null
  position?: string | number | null
  name?: string | null
  number?: string | number | null
}

export interface ParsedReserveItem {
  name?: string | null
  number?: string | number | null
}

export interface ParsedLineupResponse {
  lineup?: ParsedLineupItem[] | null
  reserves?: ParsedReserveItem[] | null
}

export interface RosterCandidate {
  name: string
  uniform_number: string
}

export interface RosterCandidateInput {
  name?: string | null
  jersey_number?: string | number | null
  number?: string | number | null
  uniform_number?: string | number | null
}

export interface LineupPlayerOption {
  id?: string
  name: string
  number?: string
  label?: string
}

export interface LineupScanImage {
  dataUrl: string
  mimeType: string
}

const DEFAULT_STARTER_COUNT = 9
const LINEUP_IMAGE_MIME_TYPE = 'image/jpeg'

const normalizeText = (value: unknown) => String(value ?? '').trim()

const createEmptyLineupRow = (order: number): LineupEntry => ({
  order,
  position: '',
  name: '',
  number: ''
})

const scoreParsedLineupItem = (item: LineupEntry) =>
  (item.name ? 4 : 0) + (item.position ? 2 : 0) + (item.number ? 1 : 0)

export const buildRosterCandidates = ({
  selectedPlayers = [],
  playerOptions = [],
  lineups = [],
  limit = 40
}: {
  selectedPlayers?: string[]
  playerOptions?: RosterCandidateInput[]
  lineups?: Array<LineupEntry[] | undefined | null>
  limit?: number
}) => {
  const numberByName = new Map<string, string>()
  const candidates = new Map<string, RosterCandidate>()

  const rememberNumber = (nameValue: unknown, numberValue?: unknown) => {
    const name = normalizeText(nameValue)
    if (!name) return

    const uniformNumber = normalizeText(numberValue)
    if (uniformNumber && !numberByName.has(name)) {
      numberByName.set(name, uniformNumber)
    }
  }

  playerOptions.forEach((player) => {
    rememberNumber(player.name, player.uniform_number ?? player.jersey_number ?? player.number)
  })
  lineups.forEach((lineup) => {
    lineup?.forEach((player) => rememberNumber(player.name, player.number))
  })
  selectedPlayers.forEach((nameValue) => {
    const name = normalizeText(nameValue)
    if (!name || candidates.has(name)) return
    candidates.set(name, { name, uniform_number: numberByName.get(name) || '' })
  })

  return Array.from(candidates.values()).slice(0, limit)
}

export const buildLineupRowsFromParsedResult = (
  parsedResult: ParsedLineupResponse | null | undefined,
  starterCount = DEFAULT_STARTER_COUNT
) => {
  const starters = Array.from({ length: starterCount }, (_, index) => createEmptyLineupRow(index + 1))
  const lineupByOrder = new Map<number, LineupEntry>()

  if (Array.isArray(parsedResult?.lineup)) {
    parsedResult.lineup.forEach((item) => {
      const order = Number(item?.order)
      if (!Number.isInteger(order) || order < 1 || order > starterCount) return

      const candidate: LineupEntry = {
        order,
        position: normalizeText(item?.position),
        name: normalizeText(item?.name),
        number: normalizeText(item?.number)
      }

      const existing = lineupByOrder.get(order)
      if (!existing || scoreParsedLineupItem(candidate) > scoreParsedLineupItem(existing)) {
        lineupByOrder.set(order, candidate)
      }
    })
  }

  lineupByOrder.forEach((player, order) => {
    starters[order - 1] = player
  })

  const seenPlayerNames = new Set<string>()
  const playerNames: string[] = []
  const rememberPlayerName = (name: string) => {
    if (!name || seenPlayerNames.has(name)) return
    seenPlayerNames.add(name)
    playerNames.push(name)
  }

  starters.forEach((player) => rememberPlayerName(player.name))

  const reserves: LineupEntry[] = []
  if (Array.isArray(parsedResult?.reserves)) {
    parsedResult.reserves.forEach((item) => {
      const name = normalizeText(item?.name)
      if (!name || seenPlayerNames.has(name)) return

      const reserve: LineupEntry = {
        order: starterCount + reserves.length + 1,
        position: '預備',
        name,
        number: normalizeText(item?.number)
      }

      reserves.push(reserve)
      rememberPlayerName(name)
    })
  }

  const lineup = [...starters, ...reserves]

  return {
    lineup,
    playerNames,
    players: playerNames.join(',')
  }
}

export const imageBlobToLineupDataUrl = (
  blob: Blob,
  maxWidth = 1800,
  maxHeight = 2400,
  quality = 0.92
): Promise<LineupScanImage> => {
  return new Promise((resolve, reject) => {
    if (blob.type && !blob.type.startsWith('image/')) {
      reject(new Error('請選擇圖片檔案'))
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      const originalDataUrl = String(reader.result || '')
      const image = new Image()

      image.onload = () => {
        let { width, height } = image

        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height)
          width = Math.round(width * ratio)
          height = Math.round(height * ratio)
        }

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height

        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('圖片處理失敗，請稍後再試'))
          return
        }

        ctx.drawImage(image, 0, 0, width, height)
        resolve({
          dataUrl: canvas.toDataURL(LINEUP_IMAGE_MIME_TYPE, quality),
          mimeType: LINEUP_IMAGE_MIME_TYPE
        })
      }

      image.onerror = () => reject(new Error('圖片讀取失敗，請換一張照片再試'))
      image.src = originalDataUrl
    }
    reader.onerror = () => reject(new Error('圖片讀取失敗，請換一張照片再試'))
    reader.readAsDataURL(blob)
  })
}
