/* Family Health Tracker — emergency help and personal patterns ("insights").
   © 2026 Asrar Ahmed Junedi. All rights reserved.
   Emergency: any dangerous reading (typed, read from a photo, entered on the Apple Watch or from a
   cuff in Apple Health) sounds an alert on the phone (and the watch), opens a red help screen with
   "Call 997", a ready message to the family contact, and a "measure again in 5 minutes" reminder.
   Insights: compares the person's own readings with sleep, walking, medicines taken and place. */
'use strict';

/* ------------------------------------------------------------------ emergency */
function emergencyKind(r) {
  if (!r) return null;
  if (r.sys >= 180 || r.dia >= 120) return 'crisis';
  if (r.sys < 80 || r.dia < 50) return 'low';
  if (r.pulse && r.pulse >= 130) return 'pulseHigh';
  if (r.pulse && r.pulse < 40) return 'pulseLow';
  return null;
}
const EM_TEXT = {
  crisis: {
    title: 'Very high blood pressure', lead: 'This reading is dangerously high.',
    steps: ['Sit down, stay calm and breathe slowly.', 'Measure again in 5 minutes.', 'If it is still 180/120 or higher, contact your doctor now.', 'Do not take extra doses of medicine unless your doctor told you to.'],
    urgent: 'Call 997 now if there is chest pain, shortness of breath, back pain, numbness or weakness, change in vision, difficulty speaking, or severe headache.'
  },
  low: {
    title: 'Very low blood pressure', lead: 'This reading is very low.',
    steps: ['Lie down and raise your legs, or sit with your head low.', 'Drink a glass of water if you can swallow safely.', 'Measure again in 5 minutes.', 'Do not stand up quickly or drive.'],
    urgent: 'Call 997 now if there is fainting, confusion, chest pain, cold clammy skin or fast breathing.'
  },
  pulseHigh: {
    title: 'Very fast pulse', lead: 'The pulse is 130 or more.',
    steps: ['Sit down and rest for 10 minutes, breathing slowly.', 'Avoid tea, coffee and energy drinks.', 'Measure again in 5 minutes.'],
    urgent: 'Call 997 now if there is chest pain, fainting, shortness of breath or a pounding, irregular heartbeat.'
  },
  pulseLow: {
    title: 'Very slow pulse', lead: 'The pulse is under 40.',
    steps: ['Sit or lie down.', 'Measure again in 5 minutes.', 'Contact your doctor today, especially if you take heart or blood pressure medicine.'],
    urgent: 'Call 997 now if there is fainting, confusion or chest pain.'
  }
};
const telDigits = s => String(s || '').replace(/[^\d+]/g, '');
function emergencyMessage(r, p, k) {
  const when = fmtTime(r.ts);
  return T('{name}: {what}, {bp}{pulse} at {time}. Please check on them. (Family Health Tracker)', {
    name: p.name, what: tr(EM_TEXT[k].title), bp: r.sys + '/' + r.dia, pulse: r.pulse ? ', ' + T('pulse {n}', { n: r.pulse }) : '', time: when });
}
/* called after every new reading; returns true when it was dangerous */
function checkEmergency(r, p, quiet) {
  const k = emergencyKind(r); if (!k || !p) return false;
  // a reading taken more than 6 hours ago (for example imported later) does not sound an alarm
  if (Date.now() - r.ts > 6 * 3600e3) return false;
  const e = EM_TEXT[k];
  if (NATIVE && NATIVE.alertNow) { try { NATIVE.alertNow(tr(e.title) + ' · ' + p.name, `${r.sys}/${r.dia}${r.pulse ? ' · ' + r.pulse + ' bpm' : ''}. ` + tr(e.lead) + ' ' + tr(e.urgent)); } catch { /* ignore */ } }
  if (!quiet) emergencySheet(r, p, k);
  return true;
}
function emergencySheet(r, p, k) {
  const e = EM_TEXT[k], phone = telDigits(p.emPhone), msg = encodeURIComponent(emergencyMessage(r, p, k));
  const wa = phone ? 'https://wa.me/' + phone.replace(/^\+/, '') + '?text=' + msg : '';
  const sms = phone ? 'sms:' + phone + (IS_IOS ? '&' : '?') + 'body=' + msg : '';
  const body = `<div class="em-box"><div class="em-v num">${r.sys}/${r.dia}${r.pulse ? `<span class="em-p">${r.pulse} bpm</span>` : ''}</div><b>${esc(e.lead)}</b></div>
    <ol class="em-steps">${e.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>
    <p class="em-urgent">${esc(e.urgent)}</p>
    <a class="btn danger block em-call" href="tel:997"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1z" fill="currentColor"/></svg><span>Call 997 (Red Crescent)</span></a>
    ${phone ? `<div class="btn-row"><a class="btn" href="${wa}" target="_blank" rel="noopener"><span>WhatsApp</span> <span data-noi18n>${esc(p.emName || phone)}</span></a><a class="btn" href="${sms}"><span>SMS</span> <span data-noi18n>${esc(p.emName || phone)}</span></a></div>`
      : `<button class="linkbtn" data-act="em-contact" data-id="${p.id}">Add a family member to message in an emergency ›</button>`}
    <button class="btn block" data-act="em-again">Remind me to measure again in 5 minutes</button>`;
  openSheet({ title: e.title, body, foot: '<button class="btn primary" data-close>I understand</button>' });
}
function remindAgain() {
  const t = tr('Measure your blood pressure again'), x = tr('Sit quietly, then measure again and add the reading.');
  if (NATIVE && NATIVE.remindIn) NATIVE.remindIn(5, t, x);
  else setTimeout(() => { toast(t); try { if (window.Notification && Notification.permission === 'granted') new Notification(t, { body: x }); } catch { /* ignore */ } }, 5 * 60e3);
  toast('Reminder set for 5 minutes');
}

/* ------------------------------------------------------------------ insights */
const bpTxt = a => Math.round(avg(a.map(r => r.sys))) + '/' + Math.round(avg(a.map(r => r.dia)));
const sysDiff = (a, b) => Math.round(avg(a.map(r => r.sys)) - avg(b.map(r => r.sys)));
async function bpInsights(p, from, to) {
  to = to || Date.now(); from = from || to - 90 * 864e5;
  const rs = (await DB.byProfile(p.id)).filter(r => r.ts >= from && r.ts <= to);
  if (rs.length < 8) return [];
  const out = [], MIN = 4, DIFF = 5;
  const byDay = new Map(); rs.forEach(r => { const d = dayKey(r.ts); if (!byDay.has(d)) byDay.set(d, []); byDay.get(d).push(r); });
  // sleep (Apple Watch) and the next morning
  if (typeof hkOn === 'function' && hkOn() && stepsOwner() === p.id) {
    const days = hkData().days, morn = rs.filter(r => r.slot === 'morning');
    const short = morn.filter(r => days[dayKey(r.ts)] && days[dayKey(r.ts)].sleep && days[dayKey(r.ts)].sleep < 360);
    const good = morn.filter(r => days[dayKey(r.ts)] && days[dayKey(r.ts)].sleep >= 420);
    if (short.length >= MIN && good.length >= MIN && Math.abs(sysDiff(short, good)) >= DIFF)
      out.push({ k: 'sleep', t: T('After nights with less than 6 hours of sleep, morning blood pressure averaged {a}. After 7 hours or more it averaged {b}.', { a: bpTxt(short), b: bpTxt(good) }), n: short.length + good.length, d: sysDiff(short, good) });
  }
  // walking
  const steps = await stepsByDay(p.id);
  const active = [], quiet = [];
  for (const [d, list] of byDay) { const s = steps.get(d); if (!s || !s.total) continue; (s.total >= STEP_GOAL ? active : s.total < 3000 ? quiet : []).push(...list); }
  if (active.length >= MIN && quiet.length >= MIN && Math.abs(sysDiff(quiet, active)) >= DIFF)
    out.push({ k: 'steps', t: T('On days with {n}+ steps blood pressure averaged {a}. On days with under 3,000 steps it averaged {b}.', { n: fmtN(STEP_GOAL), a: bpTxt(active), b: bpTxt(quiet) }), n: active.length + quiet.length, d: sysDiff(quiet, active) });
  // morning medicine taken or missed (only from the day the "Taken" buttons were first used)
  const doses = await DB.byProfile(p.id, 'doses');
  const meds = (await DB.byProfile(p.id, 'meds')).filter(m => !m.weekly && (m.times || []).includes('morning'));
  if (doses.length && meds.length) {
    const first = doses.map(d => d.day).sort()[0], ids = new Set(meds.map(m => m.id));
    const takenDays = new Set(doses.filter(d => d.k === 'morning' && ids.has(d.medId)).map(d => d.day));
    const later = rs.filter(r => r.slot !== 'morning' && dayKey(r.ts) >= first && dayKey(r.ts) < dayKey(Date.now()));
    const on = later.filter(r => takenDays.has(dayKey(r.ts))), off = later.filter(r => !takenDays.has(dayKey(r.ts)));
    if (on.length >= 3 && off.length >= 3 && Math.abs(sysDiff(off, on)) >= DIFF)
      out.push({ k: 'meds', t: T('When the morning medicine was marked taken, later readings averaged {a}. On days it was not marked, they averaged {b}.', { a: bpTxt(on), b: bpTxt(off) }), n: on.length + off.length, d: sysDiff(off, on) });
  }
  // hospital or clinic versus home ("white coat")
  const home = rs.filter(r => (r.place || 'home') === 'home'), hosp = rs.filter(r => r.place === 'hospital');
  if (home.length >= MIN && hosp.length >= 3 && sysDiff(hosp, home) >= 10)
    out.push({ k: 'place', t: T('Readings at the hospital or clinic averaged {a}, higher than at home ({b}). Some people get higher readings at the doctor’s; home readings help show the usual level.', { a: bpTxt(hosp), b: bpTxt(home) }), n: hosp.length + home.length, d: sysDiff(hosp, home) });
  // time of day
  const am = rs.filter(r => r.slot === 'morning'), pm = rs.filter(r => r.slot === 'evening');
  if (am.length >= MIN && pm.length >= MIN && Math.abs(sysDiff(am, pm)) >= 10)
    out.push({ k: 'time', t: sysDiff(am, pm) > 0 ? T('Morning readings are usually higher ({a}) than evening readings ({b}). Ask your doctor whether the timing of your medicine suits you.', { a: bpTxt(am), b: bpTxt(pm) })
      : T('Evening readings are usually higher ({a}) than morning readings ({b}).', { a: bpTxt(pm), b: bpTxt(am) }), n: am.length + pm.length, d: sysDiff(am, pm) });
  // the last 2 weeks against the 2 weeks before
  const now = to, a2 = rs.filter(r => r.ts > now - 14 * 864e5), b2 = rs.filter(r => r.ts <= now - 14 * 864e5 && r.ts > now - 28 * 864e5);
  if (a2.length >= MIN && b2.length >= MIN && Math.abs(sysDiff(a2, b2)) >= DIFF)
    out.push({ k: 'trend', t: sysDiff(a2, b2) < 0 ? T('Good progress: the last 2 weeks averaged {a}, lower than the 2 weeks before ({b}).', { a: bpTxt(a2), b: bpTxt(b2) })
      : T('The last 2 weeks averaged {a}, higher than the 2 weeks before ({b}).', { a: bpTxt(a2), b: bpTxt(b2) }), n: a2.length + b2.length, d: sysDiff(a2, b2) });
  return out.sort((x, y) => Math.abs(y.d) - Math.abs(x.d)).slice(0, 4);
}
function insightsCard(list) {
  if (!list || !list.length) return '';
  return `<div class="card"><h2>Patterns in your readings</h2><ul class="tips" style="margin:0">${list.map(i => `<li>${esc(i.t)}</li>`).join('')}</ul>
    <p class="small muted" style="margin:8px 0 0">These are patterns in your own readings, not proof of cause. Talk them over with your doctor.</p></div>`;
}
