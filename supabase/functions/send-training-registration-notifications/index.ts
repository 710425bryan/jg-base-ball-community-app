import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import {
  fetchEnabledPushSubscriptions,
  sendPushToSubscriptions,
} from "../_shared/push.ts";
import {
  buildTrainingRegistrationNotificationBody,
  buildTrainingRegistrationNotificationEventKey,
  buildTrainingRegistrationNotificationTitle,
  buildTrainingRegistrationNotificationUrl,
  hasRemainingTrainingRegistrationSlots,
  isTrainingRegistrationDeadlineReminderDue,
  type TrainingRegistrationNotificationKind,
  type TrainingRegistrationNotificationSession,
} from "../../../src/utils/trainingRegistrationNotification.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TRAINING_NOTIFICATION_SECRET = Deno.env.get("TRAINING_NOTIFICATION_SECRET") || "";

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

const assertAuthorized = (req: Request, payload: any) => {
  if (!TRAINING_NOTIFICATION_SECRET) {
    throw jsonResponse({ error: "TRAINING_NOTIFICATION_SECRET is not configured" }, 500);
  }

  const headerSecret = req.headers.get("x-sync-secret") || "";
  const payloadSecret = typeof payload?.sync_secret === "string" ? payload.sync_secret : "";

  if (headerSecret !== TRAINING_NOTIFICATION_SECRET && payloadSecret !== TRAINING_NOTIFICATION_SECRET) {
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
) => {
  const { data, error } = await supabase
    .from("push_dispatch_events")
    .insert({
      event_key: buildTrainingRegistrationNotificationEventKey(session, kind),
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
    return jsonResponse({ error: "method not allowed" }, 405);
  }

  try {
    const payload = await parsePayload(req);
    assertAuthorized(req, payload);

    const now = payload.now ? new Date(String(payload.now)) : new Date();
    if (Number.isNaN(now.getTime())) {
      return jsonResponse({ success: false, error: "now must be a valid date" }, 400);
    }

    const limit = normalizeLimit(payload.limit);
    const dryRun = payload.dry_run === true;
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

      const event = await createTrainingNotificationEvent(session, kind, title, body, url);
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

      sessionResults.push({
        kind,
        session_id: session.session_id,
        match_id: session.match_id,
        event_id: event.id,
        created: true,
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
