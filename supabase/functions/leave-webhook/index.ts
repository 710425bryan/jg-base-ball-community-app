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
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  try {
    const payload = await req.json();
    console.log("Webhook payload received:", payload);

    if (!payload.name) {
      return new Response("Missing name", { status: 400 });
    }

    const { data: members, error: memberError } = await supabase
      .from("team_members")
      .select("id")
      .eq("name", payload.name);

    if (memberError || !members || members.length === 0) {
      console.error("Player not found:", payload.name, memberError);
      return new Response("Player not found in team_members", { status: 404 });
    }

    const userId = members[0].id;
    const leaveType = payload.leaveType || "事假";
    const startDate = payload.startDate;
    const endDate = payload.endDate || payload.startDate;
    const reasonPrefix = "[Google 表單送出]";
    const fullReason = `${reasonPrefix} ${payload.reason || ""}`.trim();

    const { data: result, error: rpcError } = await supabase.rpc(
      "insert_leave_request_dedup",
      {
        p_user_id: userId,
        p_leave_type: leaveType,
        p_start_date: startDate,
        p_end_date: endDate,
        p_reason: fullReason,
      },
    );

    if (rpcError) {
      console.error("RPC error:", rpcError);
      return new Response("Error inserting leave request", { status: 500 });
    }

    if (result && result.message === "Duplicate bypassed") {
      console.log("Duplicate submission detected via RPC, ignoring:", payload);
      return new Response(JSON.stringify({ success: true, message: "Duplicate bypassed" }), {
        headers: { "Content-Type": "application/json" },
        status: 200,
      });
    }

    const insertedRecord = result && result.record ? result.record : null;

    const eligibleUserIds = await getEligiblePushTargetUserIds(supabase);
    const subscriptions = await fetchEnabledPushSubscriptions(supabase, eligibleUserIds);
    const highlightUrl = insertedRecord?.id
      ? `/leave-requests?highlight_leave_id=${insertedRecord.id}`
      : "/leave-requests";

    const summary = await sendPushToSubscriptions(supabase, subscriptions, {
      title: `[自動新增假單] ${payload.name} 的${leaveType}`,
      body: `日期：${startDate} ~ ${endDate}\n原因：${payload.reason || "無"}`,
      url: highlightUrl,
    });

    console.log("Leave webhook push dispatch summary:", summary);

    return new Response(JSON.stringify({ success: true, record: insertedRecord, ...summary }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error: any) {
    console.error("Leave webhook failed:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { "Content-Type": "application/json" },
      status: 500,
    });
  }
});
