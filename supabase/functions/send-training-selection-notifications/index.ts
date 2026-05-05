import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import {
  corsHeaders,
  fetchEnabledPushSubscriptions,
  sendPushToSubscriptions,
} from "../_shared/push.ts";
import {
  buildTrainingRegistrationNotificationBody,
  buildTrainingRegistrationNotificationEventKey,
  buildTrainingRegistrationNotificationTitle,
  buildTrainingRegistrationNotificationUrl,
  type TrainingRegistrationNotificationSession,
} from "../../../src/utils/trainingRegistrationNotification.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const TRAINING_SELECTION_NOTIFICATION_SECRET = Deno.env.get("TRAINING_SELECTION_NOTIFICATION_SECRET") || "";

type ProfileRow = {
  id: string;
  role: string | null;
  linked_team_member_ids: string[] | null;
  is_active?: boolean | null;
  access_start?: string | null;
  access_end?: string | null;
};

type ProfileRoleRow = {
  role: string | null;
};

type TeamMemberRow = {
  id: string;
  role: string | null;
  status: string | null;
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
  published_at: string | null;
  registration_start_at: string | null;
  registration_end_at: string | null;
  capacity: number | null;
  point_cost: number | null;
  matches: MatchRow | MatchRow[] | null;
};

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });

type ParsedPayload = {
  data: any;
  rawLength: number;
  contentType: string;
};

const parseTextPayload = (raw: string): any => {
  const trimmed = raw.trim();
  if (!trimmed) return {};

  try {
    return JSON.parse(trimmed);
  } catch {
    // Some API consoles send form-encoded bodies even when they display a JSON payload.
    try {
      const params = new URLSearchParams(trimmed);
      const entries = [...params.entries()];
      if (entries.length > 0) {
        return Object.fromEntries(entries);
      }
    } catch {
      // Fall through to regex extraction.
    }

    const jsonStart = trimmed.indexOf("{");
    const jsonEnd = trimmed.lastIndexOf("}");
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      try {
        return JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1));
      } catch {
        // Keep the raw string for later regex extraction.
      }
    }

    return { raw_body: trimmed };
  }
};

const parsePayload = async (req: Request): Promise<ParsedPayload> => {
  const contentType = req.headers.get("content-type") || "";
  const raw = await req.text();

  return {
    data: parseTextPayload(raw),
    rawLength: raw.length,
    contentType,
  };
};

const normalizePayloadCandidate = (value: unknown): any => {
  if (typeof value === "string") {
    return parseTextPayload(value);
  }

  return value;
};

const pickPayloadValue = (payload: any, key: string, depth = 0): unknown => {
  if (depth > 4 || payload === null || payload === undefined) return undefined;

  const normalized = normalizePayloadCandidate(payload);
  if (normalized === null || normalized === undefined) return undefined;

  if (typeof normalized === "object" && !Array.isArray(normalized)) {
    if (Object.prototype.hasOwnProperty.call(normalized, key)) {
      return normalized[key];
    }

    for (const nestedKey of ["payload", "body", "data", "variables", "params", "raw_body"]) {
      const nestedValue = pickPayloadValue(normalized[nestedKey], key, depth + 1);
      if (nestedValue !== undefined) return nestedValue;
    }
  }

  if (typeof normalized === "string") {
    const match = normalized.match(new RegExp(`["']?${key}["']?\\s*[:=]\\s*["']?([^"',&\\s}]+)`, "i"));
    return match?.[1];
  }

  return undefined;
};

const describePayloadShape = (payload: any) => {
  const normalized = normalizePayloadCandidate(payload);
  if (normalized && typeof normalized === "object" && !Array.isArray(normalized)) {
    return Object.keys(normalized).slice(0, 12);
  }

  return [];
};

const normalizeBoolean = (value: unknown) => value === true || String(value || "").toLowerCase() === "true";

const normalizeUuid = (value: unknown) => {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(normalized)
    ? normalized
    : null;
};

const isActiveProfile = (profile: ProfileRow, now: Date) => {
  if (profile.is_active === false) return false;

  const startTime = profile.access_start ? new Date(profile.access_start).getTime() : null;
  const endTime = profile.access_end ? new Date(profile.access_end).getTime() : null;
  const nowTime = now.getTime();

  if (startTime !== null && !Number.isNaN(startTime) && startTime > nowTime) return false;
  if (endTime !== null && !Number.isNaN(endTime) && endTime < nowTime) return false;

  return true;
};

const canCallerManageTraining = async (req: Request) => {
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return false;

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  const userId = userData?.user?.id;

  if (userError || !userId) {
    console.warn("Training selection notification denied: missing caller user", userError);
    return false;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .single();

  if (profileError || !(profile as ProfileRoleRow | null)?.role) {
    console.warn("Training selection notification denied: missing caller profile", profileError);
    return false;
  }

  const role = String((profile as ProfileRoleRow).role || "");
  if (role === "ADMIN") return true;

  const { data: permissions, error: permissionError } = await supabase
    .from("app_role_permissions")
    .select("feature")
    .eq("role_key", role)
    .eq("feature", "training")
    .eq("action", "EDIT");

  if (permissionError) {
    console.warn("Training selection notification denied: permission lookup failed", permissionError);
    return false;
  }

  return (permissions || []).length > 0;
};

const assertAuthorized = async (req: Request, payload: any) => {
  const headerSecret = req.headers.get("x-sync-secret") || "";
  const payloadSecretValue = pickPayloadValue(payload, "sync_secret");
  const payloadSecret = typeof payloadSecretValue === "string" ? payloadSecretValue : "";

  if (
    TRAINING_SELECTION_NOTIFICATION_SECRET
    && (headerSecret === TRAINING_SELECTION_NOTIFICATION_SECRET || payloadSecret === TRAINING_SELECTION_NOTIFICATION_SECRET)
  ) {
    return;
  }

  if (await canCallerManageTraining(req)) {
    return;
  }

  throw jsonResponse({ error: "unauthorized training selection notification request" }, 401);
};

const normalizeSession = (row: TrainingSettingsRow | null): TrainingRegistrationNotificationSession | null => {
  if (!row?.id) return null;

  const match = Array.isArray(row.matches) ? row.matches[0] : row.matches;
  if (!match?.id || match.match_level !== "特訓課") return null;

  return {
    session_id: row.id,
    match_id: match.id,
    match_name: match.match_name,
    match_date: match.match_date,
    match_time: match.match_time,
    location: match.location,
    registration_start_at: row.registration_start_at,
    registration_end_at: row.registration_end_at,
    published_at: row.published_at,
    point_cost: row.point_cost,
    capacity: row.capacity,
    selected_count: 0,
  };
};

const fetchPublishedTrainingSession = async (sessionId: string) => {
  const { data, error } = await supabase
    .from("training_session_settings")
    .select(`
      id,
      published_at,
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
    .eq("id", sessionId)
    .maybeSingle();

  if (error) throw error;

  const session = normalizeSession(data as TrainingSettingsRow | null);
  if (!session) return null;
  if (!session.published_at) {
    throw jsonResponse({ success: false, error: "training selection has not been published" }, 400);
  }

  const { count, error: countError } = await supabase
    .from("training_registrations")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId)
    .eq("status", "selected");

  if (countError) throw countError;

  return {
    ...session,
    selected_count: count || 0,
  };
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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "method not allowed" }, 405);
  }

  try {
    const parsedPayload = await parsePayload(req);
    const payload = parsedPayload.data;
    await assertAuthorized(req, payload);

    const requestUrl = new URL(req.url);
    const sessionId = normalizeUuid(
      pickPayloadValue(payload, "session_id")
        ?? pickPayloadValue(payload, "p_session_id")
        ?? requestUrl.searchParams.get("session_id")
        ?? requestUrl.searchParams.get("p_session_id"),
    );
    if (!sessionId) {
      return jsonResponse({
        success: false,
        error: "session_id is required",
        received_keys: describePayloadShape(payload),
        content_type: parsedPayload.contentType,
        raw_body_length: parsedPayload.rawLength,
      }, 400);
    }

    const nowValue = pickPayloadValue(payload, "now");
    const now = nowValue ? new Date(String(nowValue)) : new Date();
    if (Number.isNaN(now.getTime())) {
      return jsonResponse({ success: false, error: "now must be a valid date" }, 400);
    }

    const dryRun = normalizeBoolean(pickPayloadValue(payload, "dry_run"));
    const forceResend = normalizeBoolean(pickPayloadValue(payload, "force_resend"));
    const session = await fetchPublishedTrainingSession(sessionId);
    if (!session) {
      return jsonResponse({ success: false, error: "training session not found" }, 404);
    }

    const title = buildTrainingRegistrationNotificationTitle(session, "selection_published");
    const body = buildTrainingRegistrationNotificationBody(session, "selection_published");
    const url = buildTrainingRegistrationNotificationUrl(session);
    const eventKey = buildTrainingRegistrationNotificationEventKey(session, "selection_published");
    const targetUserIds = await fetchTrainingTargetUserIds(now);
    const subscriptions = dryRun ? [] : await fetchEnabledPushSubscriptions(supabase, targetUserIds);

    if (dryRun) {
      return jsonResponse({
        success: true,
        dry_run: true,
        session_id: sessionId,
        title,
        body,
        url,
        event_key: eventKey,
        created: false,
        active_user_count: targetUserIds.length,
        total_targets: subscriptions.length,
        dispatched_count: 0,
        expired_count: 0,
        failed_count: 0,
        provider_counts: {},
      });
    }

    let created = false;
    let refreshed = false;

    const { error: eventError } = await supabase
      .from("push_dispatch_events")
      .insert({
        event_key: eventKey,
        feature: "training",
        action: "VIEW",
        title,
        body,
        url,
        match_id: session.match_id,
      });

    if (eventError) {
      if (eventError.code === "23505") {
        if (!forceResend) {
          return jsonResponse({
            success: true,
            dry_run: false,
            session_id: sessionId,
            created: false,
            skipped: true,
            reason: "duplicate_event",
            active_user_count: targetUserIds.length,
            total_targets: 0,
            dispatched_count: 0,
            expired_count: 0,
            failed_count: 0,
            provider_counts: {},
          });
        }

        const { error: updateError } = await supabase
          .from("push_dispatch_events")
          .update({
            feature: "training",
            action: "VIEW",
            title,
            body,
            url,
            match_id: session.match_id,
            created_at: new Date().toISOString(),
          })
          .eq("event_key", eventKey);

        if (updateError) throw updateError;
        refreshed = true;
      } else {
        throw eventError;
      }
    } else {
      created = true;
    }

    const pushSummary = await sendPushToSubscriptions(supabase, subscriptions, {
      title,
      body,
      url,
    });

    return jsonResponse({
      success: true,
      dry_run: false,
      session_id: sessionId,
      created,
      refreshed,
      active_user_count: targetUserIds.length,
      ...pushSummary,
    });
  } catch (error: any) {
    if (error instanceof Response) return error;

    console.error("Training selection notification dispatch failed:", error);
    return jsonResponse({ success: false, error: error.message || String(error) }, 500);
  }
});
