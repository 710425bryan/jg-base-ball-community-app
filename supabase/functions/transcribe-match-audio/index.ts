import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";
import {
  MATCH_AUDIO_ACTION_TERMS,
  normalizeMatchAudioStructuredResult,
  type MatchAudioRosterPlayer,
  type MatchAudioStructuredResultInput,
} from "../../../src/utils/matchAudioTranscription.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY") || "";
const OPENAI_TRANSCRIBE_MODEL = Deno.env.get("OPENAI_TRANSCRIBE_MODEL") || "gpt-4o-transcribe";
const OPENAI_MATCH_AUDIO_LOG_MODEL = Deno.env.get("OPENAI_MATCH_AUDIO_LOG_MODEL") || "gpt-5.4-mini";
const MAX_TRANSCRIPTION_FILE_BYTES = 24 * 1024 * 1024;
const NO_SPEECH_TRANSCRIPT = "[[NO_SPEECH]]";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });

const normalizeText = (value: unknown) => String(value ?? "").trim();

const safeJsonParse = (value: string) => {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
};

const assertAuthorized = async (req: Request) => {
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!token) {
    throw jsonResponse({ success: false, error: "missing authorization token" }, 401);
  }

  const { data, error } = await serviceClient.auth.getUser(token);
  if (error || !data?.user?.id) {
    throw jsonResponse({ success: false, error: "invalid authorization token" }, 401);
  }

  if (!SUPABASE_ANON_KEY) {
    throw jsonResponse({ success: false, error: "SUPABASE_ANON_KEY is not configured" }, 500);
  }

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });

  const [createPermission, editPermission] = await Promise.all([
    userClient.rpc("has_app_permission", { p_feature: "matches", p_action: "CREATE" }),
    userClient.rpc("has_app_permission", { p_feature: "matches", p_action: "EDIT" }),
  ]);

  if (createPermission.error) throw createPermission.error;
  if (editPermission.error) throw editPermission.error;

  if (createPermission.data !== true && editPermission.data !== true) {
    throw jsonResponse({ success: false, error: "missing matches permission" }, 403);
  }

  return data.user.id;
};

const readPayload = async (req: Request) => {
  const formData = await req.formData();
  const metadata = safeJsonParse(normalizeText(formData.get("metadata")));
  const audioFiles = formData
    .getAll("audio")
    .filter((value): value is File => value instanceof File);
  const audioChunks = formData
    .getAll("audio_chunks")
    .filter((value): value is File => value instanceof File);

  return {
    metadata,
    files: audioChunks.length ? audioChunks : audioFiles,
  };
};

const sanitizeRoster = (value: unknown): MatchAudioRosterPlayer[] => {
  if (!Array.isArray(value)) return [];

  const seen = new Set<string>();
  return value
    .map((player) => ({
      name: normalizeText(player?.name),
      number: normalizeText(player?.number),
    }))
    .filter((player) => player.name)
    .filter((player) => {
      const key = player.name.replace(/\s+/g, "");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 60);
};

const buildTranscriptionPrompt = (metadata: any, roster: MatchAudioRosterPlayer[]) => {
  const rosterText = roster.map((player) => `${player.name}${player.number ? ` #${player.number}` : ""}`).join("、");

  return [
    "請逐字轉錄這段錄音中的清楚人聲，使用繁體中文。",
    `如果沒有清楚可辨識的人聲，或只有環境聲、風聲、音樂、球場噪音、空白，請只輸出 ${NO_SPEECH_TRANSCRIPT}。`,
    "只轉錄實際聽到的內容；不要根據棒球比賽情境自行補出好壞球數、出局數、比分、安打、保送或球員動作。",
    "以下只是協助辨識的棒球口令詞庫，不代表錄音一定有這些內容；只有實際清楚聽到才可以輸出：投出好球、投出壞球、界外球、揮空三振、保送、被安打、滾地出局、飛球出局、一好球、兩好一壞、兩好兩壞。",
    "不要因為下方提供了半局與名單，就猜測任何逐局文字。",
    `目前半局：${normalizeText(metadata?.inning) || "未知"}`,
    `本場球員名單：${rosterText || "未提供"}`,
    "只有在確實聽到球員姓名時，才可依本場球員名單修正同音或近似字。",
  ].join("\n");
};

const normalizeTranscriptForEmptyCheck = (value: string) =>
  normalizeText(value)
    .replace(/[，,。.!！?？、\s]/g, "")
    .replace(/[\[\]_]/g, "")
    .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/一/g, "1")

const isLikelyEmptyTranscription = (transcript: string) => {
  if (normalizeText(transcript) === NO_SPEECH_TRANSCRIPT) return true

  const normalized = normalizeTranscriptForEmptyCheck(transcript)
  if (!normalized) return true
  if (normalized === normalizeTranscriptForEmptyCheck(NO_SPEECH_TRANSCRIPT)) return true

  const knownSilenceHallucinations = new Set([
    "NOSPEECH",
    "第1球",
    "1球",
    "第1局",
    "1局",
    "開始",
    "好",
    "嗯",
    "啊",
  ])

  return knownSilenceHallucinations.has(normalized)
}

const transcribeBlob = async (file: Blob, filename: string, prompt: string) => {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const body = new FormData();
  body.append("file", file, filename);
  body.append("model", OPENAI_TRANSCRIBE_MODEL);
  body.append("response_format", "json");
  body.append("language", "zh");
  body.append("prompt", prompt);

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI transcription failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  return normalizeText(data?.text);
};

const transcribeFiles = async (files: File[], metadata: any, roster: MatchAudioRosterPlayer[]) => {
  const prompt = buildTranscriptionPrompt(metadata, roster);
  const totalSize = files.reduce((sum, file) => sum + file.size, 0);

  if (files.length > 1 && totalSize <= MAX_TRANSCRIPTION_FILE_BYTES) {
    const mergedBlob = new Blob(files, { type: files[0]?.type || "audio/webm" });
    const transcript = await transcribeBlob(mergedBlob, `match-${normalizeText(metadata?.inning) || "audio"}.webm`, prompt);
    return isLikelyEmptyTranscription(transcript) ? "" : transcript;
  }

  if (files.length === 1 && files[0].size <= MAX_TRANSCRIPTION_FILE_BYTES) {
    const transcript = await transcribeBlob(files[0], files[0].name || "match-audio.webm", prompt);
    return isLikelyEmptyTranscription(transcript) ? "" : transcript;
  }

  const transcripts: string[] = [];
  for (const [index, file] of files.entries()) {
    if (file.size > MAX_TRANSCRIPTION_FILE_BYTES) {
      throw new Error(`第 ${index + 1} 段音訊超過 24MB，請縮短錄音片段後再試。`);
    }

    const text = await transcribeBlob(file, file.name || `match-audio-${index + 1}.webm`, prompt);
    if (text && !isLikelyEmptyTranscription(text)) transcripts.push(text);
  }

  return transcripts.join("\n");
};

const buildStructuredSchema = (roster: MatchAudioRosterPlayer[]) => {
  const playerNames = roster.map((player) => player.name).filter(Boolean);
  const playerEnum = playerNames.length ? ["", ...playerNames] : [""];

  return {
    type: "object",
    additionalProperties: false,
    properties: {
      summary: {
        type: "string",
        description: "用一句繁體中文摘要這段半局內容。",
      },
      warnings: {
        type: "array",
        description: "任何不確定、音訊不清楚、無法整理成逐局事件的提醒。",
        items: { type: "string" },
      },
      events: {
        type: "array",
        description: "依發生順序整理出的逐局事件。",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            player_name: {
              type: "string",
              enum: playerEnum,
              description: "只能填本場球員名單內的人名；不確定或不在名單時填空字串。",
            },
            raw_player_name: {
              type: "string",
              description: "音訊中聽到但尚未確認的人名；若已確認 player_name 可留空。",
            },
            action: {
              type: "string",
              enum: MATCH_AUDIO_ACTION_TERMS,
              description: "必須使用這個固定棒球事件詞表。",
            },
            detail: {
              type: "string",
              description: "補充方向、壘上狀況或原文重點；不要放非本場球員姓名。",
            },
            unknown_names: {
              type: "array",
              description: "任何聽到但不能確定是本場球員的人名。",
              items: { type: "string" },
            },
            confidence: {
              type: "number",
              description: "0 到 1 的整理信心。",
            },
          },
          required: ["player_name", "raw_player_name", "action", "detail", "unknown_names", "confidence"],
        },
      },
    },
    required: ["summary", "warnings", "events"],
  };
};

const structureTranscript = async (transcript: string, metadata: any, roster: MatchAudioRosterPlayer[]) => {
  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const rosterText = roster.map((player) => `${player.name}${player.number ? ` #${player.number}` : ""}`).join("\n");
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MATCH_AUDIO_LOG_MODEL,
      messages: [
        {
          role: "system",
          content: [
            "你是台灣少棒比賽逐局轉播紀錄助手。",
            "你只能把球員姓名對應到使用者提供的本場名單。",
            "若人名不在名單、不確定、或音訊模糊，player_name 必須填空，並把聽到的人名放入 raw_player_name 或 unknown_names。",
            "不要新增本場名單外的人名，不要用全隊名單補人。",
            "action 必須使用 schema enum 裡的固定事件詞，讓後續統計可以重算。",
          ].join("\n"),
        },
        {
          role: "user",
          content: [
            `半局：${normalizeText(metadata?.inning) || "未知"}`,
            `賽事：${normalizeText(metadata?.matchContext?.matchName) || "未填"}`,
            `對手：${normalizeText(metadata?.matchContext?.opponent) || "未填"}`,
            `攻守：${metadata?.matchContext?.isOffensiveHalf === false ? "我們防守" : "我們進攻"}`,
            "",
            "本場允許球員名單：",
            rosterText || "（未提供）",
            "",
            "逐字稿：",
            transcript,
          ].join("\n"),
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "match_audio_events",
          strict: true,
          schema: buildStructuredSchema(roster),
        },
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI log structuring failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("OpenAI did not return structured content");
  }

  return safeJsonParse(content) as MatchAudioStructuredResultInput;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "method not allowed" }, 405);
  }

  try {
    await assertAuthorized(req);

    const { metadata, files } = await readPayload(req);
    if (!files.length) {
      return jsonResponse({ success: false, error: "audio file is required" }, 400);
    }

    const roster = sanitizeRoster(metadata?.roster);
    const transcript = await transcribeFiles(files, metadata, roster);
    const structuredResult = transcript
      ? await structureTranscript(transcript, metadata, roster)
      : { summary: "", warnings: ["音訊沒有轉出可用文字"], events: [] };
    const normalizedResult = normalizeMatchAudioStructuredResult({
      structuredResult,
      roster,
      transcript,
    });

    return jsonResponse({
      success: true,
      transcript,
      result: structuredResult,
      normalized: normalizedResult,
    });
  } catch (error) {
    if (error instanceof Response) return error;

    console.error("transcribe-match-audio error:", error);
    return jsonResponse({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    }, 500);
  }
});
