import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import dayjs from 'dayjs'

const supabaseFunctionsInvokeMock = vi.hoisted(() => vi.fn())

vi.mock('@/services/supabase', () => ({
  supabase: {
    functions: {
      invoke: supabaseFunctionsInvokeMock
    }
  }
}))

import {
  clearWeatherLocationCache,
  getMatchWeatherForecast,
  resolveWeatherForecastDate,
  resolveWeatherLocation
} from './weatherApi'

const fetchMock = vi.fn()

vi.stubGlobal('fetch', fetchMock)

const createForecastResponse = () => ({
  ok: true,
  json: async () => ({
    current: {
      temperature_2m: 28,
      weather_code: 1,
      is_day: 1,
      wind_speed_10m: 10
    },
    daily: {
      weather_code: [2],
      temperature_2m_max: [31],
      temperature_2m_min: [24],
      precipitation_probability_max: [15],
      wind_speed_10m_max: [18]
    }
  })
})

describe('weatherApi', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    supabaseFunctionsInvokeMock.mockReset()
    supabaseFunctionsInvokeMock.mockResolvedValue({ data: null, error: { message: 'function unavailable' } })
    clearWeatherLocationCache()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('uses known baseball field coordinates for match weather forecasts', async () => {
    fetchMock.mockResolvedValue(createForecastResponse())
    const matchDate = '2026-05-02'

    const forecast = await getMatchWeatherForecast({
      location: '新莊棒球場',
      matchDate,
      now: dayjs('2026-04-29T08:00:00+08:00')
    })

    const requestUrl = new URL(String(fetchMock.mock.calls[0][0]))

    expect(requestUrl.hostname).toBe('api.open-meteo.com')
    expect(requestUrl.searchParams.get('latitude')).toBe('25.0411')
    expect(requestUrl.searchParams.get('longitude')).toBe('121.4478')
    expect(requestUrl.searchParams.get('start_date')).toBe(matchDate)
    expect(requestUrl.searchParams.get('end_date')).toBe(matchDate)
    expect(forecast.location).toBe('新莊棒球場')
    expect(forecast.summary).toBe('多雲時晴')
    expect(forecast.isMatchDateForecast).toBe(true)
  })

  it('falls back to today when the match date is outside the forecast range', () => {
    expect(resolveWeatherForecastDate('2026-06-30', dayjs('2026-04-29')).date).toBe('2026-04-29')
    expect(resolveWeatherForecastDate('2026-06-30', dayjs('2026-04-29')).isMatchDateForecast).toBe(false)
  })

  it('geocodes unknown locations and caches the resolved coordinates', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ([{ lat: '25.0748095', lon: '121.5103429' }])
      })
      .mockResolvedValueOnce(createForecastResponse())
      .mockResolvedValueOnce(createForecastResponse())

    const resolvedLocation = await resolveWeatherLocation('某個河濱球場')
    await getMatchWeatherForecast({
      location: '某個河濱球場',
      matchDate: '2026-05-01',
      now: dayjs('2026-04-29T08:00:00+08:00')
    })

    const forecastRequestUrl = new URL(String(fetchMock.mock.calls[1][0]))

    expect(resolvedLocation).toMatchObject({
      label: '某個河濱球場',
      latitude: 25.0748095,
      longitude: 121.5103429
    })
    expect(forecastRequestUrl.searchParams.get('latitude')).toBe('25.0748095')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('uses the resolve-location Edge Function before local geocoding fallbacks', async () => {
    supabaseFunctionsInvokeMock.mockResolvedValueOnce({
      data: {
        success: true,
        label: '大勇國民小學',
        latitude: 24.9301,
        longitude: 121.2862,
        source: 'google_places'
      },
      error: null
    })

    const resolvedLocation = await resolveWeatherLocation('桃園市八德區大勇國民小學')

    expect(supabaseFunctionsInvokeMock).toHaveBeenCalledWith('resolve-location', {
      body: { query: '桃園市八德區大勇國民小學' }
    })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(resolvedLocation).toMatchObject({
      label: '大勇國民小學',
      latitude: 24.9301,
      longitude: 121.2862
    })
  })

  it('falls back to Taiwan administrative districts when a full address is not found', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => []
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({})
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ([{ lat: '24.9286511', lon: '121.2846555' }])
      })

    const resolvedLocation = await resolveWeatherLocation('桃園市八德區大勇國民小學, 334台灣桃園市八德區自強街60號')

    expect(String(fetchMock.mock.calls[2][0])).toContain(encodeURIComponent('桃園市八德區'))
    expect(resolvedLocation).toMatchObject({
      label: '桃園市八德區',
      latitude: 24.9286511,
      longitude: 121.2846555
    })
  })
})
