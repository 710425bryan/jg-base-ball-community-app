import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./MainLayout.vue', import.meta.url), 'utf8')

describe('MainLayout team member notification security', () => {
  it('does not subscribe to raw team member changes or dispatch member pushes in the browser', () => {
    expect(source).not.toContain("channel('team-members-channel')")
    expect(source).not.toContain("table: 'team_members' },\n          (payload)")
    expect(source).not.toContain("buildPushEventKey('team_member'")
    expect(source).not.toContain('收到 team_members 最新資料！Payload')
  })

  it('keeps the mobile navigation in layout flow with accessible menu controls', () => {
    expect(source).toContain('mobile-bottom-nav md:hidden flex-none')
    expect(source).toContain('pb-[env(safe-area-inset-bottom)]')
    expect(source).toContain('aria-controls="mobile-app-menu"')
    expect(source).toContain(':aria-expanded="isMobileMenuOpen"')
    expect(source).toContain('class="mobile-bottom-nav-item flex h-full')
  })

  it('keeps the topbar hamburger borderless while preserving its touch target', () => {
    const topbarMenuButton = source.slice(
      source.indexOf('<!-- Mobile Hamburger -->'),
      source.indexOf('<!-- Mobile Hamburger Menu')
    )

    expect(topbarMenuButton).toContain('inline-flex h-11 w-11')
    expect(topbarMenuButton).toContain('rounded-lg text-gray-600')
    expect(topbarMenuButton).not.toContain('app-icon-button')
    expect(topbarMenuButton).not.toMatch(/\bborder(?:-|\s|\")/)
  })

  it('owns the only route-level vertical scroll container', () => {
    expect(source).toContain('class="app-main-scroll flex-1 min-h-0 relative bg-background overflow-x-hidden overflow-y-auto w-full"')
    expect(source).not.toContain('<main class="flex-1 min-h-0 relative flex flex-col')
  })
})
