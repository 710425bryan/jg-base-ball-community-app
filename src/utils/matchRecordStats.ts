import type { AbsentPlayer, BattingStat, MatchRecord, PitchingStat } from '@/types/match'

export interface MatchRosterMeta {
  name: string
  number?: string | null
  jersey_number?: string | null
  category?: string | null
  team_group?: string | null
  role?: string | null
  status?: string | null
}

export interface TournamentBattingRow {
  name: string
  pa: number
  ab: number
  h: number
  h1: number
  h2: number
  h3: number
  hr: number
  rbi: number
  r: number
  bb: number
  hbp: number
  so: number
  sb: number
  avg: number
  obp: number
  slg: number
  ops: number
}

export interface TournamentPitchingRow {
  name: string
  ip_outs: number
  formattedIP: string
  h: number
  h2: number
  h3: number
  hr: number
  r: number
  er: number
  bb: number
  so: number
  np: number
  ab: number
  go: number
  ao: number
  hasDetailed: boolean
  baa: number
  slga: number
  era: string
  go_ao: string
}

export interface TournamentBattingGameRow extends TournamentBattingRow {
  matchId: string
  match_name?: string
  tournament_name?: string | null
  match_date: string
  opponent: string
  result: string
}

export interface TournamentPitchingGameRow extends TournamentPitchingRow {
  matchId: string
  match_name?: string
  tournament_name?: string | null
  match_date: string
  opponent: string
  result: string
}

export interface PlayerMatchIdentity {
  name: string
  jersey_number?: string | number | null
  number?: string | number | null
}

export interface MatchAttendanceRow {
  name: string
  number: string
  category: string
  calledUp: number
  attended: number
  absentTotal: number
  absentLevel1: number
  absentLevel2: number
  absentLevel3: number
  absentOther: number
  attendanceRate: number
}

const toNumber = (value: unknown) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const normalizeName = (value: unknown) => String(value || '').trim()

const normalizeNumber = (value: unknown) => String(value ?? '').trim().replace(/^#/, '')

const normalizeArrayField = <T>(value: T[] | string | null | undefined): T[] => {
  if (Array.isArray(value)) return value

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  return []
}

const parsePlayerNames = (value?: string | null) =>
  String(value || '')
    .split(/[,，、\n]/)
    .map(normalizeName)
    .filter(Boolean)

const normalizeAbsentPlayers = (value: MatchRecord['absent_players'] | string | null | undefined) =>
  normalizeArrayField<AbsentPlayer | string>(value).map((entry) => {
    if (typeof entry === 'string') {
      return { name: normalizeName(entry), type: '請假' }
    }

    return {
      name: normalizeName(entry?.name),
      type: normalizeName(entry?.type) || '請假'
    }
  }).filter((entry) => entry.name)

const getStatsArray = <T>(value: T[] | string | null | undefined) => normalizeArrayField<T>(value)

const getMatchStatGroupName = (match: MatchRecord) =>
  normalizeName(match.tournament_name) || normalizeName(match.match_name)

const getPlayerNumber = (player: PlayerMatchIdentity) =>
  normalizeNumber(player.jersey_number || player.number)

const isPlayerName = (value: unknown, playerName: string) =>
  Boolean(playerName) && normalizeName(value) === playerName

const isPlayerStat = (
  stat: BattingStat | PitchingStat,
  playerName: string,
  playerNumber: string
) => (
  isPlayerName(stat.name, playerName) ||
  (Boolean(playerNumber) && normalizeNumber(stat.number) === playerNumber)
)

const getLineupEntries = (match: MatchRecord) => [
  ...normalizeArrayField(match.lineup),
  ...normalizeArrayField(match.current_lineup)
]

const getMatchResultLabel = (match: MatchRecord) => {
  if (match.home_score > match.opponent_score) return `勝 ${match.home_score}-${match.opponent_score}`
  if (match.home_score < match.opponent_score) return `敗 ${match.home_score}-${match.opponent_score}`
  return `和 ${match.home_score}-${match.opponent_score}`
}

const createEmptyBattingRow = (name: string): TournamentBattingRow => ({
  name,
  pa: 0,
  ab: 0,
  h: 0,
  h1: 0,
  h2: 0,
  h3: 0,
  hr: 0,
  rbi: 0,
  r: 0,
  bb: 0,
  hbp: 0,
  so: 0,
  sb: 0,
  avg: 0,
  obp: 0,
  slg: 0,
  ops: 0
})

const addBattingStat = (row: TournamentBattingRow, stat: BattingStat) => {
  const h1 = toNumber(stat.h1)
  const h2 = toNumber(stat.h2)
  const h3 = toNumber(stat.h3)
  const hr = toNumber(stat.hr)
  const detailedHits = h1 + h2 + h3 + hr
  const totalHits = Math.max(toNumber((stat as BattingStat & { h?: unknown }).h), detailedHits)
  const legacySingles = Math.max(totalHits - detailedHits, 0)

  row.pa += toNumber(stat.pa)
  row.ab += toNumber(stat.ab)
  row.h += totalHits
  row.h1 += h1 + legacySingles
  row.h2 += h2
  row.h3 += h3
  row.hr += hr
  row.rbi += toNumber(stat.rbi)
  row.r += toNumber(stat.r)
  row.bb += toNumber(stat.bb)
  row.hbp += toNumber(stat.hbp)
  row.so += toNumber(stat.so)
  row.sb += toNumber(stat.sb)
}

const finalizeBattingRow = <T extends TournamentBattingRow>(row: T): T => {
  const totalBases = row.h1 + row.h2 * 2 + row.h3 * 3 + row.hr * 4
  const avg = row.ab > 0 ? row.h / row.ab : 0
  const obp = row.pa > 0 ? (row.h + row.bb + row.hbp) / row.pa : 0
  const slg = row.ab > 0 ? totalBases / row.ab : 0

  return {
    ...row,
    avg,
    obp,
    slg,
    ops: obp + slg
  }
}

const createEmptyPitchingRow = (name: string): Omit<TournamentPitchingRow, 'formattedIP' | 'baa' | 'slga' | 'era' | 'go_ao'> => ({
  name,
  ip_outs: 0,
  h: 0,
  h2: 0,
  h3: 0,
  hr: 0,
  r: 0,
  er: 0,
  bb: 0,
  so: 0,
  np: 0,
  ab: 0,
  go: 0,
  ao: 0,
  hasDetailed: false
})

const addPitchingStat = (
  row: Omit<TournamentPitchingRow, 'formattedIP' | 'baa' | 'slga' | 'era' | 'go_ao'>,
  stat: PitchingStat
) => {
  row.ip_outs += toNumber(stat.ip)
  row.h += toNumber(stat.h)
  row.h2 += toNumber(stat.h2)
  row.h3 += toNumber(stat.h3)
  row.hr += toNumber(stat.hr)
  row.r += toNumber(stat.r)
  row.er += toNumber(stat.er)
  row.bb += toNumber(stat.bb)
  row.so += toNumber(stat.so)
  row.np += toNumber(stat.np)
  row.ab += toNumber(stat.ab)
  row.go += toNumber(stat.go)
  row.ao += toNumber(stat.ao)
  row.hasDetailed = row.hasDetailed || ['ab', 'h2', 'h3', 'go', 'ao'].some((key) => key in stat)
}

const finalizePitchingRow = <T extends Omit<TournamentPitchingRow, 'formattedIP' | 'baa' | 'slga' | 'era' | 'go_ao'>>(row: T): T & Pick<TournamentPitchingRow, 'formattedIP' | 'baa' | 'slga' | 'era' | 'go_ao'> => {
  const assumedSingles = Math.max(row.h - row.h2 - row.h3 - row.hr, 0)
  const baa = row.hasDetailed && row.ab > 0 ? row.h / row.ab : 0
  const slga = row.hasDetailed && row.ab > 0 ? (assumedSingles + row.h2 * 2 + row.h3 * 3 + row.hr * 4) / row.ab : 0
  const era = row.ip_outs > 0 ? ((row.er * 7) / (row.ip_outs / 3)).toFixed(2) : '0.00'
  const go_ao = row.hasDetailed
    ? (row.ao === 0 ? (row.go > 0 ? 'MAX' : '0.00') : (row.go / row.ao).toFixed(2))
    : '0.00'

  return {
    ...row,
    formattedIP: formatInnings(row.ip_outs),
    baa,
    slga,
    era,
    go_ao
  }
}

export const formatInnings = (outs: number) => {
  const parsedOuts = Math.max(0, toNumber(outs))
  return `${Math.floor(parsedOuts / 3)}.${parsedOuts % 3}`
}

export const getTournamentNames = (matches: MatchRecord[]) =>
  Array.from(
    new Set(
      matches
        .map(getMatchStatGroupName)
        .filter(Boolean)
    )
  ).sort((left, right) => right.localeCompare(left, 'zh-Hant'))

export const filterMatchesByTournament = (matches: MatchRecord[], tournamentName: string) =>
  matches.filter((match) => getMatchStatGroupName(match) === tournamentName)

export const doesMatchIncludePlayer = (match: MatchRecord, player: PlayerMatchIdentity) => {
  const playerName = normalizeName(player.name)
  if (!playerName) return false

  const playerNumber = getPlayerNumber(player)

  return (
    parsePlayerNames(match.players).some((name) => isPlayerName(name, playerName)) ||
    getLineupEntries(match).some((entry) => isPlayerName((entry as any)?.name, playerName)) ||
    normalizeAbsentPlayers(match.absent_players).some((entry) => isPlayerName(entry.name, playerName)) ||
    getStatsArray<BattingStat>(match.batting_stats).some((stat) => isPlayerStat(stat, playerName, playerNumber)) ||
    getStatsArray<PitchingStat>(match.pitching_stats).some((stat) => isPlayerStat(stat, playerName, playerNumber))
  )
}

export const filterMatchesForPlayer = (matches: MatchRecord[], player: PlayerMatchIdentity) =>
  matches.filter((match) => doesMatchIncludePlayer(match, player))

export const filterPlayerStatMatches = (matches: MatchRecord[]) =>
  matches.filter((match) => match.match_level !== '特訓課')

export const summarizePlayerBattingStats = (
  matches: MatchRecord[],
  player: PlayerMatchIdentity
) => {
  const playerName = normalizeName(player.name)
  const playerNumber = getPlayerNumber(player)
  const row = createEmptyBattingRow(playerName)

  if (!playerName) {
    return finalizeBattingRow(row)
  }

  filterPlayerStatMatches(matches).forEach((match) => {
    getStatsArray<BattingStat>(match.batting_stats)
      .filter((stat) => isPlayerStat(stat, playerName, playerNumber))
      .forEach((stat) => addBattingStat(row, stat))
  })

  return finalizeBattingRow(row)
}

export const summarizePlayerPitchingStats = (
  matches: MatchRecord[],
  player: PlayerMatchIdentity
) => {
  const playerName = normalizeName(player.name)
  const playerNumber = getPlayerNumber(player)
  const row = createEmptyPitchingRow(playerName)

  if (!playerName) {
    return finalizePitchingRow(row)
  }

  filterPlayerStatMatches(matches).forEach((match) => {
    getStatsArray<PitchingStat>(match.pitching_stats)
      .filter((stat) => isPlayerStat(stat, playerName, playerNumber))
      .forEach((stat) => addPitchingStat(row, stat))
  })

  return finalizePitchingRow(row)
}

export const aggregateTournamentBattingStats = (matches: MatchRecord[]): TournamentBattingRow[] => {
  const rows = new Map<string, TournamentBattingRow>()

  matches.forEach((match) => {
    getStatsArray<BattingStat>(match.batting_stats).forEach((stat) => {
      const name = normalizeName(stat.name)
      if (!name) return

      if (!rows.has(name)) {
        rows.set(name, createEmptyBattingRow(name))
      }

      addBattingStat(rows.get(name)!, stat)
    })
  })

  return Array.from(rows.values())
    .map(finalizeBattingRow)
    .sort((left, right) => right.pa - left.pa || right.ops - left.ops || left.name.localeCompare(right.name, 'zh-Hant'))
}

export const aggregateTournamentPitchingStats = (matches: MatchRecord[]): TournamentPitchingRow[] => {
  const rows = new Map<string, Omit<TournamentPitchingRow, 'formattedIP' | 'baa' | 'slga' | 'era' | 'go_ao'>>()

  matches.forEach((match) => {
    getStatsArray<PitchingStat>(match.pitching_stats).forEach((stat) => {
      const name = normalizeName(stat.name)
      if (!name) return

      if (!rows.has(name)) {
        rows.set(name, createEmptyPitchingRow(name))
      }

      addPitchingStat(rows.get(name)!, stat)
    })
  })

  return Array.from(rows.values())
    .map(finalizePitchingRow)
    .sort((left, right) => right.ip_outs - left.ip_outs || Number(left.era) - Number(right.era) || left.name.localeCompare(right.name, 'zh-Hant'))
}

export const getTournamentPlayerBattingGameRows = (
  matches: MatchRecord[],
  playerName: string
): TournamentBattingGameRow[] => {
  const targetName = normalizeName(playerName)
  if (!targetName) return []

  return matches
    .map((match) => {
      const row: TournamentBattingGameRow = {
        ...createEmptyBattingRow(targetName),
        matchId: match.id,
        match_date: match.match_date || '',
        opponent: match.opponent || '',
        result: getMatchResultLabel(match)
      }

      getStatsArray<BattingStat>(match.batting_stats)
        .filter((stat) => normalizeName(stat.name) === targetName)
        .forEach((stat) => addBattingStat(row, stat))

      return row.pa > 0 || row.ab > 0
        ? finalizeBattingRow(row)
        : null
    })
    .filter((row): row is TournamentBattingGameRow => Boolean(row))
    .sort((left, right) => left.match_date.localeCompare(right.match_date) || left.opponent.localeCompare(right.opponent, 'zh-Hant'))
}

export const getPlayerBattingGameRows = (
  matches: MatchRecord[],
  player: PlayerMatchIdentity
): TournamentBattingGameRow[] => {
  const targetName = normalizeName(player.name)
  const targetNumber = getPlayerNumber(player)
  if (!targetName) return []

  return filterPlayerStatMatches(matches)
    .map((match) => {
      const row: TournamentBattingGameRow = {
        ...createEmptyBattingRow(targetName),
        matchId: match.id,
        match_name: match.match_name || '',
        tournament_name: match.tournament_name || null,
        match_date: match.match_date || '',
        opponent: match.opponent || '',
        result: getMatchResultLabel(match)
      }

      getStatsArray<BattingStat>(match.batting_stats)
        .filter((stat) => isPlayerStat(stat, targetName, targetNumber))
        .forEach((stat) => addBattingStat(row, stat))

      return row.pa > 0 || row.ab > 0
        ? finalizeBattingRow(row)
        : null
    })
    .filter((row): row is TournamentBattingGameRow => Boolean(row))
    .sort((left, right) => right.match_date.localeCompare(left.match_date) || left.opponent.localeCompare(right.opponent, 'zh-Hant'))
}

export const getTournamentPlayerPitchingGameRows = (
  matches: MatchRecord[],
  playerName: string
): TournamentPitchingGameRow[] => {
  const targetName = normalizeName(playerName)
  if (!targetName) return []

  return matches
    .map((match) => {
      const row = {
        ...createEmptyPitchingRow(targetName),
        matchId: match.id,
        match_date: match.match_date || '',
        opponent: match.opponent || '',
        result: getMatchResultLabel(match)
      }

      getStatsArray<PitchingStat>(match.pitching_stats)
        .filter((stat) => normalizeName(stat.name) === targetName)
        .forEach((stat) => addPitchingStat(row, stat))

      return row.ip_outs > 0 || row.np > 0 || row.ab > 0
        ? finalizePitchingRow(row)
        : null
    })
    .filter((row): row is TournamentPitchingGameRow => Boolean(row))
    .sort((left, right) => left.match_date.localeCompare(right.match_date) || left.opponent.localeCompare(right.opponent, 'zh-Hant'))
}

export const getPlayerPitchingGameRows = (
  matches: MatchRecord[],
  player: PlayerMatchIdentity
): TournamentPitchingGameRow[] => {
  const targetName = normalizeName(player.name)
  const targetNumber = getPlayerNumber(player)
  if (!targetName) return []

  return filterPlayerStatMatches(matches)
    .map<TournamentPitchingGameRow | null>((match) => {
      const row = {
        ...createEmptyPitchingRow(targetName),
        matchId: match.id,
        match_name: match.match_name || '',
        tournament_name: match.tournament_name || null,
        match_date: match.match_date || '',
        opponent: match.opponent || '',
        result: getMatchResultLabel(match)
      }

      getStatsArray<PitchingStat>(match.pitching_stats)
        .filter((stat) => isPlayerStat(stat, targetName, targetNumber))
        .forEach((stat) => addPitchingStat(row, stat))

      return row.ip_outs > 0 || row.np > 0 || row.ab > 0
        ? finalizePitchingRow(row)
        : null
    })
    .filter((row): row is TournamentPitchingGameRow => row !== null)
    .sort((left, right) => right.match_date.localeCompare(left.match_date) || left.opponent.localeCompare(right.opponent, 'zh-Hant'))
}

export const calculateMatchAttendanceStats = (
  matches: MatchRecord[],
  roster: MatchRosterMeta[] = []
): MatchAttendanceRow[] => {
  const rosterByName = new Map(
    roster
      .map((player) => [normalizeName(player.name), player] as const)
      .filter(([name]) => Boolean(name))
  )

  const rows = new Map<string, MatchAttendanceRow>()

  const ensureRow = (name: string) => {
    if (!rows.has(name)) {
      const meta = rosterByName.get(name)
      rows.set(name, {
        name,
        number: normalizeName(meta?.number || meta?.jersey_number),
        category: normalizeName(meta?.category || meta?.team_group || meta?.role),
        calledUp: 0,
        attended: 0,
        absentTotal: 0,
        absentLevel1: 0,
        absentLevel2: 0,
        absentLevel3: 0,
        absentOther: 0,
        attendanceRate: 0
      })
    }

    return rows.get(name)!
  }

  matches.forEach((match) => {
    parsePlayerNames(match.players).forEach((name) => {
      const row = ensureRow(name)
      row.calledUp += 1
      row.attended += 1
    })

    normalizeAbsentPlayers(match.absent_players).forEach((player) => {
      const row = ensureRow(player.name)
      row.calledUp += 1
      row.absentTotal += 1

      if (match.match_level === '一級') row.absentLevel1 += 1
      else if (match.match_level === '二級') row.absentLevel2 += 1
      else if (match.match_level === '三級') row.absentLevel3 += 1
      else row.absentOther += 1
    })
  })

  return Array.from(rows.values())
    .filter((row) => row.calledUp > 0)
    .map((row) => ({
      ...row,
      attendanceRate: row.calledUp > 0 ? Math.round((row.attended / row.calledUp) * 1000) / 10 : 0
    }))
    .sort((left, right) => right.attendanceRate - left.attendanceRate || right.calledUp - left.calledUp || left.name.localeCompare(right.name, 'zh-Hant'))
}
