import { createWorker } from 'tesseract.js';

export async function processImage(file, onProgress) {
  const imageUrl = URL.createObjectURL(file);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const img = new Image();
  await new Promise((resolve) => { img.onload = resolve; img.src = imageUrl; });
  canvas.width = img.width;
  canvas.height = img.height;
  ctx.drawImage(img, 0, 0);
  
  const worker = await createWorker('eng', 1, {
    logger: m => m.status === 'recognizing text' && onProgress(Math.floor(m.progress * 100))
  });

  const result = await worker.recognize(canvas.toDataURL('image/png'));
  const text = result.data.text || '';
  const blocks = result.data.blocks || [];
  
  const axisAnchors = [];
  const timeAnchors = [];
  
  (blocks || []).forEach(block => {
    if (block.paragraphs) {
      block.paragraphs.forEach(p => {
        p.lines.forEach(l => {
          const lineText = l.text.trim();
          
          // 1. Detect Glucose Axis (Y-axis)
          const valStr = lineText.replace(/[^0-9]/g, '');
          const val = parseInt(valStr);
          if (!isNaN(val) && val >= 0 && val <= 500 && lineText.length < 5) {
            axisAnchors.push({ val, y: Math.round(l.bbox.y0 + (l.bbox.y1 - l.bbox.y0)/2) });
          }
          
          // 2. Detect Time Anchors (X-axis) - e.g. 02:25 PM
          const timeMatch = lineText.match(/(\d{1,2}:\d{2})\s*(AM|PM)?/i);
          if (timeMatch) {
            timeAnchors.push({ 
              time: timeMatch[1] + (timeMatch[2] ? ' ' + timeMatch[2].toUpperCase() : ''), 
              x: Math.round(l.bbox.x0 + (l.bbox.x1 - l.bbox.x0)/2)
            });
          }
        });
      });
    }
  });

  const rawVisual = extractRawVisualData(ctx, canvas.width, canvas.height);
  
  await worker.terminate();
  URL.revokeObjectURL(imageUrl);
  
  return { 
    text, 
    visualData: { 
      ...rawVisual, 
      axisAnchors, 
      timeAnchors,
      canvasHeight: canvas.height,
      canvasWidth: canvas.width 
    } 
  };
}

function extractRawVisualData(ctx, width, height) {
  const data = ctx.getImageData(0, 0, width, height).data;
  const path = [];
  for (let x = Math.floor(width * 0.1); x < Math.floor(width * 0.9); x += 2) {
    let dy = 0, db = 255;
    for (let y = Math.floor(height * 0.1); y < Math.floor(height * 0.9); y++) {
      const i = (y * width + x) * 4;
      const b = (data[i] + data[i+1] + data[i+2]) / 3;
      if (b < db) { db = b; dy = y; }
    }
    if (db < 200) path.push({ x, y: dy });
  }

  if (path.length < 10) return { peakY: 0, minY: 0, peakX: 0, pathStartX: 0, pathEndX: 0 };

  const peakY = Math.min(...path.map(p => p.y));
  const minY = Math.max(...path.map(p => p.y));
  const peakX = path.find(p => p.y === peakY).x;

  return { 
    peakY, 
    minY, 
    peakX,
    pathStartX: path[0].x,
    pathEndX: path[path.length - 1].x,
    chartTopY: Math.floor(height * 0.1),
    chartBottomY: Math.floor(height * 0.9)
  };
}
