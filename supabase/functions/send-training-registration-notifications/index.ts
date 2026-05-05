import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import webpush from "https://esm.sh/web-push@3.6.7";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FALLBACK_TRAINING_NOTIFICATION_SECRET = Deno.env.get("TRAINING_NOTIFICATION_SECRET") || "";
const TRAINING_NOTIFICATION_SETTINGS_KEY = "training_registration_notification";
const TAIPEI_TIME_ZONE = "Asia/Taipei";
const EMPTY_VALUE = "未設定";
const publicVapidKey = "BIrzQ2oSy_bdMkLjQMDZCnBMzpkFzNHYa1QlcFKNQ3OCjDsMLeKC-2WazmnkSFUK7nwSlM3n8XFahxUxNrLMCmg";
const privateVapidKey = "wLgkicqYN9HKaOg2oZbdpvcFXdVybK11OdaOjOjQ72U";

webpush.setVapidDetails(
  "mailto:team@example.com",
  publicVapidKey,
  privateVapidKey,
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sync-secret",
};

type TrainingSettingsRow = {
  id: string;
  registration_start_at: string | null;
  registration_end_at: string | null;
  capacity: number | null;
  point_cost: number | null;
  matches: MatchRow | MatchRow[] | null;
};

type MatchRow = {
  id: string;
  match_name: string | null;
  match_date: string | null;
  match_time: string | null;
  location: string | null;
};

type ProfileRow = {
  id: string;
  role: string | null;
  linked_team_member_ids: string[] | null;
  is_active?: boolean | null;
  access_start?: string | null;
  access_end?: string | null;
};

type TeamMemberRow = {
  id: string;
  role: string | null;
  status: string | null;
};

type RegistrationStatusRow = {
  session_id: string | null;
  status: string | null;
};

type TrainingNotificationJob = {
  kind: TrainingRegistrationNotificationKind;
  session: TrainingRegistrationNotificationSession;
};

type TrainingNotificationConfig = {
  sync_secret?: string | null;
};

type StoredWebPushSubscription = {
  id: string;
  user_id: string;
  endpoint: string;
  subscription: Record<string, unknown>;
  enabled: boolean;
  platform: string | null;
  user_agent: string | null;
};

type PushDispatchSummary = {
  total_targets: number;
  dispatched_count: number;
  expired_count: number;
  failed_count: number;
  provider_counts: Record<string, number>;
};

type TrainingRegistrationNotificationKind = "open" | "deadline_reminder";

type TrainingRegistrationNotificationSession = {
  session_id: string;
  match_id: string;
  match_name?: string | null;
  match_date?: string | null;
  match_time?: string | null;
  location?: string | null;
  registration_start_at?: string | null;
  registration_end_at?: string | null;
  point_cost?: number | null;
  capacity?: number | null;
  selected_count?: number | null;
};

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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

const normalizeLimit = (value: unknown) => {
  const parsed = Number(value ?? 20);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(parsed, 50)) : 20;
};

const detectPushProvider = (endpoint?: string | null) => {
  if (!endpoint) return "Unknown";
  if (endpoint.includes("push.apple.com")) return "Apple Web Push";
  if (endpoint.includes("fcm.googleapis.com")) return "FCM Web Push";
  if (endpoint.includes("updates.push.services.mozilla.com")) return "Mozilla Web Push";
  return "Web Push";
};

const fetchEnabledPushSubscriptions = async (
  supabaseClient: any,
  userIds: string[],
) => {
  if (userIds.length === 0) {
    return [] as StoredWebPushSubscription[];
  }

  const { data, error } = await supabaseClient
    .from("web_push_subscriptions")
    .select("id, user_id, endpoint, subscription, enabled, platform, user_agent")
    .eq("enabled", true)
    .in("user_id", userIds);

  if (error) {
    throw error;
  }

  return (data ?? []) as StoredWebPushSubscription[];
};

const sendPushToSubscriptions = async (
  supabaseClient: any,
  subscriptions: StoredWebPushSubscription[],
  payload: { title: string; body: string; url?: string },
): Promise<PushDispatchSummary> => {
  const pushPayload = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url || "/training",
  });

  const summary: PushDispatchSummary = {
    total_targets: subscriptions.length,
    dispatched_count: 0,
    expired_count: 0,
    failed_count: 0,
    provider_counts: {},
  };

  const results = await Promise.all(subscriptions.map(async (subscription) => {
    const provider = detectPushProvider(subscription.endpoint);
    summary.provider_counts[provider] = (summary.provider_counts[provider] || 0) + 1;

    try {
      await webpush.sendNotification(subscription.subscription as webpush.PushSubscription, pushPayload);
      return { status: "sent" as const };
    } catch (error: any) {
      const statusCode = error?.statusCode;
      if (statusCode === 404 || statusCode === 410) {
        const { error: deleteError } = await supabaseClient
          .from("web_push_subscriptions")
          .delete()
          .eq("id", subscription.id);

        if (deleteError) {
          console.error("Failed to delete expired push subscription", {
            subscriptionId: subscription.id,
            endpoint: subscription.endpoint,
            deleteError,
          });
        }

        return { status: "expired" as const };
      }

      console.error("Web push delivery failed", {
        subscriptionId: subscription.id,
        endpoint: subscription.endpoint,
        statusCode,
        error,
      });

      return { status: "failed" as const };
    }
  }));

  for (const result of results) {
    if (result.status === "sent") {
      summary.dispatched_count += 1;
    } else if (result.status === "expired") {
      summary.expired_count += 1;
    } else {
      summary.failed_count += 1;
    }
  }

  return summary;
};

const normalizeDisplayValue = (value: unknown) => {
  if (value === null || value === undefined) return EMPTY_VALUE;
  const normalized = String(value).replace(/\s+/g, " ").trim();
  return normalized || EMPTY_VALUE;
};

const formatDateTimeInTimeZone = (value: string | null | undefined, timeZone: string) => {
  if (!value) return EMPTY_VALUE;

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return EMPTY_VALUE;

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const parts = formatter.formatToParts(date);
  const partMap = new Map(parts.map((part) => [part.type, part.value]));

  return [
    `${partMap.get("year")}-${partMap.get("month")}-${partMap.get("day")}`,
    `${partMap.get("hour")}:${partMap.get("minute")}`,
  ].join(" ");
};

const getRemainingSlotsLabel = (
  session: Pick<TrainingRegistrationNotificationSession, "capacity" | "selected_count">,
) => {
  const capacity = Number(session.capacity ?? 0);
  if (!Number.isFinite(capacity) || capacity <= 0) return "不限";

  const selectedCount = Number(session.selected_count ?? 0);
  const remainingSlots = Math.max(0, capacity - (Number.isFinite(selectedCount) ? selectedCount : 0));

  return `${remainingSlots} 人`;
};

const hasRemainingTrainingRegistrationSlots = (
  session: Pick<TrainingRegistrationNotificationSession, "capacity" | "selected_count">,
) => {
  const capacity = Number(session.capacity ?? 0);
  if (!Number.isFinite(capacity) || capacity <= 0) return true;

  const selectedCount = Number(session.selected_count ?? 0);
  return (Number.isFinite(selectedCount) ? selectedCount : 0) < capacity;
};

const isTrainingRegistrationDeadlineReminderDue = (
  session: Pick<TrainingRegistrationNotificationSession, "registration_end_at">,
  now: Date,
  reminderWindowMs = 24 * 60 * 60 * 1000,
) => {
  if (!session.registration_end_at) return false;

  const endTime = new Date(session.registration_end_at).getTime();
  if (Number.isNaN(endTime)) return false;

  const nowTime = now.getTime();
  return endTime > nowTime && endTime - nowTime <= reminderWindowMs;
};

const buildTrainingRegistrationNotificationEventKey = (
  session: Pick<TrainingRegistrationNotificationSession, "session_id" | "registration_start_at" | "registration_end_at">,
  kind: TrainingRegistrationNotificationKind = "open",
) => {
  if (kind === "deadline_reminder") {
    return `training_registration_deadline:${session.session_id}:${session.registration_end_at || "no-end"}`;
  }

  return `training_registration_open:${session.session_id}:${session.registration_start_at || "no-start"}`;
};

const buildTrainingRegistrationNotificationUrl = (
  session: Pick<TrainingRegistrationNotificationSession, "session_id">,
) => `/training?session_id=${encodeURIComponent(session.session_id)}`;

const buildTrainingRegistrationNotificationTitle = (
  session: Pick<TrainingRegistrationNotificationSession, "match_name">,
  kind: TrainingRegistrationNotificationKind = "open",
) => kind === "deadline_reminder"
  ? `特訓課報名即將截止：${normalizeDisplayValue(session.match_name)}`
  : `特訓課開放報名：${normalizeDisplayValue(session.match_name)}`;

const buildTrainingRegistrationNotificationBody = (
  session: Pick<
    TrainingRegistrationNotificationSession,
    | "match_name"
    | "match_date"
    | "match_time"
    | "location"
    | "registration_end_at"
    | "point_cost"
    | "capacity"
    | "selected_count"
  >,
  kind: TrainingRegistrationNotificationKind = "open",
) => {
  const lines = [
    `課程：${normalizeDisplayValue(session.match_name)}`,
    `日期：${normalizeDisplayValue(session.match_date)}`,
    `時間：${normalizeDisplayValue(session.match_time)}`,
    `地點：${normalizeDisplayValue(session.location)}`,
    `報名截止：${formatDateTimeInTimeZone(session.registration_end_at, TAIPEI_TIME_ZONE)}`,
    `扣點：${Number(session.point_cost ?? 0)} 點`,
    `名額：${session.capacity ? `${session.capacity} 人` : "不限"}`,
  ];

  if (kind === "deadline_reminder") {
    lines.push(`剩餘名額：${getRemainingSlotsLabel(session)}`);
  }

  return lines.join("\n");
};

const fetchTrainingNotificationSecret = async () => {
  const { data, error } = await supabase
    .from("system_settings")
    .select("value")
    .eq("key", TRAINING_NOTIFICATION_SETTINGS_KEY)
    .maybeSingle();

  if (error) {
    throw error;
  }

  const config = (data?.value || {}) as TrainingNotificationConfig;
  const dbSecret = typeof config.sync_secret === "string" ? config.sync_secret.trim() : "";

  return dbSecret || FALLBACK_TRAINING_NOTIFICATION_SECRET;
};

const assertAuthorized = async (req: Request, payload: any) => {
  const expectedSecret = await fetchTrainingNotificationSecret();

  if (!expectedSecret) {
    throw jsonResponse({ error: "training notification secret is not configured" }, 500);
  }

  const headerSecret = req.headers.get("x-sync-secret") || "";
  const payloadSecret = typeof payload?.sync_secret === "string" ? payload.sync_secret : "";

  if (headerSecret !== expectedSecret && payloadSecret !== expectedSecret) {
    throw jsonResponse({ error: "unauthorized training notification request" }, 401);
  }
};

const isActiveProfile = (profile: ProfileRow, now: Date) => {
  if (profile.is_active === false) return false;

  const nowTime = now.getTime();
  const accessStartTime = profile.access_start ? new Date(profile.access_start).getTime() : null;
  const accessEndTime = profile.access_end ? new Date(profile.access_end).getTime() : null;

  if (accessStartTime !== null && !Number.isNaN(accessStartTime) && accessStartTime > nowTime) return false;
  if (accessEndTime !== null && !Number.isNaN(accessEndTime) && accessEndTime < nowTime) return false;

  return true;
};

const normalizeMatch = (value: TrainingSettingsRow["matches"]) =>
  Array.isArray(value) ? value[0] || null : value;

const normalizeTrainingSession = (row: TrainingSettingsRow): TrainingRegistrationNotificationSession | null => {
  const match = normalizeMatch(row.matches);
  if (!row.id || !row.registration_start_at || !match?.id) return null;

  return {
    session_id: row.id,
    match_id: match.id,
    match_name: match.match_name,
    match_date: match.match_date,
    match_time: match.match_time,
    location: match.location,
    registration_start_at: row.registration_start_at,
    registration_end_at: row.registration_end_at,
    point_cost: row.point_cost,
    capacity: row.capacity,
    selected_count: 0,
  };
};

const fetchOpenTrainingSessions = async (now: Date, limit: number) => {
  const nowIso = now.toISOString();
  const { data, error } = await supabase
    .from("training_session_settings")
    .select(`
      id,
      registration_start_at,
      registration_end_at,
      capacity,
      point_cost,
      matches!inner (
        id,
        match_name,
        match_date,
        match_time,
        location,
        match_level
      )
    `)
    .eq("manual_status", "open")
    .not("registration_start_at", "is", null)
    .lte("registration_start_at", nowIso)
    .or(`registration_end_at.is.null,registration_end_at.gte.${nowIso}`)
    .eq("matches.match_level", "特訓課")
    .order("registration_start_at", { ascending: true })
    .limit(limit);

  if (error) throw error;

  return ((data || []) as TrainingSettingsRow[])
    .map(normalizeTrainingSession)
    .filter((session): session is TrainingRegistrationNotificationSession => Boolean(session));
};

const fetchSelectedCountsBySession = async (sessionIds: string[]) => {
  const counts = new Map<string, number>();
  if (sessionIds.length === 0) return counts;

  const { data, error } = await supabase
    .from("training_registrations")
    .select("session_id, status")
    .in("session_id", sessionIds)
    .eq("status", "selected");

  if (error) throw error;

  for (const row of (data || []) as RegistrationStatusRow[]) {
    if (!row.session_id) continue;
    counts.set(row.session_id, (counts.get(row.session_id) || 0) + 1);
  }

  return counts;
};

const fetchDueTrainingNotificationJobs = async (now: Date, limit: number): Promise<TrainingNotificationJob[]> => {
  const sessions = await fetchOpenTrainingSessions(now, limit);
  const selectedCounts = await fetchSelectedCountsBySession(sessions.map((session) => session.session_id));
  const hydratedSessions = sessions.map((session) => ({
    ...session,
    selected_count: selectedCounts.get(session.session_id) || 0,
  }));

  const jobs: TrainingNotificationJob[] = [];

  for (const session of hydratedSessions) {
    jobs.push({ kind: "open", session });

    if (
      isTrainingRegistrationDeadlineReminderDue(session, now)
      && hasRemainingTrainingRegistrationSlots(session)
    ) {
      jobs.push({ kind: "deadline_reminder", session });
    }
  }

  return jobs;
};

const fetchTrainingPermissionRoles = async () => {
  const { data, error } = await supabase
    .from("app_role_permissions")
    .select("role_key")
    .eq("feature", "training")
    .in("action", ["VIEW", "CREATE", "EDIT", "DELETE"]);

  if (error) throw error;

  const roles = new Set<string>(["ADMIN"]);
  for (const row of data || []) {
    if (row.role_key) roles.add(String(row.role_key));
  }

  return roles;
};

const fetchEligibleTrainingMemberIds = async () => {
  const { data, error } = await supabase
    .from("team_members_safe")
    .select("id, role, status");

  if (error) throw error;

  return new Set(
    ((data || []) as TeamMemberRow[])
      .filter((member) =>
        Boolean(member.id)
        && (member.role === "球員" || member.role === "校隊")
        && member.status !== "退隊"
      )
      .map((member) => member.id),
  );
};

const fetchTrainingTargetUserIds = async (now: Date) => {
  const [permissionRoles, eligibleMemberIds] = await Promise.all([
    fetchTrainingPermissionRoles(),
    fetchEligibleTrainingMemberIds(),
  ]);

  const { data, error } = await supabase
    .from("profiles")
    .select("id, role, linked_team_member_ids, is_active, access_start, access_end");

  if (error) throw error;

  return [...new Set(
    ((data || []) as ProfileRow[])
      .filter((profile) => {
        if (!profile.id || !isActiveProfile(profile, now)) return false;
        if (profile.role && permissionRoles.has(profile.role)) return true;

        const linkedIds = Array.isArray(profile.linked_team_member_ids)
          ? profile.linked_team_member_ids
          : [];

        return linkedIds.some((memberId) => eligibleMemberIds.has(memberId));
      })
      .map((profile) => profile.id),
  )];
};

const createTrainingNotificationEvent = async (
  session: TrainingRegistrationNotificationSession,
  kind: TrainingRegistrationNotificationKind,
  title: string,
  body: string,
  url: string,
  options: { refreshDuplicate?: boolean } = {},
) => {
  const eventKey = buildTrainingRegistrationNotificationEventKey(session, kind);
  const { data, error } = await supabase
    .from("push_dispatch_events")
    .insert({
      event_key: eventKey,
      feature: "training",
      action: "VIEW",
      title,
      body,
      url,
      match_id: session.match_id,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      if (!options.refreshDuplicate) {
        return { created: false, refreshed: false, id: null };
      }

      const { data: updatedData, error: updateError } = await supabase
        .from("push_dispatch_events")
        .update({
          feature: "training",
          action: "VIEW",
          title,
          body,
          url,
          match_id: session.match_id,
          created_at: new Date().toISOString(),
        })
        .eq("event_key", eventKey)
        .select("id")
        .single();

      if (updateError) {
        throw updateError;
      }

      return { created: true, refreshed: true, id: updatedData?.id || null };
    }

    throw error;
  }

  return { created: true, refreshed: false, id: data?.id || null };
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "method not allowed" }, 405);
  }

  try {
    const payload = await parsePayload(req);
    await assertAuthorized(req, payload);

    const now = payload.now ? new Date(String(payload.now)) : new Date();
    if (Number.isNaN(now.getTime())) {
      return jsonResponse({ success: false, error: "now must be a valid date" }, 400);
    }

    const limit = normalizeLimit(payload.limit);
    const dryRun = payload.dry_run === true;
    const forceResend = payload.force_resend === true;
    const jobs = await fetchDueTrainingNotificationJobs(now, limit);

    if (jobs.length === 0) {
      return jsonResponse({
        success: true,
        dry_run: dryRun,
        job_count: 0,
        session_count: 0,
        open_count: 0,
        deadline_reminder_count: 0,
        created_count: 0,
        duplicate_count: 0,
        dispatched_count: 0,
        total_targets: 0,
      });
    }

    const targetUserIds = await fetchTrainingTargetUserIds(now);
    const subscriptions = dryRun ? [] : await fetchEnabledPushSubscriptions(supabase, targetUserIds);

    let createdCount = 0;
    let duplicateCount = 0;
    let dispatchedCount = 0;
    let expiredCount = 0;
    let failedCount = 0;
    const providerCounts: Record<string, number> = {};
    const sessionResults: Array<Record<string, unknown>> = [];

    for (const job of jobs) {
      const { kind, session } = job;
      const title = buildTrainingRegistrationNotificationTitle(session, kind);
      const body = buildTrainingRegistrationNotificationBody(session, kind);
      const url = buildTrainingRegistrationNotificationUrl(session);

      if (dryRun) {
        sessionResults.push({
          kind,
          session_id: session.session_id,
          match_id: session.match_id,
          title,
          body,
          url,
          created: false,
          dry_run: true,
        });
        continue;
      }

      const event = await createTrainingNotificationEvent(session, kind, title, body, url, {
        refreshDuplicate: forceResend,
      });
      if (!event.created) {
        duplicateCount += 1;
        sessionResults.push({
          kind,
          session_id: session.session_id,
          match_id: session.match_id,
          created: false,
          skipped: true,
          reason: "duplicate_event",
        });
        continue;
      }

      if (event.refreshed) {
        duplicateCount += 1;
      } else {
        createdCount += 1;
      }

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

      sessionResults.push({
        kind,
        session_id: session.session_id,
        match_id: session.match_id,
        event_id: event.id,
        created: true,
        refreshed: event.refreshed,
        ...pushSummary,
      });
    }

    return jsonResponse({
      success: true,
      dry_run: dryRun,
      job_count: jobs.length,
      session_count: new Set(jobs.map((job) => job.session.session_id)).size,
      open_count: jobs.filter((job) => job.kind === "open").length,
      deadline_reminder_count: jobs.filter((job) => job.kind === "deadline_reminder").length,
      active_user_count: targetUserIds.length,
      total_targets: subscriptions.length,
      created_count: createdCount,
      duplicate_count: duplicateCount,
      dispatched_count: dispatchedCount,
      expired_count: expiredCount,
      failed_count: failedCount,
      provider_counts: providerCounts,
      sessions: sessionResults,
    });
  } catch (error: any) {
    if (error instanceof Response) return error;

    console.error("Training registration notification dispatch failed:", error);
    return jsonResponse({ success: false, error: error.message || String(error) }, 500);
  }
});
