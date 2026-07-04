import { describe, expect, it } from 'vitest'
import { normalizeExternalUrl } from './externalUrl'

describe('externalUrl', () => {
  it('keeps explicit http and https urls after trimming', () => {
    expect(normalizeExternalUrl(' https://example.com/path ')).toBe('https://example.com/path')
    expect(normalizeExternalUrl('http://example.com')).toBe('http://example.com')
  })

  it('adds https to bare domain-like values', () => {
    expect(normalizeExternalUrl('example.com')).toBe('https://example.com')
    expect(normalizeExternalUrl('maps.google.com/place')).toBe('https://maps.google.com/place')
  })

  it('rejects empty, unsupported, or non-url text', () => {
    expect(normalizeExternalUrl(null)).toBe('')
    expect(normalizeExternalUrl('')).toBe('')
    expect(normalizeExternalUrl('中港國小')).toBe('')
    expect(normalizeExternalUrl('ftp://example.com')).toBe('')
  })
})
