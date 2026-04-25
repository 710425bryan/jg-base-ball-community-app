import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import {
  corsHeaders,
  fetchEnabledPushSubscriptions,
  getEligiblePushTargetUserIds,
  sendPushToSubscriptions,
} from "../_shared/push.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const normalizeTargetUserIds = (value: unknown) => {
  if (!Array.isArray(value)) return [];
  return [...new Set(
    value
      .map((item) => typeof item === "string" ? item.trim() : "")
      .filter((item) => item.length > 0)
  )];
};

const canSendExplicitUserPush = async (req: Request) => {
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!token) return false;

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  const userId = userData?.user?.id;

  if (userError || !userId) {
    console.warn("Explicit push target denied: missing caller user", userError);
    return false;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  if (profileError || !profile?.role) {
    console.warn("Explicit push target denied: missing caller profile", profileError);
    return false;
  }

  if (profile.role === "ADMIN") {
    return true;
  }

  const { data: permissionRows, error: permissionError } = await supabase
    .from("app_role_permissions")
    .select("feature")
    .eq("role_key", profile.role)
    .eq("action", "EDIT")
    .in("feature", ["equipment", "fees"]);

  if (permissionError) {
    console.warn("Explicit push target denied: permission lookup failed", permissionError);
    return false;
  }

  return (permissionRows || []).length > 0;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    console.log("Push payload received:", payload);

    const pushTitle = payload.title || "系統通知";
    const pushBody = payload.body || "";
    const targetRoles = Array.isArray(payload.target_roles) ? payload.target_roles : null;
    const targetUserIds = normalizeTargetUserIds(payload.target_user_ids);
    const feature = typeof payload.feature === "string" ? payload.feature : null;
    const action = typeof payload.action === "string" ? payload.action : null;
    const eventKey = typeof payload.event_key === "string" ? payload.event_key.trim() : "";

    if (targetUserIds.length > 0) {
      const canTargetUsers = await canSendExplicitUserPush(req);
      if (!canTargetUsers) {
        return new Response(JSON.stringify({ error: "explicit push targets are not allowed" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 403,
        });
      }
    }

    if (eventKey) {
      const { error: eventError } = await supabase
        .from("push_dispatch_events")
        .insert({
          event_key: eventKey,
          feature,
          action,
          title: pushTitle,
          url: payload.url || "/leave-requests",
        });

      if (eventError) {
        if (eventError.code === "23505") {
          return new Response(JSON.stringify({
            success: true,
            skipped: true,
            reason: "duplicate_event",
            total_targets: 0,
            dispatched_count: 0,
            expired_count: 0,
            failed_count: 0,
            provider_counts: {},
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          });
        }

        throw eventError;
      }
    }

    const eligibleUserIds = targetUserIds.length > 0
      ? targetUserIds
      : await getEligiblePushTargetUserIds(supabase, {
        feature,
        action,
        targetRoles,
      });
    const subscriptions = await fetchEnabledPushSubscriptions(supabase, eligibleUserIds);
    const summary = await sendPushToSubscriptions(supabase, subscriptions, {
      title: pushTitle,
      body: pushBody,
      url: payload.url || "/leave-requests",
    });

    console.log("Push dispatch summary:", summary);

    return new Response(JSON.stringify({ success: true, ...summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    console.error("Push dispatch failed:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
