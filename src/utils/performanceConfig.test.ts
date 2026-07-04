import { describe, expect, it } from 'vitest'
import {
  BASEBALL_ABILITY_FEATURE,
  PHYSICAL_TESTS_FEATURE
} from '@/types/performance'
import {
  formatPerformanceValue,
  getPerformanceConfig,
  performanceConfigs
} from './performanceConfig'

describe('performanceConfig', () => {
  it('exposes route and primary metric config for both performance modules', () => {
    expect(Object.keys(performanceConfigs).sort()).toEqual([
      BASEBALL_ABILITY_FEATURE,
      PHYSICAL_TESTS_FEATURE
    ].sort())
    expect(getPerformanceConfig(BASEBALL_ABILITY_FEATURE)).toMatchObject({
      routeBase: '/baseball-ability',
      primaryMetric: 'pitch_speed'
    })
    expect(getPerformanceConfig(PHYSICAL_TESTS_FEATURE)).toMatchObject({
      routeBase: '/physical-tests',
      primaryMetric: 'bmi'
    })
  })

  it('formats metric values with precision and units', () => {
    expect(formatPerformanceValue(123.456, { precision: 1, unit: 'km/h' })).toBe('123.5 km/h')
    expect(formatPerformanceValue(12.9, { precision: 0, unit: '次' })).toBe('13 次')
    expect(formatPerformanceValue('15.25', { precision: 2 })).toBe('15.25')
    expect(formatPerformanceValue('not-a-number', { precision: 1, unit: '秒' })).toBe('-')
  })
})
