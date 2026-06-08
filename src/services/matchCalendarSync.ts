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
  sync_items?: CalendarSyncItem[]
}

export interface CalendarSyncPlanResult {
  syncItems: CalendarSyncItem[]
  source: CalendarSyncPlanSource
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
    throw new Error(error.message || 'Edge Function calendar sync failed')
  }

  if (!data?.success) {
    throw new Error(data?.error || 'Edge Function calendar sync failed')
  }

  if (!Array.isArray(data.sync_items)) {
    throw new Error('Edge Function calendar sync did not return sync items')
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
    console.warn('Edge Function calendar sync preview unavailable; falling back to browser proxy.', error)
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
