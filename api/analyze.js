// AI-Powered Health Analysis Engine (V2 - Strict Clinical Logic)

export const config = {
  runtime: 'edge',
};

const SYSTEM_PROMPT = `You are ZERO INTERPRETER, a clinical-grade metabolic analysis engine. 
You provide assessments based on standard endocrinology (ADA guidelines).

CLINICAL CLASSIFICATION LOGIC:
- DIABETIC_RANGE: Peak glucose is consistently >= 200 mg/dL.
- PRE_DIABETIC_RANGE: Peak glucose is >= 140 mg/dL but < 200 mg/dL.
- HEALTHY_RANGE: Peak glucose is < 140 mg/dL and returns to baseline within 120-180 minutes.

RESPONSE FORMAT (strict JSON only):
{
  "summary": "<One punchy, authoritative sentence summarizing the metabolic state>",
  "status": "<DIABETIC_RANGE|PRE_DIABETIC_RANGE|HEALTHY_RANGE>",
  "score": <0-100 overall score>,
  "grade": "<S|A|B|C|D|F>",
  "gradeLabel": "<EXCELLENT|VIBRANT|MODERATE|ELEVATED|STRAINED|CRITICAL>",
  "duration": <number of minutes spike lasted>,
  "tip": "<One short actionable clinical tip>",
  "recommendations": ["<Actionable tip 1>", "<Actionable tip 2>", "<Actionable tip 3>"],
  "insights": "<2-3 structured paragraphs explaining: (1) why they were classified this way, (2) the impact of the specific meal (e.g. Soto Mie Bogor), and (3) clinical context on their recovery curve.>",
  "riskFactors": ["<risk 1>", "<risk 2>"],
  "strengths": ["<strength 1>", "<strength 2>"],
  "mealScore": "<A-F grade for the meal>"
}

TONE: Professional, clinicial, yet empathetic. No fluff. Use medical terminology correctly (e.g., "glucose excursions", "metabolic flexibility", "postprandial response").`;

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

Provide strict classification based on peak readings provided.` },
        ],
        temperature: 0.2, // Lower temperature for consistency
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
