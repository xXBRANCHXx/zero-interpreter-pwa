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
  
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const brightness = (r + g + b) / 3;
    const isYellow = (r > 150 && g > 150 && b < 100);
    const isGreen = (g > 150 && r < 150 && b < 150);
    if (isYellow || isGreen) { data[i] = data[i+1] = data[i+2] = 0; }
    else if (brightness > 200) { data[i] = data[i+1] = data[i+2] = 255; }
    else { data[i] = data[i+1] = data[i+2] = 0; }
  }
  ctx.putImageData(imageData, 0, 0);

  const worker = await createWorker('eng', 1, {
    logger: m => m.status === 'recognizing text' && onProgress(Math.floor(m.progress * 100))
  });

  try {
    const result = await worker.recognize(canvas.toDataURL('image/png'));
    const text = result.data.text || '';
    const blocks = result.data.blocks || [];
    
    const axisLabels = [];
    const saneValues = [0, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150, 160, 180, 200, 220, 250, 300, 350, 400];
    
    blocks.forEach(block => {
      if (block.paragraphs) {
        block.paragraphs.forEach(p => {
          p.lines.forEach(l => {
            const lineText = l.text.trim().replace(/[^0-9]/g, '');
            const val = parseInt(lineText);
            if (!isNaN(val) && saneValues.includes(val)) {
              axisLabels.push({ val, y: l.bbox.y0 + (l.bbox.y1 - l.bbox.y0)/2 });
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
    await worker.terminate();
    URL.revokeObjectURL(imageUrl);
    throw err;
  }
}

function analyzeChartPixels(ctx, width, height, axisLabels = []) {
  const data = ctx.getImageData(0, 0, width, height).data;
  const axisX = Math.floor(width * 0.05);
  
  const gridPositions = [];
  for (let y = 10; y < height - 10; y++) {
    const i = (y * width + axisX) * 4;
    if ((data[i] + data[i+1] + data[i+2]) / 3 < 200) {
      let isLine = true;
      for (let x = axisX; x < axisX + 30; x++) {
        const idx = (y * width + x) * 4;
        if ((data[idx] + data[idx+1] + data[idx+2]) / 3 > 220) { isLine = false; break; }
      }
      if (isLine) {
        if (gridPositions.length === 0 || y - gridPositions[gridPositions.length-1] > 10) gridPositions.push(y);
      }
    }
  }

  const yMap = new Array(height).fill(0);
  let calibrated = false;
  
  // Only trust axis labels if we have at least 2 distinct values with enough distance
  if (axisLabels.length >= 2) {
    const sorted = axisLabels.sort((a,b) => a.y - b.y);
    const p1 = sorted[0];
    const p2 = sorted[sorted.length - 1];
    if (Math.abs(p1.val - p2.val) > 20 && Math.abs(p1.y - p2.y) > 50) {
      const unitPerPixel = (p2.val - p1.val) / (p2.y - p1.y);
      for (let y = 0; y < height; y++) {
        yMap[y] = Math.max(0, p1.val + (y - p1.y) * unitPerPixel);
      }
      calibrated = true;
    }
  }

  if (!calibrated) {
    const sorted = gridPositions.sort((a,b) => a - b);
    const interval = sorted.length > 2 ? (sorted[sorted.length-1] - sorted[0]) / (sorted.length - 1) : 40;
    const valPerInterval = 30;
    const anchorY = sorted[sorted.length - 1] || height;
    const anchorVal = 60; 
    for (let y = 0; y < height; y++) {
      yMap[y] = Math.max(0, anchorVal - (y - anchorY) * (valPerInterval / interval));
    }
  }

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

  if (path.length < 20) return { peakVal: 0, baselineVal: 0, duration: 0 };

  const peakVal = Math.max(...path.map(p => p.val));
  const peakIdx = path.findIndex(p => p.val === peakVal);
  const allVals = path.map(p => p.val).sort((a,b) => a - b);
  const baseline = allVals[Math.floor(allVals.length * 0.15)] || 95;
  
  const elevationThreshold = baseline + (peakVal - baseline) * 0.20;

  let sIdx = peakIdx;
  while (sIdx > 0 && path[sIdx].val > elevationThreshold) sIdx--;
  let eIdx = peakIdx;
  while (eIdx < path.length - 1 && path[eIdx].val > elevationThreshold) eIdx++;

  const pixelDuration = Math.max(40, path[eIdx].x - path[sIdx].x);

  return { peakVal, baselineVal: Math.max(65, Math.min(150, baseline)), pixelDuration, canvasWidth: width, canvasHeight: height };
}
