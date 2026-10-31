/* Family Health Tracker lab report reader — finds common blood test values in a report photo or PDF,
   on the device, and explains them. © 2026 Asrar Ahmed Junedi. All rights reserved. */
'use strict';

const BPLab = (() => {
  const base = new URL('lib/lab/', document.baseURI).href;
  const loaded = {};
  function loadScript(src) {
    if (!loaded[src]) loaded[src] = new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => { delete loaded[src]; rej(new Error('Could not load the report reader')); }; document.head.appendChild(s); });
    return loaded[src];
  }

  /* ---------------- tests, reference ranges and advice
     ranges: [upper bound, flag, label] — the first bound the value is below decides the result */
  const INF = Infinity;
  const T = [
    { key: 'creat', name: 'Creatinine', re: /\b(?:s(?:erum)?\.?\s*)?creat(?:inine|\.)?\b/i, not: /urine|clearance|ratio|kinase|\bcpk\b|\bck\b|albumin/i,
      units: { 'mg/dL': { r: [[0.6, 'low', 'Low'], [1.3, 'normal', 'Normal'], [INF, 'high', 'High']], ok: [0.1, 20] }, 'µmol/L': { r: [[53, 'low', 'Low'], [115, 'normal', 'Normal'], [INF, 'high', 'High']], ok: [10, 1800] } },
      guess: v => (v > 20 ? 'µmol/L' : 'mg/dL'), group: 'Kidney' },
    { key: 'egfr', name: 'eGFR (kidney filtering)', re: /\be\s*-?\s*gfr\b|estimated\s+(?:glomerular|gfr)/i, not: null,
      units: { 'mL/min/1.73m²': { r: [[15, 'high', 'Very low'], [60, 'low', 'Reduced'], [90, 'borderline', 'Mildly reduced'], [INF, 'normal', 'Normal']], ok: [2, 200] } }, guess: () => 'mL/min/1.73m²', group: 'Kidney', lowIsBad: true },
    { key: 'bun', name: 'Urea nitrogen (BUN)', re: /\bbun\b|urea\s+nitrogen/i, not: /ratio/i,
      units: { 'mg/dL': { r: [[7, 'low', 'Low'], [21, 'normal', 'Normal'], [INF, 'high', 'High']], ok: [1, 200] } }, guess: () => 'mg/dL', group: 'Kidney' },
    { key: 'urea', name: 'Urea', re: /\b(?:blood\s+|serum\s+)?urea\b/i, not: /nitrogen|\bbun\b|ratio|urine/i,
      units: { 'mmol/L': { r: [[2.5, 'low', 'Low'], [7.8, 'normal', 'Normal'], [INF, 'high', 'High']], ok: [0.5, 60] }, 'mg/dL': { r: [[15, 'low', 'Low'], [45, 'normal', 'Normal'], [INF, 'high', 'High']], ok: [3, 400] } },
      guess: v => (v < 30 ? 'mmol/L' : 'mg/dL'), group: 'Kidney' },
    { key: 'k', name: 'Potassium', re: /\bpotassium\b|^\s*k\s*\+?\s*(?=[:\-\s]*\d)/i, not: /urine/i,
      units: { 'mmol/L': { r: [[3.5, 'low', 'Low'], [5.2, 'normal', 'Normal'], [6.0, 'high', 'High'], [INF, 'high', 'Very high']], ok: [1.5, 9.5] } }, guess: () => 'mmol/L', group: 'Salts' },
    { key: 'na', name: 'Sodium', re: /\bsodium\b|^\s*na\s*\+?\s*(?=[:\-\s]*\d)/i, not: /urine/i,
      units: { 'mmol/L': { r: [[135, 'low', 'Low'], [146, 'normal', 'Normal'], [INF, 'high', 'High']], ok: [100, 185] } }, guess: () => 'mmol/L', group: 'Salts' },
    { key: 'fbs', name: 'Fasting blood sugar', re: /fasting\s+(?:blood\s+|plasma\s+)?(?:glucose|sugar)|\bf\.?\s?b\.?\s?s\b|\bfbg\b|\bfpg\b|glucose\s*[,(\-]?\s*fasting/i, not: /urine/i,
      units: { 'mg/dL': { r: [[70, 'low', 'Low'], [100, 'normal', 'Normal'], [126, 'borderline', 'Prediabetes range'], [INF, 'high', 'Diabetes range']], ok: [20, 700] }, 'mmol/L': { r: [[3.9, 'low', 'Low'], [5.6, 'normal', 'Normal'], [7.0, 'borderline', 'Prediabetes range'], [INF, 'high', 'Diabetes range']], ok: [1, 40] } },
      guess: v => (v < 35 ? 'mmol/L' : 'mg/dL'), group: 'Sugar' },
    { key: 'glu', name: 'Blood sugar (random)', re: /random\s+(?:blood\s+)?(?:glucose|sugar)|\brbs\b|\bglucose\b|blood\s+sugar/i, not: /fasting|\bfbs\b|urine|hba1c|a1c|glycated|tolerance|post/i,
      units: { 'mg/dL': { r: [[70, 'low', 'Low'], [140, 'normal', 'Normal'], [200, 'borderline', 'Raised'], [INF, 'high', 'High']], ok: [20, 900] }, 'mmol/L': { r: [[3.9, 'low', 'Low'], [7.8, 'normal', 'Normal'], [11.1, 'borderline', 'Raised'], [INF, 'high', 'High']], ok: [1, 50] } },
      guess: v => (v < 35 ? 'mmol/L' : 'mg/dL'), group: 'Sugar' },
    { key: 'a1c', name: 'HbA1c (3-month sugar)', re: /\bh\s*b\s*a\s*[1il|]\s*c\b|\bhba[1il]c|\ba[1il]c\b|glyc(?:at|osyl)ated\s+ha?emoglobin/i, not: null,
      units: { '%': { r: [[5.7, 'normal', 'Normal'], [6.5, 'borderline', 'Prediabetes range'], [INF, 'high', 'Diabetes range']], ok: [3, 20] }, 'mmol/mol': { r: [[39, 'normal', 'Normal'], [48, 'borderline', 'Prediabetes range'], [INF, 'high', 'Diabetes range']], ok: [15, 200] } },
      guess: v => (v > 20 ? 'mmol/mol' : '%'), group: 'Sugar' },
    { key: 'chol', name: 'Total cholesterol', re: /\b(?:total\s+|serum\s+)?cholesterol\b|\bt\.?\s?chol\b/i, not: /\bhdl\b|\bldl\b|vldl|non[\s-]?hdl|ratio|high[\s-]density|low[\s-]density/i,
      units: { 'mg/dL': { r: [[200, 'normal', 'Desirable'], [240, 'borderline', 'Borderline high'], [INF, 'high', 'High']], ok: [50, 800] }, 'mmol/L': { r: [[5.2, 'normal', 'Desirable'], [6.2, 'borderline', 'Borderline high'], [INF, 'high', 'High']], ok: [1.3, 20] } },
      guess: v => (v < 20 ? 'mmol/L' : 'mg/dL'), group: 'Cholesterol' },
    { key: 'ldl', name: 'LDL ("bad") cholesterol', re: /\bldl\b|low[\s-]density/i, not: /vldl|ratio|\bhdl\b.*\bldl\b.*ratio/i,
      units: { 'mg/dL': { r: [[100, 'normal', 'Optimal'], [160, 'borderline', 'Above target'], [INF, 'high', 'High']], ok: [10, 600] }, 'mmol/L': { r: [[2.6, 'normal', 'Optimal'], [4.1, 'borderline', 'Above target'], [INF, 'high', 'High']], ok: [0.3, 15] } },
      guess: v => (v < 15 ? 'mmol/L' : 'mg/dL'), group: 'Cholesterol' },
    { key: 'hdl', name: 'HDL ("good") cholesterol', re: /\bhdl\b|high[\s-]density/i, not: /ratio|non[\s-]?hdl|\bldl\b/i,
      units: { 'mg/dL': { r: [[40, 'low', 'Low'], [INF, 'normal', 'Good']], ok: [5, 200] }, 'mmol/L': { r: [[1.0, 'low', 'Low'], [INF, 'normal', 'Good']], ok: [0.1, 5] } },
      guess: v => (v < 5 ? 'mmol/L' : 'mg/dL'), group: 'Cholesterol', lowIsBad: true },
    { key: 'tg', name: 'Triglycerides', re: /\btriglycerides?\b|\btrig\b|\btg\b/i, not: /ratio/i,
      units: { 'mg/dL': { r: [[150, 'normal', 'Normal'], [200, 'borderline', 'Borderline high'], [INF, 'high', 'High']], ok: [10, 5000] }, 'mmol/L': { r: [[1.7, 'normal', 'Normal'], [2.3, 'borderline', 'Borderline high'], [INF, 'high', 'High']], ok: [0.1, 60] } },
      guess: v => (v < 15 ? 'mmol/L' : 'mg/dL'), group: 'Cholesterol' },
    { key: 'uric', name: 'Uric acid', re: /\buric\s+acid\b|\burate\b/i, not: /urine/i,
      units: { 'mg/dL': { r: [[3.5, 'low', 'Low'], [7.2, 'normal', 'Normal'], [INF, 'high', 'High']], ok: [0.5, 25] }, 'µmol/L': { r: [[200, 'low', 'Low'], [430, 'normal', 'Normal'], [INF, 'high', 'High']], ok: [30, 1500] } },
      guess: v => (v > 30 ? 'µmol/L' : 'mg/dL'), group: 'Other' },
    { key: 'hb', name: 'Haemoglobin', re: /\bha?emoglobin\b|\bhgb\b|^\s*hb\b/i, not: /a1c|glyc|mean|\bmch|corpuscular|urine|electrophoresis/i,
      units: { 'g/dL': { r: [[12, 'low', 'Low'], [17.5, 'normal', 'Normal'], [INF, 'high', 'High']], ok: [3, 25] }, 'g/L': { r: [[120, 'low', 'Low'], [175, 'normal', 'Normal'], [INF, 'high', 'High']], ok: [30, 250] } },
      guess: v => (v > 30 ? 'g/L' : 'g/dL'), group: 'Blood count' },
    { key: 'alt', name: 'ALT (liver)', re: /\balt\b|\bsgpt\b|alanine\s+(?:amino\s*)?transferase/i, not: null,
      units: { 'U/L': { r: [[56, 'normal', 'Normal'], [INF, 'high', 'High']], ok: [1, 5000] } }, guess: () => 'U/L', group: 'Liver' },
    { key: 'ast', name: 'AST (liver)', re: /\bast\b|\bsgot\b|aspartate\s+(?:amino\s*)?transferase/i, not: null,
      units: { 'U/L': { r: [[40, 'normal', 'Normal'], [INF, 'high', 'High']], ok: [1, 5000] } }, guess: () => 'U/L', group: 'Liver' },
    { key: 'tsh', name: 'TSH (thyroid)', re: /\btsh\b|thyroid\s+stimulating/i, not: null,
      units: { 'mIU/L': { r: [[0.4, 'low', 'Low'], [4.5, 'normal', 'Normal'], [INF, 'high', 'High']], ok: [0.005, 150] } }, guess: () => 'mIU/L', group: 'Thyroid' },
    { key: 'ft4', name: 'Free T4', re: /\bf\.?\s*t\s*-?\s*4\b|free\s*t\s*4|free\s+thyroxine/i, not: /total/i,
      units: { 'ng/dL': { r: [[0.8, 'low', 'Low'], [1.8, 'normal', 'Normal'], [INF, 'high', 'High']], ok: [0.1, 8] }, 'pmol/L': { r: [[10, 'low', 'Low'], [23, 'normal', 'Normal'], [INF, 'high', 'High']], ok: [1, 100] } },
      guess: v => (v > 8 ? 'pmol/L' : 'ng/dL'), group: 'Thyroid' },
    { key: 'ft3', name: 'Free T3', re: /\bf\.?\s*t\s*-?\s*3\b|free\s*t\s*3|free\s+triiodothyronine/i, not: /total|reverse/i,
      units: { 'pg/mL': { r: [[2.3, 'low', 'Low'], [4.2, 'normal', 'Normal'], [INF, 'high', 'High']], ok: [0.5, 30] }, 'pmol/L': { r: [[3.5, 'low', 'Low'], [6.5, 'normal', 'Normal'], [INF, 'high', 'High']], ok: [0.5, 40] } },
      guess: v => (v > 3 && v < 12 ? 'pmol/L' : 'pg/mL'), group: 'Thyroid' },
    { key: 'vitd', name: 'Vitamin D', re: /vitamin\s*d\s*(?:3|total)?|\b25\s*[-(]?\s*(?:oh|hydroxy)\)?\s*(?:vitamin\s*)?d?\s*3?/i, not: null,
      units: { 'ng/mL': { r: [[20, 'low', 'Deficient'], [30, 'borderline', 'Insufficient'], [100, 'normal', 'Normal'], [INF, 'high', 'High']], ok: [2, 200] }, 'nmol/L': { r: [[50, 'low', 'Deficient'], [75, 'borderline', 'Insufficient'], [250, 'normal', 'Normal'], [INF, 'high', 'High']], ok: [5, 500] } },
      guess: () => 'ng/mL', group: 'Other' },
    { key: 'acr', name: 'Urine albumin/creatinine (ACR)', re: /albumin\s*\/?\s*creatinine|\bacr\b|micro\s*albumin/i, not: null,
      units: { 'mg/g': { r: [[30, 'normal', 'Normal'], [300, 'high', 'Raised'], [INF, 'high', 'Very raised']], ok: [0, 5000] }, 'mg/mmol': { r: [[3, 'normal', 'Normal'], [30, 'high', 'Raised'], [INF, 'high', 'Very raised']], ok: [0, 600] } },
      guess: () => 'mg/g', group: 'Kidney' },
    { key: 'inr', name: 'INR (blood thinning)', re: /\binr\b|international\s+normali[sz]ed/i, not: /ratio\s*\(?pt/i,
      units: { '': { r: [[0.8, 'low', 'Low'], [1.2, 'normal', 'Normal (not on warfarin)'], [INF, 'high', 'Raised']], ok: [0.5, 15] } }, guess: () => '', group: 'Clotting' },
    { key: 'wbc', name: 'White blood cells (WBC)', re: /\bw\.?\s?b\.?\s?c\b|white\s+(?:blood\s+)?cells?|\bleu[ck]ocytes?\b|\btlc\b|total\s+leu[ck]ocyte/i, not: /urine|differential\s+%/i,
      units: { '×10⁹/L': { r: [[4.0, 'low', 'Low'], [11.0, 'normal', 'Normal'], [INF, 'high', 'High']], ok: [0.1, 200] } }, guess: v => '×10⁹/L', norm: v => (v > 300 ? v / 1000 : v), group: 'Blood count' },
    { key: 'anc', name: 'Neutrophils (ANC)', re: /\bneutrophils?\b|\banc\b|absolute\s+neutrophil|\bgranulocytes?\b/i, not: /%|percent/i,
      units: { '×10⁹/L': { r: [[0.5, 'high', 'Very low'], [1.5, 'low', 'Low'], [7.5, 'normal', 'Normal'], [INF, 'high', 'High']], ok: [0, 60] } }, guess: () => '×10⁹/L', norm: v => (v > 100 ? v / 1000 : v), group: 'Blood count', lowIsBad: true },
    { key: 'plt', name: 'Platelets', re: /\bplatelets?\b|\bplt\b|thrombocytes?/i, not: /mean|\bmpv\b|volume/i,
      units: { '×10⁹/L': { r: [[50, 'high', 'Very low'], [150, 'low', 'Low'], [450, 'normal', 'Normal'], [INF, 'high', 'High']], ok: [1, 2000] } }, guess: () => '×10⁹/L', norm: v => (v > 3000 ? v / 1000 : v), group: 'Blood count', lowIsBad: true },
    { key: 'ferritin', name: 'Ferritin (iron stores)', re: /\bferritin\b/i, not: null,
      units: { 'ng/mL': { r: [[30, 'low', 'Low iron stores'], [300, 'normal', 'Normal'], [INF, 'high', 'High']], ok: [1, 20000] } }, guess: () => 'ng/mL', group: 'Iron' },
    { key: 'ca', name: 'Calcium', re: /\bcalcium\b|^\s*ca\s*(?=[:\-\s]*\d)/i, not: /ionized|ionised|urine|\bca\s*1[259]|ca-?125|ca\s*15/i,
      units: { 'mg/dL': { r: [[8.5, 'low', 'Low'], [10.3, 'normal', 'Normal'], [INF, 'high', 'High']], ok: [4, 18] }, 'mmol/L': { r: [[2.15, 'low', 'Low'], [2.6, 'normal', 'Normal'], [INF, 'high', 'High']], ok: [1, 4.5] } },
      guess: v => (v < 4 ? 'mmol/L' : 'mg/dL'), group: 'Salts' },
    { key: 'phos', name: 'Phosphate', re: /\bphosph(?:ate|orus)\b|^\s*po4\b/i, not: /alkaline|urine/i,
      units: { 'mg/dL': { r: [[2.5, 'low', 'Low'], [4.5, 'normal', 'Normal'], [INF, 'high', 'High']], ok: [0.5, 20] }, 'mmol/L': { r: [[0.8, 'low', 'Low'], [1.45, 'normal', 'Normal'], [INF, 'high', 'High']], ok: [0.2, 6] } },
      guess: v => (v < 2.2 ? 'mmol/L' : 'mg/dL'), group: 'Kidney' },
    { key: 'alb', name: 'Albumin', re: /\balbumin\b/i, not: /urine|creatinine|micro|globulin\s+ratio|\bacr\b/i,
      units: { 'g/dL': { r: [[3.5, 'low', 'Low'], [5.5, 'normal', 'Normal'], [INF, 'high', 'High']], ok: [1, 7] }, 'g/L': { r: [[35, 'low', 'Low'], [55, 'normal', 'Normal'], [INF, 'high', 'High']], ok: [10, 70] } },
      guess: v => (v > 10 ? 'g/L' : 'g/dL'), group: 'Liver' },
    { key: 'ntbnp', name: 'NT-proBNP (heart strain)', re: /nt\s*-?\s*pro\s*-?\s*bnp|\bbnp\b|natriuretic/i, not: null,
      units: { 'pg/mL': { r: [[125, 'normal', 'Normal'], [INF, 'high', 'Raised']], ok: [1, 70000] } }, guess: () => 'pg/mL', group: 'Heart' },
    { key: 'psa', name: 'PSA (prostate)', re: /\bpsa\b|prostate\s+specific/i, not: /free\s*\/|ratio|%/i,
      units: { 'ng/mL': { r: [[4, 'normal', 'Normal'], [INF, 'high', 'Raised']], ok: [0, 5000] } }, guess: () => 'ng/mL', group: 'Tumour markers' },
    { key: 'cea', name: 'CEA (tumour marker)', re: /\bcea\b|carcino\s*-?\s*embryonic/i, not: null,
      units: { 'ng/mL': { r: [[5, 'normal', 'Normal'], [INF, 'high', 'Raised']], ok: [0, 50000] } }, guess: () => 'ng/mL', group: 'Tumour markers' },
    { key: 'ca153', name: 'CA 15-3 (tumour marker)', re: /\bca\s*-?\s*15[.\-\s]*3\b/i, not: null,
      units: { 'U/mL': { r: [[30, 'normal', 'Normal'], [INF, 'high', 'Raised']], ok: [0, 50000] } }, guess: () => 'U/mL', group: 'Tumour markers' },
    { key: 'ca125', name: 'CA-125 (tumour marker)', re: /\bca\s*-?\s*125\b/i, not: null,
      units: { 'U/mL': { r: [[35, 'normal', 'Normal'], [INF, 'high', 'Raised']], ok: [0, 50000] } }, guess: () => 'U/mL', group: 'Tumour markers' },
    { key: 'ca199', name: 'CA 19-9 (tumour marker)', re: /\bca\s*-?\s*19[.\-\s]*9\b/i, not: null,
      units: { 'U/mL': { r: [[37, 'normal', 'Normal'], [INF, 'high', 'Raised']], ok: [0, 100000] } }, guess: () => 'U/mL', group: 'Tumour markers' },
    { key: 'afp', name: 'AFP (tumour marker)', re: /\bafp\b|alpha\s*-?\s*feto\s*protein/i, not: null,
      units: { 'ng/mL': { r: [[10, 'normal', 'Normal'], [INF, 'high', 'Raised']], ok: [0, 100000] } }, guess: () => 'ng/mL', group: 'Tumour markers' },
    { key: 'tgb', name: 'Thyroglobulin (thyroid cancer marker)', re: /thyroglobulin(?!\s*anti)/i, not: /antibod|anti-?tg|\btgab\b/i,
      units: { 'ng/mL': { r: [[1, 'normal', 'Low'], [INF, 'high', 'Detectable']], ok: [0, 100000] } }, guess: () => 'ng/mL', group: 'Tumour markers' }
  ];
  const BY = Object.fromEntries(T.map(t => [t.key, t]));

  const ADVICE = {
    creat: { high: ['Kidneys may be under strain. Good blood pressure control protects them.', 'Avoid pain killers like ibuprofen, diclofenac and naproxen unless your doctor agrees.', 'Drink enough water unless your doctor limits fluids.', 'Ask your doctor whether any medicine doses need changing.'] },
    egfr: { low: ['Kidney filtering is reduced. Keep blood pressure under control and limit salt.', 'Avoid ibuprofen, diclofenac and naproxen. Ask before taking new medicines or supplements.', 'Some medicines (for example metformin) may need a dose change. Ask your doctor.'], borderline: ['Kidney filtering is slightly reduced. This is common with age. Keep BP and sugar controlled and repeat the test as your doctor advises.'], high: ['Kidney filtering is very low. Contact your doctor soon.'] },
    bun: { high: ['Can rise with dehydration or kidney strain. Drink enough water and discuss with your doctor.'] },
    urea: { high: ['Can rise with dehydration or kidney strain. Drink enough water and discuss with your doctor.'] },
    k: { high: ['High potassium can affect the heart rhythm. Contact your doctor, especially if it is 6.0 or higher.', 'Avoid salt substitutes that contain potassium.', 'Some BP medicines raise potassium (e.g. lisinopril, ramipril, losartan, valsartan, spironolactone). Do not stop them yourself; ask your doctor.'], low: ['Low potassium can cause weakness and cramps. Water tablets (diuretics) are a common cause.', 'Ask your doctor whether to eat more potassium-rich foods (banana, dates, potatoes) or take a supplement.'] },
    na: { low: ['Low sodium can cause tiredness, confusion or falls. Water tablets are a common cause.', 'Do not drink very large amounts of water. Tell your doctor.'], high: ['Usually a sign of not drinking enough. Drink water and tell your doctor.'] },
    fbs: { borderline: ['Sugar is in the prediabetes range. Cut down sweets, white bread, rice and sugary drinks.', 'Walk daily and aim for a healthy weight.', 'Recheck as your doctor advises.'], high: ['Sugar is in the diabetes range. See your doctor to confirm and plan treatment.', 'Diabetes and high blood pressure together raise heart and kidney risk, so controlling both matters.'], low: ['Low sugar: eat or drink something sweet if you feel shaky, sweaty or confused, and tell your doctor.'] },
    glu: { borderline: ['Sugar is raised. A fasting test or HbA1c gives a clearer picture. Ask your doctor.'], high: ['Sugar is high. See your doctor soon.'], low: ['Low sugar: eat or drink something sweet if you feel shaky, sweaty or confused, and tell your doctor.'] },
    a1c: { borderline: ['Average sugar over 3 months is in the prediabetes range. Healthy eating, walking and weight loss can bring it down.'], high: ['Average sugar is in the diabetes range. Follow your doctor’s treatment plan.', 'Good blood pressure control is especially important with diabetes.'] },
    chol: { borderline: ['Cut down fried food, fatty meat, butter and ghee. Eat more vegetables, oats, beans and fish.'], high: ['High cholesterol plus high blood pressure raises heart and stroke risk. Ask your doctor about treatment.', 'Choose olive oil, nuts, fish and fibre. Walk daily.'] },
    ldl: { borderline: ['LDL is above target. Less saturated fat (fatty meat, butter, ghee, fried food) and more fibre help.'], high: ['LDL is high. Ask your doctor whether you need a cholesterol medicine (statin).', 'Walk daily and avoid smoking.'] },
    hdl: { low: ['Good cholesterol is low. Regular exercise, not smoking and healthy fats (olive oil, nuts, fish) raise it.'] },
    tg: { borderline: ['Cut down sugar, sweets, white bread and rice, and sugary drinks.'], high: ['Triglycerides are high. Cut sugar and refined carbohydrates, and ask your doctor.', 'Very high levels (over 500 mg/dL or 5.6 mmol/L) need prompt medical advice.'] },
    uric: { high: ['High uric acid can cause gout. Drink water and limit red meat, organ meat, seafood and sugary drinks.', 'Some water tablets raise uric acid. Ask your doctor.'] },
    hb: { low: ['Low haemoglobin (anaemia) can cause tiredness and breathlessness. Ask your doctor about the cause.'], high: ['High haemoglobin needs checking by your doctor. Drink enough water.'] },
    alt: { high: ['Liver test is raised. Avoid alcohol and do not take extra paracetamol. Ask your doctor.'] },
    ast: { high: ['Liver test is raised. Avoid alcohol and ask your doctor.'] },
    tsh: { high: ['TSH is high: the thyroid may be underactive (or the thyroid tablet dose may be too low). Discuss with your doctor.', 'Take thyroid tablets every day on an empty stomach, 30\u201360 minutes before breakfast, and 4 hours apart from calcium, iron and antacids.', 'Recheck the blood test 6\u20138 weeks after any dose change.'], low: ['TSH is low: the thyroid may be overactive (or the thyroid tablet dose may be too high). This can raise pulse and blood pressure.', 'Do not change the dose yourself; ask your doctor.', 'Get help if you have a racing or irregular heartbeat, chest pain or shortness of breath.'] },
    ft4: { high: ['Free T4 is high: too much thyroid hormone. This can cause a fast pulse, tremor, weight loss and higher blood pressure. See your doctor.'], low: ['Free T4 is low: too little thyroid hormone. This can cause tiredness, weight gain and feeling cold. See your doctor.'] },
    ft3: { high: ['Free T3 is high: the thyroid may be overactive. See your doctor, especially if your pulse is fast.'], low: ['Free T3 is low. Your doctor will look at it together with TSH and Free T4.'] },
    vitd: { low: ['Vitamin D is low. Ask your doctor about a supplement and safe sun exposure.'], borderline: ['Vitamin D is a little low. Ask your doctor whether you need a supplement.'] },
    inr: { high: ['If you take warfarin, your doctor sets a target range (often 2 to 3). Above the target means the blood is thinner than intended and bleeding is more likely.', 'Contact your anticoagulation clinic today for dose advice; get help at once for bleeding that will not stop, black stools, blood in urine or vomit, or a severe headache.', 'Do not change your warfarin dose yourself.'], low: ['Below your target means a higher risk of clots. Contact your anticoagulation clinic for dose advice.'] },
    wbc: { low: ['White cells fight infection. When they are low, avoid crowds and sick people, wash hands often and follow food-safety advice.', 'A temperature of 38 °C or higher with low white cells is an emergency: contact your doctor or go to the emergency department at once.'], high: ['White cells can rise with infection, inflammation or steroids. Your doctor will look at the reason.'] },
    anc: { low: ['Neutrophils are the main infection-fighting white cells. Low levels mean infections can become serious quickly.', 'Check your temperature if you feel unwell; 38 °C or higher needs urgent medical care.'], high: ['High neutrophils are often from an infection or steroid tablets. Your doctor will review it.'] },
    plt: { low: ['Platelets help blood clot. When low, use a soft toothbrush, avoid injury, and do not take aspirin or ibuprofen unless your doctor says so.', 'Get help for bleeding that will not stop, black stools or many new bruises.'], high: ['High platelets can follow infection, inflammation or low iron. Your doctor will review it.'] },
    ferritin: { low: ['Iron stores are low. Ask your doctor about iron tablets and the cause of iron loss (for example heavy periods).', 'Eat iron-rich foods (red meat, liver, lentils, beans, spinach, dates) with vitamin C, and avoid tea or coffee with meals.'], high: ['High ferritin can come from inflammation, liver disease, repeated transfusions or iron overload. Your doctor will review it.'] },
    ca: { low: ['Low calcium can cause tingling or cramps. Ask your doctor; vitamin D and kidney health affect it.'], high: ['High calcium can cause thirst, constipation and confusion. Contact your doctor, especially with cancer or if you take calcium or vitamin D tablets.'] },
    phos: { high: ['High phosphate is common in kidney disease. Limit processed food, cola drinks and processed cheese, and take phosphate binders with meals if prescribed.'], low: ['Low phosphate is uncommon; your doctor will review it.'] },
    alb: { low: ['Low albumin can mean poor nutrition, liver or kidney problems. Ask your doctor or dietitian about protein in your diet.'] },
    ntbnp: { high: ['A raised NT-proBNP shows the heart is under strain. Your doctor uses it to check for heart failure.', 'Weigh yourself every morning and report a quick gain, swelling or breathlessness.'] },
    psa: { high: ['A raised PSA can come from an enlarged prostate, infection or prostate cancer. Your doctor decides what further tests are needed.', 'If you are being treated for prostate cancer, the trend over time matters most: discuss it with your doctor.'] },
    cea: { high: ['CEA is a marker used to follow some cancers (often bowel). Smoking and inflammation can also raise it. The change over time matters most: discuss it with your oncologist.'] },
    ca153: { high: ['CA 15-3 is a marker used to follow breast cancer. One result is not a diagnosis; your oncologist looks at the trend together with scans.'] },
    ca125: { high: ['CA-125 is a marker used to follow ovarian cancer. Periods, endometriosis and other conditions can also raise it. Discuss the trend with your doctor.'] },
    ca199: { high: ['CA 19-9 is a marker used to follow pancreas, bile duct and some bowel cancers. Bile blockage can also raise it. Discuss the trend with your oncologist.'] },
    afp: { high: ['AFP is a marker used to follow liver cancer and some germ cell tumours; it also rises in pregnancy and liver disease. Discuss it with your doctor.'] },
    tgb: { high: ['After thyroid cancer treatment, thyroglobulin should usually be very low. A detectable or rising level needs review by your endocrinologist or oncologist.'] },
    acr: { high: ['Protein in the urine is an early sign of kidney strain from high blood pressure or diabetes. Discuss with your doctor; some BP medicines also protect the kidneys.'] }
  };

  /* ---------------- reading text */
  async function ocrWorker() {
    await loadScript(base + 'tesseract.min.js');
    if (!ocrWorker.w) ocrWorker.w = Tesseract.createWorker('eng', 1, { workerPath: base + 'worker.min.js', corePath: base, langPath: base, gzip: false, cacheMethod: 'none', workerBlobURL: false })
      .then(async w => { await w.setParameters({ tessedit_pageseg_mode: '6', preserve_interword_spaces: '1' }); return w; })
      .catch(e => { ocrWorker.w = null; throw e; });
    return ocrWorker.w;
  }
  function prepCanvas(src, deg, big) {
    const iw = src.naturalWidth || src.width, ih = src.naturalHeight || src.height, rot = (deg || 0) % 180 !== 0;
    const sc = big ? Math.min(4.5, big / Math.max(iw, ih)) : Math.min(3, 2800 / Math.max(iw, ih), Math.max(1, 2200 / (rot ? ih : iw)));
    const c = document.createElement('canvas'); c.width = Math.round((rot ? ih : iw) * sc); c.height = Math.round((rot ? iw : ih) * sc);
    const x = c.getContext('2d', { willReadFrequently: true }); x.imageSmoothingQuality = 'high';
    x.translate(c.width / 2, c.height / 2); x.rotate((deg || 0) * Math.PI / 180); x.drawImage(src, -iw * sc / 2, -ih * sc / 2, iw * sc, ih * sc); x.setTransform(1, 0, 0, 1, 0, 0);
    // grey from the red channel (hides the pink grid of ECG paper; black and blue print stay dark) + contrast stretch
    const d = x.getImageData(0, 0, c.width, c.height), p = d.data; const hist = new Uint32Array(256);
    for (let i = 0; i < p.length; i += 4) { const g = (p[i] * 0.8 + p[i + 1] * 0.15 + p[i + 2] * 0.05) | 0; p[i] = g; hist[g]++; }
    let lo = 0, hi = 255, acc = 0; const n = p.length / 4;
    for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc > n * 0.01) { lo = i; break; } }
    acc = 0; for (let i = 255; i >= 0; i--) { acc += hist[i]; if (acc > n * 0.05) { hi = i; break; } }
    const k = 255 / Math.max(1, hi - lo);
    for (let i = 0; i < p.length; i += 4) { const v = Math.max(0, Math.min(255, (p[i] - lo) * k)); p[i] = p[i + 1] = p[i + 2] = v; }
    x.putImageData(d, 0, 0);
    return c;
  }
  async function textFromCanvas(c, say, psm) {
    const w = await ocrWorker();
    await w.setParameters({ tessedit_pageseg_mode: psm || '6' });
    const r = await w.recognize(c);
    return (r.data && r.data.text) || '';
  }
  async function textFromImage(blob, say) {
    const url = URL.createObjectURL(blob);
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Could not open the photo')); i.src = url; });
      say('Reading the report…');
      // photos are often taken sideways: try turning the page if the text does not make sense
      let best = { deg: 0, t: await textFromCanvas(prepCanvas(img, 0), say, '6') }; best.sc = textScore(best.t);
      if (best.sc < 4) for (const deg of [90, 270, 180]) {
        say('Turning the page to read it\u2026');
        const t = await textFromCanvas(prepCanvas(img, deg), say, '6'), sc = textScore(t);
        if (sc > best.sc) best = { deg, t, sc };
        if (best.sc >= 6) break;
      }
      // a second, differently-laid-out reading helps confirm the numbers
      say('Double-checking the numbers…');
      const b = await textFromCanvas(prepCanvas(img, best.deg), say, '4');
      const out = [best.t, b];
      // small print (e.g. an ECG strip photographed whole): read again much larger
      if (isEcg(best.t + b) && ecgParse(best.t).results.length + ecgParse(b).results.length < 6) {
        say('Looking closer at the small print\u2026');
        for (const side of [4200]) { out.push(await textFromCanvas(prepCanvas(img, best.deg, side), say, '6')); out.push(await textFromCanvas(prepCanvas(img, best.deg, side), say, '11')); }
      }
      return out;
    } finally { URL.revokeObjectURL(url); }
  }
  /* how much a text looks like a medical report (used to find the right way up) */
  function textScore(t) {
    const words = (t.match(/\b(test|result|range|unit|normal|mg\/dl|mmol|hr|qrs|qtc?|axis|sec|ecg|sinus|rhythm|name|age|date|male|female|bpm|patient|report|cholesterol|glucose|creatinine|haemoglobin|hemoglobin)\b/gi) || []).length;
    return words + (t.match(/\b\d+[.,]\d+\b/g) || []).length * 0.2;
  }
  async function textFromPdf(blob, say) {
    await loadScript(base + 'pdf.min.js');
    const lib = window.pdfjsLib; lib.GlobalWorkerOptions.workerSrc = base + 'pdf.worker.min.js';
    const pdf = await lib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()), isEvalSupported: false }).promise;
    const pages = Math.min(pdf.numPages, 6);
    let text = '';
    for (let i = 1; i <= pages; i++) {
      const pg = await pdf.getPage(i); const tc = await pg.getTextContent();
      const rows = [];
      for (const it of tc.items) {
        if (!it.str || !it.str.trim()) continue;
        const y = it.transform[5], x = it.transform[4];
        let row = rows.find(r => Math.abs(r.y - y) < Math.max(2, (it.height || 8) * 0.45));
        if (!row) { row = { y, items: [] }; rows.push(row); }
        row.items.push({ x, s: it.str });
      }
      rows.sort((a, b) => b.y - a.y);
      text += rows.map(r => r.items.sort((a, b) => a.x - b.x).map(i => i.s).join('   ')).join('\n') + '\n';
    }
    if (text.replace(/\s/g, '').length > 60) return [text, text];
    // scanned PDF: draw each page and read it like a photo
    let out = '';
    for (let i = 1; i <= Math.min(pdf.numPages, 4); i++) {
      say(`Reading page ${i} of ${Math.min(pdf.numPages, 4)}…`);
      const pg = await pdf.getPage(i); const vp = pg.getViewport({ scale: 2.4 });
      const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
      const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      await pg.render({ canvasContext: ctx, viewport: vp }).promise;
      out += await textFromCanvas(prepCanvas(c), say, '6') + '\n';
    }
    return [out];
  }

  /* ---------------- finding values in the text */
  const UNIT_RE = [
    [/pg\s*\/\s*ml/i, 'pg/mL'], [/pmol\s*\/\s*l/i, 'pmol/L'], [/ng\s*\/\s*d\s*l/i, 'ng/dL'],
    [/µ\s*mol\s*\/\s*l|umol\s*\/\s*l|micromol/i, 'µmol/L'], [/mmol\s*\/\s*mol/i, 'mmol/mol'], [/mmol\s*\/\s*l/i, 'mmol/L'], [/mg\s*\/\s*mmol/i, 'mg/mmol'],
    [/mg\s*\/\s*d\s*l|mg\s*%/i, 'mg/dL'], [/mg\s*\/\s*g\b/i, 'mg/g'], [/\bg\s*\/\s*d\s*l/i, 'g/dL'], [/\bg\s*\/\s*l\b/i, 'g/L'], [/ng\s*\/\s*ml/i, 'ng/mL'], [/nmol\s*\/\s*l/i, 'nmol/L'],
    [/m\s*iu\s*\/\s*l|u\s*iu\s*\/\s*ml|µ\s*iu\s*\/\s*ml|miu\s*\/\s*ml/i, 'mIU/L'], [/\b(?:i?u)\s*\/\s*l\b/i, 'U/L'], [/ml\s*\/\s*min/i, 'mL/min/1.73m²'], [/%/, '%']
  ];
  const NUM = /(?<![\w.,\/])([<>]?\s*\d{1,4}(?:[.,]\d{1,3})?)(?![\d\/])/g;
  function cleanNum(s) { return parseFloat(s.replace(/[<>\s]/g, '').replace(',', '.')); }

  function rate(key, value, unit) {
    const t = BY[key]; const u = t.units[unit]; if (!u) return null;
    for (const [b, flag, label] of u.r) if (value < b) return { flag, label };
    return null;
  }

  function parse(text) {
    const lines = text.replace(/\r/g, '').split('\n').map(l => l.replace(/[|│¦]/g, ' ').replace(/\s+/g, ' ').trim()).filter(Boolean);
    const found = {};
    for (const line of lines) {
      for (const t of T) {
        if (found[t.key]) continue;
        const m = t.re.exec(line); if (!m) continue;
        if (t.not && t.not.test(line)) continue;
        if (t.key === 'glu' && found.fbs) continue;
        const after = line.slice(m.index + m[0].length).replace(/\b25\s*[-(]?\s*(?:oh|hydroxy)\)?/ig, ' ').replace(/\(\s*(?:hb\s*)?a[1il|]c\s*\)/ig, ' ');
        // the first number after the test name is the result; the next pair is usually the normal range
        NUM.lastIndex = 0; const nums = []; let x;
        while ((x = NUM.exec(after))) { if (/^[<>]?\s*0\d/.test(x[1])) continue; nums.push({ s: x[1], i: x.index, v: cleanNum(x[1]) }); }
        if (!nums.length) continue;
        // a number that starts a range ("3.5 - 5.1") or has < / > is the normal range, not the result
        const isRangeStart = k => k + 1 < nums.length && /^\s*(?:-|\u2013|to)\s*$/i.test(after.slice(nums[k].i + nums[k].s.length, nums[k + 1].i));
        if (/^[<>]/.test(nums[0].s.trim()) || isRangeStart(0)) continue;
        let unit = null; for (const [re, u] of UNIT_RE) if (re.test(after)) { unit = u; break; }
        let v = nums[0].v; if (!isFinite(v)) continue;
        if (t.norm) v = +t.norm(v).toFixed(2);       // e.g. 7,500 /µL white cells → 7.5 ×10⁹/L
        if (!unit || !t.units[unit]) unit = t.guess(v);
        const ok = t.units[unit] && t.units[unit].ok; if (!ok || v < ok[0] || v > ok[1]) continue;
        if (nums.length >= 3 && isRangeStart(1)) { const lo = nums[1].v, hi = nums[2].v; if (hi > 0 && (v > hi * 8 || v < lo / 8)) continue; }
        const range = nums.length >= 3 && /-|–|to/.test(after.slice(nums[1].i - 3, nums[2].i + 1)) ? nums[1].s + '–' + nums[2].s : '';
        const rt = rate(t.key, v, unit);
        found[t.key] = { key: t.key, name: t.name, value: v, unit, flag: rt ? rt.flag : 'normal', label: rt ? rt.label : '', range, line };
      }
    }
    return T.map(t => found[t.key]).filter(Boolean);
  }

  /* ---------------- ECG: the machine's printed measurements and its interpretation statements */
  const ECG_TESTS = [
    { key: 'ecg_hr', name: 'Heart rate (ECG)', unit: 'bpm', r: [[50, 'low', 'Slow'], [60, 'borderline', 'Slightly slow'], [100.5, 'normal', 'Normal'], [120, 'borderline', 'Fast'], [Infinity, 'high', 'Very fast']], ok: [25, 250], norm: '60\u2013100' },
    { key: 'ecg_pr', name: 'PR interval', unit: 's', r: [[0.12, 'borderline', 'Short'], [0.205, 'normal', 'Normal'], [0.3, 'borderline', 'Long'], [Infinity, 'high', 'Very long']], ok: [0.05, 0.5], norm: '0.12\u20130.20' },
    { key: 'ecg_qrs', name: 'QRS duration', unit: 's', r: [[0.12, 'normal', 'Normal'], [Infinity, 'high', 'Wide']], ok: [0.04, 0.25], norm: 'below 0.12' },
    { key: 'ecg_qt', name: 'QT interval', unit: 's', r: [[Infinity, 'normal', 'See QTc']], ok: [0.2, 0.7], norm: '' },
    { key: 'ecg_qtc', name: 'QTc (heart-rate corrected QT)', unit: 's', r: [[0.35, 'borderline', 'Short'], [0.45, 'normal', 'Normal'], [0.48, 'borderline', 'Borderline long'], [Infinity, 'high', 'Long']], ok: [0.25, 0.7], norm: '0.35\u20130.45' },
    { key: 'ecg_axis', name: 'Heart axis', unit: '\u00B0', r: [[-30, 'borderline', 'Left axis deviation'], [90.5, 'normal', 'Normal'], [Infinity, 'borderline', 'Right axis deviation']], ok: [-180, 270], norm: '-30 to +90' },
    { key: 'ecg_rs', name: 'Voltage (RV5 + SV1)', unit: 'mV', r: [[3.5, 'normal', 'Normal'], [Infinity, 'high', 'High voltage']], ok: [0.2, 8], norm: 'below 3.5' }
  ];
  const ECG_BY = Object.fromEntries(ECG_TESTS.map(t => [t.key, t]));
  const ECG_FINDINGS = [
    { key: 'normal', re: /normal(?:range)?ec[gc6]|ecgwithinnormal|withinnormallimits|normalsinusrhythm/, flag: 'normal', label: 'Normal ECG', text: 'The machine found the ECG within the normal range.', tips: ['Keep controlling blood pressure; it protects the heart over the years.'] },
    { key: 'sinus', re: /sinusrhythm/, flag: 'normal', label: 'Sinus rhythm', text: 'The heartbeat starts in the normal place (the sinus node).', tips: [] },
    { key: 'sinus_arr', re: /sinusarr?h?y?t?h?m|respiratoryarr?hyth/, flag: 'normal', label: 'Sinus arrhythmia', text: 'The heart rate speeds up and slows down a little with breathing. This is common and usually harmless, especially in younger adults.', tips: ['No special treatment is usually needed.', 'Tell your doctor if you have palpitations, dizziness or fainting.'] },
    { key: 'tachy', re: /sinustach|tachycard/, flag: 'borderline', label: 'Fast heart rate (tachycardia)', text: 'The heart was beating faster than 100 per minute.', tips: ['Caffeine, stress, fever, dehydration, pain or anaemia can cause this.', 'Rest, drink water and repeat the check. See your doctor if it stays fast or you feel unwell.'] },
    { key: 'brady', re: /sinusbrad|bradycard/, flag: 'borderline', label: 'Slow heart rate (bradycardia)', text: 'The heart was beating slower than 60 per minute. This can be normal in fit people or with some BP medicines (such as beta blockers).', tips: ['See your doctor if you feel dizzy, faint, breathless or very tired.'] },
    { key: 'af', re: /atrialfib|afib|\baf\b/, flag: 'high', label: 'Atrial fibrillation (irregular rhythm)', text: 'An irregular heart rhythm that raises the risk of stroke and needs a doctor\u2019s care.', tips: ['See your doctor soon; you may need medicine to protect against stroke.', 'Keep blood pressure well controlled and limit caffeine and alcohol.'], urgent: 'Call 997 if you have chest pain, fainting, sudden weakness, trouble speaking or severe breathlessness.' },
    { key: 'flutter', re: /atrialflutter/, flag: 'high', label: 'Atrial flutter', text: 'A fast, regular abnormal rhythm from the upper heart chambers.', tips: ['See your doctor soon.'], urgent: 'Call 997 if you have chest pain, fainting or severe breathlessness.' },
    { key: 'lvh', re: /leftventricularhypertroph|\blvh\b|highvoltage|highqrsvoltage|lvhypertroph/, flag: 'high', label: 'Possible thickened heart muscle (LVH)', text: 'The heart\u2019s main pumping chamber may be thicker than normal. Long-standing high blood pressure is the most common cause.', tips: ['Good blood pressure control is the main treatment and can reverse it over time.', 'Ask your doctor whether you need an echo (heart ultrasound).'] },
    { key: 'ischemia', re: /stdepress|stelevat|stchange|st-?t(?:wave)?(?:change|abnorm)|twaveabnorm|twaveinvers|tinversion|ischem|ischaem|infarct|injury/, flag: 'high', label: 'ST / T-wave changes', text: 'Changes that can be a sign of reduced blood flow to the heart, or of other causes. A doctor needs to look at this.', tips: ['See your doctor soon and take this ECG with you.', 'Do not do heavy exercise until a doctor has reviewed it.'], urgent: 'Call 997 now if you have chest pain or pressure, breathlessness, sweating or pain spreading to the arm, jaw or back.' },
    { key: 'bbb', re: /bundlebranch|\brbbb\b|\blbbb\b|conductiondelay|ivcd/, flag: 'borderline', label: 'Bundle branch block / conduction delay', text: 'The electrical signal travels more slowly through part of the heart. Right-sided blocks are often harmless; left-sided ones need checking.', tips: ['Show this ECG to your doctor; keep a copy for future comparison.'] },
    { key: 'avb', re: /avblock|a-vblock|1stdegree|firstdegree|seconddegree|2nddegree|thirddegree|3rddegree|completeheartblock/, flag: 'borderline', label: 'AV block (slowed signal)', text: 'The signal from the upper to the lower heart chambers is delayed or partly blocked.', tips: ['Ask your doctor to review your medicines; some BP and heart medicines slow this signal.'], urgent: 'Get urgent help if you faint or feel very dizzy.' },
    { key: 'longqt', re: /longqt|prolongedqt|qtprolong/, flag: 'high', label: 'Long QT', text: 'The heart takes longer than usual to reset between beats, which can rarely trigger dangerous rhythms.', tips: ['Ask your doctor or pharmacist to check your medicines (some antibiotics, anti-sickness and heart medicines lengthen QT).', 'Keep potassium and magnesium levels normal.'], urgent: 'Get urgent help if you faint or have a racing heartbeat.' },
    { key: 'ectopic', re: /prematureventric|ventricularpremature|\bpvcs?\b|prematureatrial|atrialpremature|\bpacs?\b|extrasystol|ectopic/, flag: 'borderline', label: 'Extra beats (ectopic beats)', text: 'Occasional early beats. These are common and often harmless.', tips: ['Cut down on caffeine, energy drinks and smoking, and sleep well.', 'Tell your doctor if they are frequent or come with dizziness or chest pain.'] },
    { key: 'lad', re: /leftaxisdev/, flag: 'borderline', label: 'Left axis deviation', text: 'The overall direction of the heart\u2019s electrical activity is shifted to the left. Often mild and needs to be seen with the rest of the ECG.', tips: [] },
    { key: 'rad', re: /rightaxisdev/, flag: 'borderline', label: 'Right axis deviation', text: 'The heart\u2019s electrical direction is shifted to the right. Your doctor will judge whether this matters.', tips: [] },
    { key: 'borderline', re: /borderlineecg/, flag: 'borderline', label: 'Borderline ECG', text: 'Some findings are near the edge of normal. A doctor should review it.', tips: ['Show it to your doctor at your next visit.'] },
    { key: 'abnormal', re: /abnormalecg|otherwiseabnormal/, flag: 'high', label: 'Abnormal ECG', text: 'The machine flagged findings that a doctor needs to review.', tips: ['See your doctor soon and take the ECG with you.'], urgent: 'Call 997 if you have chest pain, fainting or severe breathlessness.' },
    { key: 'unconfirmed', re: /unconfirmed/, flag: 'info', label: 'Computer reading, not yet confirmed', text: 'The interpretation was made by the ECG machine and has not been checked by a doctor yet.', tips: ['Ask a doctor to confirm the result.'] }
  ];
  function isEcg(t) { const z = t.toLowerCase().replace(/[^a-z0-9]/g, ''); return /ecg|ekg|qrs|qtc|sinus|rv5|sv1/.test(z) || (/\baxis\b/i.test(t) && /\bhr\b/i.test(t)); }
  function ecgParse(text) {
    const t = text.replace(/(\b0)\s*[,;.]\s*-?\s*(\d)/g, '$1.$2').replace(/(\d)\s*[,;]\s*(\d)/g, '$1.$2').replace(/(\d)\.\s+(\d)/g, '$1.$2')
      .replace(/(\d)5ec\b/gi, '$1 Sec');
    const z = text.toLowerCase().replace(/[^a-z0-9]/g, '');
    const out = [];
    const num = '(-?\\d{1,3}(?:\\.\\d{1,3})?)';
    const grab = (key, re, conv) => {
      if (out.find(o => o.key === key)) return;
      const m = t.match(re); if (!m) return;
      let v = parseFloat(m[1]); if (!isFinite(v)) return;
      if (conv) v = conv(v, m[0]);
      const T2 = ECG_BY[key]; if (v < T2.ok[0] || v > T2.ok[1]) return;
      const rt = T2.r.find(x => v < x[0]) || T2.r[T2.r.length - 1];
      out.push({ key, name: T2.name, value: +v.toFixed(T2.unit === 's' ? 3 : T2.unit === 'mV' ? 2 : 0), unit: T2.unit, flag: rt[1], label: rt[2], range: T2.norm, line: m[0] });
    };
    const sec = (v, s) => (v > 2 || /ms/i.test(s) ? v / 1000 : v);
    grab('ecg_hr', new RegExp('(?:\\bHR|Vent\\.?\\s*rate|Heart\\s*rate)\\b[^0-9\\n]{0,8}' + num, 'i'));
    grab('ecg_pr', new RegExp('\\bP\\s*-?\\s*R(?:\\s*int\\w*)?\\b[^0-9\\n]{0,8}' + num + '\\s*(?:m?sec|m?s)?', 'i'), sec);
    grab('ecg_qrs', new RegExp('\\bQRS(?:\\s*dur\\w*)?\\b[^0-9\\n]{0,8}' + num + '\\s*(?:m?sec|m?s)?', 'i'), sec);
    grab('ecg_qtc', new RegExp('(?<![F]-?)\\b[QO0]T[ce][BH]?\\b[^0-9\\n]{0,8}' + num + '\\s*(?:m?sec|m?s)?', 'i'), sec);
    grab('ecg_qt', new RegExp('(?<![F]-?)\\b[QO0]T\\b(?![ce])[^0-9\\n]{0,8}' + num + '\\s*(?:m?sec|m?s)?', 'i'), sec);
    { // "AXIS : 53°" where the colon is often read as a lone digit ("AXIS 1 53")
      const m = t.match(/\b(?:QRS\s*)?AX[I|l1]S\b[^0-9\-\n]{0,8}(-?\d{1,3})(?:\s{1,3}(-?\d{1,3}))?\s*(°|deg)?/i);
      if (m) { let v = +m[1]; if (m[2] != null && /^\d$/.test(m[1])) v = +m[2];
        const T2 = ECG_BY.ecg_axis; if (v >= T2.ok[0] && v <= T2.ok[1]) { const rt = T2.r.find(x => v < x[0]); out.push({ key: 'ecg_axis', name: T2.name, value: v, unit: T2.unit, flag: rt[1], label: rt[2], range: T2.norm, line: m[0] }); } }
    }
    grab('ecg_rs', new RegExp('\\bR\\s*\\+\\s*S\\b[^0-9\\n]{0,8}' + num, 'i'));
    const findings = [];
    for (const f of ECG_FINDINGS) if (f.re.test(z)) findings.push({ key: f.key, label: f.label, flag: f.flag });
    if (findings.some(f => f.key === 'sinus_arr')) { const i = findings.findIndex(f => f.key === 'sinus'); if (i >= 0) findings.splice(i, 1); }
    return { results: out, findings };
  }
  function finding(key) { return ECG_FINDINGS.find(f => f.key === key); }

  async function read(blob, isPdf, onStatus) {
    const say = s => { try { onStatus && onStatus(s); } catch { /* ignore */ } };
    say('Loading the report reader…');
    const texts = isPdf ? await textFromPdf(blob, say) : await textFromImage(blob, say);
    const a = parse(texts[0]), b = texts[1] != null ? parse(texts[1]) : [];
    const bk = Object.fromEntries(b.map(r => [r.key, r]));
    const out = a.map(r => Object.assign(r, { sure: !!(bk[r.key] && bk[r.key].value === r.value) }));
    for (const r of b) if (!out.find(x => x.key === r.key)) out.push(Object.assign(r, { sure: false }));
    const order = T.map(t => t.key);
    out.sort((x, y) => order.indexOf(x.key) - order.indexOf(y.key));
    const all = texts.join('\n');
    let findings = [], kind = 'lab';
    if (isEcg(all)) {
      kind = 'ecg';
      // every reading of the page votes for each measurement
      const parsed = texts.map(ecgParse), votes = {};
      for (const p of parsed) for (const r of p.results) { const v = votes[r.key] || (votes[r.key] = {}); const k = String(r.value); (v[k] = v[k] || { r, n: 0 }).n++; }
      const pick = {};
      for (const [key, v] of Object.entries(votes)) { const best = Object.values(v).sort((a2, b2) => b2.n - a2.n)[0]; pick[key] = Object.assign({}, best.r, { sure: best.n >= 2 }); }
      // the numbers check each other: HR = 60 / RR, QTc = QT / sqrt(RR)
      const rrm = all.replace(/(\d)\s*[,;]\s*-?(\d)/g, '$1.$2').match(/\bR\s*-?\s*R\b[^0-9\n]{0,8}(\d\.\d{2,3})/i);
      const rr = rrm ? parseFloat(rrm[1]) : null;
      if (rr && rr > 0.3 && rr < 2) {
        const hrc = 60 / rr;
        if (pick.ecg_hr && Math.abs(pick.ecg_hr.value - hrc) <= Math.max(3, hrc * 0.06)) pick.ecg_hr.sure = true;
        if (pick.ecg_qt && pick.ecg_qtc && Math.abs(pick.ecg_qt.value / Math.sqrt(rr) - pick.ecg_qtc.value) < 0.012) { pick.ecg_qt.sure = true; pick.ecg_qtc.sure = true; }
      }
      // a real measurement block has several values; one stray match (e.g. "PR" in a sentence) is ignored
      const nPick = Object.keys(pick).length;
      for (const t2 of ECG_TESTS) if (pick[t2.key] && nPick >= 3) out.push(pick[t2.key]);
      const seen = new Set(); for (const p of parsed) for (const f of p.findings) if (!seen.has(f.key)) { seen.add(f.key); findings.push(f); }
      // ECG heart-rate lines can look like lab tests ("HR"), drop lab matches that came from ECG lines
      for (let i = out.length - 1; i >= 0; i--) if (!out[i].key.startsWith('ecg_') && /\bHR\b|QRS|QT/i.test(out[i].line || '')) out.splice(i, 1);
    }
    return { results: out, findings, kind, chars: all.replace(/\s/g, '').length };
  }

  /* advice for one result, with notes that depend on the person's medicines */
  const ACE_ARB = /lisinopril|enalapril|ramipril|perindopril|captopril|fosinopril|losartan|valsartan|irbesartan|telmisartan|olmesartan|candesartan|azilsartan|spironolactone|eplerenone|sacubitril|entresto/i;
  const DIURETIC = /hydrochlorothiazide|\bhctz\b|indapamide|chlorthalidone|furosemide|lasix|torsemide|bumetanide|natrilix/i;
  const ECG_ADVICE = {
    ecg_hr: { low: ['A slow heart rate can be normal in fit people or with beta blockers. See your doctor if you feel dizzy or faint.'], borderline: ['Repeat the check after resting. Caffeine, stress or medicines can change heart rate.'], high: ['A very fast heart rate needs a doctor\u2019s review, especially with palpitations or breathlessness.'] },
    ecg_pr: { borderline: ['A long PR interval (first-degree AV block) is often harmless but some BP medicines can cause it. Ask your doctor to review your medicines.'], high: ['Ask your doctor soon; the heart\u2019s signal is being slowed.'] },
    ecg_qrs: { high: ['A wide QRS can mean a bundle branch block. Show this ECG to your doctor.'] },
    ecg_qtc: { borderline: ['Ask your doctor or pharmacist to check your medicines for ones that lengthen QT.'], high: ['A long QTc needs a doctor\u2019s review. Avoid new medicines until checked, and keep potassium normal.'] },
    ecg_axis: { borderline: ['An axis shift is often mild. Your doctor will judge it with the rest of the ECG.'] },
    ecg_rs: { high: ['High voltage can be a sign of a thickened heart muscle from high blood pressure. Good BP control is important; ask your doctor about an echo.'] }
  };
  function advice(r, meds) {
    if (ECG_ADVICE[r.key]) return ((ECG_ADVICE[r.key] || {})[r.flag] || []).slice();
    const list = ((ADVICE[r.key] || {})[r.flag] || []).slice();
    const names = (meds || []).filter(m => m.active).map(m => m.name).join(' ');
    if (r.key === 'k' && r.flag === 'high' && ACE_ARB.test(names)) list.unshift('You take a medicine that can raise potassium (' + (names.match(ACE_ARB) || [''])[0] + '). Show this result to your doctor soon.');
    if ((r.key === 'k' || r.key === 'na') && r.flag === 'low' && DIURETIC.test(names)) list.unshift('You take a water tablet (' + (names.match(DIURETIC) || [''])[0] + ') that can lower this. Show this result to your doctor.');
    if ((r.key === 'egfr' && (r.flag === 'low' || r.flag === 'high')) || (r.key === 'creat' && r.flag === 'high')) { if (/metformin/i.test(names)) list.push('You take metformin; its dose may depend on kidney function. Ask your doctor.'); }
    return list;
  }
  function reRate(r) {
    if (ECG_BY[r.key]) { const T2 = ECG_BY[r.key], rt2 = T2.r.find(x => r.value < x[0]) || T2.r[T2.r.length - 1]; return Object.assign({}, r, { flag: rt2[1], label: rt2[2] }); }
    const rt = rate(r.key, r.value, r.unit); return Object.assign({}, r, rt ? { flag: rt.flag, label: rt.label } : {}); }
  function refText(key, unit) {
    if (ECG_BY[key]) return ECG_BY[key].norm;
    const u = BY[key] && BY[key].units[unit]; if (!u) return '';
    const n = u.r.find(x => x[1] === 'normal'); const i = u.r.indexOf(n);
    if (!n) return '';
    const lo = i > 0 ? u.r[i - 1][0] : null;
    return lo != null && n[0] !== INF ? `${lo}–${n[0]}` : n[0] === INF ? `${lo}+` : `below ${n[0]}`;
  }

  return { read, parse, advice, reRate, refText, finding, ecgParse, isEcg, _texts: b => textFromImage(b, () => {}),
    tests: T.concat(ECG_TESTS.map(t => ({ key: t.key, name: t.name }))), units: k => (ECG_BY[k] ? [ECG_BY[k].unit] : Object.keys(BY[k].units)) };
})();
