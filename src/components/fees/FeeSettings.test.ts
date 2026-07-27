import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./FeeSettings.vue', import.meta.url), 'utf8')

describe('FeeSettings tabs and school-team per-session fees', () => {
  it('splits the long settings page into accessible category tabs', () => {
    expect(source).toContain('role="tablist"')
    expect(source).toContain('role="tab"')
    expect(source).toContain(':aria-selected="activeSettingsTab === tab.id"')
    expect(source).toContain("v-show=\"activeSettingsTab === 'monthly_fixed'\"")
    expect(source).toContain("v-show=\"activeSettingsTab === 'quarterly_compensation'\"")
  })

  it('configures Chunggang and Xintai regular and discounted fees independently', () => {
    expect(source).toContain('getSchoolTeamMonthlyPerSessionDefaults')
    expect(source).toContain('saveSchoolTeamMonthlyPerSessionDefaults')
    expect(source).toContain('中港校隊計次費率')
    expect(source).toContain('國中部計次費率')
    expect(source).toContain('CHUNGGANG_SCHOOL_TEAM_PROGRAM_KEY')
    expect(source).toContain('JUNIOR_HIGH_SCHOOL_TEAM_PROGRAM_KEY')
    expect(source).toContain('一般球員單次收費金額 (元)')
    expect(source).toContain('半價 / 手足折扣單次收費金額 (元)')
    expect(source).toContain('社區計次月費維持逐球員設定')
    expect(source).toContain('全日／上午假單會扣除堂數')
    expect(source).toContain('請假天數只記錄、不扣月費')
    expect(source).not.toContain('新泰校隊')
    expect(source).not.toContain('新泰總部')
  })

  it('defaults junior high to a 2000 single monthly fee with a training-date switch', () => {
    expect(source).toContain('國中部計費方式')
    expect(source).toContain('<el-switch')
    expect(source).toContain('active-value="training_dates"')
    expect(source).toContain('inactive-value="single_monthly"')
    expect(source).toContain('單次月費金額 (元)')
    expect(source).toContain('國中部預設單次月費 2,000 元')
    expect(source).toContain('半價／有效手足折扣會依既有規則折半')
    expect(source).toContain("emit('schoolTeamMonthlySettingsUpdated', programKey)")
  })

  it('delegates editable member lists to the responsive card and table component', () => {
    expect(source).toContain("import FeeSettingMemberEditor from '@/components/fees/FeeSettingMemberEditor.vue'")
    expect(source).toContain('kind="per_session"')
    expect(source).toContain('kind="monthly_fixed"')
    expect(source).toContain(':members="perSessionPlayerMembers"')
  })
})
