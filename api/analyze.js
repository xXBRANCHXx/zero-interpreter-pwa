// Vercel Serverless Function — AI-Powered Health Analysis via Groq (Free Tier)

export const config = {
  runtime: 'edge',
};

const SYSTEM_PROMPT = `You are ZERO INTERPRETER, an elite clinical-grade metabolic analysis engine.
You receive extracted biometric data from a glucose chart along with the patient's dietary context.
Your job is to produce a structured, medically-informed analysis.

RESPONSE FORMAT (strict JSON only, no markdown, no code fences):
{
  "score": <number 0-100, overall metabolic health score>,
  "grade": "<S|A|B|C|D|F>",
  "gradeLabel": "<one-word label like EXCELLENT, VIBRANT, MODERATE, ELEVATED, STRAINED, CRITICAL>",
  "status": "<HEALTHY_RANGE|PRE_DIABETIC_RANGE|DIABETIC_RANGE>",
  "duration": "<spike duration in minutes as a number, or 0 if unknown>",
  "tip": "<one sentence personalized tip>",
  "insights": "<2-4 paragraphs of detailed clinical-style analysis, separated by newlines. Cover: (1) glucose response pattern, (2) dietary impact assessment, (3) recovery analysis, (4) actionable recommendations. Use a warm, professional tone — like a caring endocrinologist.>",
  "riskFactors": ["<risk factor 1>", "<risk factor 2>"],
  "strengths": ["<metabolic strength 1>", "<metabolic strength 2>"],
  "mealScore": "<A-F grade specifically for the meal's metabolic impact>",
  "mealVerdict": "<one sentence verdict on the meal>"
}

SCORING GUIDELINES:
- Score 90-100: Minimal spike (<20mg/dL delta), fast recovery (<60min), healthy meal
- Score 70-89: Moderate spike (20-40mg/dL delta), reasonable recovery
- Score 50-69: Significant spike (40-60mg/dL delta), slow recovery, poor meal quality
- Score 30-49: High spike (60-80mg/dL delta), very slow recovery
- Score 0-29: Dangerous spike (>80mg/dL delta), extended elevation

GRADE MAPPING:
- S: Exceptional metabolic control
- A: Strong metabolic response
- B: Average, some room for improvement
- C: Below average, needs attention
- D: Poor metabolic control
- F: Critical, seek medical advice

Always respond with ONLY the JSON object. No other text.`;

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

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'GROQ_API_KEY not configured. Add it to Vercel environment variables.' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const body = await req.json();
    const { biometrics, food, calories, notes } = body;

    const userMessage = buildUserMessage(biometrics, food, calories, notes);

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
          { role: 'user', content: userMessage },
        ],
        temperature: 0.3,
        max_tokens: 1024,
        response_format: { type: 'json_object' },
      }),
    });

    if (!groqResponse.ok) {
      const errText = await groqResponse.text();
      console.error('Groq API error:', errText);
      return new Response(
        JSON.stringify({ error: 'AI engine unavailable', detail: errText }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const data = await groqResponse.json();
    const content = data.choices?.[0]?.message?.content;

    let analysis;
    try {
      analysis = JSON.parse(content);
    } catch {
      console.error('Failed to parse AI response:', content);
      return new Response(
        JSON.stringify({ error: 'AI returned invalid format', raw: content }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(JSON.stringify(analysis), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err) {
    console.error('Handler error:', err);
    return new Response(
      JSON.stringify({ error: 'Internal server error', message: err.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

function buildUserMessage(biometrics, food, calories, notes) {
  const bioText = biometrics
    .map((b) => `${b.label}: ${b.value}`)
    .join('\n');

  return `BIOMETRIC DATA EXTRACTED FROM CHART:
${bioText || 'No biometric data extracted'}

PATIENT CONTEXT:
- Recent Meal: ${food || 'Not provided'}
- Caloric Intake: ${calories ? calories + ' kcal' : 'Not provided'}
- Additional Notes: ${notes || 'None'}

Analyze this metabolic data and provide your structured assessment.`;
}
