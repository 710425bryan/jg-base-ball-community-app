import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY") || "";
const GEMINI_LINEUP_MODEL = Deno.env.get("GEMINI_LINEUP_MODEL") || "gemini-2.5-pro";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const MAX_BASE64_IMAGE_CHARS = 8 * 1024 * 1024;

type ParsedLineupItem = {
  order?: number | string | null;
  position?: string | number | null;
  raw_position?: string | number | null;
  name?: string | null;
  number?: string | number | null;
};

type ParsedReserveItem = {
  name?: string | null;
  number?: string | number | null;
};

type ParsedLineupResult = {
  lineup?: ParsedLineupItem[] | null;
  reserves?: ParsedReserveItem[] | null;
};

type RosterPlayer = {
  name: string;
  uniform_number: string;
};

const normalizeText = (value: unknown) => String(value ?? "").trim();
const normalizeNameKey = (value: unknown) => normalizeText(value).replace(/\s+/g, "");
const normalizeNumberKey = (value: unknown) =>
  normalizeText(value)
    .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/[^\dA-Za-z]/g, "");
const normalizePositionText = (value: unknown) =>
  normalizeText(value)
    .replace(/[０-９]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 0xfee0))
    .replace(/\s+/g, "")
    .toUpperCase();

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });

const assertAuthorized = async (req: Request) => {
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();

  if (!token) {
    throw jsonResponse({ error: "missing authorization token" }, 401);
  }

  const { data, error } = await serviceClient.auth.getUser(token);
  if (error || !data?.user?.id) {
    throw jsonResponse({ error: "invalid authorization token" }, 401);
  }

  if (!SUPABASE_ANON_KEY) {
    throw jsonResponse({ error: "SUPABASE_ANON_KEY is not configured" }, 500);
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
    throw jsonResponse({ error: "missing matches permission" }, 403);
  }
};

const sanitizeRoster = (roster: unknown) => {
  if (!Array.isArray(roster)) return [];

  const seen = new Set<string>();
  const sanitized: RosterPlayer[] = [];

  roster.forEach((player) => {
    const candidate = {
      name: normalizeText(player?.name),
      uniform_number: normalizeText(player?.uniform_number ?? player?.number),
    };
    const key = normalizeNameKey(candidate.name);
    if (!candidate.name || seen.has(key)) return;

    seen.add(key);
    sanitized.push(candidate);
  });

  return sanitized.slice(0, 40);
};

const buildRosterString = (roster: ReturnType<typeof sanitizeRoster>) =>
  roster.length > 0
    ? JSON.stringify(roster.map((player) => `${player.name}(${player.uniform_number || "無"})`))
    : "[]";

const buildRosterLookup = (roster: RosterPlayer[]) => {
  const byName = new Map(roster.map((player) => [normalizeNameKey(player.name), player]));
  const byNumber = new Map<string, RosterPlayer>();
  const duplicateNumbers = new Set<string>();

  roster.forEach((player) => {
    const numberKey = normalizeNumberKey(player.uniform_number);
    if (!numberKey) return;

    if (byNumber.has(numberKey)) {
      duplicateNumbers.add(numberKey);
      byNumber.delete(numberKey);
      return;
    }

    if (!duplicateNumbers.has(numberKey)) {
      byNumber.set(numberKey, player);
    }
  });

  return { byName, byNumber, duplicateNumbers };
};

const normalizeImageInput = (image: unknown, mimeType: unknown) => {
  if (!image || typeof image !== "string") {
    throw jsonResponse({ error: "No image provided" }, 400);
  }

  const imageText = image.trim();
  const dataUrlMatch = imageText.match(/^data:(image\/(?:png|jpeg|jpg|webp));base64,(.+)$/i);
  const detectedMimeType = dataUrlMatch?.[1]?.toLowerCase().replace("image/jpg", "image/jpeg");
  const finalMimeType = normalizeText(mimeType) || detectedMimeType || "image/jpeg";
  const base64Data = (dataUrlMatch ? dataUrlMatch[2] : imageText).replace(/\s/g, "");

  if (!base64Data) {
    throw jsonResponse({ error: "No image provided" }, 400);
  }

  if (base64Data.length > MAX_BASE64_IMAGE_CHARS) {
    throw jsonResponse({ error: "圖片太大，請裁切或壓縮後再解析。" }, 413);
  }

  return {
    base64Data,
    mimeType: finalMimeType,
  };
};

const buildGeminiLineupResponseSchema = () => {
  return {
    type: "OBJECT",
    properties: {
      lineup: {
        type: "ARRAY",
        description: "先發打擊陣容名單，包含打擊順序、守備位置、姓名、背號",
        items: {
          type: "OBJECT",
          properties: {
            order: { type: "INTEGER", description: "打擊順序 1 到 9" },
            position: { type: "STRING", description: "守備位置代碼字串；如果看不清楚可留空字串" },
            raw_position: {
              type: "STRING",
              description: "防守位置欄位的原始判讀文字，優先照格子內的手寫符號輸出，例如 2、C、捕、3、一壘、1B",
            },
            name: {
              type: "STRING",
              description: "只能填本場允許球員名單內的人名；不確定或不在名單時填空字串",
            },
            number: { type: "STRING", description: "衣服背號；如果看不清楚可留空字串" },
          },
          required: ["order", "position", "raw_position", "name", "number"],
        },
      },
      reserves: {
        type: "ARRAY",
        description: "預備球員名單",
        items: {
          type: "OBJECT",
          properties: {
            name: {
              type: "STRING",
              description: "只能填本場允許球員名單內的人名；不確定或不在名單時填空字串",
            },
            number: { type: "STRING", description: "衣服背號；如果看不清楚可留空字串" },
          },
          required: ["name", "number"],
        },
      },
    },
    required: ["lineup", "reserves"],
  };
};

const buildPrompt = (rosterString: string) => `
這是一張棒球手寫的「打擊順序表」與「攻守名單」。
請只擷取「照片裡實際看得到」的資訊，幫我解析出 1~9 棒的：
1. order (打擊順序 1~9)
2. position (守備位置代碼，例如 1=投手, 2=捕手, 3=一壘手, 4=二壘手, 5=三壘手, 6=游擊手, 7=左外野, 8=中外野, 9=右外野。請直接回傳代碼數字字串，如 "5")
3. raw_position (防守位置欄位原始判讀，例如 一壘、投手、1B、P、游擊)
4. name (球員姓名)
5. number (衣服背號)

同時請解析下方的預備選手名單 (reserves)。

重要規則：
1. 下方「本場允許球員名單」是唯一可輸出姓名的白名單。
2. 請先逐格讀表格左側的「打擊順序 / 背號 / 防守位置」三欄；背號通常比姓名手寫更可靠。
3. 如果背號清楚，且該背號在本場允許球員名單中只對應一位球員，name 請直接填該球員名單上的姓名。
4. 如果背號清楚但不在本場允許球員名單，請改用姓名欄比對本場允許球員名單；例如照片背號寫 11，但姓名欄可辨識為陳柏叡，且本場名單有陳柏叡，name 請填陳柏叡，number 保留照片讀到的 11。
5. 我提供的球員名冊只能拿來做「手寫辨識後的校正」與「背號反查」，不能直接拿來補照片裡沒有的棒次或替補。
6. 如果照片裡沒有清楚看到某位球員，絕對不要因為名冊中有這個名字就把他寫進 lineup 或 reserves。
7. 不要為了湊滿 9 棒而猜測，不要新增照片裡沒有出現的替補球員。
8. 如果某一列內容看不清楚，該列的 name / number / position 可以留空字串 ""，不要猜。
9. reserves 只包含照片下方「預備球員」區塊實際寫出的球員；同樣先讀背號，背號可唯一對應時用背號反查姓名。
10. 如果照片中疑似出現的人名不在「本場允許球員名單」內，name 必須填空字串 ""，不要輸出陌生人名。
11. 不要讀取或混入表格右側直排印刷文字、浮水印、手機工具列或紙張外的文字。
12. 防守位置欄通常是棒球位置代碼，不是球員平常守位；請只讀該列「防守位置」格子，不要依球員姓名或常識猜守位。
13. 防守位置請先輸出 raw_position，再轉 position：2 / C / 捕 / 捕手 = "2"，3 / 一壘 / 1B = "3"，4 / 二壘 / 2B = "4"，5 / 三壘 / 3B = "5"，6 / 游擊 / SS = "6"，7 / 左外野 / LF = "7"，8 / 中外野 / CF = "8"，9 / 右外野 / RF = "9"。單獨的「一」「二」「三」若像數字代碼，請當作 1/2/3 代碼，不要直接當一壘/二壘/三壘。
14. 如果防守位置格子像「2」「C」「捕」或捕手相關寫法，position 必須是 "2"；不要把它誤讀成一壘 "3"。

手寫防呆校正：
由於照片是手寫字跡，非常容易辨識錯誤。當你先從照片中辨識出姓名後，才可以再與下面的現有球員名冊進行模糊比對。
如果發現發音相似、字型相似的球員，請只在該球員屬於「本場允許球員名單」時，以名冊上的寫法為準。

本場允許球員名單（姓名與背號）：
${rosterString}

請一律以符合 JSON Schema 的格式回傳（不需要其他文字解說）。
`;

const parseWithGemini = async (
  prompt: string,
  base64Data: string,
  mimeType: string,
): Promise<ParsedLineupResult> => {
  if (!GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const googleApiUrl =
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_LINEUP_MODEL}:generateContent?key=${GEMINI_API_KEY.trim()}`;

  const requestBody = {
    contents: [
      {
        parts: [
          { text: prompt },
          {
            inlineData: {
              mimeType,
              data: base64Data,
            },
          },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: buildGeminiLineupResponseSchema(),
    },
  };

  const response = await fetch(googleApiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API responded with status ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const textResult = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!textResult) {
    throw new Error("Failed to parse Gemini API response content");
  }

  return JSON.parse(textResult);
};

const normalizePosition = (position: unknown, rawPosition: unknown) => {
  const raw = normalizePositionText(rawPosition);
  const value = normalizePositionText(position);
  const source = raw || value;

  if (!source) return "";
  if (["P", "投", "投手", "投手P"].includes(source)) return "1";
  if (["C", "捕", "捕手"].includes(source)) return "2";
  if (["一", "壹"].includes(source)) return "1";
  if (["二", "貳"].includes(source)) return "2";
  if (["三", "參"].includes(source)) return "3";
  if (["一壘", "一壘手", "1B", "FIRST", "FIRSTBASE"].includes(source)) return "3";
  if (["二壘", "二壘手", "2B", "SECOND", "SECONDBASE"].includes(source)) return "4";
  if (["三壘", "三壘手", "3B", "THIRD", "THIRDBASE"].includes(source)) return "5";
  if (["游", "游擊", "游擊手", "SS", "SHORT", "SHORTSTOP"].includes(source)) return "6";
  if (["左", "左外", "左外野", "左外野手", "LF"].includes(source)) return "7";
  if (["中", "中外", "中外野", "中外野手", "CF"].includes(source)) return "8";
  if (["右", "右外", "右外野", "右外野手", "RF"].includes(source)) return "9";

  if (/^[1-9]$/.test(value)) return value;
  return normalizeText(position);
};

const normalizeParsedResult = (parsedResult: ParsedLineupResult, roster: RosterPlayer[]) => {
  const rosterLookup = buildRosterLookup(roster);
  const lineupByOrder = new Map<number, { order: number; position: string; name: string; number: string }>();
  const parsedLineup = Array.isArray(parsedResult?.lineup) ? parsedResult.lineup : [];
  parsedLineup.forEach((item) => {
    const order = Number(item?.order);
    if (!Number.isInteger(order) || order <= 0) return;

    const parsedName = normalizeText(item?.name);
    const parsedNumber = normalizeText(item?.number);
    const numberKey = normalizeNumberKey(parsedNumber);
    const numberRosterPlayer = numberKey ? rosterLookup.byNumber.get(numberKey) : undefined;
    const nameRosterPlayer = parsedName ? rosterLookup.byName.get(normalizeNameKey(parsedName)) : undefined;
    const canTrustNameFallback = !numberKey || !numberRosterPlayer || rosterLookup.duplicateNumbers.has(numberKey);
    const rosterPlayer = numberRosterPlayer || (canTrustNameFallback ? nameRosterPlayer : undefined);

    const candidate = {
      order,
      position: normalizePosition(item?.position, item?.raw_position),
      name: rosterPlayer?.name || "",
      number: parsedNumber || rosterPlayer?.uniform_number || "",
    };

    const existing = lineupByOrder.get(order);
    if (!existing || (!existing.name && candidate.name) || (!existing.number && candidate.number)) {
      lineupByOrder.set(order, candidate);
    }
  });

  const seenReserveNames = new Set<string>();
  const parsedReserves = Array.isArray(parsedResult?.reserves) ? parsedResult.reserves : [];
  const reserves = parsedReserves
    .map((item) => ({
      name: normalizeText(item?.name),
      number: normalizeText(item?.number),
    }))
    .map((item) => {
      const numberKey = normalizeNumberKey(item.number);
      const numberRosterPlayer = numberKey ? rosterLookup.byNumber.get(numberKey) : undefined;
      const nameRosterPlayer = item.name ? rosterLookup.byName.get(normalizeNameKey(item.name)) : undefined;
      const canTrustNameFallback = !numberKey || !numberRosterPlayer || rosterLookup.duplicateNumbers.has(numberKey);
      const rosterPlayer = numberRosterPlayer || (canTrustNameFallback ? nameRosterPlayer : undefined);
      if (!rosterPlayer) return null;
      return {
        name: rosterPlayer.name,
        number: item.number || rosterPlayer.uniform_number,
      };
    })
    .filter((item): item is { name: string; number: string } => Boolean(item))
    .filter((item) => {
      if (seenReserveNames.has(item.name)) return false;
      seenReserveNames.add(item.name);
      return true;
    });

  return {
    lineup: Array.from(lineupByOrder.values()).sort((left, right) => left.order - right.order),
    reserves,
  };
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "method not allowed" }, 405);
  }

  try {
    await assertAuthorized(req);

    const { image, roster: rosterInput, mimeType } = await req.json();
    const roster = sanitizeRoster(rosterInput);
    if (!roster.length) {
      return jsonResponse({ error: "請先選擇出賽全體球員後再解析照片。" }, 400);
    }

    const imageInput = normalizeImageInput(image, mimeType);
    const prompt = buildPrompt(buildRosterString(roster));
    const parsedResult = await parseWithGemini(prompt, imageInput.base64Data, imageInput.mimeType);

    return jsonResponse(normalizeParsedResult(parsedResult, roster));
  } catch (error) {
    if (error instanceof Response) return error;

    console.error("parse-lineup error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ error: message }, 500);
  }
});
