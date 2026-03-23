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
  // We need to make bright-yellow text black so Tesseract can see it on white
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const brightness = (r + g + b) / 3;
    
    // Detect Yellow/Green text (often for high/normal values)
    const isYellow = (r > 150 && g > 150 && b < 100);
    const isGreen = (g > 150 && r < 150 && b < 150);
    
    if (isYellow || isGreen) {
      // Turn bright text to BLACK for high contrast
      data[i] = data[i+1] = data[i+2] = 0;
    } else if (brightness > 200) {
      // Background to WHITE
      data[i] = data[i+1] = data[i+2] = 255;
    } else {
      // Dark elements to BLACK
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

  // 2. High-Sensitivity Curve Recovery (dot-cluster aware)
  const path = [];
  for (let x = Math.floor(width * 0.1); x < Math.floor(width * 0.9); x += 1) { // 1px scan for precision
    let dy = 0, db = 255;
    for (let y = Math.floor(height * 0.1); y < Math.floor(height * 0.9); y++) {
      const i = (y * width + x) * 4;
      const b = (data[i] + data[i+1] + data[i+2]) / 3;
      if (b < db) { db = b; dy = y; }
    }
    // High sensitivity (195) to catch faint Libreview dots
    if (db < 195) path.push({ x, y: dy, val: yMap[dy] });
  }

  if (path.length < 20) return { peakVal: 0, baselineVal: 0, duration: 0 };

  // 3. 4-CYCLE ITERATIVE CONVERGENCE ENGINE
  let currentBaseline = 90;
  let sIdx = 0, eIdx = path.length - 1;
  const peakVal = Math.max(...path.map(p => p.val));
  const peakIdx = path.findIndex(p => p.val === peakVal);

  for (let cycle = 0; cycle < 4; cycle++) {
    // A. Re-calculate Spike Window based on current baseline + adaptive tolerance
    const delta = peakVal - currentBaseline;
    const tolerance = Math.max(5, delta * 0.15); // 15% of spike height or 5mg/dL
    const threshold = currentBaseline + tolerance; 
    
    let s = peakIdx;
    while (s > 0 && path[s].val > threshold) s--;
    sIdx = s;

    let e = peakIdx;
    while (e < path.length - 1 && path[e].val > threshold) e++;
    eIdx = e;

    // B. Re-isolate Resting Zone (Pre-Spike ONLY)
    // We look at data before the climb started
    const preSpike = path.slice(Math.max(0, sIdx - 200), Math.max(0, sIdx - 5));
    if (preSpike.length > 30) {
      const vals = preSpike.map(p => p.val).sort((a,b) => a - b);
      currentBaseline = vals[Math.floor(vals.length / 2)];
    } else {
      // Fallback: If no pre-data, use post-data stable period
      const tailData = path.slice(eIdx + 30).map(p => p.val).sort((a,b) => a-b);
      if (tailData.length > 30) currentBaseline = tailData[Math.floor(tailData.length/2)];
    }
  }

  const pixelDuration = Math.max(0, path[eIdx].x - path[sIdx].x);

  return {
    peakVal, 
    baselineVal: Math.max(65, Math.min(145, currentBaseline)),
    pixelDuration,
    canvasWidth: width,
    canvasHeight: height
  };
}
