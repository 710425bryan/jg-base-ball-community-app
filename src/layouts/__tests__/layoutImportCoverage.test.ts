// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'

const layoutImports = [
  { name: 'MainLayout', load: () => import('../MainLayout.vue') },
  { name: 'PublicLayout', load: () => import('../PublicLayout.vue') }
]

describe('layout import coverage', () => {
  it.each(layoutImports)('loads $name without a broken dependency', async ({ load }) => {
    const module = await load()

    expect(module.default).toBeTruthy()
  })
})
