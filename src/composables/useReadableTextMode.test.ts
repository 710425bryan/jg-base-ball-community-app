// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const importComposable = async () => {
  vi.resetModules()
  return import('./useReadableTextMode')
}

describe('useReadableTextMode', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>'
    localStorage.clear()
  })

  afterEach(() => {
    document.documentElement.className = ''
    document.body.className = ''
    vi.restoreAllMocks()
  })

  it('initializes from localStorage and applies readable classes', async () => {
    localStorage.setItem('jg-baseball:readable-text-mode', '1')
    const { useReadableTextMode } = await importComposable()
    const mode = useReadableTextMode()

    mode.initializeReadableTextMode()

    expect(mode.isReadableTextMode.value).toBe(true)
    expect(document.documentElement.classList.contains('app-readable-text-mode')).toBe(true)
    expect(document.body.classList.contains('app-readable-text-mode')).toBe(true)
    expect(document.getElementById('app')?.classList.contains('app-readable-text-mode')).toBe(true)
  })

  it('persists toggled preference and removes classes when disabled', async () => {
    const { useReadableTextMode } = await importComposable()
    const mode = useReadableTextMode()

    mode.setReadableTextMode(true)
    expect(localStorage.getItem('jg-baseball:readable-text-mode')).toBe('1')

    mode.toggleReadableTextMode()
    expect(mode.isReadableTextMode.value).toBe(false)
    expect(localStorage.getItem('jg-baseball:readable-text-mode')).toBe('0')
    expect(document.documentElement.classList.contains('app-readable-text-mode')).toBe(false)
  })

  it('reacts to preference changes from another browser tab', async () => {
    const { useReadableTextMode } = await importComposable()
    const mode = useReadableTextMode()
    mode.initializeReadableTextMode()

    window.dispatchEvent(new StorageEvent('storage', {
      key: 'jg-baseball:readable-text-mode',
      newValue: '1'
    }))

    expect(mode.isReadableTextMode.value).toBe(true)
    expect(document.body.classList.contains('app-readable-text-mode')).toBe(true)
  })
})
