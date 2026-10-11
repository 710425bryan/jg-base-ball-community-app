import { describe, expect, it } from 'vitest'
import { ACTIONS, systemFeatures } from './permissionFeatures'

describe('permission feature registry', () => {
  it('explains the training VIEW prerequisite separately from management actions', () => {
    expect(systemFeatures.find((feature) => feature.key === 'training')).toMatchObject({
      desc: '勾選檢視才可使用特訓報名與點數；新增、修改、刪除控制管理操作',
      actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE']
    })
  })

  it('keeps personal coach leave separate from whole-team leave and schedule privileges', () => {
    expect(systemFeatures.find((feature) => feature.key === 'my_coach_leave_requests')).toMatchObject({
      name: '我的教練假單', actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE']
    })
    expect(systemFeatures.find((feature) => feature.key === 'coach_leave_requests')).toMatchObject({
      name: '教練請假管理', actions: ['VIEW', 'CREATE', 'EDIT', 'DELETE']
    })
    expect(systemFeatures.some((feature) => feature.key === 'coach_schedules')).toBe(true)
    expect(systemFeatures.some((feature) => feature.key === 'leave_requests')).toBe(true)
  })

  it('has unique feature keys and only supported actions for the shared matrix', () => {
    expect(new Set(systemFeatures.map((feature) => feature.key)).size).toBe(systemFeatures.length)
    for (const feature of systemFeatures) {
      expect(feature.actions).toContain('VIEW')
      for (const action of feature.actions) expect(ACTIONS.some((item) => item.key === action)).toBe(true)
    }
    expect(systemFeatures.find((feature) => feature.key === 'training_dates')?.actions).toEqual(['VIEW', 'EDIT'])
  })
})
