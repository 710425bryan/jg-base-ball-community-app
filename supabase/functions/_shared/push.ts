import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import webpush from "https://esm.sh/web-push@3.6.7";

const publicVapidKey = "BIrzQ2oSy_bdMkLjQMDZCnBMzpkFzNHYa1QlcFKNQ3OCjDsMLeKC-2WazmnkSFUK7nwSlM3n8XFahxUxNrLMCmg";
const privateVapidKey = "wLgkicqYN9HKaOg2oZbdpvcFXdVybK11OdaOjOjQ72U";

webpush.setVapidDetails(
  "mailto:team@example.com",
  publicVapidKey,
  privateVapidKey,
);

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export type StoredWebPushSubscription = {
  id: string;
  user_id: string;
  endpoint: string;
  subscription: Record<string, unknown>;
  enabled: boolean;
  platform: string | null;
  user_agent: string | null;
};

type RolePermissionRow = {
  role_key: string | null;
};

type ProfileIdRow = {
  id: string;
};

export type PushDispatchSummary = {
  total_targets: number;
  dispatched_count: number;
  expired_count: number;
  failed_count: number;
  provider_counts: Record<string, number>;
};

export const detectPushProvider = (endpoint?: string | null) => {
  if (!endpoint) return "Unknown";
  if (endpoint.includes("push.apple.com")) return "Apple Web Push";
  if (endpoint.includes("fcm.googleapis.com")) return "FCM Web Push";
  if (endpoint.includes("updates.push.services.mozilla.com")) return "Mozilla Web Push";
  return "Web Push";
};

export const getEligiblePushTargetUserIds = async (
  supabase: SupabaseClient,
  targetRoles?: string[] | null,
) => {
  const { data: permissionRows, error: permissionError } = await supabase
    .from("app_role_permissions")
    .select("role_key")
    .eq("feature", "leave_requests")
    .eq("action", "EDIT");

  if (permissionError) {
    throw permissionError;
  }

  const eligibleRoles = new Set<string>(["ADMIN"]);
  for (const row of (permissionRows ?? []) as RolePermissionRow[]) {
    if (row.role_key) {
      eligibleRoles.add(row.role_key);
    }
  }

  const filteredRoles = targetRoles && targetRoles.length > 0
    ? [...eligibleRoles].filter((role) => targetRoles.includes(role))
    : [...eligibleRoles];

  if (filteredRoles.length === 0) {
    return [];
  }

  const { data: userRows, error: userError } = await supabase
    .from("profiles")
    .select("id")
    .in("role", filteredRoles);

  if (userError) {
    throw userError;
  }

  return ((userRows ?? []) as ProfileIdRow[])
    .map((row) => row.id)
    .filter(Boolean);
};

export const fetchEnabledPushSubscriptions = async (
  supabase: SupabaseClient,
  userIds: string[],
) => {
  if (userIds.length === 0) {
    return [] as StoredWebPushSubscription[];
  }

  const { data, error } = await supabase
    .from("web_push_subscriptions")
    .select("id, user_id, endpoint, subscription, enabled, platform, user_agent")
    .eq("enabled", true)
    .in("user_id", userIds);

  if (error) {
    throw error;
  }

  return (data ?? []) as StoredWebPushSubscription[];
};

export const sendPushToSubscriptions = async (
  supabase: SupabaseClient,
  subscriptions: StoredWebPushSubscription[],
  payload: { title: string; body: string; url?: string },
): Promise<PushDispatchSummary> => {
  const pushPayload = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url || "/leave-requests",
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
        const { error: deleteError } = await supabase
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
