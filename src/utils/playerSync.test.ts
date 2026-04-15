import { describe, expect, it } from 'vitest'
import { resolvePrimaryPayerSyncValue } from './playerSync'

describe('playerSync', () => {
  it('keeps the existing primary payer flag when the form does not include the column', () => {
    expect(resolvePrimaryPayerSyncValue({
      hasPrimaryPayerColumn: false,
      rawPrimaryPayerValue: undefined,
      fallbackValue: true
    })).toBe(true)

    expect(resolvePrimaryPayerSyncValue({
      hasPrimaryPayerColumn: false,
      rawPrimaryPayerValue: undefined,
      fallbackValue: false
    })).toBe(false)
  })

  it('keeps the existing primary payer flag when the form cell is blank', () => {
    expect(resolvePrimaryPayerSyncValue({
      hasPrimaryPayerColumn: true,
      rawPrimaryPayerValue: '   ',
      fallbackValue: true
    })).toBe(true)

    expect(resolvePrimaryPayerSyncValue({
      hasPrimaryPayerColumn: true,
      rawPrimaryPayerValue: '',
      fallbackValue: false
    })).toBe(false)
  })

  it('syncs true when the form explicitly marks the player as the primary payer', () => {
    expect(resolvePrimaryPayerSyncValue({
      hasPrimaryPayerColumn: true,
      rawPrimaryPayerValue: '是',
      fallbackValue: false
    })).toBe(true)
  })

  it('syncs false when the form explicitly provides a non-primary-payer value', () => {
    expect(resolvePrimaryPayerSyncValue({
      hasPrimaryPayerColumn: true,
      rawPrimaryPayerValue: '否',
      fallbackValue: true
    })).toBe(false)
  })

  it('defaults new members to false when the form omits or leaves the value blank', () => {
    expect(resolvePrimaryPayerSyncValue({
      hasPrimaryPayerColumn: false,
      rawPrimaryPayerValue: undefined,
      fallbackValue: false
    })).toBe(false)

    expect(resolvePrimaryPayerSyncValue({
      hasPrimaryPayerColumn: true,
      rawPrimaryPayerValue: ' ',
      fallbackValue: false
    })).toBe(false)
  })
})
