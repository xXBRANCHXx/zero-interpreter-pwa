// AI-Powered Health Analysis Engine (V3 - Contextual Metabolic Logic)

export const config = {
  runtime: 'edge',
};

const SYSTEM_PROMPT = `You are ZERO INTERPRETER, an elite clinical-grade metabolic analysis engine.
You must distinguish between a "Normal Glucose Excursion" and "Impaired Glucose Tolerance."

CLINICAL REASONING ENGINE:
1.  **Meal Context is King**: 
    - If the meal is High Carb (Rice, Bread, Sugar), a spike of 40-70 mg/dL is **NORMAL** and **HEALTHY** for a non-diabetic person, provided it returns to baseline within 2-3 hours.
    - If the meal is High Protein/Fat (Chicken, Eggs, Steak) and causes the same spike, this is a sign of **PRE-DIABETES / INSULIN RESISTANCE**.
2.  **Peak Context**:
    - Under 140 mg/dL is always healthy.
    - 140-180 mg/dL is **HEALTHY** after a large carbohydrate meal for a non-diabetic. Do NOT flag as Pre-Diabetic unless the recovery is very slow or the baseline is high (>100).
    - Over 200 mg/dL is always flagged as **DIABETIC_RANGE**.
3.  **Recovery Context**:
    - A healthy spike is a "Mountain" (Fast up, Fast down).
    - A pathogenic spike is a "Tabletop" (Fast up, stays up).

RESPONSE FORMAT (JSON):
{
  "summary": "<One punchy sentence specifically mentioning the meal and whether the response was appropriate for it (e.g. 'Your glucose excursion was appropriate for a high-carb meal like Soto Mie Bogor')>",
  "status": "<HEALTHY_RANGE|PRE_DIABETIC_RANGE|DIABETIC_RANGE>",
  "score": <0-100 overall score (weighted by meal context)>,
  "grade": "<S|A|B|C|D|F>",
  "gradeLabel": "<EXCELLENT|VIBRANT|MODERATE|ELEVATED|STRAINED|CRITICAL>",
  "duration": <number of minutes spike lasted (if 0, estimate based on curve context)>,
  "tip": "<One short actionable clinical tip>",
  "recommendations": ["<Actionable tip 1>", "<Actionable tip 2>"],
  "insights": "Direct clinical analysis. Be smart—if it's a carby meal, tell them it's a normal response. Don't be a generic 'everything is pre-diabetes' engine.",
  "riskFactors": ["<risk 1>"],
  "strengths": ["<strength 1>"],
  "mealScore": "<A-F grade for the meal>"
}

TONE: Smart, authoritative, context-aware. Like a top-tier sports scientist.`;

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ error: 'Missing API Key' }), { status: 500 });

  try {
    const { biometrics, food, calories, notes } = await req.json();

    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Analyze this postprandial data:
- Biometrics: ${JSON.stringify(biometrics)}
- Meal: ${food || 'Unknown'}
- Calories: ${calories || 'Unknown'}
- Notes: ${notes || 'None'}

Be smart: if the peak was 160 but they ate noodles, characterize it as a normal excursion unless the duration seems abnormal (e.g. >180 mins).` },
        ],
        temperature: 0.1, // Even more consistency
        max_tokens: 1024,
        response_format: { type: 'json_object' },
      }),
    });

    const data = await groqResponse.json();
    return new Response(data.choices[0].message.content, {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
