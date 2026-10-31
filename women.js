/* Family Health Tracker — women's health: periods and ovulation, pregnancy, PCOS and menopause.
   Estimates only: not a method of contraception or a diagnosis. © 2026 Asrar Ahmed Junedi. All rights reserved. */
'use strict';

const WCONDS = [
  { k: 'period', l: 'Periods and ovulation', women: true, track: [], labs: ['hb', 'ferritin'],
    about: 'Log the first day of each period. The app learns your cycle and estimates your next period, fertile days and ovulation.',
    care: ['Day 1 of your cycle is the first day of real bleeding (red flow that needs a pad). Light spotting before it does not count.', 'Ovulation is usually about 14 days before the next period. Signs: clear, stretchy “egg-white” discharge, a positive ovulation (LH) test, mild one-sided pain, and a small rise in morning temperature afterwards.', 'Most cycles are 21 to 35 days long; periods last 2 to 7 days.', 'Heavy periods can cause anaemia: eat iron-rich food and ask about an iron test if you feel tired.'],
    avoid: ['Relying on these estimates to avoid pregnancy: they are not a contraceptive method.'],
    urgent: ['Soaking a pad every hour for 2 hours or more, fainting, or severe sudden pain in the lower tummy (especially if pregnancy is possible): get urgent help.'],
    ask: ['My cycles are irregular or very painful: could it be PCOS, fibroids or endometriosis?', 'Do I need an iron test?'],
    remedies: ['ginger', 'dates', 'methi'] },
  { k: 'preg', l: 'Pregnancy', women: true, track: ['bp', 'weight'], labs: ['hb', 'fbs', 'tsh'],
    about: 'Follow your pregnancy week by week, with the usual visits and scans, warning signs, and safe-medicine checks.',
    care: ['Take folic acid 400 micrograms daily until 12 weeks (or the dose your doctor gives), and other vitamins as prescribed.', 'Keep all antenatal visits and scans.', 'Check blood pressure at home if your doctor asks; report 140/90 or higher.', 'Eat well-cooked meat and eggs, washed vegetables, pasteurised dairy; limit coffee to about 2 cups a day.', 'From 24 weeks, get to know your baby’s movements every day.'],
    avoid: ['Ibuprofen and other painkillers like it, especially after 20 weeks; paracetamol is usually preferred: ask first.', 'Herbal medicines, including many Ayurvedic and traditional remedies, unless your doctor agrees.', 'Smoking, shisha, alcohol, raw or undercooked meat, liver and unpasteurised cheese.', 'Stopping regular medicines (for epilepsy, thyroid, blood pressure) without your doctor.'],
    urgent: ['Bleeding, fluid leaking, severe tummy pain, a bad headache with blurred vision or swelling of face and hands, fever, fits, or the baby moving less than usual: contact the maternity unit or call 997 now. Do not wait until the next day.'],
    ask: ['When are my scans and the sugar test?', 'Are all my medicines safe in pregnancy?', 'What blood pressure should I report?'],
    remedies: ['ginger', 'dates', 'honey'] },
  { k: 'pcos', l: 'PCOS (polycystic ovary syndrome)', women: true, track: ['weight', 'waist', 'bp', 'sugar'], labs: ['a1c', 'fbs', 'chol', 'tg', 'ldl'],
    about: 'A common hormone condition causing irregular periods, extra hair or acne, and a higher risk of diabetes. Lifestyle and treatment help a lot.',
    care: ['Track your periods: going more than 3 months without one needs a doctor’s review.', 'Losing 5 to 10% of body weight often makes periods more regular.', 'Choose low-sugar, high-fibre food and be active 150 minutes a week.', 'Check sugar (HbA1c) and cholesterol as your doctor advises.'],
    avoid: ['Crash diets and sugary drinks.', 'Herbal hormone products without advice.'],
    urgent: ['Very heavy bleeding or fainting: get urgent help.'],
    ask: ['Do I need tests for diabetes and cholesterol?', 'What are my options for irregular periods, hair growth or fertility?'],
    remedies: ['cinnamon', 'methi', 'spearmint', 'isabgol'] },
  { k: 'meno', l: 'Menopause', women: true, track: ['weight', 'bp'], labs: ['vitd', 'chol', 'ldl'],
    about: 'Periods stop and hormones change, often with hot flushes, poor sleep and mood changes. Bones and heart need extra care.',
    care: ['Keep a symptom check-in to show your doctor.', 'Weight-bearing exercise (walking, stairs) and calcium and vitamin D keep bones strong.', 'Layered cotton clothes, a fan and avoiding spicy food and hot drinks can ease hot flushes.', 'Ask about hormone therapy or non-hormone treatments if symptoms affect your life.'],
    avoid: ['Herbal “menopause” supplements without advice; some affect the liver or interact with medicines.', 'Smoking.'],
    urgent: ['Any bleeding after 12 months without periods must be checked by a doctor soon.'],
    ask: ['Is hormone therapy right for me?', 'Do I need a bone density scan?'],
    remedies: ['pranayama', 'stjohns'] }
];
const wcondBy = k => WCONDS.find(c => c.k === k);
REMEDIES.spearmint = { n: 'Spearmint tea (na’na)', use: 'Two cups a day reduced extra hair growth slightly in small PCOS studies.', caution: 'Generally safe as a tea; avoid large amounts in pregnancy.', avoid: ['preg'] };
SYMPTOMS.period = ['Cramps', 'Heavy flow', 'Headache', 'Mood changes', 'Breast tenderness'];
SYMPTOMS.preg = ['Nausea', 'Headache', 'Swelling of face or hands', 'Blurred vision', 'Tummy pain', 'Bleeding', 'Less baby movement'];
SYMPTOMS.pcos = ['Irregular periods', 'Acne', 'Extra hair growth', 'Low mood'];
SYMPTOMS.meno = ['Hot flushes', 'Night sweats', 'Poor sleep', 'Low mood', 'Joint pain', 'Vaginal dryness'];

/* ---- periods: stored as {type:'period'|'spot'|'lh'|'bbt'|'mucus', day:'YYYY-MM-DD'} in the 'women' store */
const dayMs = 864e5, dk = t => dayKey(t), dt = d => new Date(d + 'T12:00').getTime();
async function womenLog(p) { try { return (await DB.byProfile(p.id, 'women')).sort((a, b) => a.day.localeCompare(b.day)); } catch { return []; } }
function cycleInfo(log) {
  const starts = log.filter(x => x.type === 'period').map(x => x.day);
  const lens = []; for (let i = 1; i < starts.length; i++) { const d = Math.round((dt(starts[i]) - dt(starts[i - 1])) / dayMs); if (d >= 15 && d <= 60) lens.push(d); }
  const recent = lens.slice(-6), len = recent.length ? Math.round(recent.reduce((a, b) => a + b, 0) / recent.length) : 28;
  const irregular = recent.length >= 3 && (Math.max(...recent) - Math.min(...recent) > 9 || recent.some(x => x < 21 || x > 35));
  if (!starts.length) return { none: true, len };
  const last = starts[starts.length - 1], next = dt(last) + len * dayMs, ov = next - 14 * dayMs;
  return { last, len, next, ov, fert: [ov - 5 * dayMs, ov + dayMs], day: Math.floor((Date.now() - dt(last)) / dayMs) + 1, irregular, count: lens.length, late: Math.floor((Date.now() - next) / dayMs) };
}
function periodCardHTML(p, ci) {
  if (ci.none) return `<p class="small muted" style="margin:6px 0 0">Tap “Log” on the first day of your next period. After two periods the app can estimate your cycle.</p>`;
  const f = t => fmtDate(t, { day: 'numeric', month: 'short' });
  const nextIn = Math.ceil((ci.next - Date.now()) / dayMs);
  return `<div class="small" style="margin-top:6px"><b>${esc(T('Day {d} of your cycle', { d: ci.day }))}</b> · ${ci.late > 0 ? `<span style="color:var(--c-stage1);font-weight:700">${esc(T('Period is {n} days late', { n: ci.late }))}</span>` : esc(T('Next period in about {n} days ({date})', { n: Math.max(0, nextIn), date: f(ci.next) }))}</div>
    <div class="small muted">${esc(T('Fertile days: {a} to {b} · ovulation around {c}', { a: f(ci.fert[0]), b: f(ci.fert[1]), c: f(ci.ov) }))}</div>`;
}
async function periodSheet(p) {
  const c = wcondBy('period'), log = await womenLog(p), ci = cycleInfo(log);
  const f = t => fmtDate(t, { day: 'numeric', month: 'short' });
  // a 5-week calendar from the start of this week
  const start = new Date(); start.setHours(12, 0, 0, 0); start.setDate(start.getDate() - start.getDay());
  const per = new Set(log.filter(x => x.type === 'period').map(x => x.day)), spot = new Set(log.filter(x => x.type === 'spot').map(x => x.day));
  const predicted = d => { if (ci.none) return false; for (let k = 0; k < 3; k++) { const n = ci.next + k * ci.len * dayMs; if (d >= n && d < n + 5 * dayMs) return true; } return false; };
  const fertile = d => { if (ci.none) return ''; for (let k = 0; k < 3; k++) { const ov = ci.ov + k * ci.len * dayMs; if (Math.abs(d - ov) < dayMs / 2) return 'ov'; if (d >= ov - 5 * dayMs && d <= ov + dayMs) return 'fe'; } return ''; };
  let cal = '<div class="pcal">' + WD.map(w => `<span class="pcal-h">${esc(tr(w))}</span>`).join('');
  for (let i = 0; i < 35; i++) {
    const d = start.getTime() + i * dayMs, key = dk(d), today = key === dk(Date.now());
    const cls = per.has(key) ? 'per' : spot.has(key) ? 'spot' : predicted(d) ? 'pred' : fertile(d);
    cal += `<span class="pcal-d ${cls} ${today ? 'today' : ''}">${new Date(d).getDate()}</span>`;
  }
  cal += '</div><div class="pcal-key small"><span><i class="per"></i>Period</span><span><i class="pred"></i>Expected period</span><span><i class="fe"></i>Fertile days</span><span><i class="ov"></i>Ovulation (estimate)</span></div>';
  const body = `${periodCardHTML(p, ci)}${ci.irregular ? `<div class="cond-alert warn"><b>${esc(tr('Your cycles vary a lot or are shorter than 21 or longer than 35 days. Show this to your doctor; it can be a sign of PCOS or a thyroid problem.'))}</b></div>` : ''}
    ${ci.late >= 7 ? `<div class="cond-alert warn"><b>${esc(tr('If there is any chance of pregnancy, take a pregnancy test.'))}</b></div>` : ''}
    ${cal}
    <h3 class="sec-h">Log for today</h3>
    <div class="btn-row" style="flex-wrap:wrap"><button class="btn sm primary" data-wl="period">Period started</button><button class="btn sm" data-wl="spot">Spotting</button><button class="btn sm" data-wl="lh">Ovulation test positive</button><button class="btn sm" data-wl="mucus">Egg-white discharge</button><button class="btn sm" data-wl="bbt">Morning temperature</button></div>
    <div class="grid2" style="margin-top:8px"><div class="field"><label for="wl-day">Date</label><input class="input" type="date" id="wl-day" value="${dk(Date.now())}"></div><div class="field"><label for="wl-bbt">Morning temperature °C</label><input class="input num" type="number" step="0.01" inputmode="decimal" id="wl-bbt" placeholder="36.4"></div></div>
    ${log.length ? `<h3 class="sec-h">Recent</h3><div class="small">${log.slice(-12).reverse().map(x => `<div class="sym-log"><span class="muted">${esc(f(dt(x.day)))}</span> ${esc(tr({ period: 'Period started', spot: 'Spotting', lh: 'Ovulation test positive', mucus: 'Egg-white discharge', bbt: 'Morning temperature' }[x.type] || x.type))}${x.v ? ' ' + x.v + ' °C' : ''} <button class="linkbtn" data-wldel="${esc(x.id)}">${esc(tr('Remove'))}</button></div>`).join('')}</div>` : ''}
    <div class="btn-row"><button class="btn sm" data-cnd2="sym">Symptom check-in</button></div>
    ${condInfoHTML(p, c)}`;
  const sh = openSheet({ title: tr(c.l), body, full: true, foot: '<button class="btn primary" data-close>Close</button>' });
  sh.el.addEventListener('click', async e => {
    const b = e.target.closest('[data-wl],[data-wldel],[data-cnd2]'); if (!b) return;
    if (b.dataset.cnd2) { sh.close(); symptomSheet(p, 'period'); return; }
    if (b.dataset.wldel) { await DB.del('women', b.dataset.wldel); sh.close(); periodSheet(p); return; }
    const day = $('#wl-day', sh.el).value || dk(Date.now()), type = b.dataset.wl; let v = null;
    if (type === 'bbt') { v = parseFloat($('#wl-bbt', sh.el).value); if (!isFinite(v) || v < 34 || v > 40) { toast('Type the morning temperature first.'); $('#wl-bbt', sh.el).focus(); return; } }
    await DB.put('women', { id: uid(), profileId: p.id, type, day, v, created: Date.now() });
    toast('Saved'); sh.close(); await loadReadings(); render(); periodSheet(p);
  });
}

/* ---- pregnancy */
const PREG_PLAN = [
  { w: [6, 10], k: 'booking', l: 'First antenatal (booking) visit', d: 'Blood and urine tests, blood pressure, weight and your history.' },
  { w: [11, 14], k: 'dating', l: 'Dating scan (11 to 14 weeks)', d: 'Confirms the due date and number of babies; screening for Down syndrome can be offered.', scan: true },
  { w: [16, 16], k: 'v16', l: 'Antenatal visit (16 weeks)', d: 'Blood pressure, urine and test results.' },
  { w: [18, 22], k: 'anomaly', l: 'Anomaly scan (18 to 22 weeks)', d: 'A detailed scan of the baby’s growth and organs.', scan: true },
  { w: [24, 28], k: 'ogtt', l: 'Sugar test (OGTT, 24 to 28 weeks)', d: 'Checks for diabetes in pregnancy.' },
  { w: [28, 28], k: 'v28', l: 'Antenatal visit (28 weeks)', d: 'Blood tests for anaemia; anti-D injection if your blood group is Rh negative.' },
  { w: [27, 36], k: 'tdap', l: 'Whooping cough vaccine (27 to 36 weeks)', d: 'Protects the baby in the first months.' },
  { w: [32, 34], k: 'growth', l: 'Growth scan, if your doctor advises (32 to 34 weeks)', d: 'Checks the baby’s size and position.', scan: true },
  { w: [34, 34], k: 'v34', l: 'Antenatal visit (34 weeks)', d: 'Blood pressure, urine and the baby’s growth.' },
  { w: [36, 36], k: 'v36', l: 'Antenatal visit (36 weeks)', d: 'The baby’s position and your birth plan.' },
  { w: [38, 38], k: 'v38', l: 'Antenatal visit (38 weeks)', d: 'Checks and signs of labour.' },
  { w: [40, 40], k: 'v40', l: 'Antenatal visit (40 weeks)', d: 'If you have not given birth yet.' },
  { w: [41, 41], k: 'v41', l: 'Antenatal visit (41 weeks)', d: 'Discussion about starting labour (induction).' }
];
const PREG_STAGES = [
  [4, 'The baby’s heart, brain and spine begin to form. Take folic acid every day.'], [9, 'All the main organs are forming. Nausea is common; small frequent meals and ginger help.'],
  [14, 'Second trimester: nausea usually eases and energy returns. The baby starts to move, though you may not feel it yet.'], [18, 'You may start feeling the baby move between 18 and 22 weeks. The anomaly scan is due.'],
  [23, 'The baby is growing fast and responds to sound. Watch for headaches, swelling and blood pressure changes.'], [28, 'Third trimester: get to know your baby’s movement pattern every day. Report reduced movements at once.'],
  [33, 'The baby is gaining weight and turning head-down. Prepare your hospital bag.'], [37, 'Full term from 37 weeks. Know the signs of labour: regular painful tightenings, waters breaking, or a bloody show.'], [41, 'Overdue: your doctor will discuss starting labour.']
];
const PREG_BAD_MEDS = /lisinopril|enalapril|ramipril|perindopril|captopril|losartan|valsartan|irbesartan|telmisartan|candesartan|olmesartan|atorvastatin|simvastatin|rosuvastatin|warfarin|methotrexate|isotretinoin|roaccutane|valpro|depakine|mycophenolate|tetracycline|doxycycline|finasteride|spironolactone/i;
function pregInfo(p) {
  const lmp = p.preg && p.preg.lmp; if (!lmp) return null;
  const days = Math.floor((Date.now() - dt(lmp)) / dayMs), w = Math.floor(days / 7), d = days % 7, edd = dt(lmp) + 280 * dayMs;
  return { lmp, days, w, d, edd, tri: w < 14 ? 1 : w < 28 ? 2 : 3, left: Math.ceil((edd - Date.now()) / dayMs) };
}
function pregCardHTML(p) {
  const g = pregInfo(p);
  if (!g) return `<p class="small muted" style="margin:6px 0 0">Open to enter the first day of the last period or the due date.</p>`;
  const next = PREG_PLAN.find(x => x.w[1] >= g.w);
  return `<div class="small" style="margin-top:6px"><b>${esc(T('Week {w} + {d} days · trimester {t}', { w: g.w, d: g.d, t: g.tri }))}</b> · ${esc(T('due {date}', { date: fmtDate(g.edd, { day: 'numeric', month: 'short', year: 'numeric' }) }))}</div>
    <div class="preg-bar"><i style="width:${Math.min(100, g.days / 280 * 100).toFixed(1)}%"></i></div>
    ${next ? `<div class="small muted">${esc(g.w >= next.w[0] ? T('Due now: {what}', { what: tr(next.l) }) : T('Next: {what} · around {date}', { what: tr(next.l), date: fmtDate(dt(p.preg.lmp) + next.w[0] * 7 * dayMs, { day: 'numeric', month: 'short' }) }))}</div>` : ''}`;
}
async function pregSheet(p) {
  const c = wcondBy('preg'), g = pregInfo(p);
  const meds = (S.meds || []).filter(m => m.active && PREG_BAD_MEDS.test(m.name));
  const last = (S.readings || [])[0], bpW = last && Date.now() - last.ts < 7 * dayMs && (last.sys >= 140 || last.dia >= 90);
  const stage = g ? (PREG_STAGES.filter(s => s[0] <= g.w).pop() || PREG_STAGES[0])[1] : '';
  const appts = S.appts || [];
  const planRows = g ? PREG_PLAN.map(x => { const a = dt(g.lmp) + x.w[0] * 7 * dayMs, b = dt(g.lmp) + (x.w[1] * 7 + 6) * dayMs, done = b < Date.now(), have = appts.some(ap => ap.pregKey === x.k);
    return `<div class="mrow" style="cursor:default;${done ? 'opacity:.55' : ''}"><span class="mic">${x.scan ? COND_ICON : CAL_ICON}</span><span style="flex:1;min-width:0"><b>${esc(tr(x.l))}</b><br><span class="small muted">${esc(fmtDate(a, { day: 'numeric', month: 'short' }))}${x.w[1] > x.w[0] ? ' – ' + esc(fmtDate(b, { day: 'numeric', month: 'short' })) : ''} · ${esc(tr(x.d))}</span></span>${!done ? (have ? `<span class="small" style="color:var(--c-normal);font-weight:700">✓</span>` : `<button class="btn sm" data-pg="${x.k}">${esc(tr('Remind me'))}</button>`) : ''}</div>`; }).join('') : '';
  const body = `<div class="card" style="padding:12px"><div class="grid2"><div class="field"><label for="pg-lmp">First day of last period</label><input class="input" type="date" id="pg-lmp" value="${esc(g ? g.lmp : '')}"></div><div class="field"><label for="pg-edd">or due date</label><input class="input" type="date" id="pg-edd" value="${esc(g ? dk(g.edd) : '')}"></div></div><button class="btn sm primary" id="pg-save">Save dates</button></div>
    ${g ? `${pregCardHTML(p)}<p>${esc(tr(stage))}</p>` : ''}
    ${meds.length ? `<div class="cond-alert urgent"><b>${esc(T('Tell your doctor straight away: {meds} may not be safe in pregnancy. Do not stop it on your own.', { meds: meds.map(m => m.name).join(', ') }))}</b></div>` : ''}
    ${bpW ? `<div class="cond-alert ${last.sys >= 160 || last.dia >= 110 ? 'urgent' : 'warn'}"><b>${esc(T('Blood pressure {bp} in pregnancy: contact your maternity team today; with headache, vision changes or swelling, get help now (possible pre-eclampsia).', { bp: last.sys + '/' + last.dia }))}</b></div>` : ''}
    ${hasCond(p, 'thy') ? `<div class="cond-alert warn"><b>${esc(tr('Thyroid tablets often need a higher dose in pregnancy. Tell your doctor now and check TSH early.'))}</b></div>` : ''}
    ${hasCond(p, 'dm') || (S.sugar || []).length ? `<p class="small"><b>${esc(tr('Sugar targets in pregnancy (ask your doctor): fasting below 95 mg/dL (5.3 mmol/L); 1 hour after meals below 140 (7.8); 2 hours after below 120 (6.7).'))}</b></p>` : ''}
    ${g && g.w >= 24 ? `<div class="card" style="padding:12px"><b>Baby movements</b><p class="small" style="margin:4px 0">${esc(tr('Know your baby’s usual pattern. If movements slow down or stop, contact the maternity unit now; do not wait until tomorrow.'))}</p><button class="btn sm" id="pg-kick">Count movements now</button><span class="small muted" id="pg-kn"></span></div>` : ''}
    ${g ? `<h3 class="sec-h">Visits, tests and scans</h3><div class="mlist">${planRows}</div><p class="small muted">Dates follow the usual schedule; your doctor may book them differently. Edit any reminder under Appointments.</p>` : ''}
    <div class="btn-row" style="flex-wrap:wrap"><button class="btn sm" data-pgm="folic">+ Folic acid reminder</button><button class="btn sm" data-pgm="vit">+ Pregnancy vitamin reminder</button><button class="btn sm" data-cnd2="sym">Symptom check-in</button>${g ? '<button class="btn sm" data-pgdone>Baby is born</button>' : ''}</div>
    ${condInfoHTML(p, c)}`;
  const sh = openSheet({ title: tr(c.l), body, full: true, foot: '<button class="btn primary" data-close>Close</button>' });
  const el = sh.el;
  $('#pg-save', el).onclick = async () => {
    let lmp = $('#pg-lmp', el).value; const edd = $('#pg-edd', el).value;
    if (!lmp && edd) lmp = dk(dt(edd) - 280 * dayMs);
    if (!lmp) { toast('Enter a date first.'); return; }
    if (dt(lmp) > Date.now() || Date.now() - dt(lmp) > 44 * 7 * dayMs) { toast('Please check the date.'); return; }
    p.preg = { lmp }; await DB.put('profiles', p); sh.close(); await loadProfiles(); await loadReadings(); render(); pregSheet(cur());
  };
  let kicks = 0, k0 = 0;
  if ($('#pg-kick', el)) $('#pg-kick', el).onclick = () => { if (!k0) k0 = Date.now(); kicks++; $('#pg-kn', el).textContent = ' ' + T('{n} movements in {m} minutes', { n: kicks, m: Math.max(1, Math.round((Date.now() - k0) / 60000)) }); if (kicks === 10) DB.put('women', { id: uid(), profileId: p.id, type: 'kick', day: dk(Date.now()), v: Math.round((Date.now() - k0) / 60000), created: Date.now() }); };
  el.addEventListener('click', async e => {
    const b = e.target.closest('[data-pg],[data-pgm],[data-pgdone],[data-cnd2]'); if (!b) return;
    if (b.dataset.cnd2) { sh.close(); symptomSheet(p, 'preg'); return; }
    if (b.dataset.pgm) { sh.close(); medSheet(null, b.dataset.pgm === 'folic' ? { name: 'Folic acid', dose: '400 mcg', times: ['morning'], remind: true, remTimes: { morning: '08:00' } } : { name: 'Pregnancy vitamin', dose: '1 tablet', times: ['morning'], remind: true, remTimes: { morning: '08:00' } }); return; }
    if (b.dataset.pgdone !== undefined) { if (!(await confirmSheet('Congratulations!', 'Turn off pregnancy tracking for ' + p.name + '? Your records stay.', 'Yes'))) return; setConds(p, personConds(p).map(c2 => c2.k).filter(k => k !== 'preg' && !k.startsWith('custom:'))); p.preg = Object.assign({}, p.preg, { done: dk(Date.now()) }); await DB.put('profiles', p); sh.close(); await loadProfiles(); await loadReadings(); render(); return; }
    const x = PREG_PLAN.find(q => q.k === b.dataset.pg); if (!x || !g) return;
    const when = Math.max(dt(g.lmp) + x.w[0] * 7 * dayMs, Date.now() + dayMs);
    await DB.put('appts', { id: uid(), profileId: p.id, kind: x.scan ? 'scan' : 'doctor', title: tr(x.l), place: '', days: null, date: dk(when), time: '09:00', remind: [1440, 120], note: tr(x.d) + ' ' + tr('(Change the date to your booked appointment.)'), pregKey: x.k, created: Date.now() });
    await syncMedReminders(); toast('Reminder added'); sh.close(); await loadReadings(); render(); pregSheet(p);
  });
}
const WOMEN_SCREENS = { period: periodSheet, preg: pregSheet };

/* the Today screen card for women's health */
async function womenCard(p) {
  if (p.sex !== 'f') return '';
  const parts = [];
  if (hasCond(p, 'preg')) parts.push(`<button class="mrow" data-cond-open="preg"><span class="mic">${COND_ICON}</span><span style="flex:1;min-width:0"><b>${esc(tr('Pregnancy'))}</b>${pregCardHTML(p)}</span><span class="small muted">›</span></button>`);
  if (hasCond(p, 'period') && !(hasCond(p, 'preg') && pregInfo(p))) { const ci = cycleInfo(await womenLog(p)); parts.push(`<button class="mrow" data-cond-open="period"><span class="mic">${COND_ICON}</span><span style="flex:1;min-width:0"><b>${esc(tr('Periods and ovulation'))}</b>${periodCardHTML(p, ci)}</span><span class="small muted">›</span></button>`); }
  if (!parts.length) return '';
  return `<div class="card"><h2>Women’s health</h2><div class="mlist">${parts.join('')}</div></div>`;
}
