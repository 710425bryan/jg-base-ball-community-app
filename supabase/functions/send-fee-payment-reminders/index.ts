import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import {
  corsHeaders,
  fetchEnabledPushSubscriptions,
  sendPushToSubscriptions,
  type StoredWebPushSubscription,
} from "../_shared/push.ts";
import {
  FEE_PAYMENT_REMINDER_ACTION,
  FEE_PAYMENT_REMINDER_CATEGORIES,
  FEE_PAYMENT_REMINDER_URL,
  buildFeePaymentReminderEventKey,
  buildFeePaymentReminderTestEventKey,
  buildFeePaymentReminderTitle,
  getDefaultFeePaymentReminderPeriods,
  getFeePaymentReminderBillingMode,
  getFeePaymentReminderMemberCategory,
  getTaipeiDateString,
  groupFeePaymentReminderTargets,
  normalizeFeePaymentReminderCategories,
  normalizeMonthlyReminderPeriod,
  normalizeQuarterlyReminderPeriod,
  sortFeePaymentReminderCategories,
  type FeePaymentReminderCategory,
  type FeePaymentReminderMode,
  type FeePaymentReminderTargetInput,
  type FeePaymentReminderTargetItem,
} from "../../../src/utils/feePaymentReminders.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type CallerProfile = {
  id: string;
  role: string | null;
  is_active?: boolean | null;
  access_start?: string | null;
  access_end?: string | null;
  linked_team_member_ids?: string[] | null;
};

type MemberRow = {
  id: string;
  name: string | null;
  role: string | null;
  fee_billing_mode: string | null;
  training_program: string | null;
  status: string | null;
  is_inactive_or_graduated: boolean | null;
};

type MonthlyFeeRow = {
  id: string;
  member_id: string | null;
  year_month: string | null;
  payable_amount: number | null;
  balance_amount: number | null;
  status: string | null;
};

type QuarterlyFeeRow = {
  id: string;
  member_id: string | null;
  member_ids: string[] | null;
  year_quarter: string | null;
  amount: number | null;
  balance_amount: number | null;
  status: string | null;
};

type ProfileLinkRow = {
  id: string;
  linked_team_member_ids: string[] | null;
  is_active?: boolean | null;
  access_start?: string | null;
  access_end?: string | null;
};

type NormalizedPayload = {
  mode: FeePaymentReminderMode;
  categories: FeePaymentReminderCategory[];
  monthlyPeriod: string;
  quarterlyPeriod: string;
  now: Date;
};

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });

const normalizeString = (value: unknown) => typeof value === "string" ? value.trim() : "";

const normalizeAmount = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};

const parsePayload = async (req: Request) => {
  try {
    return await req.json();
  } catch {
    return {};
  }
};

const normalizePayload = (payload: any): NormalizedPayload => {
  const mode = normalizeString(payload.mode) as FeePaymentReminderMode;
  if (!["preview", "send", "test"].includes(mode)) {
    throw jsonResponse({ success: false, error: "unsupported reminder mode" }, 400);
  }

  const now = payload.now ? new Date(String(payload.now)) : new Date();
  if (Number.isNaN(now.getTime())) {
    throw jsonResponse({ success: false, error: "now must be a valid date" }, 400);
  }

  const defaultPeriods = getDefaultFeePaymentReminderPeriods(now);
  const categories = normalizeFeePaymentReminderCategories(
    payload.categories,
    mode === "test" ? [...FEE_PAYMENT_REMINDER_CATEGORIES] : [],
  );

  if (mode !== "test" && categories.length === 0) {
    throw jsonResponse({ success: false, error: "at least one reminder category is required" }, 400);
  }

  return {
    mode,
    categories,
    monthlyPeriod: normalizeMonthlyReminderPeriod(payload.monthly_period, defaultPeriods.monthly_period),
    quarterlyPeriod: normalizeQuarterlyReminderPeriod(payload.quarterly_period, defaultPeriods.quarterly_period),
    now,
  };
};

const isActiveProfile = (
  profile: Pick<CallerProfile, "is_active" | "access_start" | "access_end">,
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

const assertCallerCanUseMode = async (
  caller: CallerProfile,
  mode: FeePaymentReminderMode,
) => {
  if (mode === "test") {
    if (caller.role !== "ADMIN") {
      throw jsonResponse({ success: false, error: "test reminders require ADMIN role" }, 403);
    }
    return;
  }

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

const isActiveMember = (member: MemberRow) => {
  if (member.status === "退隊" || member.status === "離隊") return false;
  if (member.is_inactive_or_graduated === true) return false;
  return true;
};

const isReminderStatusUnpaid = (status: string | null | undefined) => {
  const normalized = normalizeString(status || "unpaid").toLowerCase();
  return !["paid", "approved", "pending_review"].includes(normalized);
};

const fetchBillableMembers = async (categories: FeePaymentReminderCategory[]) => {
  const { data, error } = await supabase
    .from("team_members")
    .select("id, name, role, fee_billing_mode, training_program, status, is_inactive_or_graduated")
    .in("role", ["校隊", "球員"]);

  if (error) throw error;

  const selectedCategories = new Set(categories);
  const members = new Map<string, MemberRow>();

  for (const row of (data || []) as MemberRow[]) {
    if (!row.id || !isActiveMember(row)) continue;
    const category = getFeePaymentReminderMemberCategory(row);
    const billingMode = getFeePaymentReminderBillingMode(row);
    if (!category || !billingMode || billingMode === "none") continue;
    if (!selectedCategories.has(category)) continue;
    members.set(row.id, row);
  }

  return members;
};

const toMemberNames = (members: MemberRow[]) =>
  members.map((member) => normalizeString(member.name) || "未命名球員");

const buildMonthlyItems = async (
  period: string,
  membersById: Map<string, MemberRow>,
) => {
  const { data, error } = await supabase
    .from("monthly_fees")
    .select("id, member_id, year_month, payable_amount, balance_amount, status")
    .eq("year_month", period);

  if (error) throw error;

  const items: FeePaymentReminderTargetItem[] = [];

  for (const row of (data || []) as MonthlyFeeRow[]) {
    const memberId = normalizeString(row.member_id);
    const member = membersById.get(memberId);
    if (!member) continue;
    if (getFeePaymentReminderBillingMode(member) !== "monthly") continue;
    if (!isReminderStatusUnpaid(row.status)) continue;

    const amount = Math.max(0, normalizeAmount(row.payable_amount) - normalizeAmount(row.balance_amount));
    if (amount <= 0) continue;

    const category = getFeePaymentReminderMemberCategory(member);
    if (!category) continue;

    items.push({
      fee_id: row.id,
      billing_type: "monthly",
      period_key: period,
      period_label: period,
      category,
      member_ids: [member.id],
      member_names: toMemberNames([member]),
      amount,
    });
  }

  return items;
};

const buildQuarterlyItems = async (
  period: string,
  membersById: Map<string, MemberRow>,
) => {
  const { data, error } = await supabase
    .from("quarterly_fees")
    .select("id, member_id, member_ids, year_quarter, amount, balance_amount, status")
    .eq("year_quarter", period);

  if (error) throw error;

  const items: FeePaymentReminderTargetItem[] = [];

  for (const row of (data || []) as QuarterlyFeeRow[]) {
    if (!isReminderStatusUnpaid(row.status)) continue;

    const amount = Math.max(0, normalizeAmount(row.amount) - normalizeAmount(row.balance_amount));
    if (amount <= 0) continue;

    const rawMemberIds = Array.isArray(row.member_ids) && row.member_ids.length > 0
      ? row.member_ids
      : row.member_id
        ? [row.member_id]
        : [];
    const members = rawMemberIds
      .map((memberId) => membersById.get(memberId))
      .filter((member): member is MemberRow => Boolean(member))
      .filter((member) => getFeePaymentReminderBillingMode(member) === "quarterly");

    if (members.length === 0) continue;

    items.push({
      fee_id: row.id,
      billing_type: "quarterly",
      period_key: period,
      period_label: period,
      category: "community",
      member_ids: members.map((member) => member.id),
      member_names: toMemberNames(members),
      amount,
    });
  }

  return items;
};

const fetchLinkedProfiles = async (
  items: FeePaymentReminderTargetItem[],
  now: Date,
) => {
  if (items.length === 0) return [] as ProfileLinkRow[];

  const targetMemberIds = new Set(items.flatMap((item) => item.member_ids));
  const { data, error } = await supabase
    .from("profiles")
    .select("id, linked_team_member_ids, is_active, access_start, access_end");

  if (error) throw error;

  return ((data || []) as ProfileLinkRow[])
    .filter((profile) => isActiveProfile(profile, now))
    .filter((profile) => {
      const linkedIds = Array.isArray(profile.linked_team_member_ids)
        ? profile.linked_team_member_ids
        : [];
      return linkedIds.some((memberId) => targetMemberIds.has(memberId));
    });
};

const buildTargetInputs = (
  items: FeePaymentReminderTargetItem[],
  profiles: ProfileLinkRow[],
) => {
  const inputs: FeePaymentReminderTargetInput[] = [];

  for (const profile of profiles) {
    const linkedIds = new Set(Array.isArray(profile.linked_team_member_ids) ? profile.linked_team_member_ids : []);
    for (const item of items) {
      if (item.member_ids.some((memberId) => linkedIds.has(memberId))) {
        inputs.push({ user_id: profile.id, item });
      }
    }
  }

  return inputs;
};

const buildReminderGroups = async (payload: NormalizedPayload) => {
  const membersById = await fetchBillableMembers(payload.categories);
  const monthlyItems = await buildMonthlyItems(payload.monthlyPeriod, membersById);
  const quarterlyItems = payload.categories.includes("community")
    ? await buildQuarterlyItems(payload.quarterlyPeriod, membersById)
    : [];
  const items = [...monthlyItems, ...quarterlyItems];
  const profiles = await fetchLinkedProfiles(items, payload.now);
  const dispatchDate = getTaipeiDateString(payload.now);

  return {
    items,
    groups: groupFeePaymentReminderTargets(
      buildTargetInputs(items, profiles),
      {
        monthlyPeriod: payload.monthlyPeriod,
        quarterlyPeriod: payload.quarterlyPeriod,
        categories: payload.categories,
        dispatchDate,
      },
    ),
  };
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

const getUniqueItemTotalAmount = (items: FeePaymentReminderTargetItem[]) => {
  const uniqueItems = new Map<string, FeePaymentReminderTargetItem>();
  for (const item of items) {
    uniqueItems.set(`${item.billing_type}:${item.fee_id}`, item);
  }
  return [...uniqueItems.values()].reduce((total, item) => total + normalizeAmount(item.amount), 0);
};

const getUniqueMemberCount = (items: FeePaymentReminderTargetItem[]) =>
  new Set(items.flatMap((item) => item.member_ids)).size;

const createReminderEvent = async (event: {
  eventKey: string;
  title: string;
  body: string;
  url: string;
  targetUserId: string;
  targetMemberIds?: string[];
}) => {
  const { data, error } = await supabase
    .from("push_dispatch_events")
    .insert({
      event_key: event.eventKey,
      feature: "fees",
      action: FEE_PAYMENT_REMINDER_ACTION,
      title: event.title,
      body: event.body,
      url: event.url,
      target_user_id: event.targetUserId,
      target_member_ids: event.targetMemberIds && event.targetMemberIds.length > 0
        ? event.targetMemberIds
        : null,
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      return { created: false, id: null, duplicate: true };
    }
    throw error;
  }

  return { created: true, id: data?.id || null, duplicate: false };
};

const buildTestReminderGroup = async (caller: CallerProfile, payload: NormalizedPayload) => {
  const linkedMemberIds = new Set(Array.isArray(caller.linked_team_member_ids)
    ? caller.linked_team_member_ids
    : []);
  if (linkedMemberIds.size === 0) return null;

  const membersById = await fetchBillableMembers(payload.categories);
  const monthlyItems = await buildMonthlyItems(payload.monthlyPeriod, membersById);
  const quarterlyItems = payload.categories.includes("community")
    ? await buildQuarterlyItems(payload.quarterlyPeriod, membersById)
    : [];
  const linkedItems = [...monthlyItems, ...quarterlyItems]
    .filter((item) => item.member_ids.some((memberId) => linkedMemberIds.has(memberId)));

  const groups = groupFeePaymentReminderTargets(
    linkedItems.map((item) => ({ user_id: caller.id, item })),
    {
      monthlyPeriod: payload.monthlyPeriod,
      quarterlyPeriod: payload.quarterlyPeriod,
      categories: payload.categories,
      dispatchDate: getTaipeiDateString(payload.now),
    },
  );

  return groups[0] || null;
};

const dispatchTestReminder = async (caller: CallerProfile, payload: NormalizedPayload) => {
  const group = await buildTestReminderGroup(caller, payload);
  const emptySummary = {
    dispatched_count: 0,
    expired_count: 0,
    failed_count: 0,
    provider_counts: {},
  };

  if (!group) {
    return jsonResponse({
      success: true,
      mode: payload.mode,
      monthly_period: payload.monthlyPeriod,
      quarterly_period: payload.quarterlyPeriod,
      categories: sortFeePaymentReminderCategories(payload.categories),
      member_count: 0,
      target_user_count: 0,
      subscription_count: 0,
      total_amount: 0,
      created_count: 0,
      duplicate_count: 0,
      ...emptySummary,
      targets: [],
    });
  }

  const timestamp = payload.now.toISOString();
  const eventKey = buildFeePaymentReminderTestEventKey(caller.id, timestamp);
  const event = await createReminderEvent({
    eventKey,
    title: group.title || buildFeePaymentReminderTitle(),
    body: group.body,
    url: group.url || FEE_PAYMENT_REMINDER_URL,
    targetUserId: caller.id,
    targetMemberIds: group.member_ids,
  });
  const subscriptions = await fetchEnabledPushSubscriptions(supabase, [caller.id]);
  const summary = await sendPushToSubscriptions(supabase, subscriptions, {
    title: group.title,
    body: group.body,
    url: group.url,
  });

  return jsonResponse({
    success: true,
    mode: payload.mode,
    monthly_period: payload.monthlyPeriod,
    quarterly_period: payload.quarterlyPeriod,
    categories: sortFeePaymentReminderCategories(payload.categories),
    member_count: group.member_ids.length,
    target_user_count: 1,
    subscription_count: subscriptions.length,
    total_amount: group.total_amount,
    created_count: event.created ? 1 : 0,
    duplicate_count: event.duplicate ? 1 : 0,
    ...summary,
    targets: [{
      ...group,
      event_key: eventKey,
      event_id: event.id,
      created: event.created,
    }],
  });
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "method not allowed" }, 405);
  }

  try {
    const rawPayload = await parsePayload(req);
    const payload = normalizePayload(rawPayload);
    const caller = await fetchCallerProfile(req, payload.now);
    await assertCallerCanUseMode(caller, payload.mode);

    if (payload.mode === "test") {
      return await dispatchTestReminder(caller, payload);
    }

    const { items, groups } = await buildReminderGroups(payload);
    const targetUserIds = groups.map((group) => group.user_id);
    const subscriptions = await fetchEnabledPushSubscriptions(supabase, targetUserIds);

    if (payload.mode === "preview") {
      return jsonResponse({
        success: true,
        mode: payload.mode,
        dry_run: true,
        monthly_period: payload.monthlyPeriod,
        quarterly_period: payload.quarterlyPeriod,
        categories: sortFeePaymentReminderCategories(payload.categories),
        member_count: getUniqueMemberCount(items),
        target_user_count: groups.length,
        subscription_count: subscriptions.length,
        total_amount: getUniqueItemTotalAmount(items),
        created_count: 0,
        duplicate_count: 0,
        dispatched_count: 0,
        expired_count: 0,
        failed_count: 0,
        provider_counts: {},
        targets: groups,
      });
    }

    const subscriptionsByUser = groupSubscriptionsByUser(subscriptions);
    let createdCount = 0;
    let duplicateCount = 0;
    let dispatchedCount = 0;
    let expiredCount = 0;
    let failedCount = 0;
    const providerCounts: Record<string, number> = {};
    const targets: Array<Record<string, unknown>> = [];

    for (const group of groups) {
      const eventKey = group.event_key || buildFeePaymentReminderEventKey({
        userId: group.user_id,
        monthlyPeriod: payload.monthlyPeriod,
        quarterlyPeriod: payload.quarterlyPeriod,
        categories: payload.categories,
        dispatchDate: getTaipeiDateString(payload.now),
      });
      const event = await createReminderEvent({
        eventKey,
        title: group.title || buildFeePaymentReminderTitle(),
        body: group.body,
        url: group.url || FEE_PAYMENT_REMINDER_URL,
        targetUserId: group.user_id,
        targetMemberIds: group.member_ids,
      });

      if (!event.created) {
        duplicateCount += 1;
        targets.push({
          ...group,
          event_key: eventKey,
          created: false,
          skipped: true,
          reason: "duplicate_event",
        });
        continue;
      }

      createdCount += 1;
      const summary = await sendPushToSubscriptions(
        supabase,
        subscriptionsByUser.get(group.user_id) || [],
        {
          title: group.title,
          body: group.body,
          url: group.url,
        },
      );

      dispatchedCount += summary.dispatched_count;
      expiredCount += summary.expired_count;
      failedCount += summary.failed_count;

      for (const [provider, count] of Object.entries(summary.provider_counts)) {
        providerCounts[provider] = (providerCounts[provider] || 0) + count;
      }

      targets.push({
        ...group,
        event_key: eventKey,
        event_id: event.id,
        created: true,
        ...summary,
      });
    }

    return jsonResponse({
      success: true,
      mode: payload.mode,
      monthly_period: payload.monthlyPeriod,
      quarterly_period: payload.quarterlyPeriod,
      categories: sortFeePaymentReminderCategories(payload.categories),
      member_count: getUniqueMemberCount(items),
      target_user_count: groups.length,
      subscription_count: subscriptions.length,
      total_amount: getUniqueItemTotalAmount(items),
      created_count: createdCount,
      duplicate_count: duplicateCount,
      dispatched_count: dispatchedCount,
      expired_count: expiredCount,
      failed_count: failedCount,
      provider_counts: providerCounts,
      targets,
    });
  } catch (error: any) {
    if (error instanceof Response) return error;

    console.error("Fee payment reminder dispatch failed:", error);
    return jsonResponse({
      success: false,
      error: error?.message || String(error),
    }, 500);
  }
});
