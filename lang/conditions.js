/* Family Health Tracker — long-term conditions per person: choosing them, their screens, test results,
   symptom check-ins, warnings, remedies with personal safety checks, and their PDF page.
   © 2026 Asrar Ahmed Junedi. All rights reserved. */
'use strict';

/* ---- which conditions a person has (older profiles keep their switches: sugar, thyroid, dialysis, BP on) */
const bpOn = p => !!p && p.trackBP !== false;
function hasCond(p, k) {
  if (!p) return false;
  if (k === 'htn') return bpOn(p);
  if (k === 'dm') return !!p.trackSugar;
  if (k === 'thy') return !!p.trackThyroid;
  if (k === 'dial') return !!p.dialysis;
  return (p.conds || []).includes(k);
}
function setConds(p, keys) {
  const set = new Set(keys);
  p.trackBP = set.has('htn'); p.trackSugar = set.has('dm'); p.trackThyroid = set.has('thy'); p.dialysis = set.has('dial');
  p.conds = [...set].filter(k => !['htn', 'dm', 'thy', 'dial'].includes(k));
}
const personConds = p => CONDS.filter(c => hasCond(p, c.k)).concat(WCONDS.filter(c => hasCond(p, c.k))).concat((p.custom || []).map(customCond));
const medGroups = p => { const names = (S.meds || []).filter(m => m.active && m.profileId === p.id).map(m => m.name + ' ' + (m.notes || '')).join(' '); return Object.keys(MED_GROUPS).filter(g => MED_GROUPS[g].test(names)); };

/* ---- the "What should we track?" chooser, used when adding or editing a person */
const COND_GROUPS = [
  { l: 'Common', ks: ['htn', 'dm', 'thy', 'chol'] },
  { l: 'Heart', ks: ['hf', 'chd', 'af', 'inr'] },
  { l: 'Kidneys', ks: ['ckd', 'dial'] },
  { l: 'Lungs', ks: ['asthma', 'copd'] },
  { l: 'Blood and joints', ks: ['anaemia', 'scd', 'thal', 'gout'] },
  { l: 'Cancer', ks: ['cancer'] },
  { l: 'Women’s health', ks: ['period', 'preg', 'pcos', 'meno'], female: true }
];
function condPickerHTML(p, sex) {
  const on = k => (p ? hasCond(p, k) : k === 'htn');
  const lbl = k => (condBy(k) || wcondBy(k) || {}).l || k;
  return `<div class="card" style="padding:12px" id="pf-conds"><b>What should we track?</b><p class="small muted" style="margin:2px 0 8px">Choose everything that applies. You can change this any time.</p>
    ${COND_GROUPS.map(g => `<div class="cond-grp" ${g.female ? 'data-female' : ''} ${g.female && sex !== 'f' ? 'hidden' : ''}><span class="lbl">${g.l}</span><div class="tchips">${g.ks.map(k => `<button type="button" data-cond="${k}" class="${on(k) ? 'on' : ''}" aria-pressed="${on(k)}">${lbl(k)}</button>`).join('')}</div></div>`).join('')}
    <div id="pf-cancer" ${on('cancer') ? '' : 'hidden'} class="card" style="padding:10px;margin-top:8px"><div class="field"><label for="pf-ctype">Type of cancer</label><select class="input" id="pf-ctype">${CANCER_TYPES.map(c => `<option value="${c.k}" ${p && p.cancer && p.cancer.type === c.k ? 'selected' : ''}>${c.l}</option>`).join('')}</select></div>
      <span class="lbl">Treatment now</span><div class="tchips" id="pf-ctx">${CANCER_TX.map(t => `<button type="button" data-tx="${t.k}" class="${p && p.cancer && (p.cancer.tx || []).includes(t.k) ? 'on' : ''}">${t.l}</button>`).join('')}</div>
      <label class="check" style="margin-top:6px"><input type="checkbox" id="pf-carm" ${p && p.cancer && p.cancer.noArm ? 'checked' : ''}> <span>Lymph nodes removed under one arm (no blood pressure on that arm)</span></label></div>
    <div id="pf-inr" ${on('inr') ? '' : 'hidden'} class="grid2" style="margin-top:8px"><div class="field"><label for="pf-inrlo">INR target from</label><input class="input num" id="pf-inrlo" type="number" step="0.1" value="${esc((p && p.inrTarget || [2, 3])[0])}"></div><div class="field"><label for="pf-inrhi">to</label><input class="input num" id="pf-inrhi" type="number" step="0.1" value="${esc((p && p.inrTarget || [2, 3])[1])}"></div></div>
    <div style="margin-top:10px"><span class="lbl">Other condition (your own)</span><div id="pf-custom">${(p && p.custom || []).map(c => customRow(c)).join('')}</div><button type="button" class="btn sm" id="pf-addcustom">+ Add another condition</button></div></div>`;
}
function customRow(c) {
  return `<div class="row cust-row" data-id="${esc(c.id)}" style="margin-top:6px;gap:6px;flex-wrap:wrap"><input class="input" data-f="name" maxlength="40" placeholder="Condition, e.g. Epilepsy" value="${esc(c.name || '')}" style="flex:2;min-width:140px"><input class="input" data-f="measure" maxlength="30" placeholder="What to measure (optional)" value="${esc(c.measure || '')}" style="flex:2;min-width:140px"><input class="input" data-f="unit" maxlength="12" placeholder="Unit" value="${esc(c.unit || '')}" style="flex:1;min-width:70px"><button type="button" class="btn sm" data-rmcust aria-label="Remove">✕</button></div>`;
}
function bindCondPicker(el, getSex) {
  const box = $('#pf-conds', el); if (!box) return;
  $$('[data-cond]', box).forEach(b => b.onclick = () => {
    const on = !b.classList.contains('on'); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on);
    if (b.dataset.cond === 'cancer') $('#pf-cancer', box).hidden = !on;
    if (b.dataset.cond === 'inr') $('#pf-inr', box).hidden = !on;
    if (b.dataset.cond === 'preg' && on) { const m = $('[data-cond="meno"]', box); if (m) { m.classList.remove('on'); } }
  });
  $$('[data-tx]', box).forEach(b => b.onclick = () => b.classList.toggle('on'));
  $('#pf-addcustom', box).onclick = () => { $('#pf-custom', box).insertAdjacentHTML('beforeend', customRow({ id: uid() })); bindCust(); };
  const bindCust = () => $$('[data-rmcust]', box).forEach(b => b.onclick = () => b.closest('.cust-row').remove());
  bindCust();
  // women's health shows only for women
  const show = () => $$('[data-female]', box).forEach(g => { g.hidden = getSex() !== 'f'; });
  $$('#pf-sex button', el).forEach(b => b.addEventListener('click', () => setTimeout(show, 0)));
}
function readCondPicker(el, rec) {
  const box = $('#pf-conds', el); if (!box) return;
  const keys = $$('[data-cond].on', box).map(b => b.dataset.cond).filter(k => rec.sex === 'f' || !wcondBy(k));
  setConds(rec, keys);
  if (keys.includes('cancer')) rec.cancer = { type: $('#pf-ctype', box).value, tx: $$('[data-tx].on', box).map(b => b.dataset.tx), noArm: $('#pf-carm', box).checked };
  if (keys.includes('inr')) { const lo = +$('#pf-inrlo', box).value || 2, hi = +$('#pf-inrhi', box).value || 3; rec.inrTarget = [Math.min(lo, hi), Math.max(lo, hi)]; }
  rec.custom = $$('.cust-row', box).map(r => ({ id: r.dataset.id, name: $('[data-f="name"]', r).value.trim(), measure: $('[data-f="measure"]', r).value.trim(), unit: $('[data-f="unit"]', r).value.trim() })).filter(c => c.name);
}
function customCond(c) {
  return { k: 'custom:' + c.id, l: c.name, custom: c, track: [], labs: [], about: c.measure ? T('Your own condition. Keep notes, symptoms and {m} here, and add the medicines and appointments for it.', { m: c.measure }) : T('Your own condition. Keep notes and symptoms here, and add the medicines and appointments for it.'),
    care: ['Follow the plan from your doctor and keep your medicines and appointments in the app.'], avoid: [], urgent: ['If you feel suddenly much worse, call 997.'], ask: ['What should I watch for?', 'When should I come back?'], remedies: [] };
}

/* ---- test results typed in or read from reports */
async function labSeries(p, key) {
  const out = [];
  try { for (const x of await DB.byProfile(p.id, 'labs')) if (x.k === key) out.push({ ts: x.ts, v: x.v, unit: x.unit, src: x.src || 'manual', id: x.id }); } catch { /* ignore */ }
  for (const d of S.docs || []) for (const r of d.results || []) if (r.key === key) out.push({ ts: d.date ? new Date(d.date + 'T12:00').getTime() : d.created, v: r.value, unit: r.unit, src: 'report', doc: d.id });
  return out.sort((a, b) => b.ts - a.ts);
}
function labName(k) { const t = (typeof BPLab !== 'undefined' && BPLab.tests || []).find(x => x.key === k); return t ? T(t.name) : k; }
function labRate(k, v, unit, p) {
  if (k === 'inr' && p && hasCond(p, 'inr')) { const [lo, hi] = p.inrTarget || [2, 3]; return v < lo ? { flag: 'low', label: 'Below your target' } : v > hi ? { flag: 'high', label: 'Above your target' } : { flag: 'normal', label: 'In your target range' }; }
  try { const r = BPLab.reRate({ key: k, value: v, unit }); return r && r.flag ? { flag: r.flag, label: r.label } : null; } catch { return null; }
}
const FLAG_COLOR = { normal: 'normal', borderline: 'elevated', low: 'low', high: 'stage2', info: 'normal' };
function labSheet(p, key0) {
  const tests = (typeof BPLab !== 'undefined' ? BPLab.tests : []).filter(t => !/^ecg_/.test(t.key));
  const pc = personConds(p), pref = [...new Set(pc.flatMap(c => c.labs || []).concat(cancerMarkers(p)))];
  const order = pref.concat(tests.map(t => t.key).filter(k => !pref.includes(k)));
  let key = key0 || order[0] || 'hb';
  const body = `<div class="small muted">For ${esc(p.name)}</div>
    <div class="field"><label for="lb-k">Test</label><select class="input" id="lb-k">${order.map(k => `<option value="${k}" ${k === key ? 'selected' : ''}>${esc(labName(k))}</option>`).join('')}</select></div>
    <div class="grid2"><div class="field"><label for="lb-v">Result</label><input class="input bpin num" id="lb-v" type="number" inputmode="decimal" step="any"></div><div class="field"><label for="lb-u">Unit</label><select class="input" id="lb-u"></select></div></div>
    <div id="lb-say"></div>
    <div class="field"><label for="lb-d">Date of the test</label><input class="input" id="lb-d" type="date" value="${dayKey(Date.now())}"></div>
    <p class="small muted">Tip: upload the lab report under Test reports and the results are read for you.</p><p class="err" id="lb-err" hidden></p>`;
  const sh = openSheet({ title: 'Add a test result', body, full: true, foot: '<button class="btn" data-close>Cancel</button><button class="btn primary" data-save>Save</button>' });
  const el = sh.el;
  const units = () => { key = $('#lb-k', el).value; const us = BPLab.units ? BPLab.units(key) : ['']; $('#lb-u', el).innerHTML = us.map(u => `<option value="${esc(u)}">${esc(u || '—')}</option>`).join(''); say(); };
  const say = () => {
    const v = parseFloat(String($('#lb-v', el).value).replace(',', '.')), u = $('#lb-u', el).value;
    if (!isFinite(v)) { $('#lb-say', el).innerHTML = ''; return; }
    const r = labRate(key, v, u, p), adv = r ? (BPLab.advice ? BPLab.advice({ key, flag: r.flag, value: v, unit: u }, S.meds) : []) : [];
    $('#lb-say', el).innerHTML = r ? `<div class="guide-box" style="--cat:var(--c-${FLAG_COLOR[r.flag] || 'normal'})"><h3>${esc(tr(r.label))}</h3>${labAbout(key)}${adv.length ? '<ul>' + adv.map(t => `<li>${esc(t)}</li>`).join('') + '</ul>' : ''}</div>` : '';
  };
  $('#lb-k', el).onchange = units; $('#lb-v', el).addEventListener('input', say); $('#lb-u', el).onchange = say; units();
  setTimeout(() => $('#lb-v', el).focus(), 60);
  $('[data-save]', el).onclick = async () => {
    const v = parseFloat(String($('#lb-v', el).value).replace(',', '.'));
    if (!isFinite(v) || v < 0) { const e = $('#lb-err', el); e.textContent = tr('Enter the result as a number.'); e.hidden = false; return; }
    const d = $('#lb-d', el).value || dayKey(Date.now());
    await DB.put('labs', { id: uid(), profileId: p.id, ts: new Date(d + 'T12:00').getTime(), k: key, v, unit: $('#lb-u', el).value, src: 'manual', created: Date.now() });
    sh.close(); toast('Saved'); await loadReadings(); render();
  };
}
/* what each test measures, in one line (shown with every result, normal or not) */
const LAB_ABOUT = {
  creat: 'A waste product cleared by the kidneys; higher means the kidneys filter less.', egfr: 'How well the kidneys filter, in mL per minute; higher is better (90+ is normal).',
  k: 'Potassium keeps the heart rhythm steady; too high or too low can be dangerous.', na: 'Sodium is the body’s salt and water balance.', urea: 'A waste product; rises with dehydration or kidney strain.',
  bun: 'A waste product; rises with dehydration or kidney strain.', fbs: 'Blood sugar after 8 hours without food.', glu: 'Blood sugar at any time of day.',
  a1c: 'The average blood sugar over the last 3 months.', chol: 'All the cholesterol in the blood.', ldl: 'The “bad” cholesterol that clogs arteries; lower is better.',
  hdl: 'The “good” cholesterol; higher is better.', tg: 'Fat in the blood that rises with sugar, sweets and weight.', uric: 'High uric acid causes gout and kidney stones.',
  hb: 'Haemoglobin carries oxygen in red blood cells; low means anaemia.', alt: 'A liver enzyme; high suggests the liver is irritated.', ast: 'A liver and muscle enzyme.',
  tsh: 'The brain’s signal to the thyroid; high usually means underactive, low means overactive.', ft4: 'The main thyroid hormone.', ft3: 'The active thyroid hormone.',
  vitd: 'Vitamin D for bones and muscles.', acr: 'Protein leaking into the urine, an early sign of kidney strain.', inr: 'How long the blood takes to clot; used to adjust warfarin.',
  wbc: 'White cells fight infection.', anc: 'Neutrophils are the main infection-fighting white cells; very low levels need care with fever.', plt: 'Platelets help blood to clot.',
  ferritin: 'The body’s iron store.', ca: 'Calcium for bones, nerves and muscles.', phos: 'Phosphate; builds up when the kidneys are weak.', alb: 'The main blood protein; shows nutrition and liver health.',
  ntbnp: 'Released when the heart is stretched or strained.', psa: 'A protein made by the prostate.', cea: 'A marker used to follow some cancers.', ca153: 'A marker used to follow breast cancer.',
  ca125: 'A marker used to follow ovarian cancer.', ca199: 'A marker used to follow pancreas and bile duct cancers.', afp: 'A marker used to follow liver cancer.', tgb: 'A marker used after thyroid cancer treatment.'
};
const labAbout = k => LAB_ABOUT[k] ? `<p class="small" style="margin:4px 0">${esc(tr(LAB_ABOUT[k]))}</p>` : '';
function cancerMarkers(p) { if (!hasCond(p, 'cancer')) return []; const t = CANCER_TYPES.find(x => x.k === (p.cancer || {}).type); return t ? t.markers : []; }

/* ---- symptom check-in */
function symptomSheet(p, ck) {
  const c = condOf(p, ck); if (!c) return;
  const list = SYMPTOMS[ck] || SYMPTOMS[(c.custom ? 'custom' : '')] || ['How you feel'];
  const LV = ['None', 'Mild', 'Moderate', 'Severe'];
  const body = `<p class="small muted" style="margin-top:0">${esc(T('How has {name} been today?', { name: p.name }))}</p>
    ${list.map(s => `<div class="sym-row" data-s="${esc(s)}"><span class="sym-n">${esc(tr(s))}</span><div class="seg sym-seg">${LV.map((l, i) => `<button type="button" data-l="${i}" class="${i === 0 ? 'on' : ''}">${esc(tr(l))}</button>`).join('')}</div></div>`).join('')}
    ${ck === 'cancer' || ck === 'scd' ? `<div class="field"><label for="sy-t">Temperature °C (optional)</label><input class="input num" id="sy-t" type="number" step="0.1" inputmode="decimal" placeholder="37.0"></div>` : ''}
    <div class="field"><label for="sy-n">Note (optional)</label><input class="input" id="sy-n" maxlength="120"></div><div id="sy-warn"></div>`;
  const sh = openSheet({ title: T('{cond}: symptoms', { cond: tr(c.l) }), body, full: true, foot: '<button class="btn" data-close>Cancel</button><button class="btn primary" data-save>Save</button>' });
  const el = sh.el;
  $$('.sym-seg', el).forEach(g => $$('button', g).forEach(b => b.onclick = () => { $$('button', g).forEach(x => x.classList.toggle('on', x === b)); }));
  $('[data-save]', el).onclick = async () => {
    const items = {}; $$('.sym-row', el).forEach(r => { const on = $('button.on', r); items[r.dataset.s] = on ? +on.dataset.l : 0; });
    const t = $('#sy-t', el) ? parseFloat($('#sy-t', el).value) : NaN;
    await DB.put('symptoms', { id: uid(), profileId: p.id, ts: Date.now(), cond: ck, items, note: $('#sy-n', el).value.trim(), created: Date.now() });
    if (isFinite(t) && t > 30 && t < 45) await DB.put('vitals', { id: uid(), profileId: p.id, ts: Date.now(), k: 'temp', v: Math.round(t * 10) / 10, src: 'manual', note: tr(c.l), created: Date.now() });
    const urgent = Object.entries(items).some(([s, l]) => l >= 2 && SYM_URGENT.test(s)) || (isFinite(t) && t >= 38 && (ck === 'cancer' || ck === 'scd'));
    sh.close(); await loadReadings(); render();
    if (urgent) urgentSheet(c, isFinite(t) && t >= 38 ? (ck === 'cancer' ? 'Temperature 38 °C or higher during cancer treatment can be a serious infection. Call your oncology team or go to the emergency department now.' : 'Fever with sickle cell disease can mean a serious infection. Go to the emergency department now.') : null);
    else toast('Saved');
  };
}
function urgentSheet(c, msg) {
  openSheet({ title: 'Get help now', body: `<div class="em-box"><b>${esc(tr(msg || (c.urgent || [])[0] || ''))}</b></div>${(c.urgent || []).map(u => `<p class="em-urgent">${esc(tr(u))}</p>`).join('')}
    <a class="btn danger block em-call" href="tel:997"><span>Call 997 (Red Crescent)</span></a>`, foot: '<button class="btn primary" data-close>I understand</button>' });
}
const condOf = (p, k) => personConds(p).find(c => c.k === k);

/* ---- warnings worked out from the person's own numbers */
function latestVital(k, days) { return (S.vitals || []).filter(x => x.k === k && x.ts > Date.now() - (days || 3650) * 864e5)[0]; }
function hfAlerts() {
  const w = (S.vitals || []).filter(x => x.k === 'weight').sort((a, b) => b.ts - a.ts); if (w.length < 2) return [];
  const now = w[0], d3 = w.find(x => x.ts <= now.ts - 2.5 * 864e5 && x.ts >= now.ts - 4 * 864e5), d7 = w.find(x => x.ts <= now.ts - 6 * 864e5 && x.ts >= now.ts - 8 * 864e5);
  const out = [];
  if (d3 && now.v - d3.v >= 2) out.push({ lv: 'warn', t: T('Weight is up {kg} kg in 3 days. This can be fluid building up: contact your heart team today.', { kg: Math.round((now.v - d3.v) * 10) / 10 }) });
  else if (d7 && now.v - d7.v >= 2.5) out.push({ lv: 'warn', t: T('Weight is up {kg} kg in a week. Contact your heart team.', { kg: Math.round((now.v - d7.v) * 10) / 10 }) });
  return out;
}
function breathAlerts() {
  const out = [], s = latestVital('spo2', 2), pk = (S.vitals || []).filter(x => x.k === 'peak');
  if (s && s.v < 92) out.push({ lv: s.v < 88 ? 'urgent' : 'warn', t: T('Oxygen {v}%: lower than safe. Use your reliever and get medical help if you are breathless.', { v: s.v }) });
  if (pk.length >= 2) {
    const best = Math.max(...pk.map(x => x.v)), last = pk[0]; const pct = Math.round(last.v / best * 100);
    if (last.ts > Date.now() - 2 * 864e5 && pct < 80) out.push({ lv: pct < 50 ? 'urgent' : 'warn', t: pct < 50 ? T('Peak flow is {p}% of your best (red zone). Use your reliever and call 997 if not better quickly.', { p: pct }) : T('Peak flow is {p}% of your best (yellow zone). Follow your asthma action plan.', { p: pct }) });
  }
  return out;
}
function feverAlerts(p, msg) { const t = latestVital('temp', 1); return t && t.v >= 38 ? [{ lv: 'urgent', t: tr(msg) + ' (' + t.v + ' °C)' }] : []; }
function cancerAlerts(p) {
  const out = []; const onChemo = p.cancer && (p.cancer.tx || []).some(x => ['chemo', 'oral', 'targeted'].includes(x));
  if (onChemo) out.push(...feverAlerts(p, 'Temperature 38 °C or higher during cancer treatment can be a serious infection. Call your oncology team or go to the emergency department now.'));
  return out;
}
async function inrAlerts(p) {
  const s = await labSeries(p, 'inr'); if (!s.length) return [];
  const [lo, hi] = p.inrTarget || [2, 3], v = s[0].v;
  if (v >= 5) return [{ lv: 'urgent', t: T('INR {v} is very high: contact your INR clinic or doctor today; get emergency help for any bleeding.', { v }) }];
  if (v > hi) return [{ lv: 'warn', t: T('INR {v} is above your target ({lo}–{hi}). Contact your INR clinic for dose advice.', { v, lo, hi }) }];
  if (v < lo) return [{ lv: 'warn', t: T('INR {v} is below your target ({lo}–{hi}). Contact your INR clinic for dose advice.', { v, lo, hi }) }];
  return [];
}
async function labAlerts(p) {
  const out = [], chk = async (k, f) => { const s = await labSeries(p, k); if (s.length && s[0].ts > Date.now() - 45 * 864e5) { const m = f(s[0].v, s[0].unit); if (m) out.push(m); } };
  if (hasCond(p, 'ckd') || hasCond(p, 'dial') || hasCond(p, 'hf')) await chk('k', v => v >= 6 ? { lv: 'urgent', t: T('Potassium {v} is dangerously high. Contact your doctor now or go to the emergency department.', { v }) } : v >= 5.5 ? { lv: 'warn', t: T('Potassium {v} is high. Contact your doctor about diet and medicines.', { v }) } : null);
  if (hasCond(p, 'cancer')) {
    await chk('anc', v => v < 0.5 ? { lv: 'warn', t: T('Neutrophils {v}: very low. Avoid infection and check your temperature if unwell; 38 °C or higher is an emergency.', { v }) } : null);
    await chk('plt', v => v < 50 ? { lv: 'warn', t: T('Platelets {v}: low. Avoid injury, use a soft toothbrush, and get help for bleeding.', { v }) } : null);
  }
  return out;
}
async function condAlerts(p) {
  const out = [];
  for (const c of personConds(p)) if (c.alerts) { try { for (const a of await c.alerts(p)) out.push(Object.assign({ c }, a)); } catch { /* ignore */ } }
  for (const a of await labAlerts(p)) out.push(a);
  return out;
}

/* ---- remedies with this person's own safety checks */
function remedyHTML(p, keys) {
  const groups = medGroups(p), mine = new Set(personConds(p).map(c => c.k)); if (hasCond(p, 'preg')) mine.add('preg');
  const groupWord = { thin: 'blood thinner', dm: 'diabetes medicine', bp: 'blood pressure medicine', k: 'medicine that raises potassium', heart: 'heart rhythm medicine', statin: 'cholesterol medicine', thy: 'thyroid medicine', chemo: 'cancer medicine' };
  return `<p class="small" style="margin:0 0 8px"><b>${esc(tr('Most of these have limited evidence. They do not replace your medicines. Tell your doctor before trying any, and never stop prescribed medicine.'))}</b></p>` +
    keys.map(k => REMEDIES[k]).filter(Boolean).map(r => {
      const why = [];
      for (const a of r.avoid || []) if (mine.has(a)) why.push(a === 'preg' ? tr('pregnancy') : tr((condBy(a) || wcondBy(a) || { l: a }).l));
      for (const g of r.meds || []) if (groups.includes(g)) why.push(T('your {med}', { med: tr(groupWord[g]) }));
      return `<div class="rem ${why.length ? 'rem-no' : ''}"><b>${esc(tr(r.n))}</b>${why.length ? `<span class="rem-flag">${esc(T('Not advised for {name}: {why}', { name: p.name, why: why.join(', ') }))}</span>` : ''}<p class="small" style="margin:2px 0">${esc(tr(r.use))}</p><p class="small muted" style="margin:0">${esc(tr(r.caution))}</p></div>`;
    }).join('');
}

/* ---- Today screen card and the condition screen */
async function conditionsCard(p) {
  const pc = personConds(p).filter(c => !(c.women && c.k !== 'pcos' && c.k !== 'meno'));
  const al = await condAlerts(p);
  if (!pc.length && !al.length) return `<div class="card"><div class="row"><h2 style="margin:0">Conditions</h2><span class="spacer"></span><button class="btn sm" data-act="edit-person" data-id="${p.id}">+ Add</button></div><p class="small muted" style="margin:8px 0 0">Add long-term conditions (kidney, heart, lungs, cancer and more) to get their tracking, reminders, precautions and guidance.</p></div>`;
  const rows = [];
  for (const c of pc) rows.push(`<button class="mrow" data-cond-open="${esc(c.k)}"><span class="mic">${COND_ICON}</span><span style="min-width:0;flex:1"><b>${esc(tr(c.l))}</b><br><span class="small muted">${esc(await condStatus(p, c))}</span></span><span class="small muted">›</span></button>`);
  return `<div class="card"><div class="row"><h2 style="margin:0">Conditions</h2><span class="spacer"></span><button class="btn sm" data-act="edit-person" data-id="${p.id}">Edit</button></div>
    ${al.map(a => `<div class="cond-alert ${a.lv}"><b>${esc(a.t)}</b>${a.lv === 'urgent' ? ' <a class="btn sm danger" href="tel:997">997</a>' : ''}</div>`).join('')}
    ${rows.length ? `<div class="mlist">${rows.join('')}</div>` : ''}</div>`;
}
async function condStatus(p, c) {
  if (c.custom) return c.custom.measure ? T('Track: {m}', { m: c.custom.measure }) : tr('Notes, symptoms, medicines and appointments');
  for (const k of (c.labs || []).concat(c.k === 'cancer' ? cancerMarkers(p) : [])) {
    const s = await labSeries(p, k); if (s.length) { const r = labRate(k, s[0].v, s[0].unit, p); return `${labName(k)} ${s[0].v}${s[0].unit ? ' ' + s[0].unit : ''}${r ? ' · ' + tr(r.label) : ''} (${fmtDate(s[0].ts, { day: 'numeric', month: 'short' })})`; }
  }
  return tr('Tap for tracking, precautions and guidance');
}
const COND_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 4h6v5h5v6h-5v5H9v-5H4V9h5z" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>';
async function condSheet(k) {
  const p = cur(); if (!p) return; const c = condOf(p, k); if (!c) return;
  if (c.women && WOMEN_SCREENS[k]) return WOMEN_SCREENS[k](p);
  const al = (await condAlerts(p)).filter(a => !a.c || a.c.k === k);
  const labs = [...new Set((c.labs || []).concat(k === 'cancer' ? cancerMarkers(p) : []))];
  const tiles = [];
  for (const lk of labs) {
    const s = await labSeries(p, lk); if (!s.length) continue;
    const r = labRate(lk, s[0].v, s[0].unit, p), prev = s[1];
    tiles.push(`<button class="hk-tile" data-lab-hist="${lk}"><span class="small muted">${esc(labName(lk))}</span><b class="num" style="color:var(--c-${FLAG_COLOR[r ? r.flag : 'normal'] || 'normal'})">${s[0].v}<small> ${esc(s[0].unit || '')}</small></b><span class="small">${r ? esc(tr(r.label)) : ''}${prev ? ` · <span class="muted num">${prev.v} ${esc(fmtDate(prev.ts, { month: 'short', year: '2-digit' }))}</span>` : ''}</span></button>`);
  }
  const syms = (await DB.byProfile(p.id, 'symptoms').catch(() => [])).filter(x => x.cond === k).sort((a, b) => b.ts - a.ts).slice(0, 5);
  const ct = k === 'cancer' && p.cancer ? CANCER_TYPES.find(x => x.k === p.cancer.type) : null;
  const tx = k === 'cancer' && p.cancer ? (p.cancer.tx || []) : [];
  const body = `${ct ? `<p class="small" style="margin-top:0"><b>${esc(tr(ct.l))}</b>${tx.length ? ' · ' + tx.map(x => esc(tr((CANCER_TX.find(t => t.k === x) || {}).l || x))).join(', ') : ''}</p>` : ''}
    <p style="margin-top:0">${esc(tr(c.about))}</p>
    ${al.map(a => `<div class="cond-alert ${a.lv}"><b>${esc(a.t)}</b></div>`).join('')}
    <div class="btn-row" style="flex-wrap:wrap"><button class="btn sm primary" data-cnd="lab">+ Test result</button><button class="btn sm" data-cnd="sym">Symptom check-in</button><button class="btn sm" data-cnd="appt">${k === 'cancer' ? '+ Treatment session' : k === 'dial' ? '+ Dialysis session' : '+ Appointment'}</button><button class="btn sm" data-cnd="med">+ Medicine</button></div>
    ${tiles.length ? `<h3 class="sec-h">Your results</h3><div class="hk-grid">${tiles.join('')}</div>` : labs.length ? `<p class="small muted">${esc(T('Tests to track: {list}', { list: labs.map(labName).join(', ') }))}</p>` : ''}
    ${syms.length ? `<h3 class="sec-h">Recent symptoms</h3><div class="small">${syms.map(sy => { const bad = Object.entries(sy.items).filter(([, l]) => l > 0); return `<div class="sym-log"><span class="muted">${esc(fmtDate(sy.ts, { day: 'numeric', month: 'short' }))}</span> ${bad.length ? bad.map(([s, l]) => `${esc(tr(s))} <b>${esc(tr(['None', 'Mild', 'Moderate', 'Severe'][l]))}</b>`).join(', ') : esc(tr('No symptoms'))}${sy.note ? ' · ' + esc(sy.note) : ''}</div>`; }).join('')}</div>` : ''}
    ${condInfoHTML(p, c)}`;
  const sh = openSheet({ title: tr(c.l), body, full: true, foot: '<button class="btn primary" data-close>Close</button>' });
  sh.el.addEventListener('click', e => {
    const b = e.target.closest('[data-cnd],[data-lab-hist]'); if (!b) return;
    if (b.dataset.labHist) { labHistSheet(p, b.dataset.labHist); return; }
    const a = b.dataset.cnd; sh.close();
    if (a === 'lab') labSheet(p, labs[0]);
    else if (a === 'sym') symptomSheet(p, k);
    else if (a === 'appt') apptSheet(null, k === 'cancer' ? (tx.includes('radio') && !tx.includes('chemo') ? 'radio' : 'chemo') : k === 'dial' ? 'dialysis' : 'doctor');
    else if (a === 'med') medSheet();
  });
}
function condInfoHTML(p, c) {
  const sec = (t, list, cls) => list && list.length ? `<details class="tipbox ${cls || ''}" ${cls === 'urgent-box' ? 'open' : ''}><summary>${esc(tr(t))}</summary><ul class="tips">${list.map(x => `<li>${esc(tr(x))}</li>`).join('')}</ul></details>` : '';
  let extra = [];
  if (c.k === 'cancer' && p.cancer) extra = cancerTxCare(p.cancer.tx || [], p.cancer.type);
  return `<h3 class="sec-h">Guidance</h3>${sec('Warning signs: get help now', c.urgent, 'urgent-box')}${sec('Daily care at home', (c.care || []).concat(extra))}${sec('Precautions: what to avoid', c.avoid)}${sec('Questions to ask your doctor', c.ask)}
    ${(c.remedies || []).length ? `<details class="tipbox"><summary>${esc(tr('Home remedies, Ayurveda and traditional options'))}</summary>${remedyHTML(p, c.remedies)}</details>` : ''}`;
}
function cancerTxCare(tx, type) {
  const out = [];
  if (tx.includes('chemo') || tx.includes('oral')) out.push('Chemotherapy: blood counts are usually lowest 7 to 14 days after each dose; be extra careful about infection then.', 'Take anti-sickness medicine before you feel sick, as prescribed; eat small dry meals; ginger may help.', 'Chemotherapy tablets: wash hands after handling, never crush them, and keep them away from children and pregnant women.');
  if (tx.includes('radio')) out.push('Radiotherapy: wash the treated skin gently with lukewarm water and mild soap, pat dry, wear loose cotton, and use only creams your team approves.', 'Tiredness often builds during radiotherapy; short walks and rest help.');
  if (tx.includes('surgery')) out.push('After surgery: keep the wound clean and dry; report redness, heat, discharge or fever.');
  if (tx.includes('hormone')) out.push('Hormone tablets: take them every day for the full time prescribed; ask about bone health and hot flushes.');
  if (tx.includes('targeted')) out.push('Targeted or immunotherapy: report new diarrhoea, rash, cough, breathlessness or yellow skin early; these side effects need prompt treatment.');
  if (type === 'breast') out.push('If lymph nodes were removed: avoid blood pressure cuffs, injections and blood tests on that arm, and watch for arm swelling.');
  if (type === 'headneck') out.push('Head and neck treatment: keep up mouth care, sip water often, and see the dentist as your team advises.');
  if (type === 'thyroid') out.push('After thyroid cancer: take thyroxine every day as prescribed; TSH and thyroglobulin tests guide follow-up.');
  return out;
}
function labHistSheet(p, k) {
  labSeries(p, k).then(s => openSheet({ title: labName(k), full: true, body: `${labAbout(k)}${s.length > 1 ? vitalChart(s.slice(0, 30).reverse().map(x => ({ ts: x.ts, v: x.v }))) : ''}<div class="mlist">${s.map(x => { const r = labRate(k, x.v, x.unit, p); return `<div class="mrow" style="cursor:default"><span style="flex:1"><b class="num">${x.v} ${esc(x.unit || '')}</b> ${r ? `<span class="pill" style="--cat:var(--c-${FLAG_COLOR[r.flag] || 'normal'})">${esc(tr(r.label))}</span>` : ''}<br><span class="small muted">${esc(fmtDate(x.ts, { day: 'numeric', month: 'short', year: 'numeric' }))} · ${esc(tr(x.src === 'report' ? 'From a report' : 'Typed in'))}</span></span>${x.id ? `<button class="btn sm" data-labdel="${esc(x.id)}" aria-label="Delete">✕</button>` : ''}</div>`; }).join('')}</div>`,
    foot: `<button class="btn" data-close>Close</button><button class="btn primary" data-labadd="${k}">Add result</button>` }));
}
document.addEventListener('click', async e => {
  const t = e.target.closest('[data-cond-open],[data-labdel],[data-labadd],[data-hcheck]'); if (!t) return;
  if (t.dataset.condOpen) condSheet(t.dataset.condOpen);
  else if (t.dataset.labdel) { if (await confirmSheet('Delete?', 'Delete this result?', 'Delete', true)) { await DB.del('labs', t.dataset.labdel); const top = sheetStack[sheetStack.length - 1]; if (top) top.close(); await loadReadings(); render(); } }
  else if (t.dataset.labadd) { const top = sheetStack[sheetStack.length - 1]; if (top) top.close(); labSheet(cur(), t.dataset.labadd); }
});

/* ---- PDF page for conditions */
async function pdfCondPage(c0, p, from, to) {
  const pc = personConds(p).filter(c => !['htn', 'dm', 'thy'].includes(c.k));
  const labsAll = []; for (const k of [...new Set(pc.flatMap(c => (c.labs || []).concat(c.k === 'cancer' ? cancerMarkers(p) : [])))]) for (const x of await labSeries(p, k)) if (x.ts >= from - 365 * 864e5 && x.ts <= to + 864e5) labsAll.push(Object.assign({ k }, x));
  const syms = (await DB.byProfile(p.id, 'symptoms').catch(() => [])).filter(x => x.ts >= from && x.ts <= to + 864e5).sort((a, b) => b.ts - a.ts);
  if (!pc.length && !labsAll.length && !syms.length) return;
  const { doc, put, M, INK, MUTED, LINE } = c0;
  doc.addPage(); let y = 20;
  put('Long-term conditions', M, y, 14, INK, true); y += 6;
  for (const c of pc) {
    let line = c.l;
    if (c.k === 'cancer' && p.cancer) { const t = CANCER_TYPES.find(x => x.k === p.cancer.type); line += ': ' + (t ? t.l : '') + ((p.cancer.tx || []).length ? ' (' + p.cancer.tx.map(x => (CANCER_TX.find(z => z.k === x) || {}).l).join(', ') + ')' : ''); }
    if (c.k === 'inr') line += ` (target ${(p.inrTarget || [2, 3]).join('–')})`;
    if (c.custom && c.custom.measure) line += ` (tracking ${c.custom.measure}${c.custom.unit ? ', ' + c.custom.unit : ''})`;
    put('• ' + line, M, y, 10, INK); y += 5;
  }
  if (labsAll.length) {
    doc.autoTable({ startY: y + 2, head: [['Date', 'Test', 'Result', 'Assessment', 'Source']],
      body: labsAll.sort((a, b) => a.k.localeCompare(b.k) || b.ts - a.ts).slice(0, 120).map(x => { const r = labRate(x.k, x.v, x.unit, p); return [fmtDate(x.ts, { day: '2-digit', month: 'short', year: 'numeric' }), labName(x.k), x.v + (x.unit ? ' ' + x.unit : ''), r ? r.label : '', x.src === 'report' ? 'Lab report' : 'Typed']; }),
      margin: { left: M, right: M, bottom: 20 }, theme: 'grid', styles: { fontSize: 8.5, cellPadding: 1.5, textColor: INK, lineColor: LINE, lineWidth: 0.15 }, headStyles: { fillColor: [11, 110, 105], textColor: [255, 255, 255] } });
    y = doc.lastAutoTable.finalY + 6;
  }
  if (syms.length) {
    if (y > 250) { doc.addPage(); y = 20; }
    put('Symptom check-ins', M, y, 11, INK, true); y += 2;
    doc.autoTable({ startY: y + 2, head: [['Date', 'Condition', 'Symptoms (mild / moderate / severe)', 'Note']],
      body: syms.slice(0, 80).map(s => { const c = condOf(p, s.cond); const bad = Object.entries(s.items).filter(([, l]) => l > 0).map(([n, l]) => n + ' (' + ['', 'mild', 'moderate', 'severe'][l] + ')'); return [fmtDate(s.ts, { day: '2-digit', month: 'short' }) + ', ' + fmtTime(s.ts), c ? c.l : s.cond, bad.join(', ') || 'None', s.note || '']; }),
      margin: { left: M, right: M, bottom: 20 }, theme: 'grid', styles: { fontSize: 8.5, cellPadding: 1.5, textColor: INK, lineColor: LINE, lineWidth: 0.15 }, headStyles: { fillColor: [120, 130, 135], textColor: [255, 255, 255] } });
  }
}
