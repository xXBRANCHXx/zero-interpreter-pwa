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

  try {
    const result = await worker.recognize(canvas.toDataURL('image/png'));
    const text = result.data.text || '';
    const blocks = result.data.blocks || [];
    
    // -- DYNAMIC CALIBRATION ENGINE --
    const axisLabels = [];
    blocks.forEach(block => {
      if (block.paragraphs) {
        block.paragraphs.forEach(p => {
          p.lines.forEach(l => {
            const lineText = l.text.trim();
            const match = lineText.match(/^\b(\d{2,3})\b$/);
            if (match) {
              axisLabels.push({ val: parseInt(match[1]), y: l.bbox.y0 + (l.bbox.y1 - l.bbox.y0)/2 });
            }
          });
        });
      }
    });

    const visualData = analyzeChartPixels(ctx, canvas.width, canvas.height, axisLabels);
    
    await worker.terminate();
    URL.revokeObjectURL(imageUrl);
    return { text, visualData };
  } catch (err) {
    console.error('OCR Error:', err);
    await worker.terminate();
    URL.revokeObjectURL(imageUrl);
    throw err;
  }
}

function analyzeChartPixels(ctx, width, height, axisLabels = []) {
  const data = ctx.getImageData(0, 0, width, height).data;
  const axisX = Math.floor(width * 0.05);
  
  // 1. Precise Grid Reconstruction
  const gridPositions = [];
  for (let y = 10; y < height - 10; y++) {
    const i = (y * width + axisX) * 4;
    const b = (data[i] + data[i+1] + data[i+2]) / 3;
    if (b < 210 && b > 140) {
      let isLine = true;
      for (let x = axisX; x < axisX + 40; x++) {
        const idx = (y * width + x) * 4;
        if ((data[idx] + data[idx+1] + data[idx+2]) / 3 > 230) { isLine = false; break; }
      }
      if (isLine) {
        if (gridPositions.length === 0 || y - gridPositions[gridPositions.length-1] > 8) gridPositions.push(y);
      }
    }
  }

  // 2. DYNAMIC MAPPING Logic
  const yMap = new Array(height).fill(0);
  
  if (axisLabels.length >= 2) {
    const sorted = axisLabels.sort((a,b) => a.y - b.y);
    const p1 = sorted[0];
    const p2 = sorted[sorted.length - 1];
    const unitPerPixel = Math.abs(p1.val - p2.val) / Math.max(1, Math.abs(p1.y - p2.y));
    
    for (let y = 0; y < height; y++) {
      yMap[y] = p1.val - (y - p1.y) * unitPerPixel;
    }
  } else {
    const sorted = gridPositions.sort((a,b) => a - b);
    const interval = sorted.length > 2 ? (sorted[sorted.length-1] - sorted[0]) / (sorted.length - 1) : 40;
    const valPerInterval = 30; 
    const anchorY = sorted[sorted.length - 1] || height;
    const anchorVal = 60; // Assume bottom line is 60 as a conservative baseline
    
    for (let y = 0; y < height; y++) {
      yMap[y] = anchorVal - (y - anchorY) * (valPerInterval / interval);
    }
  }

  // 3. High-Sensitivity Curve Recovery
  const path = [];
  for (let x = Math.floor(width * 0.1); x < Math.floor(width * 0.9); x += 1) {
    let dy = 0, db = 255;
    for (let y = Math.floor(height * 0.1); y < Math.floor(height * 0.9); y++) {
      const i = (y * width + x) * 4;
      const b = (data[i] + data[i+1] + data[i+2]) / 3;
      if (b < db) { db = b; dy = y; }
    }
    if (db < 200) path.push({ x, y: dy, val: yMap[dy] });
  }

  if (path.length < 20) return { peakVal: 0, baselineVal: 0, duration: 0, visualData: {} };

  const peakVal = Math.max(...path.map(p => p.val));
  const peakIdx = path.findIndex(p => p.val === peakVal);
  const allVals = path.map(p => p.val).sort((a,b) => a - b);
  const baseline = allVals[Math.floor(allVals.length * 0.15)] || 95;
  
  const elevationThreshold = baseline + (peakVal - baseline) * 0.25;

  let sIdx = peakIdx;
  while (sIdx > 0 && path[sIdx].val > elevationThreshold) sIdx--;
  
  let eIdx = peakIdx;
  while (eIdx < path.length - 1 && path[eIdx].val > elevationThreshold) eIdx++;

  const pixelDuration = Math.max(30, path[eIdx].x - path[sIdx].x);

  return {
    peakVal, 
    baselineVal: Math.max(60, Math.min(160, baseline)),
    pixelDuration,
    canvasWidth: width,
    canvasHeight: height
  };
}
