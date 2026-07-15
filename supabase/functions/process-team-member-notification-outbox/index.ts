import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import {
  detectPushProvider,
  fetchEnabledPushSubscriptions,
  getEligiblePushTargetUserIds,
  sendPushToSubscriptions,
  type StoredWebPushSubscription,
} from "../_shared/push.ts";
import {
  clampBatchLimit,
  getDeliveryFailureDisposition,
  mapWithConcurrency,
} from "./logic.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TEAM_MEMBER_OUTBOX_SECRET = Deno.env.get("TEAM_MEMBER_OUTBOX_SECRET") || "";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

type OutboxEventRow = {
  id: string;
  event_key: string;
  feature: string;
  action: string;
  title: string;
  body: string;
  url: string;
};

type OutboxDeliveryRow = {
  id: string;
  event_id: string;
  subscription_id: string;
  user_id: string;
  endpoint: string;
  subscription: Record<string, unknown>;
  provider: string | null;
  attempt_count: number;
  title: string;
  body: string;
  url: string;
};

const jsonResponse = (body: Record<string, unknown>, status = 200) => new Response(
  JSON.stringify(body),
  {
    status,
    headers: { "Content-Type": "application/json" },
  },
);

const secureEquals = (left: string, right: string) => {
  if (!left || !right || left.length !== right.length) return false;

  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
};

const finalizeEvent = async (eventId: string) => {
  const { error } = await supabase.rpc("finalize_team_member_notification_outbox_event", {
    p_event_id: eventId,
  });
  if (error) throw error;
};

const initializeEventDeliveries = async (event: OutboxEventRow) => {
  try {
    const eligibleUserIds = await getEligiblePushTargetUserIds(supabase, {
      feature: "players",
      action: "VIEW",
    });
    const subscriptions = await fetchEnabledPushSubscriptions(supabase, eligibleUserIds);

    if (subscriptions.length > 0) {
      const deliveryRows = subscriptions.map((subscription) => ({
        event_id: event.id,
        subscription_id: subscription.id,
        user_id: subscription.user_id,
        endpoint: subscription.endpoint,
        subscription: subscription.subscription,
        provider: detectPushProvider(subscription.endpoint),
        status: "pending",
      }));

      const { error: deliveryError } = await supabase
        .from("push_dispatch_deliveries")
        .upsert(deliveryRows, {
          onConflict: "event_id,subscription_id",
          ignoreDuplicates: true,
        });
      if (deliveryError) throw deliveryError;
    }

    await finalizeEvent(event.id);
    return subscriptions.length;
  } catch (error: any) {
    const { error: resetError } = await supabase
      .from("push_dispatch_events")
      .update({
        dispatch_status: "pending",
        locked_at: null,
        updated_at: new Date().toISOString(),
        last_error: error?.message || "failed to initialize outbox deliveries",
      })
      .eq("id", event.id)
      .eq("dispatch_mode", "outbox");

    if (resetError) {
      console.error("Failed to release team member outbox event", { eventId: event.id, resetError });
    }
    throw error;
  }
};

const updateClaimedDelivery = async (
  delivery: OutboxDeliveryRow,
  values: Record<string, unknown>,
) => {
  const { error } = await supabase
    .from("push_dispatch_deliveries")
    .update({
      ...values,
      locked_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", delivery.id)
    .eq("status", "processing")
    .eq("attempt_count", delivery.attempt_count);

  if (error) throw error;
};

const deliverOne = async (delivery: OutboxDeliveryRow) => {
  const storedSubscription: StoredWebPushSubscription = {
    id: delivery.subscription_id,
    user_id: delivery.user_id,
    endpoint: delivery.endpoint,
    subscription: delivery.subscription,
    enabled: true,
    platform: null,
    user_agent: null,
  };

  try {
    const summary = await sendPushToSubscriptions(supabase, [storedSubscription], {
      title: delivery.title,
      body: delivery.body,
      url: delivery.url,
    });

    if (summary.dispatched_count === 1) {
      await updateClaimedDelivery(delivery, {
        status: "sent",
        sent_at: new Date().toISOString(),
        last_error: null,
      });
      return "sent" as const;
    }

    if (summary.expired_count === 1) {
      await updateClaimedDelivery(delivery, {
        status: "expired",
        last_error: "web push subscription expired",
      });
      return "expired" as const;
    }

    throw new Error(`web push delivery failed on attempt ${delivery.attempt_count}`);
  } catch (error: any) {
    const disposition = getDeliveryFailureDisposition(delivery.attempt_count);
    await updateClaimedDelivery(delivery, {
      status: disposition.status,
      next_attempt_at: disposition.nextAttemptAt,
      last_error: error?.message || `web push delivery failed on attempt ${delivery.attempt_count}`,
    });
    return disposition.status === "failed" ? "failed" as const : "retrying" as const;
  }
};

serve(async (req) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "method not allowed" }, 405);
  }

  if (!TEAM_MEMBER_OUTBOX_SECRET) {
    console.error("TEAM_MEMBER_OUTBOX_SECRET is not configured");
    return jsonResponse({ error: "worker is not configured" }, 500);
  }

  if (!secureEquals(req.headers.get("x-sync-secret") || "", TEAM_MEMBER_OUTBOX_SECRET)) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  try {
    const requestBody = await req.json().catch(() => ({}));
    const eventLimit = clampBatchLimit(requestBody?.event_limit, 25, 25);
    const deliveryLimit = clampBatchLimit(requestBody?.delivery_limit, 100, 100);

    const { data: eventRows, error: eventError } = await supabase.rpc(
      "claim_team_member_notification_outbox_events",
      { p_limit: eventLimit },
    );
    if (eventError) throw eventError;

    const events = (eventRows || []) as OutboxEventRow[];
    let initializedTargets = 0;
    let eventInitializationFailures = 0;

    for (const event of events) {
      try {
        initializedTargets += await initializeEventDeliveries(event);
      } catch (error) {
        eventInitializationFailures += 1;
        console.error("Failed to initialize team member outbox event", {
          eventId: event.id,
          error,
        });
      }
    }

    const { data: deliveryRows, error: deliveryError } = await supabase.rpc(
      "claim_team_member_notification_deliveries",
      { p_limit: deliveryLimit },
    );
    if (deliveryError) throw deliveryError;

    const deliveries = (deliveryRows || []) as OutboxDeliveryRow[];
    const deliveryResults = await mapWithConcurrency(deliveries, 10, deliverOne);
    const affectedEventIds = [...new Set(deliveries.map((delivery) => delivery.event_id))];

    for (const eventId of affectedEventIds) {
      await finalizeEvent(eventId);
    }

    const summary = deliveryResults.reduce<Record<string, number>>((result, status) => {
      result[status] = (result[status] || 0) + 1;
      return result;
    }, {});

    return jsonResponse({
      success: true,
      claimed_events: events.length,
      initialized_targets: initializedTargets,
      event_initialization_failures: eventInitializationFailures,
      claimed_deliveries: deliveries.length,
      delivery_results: summary,
    });
  } catch (error: any) {
    console.error("Team member notification outbox worker failed", error);
    return jsonResponse({ error: error?.message || "outbox worker failed" }, 500);
  }
});
