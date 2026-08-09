import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./RolePermissionsManager.vue', import.meta.url), 'utf8')

describe('RolePermissionsManager mobile drawer', () => {
  it('teleports the permission drawer above the app shell navigation', () => {
    expect(source).toMatch(
      /<el-drawer[\s\S]*?:with-header="false"[\s\S]*?append-to-body[\s\S]*?>/
    )
  })

  it('keeps the final permission controls scrollable above the iOS safe area', () => {
    expect(source).toContain(
      'class="permissions-drawer__scroll flex-1 overflow-y-auto p-4"'
    )
    expect(source).toContain(
      'padding-bottom: calc(1rem + env(safe-area-inset-bottom));'
    )
    expect(source).toContain('-webkit-overflow-scrolling: touch;')
  })

  it('provides an accessible 44px close control', () => {
    expect(source).toContain('aria-label="關閉權限設定"')
    expect(source).toContain('title="關閉權限設定"')
    expect(source).toContain('class="flex h-11 w-11 items-center justify-center')
  })
})
