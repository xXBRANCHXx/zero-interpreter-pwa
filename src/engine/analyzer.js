const CATEGORIES = {
  HIGH_CARB: ['rice', 'bread', 'pasta', 'sweet', 'candy', 'sugar', 'potato', 'juice', 'flour', 'cereal', 'tortilla', 'cracker', 'chip', 'donut', 'cookie', 'pizza', 'soda'],
  HIGH_PROTEIN: ['chicken', 'beef', 'steak', 'pork', 'fish', 'egg', 'tofu', 'protein', 'meat', 'turkey', 'shrimp', 'salmon', 'whey', 'greek yogurt'],
  HIGH_FIBER: ['broccoli', 'spinach', 'kale', 'salad', 'vegetable', 'veg', 'nut', 'seed', 'bean', 'lentil', 'avocado', 'blueberry', 'raspberry', 'chia', 'flax'],
  STIMULANT: ['coffee', 'tea', 'energy', 'caffeine', 'espresso', 'matcha', 'guarana']
};

export function analyzeCorrelation(foodText, calories, biometrics) {
  const food = foodText.toLowerCase();
  const kcal = parseFloat(calories) || 0;
  
  const biometricsMap = biometrics.reduce((acc, b) => {
    acc[b.id] = parseFloat(b.value);
    return acc;
  }, {});

  const peak = biometricsMap.glucose_peak || biometricsMap.glucose || 0;
  const baseline = biometricsMap.glucose_baseline || 95;
  const duration = biometricsMap.glucose_duration || 0;
  const delta = peak > baseline ? peak - baseline : 0;

  const scores = { carb: 0, protein: 0, fiber: 0, stimulant: 0 };
  Object.keys(CATEGORIES).forEach(category => {
    CATEGORIES[category].forEach(keyword => {
      if (food.includes(keyword)) {
        if (category === 'HIGH_CARB') scores.carb += 1;
        if (category === 'HIGH_PROTEIN') scores.protein += 1;
        if (category === 'HIGH_FIBER') scores.fiber += 1;
        if (category === 'STIMULANT') scores.stimulant += 1;
      }
    });
  });

  const insights = [];
  let healthScore = 100;
  let foodGrade = 'A';
  let gradeLabel = 'OPTIMAL';
  let healthStatus = 'HEALTHY';
  let healthTip = "Your metabolic system processed this remarkably well.";

  const metabolicLoad = delta * (1 + (duration / 120));
  
  if (metabolicLoad < 20) {
    foodGrade = 'S'; gradeLabel = 'EXCELLENT';
  } else if (metabolicLoad < 40) {
    foodGrade = 'A'; gradeLabel = 'VIBRANT';
  } else if (metabolicLoad < 70) {
    foodGrade = 'B'; gradeLabel = 'MODERATE'; healthScore -= 10;
  } else if (metabolicLoad < 110) {
    foodGrade = 'C'; gradeLabel = 'ELEVATED'; healthScore -= 25;
  } else if (metabolicLoad < 160) {
    foodGrade = 'D'; gradeLabel = 'STRAINED'; healthScore -= 40;
  } else {
    foodGrade = 'F'; gradeLabel = 'CRITICAL'; healthScore -= 60;
  }

  if (peak >= 200) {
    healthStatus = 'DIABETIC_RANGE';
    healthTip = "These levels are quite high and may be taxing your system. We recommend discussing this trend with a healthcare professional.";
  } else if (peak >= 140) {
    healthStatus = 'PRE_DIABETIC_RANGE';
    healthTip = "Your body is showing some sensitivity to this meal. Small adjustments in fiber and portion size could help maintain a more stable curve.";
  } else {
    healthStatus = 'HEALTHY_RANGE';
  }

  if (delta > 20) {
    insights.push(`We noticed your glucose increased by ${delta.toFixed(0)}mg/dL from your resting baseline. This took about ${duration} minutes to stabilize.`);
    
    if (duration > 150) {
      healthScore -= 15;
      insights.push(`It seems your body took a little longer than usual—about ${duration} minutes—to bring your levels back to baseline. This can sometimes happen with meals that are higher in fats or heavy in simple carbohydrates.`);
    }

    if (scores.carb > 0 && scores.fiber === 0) {
      healthScore -= 15;
      insights.push(`This meal appears to have lacked fiber. Adding some greens or whole grains next time can act like a 'metabolic speed-bump,' slowing down how quickly sugar enters your bloodstream and preventing those sharper peaks.`);
    }

    if (kcal > 800) {
      healthScore -= 10;
      insights.push(`The total caloric volume was substantial, which can sometimes extend your metabolic recovery time. Consider a light 15-minute walk—it's a gentle way to help your muscles use up that extra glucose.`);
    }
  }

  healthScore = Math.max(0, Math.min(100, healthScore));

  return {
    score: healthScore,
    grade: foodGrade,
    gradeLabel: gradeLabel,
    status: healthStatus,
    duration: duration,
    tip: healthTip,
    insights: insights.length > 0 ? insights.join('\n\n') : "We didn't detect any significant disruptions to your glucose stability. Keep up the great work!"
  };
}
