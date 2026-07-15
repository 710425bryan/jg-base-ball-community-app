import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./UsersView.vue', import.meta.url), 'utf8')

describe('UsersView desktop toolbar', () => {
  it('groups search and status filters with consistent spacing and height', () => {
    expect(source).toContain(
      'users-desktop-filter-group hidden min-w-0 flex-1 items-center gap-2 md:flex lg:max-w-[29rem]'
    )
    expect(source).toContain('class="!w-full min-w-[12rem] flex-1"')
    expect(source).toContain('class="!w-[10.5rem] shrink-0"')
    expect(source).toContain('.users-desktop-filter-group .el-input__wrapper')
    expect(source).toContain('min-height: 44px;')
  })

  it('uses the shared view mode switch beside the desktop filter group', () => {
    expect(source).toContain('<ViewModeSwitch v-model="viewMode" class="shrink-0" />')
  })
})
