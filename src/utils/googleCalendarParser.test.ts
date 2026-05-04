import { describe, expect, it } from 'vitest'
import {
  checkCalendarPlayersAgainstRoster,
  createMatchRecordInput,
  parseICalText,
  parseMatchRecord,
  planCalendarSync
} from './googleCalendarParser'
import type { MatchRecord } from '@/types/match'

const buildExistingMatch = (id: string, payload: ReturnType<typeof createMatchRecordInput>): MatchRecord => ({
  id,
  ...payload
})

describe('googleCalendarParser', () => {
  it('parses the final Google Calendar format into display-ready match data', () => {
    const parsed = parseMatchRecord({
      id: 'uid-final@google.com',
      summary: '1️⃣0️⃣就是棒春季聯賽 中港國小 V.S 華興小學 08:00-09:30',
      description: [
        '組別 / 類別：U12',
        '賽事等級：一級',
        '集合時間： 12:00',
        '盃賽名稱：',
        '帶隊教練：',
        '張教練',
        '',
        '參賽球員：',
        '15 尤丞洋',
        ' 2 楊晴恩',
        '17 朱睿軒',
        '10 張家樹',
        '11 張恩碩',
        '13 鍾淯茗',
        '12 吳洧榤',
        '20 王皓',
        '18 許郁澤',
        '19 陳柏叡',
        ' 3 何定洋',
        ' 9 李均浩',
        ' 8 謝準'
      ].join('\n'),
      location: '迪化壘球場, 103台灣臺北市大同區延平北路四段179號',
      startRaw: '20260328T000000Z',
      endRaw: '20260328T013000Z'
    })

    expect(parsed.id).toBe('uid-final@google.com')
    expect(parsed.title).toBe('就是棒春季聯賽 中港國小 V.S 華興小學')
    expect(parsed.matchName).toBe('就是棒春季聯賽')
    expect(parsed.tournamentName).toBe('就是棒春季聯賽')
    expect(parsed.opponent).toBe('華興小學')
    expect(parsed.date).toBe('2026-03-28')
    expect(parsed.startTime).toBe('08:00')
    expect(parsed.endTime).toBe('09:30')
    expect(parsed.matchTime).toBe('08:00 - 09:30')
    expect(parsed.location).toBe('迪化壘球場, 103台灣臺北市大同區延平北路四段179號')
    expect(parsed.category).toBe('U12')
    expect(parsed.level).toBe('一級')
    expect(parsed.gatherTime).toBe('12:00')
    expect(parsed.coaches).toEqual(['張教練'])
    expect(parsed.players[0]).toEqual({ number: '15', name: '尤丞洋' })
    expect(parsed.players.at(-1)).toEqual({ number: '8', name: '謝準' })

    expect(createMatchRecordInput(parsed).tournament_name).toBe('就是棒春季聯賽')
  })

  it('parses dynamic match fee amounts from calendar descriptions', () => {
    const parsed = parseMatchRecord({
      id: 'uid-fee@google.com',
      summary: 'U8 友誼賽 中港熊戰 vs 中港內戰',
      description: [
        '組別 / 類別：U8賽事',
        '賽事等級：三級',
        '集合時間：14:00',
        '盃賽名稱：中港內戰',
        '帶隊教練：',
        '吳教練、莊教練',
        '參賽球員：',
        '1.簡亦秀',
        '2.簡翌軒',
        '3.陳柏叡',
        '比賽費用: 250'
      ].join('\n'),
      location: '中港球場',
      startRaw: '20260502T060000Z',
      endRaw: '20260502T073000Z'
    })

    expect(parsed.matchFeeAmount).toBe(250)
    expect(parsed.players.map((player) => player.name)).toEqual(['簡亦秀', '簡翌軒', '陳柏叡'])
    expect(createMatchRecordInput(parsed).match_fee_amount).toBe(250)
  })

  it('does not treat match fee labels as players and supports amount on the next line', () => {
    const parsedWithNextLineAmount = parseMatchRecord({
      id: 'uid-fee-next-line@google.com',
      summary: 'U8 友誼賽 中港熊戰 vs 對手隊',
      description: [
        '參賽球員：',
        '1.簡亦秀',
        '2.簡翌軒',
        '比賽費用:',
        '300'
      ].join('\n'),
      location: '',
      startRaw: '20260505T060000Z',
      endRaw: '20260505T073000Z'
    })

    const parsedWithEmptyFee = parseMatchRecord({
      id: 'uid-fee-empty@google.com',
      summary: 'U8 友誼賽 中港熊戰 vs 對手隊',
      description: '參賽球員：\n1.簡亦秀\n比賽費用:',
      location: '',
      startRaw: '20260506T060000Z',
      endRaw: '20260506T073000Z'
    })

    expect(parsedWithNextLineAmount.matchFeeAmount).toBe(300)
    expect(parsedWithNextLineAmount.players.map((player) => player.name)).toEqual(['簡亦秀', '簡翌軒'])
    expect(parsedWithEmptyFee.matchFeeAmount).toBeNull()
    expect(parsedWithEmptyFee.players.map((player) => player.name)).toEqual(['簡亦秀'])
  })

  it('supports full-width fee colon, spacing, commas, and invalid fee values', () => {
    const parsedWithComma = parseMatchRecord({
      id: 'uid-fee-comma@google.com',
      summary: 'U10 友誼賽 中港熊戰 vs 對手隊',
      description: '參賽球員：\n1.簡亦秀\n比賽費用 ： 1,200',
      location: '',
      startRaw: '20260503T060000Z',
      endRaw: '20260503T073000Z'
    })

    const parsedWithInvalidFee = parseMatchRecord({
      id: 'uid-fee-invalid@google.com',
      summary: 'U10 友誼賽 中港熊戰 vs 對手隊',
      description: '參賽球員：\n1.簡亦秀\n比賽費用：免費',
      location: '',
      startRaw: '20260504T060000Z',
      endRaw: '20260504T073000Z'
    })

    expect(parsedWithComma.matchFeeAmount).toBe(1200)
    expect(createMatchRecordInput(parsedWithComma).match_fee_amount).toBe(1200)
    expect(parsedWithInvalidFee.matchFeeAmount).toBeNull()
    expect(parsedWithInvalidFee.players.map((player) => player.name)).toEqual(['簡亦秀'])
    expect(createMatchRecordInput(parsedWithInvalidFee).match_fee_amount).toBeNull()
  })

  it('parses folded iCal text, title variants, and numbered player lines from real-world samples', () => {
    const parsedMatches = parseICalText(`BEGIN:VCALENDAR
BEGIN:VEVENT
DTSTART:20260419T083000Z
DTEND:20260419T093000Z
UID:folded-uid@google.com
DESCRIPTION:組別 / 類別：U8\\n賽事等級：一級\\n集合時間： 16:30\\n盃賽名稱：就是棒春季聯賽U8組\\n帶隊教練：\\n吳教練\\n
 莊教練\\n參賽球員：\\n1.賴虹臻99\\n10.謝準55\\n1
 1.游茗皓74
LOCATION:迪化壘球場\\, 103台灣臺北市大同區延平北路四段179號
SUMMARY:U8 就是棒 Dream Young(鯊) vs 中港熊戰
END:VEVENT
BEGIN:VEVENT
DTSTART:20260314T050000Z
DTEND:20260314T090000Z
UID:no-vs-uid@google.com
SUMMARY:第一屆熊戰邀請賽
END:VEVENT
END:VCALENDAR`)

    expect(parsedMatches).toHaveLength(2)

    expect(parsedMatches[0].matchName).toBe('就是棒春季聯賽U8組')
    expect(parsedMatches[0].opponent).toBe('Dream Young(鯊)')
    expect(parsedMatches[0].coaches).toEqual(['吳教練', '莊教練'])
    expect(parsedMatches[0].players).toEqual([
      { number: '99', name: '賴虹臻' },
      { number: '55', name: '謝準' },
      { number: '74', name: '游茗皓' }
    ])
    expect(parsedMatches[1].matchName).toBe('第一屆熊戰邀請賽')
    expect(parsedMatches[1].opponent).toBe('')
  })

  it('parses compact versus titles with our team on either side', () => {
    const compactHome = parseMatchRecord({
      id: 'uid-compact-home@google.com',
      summary: 'U10八德迷你棒球聯賽 中港熊戰vs小小馬',
      description: '組別 / 類別：U10\n賽事等級：三級\n盃賽名稱：八德迷你棒球聯賽',
      location: '',
      startRaw: '20260502T034000Z',
      endRaw: '20260502T043000Z'
    })

    const away = parseMatchRecord({
      id: 'uid-away@google.com',
      summary: 'U10 八德迷你棒球 飛龍夢無限 vs 中港熊戰',
      description: '組別 / 類別：U10\n賽事等級：三級\n盃賽名稱：八德迷你棒球聯賽',
      location: '',
      startRaw: '20260502T004000Z',
      endRaw: '20260502T013000Z'
    })

    const noVersus = parseMatchRecord({
      id: 'uid-no-versus@google.com',
      summary: 'U10 八德迷你棒球趣味聯賽 跑壘大賽',
      description: '組別 / 類別：U10\n賽事等級：三級',
      location: '',
      startRaw: '20260501T020000Z',
      endRaw: '20260501T023000Z'
    })

    expect(compactHome.opponent).toBe('小小馬')
    expect(compactHome.tournamentName).toBe('八德迷你棒球聯賽')
    expect(away.opponent).toBe('飛龍夢無限')
    expect(noVersus.opponent).toBe('')
    expect(noVersus.parseWarnings).toContain('未偵測到對戰格式，對手需確認')
  })

  it('conservatively checks calendar players against the active roster', () => {
    const playerCheck = checkCalendarPlayersAgainstRoster(
      [
        { name: '蘆怖·嘎皂', number: '' },
        { name: '未知名字', number: '7' },
        { name: '李小華', number: '15' },
        { name: '多重背號', number: '88' }
      ],
      [
        { id: 'p1', name: '蘆怖嘎皂', jersey_number: '12', role: '球員', status: '在隊' },
        { id: 'p2', name: '王小明', jersey_number: '7', role: '球員', status: '在隊' },
        { id: 'p3', name: '李小華', jersey_number: '8', role: '球員', status: '在隊' },
        { id: 'p4', name: '張衝突', jersey_number: '15', role: '校隊', status: '在隊' },
        { id: 'p5', name: '背號一', jersey_number: '88', role: '球員', status: '在隊' },
        { id: 'p6', name: '背號二', jersey_number: '88', role: '校隊', status: '在隊' }
      ]
    )

    expect(playerCheck.total).toBe(4)
    expect(playerCheck.matched).toBe(2)
    expect(playerCheck.needsReview).toBe(2)
    expect(playerCheck.items[0]).toMatchObject({ status: 'matched', name: '蘆怖嘎皂', number: '12' })
    expect(playerCheck.items[1]).toMatchObject({ status: 'number_matched', name: '王小明', number: '7' })
    expect(playerCheck.items[2].status).toBe('needs_review')
    expect(playerCheck.items[2].message).toContain('背號與名單 #8 不一致')
    expect(playerCheck.items[3].status).toBe('needs_review')
    expect(playerCheck.items[3].message).toContain('背號 #88 命中多位隊員')
  })

  it('plans create update and skip actions while backfilling legacy google ids', () => {
    const createParsed = parseMatchRecord({
      id: 'uid-create@google.com',
      summary: 'U12 新北聯賽 中港熊戰 vs 國泰國小',
      description: '組別 / 類別：U12\n賽事等級：一級',
      location: '鹿角溪壘球場, 238台灣新北市樹林區環漢路五段24號',
      startRaw: '20260517T073000Z',
      endRaw: '20260517T090000Z'
    })

    const legacyParsed = parseMatchRecord({
      id: 'uid-legacy@google.com',
      summary: 'U8 就是棒 中港熊戰 vs 港湖社區(藍)',
      description: '組別 / 類別：U8\n賽事等級：一級\n盃賽名稱：就是棒春季聯賽U8組',
      location: '迪化壘球場, 103台灣臺北市大同區延平北路四段179號',
      startRaw: '20260419T073000Z',
      endRaw: '20260419T083000Z'
    })

    const skipParsed = parseMatchRecord({
      id: 'uid-skip@google.com',
      summary: '理事長盃 YM忍者 vs 中港熊戰',
      description: '賽事等級：二級',
      location: '',
      startRaw: '20260101T060000Z',
      endRaw: '20260101T073000Z'
    })

    const skipPayload = createMatchRecordInput(skipParsed)
    const existingMatches: MatchRecord[] = [
      buildExistingMatch('legacy-1', {
        ...createMatchRecordInput(legacyParsed),
        google_calendar_event_id: null
      }),
      buildExistingMatch('skip-1', skipPayload),
      buildExistingMatch('extra-1', {
        ...createMatchRecordInput(createParsed),
        google_calendar_event_id: 'not-in-feed@google.com'
      })
    ]

    const syncPlan = planCalendarSync(existingMatches, [createParsed, legacyParsed, skipParsed], {
      minimumMatchDate: '2026-01-01'
    })

    expect(syncPlan).toHaveLength(3)

    expect(syncPlan[0].action).toBe('create')
    expect(syncPlan[0].existingMatchId).toBeNull()

    expect(syncPlan[1].action).toBe('update')
    expect(syncPlan[1].existingMatchId).toBe('legacy-1')
    expect(syncPlan[1].payload.google_calendar_event_id).toBe('uid-legacy@google.com')

    expect(syncPlan[2].action).toBe('skip')
    expect(syncPlan[2].existingMatchId).toBe('skip-1')
  })

  it('skips existing matches when only manual game record fields differ', () => {
    const parsed = parseMatchRecord({
      id: 'uid-manual@google.com',
      summary: 'U12 春季聯賽 中港熊戰 vs 華興小學',
      description: [
        '組別 / 類別：U12',
        '賽事等級：一級',
        '集合時間：07:20',
        '盃賽名稱：春季聯賽U12組',
        '參賽球員：',
        '15 尤丞洋'
      ].join('\n'),
      location: '迪化壘球場',
      startRaw: '20260328T000000Z',
      endRaw: '20260328T013000Z'
    })

    const existingMatches: MatchRecord[] = [
      {
        ...buildExistingMatch('manual-1', createMatchRecordInput(parsed)),
        home_score: 8,
        opponent_score: 5,
        coaches: '手動教練',
        players: '手動球員',
        note: '賽後筆記',
        photo_url: 'https://example.com/match.jpg',
        absent_players: [{ name: '王小明', type: '請假' }],
        lineup: [{ order: 1, position: '投手', name: '尤丞洋', number: '15' }],
        inning_logs: [{ inning: '一上', log: '安打得分' }],
        batting_stats: [
          {
            name: '尤丞洋',
            number: '15',
            pa: 4,
            ab: 3,
            h1: 2,
            h2: 0,
            h3: 0,
            hr: 0,
            rbi: 2,
            r: 1,
            bb: 1,
            hbp: 0,
            so: 0,
            sb: 1
          }
        ],
        pitching_stats: [
          {
            name: '尤丞洋',
            number: '15',
            ip: 9,
            h: 3,
            h2: 0,
            h3: 0,
            hr: 0,
            r: 1,
            er: 1,
            bb: 1,
            so: 4,
            np: 38,
            ab: 11,
            go: 3,
            ao: 2
          }
        ]
      }
    ]

    const syncPlan = planCalendarSync(existingMatches, [parsed], {
      minimumMatchDate: '2026-01-01'
    })

    expect(syncPlan).toHaveLength(1)
    expect(syncPlan[0].action).toBe('skip')
  })

  it('updates tournament_name with a schedule-only payload for existing matches', () => {
    const parsed = parseMatchRecord({
      id: 'uid-tournament@google.com',
      summary: 'U12 春季聯賽 中港熊戰 vs 華興小學',
      description: [
        '組別 / 類別：U12',
        '賽事等級：一級',
        '盃賽名稱：春季聯賽U12組'
      ].join('\n'),
      location: '迪化壘球場',
      startRaw: '20260328T000000Z',
      endRaw: '20260328T013000Z'
    })

    const existingMatch = {
      ...buildExistingMatch('existing-1', {
        ...createMatchRecordInput(parsed),
        google_calendar_event_id: null,
        tournament_name: null
      }),
      home_score: 4,
      opponent_score: 3,
      note: '已填賽後紀錄',
      batting_stats: [
        {
          name: '尤丞洋',
          number: '15',
          pa: 3,
          ab: 3,
          h1: 1,
          h2: 1,
          h3: 0,
          hr: 0,
          rbi: 1,
          r: 1,
          bb: 0,
          hbp: 0,
          so: 1,
          sb: 0
        }
      ]
    }

    const syncPlan = planCalendarSync([existingMatch], [parsed], {
      minimumMatchDate: '2026-01-01'
    })

    expect(syncPlan).toHaveLength(1)

    const updateItem = syncPlan[0]
    if (updateItem.action !== 'update') {
      throw new Error(`Expected update action, received ${updateItem.action}`)
    }

    expect(updateItem.existingMatchId).toBe('existing-1')
    expect(updateItem.payload.google_calendar_event_id).toBe('uid-tournament@google.com')
    expect(updateItem.payload.tournament_name).toBe('春季聯賽U12組')
    expect('home_score' in updateItem.payload).toBe(false)
    expect('opponent_score' in updateItem.payload).toBe(false)
    expect('note' in updateItem.payload).toBe(false)
    expect('photo_url' in updateItem.payload).toBe(false)
    expect('players' in updateItem.payload).toBe(false)
    expect('absent_players' in updateItem.payload).toBe(false)
    expect('lineup' in updateItem.payload).toBe(false)
    expect('inning_logs' in updateItem.payload).toBe(false)
    expect('batting_stats' in updateItem.payload).toBe(false)
  })

  it('shows schedule diffs for update items without touching participant fields', () => {
    const parsed = parseMatchRecord({
      id: 'uid-diff@google.com',
      summary: 'U10八德迷你棒球聯賽 中港熊戰vs小小馬',
      description: [
        '組別 / 類別：U10',
        '賽事等級：三級',
        '盃賽名稱：八德迷你棒球聯賽',
        '參賽球員：',
        '1.張顥瀚'
      ].join('\n'),
      location: '大勇國小',
      startRaw: '20260502T034000Z',
      endRaw: '20260502T043000Z'
    })

    const existingMatch: MatchRecord = {
      ...buildExistingMatch('existing-diff', createMatchRecordInput(parsed)),
      opponent: '待確認',
      match_time: '11:30 - 12:20',
      players: '手動球員',
      lineup: [{ order: 1, position: '投手', name: '手動球員', number: '9' }]
    }

    const syncPlan = planCalendarSync([existingMatch], [parsed], {
      minimumMatchDate: '2026-01-01'
    })

    const updateItem = syncPlan[0]
    if (updateItem.action !== 'update') {
      throw new Error(`Expected update action, received ${updateItem.action}`)
    }

    expect(updateItem.scheduleDiffs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'opponent', before: '待確認', after: '小小馬' }),
        expect.objectContaining({ field: 'match_time', before: '11:30 - 12:20', after: '11:40 - 12:30' })
      ])
    )
    expect('players' in updateItem.payload).toBe(false)
    expect('lineup' in updateItem.payload).toBe(false)
  })

  it('plans match fee changes as schedule updates', () => {
    const parsed = parseMatchRecord({
      id: 'uid-fee-update@google.com',
      summary: 'U10 友誼賽 中港熊戰 vs 對手隊',
      description: [
        '組別 / 類別：U10',
        '參賽球員：',
        '1.簡亦秀',
        '比賽費用：300'
      ].join('\n'),
      location: '中港球場',
      startRaw: '20260502T034000Z',
      endRaw: '20260502T043000Z'
    })

    const existingMatch: MatchRecord = {
      ...buildExistingMatch('existing-fee-update', createMatchRecordInput(parsed)),
      match_fee_amount: null
    }

    const syncPlan = planCalendarSync([existingMatch], [parsed], {
      minimumMatchDate: '2026-01-01'
    })

    const updateItem = syncPlan[0]
    if (updateItem.action !== 'update') {
      throw new Error(`Expected update action, received ${updateItem.action}`)
    }

    expect(updateItem.payload.match_fee_amount).toBe(300)
    expect(updateItem.scheduleDiffs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'match_fee_amount', before: '空白', after: '300' })
      ])
    )
  })

  it('blocks updates that would overwrite a confirmed opponent with pending confirmation', () => {
    const parsed = parseMatchRecord({
      id: 'uid-no-opponent@google.com',
      summary: '第一屆熊戰邀請賽',
      description: '組別 / 類別：U10\n賽事等級：三級',
      location: '大勇國小',
      startRaw: '20260502T034000Z',
      endRaw: '20260502T043000Z'
    })

    const existingMatch: MatchRecord = {
      ...buildExistingMatch('existing-no-opponent', createMatchRecordInput(parsed)),
      opponent: '小小馬'
    }

    const syncPlan = planCalendarSync([existingMatch], [parsed], {
      minimumMatchDate: '2026-01-01'
    })

    expect(syncPlan).toHaveLength(1)
    expect(syncPlan[0].isBlocked).toBe(true)
    expect(syncPlan[0].validationIssues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ severity: 'blocking', message: expect.stringContaining('避免覆蓋既有對手') })
      ])
    )
    expect('opponent' in syncPlan[0].payload).toBe(false)
  })

  it('ignores matches scheduled before the minimum sync date', () => {
    const pastParsed = parseMatchRecord({
      id: 'uid-past@google.com',
      summary: 'U10 八德迷你棒球 中港熊戰 vs 台中小道奇',
      description: '組別 / 類別：U10\n賽事等級：三級\n盃賽名稱：八德迷你棒球',
      location: '桃園市八德區大勇國民小學, 334台灣桃園市八德區自強街60號',
      startRaw: '20260419T050000Z',
      endRaw: '20260419T070000Z'
    })

    const upcomingParsed = parseMatchRecord({
      id: 'uid-upcoming@google.com',
      summary: 'U10 八德迷你棒球 中港熊戰 vs 台中小道奇',
      description: '組別 / 類別：U10\n賽事等級：三級\n盃賽名稱：八德迷你棒球',
      location: '桃園市八德區大勇國民小學, 334台灣桃園市八德區自強街60號',
      startRaw: '20260501T050000Z',
      endRaw: '20260501T070000Z'
    })

    const syncPlan = planCalendarSync([], [pastParsed, upcomingParsed], {
      minimumMatchDate: '2026-04-20'
    })

    expect(syncPlan).toHaveLength(1)
    expect(syncPlan[0].parsedMatch.id).toBe('uid-upcoming@google.com')
    expect(syncPlan[0].payload.match_date).toBe('2026-05-01')
  })
})
