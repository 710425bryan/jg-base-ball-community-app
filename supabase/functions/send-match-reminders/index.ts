import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import {
  fetchEnabledPushSubscriptions,
  sendPushToSubscriptions,
} from "../_shared/push.ts";
import {
  buildManualMatchReminderEventKey,
  buildMatchNotificationTitle,
  buildMatchReminderBody,
  buildMatchReminderTitleForDaysBefore,
  buildMatchReminderUrl,
} from "../../../src/utils/matchReminderNotification.ts";
import {
  MATCH_REMINDER_SCHEDULE_CONFIG_KEY,
  buildMatchReminderScheduleEventKey,
  getDueMatchReminderRules,
  normalizeMatchReminderScheduleConfig,
  type DueMatchReminderScheduleRule,
} from "../../../src/utils/matchReminderSchedule.ts";
import type { MatchRecord } from "../../../src/types/match.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
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

type ScheduledMatchReminderJob = {
  match: MatchRecord;
  rule: DueMatchReminderScheduleRule | null;
};

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });

const normalizeString = (value: unknown) => typeof value === "string" ? value.trim() : "";

const parsePayload = async (req: Request) => {
  try {
    return await req.json();
  } catch {
    return {};
  }
};

const isSecretAuthorized = (req: Request, payload: any) => {
  const headerSecret = req.headers.get("x-sync-secret") || "";
  const payloadSecret = typeof payload?.sync_secret === "string" ? payload.sync_secret : "";

  return Boolean(MATCH_REMINDER_SECRET) &&
    (headerSecret === MATCH_REMINDER_SECRET || payloadSecret === MATCH_REMINDER_SECRET);
};

const assertUserCanSendMatchReminder = async (req: Request) => {
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!token) {
    if (!MATCH_REMINDER_SECRET) {
      throw jsonResponse({ error: "MATCH_REMINDER_SECRET is not configured" }, 500);
    }

    throw jsonResponse({ error: "missing authorization token" }, 401);
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user?.id) {
    throw jsonResponse({ error: "invalid authorization token" }, 401);
  }

  if (!SUPABASE_ANON_KEY) {
    throw jsonResponse({ error: "SUPABASE_ANON_KEY is not configured" }, 500);
  }

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });

  const { data: canEditMatches, error: permissionError } = await userClient.rpc("has_app_permission", {
    p_feature: "matches",
    p_action: "EDIT",
  });

  if (permissionError) {
    throw permissionError;
  }

  if (canEditMatches !== true) {
    throw jsonResponse({ error: "missing matches edit permission" }, 403);
  }
};

const assertAuthorized = async (req: Request, payload: any) => {
  if (isSecretAuthorized(req, payload)) {
    return "secret" as const;
  }

  await assertUserCanSendMatchReminder(req);
  return "user" as const;
};

const fetchScheduleConfig = async () => {
  const { data, error } = await supabase
    .from("system_settings")
    .select("value")
    .eq("key", MATCH_REMINDER_SCHEDULE_CONFIG_KEY)
    .maybeSingle();

  if (error) throw error;
  return normalizeMatchReminderScheduleConfig(data?.value);
};

const fetchMatchesByDate = async (targetDate: string) => {
  const { data, error } = await supabase
    .from("matches")
    .select("*")
    .eq("match_date", targetDate)
    .order("match_time", { ascending: true });

  if (error) throw error;
  return (data || []) as MatchRecord[];
};

const fetchMatchById = async (matchId: string) => {
  const { data, error } = await supabase
    .from("matches")
    .select("*")
    .eq("id", matchId)
    .limit(1);

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

const createReminderEvent = async (match: MatchRecord, title: string, body: string, url: string, eventKey: string) => {
  const { data, error } = await supabase
    .from("push_dispatch_events")
    .insert({
      event_key: eventKey,
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

const buildScheduledJobs = async (now: Date) => {
  const scheduleConfig = await fetchScheduleConfig();
  const dueRules = getDueMatchReminderRules(scheduleConfig, now);
  const jobs: ScheduledMatchReminderJob[] = [];

  for (const rule of dueRules) {
    const matches = await fetchMatchesByDate(rule.target_date);
    for (const match of matches) {
      jobs.push({ match, rule });
    }
  }

  return { dueRules, jobs };
};

const getTargetDates = (dueRules: DueMatchReminderScheduleRule[]) => [
  ...new Set(dueRules.map((rule) => rule.target_date)),
];

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "method not allowed" }, 405);
  }

  try {
    const payload = await parsePayload(req);
    const authorizationMode = await assertAuthorized(req, payload);

    const now = payload.now ? new Date(String(payload.now)) : new Date();
    const targetMatchId = normalizeString(payload.match_id);
    if (authorizationMode === "user" && !targetMatchId) {
      throw jsonResponse({ error: "match_id is required for manual match reminder" }, 400);
    }

    const dryRun = payload.dry_run === true;

    const dueRules: DueMatchReminderScheduleRule[] = [];
    let jobs: ScheduledMatchReminderJob[] = [];

    if (targetMatchId) {
      jobs = (await fetchMatchById(targetMatchId)).map((match) => ({ match, rule: null }));
    } else {
      const scheduledResult = await buildScheduledJobs(now);
      dueRules.push(...scheduledResult.dueRules);
      jobs = scheduledResult.jobs;
    }

    if (jobs.length === 0) {
      const targetDates = getTargetDates(dueRules);

      return jsonResponse({
        success: true,
        dry_run: dryRun,
        target_date: targetMatchId || targetDates.length !== 1 ? null : targetDates[0],
        target_dates: targetDates,
        target_match_id: targetMatchId || null,
        rule_count: dueRules.length,
        due_rules: dueRules,
        match_count: 0,
        created_count: 0,
        duplicate_count: 0,
        dispatched_count: 0,
        total_targets: 0,
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

    for (const job of jobs) {
      const match = job.match;
      const title = targetMatchId
        ? buildMatchNotificationTitle(match)
        : buildMatchReminderTitleForDaysBefore(match, job.rule?.days_before ?? 1);
      const body = buildMatchReminderBody(match);
      const url = buildMatchReminderUrl(match);
      const eventKey = targetMatchId
        ? buildManualMatchReminderEventKey(match)
        : buildMatchReminderScheduleEventKey(match, job.rule!);

      if (dryRun) {
        matchResults.push({
          match_id: match.id,
          rule_id: job.rule?.id || null,
          scheduled_date: job.rule?.scheduled_date || null,
          target_date: job.rule?.target_date || null,
          event_key: eventKey,
          title,
          body,
          url,
          created: false,
          dry_run: true,
        });
        continue;
      }

      const reminderEvent = await createReminderEvent(match, title, body, url, eventKey);

      if (!reminderEvent.created) {
        duplicateCount += 1;
        matchResults.push({
          match_id: match.id,
          rule_id: job.rule?.id || null,
          scheduled_date: job.rule?.scheduled_date || null,
          target_date: job.rule?.target_date || null,
          event_key: eventKey,
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
        rule_id: job.rule?.id || null,
        scheduled_date: job.rule?.scheduled_date || null,
        target_date: job.rule?.target_date || null,
        event_key: eventKey,
        event_id: reminderEvent.id,
        created: true,
        ...pushSummary,
      });
    }

    const targetDates = getTargetDates(dueRules);

    return jsonResponse({
      success: true,
      dry_run: dryRun,
      target_date: targetMatchId || targetDates.length !== 1 ? null : targetDates[0],
      target_dates: targetDates,
      target_match_id: targetMatchId || null,
      rule_count: dueRules.length,
      due_rules: dueRules,
      match_count: jobs.length,
      active_user_count: activeUserIds.length,
      total_targets: subscriptions.length,
      created_count: createdCount,
      duplicate_count: duplicateCount,
      dispatched_count: dispatchedCount,
      expired_count: expiredCount,
      failed_count: failedCount,
      provider_counts: providerCounts,
      matches: matchResults,
    });
  } catch (error: any) {
    if (error instanceof Response) return error;

    console.error("Match reminder dispatch failed:", error);
    return jsonResponse({ success: false, error: error.message || String(error) }, 500);
  }
});
