import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import {
  normalizeLocationKey,
  normalizeLocationQuery,
  resolveLocationWithProviders,
  type ResolvedLocation,
} from "./logic.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GOOGLE_MAPS_API_KEY = Deno.env.get("GOOGLE_MAPS_API_KEY")
  || Deno.env.get("GOOGLE_PLACES_API_KEY")
  || Deno.env.get("GOOGLE_GEOCODING_API_KEY")
  || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

type CachedLocationRow = {
  query: string;
  label: string;
  latitude: number;
  longitude: number;
  source: string;
  provider_payload: Record<string, unknown> | null;
  hit_count: number | null;
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

const assertAuthenticated = async (req: Request) => {
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!token) {
    throw jsonResponse({ success: false, error: "missing authorization token" }, 401);
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user?.id) {
    throw jsonResponse({ success: false, error: "invalid authorization token" }, 401);
  }

  return data.user.id;
};

const readCachedLocation = async (queryKey: string): Promise<CachedLocationRow | null> => {
  const { data, error } = await supabase
    .from("location_geocoding_cache")
    .select("query, label, latitude, longitude, source, provider_payload, hit_count")
    .eq("query_key", queryKey)
    .maybeSingle();

  if (error) throw error;
  return (data || null) as CachedLocationRow | null;
};

const touchCachedLocation = async (queryKey: string, hitCount: number | null) => {
  const { error } = await supabase
    .from("location_geocoding_cache")
    .update({
      hit_count: Number(hitCount || 0) + 1,
      last_used_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("query_key", queryKey);

  if (error) console.warn("Unable to update location geocoding cache usage:", error);
};

const writeCachedLocation = async (query: string, queryKey: string, location: ResolvedLocation) => {
  const { error } = await supabase
    .from("location_geocoding_cache")
    .upsert(
      {
        query_key: queryKey,
        query,
        label: location.label,
        latitude: location.latitude,
        longitude: location.longitude,
        source: location.source,
        provider_payload: location.providerPayload || null,
        hit_count: 1,
        last_used_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "query_key" },
    );

  if (error) console.warn("Unable to write location geocoding cache:", error);
};

const buildLocationResponse = (
  location: ResolvedLocation,
  { cached }: { cached: boolean },
) => ({
  success: true,
  cached,
  label: location.label,
  latitude: location.latitude,
  longitude: location.longitude,
  source: location.source,
});

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "method not allowed" }, 405);
  }

  try {
    await assertAuthenticated(req);

    const payload = await parsePayload(req);
    const query = normalizeLocationQuery(payload?.query);

    if (!query) {
      return jsonResponse({ success: false, error: "query is required" }, 400);
    }

    if (query.length > 240) {
      return jsonResponse({ success: false, error: "query is too long" }, 400);
    }

    const queryKey = normalizeLocationKey(query);
    const cachedLocation = await readCachedLocation(queryKey);

    if (cachedLocation) {
      await touchCachedLocation(queryKey, cachedLocation.hit_count);
      return jsonResponse(buildLocationResponse({
        label: cachedLocation.label,
        latitude: cachedLocation.latitude,
        longitude: cachedLocation.longitude,
        source: cachedLocation.source,
        providerPayload: cachedLocation.provider_payload,
      }, { cached: true }));
    }

    const resolvedLocation = await resolveLocationWithProviders(query, {
      googleMapsApiKey: GOOGLE_MAPS_API_KEY,
    });

    if (!resolvedLocation) {
      return jsonResponse({
        success: false,
        cached: false,
        error: "location not resolved",
      }, 404);
    }

    await writeCachedLocation(query, queryKey, resolvedLocation);

    return jsonResponse(buildLocationResponse(resolvedLocation, { cached: false }));
  } catch (error) {
    if (error instanceof Response) return error;

    console.error("resolve-location error:", error);
    return jsonResponse({ success: false, error: "location resolution failed" }, 500);
  }
});
