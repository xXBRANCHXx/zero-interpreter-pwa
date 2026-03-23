// AI-Powered Health Analysis Engine (V5 - Contextual Time Calibration)

export const config = { runtime: 'edge' };

const SYSTEM_PROMPT = `You are ZERO INTERPRETER, an elite clinical metabolic analyst.

CALIBRATION STRATEGY:
1.  **Glucose Scale**: Match axisAnchors (val: 100, y: 300) to find mg/dL per pixel.
2.  **Time Scale**: Match timeAnchors (time: 01:25 PM, x: 100) and (time: 02:25 PM, x: 500) to find minutes per pixel.
3.  **Hump Analysis**: Identify the peakX and calculate the Spike Duration by observing the hump's width relative to your time anchors.

CRITICAL INSTRUCTION:
- A spike is the active 'mountain' part of the curve.
- If the chart spans 3 hours but the rise-and-fall of the hump only takes 1/3rd of the chart width, the duration is ~60 minutes, NOT 180.
- Use your internal vision logic to judge the 'active excursion' window.

RESPONSE FORMAT (JSON):
{
  "summary": "<Clinical summary mentioning the meal and recovery. e.g. 'Your glucose peaked at 140mg/dL but returned to baseline in under 60 minutes...'>",
  "status": "<HEALTHY_RANGE|PRE_DIABETIC_RANGE|DIABETIC_RANGE>",
  "peakReading": <Calibrated mg/dL>,
  "restingBaseline": <Calibrated mg/dL>,
  "score": <0-100>,
  "grade": "<S|A|B|C|D|F>",
  "gradeLabel": "<EXCELLENT|VIBRANT|MODERATE|ELEVATED|STRAINED|CRITICAL>",
  "duration": <The estimated time (in minutes) of the active glucose hump>,
  "tip": "<Short actionable tip>",
  "recommendations": ["<Tip 1>", "<Tip 2>"],
  "insights": "Detailed metabolic analysis...",
  "riskFactors": ["<risk 1>"],
  "strengths": ["<strength 1>"],
  "mealScore": "<A-F grade for the meal>"
}

Be analytical. Distinguish between 'total chart width' and 'spike width'.`;

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
- Raw Visual Data (Pixels & Anchors): ${JSON.stringify(biometrics)}
- Meal: ${food || 'Unknown'}
- Calories: ${calories || 'Unknown'}
- Notes: ${notes || 'None'}

Look at the timeAnchors! Use them to find how many minutes are in each horizontal pixel across the chart. Calibrate the spike duration correctly.` }
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
