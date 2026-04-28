import { describe, expect, it, vi } from 'vitest'

import {
  buildLocationSearchCandidates,
  extractTaiwanAdministrativeLocation,
  findKnownLocation,
  normalizeLocationKey,
  resolveLocationWithProviders,
} from './logic'

describe('resolve-location logic', () => {
  it('normalizes location cache keys', () => {
    expect(normalizeLocationKey(' 桃園市 八德區（大勇國小） ')).toBe('桃園市八德區大勇國小')
  })

  it('extracts Taiwan administrative locations from full addresses', () => {
    expect(extractTaiwanAdministrativeLocation('桃園市八德區大勇國民小學, 334台灣桃園市八德區自強街60號'))
      .toBe('桃園市八德區')
  })

  it('builds full-address and administrative fallback candidates', () => {
    expect(buildLocationSearchCandidates('桃園市八德區大勇國民小學, 334台灣桃園市八德區自強街60號')).toEqual([
      {
        query: '桃園市八德區大勇國民小學, 334台灣桃園市八德區自強街60號',
        label: '桃園市八德區大勇國民小學, 334台灣桃園市八德區自強街60號',
      },
      {
        query: '桃園市八德區',
        label: '桃園市八德區',
      },
    ])
  })

  it('resolves known baseball fields before calling providers', async () => {
    const fetcher = vi.fn()
    const resolvedLocation = await resolveLocationWithProviders('新莊棒球場', { fetcher })

    expect(resolvedLocation).toMatchObject({
      label: '新莊棒球場',
      latitude: 25.0411,
      longitude: 121.4478,
      source: 'known_location',
    })
    expect(fetcher).not.toHaveBeenCalled()
    expect(findKnownLocation('新北市立新莊棒球場')).toMatchObject({ label: '新莊棒球場' })
  })

  it('tries Google Places before the free providers when a key is configured', async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        places: [
          {
            displayName: { text: '大勇國民小學' },
            formattedAddress: '334桃園市八德區自強街60號',
            location: {
              latitude: 24.9301,
              longitude: 121.2862,
            },
          },
        ],
      }),
    })

    const resolvedLocation = await resolveLocationWithProviders('大勇國民小學', {
      fetcher,
      googleMapsApiKey: 'test-key',
    })

    expect(String(fetcher.mock.calls[0][0])).toBe('https://places.googleapis.com/v1/places:searchText')
    expect(resolvedLocation).toMatchObject({
      label: '大勇國民小學',
      latitude: 24.9301,
      longitude: 121.2862,
      source: 'google_places',
    })
  })

  it('falls back to the administrative candidate when the full address is not found', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => [] })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ([{ lat: '24.9286511', lon: '121.2846555' }]),
      })

    const resolvedLocation = await resolveLocationWithProviders(
      '桃園市八德區大勇國民小學, 334台灣桃園市八德區自強街60號',
      { fetcher }
    )

    expect(String(fetcher.mock.calls[2][0])).toContain(encodeURIComponent('桃園市八德區'))
    expect(resolvedLocation).toMatchObject({
      label: '桃園市八德區',
      latitude: 24.9286511,
      longitude: 121.2846555,
      source: 'nominatim',
    })
  })
})
