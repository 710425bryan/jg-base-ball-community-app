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

    const eligibleUserIds = await getEligiblePushTargetUserIds(supabase, targetRoles);
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
