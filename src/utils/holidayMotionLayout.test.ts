// @ts-nocheck
import { describe, expect, it } from 'vitest'

import { randomizeHolidayMotionItems } from './holidayMotionLayout'

describe('holidayMotionLayout', () => {
  const baseItems = [
    {
      key: 'spark-1',
      type: 'spark',
      style: {
        top: '22%',
        left: '16%',
        width: '1rem',
        height: '1rem',
        animationDelay: '1.2s',
        animationDuration: '6.4s',
        '--holiday-drift-x': '24px',
        '--holiday-opacity': '0.58',
      },
    },
  ]
  const phaseCloneItems = [
    {
      key: 'confetti-1',
      type: 'confetti',
      style: {
        top: '-10%',
        left: '24%',
        width: '0.72rem',
        height: '1.9rem',
        animationDelay: '1.2s',
        animationDuration: '8s',
        '--holiday-drift-x': '24px',
        '--holiday-rotate-start': '-12deg',
        '--holiday-rotate-end': '184deg',
        '--holiday-opacity': '0.58',
      },
    },
  ]

  it('returns stable randomized positions for the same seed', () => {
    const first = randomizeHolidayMotionItems(baseItems, {
      seed: 'theme-a',
      scope: 'hero',
    })
    const second = randomizeHolidayMotionItems(baseItems, {
      seed: 'theme-a',
      scope: 'hero',
    })

    expect(first).toEqual(second)
  })

  it('changes the generated positions when the seed changes', () => {
    const first = randomizeHolidayMotionItems(baseItems, {
      seed: 'theme-a',
      scope: 'hero',
    })
    const second = randomizeHolidayMotionItems(baseItems, {
      seed: 'theme-b',
      scope: 'hero',
    })

    expect(first[0].style).not.toEqual(second[0].style)
  })

  it('adds deterministic phase-offset clones for one-way motion items', () => {
    const first = randomizeHolidayMotionItems(phaseCloneItems, {
      seed: 'theme-a',
      scope: 'site',
      includePhaseClones: true,
    })
    const second = randomizeHolidayMotionItems(phaseCloneItems, {
      seed: 'theme-a',
      scope: 'site',
      includePhaseClones: true,
    })

    expect(first).toEqual(second)
    expect(first).toHaveLength(2)
    expect(first[1].isPhaseClone).toBe(true)
    expect(first[1].phaseCloneOf).toBe('confetti-1')
    expect(first[1].style.animationDelay.startsWith('-')).toBe(true)
  })

  it('adds phase-offset clones for snowfall items too', () => {
    const snowfallItems = [
      {
        key: 'snow-1',
        type: 'snowflake',
        style: {
          top: '-10%',
          left: '24%',
          width: '0.9rem',
          height: '0.9rem',
          animationDelay: '0.8s',
          animationDuration: '12.4s',
          '--holiday-drift-x': '18px',
          '--holiday-rotate-start': '0deg',
          '--holiday-rotate-end': '180deg',
          '--holiday-opacity': '0.72',
        },
      },
    ]

    const randomized = randomizeHolidayMotionItems(snowfallItems, {
      seed: 'snow-theme',
      scope: 'site',
      includePhaseClones: true,
    })

    expect(randomized).toHaveLength(2)
    expect(randomized[1].isPhaseClone).toBe(true)
    expect(randomized[1].phaseCloneOf).toBe('snow-1')
    expect(randomized[1].style.animationDelay.startsWith('-')).toBe(true)
  })
})
