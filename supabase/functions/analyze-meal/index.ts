// analyze-meal — Supabase Edge Function (Deno).
//
// Receives a base64 meal image from the app and asks Google Gemini (vision) to
// estimate nutrition, returning a structured JSON object. The GEMINI_API_KEY
// lives only here (set via `supabase secrets set GEMINI_API_KEY=...`), never in
// the app bundle.
//
// JWT verification is handled by the Supabase platform (verify_jwt defaults to
// true), so only authenticated app requests reach this code.
//
// Get a free key at https://aistudio.google.com/apikey.

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
// Free-tier, vision-capable model. (gemini-2.0-flash is no longer on the free
// tier — quota 0; 2.5-flash is the current free vision model.)
const MODEL = 'gemini-2.5-flash';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Gemini structured-output schema (OpenAPI subset — types are UPPERCASE).
const NUTRITION_SCHEMA = {
  type: 'OBJECT',
  properties: {
    name: { type: 'STRING' },
    calories: { type: 'NUMBER' },
    protein_g: { type: 'NUMBER' },
    carbs_g: { type: 'NUMBER' },
    fat_g: { type: 'NUMBER' },
    confidence: { type: 'STRING', enum: ['low', 'medium', 'high'] },
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          quantity: { type: 'STRING' },
          calories: { type: 'NUMBER' },
          protein_g: { type: 'NUMBER' },
          carbs_g: { type: 'NUMBER' },
          fat_g: { type: 'NUMBER' },
        },
        required: ['name', 'quantity', 'calories', 'protein_g', 'carbs_g', 'fat_g'],
      },
    },
    micros: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          amount: { type: 'NUMBER' },
          unit: { type: 'STRING' },
        },
        required: ['name', 'amount', 'unit'],
      },
    },
    assumptions: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['name', 'calories', 'protein_g', 'carbs_g', 'fat_g', 'confidence', 'items', 'micros', 'assumptions'],
};

const PROMPT = `You are a nutrition estimator. Look at this photo of a meal and estimate its nutrition.
Identify the dish and the visible portion size, then estimate calories and macronutrients.
Break the meal into its distinct food "items" (e.g. "Grilled chicken breast", "White rice",
"Steamed broccoli"). For each item give a human-readable "quantity" (e.g. "1 cup", "150 g",
"2 eggs") and its own calories and macros. The top-level "calories", "protein_g", "carbs_g",
and "fat_g" MUST equal the sum of the items so the breakdown stays consistent.
Include key micronutrients you can reasonably infer (e.g. fiber, sodium, calcium, iron,
vitamin C, potassium) with realistic amounts and units. List the assumptions you made about
portion size and ingredients. Set "confidence" based on how clearly you can identify the food
and judge the portion. If the image does not contain food, return name "No food detected",
zeros for macros, confidence "low", an empty items array, an empty micros array, and explain
in assumptions.`;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }
  if (!GEMINI_API_KEY) {
    return json({ error: 'Server is missing GEMINI_API_KEY.' }, 500);
  }

  let imageBase64: string | undefined;
  let mediaType = 'image/jpeg';
  try {
    const body = await req.json();
    imageBase64 = body.imageBase64;
    if (body.mediaType === 'image/png') mediaType = 'image/png';
  } catch {
    return json({ error: 'Invalid request body.' }, 400);
  }
  if (!imageBase64) {
    return json({ error: 'Missing imageBase64.' }, 400);
  }

  let geminiRes: Response;
  try {
    geminiRes = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { inline_data: { mime_type: mediaType, data: imageBase64 } },
              { text: PROMPT },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: NUTRITION_SCHEMA,
        },
      }),
    });
  } catch (e) {
    return json({ error: `Failed to reach Gemini: ${e instanceof Error ? e.message : e}` }, 502);
  }

  if (!geminiRes.ok) {
    const text = await geminiRes.text();
    return json({ error: `Gemini API error (${geminiRes.status}): ${text}` }, 502);
  }

  const data = await geminiRes.json();

  // Safety blocks / empty candidates.
  if (data.promptFeedback?.blockReason) {
    return json({ error: `Blocked by Gemini: ${data.promptFeedback.blockReason}` }, 422);
  }
  const parts = data.candidates?.[0]?.content?.parts;
  const text = Array.isArray(parts) ? parts.map((p: { text?: string }) => p.text ?? '').join('') : '';
  if (!text) {
    return json({ error: 'No analysis returned by the model.' }, 502);
  }

  try {
    return json(JSON.parse(text));
  } catch {
    return json({ error: 'Could not parse the model response.' }, 502);
  }
});
