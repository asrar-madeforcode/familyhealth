/* Family Health Tracker — medicine doses, Apple Health and Apple Watch.
   © 2026 Asrar Ahmed Junedi. All rights reserved.
   Everything here is optional: on Android and the home-screen version the Apple parts simply stay hidden. */
'use strict';

/* ------------------------------------------------------------------ medicine doses ("Taken") */
const doseId = (day, medId, k) => day + '|' + medId + '|' + k;
async function loadDoses(pid) {
  const today = dayKey(Date.now());
  return (await DB.byProfile(pid, 'doses')).filter(d => d.day === today);
}
function doseTaken(medId, k) { return (S.doses || []).some(d => d.medId === medId && d.k === k); }
async function setDose(pid, medId, k, on, src, ts) {
  const day = dayKey(ts || Date.now()), id = doseId(day, medId, k);
  if (on) await DB.put('doses', { id, profileId: pid, medId, k, day, ts: ts || Date.now(), src: src || 'phone' });
  else await DB.del('doses', id);
}
/* today's times for one medicine, as tappable chips */
function doseChips(m) {
  const times = (m.times || []).filter(k => MED_TIMES.some(x => x.k === k));
  if (!times.length) return '';
  if (!medDueToday(m)) return '';
  return `<div class="doses">${times.map(k => {
    const on = doseTaken(m.id, k), l = (MED_TIMES.find(x => x.k === k) || {}).l;
    return `<button class="dose${on ? ' on' : ''}" data-act="dose" data-med="${m.id}" data-k="${k}" aria-pressed="${on}">${on ? '<span aria-hidden="true">✓</span> ' : ''}<span>${esc(l)}</span></button>`;
  }).join('')}</div>`;
}

/* ------------------------------------------------------------------ Apple Health (iPhone app only) */
const HK_DEF = { watch: true, bpIn: true, bpOut: false };
function hkAvailable() { return !!(IOS_APP && NATIVE.healthStatus && NATIVE.healthStatus() !== 'nosensor'); }
function hkOpts() { try { return Object.assign({}, HK_DEF, JSON.parse(NATIVE.healthOptions() || '{}')); } catch { return Object.assign({}, HK_DEF); } }
function hkOn() { return hkAvailable() && NATIVE.healthStatus() === 'on' && !!stepsOwner(); }
function hkData() {
  if (!hkOn()) return { days: {}, ecg: [], bp: [] };
  try { const j = JSON.parse(NATIVE.getHealth() || '{}'); return { days: j.days || {}, ecg: j.ecg || [], bp: j.bp || [] }; } catch { return { days: {}, ecg: [], bp: [] }; }
}
const ECG_CLS = {
  sinus: { l: 'Sinus rhythm', flag: 'normal', d: 'The heartbeat started in the normal place and was regular.' },
  afib: { l: 'Atrial fibrillation', flag: 'high', d: 'The watch found signs of an irregular rhythm (AFib). Show this to your doctor soon, especially if it happens again or you feel unwell.' },
  low: { l: 'Inconclusive: low heart rate', flag: 'borderline', d: 'The heart rate was under 50, so the watch could not check the rhythm.' },
  high: { l: 'Inconclusive: high heart rate', flag: 'borderline', d: 'The heart rate was over 150, so the watch could not check the rhythm.' },
  poor: { l: 'Poor recording', flag: 'borderline', d: 'Rest your arm on a table and keep still during the next ECG.' },
  inconclusive: { l: 'Inconclusive', flag: 'borderline', d: 'The watch could not classify this recording.' },
  unrecognized: { l: 'Unclassified', flag: 'borderline', d: 'The watch could not classify this recording.' },
  none: { l: 'Not classified', flag: 'borderline', d: '' }
};
const ecgInfo = c => ECG_CLS[c] || ECG_CLS.none;
const fmtSleep = min => min ? Math.floor(min / 60) + ' h ' + pad(Math.round(min % 60)) + ' min' : '–';
/* summary of the last n days of watch data */
function hkSummary(days, from, to) {
  const list = Object.entries(days).filter(([d]) => d >= dayKey(from) && d <= dayKey(to)).map(([d, v]) => Object.assign({ day: d }, v));
  const vals = k => list.map(x => x[k]).filter(v => v != null && (!Array.isArray(v) || v[0] != null));
  const rhr = vals('rhr'), hr = vals('hr'), sp = vals('spo2'), sl = vals('sleep').filter(v => v > 60);
  return {
    list,
    rhr: rhr.length ? Math.round(avg(rhr)) : null,
    hrMin: hr.length ? Math.round(Math.min(...hr.map(v => v[1]))) : null, hrMax: hr.length ? Math.round(Math.max(...hr.map(v => v[2]))) : null,
    spo2: sp.length ? Math.round(avg(sp.map(v => v[0])) * 10) / 10 : null, spo2Min: sp.length ? Math.min(...sp.map(v => v[1])) : null,
    sleep: sl.length ? avg(sl) : null, sleepDays: sl.length
  };
}
/* plain-language notes for the person, shown on screen and in the PDF */
function hkNotes(sm, ecgs) {
  const out = [];
  if (sm.rhr != null && sm.rhr > 100) out.push({ flag: 'high', t: 'Resting heart rate is above 100. Tell your doctor, especially with palpitations, dizziness or breathlessness.' });
  else if (sm.rhr != null && sm.rhr < 50) out.push({ flag: 'borderline', t: 'Resting heart rate is under 50. This can be normal for fit people or with some BP medicines; tell your doctor if you feel dizzy or faint.' });
  if (sm.spo2Min != null && sm.spo2Min < 90) out.push({ flag: 'high', t: 'Blood oxygen went below 90%. If you are short of breath or have chest pain, get help now; otherwise tell your doctor.' });
  else if (sm.spo2 != null && sm.spo2 < 95) out.push({ flag: 'borderline', t: 'Average blood oxygen is a little low. Readings are often lower during sleep or if the watch is loose. Tell your doctor if it stays low.' });
  if (sm.sleep != null && sm.sleep < 360) out.push({ flag: 'borderline', t: 'Average sleep is under 6 hours. Short sleep can raise blood pressure; aim for 7–8 hours.' });
  if ((ecgs || []).some(e => e.cls === 'afib')) out.push({ flag: 'high', t: 'An Apple Watch ECG showed signs of atrial fibrillation. Show your doctor; AFib raises stroke risk and needs a doctor’s care.' });
  return out;
}
function healthCard(p) {
  if (!hkOn() || stepsOwner() !== p.id || !hkOpts().watch) return '';
  const d = hkData(), today = dayKey(Date.now()), yest = dayKey(Date.now() - 864e5);
  const t = d.days[today] || {}, sm = hkSummary(d.days, Date.now() - 6 * 864e5, Date.now());
  const night = (d.days[today] && d.days[today].sleep) || (d.days[yest] && d.days[yest].sleep) || null;
  const lastSp = Object.keys(d.days).sort().reverse().map(k => d.days[k].spo2).find(v => v && v[0] != null);
  const ecg = d.ecg[0];
  if (!Object.keys(d.days).length && !ecg) return `<div class="card"><h2>Apple Watch</h2><p class="small muted" style="margin:0">No heart rate, oxygen or sleep data yet. Wear the Apple Watch and allow Family Health Tracker to read these in Apple Health (Health app › Sharing › Apps).</p></div>`;
  const tile = (label, val, sub) => `<div class="hk-tile"><span class="small muted">${label}</span><b class="num">${val}</b>${sub ? `<span class="small muted num">${sub}</span>` : ''}</div>`;
  const notes = hkNotes(sm, d.ecg.filter(e => e.ts > Date.now() - 30 * 864e5));
  return `<div class="card"><div class="row"><h2 style="margin:0">Apple Watch</h2><span class="spacer"></span><button class="btn sm" data-act="hk-more">14 days</button></div>
    <div class="hk-grid">
      ${tile('Heart rate today', t.hr ? Math.round(t.hr[0]) + ' bpm' : '–', t.hr ? Math.round(t.hr[1]) + '–' + Math.round(t.hr[2]) : '')}
      ${tile('Resting heart rate', sm.rhr != null ? sm.rhr + ' bpm' : '–', sm.rhr != null ? '7-day average' : '')}
      ${tile('Blood oxygen', lastSp ? lastSp[0] + '%' : '–', lastSp ? 'lowest ' + lastSp[1] + '%' : '')}
      ${tile('Sleep last night', night ? fmtSleep(night) : '–', '')}
    </div>
    ${ecg ? `<button class="mrow" data-act="hk-ecg" style="margin-top:10px"><span class="mic">${HEART_ICON}</span><span style="min-width:0;flex:1"><b>ECG: ${esc(ecgInfo(ecg.cls).l)}</b><br><span class="small muted">${esc(fmtDate(ecg.ts))}, ${esc(fmtTime(ecg.ts))}${ecg.hr ? ' · ' + Math.round(ecg.hr) + ' bpm' : ''}</span></span><span class="pill" style="--cat:var(${flagVar(ecgInfo(ecg.cls).flag)})">${ecgInfo(ecg.cls).flag === 'normal' ? 'Normal' : 'Review'}</span></button>` : ''}
    ${notes.length ? `<ul class="tips" style="margin:10px 0 0">${notes.map(n => `<li style="color:var(${flagVar(n.flag)})">${esc(n.t)}</li>`).join('')}</ul>` : ''}
    <p class="small muted" style="margin:8px 0 0">From Apple Health, automatically. The watch does not measure blood pressure; keep using your cuff.</p></div>`;
}
const HEART_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-7-9.6A4 4 0 0 1 12 8a4 4 0 0 1 7 2.4C19 15.6 12 20 12 20z" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M6 12h3l1.5-2.5 2 5 1.5-2.5H18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
function hkSheet() {
  const d = hkData(), rows = [];
  for (let i = 0; i < 14; i++) { const k = dayKey(Date.now() - i * 864e5), v = d.days[k] || {}; rows.push({ k, v }); }
  const body = `<div class="card tbl-wrap"><table class="ranges"><thead><tr><th>Date</th><th>Resting</th><th>Heart rate</th><th>Oxygen</th><th>Sleep</th></tr></thead><tbody>${rows.map(({ k, v }) => `<tr><td class="small">${esc(fmtDate(new Date(k + 'T12:00').getTime(), { weekday: 'short', day: 'numeric', month: 'short' }))}</td><td class="num">${v.rhr != null ? Math.round(v.rhr) : '–'}</td><td class="num small">${v.hr ? Math.round(v.hr[0]) + ' (' + Math.round(v.hr[1]) + '–' + Math.round(v.hr[2]) + ')' : '–'}</td><td class="num small">${v.spo2 ? v.spo2[0] + '%' : '–'}</td><td class="num small">${v.sleep ? fmtSleep(v.sleep) : '–'}</td></tr>`).join('')}</tbody></table></div>
    <p class="small muted">Heart rate in beats per minute: average (lowest–highest). Oxygen is the daily average.</p>
    ${d.ecg.length ? `<div class="card"><h2>ECG recordings</h2><div class="mlist" style="margin-top:0">${d.ecg.slice(0, 10).map(e => `<div class="mrow" style="cursor:default"><span class="mic">${HEART_ICON}</span><span style="min-width:0;flex:1"><b>${esc(ecgInfo(e.cls).l)}</b><br><span class="small muted">${esc(fmtDate(e.ts))}, ${esc(fmtTime(e.ts))}${e.hr ? ' · ' + Math.round(e.hr) + ' bpm' : ''}</span>${ecgInfo(e.cls).d ? `<br><span class="small">${esc(ecgInfo(e.cls).d)}</span>` : ''}</span></div>`).join('')}</div></div>` : ''}`;
  openSheet({ title: 'Apple Watch', body, foot: '<button class="btn primary" data-close>Close</button>' });
}

/* ---- settings card on the iPhone app (replaces the plain steps card) */
function healthSettingsHTML() {
  const st = NATIVE.healthStatus(), owner = stepsOwner(), o = hkOpts();
  if (st === 'nosensor') return '<div class="card"><h2>Apple Health</h2><p class="small muted" style="margin:0">Apple Health is not available on this device.</p></div>';
  const on = st === 'on' && owner;
  const w = NATIVE.watchStatus ? NATIVE.watchStatus() : 'nowatch';
  const watchLine = w === 'ready' ? ['var(--c-normal)', 'Apple Watch connected. Today’s readings, medicines and quick entry are on the watch.']
    : w === 'notinstalled' ? ['var(--c-stage1)', 'To use the watch app, open the Watch app on this iPhone › My Watch › Family Health › Install.']
    : ['var(--muted)', 'No Apple Watch is paired with this iPhone.'];
  return `<div class="card"><h2>Apple Health and Apple Watch</h2>
    <p class="small muted" style="margin-top:0">Steps, heart rate, blood oxygen, sleep and ECGs come from Apple Health for the person who owns this iPhone and Apple Watch.</p>
    <div class="field"><label for="st-owner">This iPhone and Apple Watch belong to</label><select class="input" id="st-owner"><option value="">Nobody (off)</option>${S.profiles.map(p => `<option value="${p.id}" ${owner === p.id && st === 'on' ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div>
    ${on ? `<div style="display:flex;flex-direction:column;gap:2px;margin-top:8px">
      <label class="check"><input type="checkbox" id="hk-watch" ${o.watch ? 'checked' : ''}> Show heart rate, blood oxygen, sleep and ECG</label>
      <label class="check"><input type="checkbox" id="hk-bpin" ${o.bpIn ? 'checked' : ''}> Add blood pressure readings from other apps and cuffs in Apple Health</label>
      <label class="check"><input type="checkbox" id="hk-bpout" ${o.bpOut ? 'checked' : ''}> Save my blood pressure readings to Apple Health</label></div>
      ${hkBpSources().length ? `<div style="margin-top:10px"><span class="lbl">Blood pressure from other apps</span>${hkBpSources().map(([src, dev]) => `<div class="row" style="margin-top:6px"><span style="flex:1;min-width:0;font-weight:650" data-noi18n>${esc(src)}</span><select class="input" style="max-width:190px" data-hksrc="${esc(src)}"><option value="cuff" ${hkSrcKind(src, dev) === 'cuff' ? 'selected' : ''}>Cuff (real reading)</option><option value="est" ${hkSrcKind(src, dev) === 'est' ? 'selected' : ''}>Smartwatch estimate</option></select></div>`).join('')}</div>` : ''}
      <p class="small muted" style="margin:6px 0 0">If something is missing, open the Health app › Sharing › Apps › Family Health and turn on everything.</p>` : '<p class="small muted" style="margin:8px 0 0">Choose a person to start.</p>'}
    <p class="small" style="margin:10px 0 0;font-weight:650;color:${watchLine[0]}">${watchLine[1]}</p></div>`;
}
function saveHkOpts() {
  const o = { watch: $('#hk-watch').checked, bpIn: $('#hk-bpin').checked, bpOut: $('#hk-bpout').checked };
  NATIVE.setHealthOptions(JSON.stringify(o));
}

/* ---- blood pressure to and from Apple Health */
function hkSaveReading(r) {
  if (!hkOn() || !hkOpts().bpOut || r.profileId !== stepsOwner() || r.src === 'health' || !NATIVE.saveToHealth) return;
  try { NATIVE.saveToHealth(JSON.stringify({ id: r.id, ts: r.ts, sys: r.sys, dia: r.dia, pulse: r.pulse || null })); } catch { /* ignore */ }
}
function hkDeleteReading(r) { if (r && r.src !== 'health' && NATIVE && NATIVE.deleteFromHealth) { try { NATIVE.deleteFromHealth(r.id); } catch { /* ignore */ } } }
/* Blood pressure from cuffless smartwatches (Da Fit and similar) is only an estimate from the light sensor.
   It is kept apart from real cuff readings: not in averages, categories, emergency alarms or the main PDF table. */
const WATCH_BP_APPS = /da\s*fit|dafit|fitcloud|wear\s*fit|wearpro|glory\s*fit|h\s*band|hryfine|fundo|veryfit|keep\s*health|smart\s*time|zeroner|mibro|amazfit|zepp|huawei|honor|galaxy|samsung|xiaomi|mi\s*fit|fitpro|runmefit|jyou|yoho|lefun|wearheart|m\s*active|smartwatch|smart\s*watch|band/i;
function hkSrcKind(src, dev) {
  const m = LS.get('bp.hkSrc', {});
  if (m[src] === 'cuff' || m[src] === 'est') return m[src];
  return WATCH_BP_APPS.test((src || '') + ' ' + (dev || '')) ? 'est' : 'cuff';
}
function hkBpSources() { const seen = new Map(); for (const b of hkData().bp) if (b.src && !seen.has(b.src)) seen.set(b.src, b.dev || ''); return [...seen]; }
/* readings from watch apps that were saved as cuff readings (before 1.8.1, or before the setting changed) */
async function hkMoveEstimates(owner) {
  for (const r of await DB.byProfile(owner)) { const src = hkSrcOf(r);
    if (r.src === 'health' && src && hkSrcKind(src) === 'est') {
      await DB.del('readings', r.id); await DB.put('wbp', { id: r.id, profileId: owner, ts: r.ts, sys: r.sys, dia: r.dia, pulse: r.pulse, src, created: Date.now() });
    } }
}
async function hkImport() {
  if (!hkOn() || !hkOpts().bpIn) return 0;
  const owner = stepsOwner(); if (!S.profiles.find(p => p.id === owner)) return 0;
  await hkMoveEstimates(owner);
  const have = await DB.byProfile(owner), ids = new Set(have.map(r => r.id)), skipped = new Set(LS.get('bp.hkSkip', []));
  const wHave = new Set((await DB.byProfile(owner, 'wbp')).map(w => w.id));
  let n = 0;
  for (const b of hkData().bp) {
    const id = 'hk_' + b.id;
    if (skipped.has(id) || !(b.sys > 40 && b.dia > 20)) continue;
    if (hkSrcKind(b.src, b.dev) === 'est') {
      if (wHave.has(id)) continue;
      const w = { id, profileId: owner, ts: b.ts, sys: Math.round(b.sys), dia: Math.round(b.dia), pulse: b.pulse ? Math.round(b.pulse) : null, src: b.src || '', created: Date.now() };
      await DB.put('wbp', w); wHave.add(id);
      if (emergencyKind(w) && Date.now() - w.ts < 6 * 3600e3 && (!hkImport.est || w.ts > hkImport.est.ts)) hkImport.est = w;
      continue;
    }
    if (ids.has(id)) continue;
    // the same reading typed in the app within 10 minutes: keep only one
    if (have.some(r => Math.abs(r.ts - b.ts) < 600e3 && Math.abs(r.sys - b.sys) <= 2 && Math.abs(r.dia - b.dia) <= 2)) continue;
    const rec = { id, profileId: owner, ts: b.ts, slot: slotFor(new Date(b.ts)), place: 'home', sys: Math.round(b.sys), dia: Math.round(b.dia), pulse: b.pulse ? Math.round(b.pulse) : null, note: 'Apple Health' + (b.src ? ' · ' + b.src : ''), medTaken: false, hasPhoto: false, src: 'health', hkSrc: b.src || '', created: Date.now(), updated: Date.now() };
    await DB.put('readings', rec); n++;
    if (emergencyKind(rec) && (!hkImport.em || rec.ts > hkImport.em[0].ts)) hkImport.em = [rec, S.profiles.find(p => p.id === owner)];
  }
  return n;
}
/* after the person changes a source between "cuff" and "watch estimate", move its readings */
async function hkReclassify() {
  const owner = stepsOwner(); if (!owner) return;
  await hkMoveEstimates(owner);
  for (const w of await DB.byProfile(owner, 'wbp')) if (w.src && hkSrcKind(w.src) === 'cuff') {
    await DB.del('wbp', w.id);
    await DB.put('readings', { id: w.id, profileId: owner, ts: w.ts, slot: slotFor(new Date(w.ts)), place: 'home', sys: w.sys, dia: w.dia, pulse: w.pulse, note: 'Apple Health · ' + w.src, medTaken: false, hasPhoto: false, src: 'health', hkSrc: w.src, created: Date.now(), updated: Date.now() });
  }
  await hkImport(); await loadReadings(); render();
}
/* how far the watch estimates are from cuff readings taken within 30 minutes */
function wbpCompare(wbp, readings) {
  const pairs = [];
  for (const w of wbp) { const c = readings.find(r => Math.abs(r.ts - w.ts) <= 30 * 60e3); if (c) pairs.push([w, c]); }
  if (pairs.length < 3) return null;
  const ds = pairs.map(([w, c]) => w.sys - c.sys), dd = pairs.map(([w, c]) => w.dia - c.dia);
  return { n: pairs.length, sys: Math.round(avg(ds)), dia: Math.round(avg(dd)), spread: Math.round(avg(ds.map(x => Math.abs(x - avg(ds))))) };
}
const sgn = n => (n > 0 ? '+' : '') + n;
const hkSrcOf = r => r.hkSrc || ((r.note || '').startsWith('Apple Health · ') ? r.note.slice(15) : '');
function wbpCard(p) {
  const list = (S.wbp || []).filter(w => w.ts > Date.now() - 30 * 864e5);
  if (!list.length) return '';
  const l = list[0], week = list.filter(w => w.ts > Date.now() - 7 * 864e5), cmp = wbpCompare(list, S.readings);
  return `<div class="card"><div class="row"><h2 style="margin:0">Smartwatch estimates</h2><span class="spacer"></span><button class="btn sm" data-act="wbp-more">All</button></div>
    <div class="row" style="margin-top:8px;align-items:baseline"><span class="num" style="font-size:1.6rem;font-weight:850">${l.sys}/${l.dia}</span><span class="small muted">${esc(fmtDate(l.ts, { day: 'numeric', month: 'short' }))}, ${esc(fmtTime(l.ts))}</span><span class="spacer"></span>${week.length > 1 ? `<span class="small muted"><span>7-day average</span> <span class="num">${bpTxt(week)}</span></span>` : ''}</div>
    ${cmp ? `<p class="small" style="margin:6px 0 0;font-weight:650"><span>${esc(T('Compared with your cuff ({n} times), the watch read {s}/{d} on average.', { n: cmp.n, s: '\u2066' + sgn(cmp.sys), d: sgn(cmp.dia) + '\u2069' }))}</span></p>` : ''}
    <p class="small muted" style="margin:6px 0 0"><span>These come from a smartwatch light sensor, not a cuff. They are not used for averages, categories or alarms. Check any high or low value with your arm cuff.</span>${l.src ? ` <span data-noi18n>(${esc(l.src)})</span>` : ''}</p></div>`;
}
function wbpSheet() {
  const list = S.wbp || [], cmp = wbpCompare(list, S.readings);
  const body = `${cmp ? `<p class="small" style="margin-top:0;font-weight:650">${esc(T('Compared with your cuff ({n} times), the watch read {s}/{d} on average.', { n: cmp.n, s: '\u2066' + sgn(cmp.sys), d: sgn(cmp.dia) + '\u2069' }))}</p>` : '<p class="small muted" style="margin-top:0">Measure with your cuff within 30 minutes of a watch reading a few times to see how close your watch is.</p>'}
    <div class="card tbl-wrap"><table class="ranges"><thead><tr><th>Date</th><th>Watch</th><th>Cuff</th></tr></thead><tbody>${list.slice(0, 60).map(w => { const c = S.readings.find(r => Math.abs(r.ts - w.ts) <= 30 * 60e3); return `<tr><td class="small">${esc(fmtDate(w.ts, { day: 'numeric', month: 'short' }))}, ${esc(fmtTime(w.ts))}</td><td class="num">${w.sys}/${w.dia}</td><td class="num">${c ? c.sys + '/' + c.dia : '\u2013'}</td></tr>`; }).join('')}</tbody></table></div>`;
  openSheet({ title: 'Smartwatch estimates', body, foot: '<button class="btn" data-act="wbp-cuff">Measure with cuff</button><button class="btn primary" data-close>Close</button>' });
}
function wbpCheck(w) {
  const p = S.profiles.find(x => x.id === w.profileId); if (!p) return;
  const t = tr('Check with your cuff now'), x = T('Your smartwatch estimated {bp}. Watch estimates are often wrong; measure now with your arm cuff.', { bp: w.sys + '/' + w.dia });
  if (NATIVE && NATIVE.alertNow) { try { NATIVE.alertNow(t + ' \u00B7 ' + p.name, x); } catch { /* ignore */ } }
  openSheet({ title: 'Check with your cuff now', body: `<div class="em-box" style="background:var(--c-stage1)"><div class="em-v num">${w.sys}/${w.dia}</div><b>${esc(x)}</b></div>
    <p class="em-urgent">${esc(tr('Call 997 now if there is chest pain, shortness of breath, back pain, numbness or weakness, change in vision, difficulty speaking, or severe headache.'))}</p>
    <a class="btn danger block em-call" href="tel:997"><span>Call 997 (Red Crescent)</span></a>`, foot: '<button class="btn" data-close>Close</button><button class="btn primary" data-act="wbp-cuff">Measure with cuff</button>' });
}
/* an imported reading that the person deletes is not imported again */
function hkForget(r) { if (r && r.src === 'health') { const s = LS.get('bp.hkSkip', []); if (!s.includes(r.id)) { s.push(r.id); LS.set('bp.hkSkip', s.slice(-500)); } } }

/* ---- PDF: one line on page 1 and an Apple Watch page */
function pdfWatchLine(p, from, to) {
  if (!hkOn() || stepsOwner() !== p.id || !hkOpts().watch) return '';
  const sm = hkSummary(hkData().days, from, to);
  const parts = [];
  if (sm.rhr != null) parts.push(`resting heart rate ${sm.rhr} bpm`);
  if (sm.spo2 != null) parts.push(`blood oxygen ${sm.spo2}%`);
  if (sm.sleep != null) parts.push(`sleep ${fmtSleep(sm.sleep)} a night`);
  return parts.length ? 'Apple Watch   average ' + parts.join('  ·  ') + '  (details on the Apple Watch page)' : '';
}
async function pdfWatchPage(c, p, from, to) {
  if (!hkOn() || stepsOwner() !== p.id || !hkOpts().watch) return;
  const d = hkData(), sm = hkSummary(d.days, from, to), ecgs = d.ecg.filter(e => e.ts >= from && e.ts <= to + 864e5);
  if (!sm.list.length && !ecgs.length) return;
  const { doc, put, M, INK, MUTED, ACC, LINE } = c;
  doc.addPage(); let y = 20;
  put('Apple Watch and Apple Health', M, y, 15, INK, true); y += 6;
  put('Recorded automatically by the Apple Watch and iPhone. The watch does not measure blood pressure.', M, y, 8.5, MUTED); y += 5;
  const sum = [];
  if (sm.rhr != null) sum.push(`Resting heart rate ${sm.rhr} bpm on average`);
  if (sm.hrMin != null) sum.push(`heart rate range ${sm.hrMin}–${sm.hrMax} bpm`);
  if (sm.spo2 != null) sum.push(`blood oxygen ${sm.spo2}% (lowest ${sm.spo2Min}%)`);
  if (sm.sleep != null) sum.push(`sleep ${fmtSleep(sm.sleep)} a night over ${sm.sleepDays} nights`);
  if (sum.length) { doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); const lines = doc.splitTextToSize(sum.join('; ') + '.', 182); lines.forEach(l => { put(l, M, y, 9.5, INK, true); y += 4.6; }); }
  const rows = sm.list.sort((a, b) => b.day.localeCompare(a.day)).map(v => [
    fmtDate(new Date(v.day + 'T12:00').getTime(), { weekday: 'short', day: '2-digit', month: 'short' }),
    v.rhr != null ? Math.round(v.rhr) : '–', v.hr ? `${Math.round(v.hr[0])} (${Math.round(v.hr[1])}–${Math.round(v.hr[2])})` : '–',
    v.spo2 ? `${v.spo2[0]}% (${v.spo2[1]}%)` : '–', v.sleep ? fmtSleep(v.sleep) : '–']);
  if (rows.length) {
    doc.autoTable({ startY: y + 1, head: [['Date', 'Resting HR (bpm)', 'Heart rate avg (min–max)', 'Blood oxygen avg (lowest)', 'Sleep']], body: rows,
      margin: { left: M, right: M, bottom: 20 }, theme: 'grid', styles: { fontSize: 8.5, cellPadding: 1.6, textColor: INK, lineColor: LINE, lineWidth: 0.15, halign: 'center' },
      headStyles: { fillColor: ACC, textColor: [255, 255, 255] }, columnStyles: { 0: { halign: 'left' } } });
    y = doc.lastAutoTable.finalY + 6;
  }
  if (ecgs.length) {
    if (y > 240) { doc.addPage(); y = 20; }
    put('Apple Watch ECG recordings', M, y, 11, INK, true);
    doc.autoTable({ startY: y + 2, head: [['Date', 'Result', 'Heart rate', 'What it means']],
      body: ecgs.map(e => [fmtDate(e.ts, { day: '2-digit', month: 'short', year: 'numeric' }) + ', ' + fmtTime(e.ts), ecgInfo(e.cls).l, e.hr ? Math.round(e.hr) + ' bpm' : '–', ecgInfo(e.cls).d]),
      margin: { left: M, right: M, bottom: 20 }, theme: 'grid', styles: { fontSize: 8.5, cellPadding: 1.6, textColor: INK, lineColor: LINE, lineWidth: 0.15 },
      headStyles: { fillColor: ACC, textColor: [255, 255, 255] }, columnStyles: { 0: { cellWidth: 34 }, 1: { cellWidth: 36, fontStyle: 'bold' }, 2: { cellWidth: 20, halign: 'center' } } });
    y = doc.lastAutoTable.finalY + 6;
  }
  const notes = hkNotes(sm, ecgs);
  if (notes.length) {
    if (y > 250) { doc.addPage(); y = 20; }
    put('Precautions', M, y, 11, INK, true); y += 5;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    for (const n of notes) { const lines = doc.splitTextToSize('• ' + n.t, 180); if (y + lines.length * 4.4 > 282) { doc.addPage(); y = 20; } lines.forEach(l => { put(l, M + 2, y, 9, n.flag === 'high' ? [180, 40, 30] : INK); y += 4.4; }); }
  }
}

async function pdfWbpPage(c, p, from, to, rs) {
  const list = (await DB.byProfile(p.id, 'wbp')).filter(w => w.ts >= from && w.ts <= to + 864e5).sort((a, b) => b.ts - a.ts);
  if (!list.length) return;
  const { doc, put, M, INK, MUTED, ACC, LINE } = c;
  doc.addPage(); let y = 20;
  put('Smartwatch blood pressure estimates (not cuff readings)', M, y, 14, INK, true); y += 6;
  put('From a cuffless smartwatch' + (list[0].src ? ' (' + list[0].src + ')' : '') + '. Estimates from a light sensor; not validated for diagnosis and not included anywhere else in this report.', M, y, 8.5, MUTED); y += 5;
  const cmp = wbpCompare(list, rs);
  if (cmp) { put(`Compared with cuff readings within 30 minutes (${cmp.n} pairs): the watch read ${sgn(cmp.sys)}/${sgn(cmp.dia)} mmHg on average (typical spread \u00B1${cmp.spread}).`, M, y, 9.5, INK, true); y += 4; }
  doc.autoTable({ startY: y + 1, head: [['Date', 'Watch estimate', 'Cuff reading within 30 min']],
    body: list.slice(0, 80).map(w => { const k = rs.find(r => Math.abs(r.ts - w.ts) <= 30 * 60e3); return [fmtDate(w.ts, { day: '2-digit', month: 'short' }) + ', ' + fmtTime(w.ts), w.sys + '/' + w.dia, k ? k.sys + '/' + k.dia : '\u2013']; }),
    margin: { left: M, right: M, bottom: 20 }, theme: 'grid', styles: { fontSize: 8.5, cellPadding: 1.5, textColor: INK, lineColor: LINE, lineWidth: 0.15, halign: 'center' },
    headStyles: { fillColor: [120, 130, 135], textColor: [255, 255, 255] }, columnStyles: { 0: { halign: 'left' } } });
}

/* ------------------------------------------------------------------ Apple Watch */
/* words the watch shows, sent in the app language */
const WATCH_WORDS = ['Today', 'Blood pressure', 'Add reading', 'Save', 'Morning', 'Afternoon', 'Evening', 'Bedtime', 'Medicines', 'Taken', 'Pulse', 'Blood sugar',
  'Fasting', 'Before meal', '2 h after meal', 'Random', 'Upcoming', 'No readings yet', 'Saved', 'Latest reading', 'No medicines due', 'Systolic (top)', 'Diastolic (bottom)',
  'Sent to iPhone', 'Open Family Health on your iPhone once to set up the watch.', 'Snooze 10 min', 'Add', 'Family', 'Done', 'Sugar', 'Tomorrow', 'Not taken',
  'Low', 'Normal', 'Elevated', 'High – Stage 1', 'High – Stage 2', 'Crisis', 'Time', 'Appointments', 'mg/dL', 'mmol/L',
  'High pulse at rest', 'Pulse has stayed above {n} while resting. Sit down, breathe slowly and check how you feel. Get help if you have chest pain, fainting or breathlessness.',
  'Very low pulse', 'Pulse has stayed below {n} while resting. Get help if you feel faint, dizzy or have chest pain.',
  'Apple Watch ECG: possible AFib', 'Your latest ECG showed signs of atrial fibrillation. Contact your doctor; get help now if you feel unwell.',
  'Rest check', 'Start', 'Sit still, feet flat, back supported, arm resting at heart level.', 'Breathe in', 'Breathe out', 'Ready: measure now', 'Resting pulse',
  'Enter reading', 'Stop', 'Your pulse is high even at rest. Rest longer before measuring.', 'Call 997', 'Very high blood pressure', 'Very low blood pressure',
  'Measure again in 5 minutes.', 'Get help now if you have chest pain, breathlessness, weakness, trouble speaking or a severe headache.', 'Heart rate'];
let watchTimer = null;
function sendWatchState() {
  if (!IOS_APP || !NATIVE.setWatchState) return;
  clearTimeout(watchTimer);
  watchTimer = setTimeout(async () => {
    try {
      const today = dayKey(Date.now()), people = [];
      for (const p of S.profiles) {
        const rs = (await DB.byProfile(p.id)).sort((a, b) => b.ts - a.ts);
        const todays = rs.filter(r => dayKey(r.ts) === today);
        const slots = {}; SLOTS.forEach(s => { const r = todays.find(x => x.slot === s.k); slots[s.k] = r ? r.sys + '/' + r.dia : ''; });
        const l = rs[0], c = l ? bpCategory(l.sys, l.dia) : null;
        const doses = (await DB.byProfile(p.id, 'doses')).filter(d => d.day === today);
        const meds = [];
        for (const m of (await DB.byProfile(p.id, 'meds')).filter(m => m.active && medDueToday(m))) for (const k of m.times || []) {
          const tm = (m.remTimes && m.remTimes[k]) || MED_DEFAULT_T[k];
          if (!tm) continue;
          meds.push({ id: m.id, name: m.name + (m.dose ? ' ' + m.dose : ''), k, t: tm, label: tr((MED_TIMES.find(x => x.k === k) || {}).l || ''), taken: doses.some(d => d.medId === m.id && d.k === k) });
        }
        meds.sort((a, b) => a.t.localeCompare(b.t));
        const appts = upcomingAppts(await DB.byProfile(p.id, 'appts')).slice(0, 3).map(a => ({ title: a.title || tr(apptKindLabel(a.kind)), ts: apptNext(a), place: a.place || '' }));
        const sg = p.trackSugar ? (await DB.byProfile(p.id, 'sugar')).sort((a, b) => b.ts - a.ts)[0] : null;
        people.push({ id: p.id, name: p.name, sugarUnit: p.trackSugar ? (p.sugarUnit || 'mg/dL') : '', slots,
          latest: l ? { sys: l.sys, dia: l.dia, pulse: l.pulse || 0, ts: l.ts, cat: c, label: tr(CATS[c].label) } : null,
          sugar: sg ? { v: toUnit(sg.mg, p.sugarUnit || 'mg/dL'), ts: sg.ts } : null, meds, appts });
      }
      const t = {}; WATCH_WORDS.forEach(w => { t[w] = tr(w); });
      NATIVE.setWatchState(JSON.stringify({ v: 1, updated: Date.now(), cur: S.current, rtl: I18N.dir === 'rtl', people, t }));
    } catch (e) { /* the watch keeps its last copy */ }
  }, 700);
}
/* entries made on the watch (or with the "Taken" button on a reminder) */
window.bpWatchInbox = async () => {
  if (!window.bpReady || !NATIVE || !NATIVE.takeWatchInbox) return;
  let items = []; try { items = JSON.parse(NATIVE.takeWatchInbox() || '[]'); } catch { items = []; }
  if (!items.length) return;
  const done = [], emergencies = []; let added = 0;
  for (const it of items) {
    try {
      const p = S.profiles.find(x => x.id === it.pid); done.push(it.uid);
      if (!p) continue;
      const ts = it.ts || Date.now();
      if (it.type === 'bp' && it.sys > 40 && it.dia > 20) {
        const id = 'w_' + it.uid;
        if (await DB.get('readings', id)) continue;
        const rec = { id, profileId: p.id, ts, slot: slotFor(new Date(ts)), place: 'home', sys: Math.round(it.sys), dia: Math.round(it.dia), pulse: it.pulse ? Math.round(it.pulse) : null, note: 'Apple Watch', medTaken: false, hasPhoto: false, src: 'watch', created: Date.now(), updated: Date.now() };
        await DB.put('readings', rec); hkSaveReading(rec); added++;
        if (emergencyKind(rec)) emergencies.push([rec, p]);
      } else if (it.type === 'sugar' && it.v > 0) {
        const id = 'w_' + it.uid;
        if (await DB.get('sugar', id)) continue;
        const u = p.sugarUnit || 'mg/dL', mg = fromUnit(it.v, u);
        await DB.put('sugar', { id, profileId: p.id, ts, mg: Math.round(mg * 10) / 10, unit: u, timing: it.timing || 'random', note: 'Apple Watch', hasPhoto: false, created: Date.now() });
        added++;
      } else if (it.type === 'med' && it.medId) {
        await setDose(p.id, it.medId, it.k, it.taken !== false, it.src || 'watch', ts); added++;
      }
    } catch { /* skip a broken entry */ }
  }
  if (NATIVE.watchInboxDone) NATIVE.watchInboxDone(JSON.stringify(done));
  if (added) { await loadReadings(); render(); toast('Updated from Apple Watch'); }
  if (emergencies.length) { const [r, p] = emergencies[emergencies.length - 1]; checkEmergency(r, p); }
};
window.bpOnHealth = async () => {
  if (!window.bpReady) return;
  const n = await hkImport();
  await loadReadings();
  if (S.tab === 'home' || S.tab === 'settings') render();
  if (n) toast(n === 1 ? '1 reading added from Apple Health' : T('{n} readings added from Apple Health', { n }));
  if (hkImport.em) { const [r, p] = hkImport.em; hkImport.em = null; checkEmergency(r, p); }
  else if (hkImport.est) { const w = hkImport.est; hkImport.est = null; await loadReadings(); wbpCheck(w); }
};
window.bpOnWatch = () => { if (S.tab === 'settings') render(); sendWatchState(); };
