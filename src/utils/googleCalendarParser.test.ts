import { describe, expect, it } from 'vitest'
import { createMatchRecordInput, parseICalText, parseMatchRecord, planCalendarSync } from './googleCalendarParser'
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
