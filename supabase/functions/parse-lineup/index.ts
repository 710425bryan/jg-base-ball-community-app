import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LINEUP_SCAN_SECRET = "jg-baseball-secret-auth";

type GeminiLineupItem = {
  order?: number | string | null;
  position?: string | number | null;
  name?: string | null;
  number?: string | number | null;
};

type GeminiReserveItem = {
  name?: string | null;
  number?: string | number | null;
};

const normalizeText = (value: unknown) => String(value ?? "").trim();

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "method not allowed" }, 405);
  }

  try {
    const { image, roster, mimeType, secretAuth } = await req.json();

    if (secretAuth !== LINEUP_SCAN_SECRET) {
      return jsonResponse({ error: "Unauthorized. Invalid API Key." }, 401);
    }

    if (!image || typeof image !== "string") {
      throw new Error("No image provided");
    }

    const apiKey = Deno.env.get("GEMINI_API_KEY");
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not set in environment variables.");
    }

    const base64Data = image.replace(/^data:image\/(png|jpeg|jpg|webp);base64,/, "");
    const finalMimeType = normalizeText(mimeType) || "image/jpeg";
    const sanitizedRoster = Array.isArray(roster)
      ? roster
        .map((player) => ({
          name: normalizeText(player?.name),
          uniform_number: normalizeText(player?.uniform_number ?? player?.number),
        }))
        .filter((player) => player.name)
        .slice(0, 40)
      : [];

    const rosterString = sanitizedRoster.length > 0
      ? JSON.stringify(sanitizedRoster.map((player) => `${player.name}(${player.uniform_number || "無"})`))
      : "[]";

    const prompt = `
這是一張棒球手寫的「打擊順序表」與「攻守名單」。
請只擷取「照片裡實際看得到」的資訊，幫我解析出 1~9 棒的：
1. order (打擊順序 1~9)
2. position (守備位置代碼，例如 1=投手, 2=捕手, 3=一壘手, 4=二壘手, 5=三壘手, 6=游擊手, 7=左外野, 8=中外野, 9=右外野。請直接回傳代碼數字字串，如 "5")
3. name (球員姓名)
4. number (衣服背號)

同時請解析下方的預備選手名單 (reserves)。

重要規則：
1. 我提供的球員名冊只能拿來做「手寫辨識後的校正」，不能直接拿來補人名。
2. 如果照片裡沒有清楚看到某位球員，絕對不要因為名冊中有這個名字就把他寫進 lineup 或 reserves。
3. 不要為了湊滿 9 棒而猜測，不要新增照片裡沒有出現的替補球員。
4. 如果某一列內容看不清楚，該列的 name / number / position 可以留空字串 ""，不要猜。
5. reserves 只包含照片下方實際寫出的預備選手；如果看不到就回傳空陣列 []。

手寫防呆校正：
由於照片是手寫字跡，非常容易辨識錯誤。當你先從照片中辨識出姓名後，才可以再與下面的現有球員名冊進行模糊比對。
如果發現發音相似、字型相似的球員，請一律以名冊上的寫法為準。

現有球員名冊（姓名與背號）：
${rosterString}

請一律以符合以下 JSON Schema 的格式回傳（不需要其他文字解說）：
{
  "lineup": [
    {
      "order": 1,
      "position": "5",
      "name": "黃文漢",
      "number": "10"
    }
  ],
  "reserves": [
    {
      "name": "吳秉學",
      "number": "14"
    }
  ]
}
`;

    const googleApiUrl =
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey.trim()}`;

    const requestBody = {
      contents: [
        {
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: finalMimeType,
                data: base64Data,
              },
            },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            lineup: {
              type: "ARRAY",
              description: "先發打擊陣容名單，包含打擊順序、守備位置、姓名、背號",
              items: {
                type: "OBJECT",
                properties: {
                  order: { type: "INTEGER", description: "打擊順序 1~9" },
                  position: { type: "STRING", description: "守備位置代碼字串；如果看不清楚可留空字串" },
                  name: { type: "STRING", description: "球員姓名；如果看不清楚可留空字串，禁止猜測" },
                  number: { type: "STRING", description: "衣服背號；如果看不清楚可留空字串" },
                },
                required: ["order", "name"],
              },
            },
            reserves: {
              type: "ARRAY",
              description: "預備球員名單",
              items: {
                type: "OBJECT",
                properties: {
                  name: { type: "STRING", description: "球員姓名；只有照片下方實際出現的預備選手才可輸出" },
                  number: { type: "STRING", description: "衣服背號；如果看不清楚可留空字串" },
                },
                required: ["name"],
              },
            },
          },
          required: ["lineup", "reserves"],
        },
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

    let parsedResult: { lineup?: GeminiLineupItem[]; reserves?: GeminiReserveItem[] };
    try {
      parsedResult = JSON.parse(textResult);
    } catch {
      throw new Error("Failed to parse result from AI into JSON");
    }

    const lineupByOrder = new Map<number, { order: number; position: string; name: string; number: string }>();
    const parsedLineup = Array.isArray(parsedResult?.lineup) ? parsedResult.lineup : [];
    parsedLineup.forEach((item) => {
      const order = Number(item?.order);
      if (!Number.isInteger(order) || order <= 0) return;

      const candidate = {
        order,
        position: normalizeText(item?.position),
        name: normalizeText(item?.name),
        number: normalizeText(item?.number),
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
      .filter((item) => item.name)
      .filter((item) => {
        if (seenReserveNames.has(item.name)) return false;
        seenReserveNames.add(item.name);
        return true;
      });

    return jsonResponse({
      lineup: Array.from(lineupByOrder.values()).sort((left, right) => left.order - right.order),
      reserves,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ error: message }, 400);
  }
});
