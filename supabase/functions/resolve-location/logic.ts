export type LocationSearchCandidate = {
  query: string;
  label: string;
};

export type ResolvedLocation = {
  label: string;
  latitude: number;
  longitude: number;
  source: string;
  providerPayload?: Record<string, unknown> | null;
};

type ProviderOptions = {
  fetcher?: typeof fetch;
  googleMapsApiKey?: string;
};

type NominatimSearchResult = {
  lat?: string;
  lon?: string;
  display_name?: string;
};

type OpenMeteoGeocodingResult = {
  latitude?: number;
  longitude?: number;
  name?: string;
  admin1?: string;
  admin2?: string;
  admin3?: string;
};

const KNOWN_LOCATIONS: Array<ResolvedLocation & { keywords: string[] }> = [
  {
    label: "新莊棒球場",
    latitude: 25.0411,
    longitude: 121.4478,
    source: "known_location",
    keywords: ["新莊棒球場", "新北市立新莊棒球場"],
  },
  {
    label: "迪化休閒運動公園",
    latitude: 25.0748,
    longitude: 121.5103,
    source: "known_location",
    keywords: ["迪化球場", "迪化棒球場", "迪化壘球場", "迪化休閒運動公園"],
  },
];

const TAIWAN_ADMIN_LOCATION_PATTERN = /(?:台灣|臺灣)?([\u4e00-\u9fff]{2,3}[市縣])([\u4e00-\u9fff]{1,6}(?:區|鄉|鎮|市))/;

export const normalizeLocationQuery = (value: unknown) =>
  typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";

export const normalizeLocationKey = (value: string) =>
  value
    .trim()
    .toLocaleLowerCase()
    .replace(/\s+/g, "")
    .replace(/[()（）]/g, "");

const parseFiniteNumber = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const isValidCoordinate = (latitude: number | null, longitude: number | null) =>
  latitude != null
  && longitude != null
  && latitude >= -90
  && latitude <= 90
  && longitude >= -180
  && longitude <= 180;

const compactProviderPayload = (value: unknown): Record<string, unknown> | null => {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
};

export const extractTaiwanAdministrativeLocation = (location: string) => {
  const normalizedLocation = location.replace(/\s+/g, "");
  const match = normalizedLocation.match(TAIWAN_ADMIN_LOCATION_PATTERN);
  if (!match) return null;

  return `${match[1]}${match[2]}`;
};

const uniqueLocationCandidates = (candidates: LocationSearchCandidate[]) => {
  const seenKeys = new Set<string>();

  return candidates.filter((candidate) => {
    const key = normalizeLocationKey(candidate.query);
    if (!key || seenKeys.has(key)) return false;
    seenKeys.add(key);
    return true;
  });
};

export const buildLocationSearchCandidates = (query: string): LocationSearchCandidate[] => {
  const administrativeLocation = extractTaiwanAdministrativeLocation(query);

  return uniqueLocationCandidates([
    { query, label: query },
    ...(administrativeLocation
      ? [{ query: administrativeLocation, label: administrativeLocation }]
      : []),
  ]);
};

export const findKnownLocation = (query: string): ResolvedLocation | null => {
  const normalizedQuery = normalizeLocationKey(query);
  const matchedLocation = KNOWN_LOCATIONS.find((candidate) =>
    candidate.keywords.some((keyword) => normalizedQuery.includes(normalizeLocationKey(keyword)))
  );

  if (!matchedLocation) return null;

  return {
    label: matchedLocation.label,
    latitude: matchedLocation.latitude,
    longitude: matchedLocation.longitude,
    source: matchedLocation.source,
  };
};

const fetchGooglePlacesLocation = async (
  candidate: LocationSearchCandidate,
  apiKey: string,
  fetcher: typeof fetch,
): Promise<ResolvedLocation | null> => {
  if (!apiKey) return null;

  const response = await fetcher("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.location",
    },
    body: JSON.stringify({
      textQuery: candidate.query,
      languageCode: "zh-TW",
      regionCode: "TW",
    }),
  });

  if (!response.ok) return null;

  const payload = await response.json();
  const place = Array.isArray(payload?.places) ? payload.places[0] : null;
  const latitude = parseFiniteNumber(place?.location?.latitude);
  const longitude = parseFiniteNumber(place?.location?.longitude);

  if (!isValidCoordinate(latitude, longitude)) return null;

  return {
    label: typeof place?.displayName?.text === "string" && place.displayName.text.trim()
      ? place.displayName.text.trim()
      : candidate.label,
    latitude: latitude as number,
    longitude: longitude as number,
    source: "google_places",
    providerPayload: compactProviderPayload(place),
  };
};

const fetchGoogleGeocodingLocation = async (
  candidate: LocationSearchCandidate,
  apiKey: string,
  fetcher: typeof fetch,
): Promise<ResolvedLocation | null> => {
  if (!apiKey) return null;

  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  url.searchParams.set("address", candidate.query);
  url.searchParams.set("region", "tw");
  url.searchParams.set("language", "zh-TW");
  url.searchParams.set("key", apiKey);

  const response = await fetcher(url.toString());
  if (!response.ok) return null;

  const payload = await response.json();
  const result = Array.isArray(payload?.results) ? payload.results[0] : null;
  const latitude = parseFiniteNumber(result?.geometry?.location?.lat);
  const longitude = parseFiniteNumber(result?.geometry?.location?.lng);

  if (!isValidCoordinate(latitude, longitude)) return null;

  return {
    label: typeof result?.formatted_address === "string" && result.formatted_address.trim()
      ? result.formatted_address.trim()
      : candidate.label,
    latitude: latitude as number,
    longitude: longitude as number,
    source: "google_geocoding",
    providerPayload: compactProviderPayload(result),
  };
};

const fetchNominatimLocation = async (
  candidate: LocationSearchCandidate,
  fetcher: typeof fetch,
): Promise<ResolvedLocation | null> => {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("q", candidate.query.includes("台灣") || candidate.query.includes("臺灣") ? candidate.query : `${candidate.query}, 台灣`);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("accept-language", "zh-TW");

  const response = await fetcher(url.toString(), {
    headers: {
      Accept: "application/json",
      "User-Agent": "jg-baseball-community-app/1.0",
    },
  });
  if (!response.ok) return null;

  const payload = await response.json();
  const [firstResult] = Array.isArray(payload) ? (payload as NominatimSearchResult[]) : [];
  const latitude = parseFiniteNumber(firstResult?.lat);
  const longitude = parseFiniteNumber(firstResult?.lon);

  if (!isValidCoordinate(latitude, longitude)) return null;

  return {
    label: candidate.label,
    latitude: latitude as number,
    longitude: longitude as number,
    source: "nominatim",
    providerPayload: compactProviderPayload(firstResult),
  };
};

const fetchOpenMeteoLocation = async (
  candidate: LocationSearchCandidate,
  fetcher: typeof fetch,
): Promise<ResolvedLocation | null> => {
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.searchParams.set("name", candidate.query);
  url.searchParams.set("count", "1");
  url.searchParams.set("language", "zh");
  url.searchParams.set("format", "json");

  const response = await fetcher(url.toString());
  if (!response.ok) return null;

  const payload = await response.json();
  const results = Array.isArray(payload?.results) ? (payload.results as OpenMeteoGeocodingResult[]) : [];
  const [firstResult] = results;
  const latitude = parseFiniteNumber(firstResult?.latitude);
  const longitude = parseFiniteNumber(firstResult?.longitude);

  if (!isValidCoordinate(latitude, longitude)) return null;

  return {
    label: candidate.label,
    latitude: latitude as number,
    longitude: longitude as number,
    source: "open_meteo_geocoding",
    providerPayload: compactProviderPayload(firstResult),
  };
};

export const resolveLocationWithProviders = async (
  query: string,
  { fetcher = fetch, googleMapsApiKey = "" }: ProviderOptions = {},
): Promise<ResolvedLocation | null> => {
  const normalizedQuery = normalizeLocationQuery(query);
  if (!normalizedQuery) return null;

  const knownLocation = findKnownLocation(normalizedQuery);
  if (knownLocation) return knownLocation;

  const candidates = buildLocationSearchCandidates(normalizedQuery);

  for (const candidate of candidates) {
    const resolvedLocation =
      await fetchGooglePlacesLocation(candidate, googleMapsApiKey, fetcher)
      ?? await fetchGoogleGeocodingLocation(candidate, googleMapsApiKey, fetcher)
      ?? await fetchNominatimLocation(candidate, fetcher)
      ?? await fetchOpenMeteoLocation(candidate, fetcher);

    if (resolvedLocation) return resolvedLocation;
  }

  return null;
};
