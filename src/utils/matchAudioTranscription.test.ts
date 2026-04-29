import { describe, expect, it } from 'vitest'
import {
  buildMatchAudioLogText,
  buildMatchAudioRoster,
  MATCH_AUDIO_TEXT_ONLY,
  normalizeMatchAudioStructuredResult,
} from './matchAudioTranscription'

describe('matchAudioTranscription', () => {
  it('builds the allowed roster only from this match context', () => {
    const roster = buildMatchAudioRoster({
      players: '王小明,李投手',
      lineups: [[
        { order: 1, position: '6', name: '王小明', number: '10' },
        { order: 2, position: '1', name: '林先發', number: '7' },
      ]],
      battingStats: [
        { name: '陳代打', number: '18', pa: 1, ab: 1, h1: 1, h2: 0, h3: 0, hr: 0, rbi: 0, r: 0, bb: 0, hbp: 0, so: 0, sb: 0 },
      ],
      pitchingStats: [
        { name: '李投手', number: '12', ip: 3, h: 0, h2: 0, h3: 0, hr: 0, r: 0, er: 0, bb: 0, so: 1, np: 12, ab: 3, go: 1, ao: 1 },
      ],
    })

    expect(roster).toEqual([
      { name: '王小明', number: '10' },
      { name: '李投手', number: '12' },
      { name: '林先發', number: '7' },
      { name: '陳代打', number: '18' },
    ])
  })

  it('keeps non-roster names unresolved instead of creating players', () => {
    const roster = [
      { name: '王小明', number: '10' },
      { name: '李投手', number: '12' },
    ]
    const result = normalizeMatchAudioStructuredResult({
      roster,
      transcript: '王小明一安，張三也上一壘',
      structuredResult: {
        summary: '一安與待確認人名',
        warnings: [],
        events: [
          { player_name: '王小明', raw_player_name: '', action: '一安', detail: '中外野', unknown_names: [], confidence: 0.9 },
          { player_name: '張三', raw_player_name: '張三', action: '四壞', detail: '', unknown_names: ['張三'], confidence: 0.5 },
        ],
      },
    })

    expect(result.events[0].playerName).toBe('王小明')
    expect(result.events[1].playerName).toBe('')
    expect(result.unresolvedPlayers.map((player) => player.rawName)).toContain('張三')
    expect(result.suggestedLog).toContain('王小明 一安')
    expect(result.suggestedLog).toContain('四壞')
    expect(result.suggestedLog).not.toContain('張三 四壞')
  })

  it('builds log lines with canonical terms used by existing stat recalculation', () => {
    const result = normalizeMatchAudioStructuredResult({
      roster: [{ name: '王小明' }, { name: '李投手' }],
      transcript: '',
      structuredResult: {
        summary: '',
        warnings: [],
        events: [
          { player_name: '王小明', raw_player_name: '', action: '一安', detail: '', unknown_names: [], confidence: 1 },
          { player_name: '王小明', raw_player_name: '', action: '帶有1分打點', detail: '', unknown_names: [], confidence: 1 },
          { player_name: '李投手', raw_player_name: '', action: '被二安', detail: '', unknown_names: [], confidence: 1 },
          { player_name: '李投手', raw_player_name: '', action: '投出滾地出局', detail: '', unknown_names: [], confidence: 1 },
        ],
      },
    })

    const log = buildMatchAudioLogText(result.events)
    expect(log).toContain('王小明 一安')
    expect(log).toContain('王小明 帶有1分打點')
    expect(log).toContain('李投手 被二安')
    expect(log).toContain('李投手 投出滾地出局')
  })

  it('requires a resolution before unresolved players can become roster stats', () => {
    const result = normalizeMatchAudioStructuredResult({
      roster: [{ name: '王小明' }],
      transcript: '',
      structuredResult: {
        summary: '',
        warnings: [],
        events: [
          { player_name: '', raw_player_name: '疑似小明', action: '一安', detail: '', unknown_names: ['疑似小明'], confidence: 0.4 },
        ],
      },
    })

    expect(buildMatchAudioLogText(result.events)).toBe('一安')
    expect(buildMatchAudioLogText(result.events, { 疑似小明: '王小明' })).toBe('王小明 一安')
    expect(buildMatchAudioLogText(result.events, { 疑似小明: MATCH_AUDIO_TEXT_ONLY })).toBe('一安')
  })
})
