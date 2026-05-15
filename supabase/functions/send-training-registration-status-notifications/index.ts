import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import {
  corsHeaders,
  fetchEnabledPushSubscriptions,
  sendPushToSubscriptions,
  type StoredWebPushSubscription,
} from "../_shared/push.ts";
import {
  buildTrainingRegistrationNotificationUrl,
  buildTrainingRegistrationStatusNotificationBody,
  buildTrainingRegistrationStatusNotificationEventKey,
  buildTrainingRegistrationStatusNotificationTitle,
  type TrainingRegistrationStatusNotificationContext,
  type TrainingRegistrationStatusNotificationKind,
} from "../../../src/utils/trainingRegistrationNotification.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type ProfileRow = {
  id: string;
  role: string | null;
  linked_team_member_ids: string[] | null;
  is_active?: boolean | null;
  access_start?: string | null;
  access_end?: string | null;
};

type MatchRow = {
  id: string;
  match_name: string | null;
  match_date: string | null;
  match_time: string | null;
  location: string | null;
  match_level: string | null;
};

type TrainingSettingsRow = {
  id: string;
  matches: MatchRow | MatchRow[] | null;
};

type TeamMemberRow = {
  id: string;
  name: string | null;
};

type TrainingRegistrationRow = {
  id: string;
  session_id: string;
  member_id: string;
  status: string | null;
  applied_by: string | null;
  team_members: TeamMemberRow | TeamMemberRow[] | null;
  training_session_settings: TrainingSettingsRow | TrainingSettingsRow[] | null;
};

type CallerContext = {
  id: string;
  profile: ProfileRow | null;
  canEditTraining: boolean;
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

const normalizeBoolean = (value: unknown) => value === true || String(value || "").toLowerCase() === "true";

const normalizeUuid = (value: unknown) => {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(normalized)
    ? normalized
    : null;
};

const normalizeKind = (value: unknown): TrainingRegistrationStatusNotificationKind | null => {
  const normalized = String(value || "").trim();
  return normalized === "submitted" || normalized === "selected" ? normalized : null;
};

const normalizeSingle = <T>(value: T | T[] | null | undefined): T | null =>
  Array.isArray(value) ? value[0] || null : value || null;

const isActiveProfile = (profile: ProfileRow, now: Date) => {
  if (profile.is_active === false) return false;

  const nowTime = now.getTime();
  const startTime = profile.access_start ? new Date(profile.access_start).getTime() : null;
  const endTime = profile.access_end ? new Date(profile.access_end).getTime() : null;

  if (startTime !== null && !Number.isNaN(startTime) && startTime > nowTime) return false;
  if (endTime !== null && !Number.isNaN(endTime) && endTime < nowTime) return false;

  return true;
};

const fetchCaller = async (req: Request): Promise<CallerContext | null> => {
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  const userId = userData?.user?.id;
  if (userError || !userId) {
    console.warn("Training registration status notification denied: missing caller user", userError);
    return null;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, role, linked_team_member_ids, is_active, access_start, access_end")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) {
    console.warn("Training registration status notification denied: profile lookup failed", profileError);
    return null;
  }

  const role = String((profile as ProfileRow | null)?.role || "");
  if (role === "ADMIN") {
    return { id: userId, profile: profile as ProfileRow | null, canEditTraining: true };
  }

  const { data: permissions, error: permissionError } = await supabase
    .from("app_role_permissions")
    .select("feature")
    .eq("role_key", role)
    .eq("feature", "training")
    .eq("action", "EDIT");

  if (permissionError) {
    console.warn("Training registration status notification permission lookup failed", permissionError);
  }

  return {
    id: userId,
    profile: profile as ProfileRow | null,
    canEditTraining: !permissionError && (permissions || []).length > 0,
  };
};

const fetchRegistrationContext = async (registrationId: string): Promise<{
  registration: TrainingRegistrationRow;
  context: TrainingRegistrationStatusNotificationContext;
}> => {
  const { data, error } = await supabase
    .from("training_registrations")
    .select(`
      id,
      session_id,
      member_id,
      status,
      applied_by,
      team_members!inner (
        id,
        name
      ),
      training_session_settings!inner (
        id,
        matches!inner (
          id,
          match_name,
          match_date,
          match_time,
          location,
          match_level
        )
      )
    `)
    .eq("id", registrationId)
    .maybeSingle();

  if (error) throw error;
  const registration = data as TrainingRegistrationRow | null;
  const teamMember = normalizeSingle(registration?.team_members);
  const settings = normalizeSingle(registration?.training_session_settings);
  const match = normalizeSingle(settings?.matches);

  if (!registration?.id || !teamMember?.id || !settings?.id || !match?.id || match.match_level !== "特訓課") {
    throw jsonResponse({ success: false, error: "training registration not found" }, 404);
  }

  return {
    registration,
    context: {
      registration_id: registration.id,
      session_id: registration.session_id,
      match_id: match.id,
      match_name: match.match_name,
      match_date: match.match_date,
      match_time: match.match_time,
      location: match.location,
      member_id: teamMember.id,
      member_name: teamMember.name,
    },
  };
};

const callerOwnsRegistration = (caller: CallerContext, registration: TrainingRegistrationRow) => {
  if (registration.applied_by && registration.applied_by === caller.id) return true;

  const linkedIds = Array.isArray(caller.profile?.linked_team_member_ids)
    ? caller.profile?.linked_team_member_ids
    : [];

  return linkedIds.includes(registration.member_id);
};

const assertAuthorized = (
  caller: CallerContext | null,
  registration: TrainingRegistrationRow,
) => {
  if (!caller) {
    throw jsonResponse({ success: false, error: "unauthorized training registration notification request" }, 401);
  }

  if (caller.canEditTraining || callerOwnsRegistration(caller, registration)) {
    return;
  }

  throw jsonResponse({ success: false, error: "training registration notification is not allowed" }, 403);
};

const fetchTrainingEditTargetUserIds = async (now: Date) => {
  const { data: permissionRows, error: permissionError } = await supabase
    .from("app_role_permissions")
    .select("role_key")
    .eq("feature", "training")
    .eq("action", "EDIT");

  if (permissionError) throw permissionError;

  const roles = new Set<string>(["ADMIN"]);
  for (const row of permissionRows || []) {
    if (row.role_key) roles.add(String(row.role_key));
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, role, linked_team_member_ids, is_active, access_start, access_end")
    .in("role", [...roles]);

  if (error) throw error;

  return [...new Set(
    ((data || []) as ProfileRow[])
      .filter((profile) => profile.id && isActiveProfile(profile, now))
      .map((profile) => profile.id),
  )];
};

const fetchProfileById = async (profileId: string, now: Date) => {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, role, linked_team_member_ids, is_active, access_start, access_end")
    .eq("id", profileId)
    .maybeSingle();

  if (error) throw error;
  const profile = data as ProfileRow | null;
  return profile?.id && isActiveProfile(profile, now) ? profile : null;
};

const fetchLinkedTargetUserIds = async (memberId: string, now: Date) => {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, role, linked_team_member_ids, is_active, access_start, access_end")
    .contains("linked_team_member_ids", [memberId]);

  if (error) throw error;

  return [...new Set(
    ((data || []) as ProfileRow[])
      .filter((profile) => profile.id && isActiveProfile(profile, now))
      .map((profile) => profile.id),
  )];
};

const fetchTargetUserIds = async (
  registration: TrainingRegistrationRow,
  kind: TrainingRegistrationStatusNotificationKind,
  now: Date,
) => {
  if (kind === "submitted") {
    return fetchTrainingEditTargetUserIds(now);
  }

  if (registration.applied_by) {
    const appliedByProfile = await fetchProfileById(registration.applied_by, now);
    if (appliedByProfile?.id) return [appliedByProfile.id];
  }

  return fetchLinkedTargetUserIds(registration.member_id, now);
};

const groupSubscriptionsByUser = (subscriptions: StoredWebPushSubscription[]) => {
  const grouped = new Map<string, StoredWebPushSubscription[]>();

  for (const subscription of subscriptions) {
    if (!subscription.user_id) continue;
    grouped.set(subscription.user_id, [
      ...(grouped.get(subscription.user_id) || []),
      subscription,
    ]);
  }

  return grouped;
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
    const requestUrl = new URL(req.url);
    const registrationId = normalizeUuid(payload.registration_id ?? payload.p_registration_id ?? requestUrl.searchParams.get("registration_id"));
    const kind = normalizeKind(payload.kind ?? requestUrl.searchParams.get("kind"));
    const dryRun = normalizeBoolean(payload.dry_run);
    const forceResend = normalizeBoolean(payload.force_resend);
    const nowValue = payload.now ?? requestUrl.searchParams.get("now");
    const now = nowValue ? new Date(String(nowValue)) : new Date();

    if (!registrationId) {
      return jsonResponse({ success: false, error: "registration_id is required" }, 400);
    }

    if (!kind) {
      return jsonResponse({ success: false, error: "kind must be submitted or selected" }, 400);
    }

    if (Number.isNaN(now.getTime())) {
      return jsonResponse({ success: false, error: "now must be a valid date" }, 400);
    }

    const caller = await fetchCaller(req);
    const { registration, context } = await fetchRegistrationContext(registrationId);
    assertAuthorized(caller, registration);

    if (kind === "selected" && registration.status !== "selected") {
      return jsonResponse({ success: false, error: "training registration is not selected" }, 400);
    }

    const targetUserIds = await fetchTargetUserIds(registration, kind, now);
    const subscriptions = dryRun ? [] : await fetchEnabledPushSubscriptions(supabase, targetUserIds);
    const subscriptionsByUser = groupSubscriptionsByUser(subscriptions);
    const title = buildTrainingRegistrationStatusNotificationTitle(context, kind);
    const body = buildTrainingRegistrationStatusNotificationBody(context, kind);
    const url = buildTrainingRegistrationNotificationUrl(context);
    const targetMemberIds = context.member_id ? [context.member_id] : [];

    let createdCount = 0;
    let duplicateCount = 0;
    let refreshedCount = 0;
    let dispatchedCount = 0;
    let expiredCount = 0;
    let failedCount = 0;
    const providerCounts: Record<string, number> = {};
    const targetResults: Array<Record<string, unknown>> = [];

    for (const targetUserId of targetUserIds) {
      const eventKey = buildTrainingRegistrationStatusNotificationEventKey(context, kind, targetUserId);

      if (dryRun) {
        targetResults.push({
          user_id: targetUserId,
          event_key: eventKey,
          created: false,
          dry_run: true,
        });
        continue;
      }

      const { data: eventData, error: eventError } = await supabase
        .from("push_dispatch_events")
        .insert({
          event_key: eventKey,
          feature: "training",
          action: "VIEW",
          title,
          body,
          url,
          match_id: context.match_id,
          target_user_id: targetUserId,
          target_member_ids: targetMemberIds,
        })
        .select("id")
        .single();

      let eventId = eventData?.id || null;
      let refreshed = false;

      if (eventError) {
        if (eventError.code !== "23505") {
          throw eventError;
        }

        if (!forceResend) {
          duplicateCount += 1;
          targetResults.push({
            user_id: targetUserId,
            event_key: eventKey,
            created: false,
            skipped: true,
            reason: "duplicate_event",
          });
          continue;
        }

        const { data: updatedData, error: updateError } = await supabase
          .from("push_dispatch_events")
          .update({
            feature: "training",
            action: "VIEW",
            title,
            body,
            url,
            match_id: context.match_id,
            target_user_id: targetUserId,
            target_member_ids: targetMemberIds,
            created_at: new Date().toISOString(),
          })
          .eq("event_key", eventKey)
          .select("id")
          .single();

        if (updateError) throw updateError;
        eventId = updatedData?.id || null;
        refreshed = true;
        refreshedCount += 1;
      } else {
        createdCount += 1;
      }

      const pushSummary = await sendPushToSubscriptions(
        supabase,
        subscriptionsByUser.get(targetUserId) || [],
        { title, body, url },
      );

      dispatchedCount += pushSummary.dispatched_count;
      expiredCount += pushSummary.expired_count;
      failedCount += pushSummary.failed_count;

      for (const [provider, count] of Object.entries(pushSummary.provider_counts)) {
        providerCounts[provider] = (providerCounts[provider] || 0) + count;
      }

      targetResults.push({
        user_id: targetUserId,
        event_key: eventKey,
        event_id: eventId,
        created: !refreshed,
        refreshed,
        ...pushSummary,
      });
    }

    return jsonResponse({
      success: true,
      dry_run: dryRun,
      kind,
      registration_id: registrationId,
      active_user_count: targetUserIds.length,
      total_targets: subscriptions.length,
      created_count: createdCount,
      duplicate_count: duplicateCount,
      refreshed_count: refreshedCount,
      dispatched_count: dispatchedCount,
      expired_count: expiredCount,
      failed_count: failedCount,
      provider_counts: providerCounts,
      targets: targetResults,
    });
  } catch (error: any) {
    if (error instanceof Response) return error;

    console.error("Training registration status notification dispatch failed:", error);
    return jsonResponse({ success: false, error: error.message || String(error) }, 500);
  }
});
