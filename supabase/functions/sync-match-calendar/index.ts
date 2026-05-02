import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import {
  parseICalText,
  planCalendarSync,
  type CalendarSyncItem,
  type CalendarSyncRosterMember,
} from "../../../src/utils/googleCalendarParser.ts";
import type { MatchRecord, MatchRecordInput } from "../../../src/types/match.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MATCH_CALENDAR_SYNC_SECRET = Deno.env.get("MATCH_CALENDAR_SYNC_SECRET") || "";

const DEFAULT_CALENDAR_URL = Deno.env.get("MATCH_CALENDAR_ICAL_URL") ||
  "https://calendar.google.com/calendar/ical/jg.baseball.bear%40gmail.com/public/basic.ics";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sync-secret",
};

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type OptionalSyncColumn = "google_calendar_event_id" | "tournament_name";

const optionalColumnSupport: Record<OptionalSyncColumn, boolean | null> = {
  google_calendar_event_id: null,
  tournament_name: null,
};

const isMissingColumnError = (error: any, column: OptionalSyncColumn) => {
  const message = String(error?.message || "");
  return message.includes(column) && (
    message.includes("schema cache") ||
    message.includes("does not exist") ||
    message.includes("Could not find")
  );
};

const markMissingOptionalColumns = (error: any) => {
  let shouldRetry = false;

  for (const column of Object.keys(optionalColumnSupport) as OptionalSyncColumn[]) {
    if (isMissingColumnError(error, column)) {
      optionalColumnSupport[column] = false;
      shouldRetry = true;
    }
  }

  return shouldRetry;
};

const stripUnsupportedColumns = <T extends Partial<MatchRecordInput>>(payload: T) => {
  const normalized: Partial<MatchRecordInput> = { ...payload };

  for (const column of Object.keys(optionalColumnSupport) as OptionalSyncColumn[]) {
    if (optionalColumnSupport[column] === false) {
      delete normalized[column];
    }
  }

  return normalized;
};

const withOptionalColumnFallback = async <T>(
  payload: Partial<MatchRecordInput>,
  run: (normalizedPayload: Partial<MatchRecordInput>) => Promise<{ data: T | null; error: any }>,
) => {
  let lastError: any = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const normalizedPayload = stripUnsupportedColumns(payload);
    const { data, error } = await run(normalizedPayload);

    if (!error) {
      for (const column of Object.keys(optionalColumnSupport) as OptionalSyncColumn[]) {
        if (column in payload && optionalColumnSupport[column] !== false) {
          optionalColumnSupport[column] = true;
        }
      }

      return data as T;
    }

    lastError = error;

    if (!markMissingOptionalColumns(error)) {
      break;
    }
  }

  throw lastError;
};

const fetchICalText = async (calendarUrl: string) => {
  const response = await fetch(calendarUrl, {
    headers: {
      "user-agent": "jg-base-ball-community-app-calendar-sync/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(`Google Calendar iCal 讀取失敗：HTTP ${response.status}`);
  }

  return await response.text();
};

const fetchExistingMatches = async () => {
  const { data, error } = await supabase
    .from("matches")
    .select("*")
    .order("match_date", { ascending: false })
    .order("match_time", { ascending: false });

  if (error) throw error;
  return (data || []) as MatchRecord[];
};

const fetchRosterMembers = async () => {
  const { data, error } = await supabase
    .from("team_members_safe")
    .select("id, name, role, status, jersey_number")
    .in("role", ["球員", "校隊"])
    .order("name", { ascending: true });

  if (error) throw error;
  return (data || []) as CalendarSyncRosterMember[];
};

const createMatch = async (payload: MatchRecordInput) =>
  withOptionalColumnFallback(payload, async (normalizedPayload) => {
    const { data, error } = await supabase
      .from("matches")
      .insert([normalizedPayload])
      .select("id")
      .single();

    return { data, error };
  });

const updateMatch = async (id: string, payload: Partial<MatchRecordInput>) =>
  withOptionalColumnFallback(payload, async (normalizedPayload) => {
    const { data, error } = await supabase
      .from("matches")
      .update(normalizedPayload)
      .eq("id", id)
      .select("id")
      .single();

    return { data, error };
  });

const isUniqueViolation = (error: any) => String(error?.code || "") === "23505";

const countPlannedItems = (items: CalendarSyncItem[]) => ({
  create: items.filter((item) => item.action === "create" && !item.isBlocked).length,
  update: items.filter((item) => item.action === "update" && !item.isBlocked).length,
  skip: items.filter((item) => item.action === "skip" && !item.isBlocked).length,
  blocked: items.filter((item) => item.isBlocked).length,
});

const parsePayload = async (req: Request) => {
  try {
    return await req.json();
  } catch {
    return {};
  }
};

const assertAuthorized = (req: Request, payload: any) => {
  if (!MATCH_CALENDAR_SYNC_SECRET) {
    throw new Response(JSON.stringify({ error: "MATCH_CALENDAR_SYNC_SECRET is not configured" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }

  const headerSecret = req.headers.get("x-sync-secret") || "";
  const payloadSecret = typeof payload?.sync_secret === "string" ? payload.sync_secret : "";

  if (headerSecret !== MATCH_CALENDAR_SYNC_SECRET && payloadSecret !== MATCH_CALENDAR_SYNC_SECRET) {
    throw new Response(JSON.stringify({ error: "unauthorized calendar sync request" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 401,
    });
  }
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 405,
    });
  }

  try {
    const payload = await parsePayload(req);
    assertAuthorized(req, payload);

    const calendarUrl = typeof payload.calendar_url === "string" && payload.calendar_url.trim()
      ? payload.calendar_url.trim()
      : DEFAULT_CALENDAR_URL;
    const minimumMatchDate = typeof payload.minimum_match_date === "string" && payload.minimum_match_date.trim()
      ? payload.minimum_match_date.trim()
      : undefined;
    const dryRun = payload.dry_run === true;

    const [calendarText, existingMatches, rosterMembers] = await Promise.all([
      fetchICalText(calendarUrl),
      fetchExistingMatches(),
      fetchRosterMembers(),
    ]);

    const parsedMatches = parseICalText(calendarText);
    const syncItems = planCalendarSync(
      existingMatches,
      parsedMatches,
      {
        ...(minimumMatchDate ? { minimumMatchDate } : {}),
        rosterMembers,
      },
    );
    const actionableItems = syncItems.filter((item) => item.action !== "skip" && !item.isBlocked);
    const planned = countPlannedItems(syncItems);
    let createdCount = 0;
    let updatedCount = 0;
    let duplicateCount = 0;

    if (!dryRun) {
      for (const item of actionableItems) {
        if (item.action === "create") {
          try {
            await createMatch(item.payload);
            createdCount += 1;
          } catch (error) {
            if (isUniqueViolation(error)) {
              duplicateCount += 1;
              continue;
            }

            throw error;
          }

          continue;
        }

        if (item.action === "update" && item.existingMatchId) {
          await updateMatch(item.existingMatchId, item.payload);
          updatedCount += 1;
        }
      }
    }

    const summary = {
      success: true,
      dry_run: dryRun,
      calendar_url: calendarUrl,
      parsed_count: parsedMatches.length,
      planned,
      created_count: createdCount,
      updated_count: updatedCount,
      duplicate_count: duplicateCount,
      skipped_count: planned.skip,
      blocked_count: planned.blocked,
      optional_column_support: optionalColumnSupport,
    };

    console.log("Match calendar sync summary:", summary);

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    if (error instanceof Response) return error;

    console.error("Match calendar sync failed:", error);
    return new Response(JSON.stringify({ success: false, error: error.message || String(error) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
