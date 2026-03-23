import './style.css';
import { processImage } from './engine/ocr.js';
import { parseHealthData } from './engine/parser.js';
import { analyzeWithAI } from './engine/ai-analyzer.js';

// DOM Elements
const elements = {
  chartInput: document.getElementById('chartInput'),
  dropZone: document.getElementById('dropZone'),
  statusOutput: document.getElementById('statusOutput'),
  progressBar: document.getElementById('progressBar'),
  biometricsList: document.getElementById('biometricsList'),
  insightContent: document.getElementById('insightContent'),
  healthScore: document.getElementById('healthScore'),
  healthTip: document.getElementById('healthTip'),
  foodGrade: document.getElementById('foodGrade'),
  foodInput: document.getElementById('foodInput'),
  caloriesInput: document.getElementById('caloriesInput'),
  notesInput: document.getElementById('notesInput'),
  analyzeBtn: document.getElementById('analyzeBtn'),
  resetBtn: document.getElementById('resetBtn'),
  // New AI elements
  mealScore: document.getElementById('mealScore'),
  mealVerdict: document.getElementById('mealVerdict'),
  riskList: document.getElementById('riskList'),
  strengthList: document.getElementById('strengthList'),
  aiIndicator: document.getElementById('aiIndicator'),
  // Summary & Recs
  analysisSummary: document.getElementById('analysisSummary'),
  recommendationsList: document.getElementById('recommendationsList'),
  // Sections
  hero: document.getElementById('hero'),
  processing: document.getElementById('processing'),
  questions: document.getElementById('questions'),
  results: document.getElementById('results'),
};

let currentBiometrics = [];

// Event Handlers
elements.chartInput.onchange = (e) => handleFileUpload(e.target.files[0]);

elements.dropZone.ondragover = (e) => {
  e.preventDefault();
  elements.dropZone.classList.add('active');
};
elements.dropZone.ondragleave = () => {
  elements.dropZone.classList.remove('active');
};
elements.dropZone.ondrop = (e) => {
  e.preventDefault();
  elements.dropZone.classList.remove('active');
  handleFileUpload(e.dataTransfer.files[0]);
};

elements.analyzeBtn.onclick = () => renderResults();
elements.resetBtn.onclick = () => resetApp();

async function handleFileUpload(file) {
  if (!file) return;

  showSection('processing');
  elements.statusOutput.textContent = 'INIT_BIO_CALIBRATION...';
  elements.progressBar.style.width = '10%';
  
  await new Promise(r => setTimeout(r, 800));

  try {
    elements.statusOutput.textContent = 'MAPPING_PIXEL_GEOMETRY...';
    const rawData = await processImage(file, (progress) => {
      elements.progressBar.style.width = `${10 + (progress * 0.7)}%`;
    });

    elements.statusOutput.textContent = 'EXTRACTING_AXIS_ANCHORS...';
    await new Promise(r => setTimeout(r, 600));

    currentBiometrics = parseHealthData(rawData.text, rawData.visualData);
    
    // UI Update: Biometrics list
    elements.biometricsList.innerHTML = currentBiometrics.map(b => `
      <div class="data-row">
        <span class="data-key">${b.label}</span>
        <span class="data-value">${b.value}</span>
      </div>
    `).join('') || '<div class="data-item">No biometric paths found.</div>';

    showSection('questions');
  } catch (err) {
    elements.statusOutput.textContent = 'SCAN_ERROR: ' + err.message;
    console.error(err);
  }
}

async function renderResults() {
  const food = elements.foodInput.value;
  const calories = elements.caloriesInput.value;
  const notes = elements.notesInput.value;

  showSection('processing');
  elements.statusOutput.textContent = 'CONNECTING_TO_AI_ENGINE...';
  elements.progressBar.style.width = '30%';
  await new Promise(r => setTimeout(r, 400));

  elements.statusOutput.textContent = 'AI_ANALYZING_METABOLIC_RESPONSE...';
  elements.progressBar.style.width = '60%';

  try {
    const analysis = await analyzeWithAI(food, calories, currentBiometrics, notes);

    elements.progressBar.style.width = '100%';
    elements.statusOutput.textContent = 'RENDERING_REPORT...';
    await new Promise(r => setTimeout(r, 300));

    // Summary Title Update
    if (elements.analysisSummary) elements.analysisSummary.textContent = analysis.summary || '--';

    // Core Result Update
    elements.healthScore.textContent = analysis.score;
    elements.foodGrade.textContent = analysis.grade;
    elements.healthTip.textContent = analysis.tip;
    
    const statusElement = document.getElementById('healthStatus');
    const gradeLabelElement = document.getElementById('gradeLabel');
    const durationElement = document.getElementById('spikeDuration');
    
    statusElement.textContent = analysis.status.replace(/_/g, ' ');
    gradeLabelElement.textContent = analysis.gradeLabel;
    durationElement.textContent = analysis.duration;

    // Dynamic Coloring
    const scoreColor = analysis.score > 80 ? '#4ecca3' : analysis.score > 50 ? '#ffcc00' : '#ff5e62';
    elements.healthScore.style.color = scoreColor;
    
    const gradeColor = ['S','A'].includes(analysis.grade) ? '#4ecca3' : analysis.grade === 'B' ? '#ffcc00' : '#ff5e62';
    elements.foodGrade.style.color = gradeColor;
    statusElement.style.background = gradeColor;

    elements.insightContent.innerText = analysis.insights;

    // Recommendations List
    if (elements.recommendationsList && analysis.recommendations?.length > 0) {
      elements.recommendationsList.innerHTML = analysis.recommendations
        .map(r => `<div class="recommendation-item">${r}</div>`)
        .join('');
    } else {
      elements.recommendationsList.innerHTML = '';
    }

    // New AI fields
    if (elements.mealScore) {
      elements.mealScore.textContent = analysis.mealScore || '--';
      elements.mealScore.style.color = gradeColor;
    }
    if (elements.mealVerdict) {
      elements.mealVerdict.textContent = analysis.mealVerdict || '';
    }

    // Risk Factors
    if (elements.riskList && analysis.riskFactors?.length > 0) {
      elements.riskList.innerHTML = analysis.riskFactors
        .map(r => `<span class="tag tag-risk">${r}</span>`)
        .join('');
    } else if (elements.riskList) {
      elements.riskList.innerHTML = '<span class="tag tag-success">NO_SIGNIFICANT_RISKS</span>';
    }

    // Strengths
    if (elements.strengthList && analysis.strengths?.length > 0) {
      elements.strengthList.innerHTML = analysis.strengths
        .map(s => `<span class="tag tag-success">${s}</span>`)
        .join('');
    } else if (elements.strengthList) {
      elements.strengthList.innerHTML = '<span class="tag tag-neutral">NO_DATA</span>';
    }

    // AI indicator badge
    if (elements.aiIndicator) {
      if (analysis.isAI) {
        elements.aiIndicator.classList.remove('hidden');
      } else {
        elements.aiIndicator.classList.add('hidden');
      }
    }

    showSection('results');
  } catch (err) {
    elements.statusOutput.textContent = 'ANALYSIS_ERROR: ' + err.message;
    console.error(err);
  }
}

function showSection(sectionId) {
  ['hero', 'processing', 'questions', 'results'].forEach(id => {
    elements[id].classList.add('hidden');
  });
  elements[sectionId].classList.remove('hidden');
  elements[sectionId].classList.add('fade-in');
}

function resetApp() {
  elements.chartInput.value = '';
  elements.foodInput.value = '';
  elements.caloriesInput.value = '';
  elements.notesInput.value = '';
  currentBiometrics = [];
  elements.healthScore.textContent = '--';
  elements.foodGrade.textContent = '--';
  elements.healthTip.textContent = 'Scanning for insights...';
  if (elements.mealScore) elements.mealScore.textContent = '--';
  if (elements.riskList) elements.riskList.innerHTML = '<span class="tag tag-neutral">AWAITING_ANALYSIS</span>';
  if (elements.aiIndicator) elements.aiIndicator.classList.add('hidden');
  if (elements.recommendationsList) elements.recommendationsList.innerHTML = '';
  if (elements.analysisSummary) elements.analysisSummary.textContent = 'Scanning for insights...';
  showSection('hero');
}

if (import.meta.hot) {
  import.meta.hot.accept();
}
