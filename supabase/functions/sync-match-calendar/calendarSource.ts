type CalendarSourceErrorCode =
  | "CALENDAR_SOURCE_RATE_LIMITED" | "CALENDAR_SOURCE_BUSY"
  | "CALENDAR_SOURCE_TIMEOUT" | "CALENDAR_SOURCE_HTTP"
  | "CALENDAR_SOURCE_NETWORK" | "CALENDAR_SOURCE_INVALID"
  | "CALENDAR_SOURCE_TOO_LARGE";

const errorMessages: Record<CalendarSourceErrorCode, string> = {
  CALENDAR_SOURCE_RATE_LIMITED: "Google Calendar 暫時限制讀取，請稍後再試",
  CALENDAR_SOURCE_BUSY: "行事曆讀取中，請稍後再試",
  CALENDAR_SOURCE_TIMEOUT: "Google Calendar 讀取逾時，請稍後再試",
  CALENDAR_SOURCE_HTTP: "Google Calendar 暫時無法讀取",
  CALENDAR_SOURCE_NETWORK: "Google Calendar 連線失敗，請稍後再試",
  CALENDAR_SOURCE_INVALID: "Google Calendar 未回傳完整有效的行事曆，已停止同步",
  CALENDAR_SOURCE_TOO_LARGE: "Google Calendar 內容超過讀取上限，已停止同步",
};

export class CalendarSourceError extends Error {
  constructor(
    readonly code: CalendarSourceErrorCode,
    readonly upstreamStatus: number | null = null,
    readonly retryAfterSeconds: number | null = null,
    readonly retryAfterProvided: boolean | null = null,
  ) {
    super(errorMessages[code]);
    this.name = "CalendarSourceError";
  }
}

type CalendarSourceResult = { text: string; cache: "miss" | "hit" | "coalesced" };
type CacheEntry = { expiresAt: number; text: string } | { expiresAt: number; error: CalendarSourceError };
type Options = {
  fetcher?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
  maxBytes?: number;
  maxEntries?: number;
};

const retryAfterSeconds = (value: string | null, now: number) => {
  if (value && /^\d+$/.test(value.trim())) {
    const seconds = Number(value);
    if (Number.isSafeInteger(seconds)) return Math.max(1, seconds);
  }
  const date = value ? Date.parse(value) : NaN;
  if (Number.isFinite(date)) return Math.max(1, Math.ceil((date - now) / 1000));
  // Without an upstream duration, avoid repeated clicks hammering the source.
  return 60;
};

/** Per-isolate, bounded optimization. Every caller still reads fresh DB state and plans sync. */
export const createCalendarSourceFetcher = (options: Options = {}) => {
  const fetcher = options.fetcher ?? fetch;
  const now = options.now ?? Date.now;
  const timeoutMs = options.timeoutMs ?? 20_000;
  const maxBytes = options.maxBytes ?? 2 * 1024 * 1024;
  const maxEntries = Math.max(1, options.maxEntries ?? 8);
  const cached = new Map<string, CacheEntry>();
  const pending = new Map<string, Promise<CalendarSourceResult>>();

  const cache = (url: string, entry: CacheEntry) => {
    for (const [key, item] of cached) if (item.expiresAt <= now()) cached.delete(key);
    cached.delete(url);
    while (cached.size >= maxEntries) cached.delete(cached.keys().next().value!);
    cached.set(url, entry);
  };

  const download = async (url: string): Promise<CalendarSourceResult> => {
    const controller = new AbortController();
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cancelBody = () => { void reader?.cancel().catch(() => {}); };
    const read = async () => {
      const response = await fetcher(url, {
        headers: { "user-agent": "jg-base-ball-community-app-calendar-sync/1.0" },
        signal: controller.signal,
      });
      reader = response.body?.getReader();
      if (!response.ok) {
        cancelBody();
        if (response.status === 429) {
          throw new CalendarSourceError("CALENDAR_SOURCE_RATE_LIMITED", 429,
            retryAfterSeconds(response.headers.get("retry-after"), now()), response.headers.has("retry-after"));
        }
        throw new CalendarSourceError("CALENDAR_SOURCE_HTTP", response.status);
      }
      if (Number(response.headers.get("content-length")) > maxBytes) {
        cancelBody();
        throw new CalendarSourceError("CALENDAR_SOURCE_TOO_LARGE");
      }
      const decoder = new TextDecoder();
      let bytes = 0;
      let text = "";
      while (reader) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > maxBytes) {
          cancelBody();
          throw new CalendarSourceError("CALENDAR_SOURCE_TOO_LARGE");
        }
        text += decoder.decode(chunk.value, { stream: true });
      }
      text += decoder.decode();
      const document = text.trim();
      if (!/^BEGIN:VCALENDAR\r?\n/i.test(document) || !/\r?\nEND:VCALENDAR$/i.test(document)) {
        throw new CalendarSourceError("CALENDAR_SOURCE_INVALID");
      }
      return text;
    };

    try {
      const text = await Promise.race([
        read(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            reject(new CalendarSourceError("CALENDAR_SOURCE_TIMEOUT"));
            controller.abort();
            cancelBody();
          }, timeoutMs);
        }),
      ]);
      cache(url, { text, expiresAt: now() + 60_000 });
      return { text, cache: "miss" };
    } catch (error) {
      const safeError = error instanceof CalendarSourceError
        ? error : new CalendarSourceError("CALENDAR_SOURCE_NETWORK");
      if (safeError.code === "CALENDAR_SOURCE_RATE_LIMITED") {
        cache(url, { error: safeError, expiresAt: now() + safeError.retryAfterSeconds! * 1000 });
      }
      throw safeError;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  };

  return async (url: string): Promise<CalendarSourceResult> => {
    const entry = cached.get(url);
    if (entry && entry.expiresAt > now()) {
      if ("text" in entry) return { text: entry.text, cache: "hit" };
      throw new CalendarSourceError(entry.error.code, entry.error.upstreamStatus,
        Math.max(1, Math.ceil((entry.expiresAt - now()) / 1000)), entry.error.retryAfterProvided);
    }
    cached.delete(url);
    const shared = pending.get(url);
    if (shared) return { ...await shared, cache: "coalesced" };
    if (pending.size >= maxEntries) throw new CalendarSourceError("CALENDAR_SOURCE_BUSY", null, 1);
    const request = download(url);
    pending.set(url, request);
    try {
      return await request;
    } finally {
      pending.delete(url);
    }
  };
};
