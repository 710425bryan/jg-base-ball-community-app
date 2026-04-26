import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import {
  fetchEnabledPushSubscriptions,
  sendPushToSubscriptions,
} from "../_shared/push.ts";
import {
  buildMatchReminderBody,
  buildMatchReminderEventKey,
  buildMatchReminderTitle,
  buildMatchReminderUrl,
  getTomorrowDateInTaipei,
} from "../../../src/utils/matchReminderNotification.ts";
import type { MatchRecord } from "../../../src/types/match.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MATCH_REMINDER_SECRET = Deno.env.get("MATCH_REMINDER_SECRET") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sync-secret",
};

type ActiveProfileRow = {
  id: string;
  is_active?: boolean | null;
  access_start?: string | null;
  access_end?: string | null;
};

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const parsePayload = async (req: Request) => {
  try {
    return await req.json();
  } catch {
    return {};
  }
};

const assertAuthorized = (req: Request, payload: any) => {
  if (!MATCH_REMINDER_SECRET) {
    throw new Response(JSON.stringify({ error: "MATCH_REMINDER_SECRET is not configured" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }

  const headerSecret = req.headers.get("x-sync-secret") || "";
  const payloadSecret = typeof payload?.sync_secret === "string" ? payload.sync_secret : "";

  if (headerSecret !== MATCH_REMINDER_SECRET && payloadSecret !== MATCH_REMINDER_SECRET) {
    throw new Response(JSON.stringify({ error: "unauthorized match reminder request" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 401,
    });
  }
};

const fetchTomorrowMatches = async (targetDate: string) => {
  const { data, error } = await supabase
    .from("matches")
    .select("*")
    .eq("match_date", targetDate)
    .order("match_time", { ascending: true });

  if (error) throw error;
  return (data || []) as MatchRecord[];
};

const isActiveProfile = (profile: ActiveProfileRow, now: Date) => {
  if (profile.is_active !== true) return false;

  const nowTime = now.getTime();
  const accessStartTime = profile.access_start ? new Date(profile.access_start).getTime() : null;
  const accessEndTime = profile.access_end ? new Date(profile.access_end).getTime() : null;

  if (accessStartTime !== null && accessStartTime > nowTime) return false;
  if (accessEndTime !== null && accessEndTime < nowTime) return false;

  return true;
};

const fetchActiveUserIds = async (now: Date) => {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, is_active, access_start, access_end")
    .eq("is_active", true);

  if (error) throw error;

  return ((data || []) as ActiveProfileRow[])
    .filter((profile) => profile.id && isActiveProfile(profile, now))
    .map((profile) => profile.id);
};

const createReminderEvent = async (match: MatchRecord, title: string, body: string, url: string) => {
  const { data, error } = await supabase
    .from("push_dispatch_events")
    .insert({
      event_key: buildMatchReminderEventKey(match),
      feature: "matches",
      action: "REMINDER",
      title,
      body,
      url,
      match_id: match.id,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { created: false, id: null };
    }

    throw error;
  }

  return { created: true, id: data?.id || null };
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

    const now = payload.now ? new Date(String(payload.now)) : new Date();
    const targetDate = typeof payload.target_date === "string" && payload.target_date.trim()
      ? payload.target_date.trim()
      : getTomorrowDateInTaipei(now);
    const dryRun = payload.dry_run === true;

    const matches = await fetchTomorrowMatches(targetDate);

    if (matches.length === 0) {
      return new Response(JSON.stringify({
        success: true,
        target_date: targetDate,
        match_count: 0,
        created_count: 0,
        duplicate_count: 0,
        dispatched_count: 0,
        total_targets: 0,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const activeUserIds = await fetchActiveUserIds(now);
    const subscriptions = await fetchEnabledPushSubscriptions(supabase, activeUserIds);

    let createdCount = 0;
    let duplicateCount = 0;
    let dispatchedCount = 0;
    let expiredCount = 0;
    let failedCount = 0;
    const providerCounts: Record<string, number> = {};
    const matchResults: Array<Record<string, unknown>> = [];

    for (const match of matches) {
      const title = buildMatchReminderTitle(match);
      const body = buildMatchReminderBody(match);
      const url = buildMatchReminderUrl(match);

      if (dryRun) {
        matchResults.push({
          match_id: match.id,
          title,
          body,
          url,
          created: false,
          dry_run: true,
        });
        continue;
      }

      const reminderEvent = await createReminderEvent(match, title, body, url);

      if (!reminderEvent.created) {
        duplicateCount += 1;
        matchResults.push({
          match_id: match.id,
          created: false,
          skipped: true,
          reason: "duplicate_event",
        });
        continue;
      }

      createdCount += 1;
      const pushSummary = await sendPushToSubscriptions(supabase, subscriptions, {
        title,
        body,
        url,
      });

      dispatchedCount += pushSummary.dispatched_count;
      expiredCount += pushSummary.expired_count;
      failedCount += pushSummary.failed_count;

      for (const [provider, count] of Object.entries(pushSummary.provider_counts)) {
        providerCounts[provider] = (providerCounts[provider] || 0) + count;
      }

      matchResults.push({
        match_id: match.id,
        event_id: reminderEvent.id,
        created: true,
        ...pushSummary,
      });
    }

    return new Response(JSON.stringify({
      success: true,
      dry_run: dryRun,
      target_date: targetDate,
      match_count: matches.length,
      active_user_count: activeUserIds.length,
      total_targets: subscriptions.length,
      created_count: createdCount,
      duplicate_count: duplicateCount,
      dispatched_count: dispatchedCount,
      expired_count: expiredCount,
      failed_count: failedCount,
      provider_counts: providerCounts,
      matches: matchResults,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    if (error instanceof Response) return error;

    console.error("Match reminder dispatch failed:", error);
    return new Response(JSON.stringify({ success: false, error: error.message || String(error) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
