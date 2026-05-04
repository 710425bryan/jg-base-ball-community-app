import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import {
  fetchEnabledPushSubscriptions,
  sendPushToSubscriptions,
  type StoredWebPushSubscription,
} from "../_shared/push.ts";
import {
  buildTrainingLocationNotificationBody,
  buildTrainingLocationNotificationEventKey,
  buildTrainingLocationNotificationTitle,
  buildTrainingLocationNotificationUrl,
  getTrainingLocationTargetDateInTaipei,
  groupTrainingLocationNotificationTargets,
  type TrainingLocationNotificationTarget,
} from "../../../src/utils/trainingLocationNotification.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TRAINING_LOCATION_NOTIFICATION_SECRET = Deno.env.get("TRAINING_LOCATION_NOTIFICATION_SECRET") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-sync-secret",
};

type ProfileRoleRow = {
  role: string | null;
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

const normalizeUuid = (value: unknown) => {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)
    ? normalized
    : null;
};

const canCallerManageTrainingLocations = async (req: Request) => {
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return false;

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  const userId = userData?.user?.id;

  if (userError || !userId) {
    console.warn("Training location notification denied: missing caller user", userError);
    return false;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  if (profileError || !(profile as ProfileRoleRow | null)?.role) {
    console.warn("Training location notification denied: missing caller profile", profileError);
    return false;
  }

  const role = String((profile as ProfileRoleRow).role || "");
  if (role === "ADMIN") return true;

  const { data: permissions, error: permissionError } = await supabase
    .from("app_role_permissions")
    .select("feature")
    .eq("role_key", role)
    .eq("feature", "training_locations")
    .eq("action", "EDIT");

  if (permissionError) {
    console.warn("Training location notification denied: permission lookup failed", permissionError);
    return false;
  }

  return (permissions || []).length > 0;
};

const assertAuthorized = async (req: Request, payload: any) => {
  const headerSecret = req.headers.get("x-sync-secret") || "";
  const payloadSecret = typeof payload?.sync_secret === "string" ? payload.sync_secret : "";

  if (
    TRAINING_LOCATION_NOTIFICATION_SECRET
    && (headerSecret === TRAINING_LOCATION_NOTIFICATION_SECRET || payloadSecret === TRAINING_LOCATION_NOTIFICATION_SECRET)
  ) {
    return;
  }

  if (await canCallerManageTrainingLocations(req)) {
    return;
  }

  throw jsonResponse({ error: "unauthorized training location notification request" }, 401);
};

const fetchTargets = async (targetDate: string, sessionId: string | null) => {
  const { data, error } = await supabase.rpc("list_training_location_notification_targets", {
    p_target_date: targetDate,
    p_session_id: sessionId,
  });

  if (error) throw error;
  return (Array.isArray(data) ? data : []) as TrainingLocationNotificationTarget[];
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
    return jsonResponse({ error: "method not allowed" }, 405);
  }

  try {
    const payload = await parsePayload(req);
    await assertAuthorized(req, payload);

    const now = payload.now ? new Date(String(payload.now)) : new Date();
    if (Number.isNaN(now.getTime())) {
      return jsonResponse({ success: false, error: "now must be a valid date" }, 400);
    }

    const targetDate = typeof payload.target_date === "string" && payload.target_date.trim()
      ? payload.target_date.trim()
      : getTrainingLocationTargetDateInTaipei(now);
    const sessionId = normalizeUuid(payload.session_id);
    const dryRun = payload.dry_run === true;
    const targets = await fetchTargets(targetDate, sessionId);
    const groups = groupTrainingLocationNotificationTargets(targets);
    const targetUserIds = [...new Set(groups.map((group) => group.userId))];
    const subscriptions = dryRun ? [] : await fetchEnabledPushSubscriptions(supabase, targetUserIds);
    const subscriptionsByUser = groupSubscriptionsByUser(subscriptions);

    let createdCount = 0;
    let duplicateCount = 0;
    let dispatchedCount = 0;
    let expiredCount = 0;
    let failedCount = 0;
    const providerCounts: Record<string, number> = {};
    const groupResults: Array<Record<string, unknown>> = [];

    for (const group of groups) {
      const title = buildTrainingLocationNotificationTitle(group);
      const body = buildTrainingLocationNotificationBody(group);
      const url = buildTrainingLocationNotificationUrl(group);
      const eventKey = buildTrainingLocationNotificationEventKey(group);
      const targetMemberIds = group.assignments.map((assignment) => assignment.memberId);

      if (dryRun) {
        groupResults.push({
          user_id: group.userId,
          session_id: group.sessionId,
          member_ids: targetMemberIds,
          title,
          body,
          url,
          created: false,
          dry_run: true,
        });
        continue;
      }

      const { data: eventData, error: eventError } = await supabase
        .from("push_dispatch_events")
        .insert({
          event_key: eventKey,
          feature: "training_locations",
          action: "VIEW",
          title,
          body,
          url,
          target_user_id: group.userId,
          target_member_ids: targetMemberIds,
        })
        .select("id")
        .single();

      if (eventError) {
        if (eventError.code === "23505") {
          duplicateCount += 1;
          groupResults.push({
            user_id: group.userId,
            session_id: group.sessionId,
            created: false,
            skipped: true,
            reason: "duplicate_event",
          });
          continue;
        }

        throw eventError;
      }

      createdCount += 1;
      const pushSummary = await sendPushToSubscriptions(
        supabase,
        subscriptionsByUser.get(group.userId) || [],
        { title, body, url },
      );

      dispatchedCount += pushSummary.dispatched_count;
      expiredCount += pushSummary.expired_count;
      failedCount += pushSummary.failed_count;

      for (const [provider, count] of Object.entries(pushSummary.provider_counts)) {
        providerCounts[provider] = (providerCounts[provider] || 0) + count;
      }

      groupResults.push({
        user_id: group.userId,
        session_id: group.sessionId,
        member_ids: targetMemberIds,
        event_id: eventData?.id || null,
        created: true,
        ...pushSummary,
      });
    }

    return jsonResponse({
      success: true,
      dry_run: dryRun,
      target_date: targetDate,
      session_id: sessionId,
      target_row_count: targets.length,
      group_count: groups.length,
      active_user_count: targetUserIds.length,
      total_targets: subscriptions.length,
      created_count: createdCount,
      duplicate_count: duplicateCount,
      dispatched_count: dispatchedCount,
      expired_count: expiredCount,
      failed_count: failedCount,
      provider_counts: providerCounts,
      groups: groupResults,
    });
  } catch (error: any) {
    if (error instanceof Response) return error;

    console.error("Training location notification dispatch failed:", error);
    return jsonResponse({ success: false, error: error.message || String(error) }, 500);
  }
});
