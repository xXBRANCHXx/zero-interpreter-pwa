const PATTERNS = [
  {
    key: 'glucose',
    regex: /(?:glucose|giug0se|gluco|sugar)\s*:?\s*(\d+(?:\.\d+)?)\s*(?:mg\/dl|mmol\/l|mg)?/i,
    label: 'GLUCOSE_LEVEL'
  },
  {
    key: 'blood_pressure',
    regex: /(?:bp|blood pressure|sys\/dia)\s*:?\s*(\d{2,3})\/(\d{2,3})\s*(?:mmhg)?/i,
    label: 'BLOOD_PRESSURE'
  },
  {
    key: 'heart_rate',
    regex: /(?:hr|pulse|heart rate|bpm)\s*:?\s*(\d{2,3})\s*(?:bpm)?/i,
    label: 'HEART_RATE'
  },
  {
    key: 'weight',
    regex: /(?:weight|wt|mass)\s*:?\s*(\d+(?:\.\d+)?)\s*(?:kg|lbs)?/i,
    label: 'BODY_WEIGHT'
  },
  {
    key: 'timestamp',
    regex: /(\d{1,2}[:/.-]\d{1,2}[:/.-]\d{2,4}(?:\s+\d{1,2}:\d{2}(?::\d{2})?\s*(?:am|pm)?)?)/i,
    label: 'DATA_TIMESTAMP'
  }
];

export function parseHealthData(text, visual = {}) {
  const results = [];
  
  // 1. Spatially Aware OCR with Noise Filtering
  const lines = text.split('\n');
  const candidates = [];
  lines.slice(0, Math.floor(lines.length * 0.3)).forEach(line => {
    // Look for numbers in the header, excluding common axis/time formats
    const match = line.match(/\b(\d{2,3})\b/);
    if (match) {
      const val = parseInt(match[1]);
      // Heuristic: Axis labels are usually exactly 0, 30, 60, 90, 120, 150, 180
      const isAxis = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300].includes(val);
      if (!isAxis || line.length < 5) candidates.push(val);
    }
  });

  const geoPeak = visual.peakVal || 120;
  const geoBase = visual.baselineVal || 95;
  const geoDelta = Math.max(2, geoPeak - geoBase);

  // 2. Truth Calibration
  let peakValue = geoPeak;
  if (candidates.length > 0) {
    // Prefer header text if it's within a sane range of the visual curve
    peakValue = candidates.find(c => Math.abs(c - geoPeak) < 30) || candidates[0];
  }

  const finalBaseline = peakValue - geoDelta;

  // 3. Time Domain scaling
  // Standard CGM views usually span 3, 6, or 12 hours. 
  // We'll use a dynamic density estimate.
  const minsPerPixel = (visual.canvasWidth < 1000) ? 0.45 : 0.35;
  const durationMins = Math.round(visual.pixelDuration * minsPerPixel);

  if (peakValue > 0) {
    results.push({ id: 'glucose_peak', label: 'Peak Reading', value: Math.round(peakValue).toString() + ' mg/dL' });
    results.push({ id: 'glucose_baseline', label: 'Resting Baseline', value: Math.round(finalBaseline).toString() + ' mg/dL' });
    results.push({ id: 'glucose_duration', label: 'Elevation Time', value: durationMins.toString() + ' min' });
  }

  // Preserve other biometrics (BP, HR, etc)
  for (const pattern of PATTERNS) {
    if (pattern.key === 'glucose') continue;
    const match = text.match(pattern.regex);
    if (match) {
      results.push({
        id: pattern.key,
        label: pattern.label,
        value: match[1] + (match[2] ? '/' + match[2] : ''),
        raw: match[0]
      });
    }
  }

  return results;
}
