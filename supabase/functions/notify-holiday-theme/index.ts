import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import {
  fetchEnabledPushSubscriptions,
  getEligiblePushTargetUserIds,
  sendPushToSubscriptions,
} from "../_shared/push.ts";
import {
  HOLIDAY_THEME_SETTING_KEY,
  buildHolidayThemePushPayload,
  getDueHolidayThemeActivities,
  markHolidayThemeActivitiesNotified,
  normalizeHolidayThemeNotificationConfig,
} from "./logic.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const HOLIDAY_THEME_SECRET = Deno.env.get("HOLIDAY_THEME_SECRET") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sync-secret",
};

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type PushTotals = {
  total_targets: number;
  dispatched_count: number;
  expired_count: number;
  failed_count: number;
  provider_counts: Record<string, number>;
};

const emptyTotals = (): PushTotals => ({
  total_targets: 0,
  dispatched_count: 0,
  expired_count: 0,
  failed_count: 0,
  provider_counts: {},
});

const addTotals = (totals: PushTotals, next: PushTotals) => {
  totals.total_targets += next.total_targets;
  totals.dispatched_count += next.dispatched_count;
  totals.expired_count += next.expired_count;
  totals.failed_count += next.failed_count;

  for (const [provider, count] of Object.entries(next.provider_counts)) {
    totals.provider_counts[provider] = (totals.provider_counts[provider] || 0) + count;
  }
};

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });

const parsePayload = async (req: Request) => {
  try {
    return await req.json();
  } catch {
    return {};
  }
};

const assertScheduledRequestAuthorized = (req: Request, payload: Record<string, unknown>) => {
  if (!HOLIDAY_THEME_SECRET) {
    throw jsonResponse({ success: false, error: "HOLIDAY_THEME_SECRET is not configured" }, 500);
  }

  const headerSecret = req.headers.get("x-sync-secret") || "";
  const payloadSecret = typeof payload.sync_secret === "string" ? payload.sync_secret : "";

  if (headerSecret !== HOLIDAY_THEME_SECRET && payloadSecret !== HOLIDAY_THEME_SECRET) {
    throw jsonResponse({ success: false, error: "unauthorized holiday theme request" }, 401);
  }
};

const assertManualRequestAuthorized = async (req: Request) => {
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!token) {
    throw jsonResponse({ success: false, error: "missing authorization token" }, 401);
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  const userId = userData?.user?.id;

  if (userError || !userId) {
    throw jsonResponse({ success: false, error: "invalid authorization token" }, 401);
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  if (profileError || !profile?.role) {
    throw jsonResponse({ success: false, error: "missing caller profile" }, 403);
  }

  if (profile.role === "ADMIN") return;

  const { data: permissions, error: permissionError } = await supabase
    .from("app_role_permissions")
    .select("feature")
    .eq("role_key", profile.role)
    .eq("feature", "holiday_theme_settings")
    .eq("action", "EDIT");

  if (permissionError) {
    throw permissionError;
  }

  if (!permissions?.length) {
    throw jsonResponse({ success: false, error: "holiday theme notification is not allowed" }, 403);
  }
};

const fetchHolidayThemeConfigValue = async () => {
  const { data, error } = await supabase
    .from("system_settings")
    .select("value")
    .eq("key", HOLIDAY_THEME_SETTING_KEY)
    .maybeSingle();

  if (error) throw error;
  return data?.value ?? null;
};

const saveHolidayThemeConfigValue = async (value: unknown) => {
  const { error } = await supabase
    .from("system_settings")
    .upsert(
      {
        key: HOLIDAY_THEME_SETTING_KEY,
        value,
        description: "首頁節日主題多活動設定",
      },
      { onConflict: "key" },
    );

  if (error) throw error;
};

const createPushEvent = async (eventKey: string, title: string, body: string, url: string) => {
  const { data, error } = await supabase
    .from("push_dispatch_events")
    .insert({
      event_key: eventKey,
      feature: "holiday_theme",
      action: "VIEW",
      title,
      body,
      url,
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

const sendHolidayThemePush = async (eventKey: string, activity: Record<string, unknown>) => {
  const payload = buildHolidayThemePushPayload(activity, { url: "/" });
  const event = await createPushEvent(eventKey, payload.title, payload.body, payload.url);

  if (!event.created) {
    return {
      created: false,
      skipped: true,
      reason: "duplicate_event",
      ...emptyTotals(),
    };
  }

  const eligibleUserIds = await getEligiblePushTargetUserIds(supabase, {
    feature: "holiday_theme",
    action: "VIEW",
  });
  const subscriptions = await fetchEnabledPushSubscriptions(supabase, eligibleUserIds);
  const summary = await sendPushToSubscriptions(supabase, subscriptions, payload);

  return {
    created: true,
    skipped: false,
    reason: null,
    ...summary,
  };
};

const dispatchManualNotification = async (req: Request, payload: Record<string, unknown>) => {
  await assertManualRequestAuthorized(req);

  const config = normalizeHolidayThemeNotificationConfig({
    activities: [payload.activity],
  });
  const activity = config.activities[0];

  if (!activity?.activeTheme) {
    return jsonResponse({ success: false, error: "holiday theme activity is invalid" }, 400);
  }

  const requestKey =
    typeof payload.request_key === "string" && payload.request_key.trim()
      ? payload.request_key.trim()
      : crypto.randomUUID();
  const eventKey = `holiday_theme:manual:${activity.id}:${requestKey}`;
  const result = await sendHolidayThemePush(eventKey, activity as unknown as Record<string, unknown>);

  return jsonResponse({
    success: true,
    mode: "manual",
    activity_id: activity.id,
    event_key: eventKey,
    ...result,
  });
};

const dispatchScheduledNotifications = async (req: Request, payload: Record<string, unknown>) => {
  assertScheduledRequestAuthorized(req, payload);

  let nextConfigValue = await fetchHolidayThemeConfigValue();
  const dueActivities = getDueHolidayThemeActivities(nextConfigValue, new Date());

  if (dueActivities.length === 0) {
    return jsonResponse({
      success: true,
      mode: "auto",
      message: "No holiday theme activities are due for notification.",
      activity_ids: [],
      ...emptyTotals(),
    });
  }

  const totals = emptyTotals();
  const activityResults: Array<Record<string, unknown>> = [];
  const notifiedActivityIds: string[] = [];

  for (const activity of dueActivities) {
    const eventKey = `holiday_theme:auto:${activity.id}:${activity.scheduleStartAt || "no-start"}`;
    const result = await sendHolidayThemePush(eventKey, activity as unknown as Record<string, unknown>);

    addTotals(totals, result);
    activityResults.push({
      activity_id: activity.id,
      event_key: eventKey,
      ...result,
    });
    notifiedActivityIds.push(activity.id);

    nextConfigValue = markHolidayThemeActivitiesNotified(
      nextConfigValue,
      [activity.id],
      new Date().toISOString(),
    );
    await saveHolidayThemeConfigValue(nextConfigValue);
  }

  return jsonResponse({
    success: true,
    mode: "auto",
    activity_ids: notifiedActivityIds,
    activities: activityResults,
    ...totals,
  });
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "method not allowed" }, 405);
  }

  try {
    const payload = await parsePayload(req);
    const mode = payload.mode === "manual" ? "manual" : "auto";

    if (mode === "manual") {
      return await dispatchManualNotification(req, payload);
    }

    return await dispatchScheduledNotifications(req, payload);
  } catch (error: any) {
    if (error instanceof Response) return error;

    console.error("Holiday theme notification failed:", error);
    return jsonResponse({ success: false, error: error.message || String(error) }, 500);
  }
});
