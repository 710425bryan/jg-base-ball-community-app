import { describe, expect, it } from 'vitest'
import {
  applyLineStatDelta,
  applyScoreDelta,
  createDefaultLineScoreData,
  finalizeInningScore,
  getDefenseTeamKey,
  getDisplayStatKey,
  getDisplayTeamKey,
  getInningNumber,
  getNextInning,
  getOffenseTeamKey,
} from './liveMatchScoreboard'

describe('liveMatchScoreboard', () => {
  it('依先攻設定換算畫面主客隊與內部隊伍 key', () => {
    expect(getDisplayTeamKey('away', true)).toBe('home')
    expect(getDisplayTeamKey('home', true)).toBe('opponent')
    expect(getDisplayTeamKey('away', false)).toBe('opponent')
    expect(getDisplayTeamKey('home', false)).toBe('home')
    expect(getDisplayStatKey('away', 'h', true)).toBe('home_h')
    expect(getDisplayStatKey('home', 'e', true)).toBe('opponent_e')
  })

  it('判斷每個半局的進攻與防守方', () => {
    expect(getOffenseTeamKey('一上', true)).toBe('home')
    expect(getOffenseTeamKey('一下', true)).toBe('opponent')
    expect(getOffenseTeamKey('一上', false)).toBe('opponent')
    expect(getOffenseTeamKey('一下', false)).toBe('home')
    expect(getDefenseTeamKey('一上', true)).toBe('opponent')
    expect(getDefenseTeamKey('一下', false)).toBe('opponent')
  })

  it('比分增加時同步寫入總分與該局分數格', () => {
    const result = applyScoreDelta(
      {
        homeScore: 2,
        opponentScore: 1,
        lineScoreData: createDefaultLineScoreData(),
      },
      {
        teamKey: 'home',
        delta: 2,
        inning: '三上',
      },
    )

    expect(result.homeScore).toBe(4)
    expect(result.opponentScore).toBe(1)
    expect(result.lineScoreData.innings?.[2].home).toBe(2)
  })

  it('換半局時替無得分的半局補零', () => {
    const topHalfFinished = finalizeInningScore(createDefaultLineScoreData(), '四上', true)
    const bottomHalfFinished = finalizeInningScore(createDefaultLineScoreData(), '四下', true)

    expect(topHalfFinished.innings?.[3].home).toBe(0)
    expect(bottomHalfFinished.innings?.[3].opponent).toBe(0)
  })

  it('換半局時保留既有局分', () => {
    const lineScoreData = createDefaultLineScoreData()
    lineScoreData.innings![0].home = 3

    const result = finalizeInningScore(lineScoreData, '一上', true)

    expect(result.innings?.[0].home).toBe(3)
  })

  it('H/E 累計不影響局分', () => {
    const base = createDefaultLineScoreData()
    base.innings![0].home = 2

    const withHit = applyLineStatDelta(base, {
      teamKey: 'home',
      stat: 'h',
      delta: 1,
    })
    const withError = applyLineStatDelta(withHit, {
      teamKey: 'opponent',
      stat: 'e',
      delta: 2,
    })

    expect(withError.home_h).toBe(1)
    expect(withError.opponent_e).toBe(2)
    expect(withError.innings?.[0].home).toBe(2)
  })

  it('可解析局數並前進到下一個半局', () => {
    expect(getInningNumber('七上')).toBe(7)
    expect(getNextInning('五下')).toBe('六上')
    expect(getNextInning('九下')).toBe('延長')
  })
})
