import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import {
  corsHeaders as baseCorsHeaders,
  fetchEnabledPushSubscriptions,
  getEligiblePushTargetUserIds,
  sendPushToSubscriptions,
} from "../_shared/push.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FORM_REMITTANCE_SECRET = Deno.env.get("FORM_REMITTANCE_SECRET") || "";

const corsHeaders = {
  ...baseCorsHeaders,
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-form-secret",
};

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type TeamMember = {
  id: string;
  name: string;
  sibling_id: string | null;
  sibling_ids: string[] | null;
};

type RemittancePayload = {
  player_name?: unknown;
  remittance_date?: unknown;
  amount?: unknown;
  payment_items?: unknown;
  payment_method?: unknown;
  account_last_5?: unknown;
  other_item_note?: unknown;
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

const assertAuthorized = (req: Request, payload: Record<string, unknown>) => {
  if (!FORM_REMITTANCE_SECRET) {
    throw jsonResponse({ success: false, error: "FORM_REMITTANCE_SECRET is not configured" }, 500);
  }

  const headerSecret = req.headers.get("x-form-secret") || "";
  const payloadSecret = typeof payload.form_secret === "string" ? payload.form_secret : "";

  if (headerSecret !== FORM_REMITTANCE_SECRET && payloadSecret !== FORM_REMITTANCE_SECRET) {
    throw jsonResponse({ success: false, error: "unauthorized remittance form request" }, 401);
  }
};

const asTrimmedString = (value: unknown) =>
  typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();

const normalizeDate = (value: unknown) => {
  const raw = asTrimmedString(value);
  if (!raw) return null;

  const normalized = raw.replace(/[/.]/g, "-");
  const matched = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!matched) return null;

  const year = Number(matched[1]);
  const month = Number(matched[2]);
  const day = Number(matched[3]);
  const candidate = new Date(Date.UTC(year, month - 1, day));

  if (
    candidate.getUTCFullYear() !== year ||
    candidate.getUTCMonth() !== month - 1 ||
    candidate.getUTCDate() !== day
  ) {
    return null;
  }

  return [
    String(year).padStart(4, "0"),
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0"),
  ].join("-");
};

const getYearQuarter = (dateText: string) => {
  const [yearText, monthText] = dateText.split("-");
  const month = Number(monthText);
  return `${yearText}-Q${Math.floor((month - 1) / 3) + 1}`;
};

const normalizeAmount = (value: unknown) => {
  const raw = asTrimmedString(value).replace(/[^\d-]/g, "");
  const amount = Number.parseInt(raw, 10);
  return Number.isFinite(amount) ? amount : 0;
};

const normalizePaymentItems = (value: unknown) => {
  const items = Array.isArray(value)
    ? value
    : asTrimmedString(value).split(/[,，、\n]/);

  return [...new Set(
    items
      .map((item) => asTrimmedString(item))
      .filter((item) => item.length > 0),
  )];
};

const normalizeAccountLast5 = (value: unknown, paymentMethod: string) => {
  const transferMethods = new Set(["銀行轉帳", "郵局無摺", "ATM存款", "ATM轉帳"]);
  if (!transferMethods.has(paymentMethod)) return null;

  const raw = asTrimmedString(value);
  return raw.length > 0 ? raw.slice(0, 10) : null;
};

const fetchMemberByName = async (playerName: string) => {
  const { data, error } = await supabase
    .from("team_members")
    .select("id, name, sibling_id, sibling_ids")
    .eq("name", playerName)
    .limit(2);

  if (error) throw error;
  return (data || []) as TeamMember[];
};

const fetchRelatedSiblingMembers = async (member: TeamMember) => {
  const siblingIds = new Set<string>();

  if (member.sibling_id) siblingIds.add(member.sibling_id);
  for (const id of member.sibling_ids || []) siblingIds.add(id);

  const reverseSiblingQueries = await Promise.all([
    supabase
      .from("team_members")
      .select("id, name, sibling_id, sibling_ids")
      .eq("sibling_id", member.id),
    supabase
      .from("team_members")
      .select("id, name, sibling_id, sibling_ids")
      .contains("sibling_ids", [member.id]),
  ]);

  for (const result of reverseSiblingQueries) {
    if (result.error) throw result.error;
    for (const sibling of (result.data || []) as TeamMember[]) {
      siblingIds.add(sibling.id);
    }
  }

  siblingIds.delete(member.id);

  if (siblingIds.size === 0) return [] as TeamMember[];

  const { data, error } = await supabase
    .from("team_members")
    .select("id, name, sibling_id, sibling_ids")
    .in("id", [...siblingIds]);

  if (error) throw error;
  return (data || []) as TeamMember[];
};

const createPushEvent = async (recordId: string, title: string, body: string, url: string) => {
  const { error } = await supabase
    .from("push_dispatch_events")
    .insert({
      event_key: `quarterly_fee_remittance:${recordId}`,
      feature: "fees",
      action: "VIEW",
      title,
      body,
      url,
    });

  if (error && error.code !== "23505") throw error;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "method not allowed" }, 405);
  }

  try {
    const payload = await parsePayload(req) as RemittancePayload & Record<string, unknown>;
    assertAuthorized(req, payload);

    const playerName = asTrimmedString(payload.player_name);
    const remittanceDate = normalizeDate(payload.remittance_date);
    const amount = normalizeAmount(payload.amount);
    const paymentMethod = asTrimmedString(payload.payment_method);

    if (!playerName) return jsonResponse({ success: false, error: "player_name is required" }, 400);
    if (!remittanceDate) return jsonResponse({ success: false, error: "remittance_date must look like YYYY-MM-DD" }, 400);
    if (amount <= 0) return jsonResponse({ success: false, error: "amount must be greater than 0" }, 400);
    if (!paymentMethod) return jsonResponse({ success: false, error: "payment_method is required" }, 400);

    const members = await fetchMemberByName(playerName);
    if (members.length === 0) {
      return jsonResponse({ success: false, error: "player was not found in team_members" }, 404);
    }

    const mainMember = members[0];
    const siblings = await fetchRelatedSiblingMembers(mainMember);
    const linkedMembers = [mainMember, ...siblings];
    const memberIds = [...new Set(linkedMembers.map((member) => member.id))];
    const siblingNames = siblings.map((member) => member.name).filter(Boolean);
    const paymentItems = normalizePaymentItems(payload.payment_items);

    if (siblingNames.length > 0 && !paymentItems.includes("手足合併繳交")) {
      paymentItems.push("手足合併繳交");
    }

    const insertPayload = {
      member_id: mainMember.id,
      member_ids: memberIds,
      year_quarter: getYearQuarter(remittanceDate),
      remittance_date: remittanceDate,
      payment_items: paymentItems,
      other_item_note: asTrimmedString(payload.other_item_note) || null,
      amount,
      payment_method: paymentMethod,
      account_last_5: normalizeAccountLast5(payload.account_last_5, paymentMethod),
      status: "pending_review",
    };

    const { data: insertedRecord, error: insertError } = await supabase
      .from("quarterly_fees")
      .insert(insertPayload)
      .select("id, member_id, member_ids, year_quarter, amount, remittance_date, created_at")
      .single();

    if (insertError) throw insertError;
    if (!insertedRecord?.id) throw new Error("quarterly fee insert did not return a record id");

    const title = `季/月費登記: ${playerName}`;
    const siblingNote = siblingNames.length > 0
      ? `\n已自動涵蓋手足: ${siblingNames.join(", ")}`
      : "";
    const body = `繳費時間: ${remittanceDate}\n金額: $${amount}\n方式: ${paymentMethod}${siblingNote}`;
    const url = insertedRecord?.id
      ? `/fees?highlight_fee_id=${insertedRecord.id}`
      : "/fees";

    await createPushEvent(insertedRecord.id, title, body, url);

    const eligibleUserIds = await getEligiblePushTargetUserIds(supabase, {
      feature: "fees",
      action: "VIEW",
      targetRoles: ["ADMIN", "MANAGER"],
    });
    const subscriptions = await fetchEnabledPushSubscriptions(supabase, eligibleUserIds);
    const pushSummary = await sendPushToSubscriptions(supabase, subscriptions, {
      title,
      body,
      url,
    });

    return jsonResponse({
      success: true,
      record: insertedRecord,
      covered_member_ids: memberIds,
      covered_member_names: linkedMembers.map((member) => member.name),
      ...pushSummary,
    });
  } catch (error: unknown) {
    if (error instanceof Response) return error;

    const message = error instanceof Error ? error.message : String(error);
    console.error("Fee remittance webhook failed:", error);
    return jsonResponse({ success: false, error: message }, 500);
  }
});
