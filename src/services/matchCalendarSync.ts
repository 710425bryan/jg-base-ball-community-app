import { supabase } from './supabase'
import type { MatchRecord } from '@/types/match'
import {
  fetchAndParseICal,
  planCalendarSync,
  type CalendarSyncItem,
  type CalendarSyncRosterMember
} from '@/utils/googleCalendarParser'

type CalendarSyncPlanSource = 'edge-function' | 'browser-proxy'

interface CalendarSyncPlanOptions {
  calendarUrl: string
  existingMatches: MatchRecord[]
  rosterMembers: CalendarSyncRosterMember[]
  minimumMatchDate?: string
}

interface EdgeCalendarSyncResponse {
  success?: boolean
  error?: string
  code?: string
  error_code?: string
  upstream_status?: number
  retry_after_seconds?: number
  sync_items?: CalendarSyncItem[]
}

export interface CalendarSyncPlanResult {
  syncItems: CalendarSyncItem[]
  source: CalendarSyncPlanSource
}

class CalendarSyncPreviewError extends Error {
  constructor(message: string, readonly allowBrowserFallback = false) {
    super(message)
    this.name = 'CalendarSyncPreviewError'
  }
}

const getRetrySeconds = (value: unknown): number | null => {
  const seconds = Number(value)
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : null
}

const getResponseRetrySeconds = (response?: Response): number | null => {
  const value = response?.headers.get('Retry-After')
  if (!value) return null
  return getRetrySeconds(value) ?? getRetrySeconds((Date.parse(value) - Date.now()) / 1000)
}

const previewFailure = (body: EdgeCalendarSyncResponse | null, response?: Response) => {
  const code = typeof body?.error_code === 'string' ? body.error_code : ''
  const retrySeconds = getRetrySeconds(body?.retry_after_seconds) ?? getResponseRetrySeconds(response)
  const wait = retrySeconds ? `請等待 ${retrySeconds} 秒後再試。` : '請稍後再試。'

  if (response?.status === 401 || response?.status === 403) {
    return new CalendarSyncPreviewError('登入已失效或沒有賽事同步權限，請重新登入並確認權限。')
  }
  if (code === 'CALENDAR_SOURCE_RATE_LIMITED' || body?.upstream_status === 429 || response?.status === 429) {
    return new CalendarSyncPreviewError(`Google 行事曆暫時限制讀取，${wait}`)
  }
  if (code === 'CALENDAR_SOURCE_BUSY') {
    return new CalendarSyncPreviewError(`行事曆同步服務忙碌中，${wait}`)
  }
  if (code?.startsWith('CALENDAR_SOURCE_')) {
    return new CalendarSyncPreviewError(`暫時無法讀取 Google 行事曆，${wait}`)
  }
  // Only a missing legacy deployment may use the public iCal compatibility path.
  // Source/auth failures must never cause a second request through another proxy.
  const missingDeployment = response?.status === 404 && body?.code === 'NOT_FOUND'
  return new CalendarSyncPreviewError('行事曆同步服務暫時無法使用，請稍後再試。', missingDeployment)
}

const readErrorResponse = async (error: unknown): Promise<{ body: EdgeCalendarSyncResponse | null; response?: Response }> => {
  const context = (error as { context?: unknown } | null)?.context
  if (!(context instanceof Response)) return { body: null }
  try {
    const body = await context.clone().json()
    return { body: body && typeof body === 'object' ? body : null, response: context }
  } catch {
    return { body: null, response: context }
  }
}

const fetchEdgeCalendarSyncPlan = async (options: CalendarSyncPlanOptions): Promise<CalendarSyncItem[]> => {
  const { data, error } = await supabase.functions.invoke<EdgeCalendarSyncResponse>('sync-match-calendar', {
    body: {
      calendar_url: options.calendarUrl,
      dry_run: true,
      include_items: true,
      ...(options.minimumMatchDate ? { minimum_match_date: options.minimumMatchDate } : {})
    }
  })

  if (error) {
    const failure = await readErrorResponse(error)
    throw previewFailure(failure.body, failure.response)
  }

  if (!data?.success) {
    throw previewFailure(data)
  }

  if (!Array.isArray(data.sync_items)) {
    throw new CalendarSyncPreviewError('舊版行事曆同步服務未提供預覽資料。', true)
  }

  return data.sync_items
}

export const fetchCalendarSyncPlan = async (options: CalendarSyncPlanOptions): Promise<CalendarSyncPlanResult> => {
  try {
    const syncItems = await fetchEdgeCalendarSyncPlan(options)
    return {
      syncItems,
      source: 'edge-function'
    }
  } catch (error) {
    if (!(error instanceof CalendarSyncPreviewError)) throw previewFailure(null)
    if (!error.allowBrowserFallback) throw error
    console.warn('Legacy calendar sync preview unavailable; using public iCal compatibility parsing.')
  }

  const parsedMatches = await fetchAndParseICal(options.calendarUrl)
  return {
    syncItems: planCalendarSync(options.existingMatches, parsedMatches, {
      ...(options.minimumMatchDate ? { minimumMatchDate: options.minimumMatchDate } : {}),
      rosterMembers: options.rosterMembers
    }),
    source: 'browser-proxy'
  }
}
