import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import {
  corsHeaders,
  fetchEnabledPushSubscriptions,
  sendPushToSubscriptions,
  type StoredWebPushSubscription,
} from "../_shared/push.ts";
import {
  MATCH_FEE_PAYMENT_NOTIFICATION_ACTION,
  groupMatchFeePaymentNotificationTargets,
  type MatchFeePaymentNotificationDispatchResult,
  type MatchFeePaymentNotificationItem,
  type MatchFeePaymentNotificationMatch,
  type MatchFeePaymentNotificationProfile,
  type MatchFeePaymentNotificationTarget,
} from "../../../src/utils/matchFeePaymentNotifications.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type CallerProfile = MatchFeePaymentNotificationProfile & {
  role: string | null;
  is_active?: boolean | null;
  access_start?: string | null;
  access_end?: string | null;
};

type TargetProfile = MatchFeePaymentNotificationProfile & {
  is_active?: boolean | null;
  access_start?: string | null;
  access_end?: string | null;
};

type DispatchTargetResult = MatchFeePaymentNotificationTarget & {
  event_id?: string | null;
  created: boolean;
  skipped?: boolean;
  reason?: string;
  total_targets?: number;
  dispatched_count?: number;
  expired_count?: number;
  failed_count?: number;
  provider_counts?: Record<string, number>;
};

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });

const normalizeText = (value: unknown) => typeof value === "string" ? value.trim() : "";

const isActiveProfile = (
  profile: Pick<TargetProfile, "is_active" | "access_start" | "access_end">,
  now: Date,
) => {
  if (profile.is_active === false) return false;

  const nowTime = now.getTime();
  const startTime = profile.access_start ? new Date(profile.access_start).getTime() : null;
  const endTime = profile.access_end ? new Date(profile.access_end).getTime() : null;

  if (startTime !== null && !Number.isNaN(startTime) && startTime > nowTime) return false;
  if (endTime !== null && !Number.isNaN(endTime) && endTime < nowTime) return false;
  return true;
};

const fetchCallerProfile = async (req: Request, now: Date): Promise<CallerProfile> => {
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
    .select("id, role, is_active, access_start, access_end, linked_team_member_ids")
    .eq("id", userId)
    .single();

  if (profileError || !profile) {
    throw jsonResponse({ success: false, error: "caller profile not found" }, 403);
  }

  if (!isActiveProfile(profile as CallerProfile, now)) {
    throw jsonResponse({ success: false, error: "caller profile is inactive" }, 403);
  }

  return profile as CallerProfile;
};

const assertCallerCanSend = async (caller: CallerProfile) => {
  if (caller.role === "ADMIN") return;

  const { data, error } = await supabase
    .from("app_role_permissions")
    .select("feature")
    .eq("role_key", caller.role || "")
    .eq("feature", "fees")
    .eq("action", "EDIT");

  if (error) throw error;
  if (!data || data.length === 0) {
    throw jsonResponse({ success: false, error: "missing fees edit permission" }, 403);
  }
};

const fetchOpenedMatch = async (matchId: string): Promise<MatchFeePaymentNotificationMatch> => {
  const { data, error } = await supabase
    .from("matches")
    .select("id, match_name, match_date, match_fee_payment_opened_at")
    .eq("id", matchId)
    .single();

  if (error || !data) {
    throw jsonResponse({ success: false, error: "match not found" }, 404);
  }

  if (!data.match_fee_payment_opened_at) {
    throw jsonResponse({ success: false, error: "match fee payment is not open" }, 409);
  }

  return {
    id: String(data.id),
    match_name: data.match_name,
    match_date: data.match_date,
    payment_opened_at: String(data.match_fee_payment_opened_at),
  };
};

const fetchPayableItems = async (matchId: string): Promise<MatchFeePaymentNotificationItem[]> => {
  const { data, error } = await supabase
    .from("match_fee_items")
    .select("id, member_id, member_name_snapshot, amount, payment_status")
    .eq("match_id", matchId)
    .eq("payment_status", "unpaid");

  if (error) throw error;

  return (data || []).map((item) => ({
    id: String(item.id || ""),
    member_id: String(item.member_id || ""),
    member_name: item.member_name_snapshot,
    amount: Number(item.amount) || 0,
  }));
};

const fetchTargetProfiles = async (
  items: MatchFeePaymentNotificationItem[],
  now: Date,
): Promise<MatchFeePaymentNotificationProfile[]> => {
  const targetMemberIds = new Set(items.map((item) => item.member_id).filter(Boolean));
  if (targetMemberIds.size === 0) return [];

  const { data, error } = await supabase
    .from("profiles")
    .select("id, linked_team_member_ids, is_active, access_start, access_end");

  if (error) throw error;

  return ((data || []) as TargetProfile[])
    .filter((profile) => isActiveProfile(profile, now))
    .filter((profile) => {
      const linkedIds = Array.isArray(profile.linked_team_member_ids)
        ? profile.linked_team_member_ids
        : [];
      return linkedIds.some((memberId) => targetMemberIds.has(memberId));
    })
    .map((profile) => ({
      id: profile.id,
      linked_team_member_ids: profile.linked_team_member_ids,
    }));
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

const createNotificationEvent = async (input: {
  matchId: string;
  eventKey: string;
  title: string;
  body: string;
  url: string;
  targetUserId: string;
  targetMemberIds: string[];
}) => {
  const { data, error } = await supabase
    .from("push_dispatch_events")
    .insert({
      event_key: input.eventKey,
      feature: "fees",
      action: MATCH_FEE_PAYMENT_NOTIFICATION_ACTION,
      title: input.title,
      body: input.body,
      url: input.url,
      match_id: input.matchId,
      target_user_id: input.targetUserId,
      target_member_ids: input.targetMemberIds,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { created: false, duplicate: true, id: null };
    }
    throw error;
  }

  return { created: true, duplicate: false, id: data?.id || null };
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "method not allowed" }, 405);
  }

  try {
    const now = new Date();
    const payload = await req.json().catch(() => ({}));
    const matchId = normalizeText(payload.match_id);
    if (!matchId) {
      return jsonResponse({ success: false, error: "match_id is required" }, 400);
    }

    const caller = await fetchCallerProfile(req, now);
    await assertCallerCanSend(caller);

    const match = await fetchOpenedMatch(matchId);
    const items = await fetchPayableItems(matchId);
    const profiles = await fetchTargetProfiles(items, now);
    const targets = groupMatchFeePaymentNotificationTargets(match, items, profiles);
    const subscriptions = await fetchEnabledPushSubscriptions(
      supabase,
      targets.map((target) => target.user_id),
    );
    const subscriptionsByUser = groupSubscriptionsByUser(subscriptions);

    let createdCount = 0;
    let duplicateCount = 0;
    let dispatchedCount = 0;
    let expiredCount = 0;
    let failedCount = 0;
    const providerCounts: Record<string, number> = {};
    const resultTargets: DispatchTargetResult[] = [];

    for (const target of targets) {
      const event = await createNotificationEvent({
        matchId,
        eventKey: target.event_key,
        title: target.title,
        body: target.body,
        url: target.url,
        targetUserId: target.user_id,
        targetMemberIds: target.member_ids,
      });

      if (!event.created) {
        duplicateCount += 1;
        resultTargets.push({
          ...target,
          created: false,
          skipped: true,
          reason: "duplicate_event",
        });
        continue;
      }

      createdCount += 1;
      const summary = await sendPushToSubscriptions(
        supabase,
        subscriptionsByUser.get(target.user_id) || [],
        {
          title: target.title,
          body: target.body,
          url: target.url,
        },
      );

      dispatchedCount += summary.dispatched_count;
      expiredCount += summary.expired_count;
      failedCount += summary.failed_count;
      for (const [provider, count] of Object.entries(summary.provider_counts)) {
        providerCounts[provider] = (providerCounts[provider] || 0) + count;
      }

      resultTargets.push({
        ...target,
        event_id: event.id,
        created: true,
        ...summary,
      });
    }

    const result: MatchFeePaymentNotificationDispatchResult = {
      success: true,
      match_id: matchId,
      member_count: new Set(items.map((item) => item.member_id)).size,
      target_user_count: targets.length,
      subscription_count: subscriptions.length,
      total_amount: items.reduce((total, item) => total + Math.max(0, Number(item.amount) || 0), 0),
      created_count: createdCount,
      duplicate_count: duplicateCount,
      dispatched_count: dispatchedCount,
      expired_count: expiredCount,
      failed_count: failedCount,
      provider_counts: providerCounts,
      targets: resultTargets,
    };

    return jsonResponse(result as unknown as Record<string, unknown>);
  } catch (error: unknown) {
    if (error instanceof Response) return error;

    const message = error instanceof Error ? error.message : String(error);
    console.error("Match fee payment notification dispatch failed:", error);
    return jsonResponse({ success: false, error: message }, 500);
  }
});
