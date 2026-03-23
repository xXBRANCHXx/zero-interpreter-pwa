/**
 * AI-Powered Analyzer — Calls the Vercel Edge API route (/api/analyze)
 * Falls back to deterministic analysis if the API is unavailable.
 */
import { analyzeCorrelation as deterministicFallback } from './analyzer.js';

const API_ENDPOINT = '/api/analyze';

export async function analyzeWithAI(foodText, calories, biometrics, notes = '') {
  try {
    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        biometrics,
        food: foodText,
        calories,
        notes,
      }),
    });

    if (!response.ok) {
      console.warn(`AI API returned ${response.status}, falling back to deterministic engine.`);
      return wrapFallback(deterministicFallback(foodText, calories, biometrics));
    }

    const data = await response.json();

    // Validate the response has required fields
    if (!data.score && data.score !== 0) {
      console.warn('AI response missing required fields, falling back.');
      return wrapFallback(deterministicFallback(foodText, calories, biometrics));
    }

    return {
      ...data,
      score: Number(data.score),
      duration: Number(data.duration) || 0,
      isAI: true,
      riskFactors: data.riskFactors || [],
      strengths: data.strengths || [],
      mealScore: data.mealScore || '--',
      mealVerdict: data.mealVerdict || '',
    };
  } catch (err) {
    console.warn('AI analysis failed:', err.message, '— using deterministic fallback.');
    return wrapFallback(deterministicFallback(foodText, calories, biometrics));
  }
}

function wrapFallback(result) {
  return {
    ...result,
    isAI: false,
    riskFactors: [],
    strengths: [],
    mealScore: result.grade || '--',
    mealVerdict: '',
  };
}
