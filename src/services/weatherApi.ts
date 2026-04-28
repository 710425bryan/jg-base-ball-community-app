import dayjs, { type Dayjs } from 'dayjs'
import { supabase } from '@/services/supabase'

export type WeatherSnapshot = {
  location: string
  summary: string
  currentTemp: number | null
  maxTemp: number | null
  minTemp: number | null
  rainProbability: number | null
  windSpeedMps: number | null
  weatherCode: number | null
  isDay: boolean | null
  forecastDate: string | null
  isMatchDateForecast: boolean
}

export type MatchWeatherForecastInput = {
  location?: string | null
  matchDate?: string | null
  now?: Dayjs
}

type WeatherLocation = {
  label: string
  latitude: number
  longitude: number
}

type WeatherLocationSearchCandidate = {
  query: string
  label: string
}

type WeatherDateTarget = {
  date: string
  isMatchDateForecast: boolean
}

type NominatimSearchResult = {
  lat?: string
  lon?: string
}

type OpenMeteoGeocodingResult = {
  latitude?: number
  longitude?: number
}

type ResolveLocationFunctionResponse = {
  success?: boolean
  label?: unknown
  latitude?: unknown
  longitude?: unknown
  source?: unknown
}

const DEFAULT_WEATHER_LOCATION: WeatherLocation = {
  label: '新莊區',
  latitude: 25.03826,
  longitude: 121.45064
}

const KNOWN_WEATHER_LOCATIONS: Array<WeatherLocation & { keywords: string[] }> = [
  {
    label: '新莊棒球場',
    latitude: 25.0411,
    longitude: 121.4478,
    keywords: ['新莊棒球場', '新北市立新莊棒球場']
  },
  {
    label: '迪化休閒運動公園',
    latitude: 25.0748,
    longitude: 121.5103,
    keywords: ['迪化球場', '迪化棒球場', '迪化壘球場', '迪化休閒運動公園']
  }
]

const locationCache = new Map<string, WeatherLocation | null>()
const TAIWAN_ADMIN_LOCATION_PATTERN = /(?:台灣|臺灣)?([\u4e00-\u9fff]{2,3}[市縣])([\u4e00-\u9fff]{1,6}(?:區|鄉|鎮|市))/

const normalizeLocationKey = (value: string) =>
  value
    .trim()
    .toLocaleLowerCase()
    .replace(/\s+/g, '')
    .replace(/[()（）]/g, '')

const uniqueLocationCandidates = (candidates: WeatherLocationSearchCandidate[]) => {
  const seenKeys = new Set<string>()

  return candidates.filter((candidate) => {
    const key = normalizeLocationKey(candidate.query)
    if (!key || seenKeys.has(key)) return false
    seenKeys.add(key)
    return true
  })
}

const parseFiniteNumber = (value: unknown) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

const isValidCoordinate = (latitude: number | null, longitude: number | null) =>
  latitude != null
  && longitude != null
  && latitude >= -90
  && latitude <= 90
  && longitude >= -180
  && longitude <= 180

export const weatherCodeToSummary = (code: number | null, isDay = true) => {
  if (code == null) return '氣象資料更新中'
  if (code === 0) return isDay ? '晴朗' : '晴夜'
  if (code === 1) return isDay ? '大致晴朗' : '大致晴朗'
  if (code === 2) return '多雲時晴'
  if (code === 3) return '陰天'
  if ([45, 48].includes(code)) return '有霧'
  if ([51, 53, 55, 56, 57].includes(code)) return '毛毛雨'
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return '短暫陣雨'
  if ([71, 73, 75, 77, 85, 86].includes(code)) return '降雪'
  if ([95, 96, 99].includes(code)) return '雷陣雨'
  return '局部多雲'
}

export const formatWindMps = (kmh: number | null | undefined) => {
  if (kmh == null || Number.isNaN(kmh)) return null
  return Math.round((kmh / 3.6) * 10) / 10
}

export const resolveWeatherForecastDate = (
  matchDate?: string | null,
  now: Dayjs = dayjs()
): WeatherDateTarget => {
  const today = now.startOf('day')
  const parsedDate = matchDate ? dayjs(matchDate).startOf('day') : null

  if (parsedDate?.isValid()) {
    const maxForecastDate = today.add(15, 'day')
    const isInForecastRange =
      (parsedDate.isSame(today) || parsedDate.isAfter(today))
      && (parsedDate.isSame(maxForecastDate) || parsedDate.isBefore(maxForecastDate))

    if (isInForecastRange) {
      return {
        date: parsedDate.format('YYYY-MM-DD'),
        isMatchDateForecast: true
      }
    }
  }

  return {
    date: today.format('YYYY-MM-DD'),
    isMatchDateForecast: false
  }
}

const findKnownWeatherLocation = (location: string): WeatherLocation | null => {
  const normalizedLocation = normalizeLocationKey(location)
  const matchedLocation = KNOWN_WEATHER_LOCATIONS.find((candidate) =>
    candidate.keywords.some((keyword) => normalizedLocation.includes(normalizeLocationKey(keyword)))
  )

  if (!matchedLocation) return null

  return {
    label: matchedLocation.label,
    latitude: matchedLocation.latitude,
    longitude: matchedLocation.longitude
  }
}

const extractTaiwanAdministrativeLocation = (location: string) => {
  const normalizedLocation = location.replace(/\s+/g, '')
  const match = normalizedLocation.match(TAIWAN_ADMIN_LOCATION_PATTERN)
  if (!match) return null

  return `${match[1]}${match[2]}`
}

const buildLocationSearchCandidates = (location: string): WeatherLocationSearchCandidate[] => {
  const administrativeLocation = extractTaiwanAdministrativeLocation(location)

  return uniqueLocationCandidates([
    { query: location, label: location },
    ...(administrativeLocation
      ? [{ query: administrativeLocation, label: administrativeLocation }]
      : [])
  ])
}

const fetchNominatimLocation = async ({ query, label }: WeatherLocationSearchCandidate): Promise<WeatherLocation | null> => {
  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.searchParams.set('q', query.includes('台灣') || query.includes('臺灣') ? query : `${query}, 台灣`)
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('limit', '1')
  url.searchParams.set('accept-language', 'zh-TW')

  const response = await fetch(url.toString(), {
    headers: {
      Accept: 'application/json'
    }
  })
  if (!response.ok) return null

  const payload = await response.json()
  const [firstResult] = Array.isArray(payload) ? (payload as NominatimSearchResult[]) : []
  const latitude = parseFiniteNumber(firstResult?.lat)
  const longitude = parseFiniteNumber(firstResult?.lon)

  if (latitude == null || longitude == null) return null

  return {
    label,
    latitude,
    longitude
  }
}

const fetchOpenMeteoLocation = async ({ query, label }: WeatherLocationSearchCandidate): Promise<WeatherLocation | null> => {
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search')
  url.searchParams.set('name', query)
  url.searchParams.set('count', '1')
  url.searchParams.set('language', 'zh')
  url.searchParams.set('format', 'json')

  const response = await fetch(url.toString())
  if (!response.ok) return null

  const payload = await response.json()
  const results = Array.isArray(payload?.results) ? (payload.results as OpenMeteoGeocodingResult[]) : []
  const [firstResult] = results
  const latitude = parseFiniteNumber(firstResult?.latitude)
  const longitude = parseFiniteNumber(firstResult?.longitude)

  if (latitude == null || longitude == null) return null

  return {
    label,
    latitude,
    longitude
  }
}

const normalizeResolvedFunctionLocation = (payload: ResolveLocationFunctionResponse | null | undefined): WeatherLocation | null => {
  if (!payload?.success) return null

  const latitude = parseFiniteNumber(payload.latitude)
  const longitude = parseFiniteNumber(payload.longitude)
  if (!isValidCoordinate(latitude, longitude)) return null

  return {
    label: typeof payload.label === 'string' && payload.label.trim()
      ? payload.label.trim()
      : DEFAULT_WEATHER_LOCATION.label,
    latitude: latitude as number,
    longitude: longitude as number
  }
}

const fetchResolvedFunctionLocation = async (location: string): Promise<WeatherLocation | null> => {
  try {
    const { data, error } = await supabase.functions.invoke<ResolveLocationFunctionResponse>('resolve-location', {
      body: { query: location }
    })

    if (error) return null
    return normalizeResolvedFunctionLocation(data)
  } catch (error) {
    console.warn('Unable to resolve weather location through Edge Function:', error)
    return null
  }
}

export const resolveWeatherLocation = async (location?: string | null): Promise<WeatherLocation> => {
  const normalizedLocation = location?.trim()
  if (!normalizedLocation) return DEFAULT_WEATHER_LOCATION

  const knownLocation = findKnownWeatherLocation(normalizedLocation)
  if (knownLocation) return knownLocation

  const cacheKey = normalizeLocationKey(normalizedLocation)
  if (locationCache.has(cacheKey)) {
    return locationCache.get(cacheKey) ?? DEFAULT_WEATHER_LOCATION
  }

  try {
    let geocodedLocation: WeatherLocation | null = null

    geocodedLocation = await fetchResolvedFunctionLocation(normalizedLocation)
    if (geocodedLocation) {
      locationCache.set(cacheKey, geocodedLocation)
      return geocodedLocation
    }

    for (const candidate of buildLocationSearchCandidates(normalizedLocation)) {
      geocodedLocation =
        await fetchNominatimLocation(candidate)
        ?? await fetchOpenMeteoLocation(candidate)

      if (geocodedLocation) break
    }

    locationCache.set(cacheKey, geocodedLocation)
    return geocodedLocation ?? DEFAULT_WEATHER_LOCATION
  } catch (error) {
    console.warn('Unable to resolve weather location:', error)
    locationCache.set(cacheKey, null)
    return DEFAULT_WEATHER_LOCATION
  }
}

export const getMatchWeatherForecast = async ({
  location,
  matchDate,
  now = dayjs()
}: MatchWeatherForecastInput = {}): Promise<WeatherSnapshot> => {
  const weatherLocation = await resolveWeatherLocation(location)
  const forecastTarget = resolveWeatherForecastDate(location ? matchDate : null, now)
  const url = new URL('https://api.open-meteo.com/v1/forecast')

  url.searchParams.set('latitude', String(weatherLocation.latitude))
  url.searchParams.set('longitude', String(weatherLocation.longitude))
  url.searchParams.set('current', 'temperature_2m,weather_code,is_day,wind_speed_10m')
  url.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max')
  url.searchParams.set('start_date', forecastTarget.date)
  url.searchParams.set('end_date', forecastTarget.date)
  url.searchParams.set('timezone', 'Asia/Taipei')

  const response = await fetch(url.toString())
  if (!response.ok) throw new Error(`Weather request failed: ${response.status}`)

  const payload = await response.json()
  const current = payload.current || {}
  const daily = payload.daily || {}
  const isTodayForecast = forecastTarget.date === now.format('YYYY-MM-DD')
  const dailyWeatherCode = Array.isArray(daily.weather_code) ? daily.weather_code[0] : null
  const weatherCode = isTodayForecast && typeof current.weather_code === 'number'
    ? current.weather_code
    : typeof dailyWeatherCode === 'number'
      ? dailyWeatherCode
      : null
  const maxTemp = Array.isArray(daily.temperature_2m_max) ? daily.temperature_2m_max[0] ?? null : null
  const minTemp = Array.isArray(daily.temperature_2m_min) ? daily.temperature_2m_min[0] ?? null : null
  const currentTemp = isTodayForecast && typeof current.temperature_2m === 'number'
    ? current.temperature_2m
    : typeof maxTemp === 'number' && typeof minTemp === 'number'
      ? (maxTemp + minTemp) / 2
      : maxTemp
  const windKmh = isTodayForecast && typeof current.wind_speed_10m === 'number'
    ? current.wind_speed_10m
    : Array.isArray(daily.wind_speed_10m_max)
      ? daily.wind_speed_10m_max[0] ?? null
      : null
  const isDay = isTodayForecast && current.is_day != null ? Boolean(current.is_day) : true

  return {
    location: weatherLocation.label,
    summary: weatherCodeToSummary(weatherCode, isDay),
    currentTemp: typeof currentTemp === 'number' ? currentTemp : null,
    maxTemp: typeof maxTemp === 'number' ? maxTemp : null,
    minTemp: typeof minTemp === 'number' ? minTemp : null,
    rainProbability: Array.isArray(daily.precipitation_probability_max) ? daily.precipitation_probability_max[0] ?? null : null,
    windSpeedMps: formatWindMps(windKmh),
    weatherCode,
    isDay,
    forecastDate: forecastTarget.date,
    isMatchDateForecast: forecastTarget.isMatchDateForecast
  }
}

export const clearWeatherLocationCache = () => {
  locationCache.clear()
}
