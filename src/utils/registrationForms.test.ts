import { describe, expect, it } from 'vitest'
import {
  createRegistrationPlayerRow,
  createRegistrationStaffFields,
  getRegistrationMemberPhone,
  isActiveRegistrationPlayer,
  isActiveRegistrationStaffMember,
  normalizeRegistrationHandCode,
  sortRegistrationMembers,
  validateRegistrationForm
} from './registrationForms'

describe('registrationForms', () => {
  it('filters active players and sorts numeric jersey numbers first', () => {
    expect(isActiveRegistrationPlayer({ role: '球員', status: '在隊' })).toBe(true)
    expect(isActiveRegistrationPlayer({ role: '球員', status: '離隊' })).toBe(false)
    expect(isActiveRegistrationPlayer({ role: '教練', status: '在隊' })).toBe(false)
    expect(sortRegistrationMembers([
      { name: '三', jersey_number: '10' },
      { name: '一', jersey_number: '2' },
      { name: '二', jersey_number: '' }
    ]).map((row) => row.name)).toEqual(['一', '三', '二'])
  })

  it('provides active coach and player staff choices with their roster phone', () => {
    expect(isActiveRegistrationStaffMember({ role: '教練', status: '在隊' })).toBe(true)
    expect(isActiveRegistrationStaffMember({ role: '管理群', status: '在隊' })).toBe(true)
    expect(isActiveRegistrationStaffMember({ role: '球員', status: '離隊' })).toBe(false)
    expect(isActiveRegistrationStaffMember({ role: '其他', status: '在隊' })).toBe(false)
    expect(getRegistrationMemberPhone({ guardian_phone: ' 0912-345-678 ' })).toBe('0912-345-678')
  })

  it('copies roster values into export-only overrides without changing authorization', () => {
    const row = createRegistrationPlayerRow({
      id: 'm1',
      name: '小熊',
      jersey_number: 7,
      birth_date: '2015-06-18T00:00:00Z',
      portrait_auth: false
    })
    expect(row.overrides.jersey_number).toBe('7')
    expect(row.overrides.birth_date).toBe('2015-06-18')
    expect(row.portrait_auth).toBe(false)
    expect(row.overrides).not.toHaveProperty('portrait_auth')
  })

  it('blocks missing Excel fields and ambiguous hand values but only warns for portrait/photo', () => {
    const fields = createRegistrationStaffFields()
    Object.assign(fields, {
      leader_name: '領隊',
      head_coach_name: '教練',
      manager_name: '管理',
      contact_name: '聯絡人',
      contact_phone: '0900'
    })
    const row = createRegistrationPlayerRow({
      id: 'm1',
      name: '小熊',
      jersey_number: '7',
      birth_date: '2015-06-18',
      national_id: 'A123456789',
      throwing_hand: '右投',
      batting_hand: '左右開弓',
      school_name: '中港國小',
      grade: '五年級',
      portrait_auth: false
    })
    const result = validateRegistrationForm('just_baseball_taipei', 30, fields, [row])
    expect(normalizeRegistrationHandCode('右投')).toBe('R')
    expect(result.blocking.some((message) => message.includes('守位'))).toBe(false)
    expect(result.blocking.some((message) => message.includes('打擊慣用手'))).toBe(true)
    expect(result.warnings.some((message) => message.includes('未同意肖像授權'))).toBe(true)
  })
})
