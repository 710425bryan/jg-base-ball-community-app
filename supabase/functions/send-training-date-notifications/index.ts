import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import {
  corsHeaders,
  fetchEnabledPushSubscriptions,
  sendPushToSubscriptions,
  type StoredWebPushSubscription,
} from "../_shared/push.ts";
import {
  buildTrainingDateNotificationBody,
  buildTrainingDateNotificationEventKey,
  buildTrainingDateNotificationTitle,
  buildTrainingDateNotificationUrl,
  groupTrainingDateNotificationTargets,
  type TrainingDateNotificationTarget,
} from "../../../src/utils/trainingDateNotification.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type ProfileRoleRow = {
  role: string | null;
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

const normalizeDate = (value: unknown) => {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
};

const normalizeDateArray = (value: unknown) =>
  Array.isArray(value)
    ? [...new Set(value.map(normalizeDate).filter((item): item is string => Boolean(item)))].sort()
    : [];

const canCallerEditTrainingDates = async (req: Request) => {
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return false;

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  const userId = userData?.user?.id;

  if (userError || !userId) {
    console.warn("Training date notification denied: missing caller user", userError);
    return false;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  if (profileError || !(profile as ProfileRoleRow | null)?.role) {
    console.warn("Training date notification denied: missing caller profile", profileError);
    return false;
  }

  const role = String((profile as ProfileRoleRow).role || "");
  if (role === "ADMIN") return true;

  const { data: permissions, error: permissionError } = await supabase
    .from("app_role_permissions")
    .select("feature")
    .eq("role_key", role)
    .eq("feature", "training_dates")
    .eq("action", "EDIT");

  if (permissionError) {
    console.warn("Training date notification permission lookup failed", permissionError);
    return false;
  }

  return (permissions || []).length > 0;
};

const assertAuthorized = async (req: Request) => {
  if (await canCallerEditTrainingDates(req)) return;
  throw jsonResponse({ success: false, error: "training date notification is not allowed" }, 403);
};

const fetchTargets = async (monthStart: string) => {
  const { data, error } = await supabase.rpc("list_training_date_notification_targets", {
    p_month_start: monthStart,
  });

  if (error) throw error;
  return (Array.isArray(data) ? data : []) as TrainingDateNotificationTarget[];
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
    await assertAuthorized(req);
    const payload = await parsePayload(req);
    const monthStart = normalizeDate(payload.month_start);
    const trainingDates = normalizeDateArray(payload.training_dates);
    const addedDates = normalizeDateArray(payload.added_dates);
    const removedDates = normalizeDateArray(payload.removed_dates);
    const changeKey = typeof payload.change_key === "string" && payload.change_key.trim()
      ? payload.change_key.trim()
      : crypto.randomUUID();
    const dryRun = payload.dry_run === true;

    if (!monthStart) {
      return jsonResponse({ success: false, error: "month_start must be YYYY-MM-DD" }, 400);
    }

    if (addedDates.length === 0 && removedDates.length === 0) {
      return jsonResponse({
        success: true,
        skipped: true,
        reason: "no_date_changes",
        month_start: monthStart,
      });
    }

    const targets = await fetchTargets(monthStart);
    const groups = groupTrainingDateNotificationTargets(targets);
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
    const context = {
      monthStart,
      trainingDates,
      addedDates,
      removedDates,
      changeKey,
    };

    for (const group of groups) {
      const title = buildTrainingDateNotificationTitle(context);
      const body = buildTrainingDateNotificationBody(context);
      const url = buildTrainingDateNotificationUrl(context);
      const eventKey = buildTrainingDateNotificationEventKey(group, context);

      if (dryRun) {
        groupResults.push({
          user_id: group.userId,
          member_ids: group.memberIds,
          title,
          body,
          url,
          dry_run: true,
        });
        continue;
      }

      const { data: eventData, error: eventError } = await supabase
        .from("push_dispatch_events")
        .insert({
          event_key: eventKey,
          feature: "training_dates",
          action: "VIEW",
          title,
          body,
          url,
          target_user_id: group.userId,
          target_member_ids: group.memberIds,
        })
        .select("id")
        .single();

      if (eventError) {
        if (eventError.code === "23505") {
          duplicateCount += 1;
          groupResults.push({
            user_id: group.userId,
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
        member_ids: group.memberIds,
        event_id: eventData?.id || null,
        created: true,
        ...pushSummary,
      });
    }

    return jsonResponse({
      success: true,
      dry_run: dryRun,
      month_start: monthStart,
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

    console.error("Training date notification dispatch failed:", error);
    return jsonResponse({ success: false, error: error.message || String(error) }, 500);
  }
});
