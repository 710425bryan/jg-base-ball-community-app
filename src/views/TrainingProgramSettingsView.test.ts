import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./TrainingProgramSettingsView.vue', import.meta.url), 'utf8')

describe('TrainingProgramSettingsView mobile layout', () => {
  it('separates card actions and groups the form into scannable sections', () => {
    expect(source).toContain('training-program-action-bar')
    expect(source).toContain('基本資訊')
    expect(source).toContain('預設排程')
    expect(source).toContain('場地資訊')
    expect(source).toContain("`${setting.label || '未命名訓練項目'}啟用狀態`")
  })

  it('uses full-width stacked mobile fields and touch-sized weekday controls', () => {
    expect(source).toContain('@media (max-width: 767px)')
    expect(source).toContain('.training-program-field :deep(.el-form-item__label)')
    expect(source).toContain('font-size: 16px;')
    expect(source).toContain('training-program-weekdays grid w-full grid-cols-4 gap-2 sm:grid-cols-7')
    expect(source).toContain('min-height: 44px;')
    expect(source).toContain('aria-label="預設訓練星期"')
  })

  it('keeps the existing settings save flow intact', () => {
    expect(source).toContain('trainingProgramsApi.saveSetting({')
    expect(source).toContain('default_weekdays: setting.default_weekdays')
    expect(source).toContain('default_venue_maps_url: setting.default_venue_maps_url')
  })
})
