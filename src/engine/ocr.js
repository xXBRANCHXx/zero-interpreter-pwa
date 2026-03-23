import { createWorker } from 'tesseract.js';

export async function processImage(file, onProgress) {
  const imageUrl = URL.createObjectURL(file);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  
  const img = new Image();
  await new Promise((resolve) => {
    img.onload = resolve;
    img.src = imageUrl;
  });

  canvas.width = img.width;
  canvas.height = img.height;
  ctx.drawImage(img, 0, 0);
  
  // -- COMPUTER VISION ENGINE (No-AI Pixel Scan) --
  const visualData = analyzeChartPixels(ctx, canvas.width, canvas.height);
  
  // -- ADVANCED PRE-PROCESSING FOR OCR --
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const brightness = (r + g + b) / 3;
    const isYellow = (r > 150 && g > 150 && b < 100);
    const isGreen = (g > 150 && r < 150 && b < 150);
    
    if (isYellow || isGreen) {
      data[i] = data[i+1] = data[i+2] = 0;
    } else if (brightness > 200) {
      data[i] = data[i+1] = data[i+2] = 255;
    } else {
      data[i] = data[i+1] = data[i+2] = 0;
    }
  }
  ctx.putImageData(imageData, 0, 0);

  const worker = await createWorker('eng', 1, {
    logger: m => m.status === 'recognizing text' && onProgress(Math.floor(m.progress * 100))
  });

  const { data: { text } } = await worker.recognize(canvas.toDataURL('image/png'));
  await worker.terminate();
  URL.revokeObjectURL(imageUrl);
  
  return { text, visualData };
}

function analyzeChartPixels(ctx, width, height) {
  const data = ctx.getImageData(0, 0, width, height).data;
  const axisX = Math.floor(width * 0.05);
  
  // 1. Precise Grid Reconstruction
  const gridPositions = [];
  for (let y = 10; y < height - 10; y++) {
    const i = (y * width + axisX) * 4;
    const b = (data[i] + data[i+1] + data[i+2]) / 3;
    if (b < 225 && b > 140) {
      let isLine = true;
      for (let x = axisX; x < axisX + 40; x++) {
        const idx = (y * width + x) * 4;
        if ((data[idx] + data[idx+1] + data[idx+2]) / 3 > 235) { isLine = false; break; }
      }
      if (isLine) {
        if (gridPositions.length === 0 || y - gridPositions[gridPositions.length-1] > 10) gridPositions.push(y);
      }
    }
  }

  const yMap = new Array(height).fill(0);
  if (gridPositions.length >= 2) {
    const sorted = gridPositions.sort((a,b) => a - b);
    let topVal = 150; 
    if (sorted.length >= 7) topVal = 180;
    else if (sorted.length <= 4) topVal = 120;

    for (let y = 0; y < height; y++) {
      for (let g = 0; g < sorted.length - 1; g++) {
        if (y >= sorted[g] && y <= sorted[g+1]) {
          const t = (y - sorted[g]) / (sorted[g+1] - sorted[g]);
          yMap[y] = (topVal - g * 30) - (t * 30);
          break;
        }
      }
      if (y < sorted[0]) yMap[y] = topVal + ((sorted[0] - y) / (sorted[1] - sorted[0])) * 30;
      if (y > sorted[sorted.length-1]) yMap[y] = (topVal - (sorted.length-1)*30) - ((y - sorted[sorted.length-1]) / (sorted[1] - sorted[0])) * 30;
    }
  }

  // 2. High-Sensitivity Curve Recovery
  const path = [];
  for (let x = Math.floor(width * 0.1); x < Math.floor(width * 0.9); x += 1) {
    let dy = 0, db = 255;
    for (let y = Math.floor(height * 0.1); y < Math.floor(height * 0.9); y++) {
      const i = (y * width + x) * 4;
      const b = (data[i] + data[i+1] + data[i+2]) / 3;
      if (b < db) { db = b; dy = y; }
    }
    if (db < 195) path.push({ x, y: dy, val: yMap[dy] });
  }

  if (path.length < 20) return { peakVal: 0, baselineVal: 0, duration: 0 };

  // 3. ROBUST SPIKE BOUNDARY DETECTION (NEW LOGIC)
  const peakVal = Math.max(...path.map(p => p.val));
  const peakIdx = path.findIndex(p => p.val === peakVal);
  
  // Find baseline using the most stable 20% of the PRE-spike data
  const prePeak = path.slice(0, peakIdx);
  let baseline = 95;
  if (prePeak.length > 50) {
    const sortedPre = prePeak.map(p => p.val).sort((a,b) => a - b);
    baseline = sortedPre[Math.floor(sortedPre.length * 0.25)]; // 25th percentile for stable baseline
  }

  const elevationThreshold = baseline + (peakVal - baseline) * 0.2; // 20% elevation threshold
  
  // Hunt for the Start (S) and End (E) of the hump
  let sIdx = peakIdx;
  while (sIdx > 0 && path[sIdx].val > elevationThreshold) sIdx--;
  
  let eIdx = peakIdx;
  while (eIdx < path.length - 1 && path[eIdx].val > elevationThreshold) eIdx++;

  // Fallback: If elevation search failed, hunt for inflection points (slope change)
  if (eIdx === peakIdx || sIdx === peakIdx) {
    // Basic pixel diff fallback
    sIdx = Math.max(0, peakIdx - 100);
    eIdx = Math.min(path.length - 1, peakIdx + 100);
  }

  const pixelDuration = Math.max(20, path[eIdx].x - path[sIdx].x); // Min 20px if peak exists

  return {
    peakVal, 
    baselineVal: Math.max(65, Math.min(145, baseline)),
    pixelDuration,
    canvasWidth: width,
    canvasHeight: height
  };
}
