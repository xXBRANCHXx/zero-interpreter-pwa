// AI-Powered Health Analysis Engine (V4 - Raw Visual Calibration)

export const config = { runtime: 'edge' };

const SYSTEM_PROMPT = `You are ZERO INTERPRETER, a clinical-grade metabolic engine. 
You provide assessments by first CALIBRATING the raw pixel data you receive.

CALIBRATION LOGIC:
1.  **Map Pixels to Values**: 
    - You will receive "axisAnchors" (e.g., {val: 150, y: 100}). 
    - Use these to calculate the vertical scale (mg/dL per pixel). 
    - For example, if 150 is at Y=100 and 100 is at Y=250, then each pixel is 0.33 mg/dL.
    - Calculate the Peak Reading from peakY and the Resting Baseline from minY.
2.  **Contextual Logic**:
    - Distinguish between common "glucose excursions" (healthy peaks after carbs) and "insulin resistance" (slow, high peaks regardless of meal).
    - If peak < 180 and recovers in <180 mins after a high-carb meal, consider it HEALTHY.

RESPONSE FORMAT (JSON):
{
  "summary": "<Punchy clinical summary including meal context>",
  "status": "<HEALTHY_RANGE|PRE_DIABETIC_RANGE|DIABETIC_RANGE>",
  "peakReading": <Calibrated peak value in mg/dL>,
  "restingBaseline": <Calibrated baseline value in mg/dL>,
  "score": <0-100>,
  "grade": "<S|A|B|C|D|F>",
  "gradeLabel": "<EXCELLENT|VIBRANT|MODERATE|ELEVATED|STRAINED|CRITICAL>",
  "duration": <estimated duration in minutes based on pixelDuration and scaling>,
  "tip": "<Short actionable tip>",
  "recommendations": ["<Tip 1>", "<Tip 2>"],
  "insights": "Detailed clinical analysis...",
  "riskFactors": ["<risk 1>"],
  "strengths": ["<strength 1>"],
  "mealScore": "<A-F grade for the meal>"
}

Be smart. Never return a negative value. Always use common sense.`;

export default async function handler(req) {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return new Response('Missing API Key', { status: 500 });

  try {
    const { biometrics, food, calories, notes } = await req.json();

    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Analyze this raw metabolic data:
- Raw Visual Data: ${JSON.stringify(biometrics)}
- Meal: ${food || 'Unknown'}
- Calories: ${calories || 'Unknown'}
- Notes: ${notes || 'None'}

Calibrate the vertical scale using the anchors and provide the true health status.` }
        ],
        temperature: 0.1,
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
