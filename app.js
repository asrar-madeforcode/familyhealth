/* Family Health Tracker — © 2026 Asrar Ahmed Junedi. All rights reserved. */
'use strict';

const APP_VERSION = '2.0.0';
const COPYRIGHT = '© 2026 Asrar Ahmed Junedi. All rights reserved.';
const MAX_PEOPLE = 10;
const NATIVE = window.BPNative || null;
const IOS_APP = !!(NATIVE && NATIVE.platform === 'ios');
const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/* ------------------------------------------------------------------ storage */
const DB = {
  db: null,
  open() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('bptracker', 9);
      r.onupgradeneeded = (ev) => {
        const d = r.result;
        if (ev.oldVersion < 1) {
          d.createObjectStore('profiles', { keyPath: 'id' });
          const rs = d.createObjectStore('readings', { keyPath: 'id' });
          rs.createIndex('profileId', 'profileId');
          d.createObjectStore('photos');
        }
        if (ev.oldVersion < 2) {
          d.createObjectStore('meds', { keyPath: 'id' }).createIndex('profileId', 'profileId');
          d.createObjectStore('docs', { keyPath: 'id' }).createIndex('profileId', 'profileId');
          d.createObjectStore('docfiles');
        }
        if (ev.oldVersion < 3) d.createObjectStore('steps', { keyPath: 'id' }).createIndex('profileId', 'profileId');
        if (ev.oldVersion < 4) d.createObjectStore('sugar', { keyPath: 'id' }).createIndex('profileId', 'profileId');
        if (ev.oldVersion < 5) {
          d.createObjectStore('thyroid', { keyPath: 'id' }).createIndex('profileId', 'profileId');
          d.createObjectStore('appts', { keyPath: 'id' }).createIndex('profileId', 'profileId');
        }
        if (ev.oldVersion < 6) d.createObjectStore('doses', { keyPath: 'id' }).createIndex('profileId', 'profileId');
        if (ev.oldVersion < 7) d.createObjectStore('wbp', { keyPath: 'id' }).createIndex('profileId', 'profileId');
        if (ev.oldVersion < 9) { for (const n of ['labs', 'symptoms', 'women']) d.createObjectStore(n, { keyPath: 'id' }).createIndex('profileId', 'profileId'); }
        if (ev.oldVersion < 8) { d.createObjectStore('vitals', { keyPath: 'id' }).createIndex('profileId', 'profileId'); d.createObjectStore('devices', { keyPath: 'id' }); }
      };
      r.onsuccess = () => { this.db = r.result; res(); };
      r.onerror = () => rej(r.error);
    });
  },
  tx(store, mode, fn) {
    return new Promise((res, rej) => {
      const t = this.db.transaction(store, mode);
      const req = fn(t.objectStore(store));
      let out;
      if (req) req.onsuccess = () => { out = req.result; };
      t.oncomplete = () => res(out);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error || new Error('Storage aborted'));
    });
  },
  all(store) { return this.tx(store, 'readonly', s => s.getAll()); },
  get(store, key) { return this.tx(store, 'readonly', s => s.get(key)); },
  put(store, val, key) { return this.tx(store, 'readwrite', s => (key !== undefined ? s.put(val, key) : s.put(val))); },
  del(store, key) { return this.tx(store, 'readwrite', s => s.delete(key)); },
  byProfile(pid, store = 'readings') { return this.tx(store, 'readonly', s => s.index('profileId').getAll(pid)); }
};
const LS = {
  get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } }
};

/* ------------------------------------------------------------------ guidance */
const EMERGENCY = 'In Saudi Arabia call 997 (Red Crescent) or 911.';
const CATS = {
  low: {
    key: 'low', label: 'Low', title: 'Low blood pressure', range: 'Below 90 / below 60',
    summary: 'Your blood pressure is lower than usual. Many people feel fine, but it can cause dizziness or fainting.',
    tips: [
      'Sit or lie down straight away if you feel dizzy, light-headed or weak.',
      'Drink a glass or two of water. Dehydration is a common cause.',
      'Stand up slowly, especially in the morning or after sitting for a long time.',
      'Do not drive or climb stairs while you feel unsteady.',
      'Eat small, regular meals and avoid long hot showers when dizzy.',
      'If you take blood pressure tablets, tell your doctor about low readings. Do not stop medicine on your own.'
    ],
    urgent: 'Get urgent help if low pressure comes with fainting, confusion, chest pain, cold clammy skin or fast breathing.'
  },
  normal: {
    key: 'normal', label: 'Normal', title: 'Normal blood pressure', range: 'Below 120 and below 80',
    summary: 'Your reading is in the healthy range.',
    tips: [
      'Keep up a balanced diet with plenty of vegetables and fruit, and not much salt.',
      'Stay active: about 30 minutes of walking on most days.',
      'Keep measuring at the same times each day so trends are easy to see.'
    ]
  },
  elevated: {
    key: 'elevated', label: 'Elevated', title: 'Elevated blood pressure', range: '120–129 and below 80',
    summary: 'Slightly above the healthy range. Lifestyle changes now can stop it rising further.',
    tips: [
      'Cut down on salt: avoid processed food, pickles, chips and added salt.',
      'Walk briskly for 30 minutes on most days.',
      'Limit tea, coffee and energy drinks, and do not smoke.',
      'Aim for 7–8 hours of sleep and manage stress.',
      'Keep weight in a healthy range.',
      'Keep recording readings and show the report at your next check-up.'
    ]
  },
  stage1: {
    key: 'stage1', label: 'High – Stage 1', title: 'High blood pressure (Stage 1)', range: '130–139 or 80–89',
    summary: 'Your blood pressure is high. Over time this strains the heart, brain and kidneys.',
    tips: [
      'Rest quietly for 5 minutes and measure again to confirm.',
      'Reduce salt, fried food and processed food. Eat more vegetables, fruit and whole grains.',
      'Exercise regularly, limit caffeine, and avoid smoking and shisha.',
      'Take any prescribed medicine exactly as directed. Do not skip doses.',
      'If most readings this week are in this range, book a doctor’s appointment and take your PDF report.'
    ]
  },
  stage2: {
    key: 'stage2', label: 'High – Stage 2', title: 'High blood pressure (Stage 2)', range: '140–179 or 90–119',
    summary: 'Your blood pressure is clearly high and needs medical attention.',
    tips: [
      'Sit and rest for 5 minutes, then measure again.',
      'Take your blood pressure medicine as prescribed.',
      'Avoid salty food, caffeine, heavy exercise and stress today.',
      'See your doctor within the next few days and bring your PDF report.'
    ],
    urgent: 'Get urgent help if you have chest pain, shortness of breath, severe headache, weakness, numbness, or trouble seeing or speaking.'
  },
  crisis: {
    key: 'crisis', label: 'Crisis', title: 'Very high – possible hypertensive crisis', range: '180 or higher and/or 120 or higher',
    summary: 'This reading is dangerously high.',
    tips: [
      'Stay calm, sit down and rest for 5 minutes, then measure again.',
      'If it is still 180/120 or higher, contact your doctor immediately.',
      'Do not take extra doses of medicine unless your doctor told you to.'
    ],
    urgent: 'Call emergency services now if you also have chest pain, shortness of breath, back pain, numbness or weakness, change in vision, difficulty speaking, or severe headache. ' + EMERGENCY
  }
};
const CAT_ORDER = ['low', 'normal', 'elevated', 'stage1', 'stage2', 'crisis'];
const CAT_HEX = { low: '#2C66C9', normal: '#23894F', elevated: '#B8860B', stage1: '#D9691C', stage2: '#CC3A2B', crisis: '#9B1631' };

function bpCategory(s, d) {
  if (s >= 180 || d >= 120) return 'crisis';
  if (s >= 140 || d >= 90) return 'stage2';
  if (s >= 130 || d >= 80) return 'stage1';
  if (s < 90 || d < 60) return 'low';
  if (s >= 120) return 'elevated';
  return 'normal';
}
const PULSE = {
  low: {
    key: 'low', label: 'Low pulse', color: 'low',
    summary: 'Pulse is under 60 beats per minute. This can be normal for fit people or with some heart medicines.',
    tips: ['Sit down and rest.', 'If you feel dizzy, faint, short of breath or very tired, see a doctor soon.'],
    urgent: 'Get urgent help if a low pulse comes with fainting or chest pain.'
  },
  normal: { key: 'normal', label: 'Normal pulse', color: 'normal', summary: 'Pulse is in the normal resting range (60–100).', tips: [] },
  high: {
    key: 'high', label: 'High pulse', color: 'stage1',
    summary: 'Pulse is over 100 beats per minute at rest. Caffeine, stress, fever, dehydration or recent activity can cause this.',
    tips: ['Rest for 10 minutes, breathe slowly, then measure again.', 'Drink water and avoid tea, coffee and energy drinks.', 'If it stays above 100 at rest, see a doctor.'],
    urgent: 'Get urgent help if a fast pulse comes with chest pain, fainting, shortness of breath or a pounding, irregular heartbeat.'
  }
};
function pulseCategory(p) { if (!p) return null; if (p < 60) return 'low'; if (p > 100) return 'high'; return 'normal'; }
const MEASURE_TIPS = [
  'Sit quietly for 5 minutes before measuring, back supported and feet flat on the floor.',
  'No coffee, tea, smoking or exercise for 30 minutes before.',
  'Use the bathroom first. A full bladder raises readings.',
  'Rest your arm on a table with the cuff at heart level, on bare skin.',
  'Do not talk or move during the measurement.',
  'Measure at about the same times each day.'
];

/* ------------------------------------------------------------------ helpers */
const SLOTS = [{ k: 'morning', l: 'Morning' }, { k: 'afternoon', l: 'Afternoon' }, { k: 'evening', l: 'Evening' }];
const slotLabel = k => (SLOTS.find(s => s.k === k) || SLOTS[0]).l;
function slotFor(date) { const h = date.getHours(); return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'; }
const pad = n => String(n).padStart(2, '0');
function dayKey(ts) { const d = new Date(ts); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
/* dates follow the app language on screen; the PDF report is always English */
let PDF_EN = false;
/* translated text with {name} slots, for notifications built here */
function T(key, v) { const s = typeof I18N !== 'undefined' && !PDF_EN ? I18N.tr(key) : key; return s.replace(/\{(\w+)\}/g, (_, k) => v && v[k] != null ? v[k] : ''); }
const tr = s => typeof I18N !== 'undefined' && !PDF_EN ? I18N.tr(s) : s;
const LOCALES = { ar: 'ar-SA-u-ca-gregory-nu-latn', ur: 'ur-PK-u-nu-latn', hi: 'hi-IN-u-nu-latn', ml: 'ml-IN-u-nu-latn', ta: 'ta-IN-u-nu-latn', te: 'te-IN-u-nu-latn', bn: 'bn-IN-u-nu-latn', tl: 'fil-PH', id: 'id-ID' };
function loc(fallback) { const l = typeof I18N !== 'undefined' && !PDF_EN ? I18N.lang : 'en'; return LOCALES[l] || fallback; }
function fmtDate(ts, opts) { return new Date(ts).toLocaleDateString(loc('en-GB'), opts || { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }); }
function fmtTime(ts) { return new Date(ts).toLocaleTimeString(loc('en-US'), { hour: 'numeric', minute: '2-digit' }); }
function localInputValue(ts) { const d = new Date(ts); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
function initials(name) { const p = String(name || '?').trim().split(/\s+/); return ((p[0] || '?')[0] + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase(); }
function bmi(p) { if (!p || !p.weight || !p.height) return null; const m = p.height / 100; return p.weight / (m * m); }
function bmiLabel(b) { if (b == null) return ''; if (b < 18.5) return 'underweight'; if (b < 25) return 'healthy'; if (b < 30) return 'overweight'; return 'obese'; }
function avg(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : null; }
function toast(msg, ms = 2600) { const t = $('#toast'); t.textContent = typeof I18N !== 'undefined' ? I18N.tr(msg) : msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, ms); }
function blobToDataURL(blob) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(blob); }); }
function dataURLToBlob(u) { const [h, b] = u.split(','); const mime = (h.match(/data:([^;]+)/) || [])[1] || 'application/octet-stream'; const bin = atob(b); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return new Blob([a], { type: mime }); }

function loadImage(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Could not open that image')); i.src = src; }); }
async function squarePhoto(file, size) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const s0 = Math.min(img.naturalWidth, img.naturalHeight), c = document.createElement('canvas'); c.width = c.height = size;
    c.getContext('2d').drawImage(img, (img.naturalWidth - s0) / 2, (img.naturalHeight - s0) / 2, s0, s0, 0, 0, size, size);
    return await new Promise(r => c.toBlob(r, 'image/jpeg', 0.85));
  } finally { URL.revokeObjectURL(url); }
}
async function shrinkImage(file, max = 1400, q = 0.82) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const sc = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * sc), h = Math.round(img.naturalHeight * sc);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(img, 0, 0, w, h);
    return await new Promise(r => c.toBlob(r, 'image/jpeg', q));
  } finally { URL.revokeObjectURL(url); }
}

/* ------------------------------------------------------------------ state */
const S = { profiles: [], current: null, readings: [], meds: [], docs: [], sugar: [], steps: new Map(), tab: 'home', urls: [] };
function cur() { return S.profiles.find(p => p.id === S.current) || null; }

const AV = {};   // person id -> photo URL
function avatar(p, inner) { return AV[p.id] ? `<img class="avimg" src="${AV[p.id]}" alt="">` : esc(inner || initials(p.name)); }
async function loadAvatars() {
  for (const p of S.profiles) {
    if (!p.hasPhoto) { if (AV[p.id]) { URL.revokeObjectURL(AV[p.id]); delete AV[p.id]; } continue; }
    if (AV[p.id] && AV[p.id + ':v'] === p.photoV) continue;
    const b = await DB.get('docfiles', 'pp_' + p.id); if (!b) continue;
    if (AV[p.id]) URL.revokeObjectURL(AV[p.id]);
    AV[p.id] = URL.createObjectURL(b); AV[p.id + ':v'] = p.photoV;
  }
}
async function loadProfiles() {
  S.profiles = (await DB.all('profiles')).sort((a, b) => a.created - b.created);
  I18N.setNames(S.profiles.map(p => p.name));
  await loadAvatars();
  const saved = LS.get('bp.current', null);
  if (!S.profiles.find(p => p.id === S.current)) S.current = S.profiles.find(p => p.id === saved) ? saved : (S.profiles[0] ? S.profiles[0].id : null);
}
async function loadReadings() {
  S.readings = S.current ? (await DB.byProfile(S.current)).sort((a, b) => b.ts - a.ts) : [];
  S.meds = S.current ? (await DB.byProfile(S.current, 'meds')).sort((a, b) => (b.active - a.active) || a.created - b.created) : [];
  S.docs = S.current ? (await DB.byProfile(S.current, 'docs')).sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.created - a.created) : [];
  S.steps = S.current ? await stepsByDay(S.current) : new Map();
  S.sugar = S.current ? (await DB.byProfile(S.current, 'sugar')).sort((a, b) => b.ts - a.ts) : [];
  S.thy = S.current ? await thyPoints(S.current) : [];
  S.appts = S.current ? (await DB.byProfile(S.current, 'appts')) : [];
  S.doses = S.current ? await loadDoses(S.current) : [];
  S.wbp = S.current ? (await DB.byProfile(S.current, 'wbp')).sort((a, b) => b.ts - a.ts) : [];
  S.vitals = S.current ? (await DB.byProfile(S.current, 'vitals')).sort((a, b) => b.ts - a.ts) : [];
  S.devices = await allDevices();
}
async function selectPerson(id) { S.current = id; LS.set('bp.current', id); await loadReadings(); render(); }

/* ------------------------------------------------------------------ rendering */
function revokeUrls() { S.urls.forEach(u => URL.revokeObjectURL(u)); S.urls = []; }
async function photoURL(id) { const b = await DB.get('photos', id); if (!b) return null; const u = URL.createObjectURL(b); S.urls.push(u); return u; }

function render() {
  revokeUrls();
  renderPeople();
  $$('.tabbar [data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === S.tab));
  $$('.view').forEach(v => { v.hidden = v.id !== 'view-' + S.tab; });
  ({ home: renderHome, history: renderHistory, family: renderFamily, settings: renderSettings })[S.tab]();
  sendWatchState();
}

function renderPeople() {
  const el = $('#people');
  if (!S.profiles.length) { el.innerHTML = ''; el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = S.profiles.map(p => `<button class="chip ${p.id === S.current ? 'on' : ''}" data-person="${p.id}"><span class="av">${avatar(p)}</span>${esc(p.name)}</button>`).join('') +
    (S.profiles.length < MAX_PEOPLE ? `<button class="chip add" data-act="add-person">+ Add person</button>` : '');
  const on = el.querySelector('.chip.on'); if (on) on.scrollIntoView({ inline: 'nearest', block: 'nearest' });
}

function profileStats(p) {
  const b = bmi(p);
  return `<div class="stats num">${p.age ? `<span>Age <b>${esc(p.age)}</b></span>` : ''}${p.height ? `<span>Height <b>${esc(p.height)} cm</b></span>` : ''}${p.weight ? `<span>Weight <b>${esc(p.weight)} kg</b></span>` : ''}${b ? `<span>BMI <b>${b.toFixed(1)}</b> ${bmiLabel(b)}</span>` : ''}</div>`;
}

function guideHTML(r) {
  const c = CATS[bpCategory(r.sys, r.dia)];
  const pk = pulseCategory(r.pulse);
  let h = `<div class="guide-box" style="--cat:var(--c-${c.key})"><h3>${esc(c.title)}</h3><p>${esc(c.summary)}</p>${c.tips.length ? '<ul>' + c.tips.map(t => `<li>${esc(t)}</li>`).join('') + '</ul>' : ''}${c.urgent ? `<p class="urgent">${esc(c.urgent)}</p>` : ''}</div>`;
  if (pk && pk !== 'normal') {
    const pc = PULSE[pk];
    h += `<div class="guide-box" style="--cat:var(--c-${pc.color})"><h3>${esc(pc.label)}: ${r.pulse} bpm</h3><p>${esc(pc.summary)}</p><ul>${pc.tips.map(t => `<li>${esc(t)}</li>`).join('')}</ul>${pc.urgent ? `<p class="urgent">${esc(pc.urgent)}</p>` : ''}</div>`;
  }
  return h;
}

function langSelect() {
  return `<select class="input" id="set-lang" data-noi18n>${I18N.LANGS.map(l => `<option value="${l.k}" ${l.k === I18N.lang ? 'selected' : ''}>${l.name}</option>`).join('')}</select>`;
}
/* ---- privacy: what the app does and does not do with the family's data */
function privacyCardHTML() {
  return `<div class="card privacy-card"><div class="row" style="gap:10px"><span class="mic"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l7 3v5.5c0 4.4-3 8.2-7 9.5-4-1.3-7-5.1-7-9.5V6z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M8.8 12.2l2.2 2.2 4.3-4.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span><h2 style="margin:0;flex:1">Privacy and safety</h2></div>
    <ul class="privacy-list">
      <li><b>No data collection.</b> This app does not collect, send, sell or share any of your data. Nothing is sent to the app maker or anyone else.</li>
      <li><b>No account, no login, no sign-up.</b> No email or phone number is ever asked for.</li>
      <li><b>No ads and no tracking.</b> There are no advertising, analytics or tracking tools in the app.</li>
      <li><b>Everything stays on this phone.</b> Photos, test reports and readings are read on the phone itself and are never uploaded.</li>
      <li><b>Backups go only where you choose:</b> your own Google Drive or iCloud. A password is optional.</li>
      <li><b>Works without internet.</b> The internet is only used when you open a link yourself, such as calling 997 or sending a WhatsApp message.</li>
      <li><b>You are in control.</b> You can delete a person and all their data at any time, and app updates never remove your data.</li>
    </ul></div>`;
}
/* ---- the app's creator (About) */
const CREATOR_PHOTO = true;
function creatorHTML() {
  // the creator's photo goes in www/creator.jpg; set CREATOR_PHOTO to true when it is added
  return `<div class="creator">${CREATOR_PHOTO ? '<img class="creator-ph" src="creator.jpg" alt="">' : '<span class="creator-ph creator-ini" aria-hidden="true">AJ</span>'}
    <span style="flex:1;min-width:0"><span class="small muted">Created by</span><br><b class="creator-name" data-noi18n>Asrar Ahmed Junedi</b><br><span class="small muted">Made with care for families who look after each other’s health.</span></span></div>`;
}
function emptyWelcome() {
  return `<div class="card empty-state">
    <svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 27s-10-6.2-10-13.3A5.7 5.7 0 0 1 16 10a5.7 5.7 0 0 1 10 3.7C26 20.8 16 27 16 27z" fill="var(--accent)"/><path d="M7 16h5l2-4 3 8 2-4h6" fill="none" stroke="var(--on-accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
    <h2>Welcome to Family Health Tracker</h2>
    <p class="muted">Add each family member (up to ${MAX_PEOPLE}). Then take a photo of the monitor morning, afternoon and evening, and the numbers fill in by themselves.</p>
    <button class="btn primary" data-act="add-person">Add first person</button>
    <p class="privacy-line"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l7 3v5.5c0 4.4-3 8.2-7 9.5-4-1.3-7-5.1-7-9.5V6z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M8.8 12.2l2.2 2.2 4.3-4.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg><span>Private and safe: no account, no sign-up, and no data collection. Everything stays on your phone.</span></p>
    <div class="field" style="margin-top:18px;text-align:start"><label for="set-lang">Language</label>${langSelect()}</div>
  </div><p class="copyright">${COPYRIGHT}</p>`;
}

async function renderHome() {
  const v = $('#view-home');
  const p = cur();
  if (!p) { v.innerHTML = emptyWelcome(); return; }
  const today = dayKey(Date.now());
  const todays = S.readings.filter(r => dayKey(r.ts) === today);
  const slotHTML = SLOTS.map(s => {
    const r = todays.find(x => x.slot === s.k);
    if (!r) return `<button class="slot empty" data-act="add-reading" data-slot="${s.k}"><span class="sl">${s.l}</span><span class="plus">+</span><span class="small">Add</span></button>`;
    const c = bpCategory(r.sys, r.dia);
    return `<button class="slot done" style="--cat:var(--c-${c})" data-reading="${r.id}"><span class="sl">${s.l}</span><span class="sv num">${r.sys}/${r.dia}</span><span class="sp num">${r.pulse ? r.pulse + ' bpm' : ''}</span><span class="pill" style="--cat:var(--c-${c})">${CATS[c].label}</span></button>`;
  }).join('');
  const last = S.readings[0];
  let latest = '';
  if (last) {
    const c = bpCategory(last.sys, last.dia);
    latest = `<div class="card latest" style="--cat:var(--c-${c})">
      <h2>Latest reading</h2>
      <div class="reading-big"><span class="v num">${last.sys}/${last.dia}</span><span class="u">mmHg</span>${last.pulse ? `<span class="u num">· pulse ${last.pulse} bpm</span>` : ''}</div>
      <div class="row small muted" style="margin-top:6px"><span class="pill" style="--cat:var(--c-${c})">${CATS[c].label}</span><span>${esc(fmtDate(last.ts))}, ${esc(fmtTime(last.ts))} · ${slotLabel(last.slot)}</span></div>
      ${guideHTML(last)}
    </div>`;
  }
  const done = todays.length ? new Set(todays.map(r => r.slot)).size : 0;
  const ins = bpOn(p) ? await bpInsights(p) : [];
  const condHTML = await conditionsCard(p), womenHTML = await womenCard(p);
  if (cur() !== p || S.tab !== 'home') return;
  v.innerHTML = `
    <div class="card"><div class="who"><div class="big-av">${avatar(p)}</div><div style="min-width:0;flex:1"><div class="nm">${esc(p.name)}</div>${profileStats(p)}</div><button class="btn sm" data-act="edit-person" data-id="${p.id}">Edit</button></div></div>
    ${bpOn(p) ? `<div class="card"><div class="row"><h2 style="margin:0">Today · ${esc(fmtDate(Date.now(), { weekday: 'long', day: 'numeric', month: 'short' }))}</h2><span class="spacer"></span><span class="small muted num">${done} of 3 done</span></div><div class="slots" style="margin-top:10px">${slotHTML}</div></div>` : ''}
    ${bpOn(p) ? latest : ''}
    ${insightsCard(ins)}
    ${womenHTML}
    ${condHTML}
    ${backupNudge()}
    ${devicesBar(p)}
    ${medsCard(p)}
    ${apptCard(p)}
    ${p.trackSugar ? sugarCard(p) : ''}
    ${p.trackThyroid ? thyroidCard(p) : ''}
    ${stepsCard(p)}
    ${healthCard(p)}
    ${wbpCard(p)}
    ${vitalsCard(p)}
    ${docsCard(p)}
    ${bpOn(p) && S.readings.length >= 2 ? `<div class="card"><h2>Last 14 days</h2>${chartSVG(S.readings.filter(r => r.ts > Date.now() - 14 * 864e5))}<div class="legend"><span><i style="background:var(--c-stage2)"></i>Systolic (top)</span><span><i style="background:var(--c-low)"></i>Diastolic (bottom)</span><span><i style="background:var(--muted);height:1px"></i>120 / 80 guide</span></div></div>` : ''}
    ${bpOn(p) && !S.readings.length ? `<div class="card empty-state"><h2>No readings yet</h2><p class="muted">Tap the camera button to add ${esc(p.name)}’s first reading.</p><button class="btn primary" data-act="add-reading">Add reading</button></div>` : ''}
    <button class="btn block" data-act="report"><svg viewBox="0 0 24 24"><path d="M6 3h8l4 4v14H6z M14 3v4h4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9 13h6M9 17h6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>Create PDF report</button>
    <p class="copyright">${COPYRIGHT}</p>`;
  fillDocThumbs(v);
}

/* ---- blood sugar (optional per person) */
const SG_TIMES = [{ k: 'fasting', l: 'Fasting' }, { k: 'before', l: 'Before meal' }, { k: 'after', l: '2 h after meal' }, { k: 'bedtime', l: 'Bedtime' }, { k: 'random', l: 'Random' }];
const sgTimeLabel = k => (SG_TIMES.find(x => x.k === k) || SG_TIMES[4]).l;
const toUnit = (mg, u) => (u === 'mmol/L' ? Math.round(mg / 18 * 10) / 10 : Math.round(mg));
const fromUnit = (v, u) => (u === 'mmol/L' ? v * 18 : v);
const sgFmt = (mg, u) => `${toUnit(mg, u)} ${u}`;
const SG_CATS = {
  vlow: { label: 'Very low', color: 'crisis', title: 'Very low blood sugar', summary: 'Below 54 mg/dL (3.0 mmol/L). This needs action now.',
    tips: ['Take 15–20 g of fast sugar now: half a glass of juice or regular soft drink, 3–4 glucose tablets, or 1 tablespoon of honey.', 'Check again after 15 minutes. Repeat if still below 70 mg/dL (3.9 mmol/L).', 'When it is back up, eat a snack or meal.', 'Do not drive.'],
    urgent: 'Call 997 if the person is confused, very drowsy, cannot swallow or has a seizure. Do not give food or drink by mouth if they are not fully awake.' },
  low: { label: 'Low', color: 'low', title: 'Low blood sugar', summary: 'Below 70 mg/dL (3.9 mmol/L). It can cause shaking, sweating, hunger, confusion or a fast heartbeat.',
    tips: ['Use the 15-15 rule: take 15 g of fast sugar (half a glass of juice, 3–4 glucose tablets or 1 tablespoon of honey), then check again after 15 minutes.', 'Repeat if still below 70 mg/dL (3.9 mmol/L), then eat a snack.', 'Tell your doctor if lows happen often; your medicine may need changing.'] },
  normal: { label: 'In range', color: 'normal', title: 'Blood sugar in range', summary: 'This reading is in the usual healthy range.', tips: ['Keep following your meal plan, activity and medicines.'] },
  raised: { label: 'Raised', color: 'elevated', title: 'Raised blood sugar', summary: 'Above the healthy range.',
    tips: ['Cut down on sweets, sugary drinks, white bread and white rice; choose vegetables, beans and whole grains.', 'A 15–30 minute walk after meals helps bring sugar down.', 'Drink water and take your medicines as prescribed.', 'Keep a record and show the report to your doctor.'] },
  high: { label: 'High', color: 'stage2', title: 'High blood sugar', summary: 'Well above the healthy range.',
    tips: ['Drink water, take your medicines as prescribed and check again later.', 'Avoid sugary food and drinks today.', 'If most readings are this high, see your doctor soon; your treatment may need adjusting.'] },
  vhigh: { label: 'Very high', color: 'crisis', title: 'Very high blood sugar', summary: 'Over 300 mg/dL (16.7 mmol/L).',
    tips: ['Drink water and check again in 1–2 hours.', 'Contact your doctor today.'],
    urgent: 'Get urgent help (997) if you have vomiting, stomach pain, deep or fast breathing, fruity-smelling breath, confusion or extreme drowsiness.' }
};
function sgCategory(mg, timing) {
  if (mg < 54) return 'vlow';
  if (mg < 70) return 'low';
  if (mg >= 300) return 'vhigh';
  const fasting = timing === 'fasting' || timing === 'before';
  if (fasting) return mg < 100 ? 'normal' : mg < 126 ? 'raised' : 'high';
  return mg < 140 ? 'normal' : mg < 200 ? 'raised' : 'high';
}
const SG_HEX = { vlow: '#9B1631', low: '#2C66C9', normal: '#23894F', raised: '#B8860B', high: '#CC3A2B', vhigh: '#9B1631' };
function sgGuideHTML(g) {
  const c = SG_CATS[sgCategory(g.mg, g.timing)];
  return `<div class="guide-box" style="--cat:var(--c-${c.color})"><h3>${esc(c.title)}</h3><p>${esc(c.summary)}</p><ul>${c.tips.map(t => `<li>${esc(t)}</li>`).join('')}</ul>${c.urgent ? `<p class="urgent">${esc(c.urgent)}</p>` : ''}<p class="small muted" style="margin:6px 0 0">Ranges shown are for adults without special targets. If you have diabetes, your doctor may give you different targets (often 80–130 mg/dL before meals and under 180 mg/dL 2 hours after).</p></div>`;
}
function sugarCard(p) {
  const u = p.sugarUnit || 'mg/dL', last = S.sugar[0];
  const wk = S.sugar.filter(g => g.ts > Date.now() - 7 * 864e5);
  const fast = wk.filter(g => g.timing === 'fasting'), lows = wk.filter(g => g.mg < 70).length;
  let h = `<div class="card"><div class="row"><h2 style="margin:0">Blood sugar</h2><span class="spacer"></span><button class="btn sm" data-act="sugar-rem">Reminders</button><button class="btn sm" data-act="add-sugar">+ Add</button></div>`;
  if (last) {
    const k = sgCategory(last.mg, last.timing), c = SG_CATS[k];
    h += `<div class="row" style="margin-top:8px;align-items:baseline"><span class="num" style="font-size:2rem;font-weight:850;letter-spacing:-.02em">${toUnit(last.mg, u)}</span><span class="muted">${esc(u)}</span><span class="pill" style="--cat:var(--c-${c.color})">${esc(c.label)}</span></div>
      <div class="small muted">${esc(sgTimeLabel(last.timing))} · ${esc(fmtDate(last.ts, { weekday: 'short', day: 'numeric', month: 'short' }))}, ${esc(fmtTime(last.ts))}</div>
      <div class="small muted num" style="margin-top:4px">Last 7 days: ${wk.length} reading${wk.length === 1 ? '' : 's'}${fast.length ? ` · fasting avg ${toUnit(avg(fast.map(g => g.mg)), u)}` : ''}${lows ? ` · <b style="color:var(--c-low)">${lows} low</b>` : ''}</div>
      <button class="linkbtn" data-act="all-sugar">All sugar readings ›</button>`;
  } else h += `<p class="small muted" style="margin:10px 0 0">No sugar readings yet. Tap “+ Add” after each test, or take a photo of the meter.</p>`;
  return h + '</div>';
}
function sugarSheet(existing) {
  const p = cur(); if (!p) return;
  const g = existing || null, u = p.sugarUnit || 'mg/dL';
  const now = new Date(), h0 = now.getHours();
  let timing = g ? g.timing : h0 < 10 ? 'fasting' : 'random', photo = null, photoChanged = false;
  const body = `<div class="small muted">For ${esc(p.name)}</div>
    <div class="photo-zone small-zone" id="sg-zone"><div class="ph-empty">Photo of the sugar meter (optional)</div></div>
    ${canLiveScan() ? `<button type="button" class="btn primary block" id="sg-live-scan"><svg viewBox="0 0 24 24"><path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M8 12h8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg><span>Scan the meter live</span></button>` : ''}
    <div class="btn-row"><label class="btn ${canLiveScan() ? '' : 'primary'}" for="sg-cam">Take photo</label><label class="btn" for="sg-gal">From gallery</label></div>
    <input type="file" id="sg-cam" accept="image/*" capture="environment" hidden><input type="file" id="sg-gal" accept="image/*" hidden>
    <div id="sg-ocr" class="ocr-msg" hidden></div>
    <div class="field"><label for="sg-v">Blood sugar (${esc(u)})</label><input class="input bpin" id="sg-v" type="number" inputmode="decimal" step="${u === 'mmol/L' ? '0.1' : '1'}" value="${g ? toUnit(g.mg, u) : ''}" placeholder="${u === 'mmol/L' ? '5.6' : '100'}"></div>
    <div id="sg-live"></div>
    <div class="field"><span class="lbl">When</span><div class="tchips" id="sg-t">${SG_TIMES.map(t => `<button type="button" data-t="${t.k}" class="${t.k === timing ? 'on' : ''}">${t.l}</button>`).join('')}</div></div>
    <div class="field"><label for="sg-when">Date and time</label><input class="input" id="sg-when" type="datetime-local" value="${localInputValue(g ? g.ts : now.getTime())}"></div>
    <div class="field"><label for="sg-note">Note (optional)</label><input class="input" id="sg-note" maxlength="80" value="${esc(g && g.note || '')}" placeholder="e.g. after walk, felt shaky"></div>
    <p class="err" id="sg-err" hidden></p>
    ${g ? '<button class="btn danger block" data-del>Delete this reading</button>' : ''}`;
  const sh = openSheet({ title: g ? 'Edit sugar reading' : 'New sugar reading', body, full: true, foot: '<button class="btn" data-close>Cancel</button><button class="btn primary" data-save>Save</button>' });
  const el = sh.el, vbox = $('#sg-v', el);
  const live = () => { const v = parseFloat(String(vbox.value).replace(',', '.')); if (!isFinite(v) || v <= 0) { $('#sg-live', el).innerHTML = ''; return; } const mg = fromUnit(v, u); $('#sg-live', el).innerHTML = sgGuideHTML({ mg, timing }); };
  vbox.addEventListener('input', () => { vbox.classList.remove('auto', 'unsure'); live(); });
  $$('#sg-t button', el).forEach(b => b.onclick = () => { timing = b.dataset.t; $$('#sg-t button', el).forEach(x => x.classList.toggle('on', x === b)); live(); });
  live();
  const zone = $('#sg-zone', el);
  if (g && g.hasPhoto) DB.get('photos', 'sg_' + g.id).then(b => { if (b) { const x = URL.createObjectURL(b); S.urls.push(x); zone.innerHTML = `<img src="${x}" alt="Meter photo">`; } });
  const onFile = async e => {
    const f = e.target.files && e.target.files[0]; e.target.value = ''; if (!f) return;
    try { photo = await shrinkImage(f); photoChanged = true; const x = URL.createObjectURL(photo); S.urls.push(x); zone.innerHTML = `<img src="${x}" alt="Meter photo">`; } catch (er) { toast(er.message); return; }
    if (typeof BPOCR === 'undefined' || !BPOCR.readNumber) return;
    const box = $('#sg-ocr', el); box.hidden = false; box.className = 'ocr-msg'; box.innerHTML = '<span class="busy"></span> Reading the meter…';
    let r = null; try { r = await BPOCR.readNumber(photo, u === 'mmol/L' ? [1, 35] : [20, 600]); } catch { r = null; }
    if (!sh.el.isConnected) return;
    if (r && !vbox.value) { vbox.value = r.v; vbox.classList.add('auto'); vbox.classList.toggle('unsure', !r.sure); live(); box.className = 'ocr-msg ' + (r.sure ? 'ok' : 'warn'); box.innerHTML = `<b>Read from photo: ${r.v} ${esc(u)}.</b> Check it matches the meter.`; }
    else if (!r) { box.className = 'ocr-msg warn'; box.innerHTML = 'Could not read the number from the photo. Please type it.'; vbox.focus(); }
    else box.hidden = true;
  };
  $('#sg-cam', el).onchange = onFile; $('#sg-gal', el).onchange = onFile;
  if ($('#sg-live-scan', el)) $('#sg-live-scan', el).onclick = async () => {
    const got = await liveScan({ mode: 'num', range: u === 'mmol/L' ? [1, 35] : [20, 600], unit: u }); if (!got) return;
    photo = got.blob; photoChanged = true; const x = URL.createObjectURL(photo); S.urls.push(x); zone.innerHTML = `<img src="${x}" alt="Meter photo">`;
    const box = $('#sg-ocr', el); box.hidden = false;
    if (got.res) { vbox.value = got.res.v; vbox.classList.add('auto'); vbox.classList.remove('unsure'); live(); box.className = 'ocr-msg ok'; box.innerHTML = `<b>${esc(T('Read from the screen: {v}.', { v: got.res.v + ' ' + u }))}</b> ${esc(tr('Check it matches the meter.'))}`; }
    else { box.className = 'ocr-msg warn'; box.innerHTML = esc(tr('Photo saved. Type the number below.')); vbox.focus(); }
  };
  if (!g) setTimeout(() => vbox.focus(), 60);
  $('[data-save]', el).onclick = async () => {
    const v = parseFloat(String(vbox.value).replace(',', '.')), err = $('#sg-err', el);
    const mg = fromUnit(v, u);
    const ts = $('#sg-when', el).value ? new Date($('#sg-when', el).value).getTime() : Date.now();
    if (!isFinite(v) || mg < 15 || mg > 700) { err.textContent = `Enter a sugar value between ${u === 'mmol/L' ? '1 and 38 mmol/L' : '15 and 700 mg/dL'}.`; err.hidden = false; return; }
    const id = g ? g.id : uid();
    const rec = { id, profileId: p.id, ts, mg: Math.round(mg * 10) / 10, unit: u, timing, note: $('#sg-note', el).value.trim(), hasPhoto: photoChanged ? !!photo : !!(g && g.hasPhoto), created: g ? g.created : Date.now() };
    if (photoChanged && photo) await DB.put('photos', photo, 'sg_' + id);
    await DB.put('sugar', rec);
    sh.close(); await loadReadings(); render(); toast('Sugar reading saved');
    if (!g) openSheet({ title: 'Sugar reading saved', body: `<div class="card"><div class="reading-big"><span class="v num">${toUnit(rec.mg, u)}</span><span class="u">${esc(u)}</span></div><div class="small muted" style="margin-top:6px">${esc(sgTimeLabel(timing))}</div>${sgGuideHTML(rec)}</div>`, foot: '<button class="btn primary" data-close>Done</button>' });
  };
  const del = $('[data-del]', el);
  if (del) del.onclick = async () => { if (!(await confirmSheet('Delete reading?', 'Delete this sugar reading?', 'Delete', true))) return; await DB.del('sugar', g.id); await DB.del('photos', 'sg_' + g.id); sh.close(); await loadReadings(); render(); toast('Deleted'); };
}
function allSugarSheet() {
  const p = cur(); if (!p) return; const u = p.sugarUnit || 'mg/dL';
  openSheet({ title: p.name + '’s blood sugar', full: true,
    body: S.sugar.length ? `<div class="hist">${S.sugar.slice(0, 300).map(g => { const k = sgCategory(g.mg, g.timing); return `<button class="hrow" style="--cat:${SG_HEX[k]};grid-template-columns:minmax(0,1fr) auto;padding-left:12px" data-sugar="${g.id}"><span style="min-width:0"><span class="hv num">${toUnit(g.mg, u)}</span> <span class="hm">${esc(u)}</span><br><span class="hm">${esc(sgTimeLabel(g.timing))} · ${esc(fmtDate(g.ts, { day: 'numeric', month: 'short' }))}, ${esc(fmtTime(g.ts))}${g.note ? ' · ' + esc(g.note) : ''}</span></span><span class="pill" style="--cat:var(--c-${SG_CATS[k].color})">${SG_CATS[k].label}</span></button>`; }).join('')}</div>` : '<p class="muted">No sugar readings yet.</p>',
    foot: '<button class="btn" data-close>Close</button><button class="btn primary" data-act="add-sugar">Add reading</button>' });
}
function sugarRemSheet() {
  const p = cur(); if (!p) return;
  const list = (p.sugarRem && p.sugarRem.length ? p.sugarRem : [{ t: '07:00', timing: 'fasting', on: false }, { t: '14:00', timing: 'after', on: false }, { t: '22:00', timing: 'bedtime', on: false }]).map(x => Object.assign({}, x));
  const body = `<p class="small muted" style="margin:0">Optional daily reminders to test sugar for ${esc(p.name)}. Turn on only the ones you need.</p>
    ${list.map((r, i) => `<div class="card" style="padding:12px"><div class="row"><select class="input" data-st="${i}" style="flex:1;min-width:0">${SG_TIMES.map(t => `<option value="${t.k}" ${t.k === r.timing ? 'selected' : ''}>${t.l}</option>`).join('')}</select><input class="input" type="time" data-sv="${i}" value="${esc(r.t)}" style="width:130px"><label class="switch" aria-label="Reminder on"><input type="checkbox" data-so="${i}" ${r.on ? 'checked' : ''}><span></span></label></div></div>`).join('')}
    <p class="small muted" style="margin:0">${NATIVE ? 'Your phone will remind you every day at these times.' : 'On iPhone, add them to your Calendar from Settings › Reminders.'}</p>`;
  const sh = openSheet({ title: 'Sugar test reminders', body, foot: '<button class="btn" data-close>Cancel</button><button class="btn primary" data-save>Save</button>' });
  $('[data-save]', sh.el).onclick = async () => {
    list.forEach((r, i) => { r.timing = $(`[data-st="${i}"]`, sh.el).value; r.t = $(`[data-sv="${i}"]`, sh.el).value || r.t; r.on = $(`[data-so="${i}"]`, sh.el).checked; });
    await DB.put('profiles', Object.assign({}, p, { sugarRem: list }));
    await loadProfiles(); await syncMedReminders();
    if (list.some(r => r.on) && NATIVE && NATIVE.notificationStatus() !== 'granted') NATIVE.requestNotifications();
    sh.close(); render(); toast('Sugar reminders saved');
  };
}

/* ---- walking steps */
const STEP_GOAL = 7000;
const fmtN = n => Math.round(n).toLocaleString('en-US');
function nativeStepsOn() { try { return !!(NATIVE && NATIVE.stepsStatus && NATIVE.stepsStatus() === 'on'); } catch { return false; } }
function stepsOwner() { return LS.get('bp.stepsOwner', null); }
async function stepsByDay(pid) {
  const days = new Map();
  const get = d => { if (!days.has(d)) days.set(d, { day: d, morning: 0, afternoon: 0, evening: 0, total: 0, auto: false, manual: false }); return days.get(d); };
  if (NATIVE && NATIVE.getSteps && stepsOwner() === pid) {
    let log = {}; try { log = JSON.parse(NATIVE.getSteps()); } catch { log = {}; }
    for (const [k, v] of Object.entries(log)) {
      const d = k.slice(0, 10), h = +k.slice(11, 13), e = get(d);
      e[h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'] += v; e.total += v; e.auto = true;
    }
  }
  for (const m of await DB.byProfile(pid, 'steps')) {
    const e = get(m.day); e.total = m.steps; e.manual = true;
    if (!e.auto) { e.morning = e.afternoon = e.evening = 0; }
  }
  return days;
}
function stepsBars(days, n) {
  const list = []; for (let i = n - 1; i >= 0; i--) { const d = dayKey(Date.now() - i * 864e5); list.push(days.get(d) || { day: d, total: 0 }); }
  const mx = Math.max(STEP_GOAL * 1.2, ...list.map(x => x.total));
  const W = 340, H = 110, B = 18, bw = (W - 8) / n;
  let g = '';
  const gy = H - B - (H - B - 6) * STEP_GOAL / mx;
  list.forEach((x, i) => {
    const h = (H - B - 6) * x.total / mx; const X = 4 + i * bw + bw * 0.18;
    g += `<rect x="${X.toFixed(1)}" y="${(H - B - h).toFixed(1)}" width="${(bw * 0.64).toFixed(1)}" height="${Math.max(0, h).toFixed(1)}" rx="3" fill="${x.total >= STEP_GOAL ? 'var(--c-normal)' : 'var(--accent)'}" opacity="${i === n - 1 ? 1 : 0.7}"/>`;
    g += `<text x="${(X + bw * 0.32).toFixed(1)}" y="${H - 4}" text-anchor="middle">${esc(new Date(x.day + 'T12:00').toLocaleDateString(loc('en-GB'), { weekday: 'narrow' }))}</text>`;
  });
  g += `<line x1="4" x2="${W - 4}" y1="${gy.toFixed(1)}" y2="${gy.toFixed(1)}" stroke="var(--muted)" stroke-dasharray="4 4"/><text x="${W - 4}" y="${(gy - 4).toFixed(1)}" text-anchor="end">${fmtN(STEP_GOAL)}</text>`;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Steps over the last ${n} days">${g}</svg>`;
}
function stepsCard(p) {
  const today = S.steps.get(dayKey(Date.now()));
  const auto = NATIVE && stepsOwner() === p.id && nativeStepsOn();
  const any = Array.from(S.steps.values()).some(x => x.total > 0);
  const t = today ? today.total : 0;
  const week = []; for (let i = 0; i < 7; i++) { const e = S.steps.get(dayKey(Date.now() - i * 864e5)); if (e && e.total) week.push(e.total); }
  return `<div class="card"><div class="row"><h2 style="margin:0">Walking</h2><span class="spacer"></span>${auto ? '' : '<button class="btn sm" data-act="add-steps">+ Steps</button>'}</div>
    <div class="row" style="margin-top:8px;align-items:baseline"><span class="num" style="font-size:2rem;font-weight:850;letter-spacing:-.02em">${fmtN(t)}</span><span class="muted">steps today</span><span class="spacer"></span>${week.length ? `<span class="small muted num">7-day avg ${fmtN(avg(week))}</span>` : ''}</div>
    ${today && today.auto ? `<div class="small muted num">Morning ${fmtN(today.morning)} \u00B7 Afternoon ${fmtN(today.afternoon)} \u00B7 Evening ${fmtN(today.evening)}</div>` : ''}
    ${any ? stepsBars(S.steps, 7) : ''}
    <p class="small muted" style="margin:6px 0 0"><span>${auto ? (IOS_APP ? 'From Apple Health, automatically.' : 'Counted automatically by this phone.') : NATIVE ? (stepsOwner() && stepsOwner() !== p.id && nativeStepsOn() ? 'Steps on this phone are counted for another person. Enter ' + esc(p.name) + '\u2019s steps by hand.' : '<button class="linkbtn" style="padding:0" data-act="steps-setup">Count steps automatically \u203A</button>') : 'Enter each day\u2019s steps from your phone\u2019s Health app.'}</span> <span>Aim for about ${fmtN(STEP_GOAL)} a day if your doctor agrees.</span></p></div>`;
}
function stepsSheet() {
  const p = cur(); if (!p) return;
  const d0 = dayKey(Date.now());
  const sh = openSheet({ title: 'Enter steps', body: `<div class="small muted">For ${esc(p.name)}</div>
    <div class="field"><label for="st-day">Day</label><input class="input" type="date" id="st-day" value="${d0}" max="${d0}"></div>
    <div class="field"><label for="st-n">Steps that day</label><input class="input bpin" id="st-n" type="number" inputmode="numeric" min="0" max="100000" placeholder="e.g. 6500"></div>
    <p class="small muted" style="margin:0">${IS_IOS ? 'On iPhone: open the Health app, tap Steps, and copy the day\u2019s total.' : 'Typing a number replaces the automatic count for that day.'}</p>
    <p class="err" id="st-err" hidden></p>`, foot: '<button class="btn" data-close>Cancel</button><button class="btn danger" data-clear hidden>Clear</button><button class="btn primary" data-save>Save</button>' });
  const el = sh.el;
  const load = async () => { const id = p.id + '|' + $('#st-day', el).value; const m = await DB.get('steps', id); const e = S.steps.get($('#st-day', el).value); $('#st-n', el).value = m ? m.steps : (e && e.total ? e.total : ''); $('[data-clear]', el).hidden = !m; };
  $('#st-day', el).onchange = load; load();
  $('[data-save]', el).onclick = async () => {
    const day = $('#st-day', el).value, n = Math.round(+$('#st-n', el).value);
    const err = $('#st-err', el);
    if (!day || day > d0) { err.textContent = 'Choose a day up to today.'; err.hidden = false; return; }
    if (!$('#st-n', el).value || n < 0 || n > 100000) { err.textContent = 'Enter a number of steps between 0 and 100,000.'; err.hidden = false; return; }
    await DB.put('steps', { id: p.id + '|' + day, profileId: p.id, day, steps: n, updated: Date.now() });
    sh.close(); await loadReadings(); render(); toast('Steps saved');
  };
  $('[data-clear]', el).onclick = async () => { await DB.del('steps', p.id + '|' + $('#st-day', el).value); sh.close(); await loadReadings(); render(); toast('Entry cleared'); };
}

/* ---- medicines + test reports: home cards */
/* ---- optional trackers: easy to switch on from the Today screen */
const TRACKERS = [{ k: 'trackSugar', l: 'Blood sugar', d: 'Sugar readings, test reminders, sugar page in the PDF' }, { k: 'trackThyroid', l: 'Thyroid', d: 'TSH / T4 / T3 results, thyroid medicine and test reminders' }, { k: 'dialysis', l: 'Dialysis', d: 'Dialysis session reminders and advice' }];
function trackersCard(p) {
  const off = TRACKERS.filter(t => !p[t.k]);
  if (!off.length) return '';
  return `<div class="card"><h2>More health trackers for ${esc(p.name)}</h2><div class="mlist" style="margin-top:0">${off.map(t => `<div class="mrow" style="cursor:default"><span style="min-width:0;flex:1"><b>${t.l}</b><br><span class="small muted">${t.d}</span></span><button class="btn sm primary" data-act="tracker-on" data-k="${t.k}">Turn on</button></div>`).join('')}</div><p class="small muted" style="margin:8px 0 0">You can turn these off again in Edit person.</p></div>`;
}

/* ---- appointments (everyone) and dialysis sessions */
const APPT_KINDS = [{ k: 'doctor', l: 'Doctor visit' }, { k: 'dialysis', l: 'Dialysis session' }, { k: 'test', l: 'Blood test' }, { k: 'scan', l: 'Scan / ECG / Echo' }, { k: 'chemo', l: 'Chemotherapy' }, { k: 'radio', l: 'Radiotherapy' }, { k: 'therapy', l: 'Therapy / injection / infusion' }, { k: 'hospital', l: 'Hospital' }, { k: 'other', l: 'Other' }];
const apptKindLabel = k => (APPT_KINDS.find(x => x.k === k) || APPT_KINDS[APPT_KINDS.length - 1]).l;
const REMIND_OPTS = [{ k: 1440, l: '1 day before' }, { k: 120, l: '2 hours before' }, { k: 60, l: '1 hour before' }, { k: 30, l: '30 min before' }, { k: 0, l: 'At the time' }];
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
/* the next time this appointment happens (weekly ones repeat) */
function apptNext(a, after) {
  const now = after || Date.now(), [hh, mm] = (a.time || '09:00').split(':').map(Number);
  if (a.days && a.days.length) {
    for (let i = 0; i < 8; i++) { const d = new Date(now + i * 864e5); d.setHours(hh, mm, 0, 0); if (a.days.includes(d.getDay()) && d.getTime() > now) return d.getTime(); }
    return null;
  }
  if (!a.date) return null;
  const t = new Date(a.date + 'T' + (a.time || '09:00')).getTime(); return t;
}
function apptWhen(a) {
  if (a.days && a.days.length) return T('Every {days} at {time}', { days: a.days.map(d => tr(WD[d])).join(', '), time: fmtTime(new Date('2000-01-01T' + (a.time || '09:00')).getTime()) });
  const t = apptNext(a); return t ? `${fmtDate(t, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}, ${fmtTime(t)}` : '';
}
function apptRow(a) {
  const t = apptNext(a), past = !(a.days && a.days.length) && t && t < Date.now();
  const days = t ? Math.floor((new Date(t).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 864e5) : null;
  const soon = days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : days > 1 && days < 8 ? 'In ' + days + ' days' : '';
  return `<button class="mrow" data-appt="${a.id}" style="${past ? 'opacity:.6' : ''}"><span class="mic">${a.kind === 'dialysis' ? DIAL_ICON : CAL_ICON}</span><span style="min-width:0;flex:1"><b>${esc(a.title || apptKindLabel(a.kind))}</b>${soon ? ` <span class="pill" style="--cat:var(--accent)">${soon}</span>` : ''}<br><span class="small muted">${esc(apptWhen(a))}${a.place ? ' · ' + esc(a.place) : ''}</span></span></button>`;
}
const CAL_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2.5" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M3.5 10h17M8 3v4M16 3v4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
const DIAL_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c3 4 5.5 7 5.5 10a5.5 5.5 0 0 1-11 0C6.5 10 9 7 12 3z" fill="none" stroke="currentColor" stroke-width="1.7"/><path d="M9.5 14a2.5 2.5 0 0 0 2.5 2.5" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
const DIAL_TIPS = ['Never measure blood pressure on the arm with your fistula or graft; use the other arm.', 'Record your blood pressure and weight before and after each session.', 'Keep to your fluid limit and avoid salty food between sessions; extra fluid raises blood pressure.', 'Ask your kidney team whether to take or skip blood pressure tablets on dialysis days.', 'Low blood pressure and dizziness are common after a session: get up slowly and tell the team if it happens often.', 'Limit high-potassium foods (bananas, dates, oranges, potatoes, tomatoes) and phosphate as your dietitian advises.'];
function upcomingAppts(list) {
  return list.map(a => ({ a, t: apptNext(a) })).filter(x => x.t && (x.a.days && x.a.days.length || x.t > Date.now() - 2 * 3600e3)).sort((x, y) => x.t - y.t).map(x => x.a);
}
function apptCard(p) {
  const up = upcomingAppts(S.appts || []);
  let h = `<div class="card"><div class="row"><h2 style="margin:0">Appointments</h2><span class="spacer"></span>${p.dialysis ? '<button class="btn sm" data-act="add-appt" data-kind="dialysis">+ Dialysis</button>' : ''}<button class="btn sm" data-act="add-appt">+ Add</button></div>`;
  h += up.length ? `<div class="mlist">${up.slice(0, 3).map(apptRow).join('')}</div>${(S.appts || []).length > 3 ? `<button class="linkbtn" data-act="all-appt">All appointments ›</button>` : ''}`
    : `<p class="small muted" style="margin:10px 0 0">No upcoming appointments. Add doctor visits, tests${p.dialysis ? ' and your dialysis days' : ''} to get a reminder before each one.</p>`;
  if (p.dialysis) h += `<details class="tipbox" style="margin-top:10px"><summary>Dialysis and blood pressure</summary><ul class="tips">${DIAL_TIPS.map(t => `<li>${esc(t)}</li>`).join('')}</ul></details>`;
  return h + '</div>';
}
function apptSheet(existing, kind0) {
  const p = cur(); if (!p) return; const a = existing || null;
  let kind = a ? a.kind : kind0 || 'doctor';
  const days = new Set(a && a.days ? a.days : kind === 'dialysis' ? [0, 2, 4] : []);
  let repeat = a ? !!(a.days && a.days.length) : kind === 'dialysis';
  const rem = new Set(a ? a.remind || [] : kind === 'dialysis' ? [120] : [1440, 120]);
  const tomorrow = dayKey(Date.now() + 864e5);
  const body = `<div class="small muted">For ${esc(p.name)}</div>
    <div class="field"><span class="lbl">Type</span><div class="tchips" id="ap-kind">${APPT_KINDS.map(k => `<button type="button" data-k="${k.k}" class="${k.k === kind ? 'on' : ''}">${k.l}</button>`).join('')}</div></div>
    <div class="field"><label for="ap-title">Title (optional)</label><input class="input" id="ap-title" maxlength="60" value="${esc(a && a.title || '')}" placeholder="e.g. Cardiology follow-up, Dr. Khalid"></div>
    <div class="field"><label for="ap-place">Place (optional)</label><input class="input" id="ap-place" maxlength="60" value="${esc(a && a.place || '')}" placeholder="e.g. Jarir Polyclinic"></div>
    <label class="check"><input type="checkbox" id="ap-rep" ${repeat ? 'checked' : ''}> Repeats every week (e.g. dialysis)</label>
    <div class="field" id="ap-days-f" ${repeat ? '' : 'hidden'}><span class="lbl">Days</span><div class="tchips" id="ap-days">${WD.map((d, i) => `<button type="button" data-d="${i}" class="${days.has(i) ? 'on' : ''}">${d}</button>`).join('')}</div></div>
    <div class="grid2"><div class="field" id="ap-date-f" ${repeat ? 'hidden' : ''}><label for="ap-date">Date</label><input class="input" type="date" id="ap-date" value="${esc(a && a.date || tomorrow)}"></div><div class="field"><label for="ap-time">Time</label><input class="input" type="time" id="ap-time" value="${esc(a && a.time || (kind === 'dialysis' ? '07:00' : '10:00'))}"></div></div>
    <div class="field"><span class="lbl">Remind me</span><div class="tchips" id="ap-rem">${REMIND_OPTS.map(o => `<button type="button" data-r="${o.k}" class="${rem.has(o.k) ? 'on' : ''}">${o.l}</button>`).join('')}</div></div>
    <div class="field"><label for="ap-note">Note (optional)</label><input class="input" id="ap-note" maxlength="100" value="${esc(a && a.note || '')}" placeholder="e.g. fasting, bring reports and BP log"></div>
    <p class="err" id="ap-err" hidden></p>${a ? '<button class="btn danger block" data-del>Delete appointment</button>' : ''}`;
  const sh = openSheet({ title: a ? 'Edit appointment' : 'New appointment', body, full: true, foot: '<button class="btn" data-close>Cancel</button><button class="btn primary" data-save>Save</button>' });
  const el = sh.el;
  const tog = (sel, set, key, num) => $$(sel + ' button', el).forEach(b => b.onclick = () => { const v = num ? +b.dataset[key] : b.dataset[key]; set.has(v) ? set.delete(v) : set.add(v); b.classList.toggle('on', set.has(v)); });
  tog('#ap-days', days, 'd', true); tog('#ap-rem', rem, 'r', true);
  $$('#ap-kind button', el).forEach(b => b.onclick = () => { kind = b.dataset.k; $$('#ap-kind button', el).forEach(x => x.classList.toggle('on', x === b)); if (kind === 'dialysis' && !a) { $('#ap-rep', el).checked = true; $('#ap-rep', el).onchange(); } });
  $('#ap-rep', el).onchange = () => { repeat = $('#ap-rep', el).checked; $('#ap-days-f', el).hidden = !repeat; $('#ap-date-f', el).hidden = repeat; };
  $('[data-save]', el).onclick = async () => {
    const err = $('#ap-err', el), time = $('#ap-time', el).value || '09:00';
    if (repeat && !days.size) { err.textContent = 'Choose the days it repeats.'; err.hidden = false; return; }
    if (!repeat && !$('#ap-date', el).value) { err.textContent = 'Choose the date.'; err.hidden = false; return; }
    const rec = { id: a ? a.id : uid(), profileId: p.id, kind, title: $('#ap-title', el).value.trim(), place: $('#ap-place', el).value.trim(), time, note: $('#ap-note', el).value.trim(),
      days: repeat ? [...days].sort() : null, date: repeat ? null : $('#ap-date', el).value, remind: [...rem].sort((x, y) => y - x), created: a ? a.created : Date.now() };
    await DB.put('appts', rec); await syncMedReminders();
    if (rec.remind.length && NATIVE && NATIVE.notificationStatus() !== 'granted') NATIVE.requestNotifications();
    sh.close(); await loadReadings(); render(); toast('Appointment saved');
  };
  const del = $('[data-del]', el); if (del) del.onclick = async () => { await DB.del('appts', a.id); await syncMedReminders(); sh.close(); await loadReadings(); render(); toast('Appointment deleted'); };
}
function allApptSheet() {
  const p = cur(); if (!p) return;
  const up = upcomingAppts(S.appts), past = S.appts.filter(a => !up.includes(a)).sort((x, y) => (y.date || '').localeCompare(x.date || ''));
  openSheet({ title: p.name + '’s appointments', full: true, body: `<div class="sec-title">Upcoming</div><div class="mlist">${up.map(apptRow).join('') || '<p class="small muted">None</p>'}</div><div class="sec-title">Past</div><div class="mlist">${past.map(apptRow).join('') || '<p class="small muted">None</p>'}</div>`, foot: '<button class="btn" data-close>Close</button><button class="btn primary" data-act="add-appt">Add appointment</button>' });
}
/* reminders for every person's appointments: one-time ones get a date, weekly ones get weekdays */
async function apptReminderList() {
  const people = Object.fromEntries((await DB.all('profiles')).map(p => [p.id, p.name])), out = [];
  for (const a of await DB.all('appts')) {
    if (!people[a.profileId]) continue;
    const name = a.title || tr(apptKindLabel(a.kind)), [hh, mm] = (a.time || '09:00').split(':').map(Number);
    for (const off of a.remind || []) {
      const title = off === 0 ? T('{name} now', { name }) : off >= 1440 ? T('{name} tomorrow', { name }) : off === 60 ? T('{name} in 1 hour', { name }) : off > 60 ? T('{name} in {n} hours', { name, n: off / 60 }) : T('{name} in {n} minutes', { name, n: off });
      const tm = fmtTime(new Date(2000, 0, 1, hh, mm).getTime());
      const text = (a.place ? T('{who} · {time} at {place}', { who: people[a.profileId], time: tm, place: a.place }) : `${people[a.profileId]} · ${tm}`) + (a.note ? '. ' + a.note : '');
      const base = new Date(2000, 0, 2, hh, mm).getTime() - off * 60000, b = new Date(base);
      const t = pad(b.getHours()) + ':' + pad(b.getMinutes()), shift = Math.floor((base - new Date(2000, 0, 2).getTime()) / 864e5);   // 0 = same day, -1 = day before
      if (a.days && a.days.length) out.push({ t, days: a.days.map(d => (d + shift + 7) % 7), title, text, who: people[a.profileId], med: name + ' (' + a.days.map(d => tr(WD[d])).join('/') + ')' });
      else if (a.date) {
        const when = new Date(a.date + 'T' + (a.time || '09:00')).getTime() - off * 60000;
        if (when > Date.now()) out.push({ t: pad(new Date(when).getHours()) + ':' + pad(new Date(when).getMinutes()), date: dayKey(when), title, text, who: people[a.profileId], med: name + ' (' + a.date + ')' });
      }
    }
  }
  return out;
}

/* ---- thyroid (optional per person) */
const THY_MED = /levothyrox|thyroxin|eltroxin|euthyrox|synthroid|levoxyl|tirosint|liothyronine|cytomel|carbimazole|methimazole|tapazole|propylthiouracil|\bptu\b|neo-?mercazole/i;
const THY_TIP_HTML = '<div class="guide-box" style="--cat:var(--accent);margin:0"><h3>Taking thyroid tablets</h3><ul><li>Take it at the same time every day, on an empty stomach with a glass of water, 30\u201360 minutes before breakfast (or at bedtime, 3\u20134 hours after dinner, if your doctor agrees).</li><li>Keep 4 hours between it and calcium, iron, antacids, multivitamins and soy.</li><li>Coffee and milk soon after can reduce how much is absorbed; wait 30\u201360 minutes.</li><li>Do not stop or change the dose yourself. Have a TSH blood test 6\u20138 weeks after any dose change.</li><li>Too much thyroid medicine can raise pulse and blood pressure; tell your doctor about palpitations.</li></ul></div>';
const THY_PRESET = { name: 'Levothyroxine', dose: '', times: ['morning'], remind: true, remTimes: { morning: '06:30', afternoon: '14:00', evening: '20:00', bedtime: '22:00' }, notes: 'Empty stomach, 30\u201360 min before breakfast' };
const THY_KEYS = [{ k: 'tsh', l: 'TSH', u: ['mIU/L'] }, { k: 'ft4', l: 'Free T4', u: ['ng/dL', 'pmol/L'] }, { k: 'ft3', l: 'Free T3', u: ['pg/mL', 'pmol/L'] }];
/* thyroid results over time: typed-in entries plus values read from uploaded reports */
async function thyPoints(pid) {
  const pts = [];
  for (const t of await DB.byProfile(pid, 'thyroid')) pts.push(Object.assign({ src: 'manual' }, t));
  for (const d of await DB.byProfile(pid, 'docs')) {
    const r = {}; for (const x of d.results || []) if (['tsh', 'ft4', 'ft3'].includes(x.key)) r[x.key] = { value: x.value, unit: x.unit, flag: x.flag };
    if (Object.keys(r).length) pts.push(Object.assign({ id: 'doc_' + d.id, date: d.date || dayKey(d.created), src: 'report', title: d.title }, r));
  }
  return pts.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
}
function thyRate(key, value, unit) { const r = BPLab.reRate({ key, value: +value, unit, name: '' }); return { flag: r.flag || 'normal', label: r.label || '' }; }
function thyroidCard(p) {
  const pts = S.thy || [], last = pts[0];
  const meds = S.meds.filter(m => m.active && THY_MED.test(m.name));
  const nx = p.thyNext && p.thyNext.date;
  let h = `<div class="card"><div class="row"><h2 style="margin:0">Thyroid</h2><span class="spacer"></span><button class="btn sm" data-act="thy-next">Next test</button><button class="btn sm" data-act="add-thy">+ Result</button></div>`;
  if (last) {
    const cells = THY_KEYS.filter(k => last[k.k]).map(k => { const x = last[k.k], fl = x.flag || thyRate(k.k, x.value, x.unit).flag; return `<div class="thy-cell" style="--cat:var(${flagVar(fl)})"><span class="small muted">${k.l}</span><b class="num">${esc(x.value)}</b><span class="small muted">${esc(x.unit)}</span></div>`; }).join('');
    h += `<div class="thy-row">${cells}</div><div class="small muted">${esc(fmtDate(new Date(last.date + 'T12:00').getTime(), { day: 'numeric', month: 'short', year: 'numeric' }))}${last.src === 'report' ? ' \u00B7 from ' + esc(last.title || 'report') : ''}${pts.length > 1 ? ` \u00B7 <button class="linkbtn" style="padding:0" data-act="all-thy">${pts.length} results \u203A</button>` : ''}</div>`;
  } else h += '<p class="small muted" style="margin:10px 0 0">Add your TSH, Free T4 and Free T3 results, or upload the lab report and they are read automatically.</p>';
  h += `<div class="row" style="margin-top:10px;gap:8px">${meds.length ? meds.map(m => `<button class="chip" data-med="${m.id}" style="padding:6px 12px">${PILL_ICON.replace('<svg', '<svg style="width:18px;height:18px"')} ${esc(m.name)}${m.dose ? ' ' + esc(m.dose) : ''}${m.remind ? ' \u00B7 ' + esc(((m.remTimes || {})[m.times && m.times[0]] || '')) : ''}</button>`).join('') : '<button class="btn sm" data-act="add-thy-med">+ Thyroid medicine</button>'}</div>`;
  if (nx) { const days = Math.round((new Date(nx + 'T09:00') - Date.now()) / 864e5); h += `<p class="small" style="margin:8px 0 0;font-weight:650;color:var(${days < 0 ? '--c-stage1' : '--muted'})">${days < 0 ? T(days === -1 ? 'Blood test was due {n} day ago' : 'Blood test was due {n} days ago', { n: -days }) : days === 0 ? tr('Blood test due today') : T(days === 1 ? 'Next blood test in {n} day' : 'Next blood test in {n} days', { n: days })} (${esc(fmtDate(new Date(nx + 'T12:00').getTime(), { day: 'numeric', month: 'short' }))})</p>`; }
  return h + '</div>';
}
function thySheet(existing) {
  const p = cur(); if (!p) return; const t = existing || null;
  const body = `<div class="small muted">For ${esc(p.name)}. Fill in the results you have.</div>
    <div class="field"><label for="ty-date">Test date</label><input class="input" type="date" id="ty-date" value="${esc(t ? t.date : dayKey(Date.now()))}" max="${dayKey(Date.now())}"></div>
    ${THY_KEYS.map(k => `<div class="field"><label for="ty-${k.k}">${k.l}</label><div class="row"><input class="input num" id="ty-${k.k}" inputmode="decimal" style="flex:1;min-width:0" value="${esc(t && t[k.k] ? t[k.k].value : '')}" placeholder="${k.k === 'tsh' ? 'e.g. 2.1' : ''}"><select class="input" id="ty-${k.k}-u" style="width:120px">${k.u.map(u => `<option ${t && t[k.k] && t[k.k].unit === u ? 'selected' : ''}>${u}</option>`).join('')}</select></div></div>`).join('')}
    <div id="ty-live"></div>
    <div class="field"><label for="ty-note">Note (optional)</label><input class="input" id="ty-note" maxlength="80" value="${esc(t && t.note || '')}" placeholder="e.g. dose changed to 75 mcg"></div>
    <p class="err" id="ty-err" hidden></p>${t ? '<button class="btn danger block" data-del>Delete this result</button>' : ''}`;
  const sh = openSheet({ title: t ? 'Edit thyroid result' : 'Thyroid result', body, full: true, foot: '<button class="btn" data-close>Cancel</button><button class="btn primary" data-save>Save</button>' });
  const el = sh.el;
  const vals = () => { const o = {}; for (const k of THY_KEYS) { const v = parseFloat(String($('#ty-' + k.k, el).value).replace(',', '.')); if (isFinite(v) && v > 0) { const u = $('#ty-' + k.k + '-u', el).value, r = thyRate(k.k, v, u); o[k.k] = { value: v, unit: u, flag: r.flag, label: r.label }; } } return o; };
  const live = () => { const o = vals(); const rs = Object.entries(o).map(([key, x]) => ({ key, name: THY_KEYS.find(k => k.k === key).l, value: x.value, unit: x.unit })); $('#ty-live', el).innerHTML = rs.length ? precautionsHTML(rs) : ''; };
  $$('input, select', el).forEach(i => i.addEventListener('input', live)); live();
  $('[data-save]', el).onclick = async () => {
    const o = vals(); if (!Object.keys(o).length) { const e = $('#ty-err', el); e.textContent = 'Enter at least one result.'; e.hidden = false; return; }
    await DB.put('thyroid', Object.assign({ id: t ? t.id : uid(), profileId: p.id, date: $('#ty-date', el).value || dayKey(Date.now()), note: $('#ty-note', el).value.trim(), created: t ? t.created : Date.now() }, o));
    sh.close(); await loadReadings(); render(); toast('Thyroid result saved');
  };
  const del = $('[data-del]', el); if (del) del.onclick = async () => { await DB.del('thyroid', t.id); sh.close(); await loadReadings(); render(); toast('Deleted'); };
}
function allThySheet() {
  const p = cur(); if (!p) return;
  openSheet({ title: p.name + '\u2019s thyroid results', full: true,
    body: `<div class="card tbl-wrap"><table class="ranges"><thead><tr><th>Date</th>${THY_KEYS.map(k => `<th>${k.l}</th>`).join('')}</tr></thead><tbody>${(S.thy || []).map(t => `<tr ${t.src === 'manual' ? `data-thy="${t.id}" style="cursor:pointer"` : ''}><td class="small">${esc(fmtDate(new Date(t.date + 'T12:00').getTime(), { day: 'numeric', month: 'short', year: '2-digit' }))}${t.src === 'report' ? '<br><span class="muted">report</span>' : ''}</td>${THY_KEYS.map(k => t[k.k] ? `<td class="num"><b style="color:var(${flagVar(t[k.k].flag || thyRate(k.k, t[k.k].value, t[k.k].unit).flag)})">${esc(t[k.k].value)}</b> <span class="small muted">${esc(t[k.k].unit)}</span></td>` : '<td class="muted">\u2013</td>').join('')}</tr>`).join('')}</tbody></table></div><p class="small muted">Usual adult ranges: TSH 0.4\u20134.5 mIU/L, Free T4 0.8\u20131.8 ng/dL (10\u201323 pmol/L), Free T3 2.3\u20134.2 pg/mL. Your doctor may set a different TSH target.</p>`,
    foot: '<button class="btn" data-close>Close</button><button class="btn primary" data-act="add-thy">Add result</button>' });
}
function thyNextSheet() {
  const p = cur(); if (!p) return; const n = p.thyNext || {};
  const sug = dayKey(Date.now() + 42 * 864e5);
  const sh = openSheet({ title: 'Next thyroid blood test', body: `<p class="small muted" style="margin:0">Usually 6\u20138 weeks after a dose change, then every 6\u201312 months when stable.</p>
    <div class="field"><label for="tn-date">Test date</label><input class="input" type="date" id="tn-date" value="${esc(n.date || sug)}"></div>
    <div class="tchips"><button type="button" data-w="6">In 6 weeks</button><button type="button" data-w="12">In 3 months</button><button type="button" data-w="26">In 6 months</button><button type="button" data-w="52">In 1 year</button></div>
    <label class="check"><input type="checkbox" id="tn-rem" ${n.remind !== false ? 'checked' : ''}> Remind me on the day (9:00 AM)</label>`,
    foot: `${n.date ? '<button class="btn danger" data-clear>Clear</button>' : ''}<button class="btn" data-close>Cancel</button><button class="btn primary" data-save>Save</button>` });
  $$('[data-w]', sh.el).forEach(b => b.onclick = () => { $('#tn-date', sh.el).value = dayKey(Date.now() + (+b.dataset.w) * 7 * 864e5); });
  const save = async (val) => { await DB.put('profiles', Object.assign({}, p, { thyNext: val })); await loadProfiles(); await syncMedReminders(); sh.close(); render(); };
  $('[data-save]', sh.el).onclick = async () => { await save({ date: $('#tn-date', sh.el).value, remind: $('#tn-rem', sh.el).checked }); toast('Next test saved'); if ($('#tn-rem', sh.el) && NATIVE && NATIVE.notificationStatus() !== 'granted') NATIVE.requestNotifications(); };
  const c = $('[data-clear]', sh.el); if (c) c.onclick = async () => { await save(null); toast('Cleared'); };
}

const MED_DEFAULT_T = { morning: '08:00', afternoon: '14:00', evening: '20:00', bedtime: '22:00' };
async function medReminderList() {
  const people = Object.fromEntries((await DB.all('profiles')).map(p => [p.id, p.name]));
  const list = [];
  for (const m of await DB.all('meds')) {
    if (!m.active || !m.remind || !people[m.profileId]) continue;
    for (const k of m.times || []) list.push({ t: (m.remTimes && m.remTimes[k]) || MED_DEFAULT_T[k], ...(medDays(m) ? { days: medDays(m).slice() } : {}), title: T('Time for {med}', { med: m.name + (m.dose ? ' ' + m.dose : '') }), text: `${people[m.profileId]} \u00B7 ` + T('{time} dose', { time: tr((MED_TIMES.find(x => x.k === k) || {}).l || '') }) + (m.notes ? '. ' + m.notes : ''), who: people[m.profileId], med: m.name + (medDays(m) ? ' (' + medDays(m).map(d => tr(WD[d])).join('/') + ')' : ''), kind: 'med', pid: m.profileId, medId: m.id, k });
  }
  for (const p of await DB.all('profiles')) if (p.trackThyroid && p.thyNext && p.thyNext.date && p.thyNext.remind !== false && p.thyNext.date >= dayKey(Date.now()))
    list.unshift({ t: '09:00', date: p.thyNext.date, title: tr('Thyroid blood test today'), text: `${p.name} \u00B7 ` + tr('TSH / Free T4 test. Take your thyroid tablet after the blood test unless your doctor said otherwise.'), who: p.name, med: 'Thyroid blood test (' + p.thyNext.date + ')' });
  list.unshift(...await apptReminderList());
  for (const p of await DB.all('profiles')) if (p.trackSugar) for (const r of p.sugarRem || []) if (r.on) list.push({ t: r.t, title: tr('Time to check blood sugar'), text: `${p.name} \u00B7 ` + T('{time} test', { time: tr(sgTimeLabel(r.timing)) }), who: p.name, med: 'Sugar test (' + sgTimeLabel(r.timing) + ')' });
  return list.slice(0, 56);
}
async function syncMedReminders() { if (NATIVE && NATIVE.setMedReminders) { try { NATIVE.setMedReminders(JSON.stringify(await medReminderList())); } catch { /* ignore */ } } }
const MED_TIMES = [{ k: 'morning', l: 'Morning' }, { k: 'afternoon', l: 'Afternoon' }, { k: 'evening', l: 'Evening' }, { k: 'bedtime', l: 'Bedtime' }];
const wdLong = d => new Date(2024, 0, 7 + d).toLocaleDateString(loc('en-GB'), { weekday: 'long' });   // 7 Jan 2024 was a Sunday
/* a weekly medicine (e.g. once a week on Friday) is due only on its days */
const medDays = m => m.weekly && m.days && m.days.length ? m.days : null;
const medDueToday = m => !medDays(m) || medDays(m).includes(new Date().getDay());
const medDaysText = m => medDays(m) ? T('Every {day}', { day: medDays(m).map(wdLong).join(', ') }) : '';
const medTimesText = m => [medDaysText(m), (m.times || []).map(t => (MED_TIMES.find(x => x.k === t) || {}).l).filter(Boolean).join(', ')].filter(Boolean).join(' \u00B7 ');
const PILL_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="8.5" width="17" height="7" rx="3.5" transform="rotate(-35 12 12)" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M9.7 8.8l4.6 6.4" stroke="currentColor" stroke-width="1.8"/></svg>';
const DOC_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h8l4 4v14H6z M14 3v4h4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M9 12.5h6M9 16h6" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
function medsCard(p) {
  const act = S.meds.filter(m => m.active), stopped = S.meds.length - act.length;
  return `<div class="card"><div class="row"><h2 style="margin:0">Medicines</h2><span class="spacer"></span><button class="btn sm" data-act="add-med">+ Add</button></div>
    ${act.length ? `<div class="mlist">${act.map(m => `<div><button class="mrow" data-med="${m.id}"><span class="mic">${PILL_ICON}</span><span style="min-width:0;flex:1"><b>${esc(m.name)}</b>${m.dose ? ` <span class="muted">${esc(m.dose)}</span>` : ''}<br><span class="small muted">${esc(medTimesText(m) || 'Time not set')}${m.notes ? ' \u00B7 ' + esc(m.notes) : ''}</span></span></button>${doseChips(m)}</div>`).join('')}</div>`
      : `<p class="small muted" style="margin:10px 0 0">No medicines added. Add the tablets ${esc(p.name)} takes so they show on the doctor report.</p>`}
    ${stopped ? `<button class="linkbtn" data-act="all-meds">${stopped} stopped medicine${stopped > 1 ? 's' : ''} \u203A</button>` : ''}</div>`;
}
function docsCard(p) {
  const top = S.docs.slice(0, 3);
  return `<div class="card"><div class="row"><h2 style="margin:0">Test reports</h2><span class="spacer"></span><button class="btn sm" data-act="add-doc">+ Upload</button></div>
    ${top.length ? `<div class="mlist">${top.map(docRow).join('')}</div>${S.docs.length > 3 ? `<button class="linkbtn" data-act="all-docs">See all ${S.docs.length} reports \u203A</button>` : ''}`
      : `<p class="small muted" style="margin:10px 0 0">Upload lab results, ECG or prescriptions as a photo or PDF. They stay with ${esc(p.name)}\u2019s record.</p>`}</div>`;
}
function docRow(d) {
  return `<button class="mrow" data-doc="${d.id}">${d.isImage ? `<img class="dthumb" data-docthumb="${d.id}" alt="">` : `<span class="mic doc">${DOC_ICON}<i>PDF</i></span>`}<span style="min-width:0;flex:1"><b>${esc(d.title)}</b><br><span class="small muted">${esc(d.date ? fmtDate(new Date(d.date + 'T12:00').getTime(), { day: 'numeric', month: 'short', year: 'numeric' }) : '')}${d.notes ? ' \u00B7 ' + esc(d.notes) : ''}</span>${(d.results && d.results.length) || (d.findings && d.findings.length) ? (() => { const n = (d.results || []).filter(r => r.flag !== 'normal').length + (d.findings || []).filter(f => /high|borderline/.test(f.flag)).length; const ecgOk = (d.findings || []).some(f => f.key === 'normal'); return `<br><span class="small" style="font-weight:650;color:var(${n ? '--c-stage1' : '--c-normal'})">${n ? n + ' finding' + (n > 1 ? 's' : '') + ' to review' : ecgOk ? 'Normal range ECG' : 'Values in the usual range'}</span>`; })() : ''}</span></button>`;
}
async function fillDocThumbs(root) {
  for (const img of $$('img[data-docthumb]', root)) { const b = await DB.get('docfiles', img.dataset.docthumb); if (b) { const u = URL.createObjectURL(b); S.urls.push(u); img.src = u; } }
}

function chartSVG(rs) {
  const pts = rs.slice().sort((a, b) => a.ts - b.ts);
  if (pts.length < 2) return '<p class="muted small">Add more readings to see a trend.</p>';
  const W = 340, H = 170, L = 30, R = 8, T = 8, B = 22;
  const t0 = pts[0].ts, t1 = pts[pts.length - 1].ts || t0 + 1;
  const lo = Math.min(50, ...pts.map(p => p.dia)) - 5, hi = Math.max(160, ...pts.map(p => p.sys)) + 5;
  const x = t => L + (W - L - R) * ((t - t0) / Math.max(1, t1 - t0));
  const y = v => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
  let g = '';
  const ticks = []; for (let v = Math.ceil(lo / 20) * 20; v <= hi; v += 20) ticks.push(v);
  ticks.forEach(v => { g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" stroke-width="1"/><text x="${L - 5}" y="${y(v) + 3}" text-anchor="end">${v}</text>`; });
  [120, 80].forEach(v => { g += `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" stroke="var(--muted)" stroke-dasharray="4 4" stroke-width="1"/>`; });
  const line = (k, col) => {
    const d = pts.map((p, i) => (i ? 'L' : 'M') + x(p.ts).toFixed(1) + ' ' + y(p[k]).toFixed(1)).join(' ');
    return `<path d="${d}" fill="none" stroke="${col}" stroke-width="2" stroke-linejoin="round"/>` + pts.map((p, i) => `<circle cx="${x(p.ts).toFixed(1)}" cy="${y(p[k]).toFixed(1)}" r="${i === pts.length - 1 ? 4 : 2.5}" fill="${col}"/>`).join('');
  };
  g += line('sys', 'var(--c-stage2)') + line('dia', 'var(--c-low)');
  g += `<text x="${L}" y="${H - 6}">${esc(fmtDate(t0, { day: 'numeric', month: 'short' }))}</text><text x="${W - R}" y="${H - 6}" text-anchor="end">${esc(fmtDate(t1, { day: 'numeric', month: 'short' }))}</text>`;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Blood pressure trend">${g}</svg>`;
}

async function renderHistory() {
  const v = $('#view-history');
  const p = cur();
  if (!p) { v.innerHTML = emptyWelcome(); return; }
  if (!S.readings.length) { v.innerHTML = `<div class="card empty-state"><h2>No readings for ${esc(p.name)}</h2><p class="muted">Readings you add will be listed here by date.</p><button class="btn primary" data-act="add-reading">Add reading</button></div>`; return; }
  const all = S.readings;
  const s7 = all.filter(r => r.ts > Date.now() - 7 * 864e5);
  const a = arr => arr.length ? Math.round(avg(arr.map(r => r.sys))) + '/' + Math.round(avg(arr.map(r => r.dia))) : '–';
  let html = `<div class="card"><div class="row"><div><div class="small muted">7-day average</div><div class="num" style="font-size:1.5rem;font-weight:800">${a(s7)} <span class="small muted">mmHg</span></div></div><span class="spacer"></span><div style="text-align:right"><div class="small muted">Readings</div><div class="num" style="font-size:1.5rem;font-weight:800">${all.length}</div></div></div>
    <div class="btn-row" style="margin-top:12px"><button class="btn" data-act="report">PDF report</button><button class="btn primary" data-act="add-reading">Add reading</button></div></div>`;
  let lastDay = '';
  const show = all.slice(0, 300);
  html += '<div class="hist">';
  for (const r of show) {
    const dk = dayKey(r.ts);
    if (dk !== lastDay) { html += `<div class="day-h">${esc(fmtDate(r.ts, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}</div>`; lastDay = dk; }
    const c = bpCategory(r.sys, r.dia);
    html += `<button class="hrow" style="--cat:var(--c-${c})" data-reading="${r.id}">
      ${r.hasPhoto ? `<img class="thumb" data-photo="${r.id}" alt="">` : `<span class="thumb"><svg viewBox="0 0 24 24"><path d="M4 8.5h3l1.6-2.5h6.8L17 8.5h3V19H4z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><circle cx="12" cy="13.3" r="3.3" fill="none" stroke="currentColor" stroke-width="1.6"/></svg></span>`}
      <span style="min-width:0"><span class="hv num">${r.sys}/${r.dia}</span> <span class="hm num">${r.pulse ? '· ' + r.pulse + ' bpm' : ''}</span><br><span class="hm">${slotLabel(r.slot)} · ${esc(fmtTime(r.ts))}${whereTxt(r)}${r.note ? ' · ' + esc(r.note) : ''}</span></span>
      <span class="pill" style="--cat:var(--c-${c})">${CATS[c].label}</span></button>`;
  }
  html += '</div>';
  if (all.length > show.length) html += `<p class="small muted">Showing the latest ${show.length} readings. All readings are included in PDF reports.</p>`;
  v.innerHTML = html;
  for (const img of $$('img[data-photo]', v)) { photoURL(img.dataset.photo).then(u => { if (u) img.src = u; }); }
}

async function renderFamily() {
  const v = $('#view-family');
  const counts = {};
  for (const p of S.profiles) counts[p.id] = (await DB.byProfile(p.id)).length;
  v.innerHTML = `<div class="card"><div class="row"><h2 style="margin:0">Family members</h2><span class="spacer"></span><span class="small muted num">${S.profiles.length} of ${MAX_PEOPLE}</span></div>
    <div class="fam" style="margin-top:12px">${S.profiles.map(p => `<div class="frow"><div class="big-av" style="width:42px;height:42px;border-radius:12px;background:var(--accent-soft);color:var(--accent);display:grid;place-items:center;font-weight:800">${avatar(p)}</div><div style="flex:1;min-width:0"><div style="font-weight:700;overflow-wrap:anywhere">${esc(p.name)}</div><div class="small muted num">${[p.age && p.age + ' yrs', p.height && p.height + ' cm', p.weight && p.weight + ' kg'].filter(Boolean).join(' · ') || 'No details yet'} · ${counts[p.id]} readings</div></div><button class="btn sm" data-act="edit-person" data-id="${p.id}">Edit</button></div>`).join('') || '<p class="muted">No one added yet.</p>'}</div>
    ${S.profiles.length < MAX_PEOPLE ? '<button class="btn primary block" style="margin-top:14px" data-act="add-person">Add person</button>' : `<p class="small muted" style="margin-top:12px">You have reached the limit of ${MAX_PEOPLE} people.</p>`}</div>
    <p class="small muted">Tip: update weight whenever it changes so reports show the current BMI.</p>
    <p class="copyright">${COPYRIGHT}</p>`;
}

function getRemindersLocal() {
  const def = [{ t: '08:00', on: true }, { t: '14:00', on: true }, { t: '21:00', on: true }];
  if (NATIVE) { try { const j = JSON.parse(NATIVE.getReminders()); if (Array.isArray(j) && j.length === 3) return j; } catch { /* fall through */ } }
  return LS.get('bp.reminders', def);
}

function stepsSettingsHTML() {
  if (!NATIVE || !NATIVE.stepsStatus) return `<div class="card"><h2>Walking steps</h2><p class="small muted" style="margin:0">${IS_IOS ? 'Apple does not let home-screen web apps read steps or Apple Health, so steps are entered by hand from the Health app. Use \u201C+ Steps\u201D on the Today screen.' : 'Enter steps by hand with \u201C+ Steps\u201D on the Today screen.'}</p></div>`;
  const st = NATIVE.stepsStatus(), owner = stepsOwner();
  if (st === 'nosensor') return '<div class="card"><h2>Walking steps</h2><p class="small muted" style="margin:0">This phone has no step counter. Enter steps by hand with \u201C+ Steps\u201D on the Today screen.</p></div>';
  return `<div class="card"><h2>Walking steps</h2>
    <p class="small muted" style="margin-top:0">${IOS_APP ? 'Steps come automatically from Apple Health for the person who owns this iPhone. Allow Family Health Tracker to read Steps when asked.' : 'This phone can count steps automatically for the person who carries it. Steps are saved every half hour, even when the app is closed.'}</p>
    <div class="field"><label for="st-owner">Count this phone\u2019s steps for</label><select class="input" id="st-owner"><option value="">Nobody (off)</option>${S.profiles.map(p => `<option value="${p.id}" ${owner === p.id && st === 'on' ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div>
    <p class="small" style="margin:10px 0 0;font-weight:650;color:${st === 'on' ? 'var(--c-normal)' : 'var(--muted)'}">${st === 'on' ? (IOS_APP ? 'Reading steps from Apple Health. If none appear, open the Health app \u203A Sharing \u203A Apps \u203A Family Health Tracker and turn on Steps.' : 'Step counting is on.') : st === 'denied' && owner ? 'Allow \u201CPhysical activity\u201D when asked so steps can be counted.' : 'Step counting is off.'}</p></div>`;
}

async function renderSettings() {
  const v = $('#view-settings');
  const medRem = await medReminderList();
  const rem = getRemindersLocal();
  let notif = '';
  if (NATIVE) {
    const st = NATIVE.notificationStatus();
    notif = st === 'granted'
      ? '<p class="small" style="color:var(--c-normal);font-weight:650;margin:0">Notifications are allowed.</p>'
      : '<div class="row"><p class="small err" style="margin:0;flex:1">Notifications are turned off for Family Health Tracker.</p><button class="btn sm" data-act="allow-notif">Allow</button></div>';
  }
  v.innerHTML = `
  <div class="card"><h2>Blood pressure reminders</h2>
    <p class="small muted" style="margin-top:0">${NATIVE ? 'Your phone will remind you at these times every day.' : 'iPhone web apps cannot send their own scheduled alerts, so reminders are added to your Calendar as daily alarms.'}</p>
    <div style="display:flex;flex-direction:column;gap:10px">
    ${SLOTS.map((s, i) => `<div class="row"><span style="width:88px;flex:none;font-weight:650">${s.l}</span><input class="input" type="time" id="rem-t-${i}" value="${esc(rem[i].t)}" style="flex:1;min-width:150px;max-width:200px"><span class="spacer"></span><label class="switch" aria-label="${s.l} reminder on"><input type="checkbox" id="rem-on-${i}" ${rem[i].on ? 'checked' : ''}><span></span></label></div>`).join('')}
    </div>
    <div style="display:flex;flex-direction:column;gap:10px;margin-top:14px">${notif}
    ${NATIVE ? '<div class="btn-row"><button class="btn" data-act="test-notif">Test</button><button class="btn primary" data-act="save-rem">Save reminders</button></div>' : '<button class="btn primary block" data-act="ics">Add reminders to Calendar</button><p class="small muted" style="margin:0">Opens your Calendar with three daily alarms. If nothing opens, open this app’s link in Safari and tap the button there.</p>'}
    </div>
  </div>
  ${privacyCardHTML()}
  <div class="card"><h2>Medicine reminders</h2>${medRem.length ? `<div class="mlist" style="margin-top:0">${medRem.map(m => `<div class="mrow" style="cursor:default"><span class="mic">${PILL_ICON}</span><span style="min-width:0;flex:1"><b>${esc(m.t)}</b> ${esc(m.med)}<br><span class="small muted">${esc(m.who)}</span></span></div>`).join('')}</div>` : '<p class="small muted" style="margin:0">No medicine reminders yet. Open a medicine on the Today screen and turn on \u201CRemind me to take it\u201D.</p>'}
    ${!NATIVE && medRem.length ? '<p class="small muted" style="margin:8px 0 0">\u201CAdd reminders to Calendar\u201D above also adds these medicine reminders.</p>' : ''}</div>
  ${IOS_APP && NATIVE.healthStatus ? healthSettingsHTML() : stepsSettingsHTML()}
  ${await devicesSettingsHTML()}
  <div class="card"><h2>Language</h2><div class="field"><label for="set-lang">App language</label>${langSelect()}</div><p class="small muted" style="margin:8px 0 0">PDF reports stay in English so doctors and labs can read them.</p></div>
  <div class="card"><h2>Guidance</h2><p class="small muted" style="margin-top:0">What the numbers mean, precautions, and how to measure correctly.</p><button class="btn block" data-act="guide">Open guide</button></div>
  ${backupCardHTML()}
  <div class="card"><h2>About</h2>${creatorHTML()}<p style="margin:0"><b>Family Health Tracker</b> version ${APP_VERSION}</p><p class="small muted">Guidance follows the American Heart Association blood pressure categories. It is general information, not a diagnosis. Always follow your doctor’s advice.</p><p class="small" style="margin-bottom:0"><b>${COPYRIGHT}</b></p></div>`;
}

/* ------------------------------------------------------------------ sheets */
const sheetStack = [];
function openSheet({ title, body, foot, full = false, onMount }) {
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `<div class="sheet ${full ? 'full' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="sheet-head"><h2>${esc(title)}</h2><button class="icon-btn" data-close aria-label="Close"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button></div><div class="sheet-body">${body}</div>${foot ? `<div class="sheet-foot">${foot}</div>` : ''}</div>`;
  $('#sheets').appendChild(wrap);
  const api = { el: wrap, close: () => closeSheet(api) };
  wrap.addEventListener('click', e => { if (e.target === wrap || e.target.closest('[data-close]')) api.close(); });
  sheetStack.push(api);
  document.body.style.overflow = 'hidden';
  if (onMount) onMount(wrap, api);
  return api;
}
function closeSheet(api) {
  const i = sheetStack.indexOf(api); if (i < 0) return;
  sheetStack.splice(i, 1); api.el.remove();
  if (api.onClose) api.onClose();
  if (!sheetStack.length) document.body.style.overflow = '';
}
window.bpBack = function () { if (sheetStack.length) { sheetStack[sheetStack.length - 1].close(); return true; } if (S.tab !== 'home') { S.tab = 'home'; render(); return true; } return false; };

function confirmSheet(title, text, okLabel, danger) {
  return new Promise(res => {
    const sh = openSheet({ title, body: `<p style="margin:0">${esc(text)}</p>`, foot: `<button class="btn" data-no>Cancel</button><button class="btn ${danger ? 'danger' : 'primary'}" data-yes>${esc(okLabel)}</button>` });
    let done = false;
    sh.onClose = () => { if (!done) res(false); };
    sh.el.querySelector('[data-no]').onclick = () => sh.close();
    sh.el.querySelector('[data-yes]').onclick = () => { done = true; sh.close(); res(true); };
  });
}

/* ---- person form */
function personSheet(id) {
  const p = id ? S.profiles.find(x => x.id === id) : null;
  if (!p && S.profiles.length >= MAX_PEOPLE) { toast(`You can add up to ${MAX_PEOPLE} people.`); return; }
  const body = `
    <div class="pf-photo"><div class="pf-av" id="pf-av">${p ? avatar(p) : '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="9" r="4" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M4.5 20c1-3.6 4-5.5 7.5-5.5s6.5 1.9 7.5 5.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>'}</div>
      <div style="display:flex;flex-direction:column;gap:8px;flex:1"><span class="lbl">Profile photo (optional)</span><div class="row"><label class="btn sm" for="pf-cam">Take photo</label><label class="btn sm" for="pf-gal">Gallery</label><button type="button" class="btn sm" id="pf-rmph" ${p && p.hasPhoto ? '' : 'hidden'}>Remove</button></div></div>
      <input type="file" id="pf-cam" accept="image/*" capture="user" hidden><input type="file" id="pf-gal" accept="image/*" hidden></div>
    <div class="field"><label for="pf-name">Name</label><input class="input" id="pf-name" autocomplete="off" maxlength="40" value="${esc(p ? p.name : '')}" placeholder="e.g. Fatima"></div>
    <div class="field"><span class="lbl">Gender</span><div class="seg" id="pf-sex"><button type="button" data-s="f" class="${p && p.sex === 'f' ? 'on' : ''}" aria-pressed="${!!(p && p.sex === 'f')}">Female</button><button type="button" data-s="m" class="${p && p.sex === 'm' ? 'on' : ''}" aria-pressed="${!!(p && p.sex === 'm')}">Male</button></div></div>
    <div class="grid3">
      <div class="field"><label for="pf-age">Age</label><input class="input num" id="pf-age" inputmode="numeric" type="number" min="1" max="120" value="${esc(p && p.age || '')}" placeholder="years"></div>
      <div class="field"><label for="pf-h">Height (cm)</label><input class="input num" id="pf-h" inputmode="decimal" type="number" min="50" max="250" step="0.5" value="${esc(p && p.height || '')}" placeholder="cm"></div>
      <div class="field"><label for="pf-w">Weight (kg)</label><input class="input num" id="pf-w" inputmode="decimal" type="number" min="2" max="350" step="0.1" value="${esc(p && p.weight || '')}" placeholder="kg"></div>
    </div>
    ${condPickerHTML(p, p && p.sex)}
    <div class="card" style="padding:12px" id="pf-sunit-card" ${p && p.trackSugar ? '' : 'hidden'}><div class="row" id="pf-sunit-row" style="margin-top:8px" ${p && p.trackSugar ? '' : 'hidden'}><span class="small muted" style="flex:1">Sugar unit</span><div class="seg" id="pf-sunit" style="flex:1"><button type="button" data-u="mg/dL" class="${!p || (p.sugarUnit || 'mg/dL') === 'mg/dL' ? 'on' : ''}">mg/dL</button><button type="button" data-u="mmol/L" class="${p && p.sugarUnit === 'mmol/L' ? 'on' : ''}">mmol/L</button></div></div></div>
    <div class="card" style="padding:12px"><b>Emergency contact</b><p class="small muted" style="margin:2px 0 8px">If a reading is dangerous, the app offers a ready message to this person by WhatsApp or SMS.</p>
      <div class="grid2"><div class="field"><label for="pf-emn">Name</label><input class="input" id="pf-emn" maxlength="40" autocomplete="off" value="${esc(p && p.emName || '')}" placeholder="e.g. Fatima"></div>
      <div class="field"><label for="pf-emp">Mobile number</label><input class="input num" id="pf-emp" type="tel" inputmode="tel" maxlength="20" value="${esc(p && p.emPhone || '')}" placeholder="+9665…" data-noi18n></div></div></div>
    <p class="err" id="pf-err" hidden></p>
    ${p ? `<button class="btn danger block" data-del>Delete ${esc(p.name)} and all readings</button>` : ''}`;
  const sh = openSheet({ title: p ? 'Edit person' : 'Add person', body, foot: '<button class="btn" data-close>Cancel</button><button class="btn primary" data-save>Save</button>' });
  const el = sh.el;
  if (!p) $("#pf-name", el).focus();
  let pphoto = null, pphotoChanged = false;
  const onPh = async e => {
    const f = e.target.files && e.target.files[0]; e.target.value = ''; if (!f) return;
    try { pphoto = await squarePhoto(f, 400); pphotoChanged = true; const u = URL.createObjectURL(pphoto); S.urls.push(u); $('#pf-av', el).innerHTML = `<img class="avimg" src="${u}" alt="">`; $('#pf-rmph', el).hidden = false; }
    catch (er) { toast(er.message); }
  };
  $('#pf-cam', el).onchange = onPh; $('#pf-gal', el).onchange = onPh;
  let sunit = p && p.sugarUnit || 'mg/dL', sex = p && p.sex || null;
  $$('#pf-sex button', el).forEach(b => b.onclick = () => { sex = b.dataset.s; $$('#pf-sex button', el).forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); }); });
  bindCondPicker(el, () => sex);
  $$('[data-cond="dm"]', el).forEach(b => b.addEventListener('click', () => { const on = b.classList.contains('on'); $('#pf-sunit-card', el).hidden = !on; $('#pf-sunit-row', el).hidden = !on; }));
  $$('#pf-sunit button', el).forEach(b => b.onclick = () => { sunit = b.dataset.u; $$('#pf-sunit button', el).forEach(x => x.classList.toggle('on', x === b)); });
  $('#pf-rmph', el).onclick = () => { pphoto = null; pphotoChanged = true; $('#pf-av', el).textContent = initials($('#pf-name', el).value || (p && p.name) || '?'); $('#pf-rmph', el).hidden = true; };
  $('[data-save]', el).onclick = async () => {
    const name = $('#pf-name', el).value.trim();
    const age = $('#pf-age', el).value ? Math.round(+$('#pf-age', el).value) : null;
    const height = $('#pf-h', el).value ? +(+$('#pf-h', el).value).toFixed(1) : null;
    const weight = $('#pf-w', el).value ? +(+$('#pf-w', el).value).toFixed(1) : null;
    const err = $('#pf-err', el);
    const bad = !name ? 'Please enter a name.' : !sex ? 'Please choose female or male.' : (age != null && (age < 1 || age > 120)) ? 'Age should be between 1 and 120.' : (height != null && (height < 50 || height > 250)) ? 'Height should be between 50 and 250 cm.' : (weight != null && (weight < 2 || weight > 350)) ? 'Weight should be between 2 and 350 kg.' : '';
    if (bad) { err.textContent = bad; err.hidden = false; return; }
    const rec = p ? Object.assign({}, p, { name, age, height, weight, updated: Date.now() }) : { id: uid(), name, age, height, weight, created: Date.now() };
    rec.sex = sex; readCondPicker(el, rec); rec.sugarUnit = sunit;
    rec.sex = sex;
    rec.emName = $('#pf-emn', el).value.trim(); rec.emPhone = telDigits($('#pf-emp', el).value);
    if (pphotoChanged) {
      if (pphoto) { await DB.put('docfiles', pphoto, 'pp_' + rec.id); rec.hasPhoto = true; rec.photoV = Date.now(); }
      else { await DB.del('docfiles', 'pp_' + rec.id); rec.hasPhoto = false; }
    }
    await DB.put('profiles', rec);
    await syncMedReminders();
    sh.close();
    await loadProfiles();
    if (!p) await selectPerson(rec.id); else { await loadReadings(); render(); }
    toast(p ? 'Saved' : `${name} added`);
    if (!p && NATIVE && !LS.get('bp.askedNotif', false)) { LS.set('bp.askedNotif', true); NATIVE.requestNotifications(); }
  };
  const del = $('[data-del]', el);
  if (del) del.onclick = async () => {
    if (!(await confirmSheet('Delete person?', `This permanently removes ${p.name} and all of their readings and photos from this phone.`, 'Delete', true))) return;
    const rs = await DB.byProfile(p.id);
    for (const r of rs) { await DB.del('readings', r.id); await DB.del('photos', r.id); }
    for (const m of await DB.byProfile(p.id, 'meds')) { await DB.del('meds', m.id); await DB.del('docfiles', 'med_' + m.id); }
    for (const d of await DB.byProfile(p.id, 'docs')) { await DB.del('docs', d.id); await DB.del('docfiles', d.id); }
    for (const st of await DB.byProfile(p.id, 'steps')) await DB.del('steps', st.id);
    for (const g of await DB.byProfile(p.id, 'sugar')) { await DB.del('sugar', g.id); await DB.del('photos', 'sg_' + g.id); }
    for (const t of await DB.byProfile(p.id, 'thyroid')) await DB.del('thyroid', t.id);
    for (const w of await DB.byProfile(p.id, 'wbp')) await DB.del('wbp', w.id);
    for (const v of await DB.byProfile(p.id, 'vitals')) await DB.del('vitals', v.id);
    for (const n of ['labs', 'symptoms', 'women']) for (const x of await DB.byProfile(p.id, n)) await DB.del(n, x.id);
    for (const a of await DB.byProfile(p.id, 'appts')) await DB.del('appts', a.id);
    await DB.del('docfiles', 'pp_' + p.id);
    await DB.del('profiles', p.id);
    sh.close();
    S.current = null; await loadProfiles(); await loadReadings(); render();
    toast('Deleted');
  };
}

/* ---- medicines */
function medSheet(id, preset) {
  const p = cur(); if (!p) return;
  const m = id ? S.meds.find(x => x.id === id) : null;
  const v = m || preset || null;            // values to show (a preset fills a new medicine, e.g. levothyroxine)
  let photo = null, photoChanged = false;
  const times = new Set(v ? v.times || [] : []);
  let weekly = !!(v && v.weekly);
  const wday = new Set(v && v.days && v.days.length ? v.days : [new Date().getDay()]);
  const body = `
    <div class="small muted">For ${esc(p.name)}</div>
    <div class="field"><label for="md-name">Medicine name</label><input class="input" id="md-name" maxlength="60" autocomplete="off" value="${esc(v ? v.name : '')}" placeholder="e.g. Amlodipine"></div>
    <div id="md-thy"></div>
    <div class="field"><label for="md-dose">Dose</label><input class="input" id="md-dose" maxlength="40" value="${esc(v ? v.dose || '' : '')}" placeholder="e.g. 5 mg, 1 tablet"></div>
    <div class="field"><span class="lbl">How often</span><div class="tchips" id="md-freq"><button type="button" data-f="daily" class="${weekly ? '' : 'on'}">Every day</button><button type="button" data-f="weekly" class="${weekly ? 'on' : ''}">Once a week</button></div></div>
    <div class="field" id="md-days-f" ${weekly ? '' : 'hidden'}><span class="lbl">Day</span><div class="tchips" id="md-days">${WD.map((d, i) => `<button type="button" data-d="${i}" class="${wday.has(i) ? 'on' : ''}" aria-pressed="${wday.has(i)}">${d}</button>`).join('')}</div></div>
    <div class="field"><span class="lbl">When taken</span><div class="tchips" id="md-times">${MED_TIMES.map(t => `<button type="button" data-t="${t.k}" class="${times.has(t.k) ? 'on' : ''}" aria-pressed="${times.has(t.k)}">${t.l}</button>`).join('')}</div></div>
    <div class="card" style="padding:12px"><div class="row"><b style="flex:1">Remind me to take it</b><label class="switch" aria-label="Medicine reminder"><input type="checkbox" id="md-rem" ${v && v.remind ? 'checked' : ''}><span></span></label></div>
      <div id="md-remt" style="display:flex;flex-direction:column;gap:8px;margin-top:8px"></div>
      <p class="small muted" style="margin:6px 0 0">${NATIVE ? 'Your phone will remind you every day at these times.' : 'On iPhone, add the reminders to your Calendar from Settings \u203A Reminders.'}</p></div>
    <div class="field"><label for="md-notes">Notes (optional)</label><input class="input" id="md-notes" maxlength="80" value="${esc(v ? v.notes || '' : '')}" placeholder="e.g. after food, for blood pressure"></div>
    <div class="field"><label for="md-start">Started on (optional)</label><input class="input" type="date" id="md-start" value="${esc(m ? m.start || '' : '')}"></div>
    <div class="field"><span class="lbl">Photo of box or prescription (optional)</span>
      <div class="photo-zone small-zone" id="md-zone"><div class="ph-empty">No photo</div></div>
      <div class="btn-row"><label class="btn" for="md-cam">Take photo</label><label class="btn" for="md-gal">From gallery</label></div>
      <input type="file" id="md-cam" accept="image/*" capture="environment" hidden><input type="file" id="md-gal" accept="image/*" hidden></div>
    <label class="check"><input type="checkbox" id="md-active" ${!m || m.active ? 'checked' : ''}> Currently taking</label>
    <p class="err" id="md-err" hidden></p>
    ${m ? '<button class="btn danger block" data-del>Delete medicine</button>' : ''}`;
  const sh = openSheet({ title: m ? 'Edit medicine' : 'Add medicine', body, full: true, foot: '<button class="btn" data-close>Cancel</button><button class="btn primary" data-save>Save</button>' });
  const el = sh.el, zone = $('#md-zone', el);
  const show = u => { zone.innerHTML = `<img src="${u}" alt="Medicine photo"><button class="btn sm" data-rm style="position:absolute;top:8px;right:8px">Remove</button>`; $('[data-rm]', zone).onclick = () => { photo = null; photoChanged = true; zone.innerHTML = '<div class="ph-empty">No photo</div>'; }; };
  if (m && m.hasPhoto) DB.get('docfiles', 'med_' + m.id).then(b => { if (b) { const u = URL.createObjectURL(b); S.urls.push(u); show(u); } });
  const onFile = async e => { const f = e.target.files && e.target.files[0]; e.target.value = ''; if (!f) return; try { photo = await shrinkImage(f, 1600, 0.82); photoChanged = true; const u = URL.createObjectURL(photo); S.urls.push(u); show(u); } catch (er) { toast(er.message); } };
  $('#md-cam', el).onchange = onFile; $('#md-gal', el).onchange = onFile;
  const remT = Object.assign({}, MED_DEFAULT_T, v && v.remTimes || {});
  const thyTip = () => { $('#md-thy', el).innerHTML = THY_MED.test($('#md-name', el).value) ? THY_TIP_HTML : ''; };
  $('#md-name', el).addEventListener('input', thyTip); thyTip();
  const drawRem = () => {
    const box = $('#md-remt', el), on = $('#md-rem', el).checked;
    box.innerHTML = !on ? '' : times.size ? MED_TIMES.filter(t => times.has(t.k)).map(t => `<div class="row"><span style="width:96px">${t.l}</span><input class="input" type="time" data-rt="${t.k}" value="${esc(remT[t.k])}" style="flex:1;min-width:140px;max-width:190px"></div>`).join('')
      : '<p class="small err" style="margin:0">Choose when it is taken (Morning, Evening\u2026) above.</p>';
    $$('[data-rt]', box).forEach(i => i.onchange = () => { remT[i.dataset.rt] = i.value || MED_DEFAULT_T[i.dataset.rt]; });
  };
  $('#md-rem', el).onchange = drawRem;
  $$('#md-freq button', el).forEach(b => b.onclick = () => { weekly = b.dataset.f === 'weekly'; $$('#md-freq button', el).forEach(x => x.classList.toggle('on', x === b)); $('#md-days-f', el).hidden = !weekly; });
  $$('#md-days button', el).forEach(b => b.onclick = () => { wday.clear(); wday.add(+b.dataset.d); $$('#md-days button', el).forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); }); });
  $$('#md-times button', el).forEach(b => b.onclick = () => { const on = !times.has(b.dataset.t); on ? times.add(b.dataset.t) : times.delete(b.dataset.t); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); drawRem(); });
  drawRem();
  if (!m) $('#md-name', el).focus();
  $('[data-save]', el).onclick = async () => {
    const name = $('#md-name', el).value.trim();
    if (!name) { const e = $('#md-err', el); e.textContent = 'Please enter the medicine name.'; e.hidden = false; return; }
    const rec = Object.assign({}, m || { id: uid(), profileId: p.id, created: Date.now() }, {
      name, dose: $('#md-dose', el).value.trim(), notes: $('#md-notes', el).value.trim(), start: $('#md-start', el).value,
      times: MED_TIMES.map(t => t.k).filter(k => times.has(k)), weekly, days: weekly ? [...wday] : [], active: $('#md-active', el).checked, updated: Date.now(),
      remind: $('#md-rem', el).checked, remTimes: Object.fromEntries(MED_TIMES.map(t => [t.k, remT[t.k]])),
      hasPhoto: photoChanged ? !!photo : !!(m && m.hasPhoto)
    });
    if (photoChanged) { if (photo) await DB.put('docfiles', photo, 'med_' + rec.id); else await DB.del('docfiles', 'med_' + rec.id); }
    await DB.put('meds', rec);
    await syncMedReminders();
    // thyroid tablet dose changed: the TSH test is usually repeated after about 6 weeks
    const thyDose = m && THY_MED.test(rec.name) && (m.dose || '') !== (rec.dose || '') && rec.dose;
    if (thyDose) setTimeout(async () => { if (await confirmSheet('Recheck thyroid test?', T('The {med} dose changed. TSH is usually checked again after about 6 weeks. Add a reminder for a blood test on {date}?', { med: rec.name, date: fmtDate(Date.now() + 42 * 864e5, { day: 'numeric', month: 'short', year: 'numeric' }) }), 'Add reminder')) {
      await DB.put('appts', { id: uid(), profileId: p.id, kind: 'test', title: tr('TSH blood test (after dose change)'), place: '', days: null, date: dayKey(Date.now() + 42 * 864e5), time: '09:00', remind: [1440], note: '', created: Date.now() }); await syncMedReminders(); await loadReadings(); render(); toast('Reminder added'); } }, 400);
    if (rec.remind && NATIVE && NATIVE.notificationStatus() !== 'granted') NATIVE.requestNotifications();
    sh.close(); await loadReadings(); render(); toast(m ? 'Medicine updated' : 'Medicine added');
  };
  const del = $('[data-del]', el);
  if (del) del.onclick = async () => {
    if (!(await confirmSheet('Delete medicine?', `Remove ${m.name} from ${p.name}’s list? To keep it on record, untick “Currently taking” instead.`, 'Delete', true))) return;
    await DB.del('meds', m.id); await DB.del('docfiles', 'med_' + m.id); await syncMedReminders();
    sh.close(); await loadReadings(); render(); toast('Medicine deleted');
  };
}
function allMedsSheet() {
  const p = cur(); if (!p) return;
  const row = m => `<button class="mrow" data-med="${m.id}"><span class="mic">${PILL_ICON}</span><span style="min-width:0;flex:1"><b>${esc(m.name)}</b>${m.dose ? ` <span class="muted">${esc(m.dose)}</span>` : ''}<br><span class="small muted">${esc(medTimesText(m) || 'Time not set')}</span></span></button>`;
  const act = S.meds.filter(x => x.active), old = S.meds.filter(x => !x.active);
  openSheet({ title: p.name + '’s medicines', full: true,
    body: `<div class="sec-title">Currently taking</div><div class="mlist">${act.map(row).join('') || '<p class="small muted">None</p>'}</div><div class="sec-title">Stopped</div><div class="mlist">${old.map(row).join('') || '<p class="small muted">None</p>'}</div>`,
    foot: '<button class="btn" data-close>Close</button><button class="btn primary" data-act="add-med">Add medicine</button>' });
}

/* ---- test reports */
const DOC_TYPES = ['Blood test', 'Kidney test', 'Cholesterol', 'Sugar / HbA1c', 'ECG', 'Echo', 'Prescription', 'Doctor letter', 'Other'];
const MAX_DOC_BYTES = 20 * 1024 * 1024;
function docSheet(id) {
  const p = cur(); if (!p) return;
  const d = id ? S.docs.find(x => x.id === id) : null;
  let file = null, fileInfo = null;
  const body = `
    <div class="small muted">For ${esc(p.name)}</div>
    ${d ? '' : `<div class="photo-zone small-zone" id="dc-zone"><div class="ph-empty">${DOC_ICON}<div>Photo or PDF of the report</div></div></div>
    <div class="grid3"><label class="btn primary" for="dc-cam">Camera</label><label class="btn" for="dc-gal">Photo</label><label class="btn" for="dc-pdf">PDF file</label></div>
    <input type="file" id="dc-cam" accept="image/*" capture="environment" hidden><input type="file" id="dc-gal" accept="image/*" hidden><input type="file" id="dc-pdf" accept="application/pdf" hidden>`}
    <div class="field"><label for="dc-title">Report name</label><input class="input" id="dc-title" maxlength="60" value="${esc(d ? d.title : '')}" placeholder="e.g. Blood test"><div class="tchips" id="dc-types">${DOC_TYPES.map(t => `<button type="button">${esc(t)}</button>`).join('')}</div></div>
    <div class="field"><label for="dc-date">Test date</label><input class="input" type="date" id="dc-date" value="${esc(d ? d.date || '' : dayKey(Date.now()))}"></div>
    <div class="field"><label for="dc-notes">Notes (optional)</label><input class="input" id="dc-notes" maxlength="100" value="${esc(d ? d.notes || '' : '')}" placeholder="e.g. Dr. Khalid, fasting"></div>
    <div class="field"><div class="row"><span class="lbl">Values in this report</span><span class="spacer"></span>${d ? '<button type="button" class="btn sm" data-reread>Read from report</button>' : ''}</div><div id="dc-res"></div></div>
    <p class="err" id="dc-err" hidden></p>
    ${d ? '<button class="btn danger block" data-del>Delete report</button>' : ''}`;
  const sh = openSheet({ title: d ? 'Edit test report' : 'Upload test report', body, full: true, foot: '<button class="btn" data-close>Cancel</button><button class="btn primary" data-save>Save</button>' });
  const el = sh.el, err = $('#dc-err', el);
  $$('#dc-types button', el).forEach(b => b.onclick = () => { $('#dc-title', el).value = b.textContent; });
  const resEl = $('#dc-res', el);
  let results = d && d.results ? d.results.map(r => Object.assign({}, r)) : [];
  let findings = d && d.findings ? d.findings.slice() : [];
  let readMsg = d && d.results ? '' : '<p class="small muted" style="margin:0">' + (d ? 'Tap \u201CRead from report\u201D to find values like creatinine, potassium, sugar and cholesterol.' : 'After you add the photo or PDF, the app reads values like creatinine, potassium, sugar and cholesterol.') + '</p>';
  const drawResults = () => {
    resEl.innerHTML = readMsg + (results.length ? `<div class="labedit">${results.map((r, i) => `<div class="lrow ${r.sure === false ? 'unsure' : ''}"><span class="lname">${esc(r.name)}</span><input class="input num" data-i="${i}" data-f="value" inputmode="decimal" value="${esc(r.value)}" aria-label="${esc(r.name)} value"><select class="input" data-i="${i}" data-f="unit" aria-label="${esc(r.name)} unit">${BPLab.units(r.key).map(u => `<option ${u === r.unit ? 'selected' : ''}>${esc(u)}</option>`).join('')}</select><span class="pill" style="--cat:var(${flagVar(r.flag)})">${esc(r.label || r.flag)}</span><button type="button" class="icon-btn sm" data-rm="${i}" aria-label="Remove ${esc(r.name)}">\u00D7</button></div>`).join('')}</div>` : '') +
      findingsHTML(findings, true) +
      precautionsHTML(results) +
      `<div class="row" style="margin-top:8px"><select class="input" id="dc-addt" style="flex:1;min-width:0"><option value="">+ Add a value by hand\u2026</option>${BPLab.tests.filter(t => !results.find(r => r.key === t.key)).map(t => `<option value="${t.key}">${esc(t.name)}</option>`).join('')}</select></div>`;
    $$('[data-f]', resEl).forEach(inp => inp.onchange = () => {
      const r = results[+inp.dataset.i];
      if (inp.dataset.f === 'value') { const v = parseFloat(String(inp.value).replace(',', '.')); if (isFinite(v)) r.value = v; } else r.unit = inp.value;
      r.sure = true; Object.assign(r, BPLab.reRate(r)); drawResults();
    });
    $$('[data-rm]', resEl).forEach(b => b.onclick = () => { results.splice(+b.dataset.rm, 1); drawResults(); });
    $$('[data-rmf]', resEl).forEach(b => b.onclick = () => { findings.splice(+b.dataset.rmf, 1); drawResults(); });
    $('#dc-addt', resEl).onchange = e => { const k = e.target.value; if (!k) return; const t = BPLab.tests.find(x => x.key === k); results.push({ key: k, name: t.name, value: '', unit: BPLab.units(k)[0], flag: 'normal', label: 'Enter value', sure: true }); drawResults(); const inp = resEl.querySelector(`[data-i="${results.length - 1}"][data-f="value"]`); if (inp) inp.focus(); };
  };
  const runRead = async (blob, isPdf) => {
    readMsg = '<p class="ocr-msg"><span class="busy"></span> <span id="dc-say">Reading values from the report\u2026</span></p>'; drawResults();
    try {
      const out = await BPLab.read(blob, isPdf, t => { const x = $('#dc-say', el); if (x && t) x.textContent = t; });
      if (!sh.el.isConnected) return;
      results = out.results; findings = out.findings || [];
      if (out.kind === 'ecg' && !$('#dc-title', el).value.trim()) $('#dc-title', el).value = 'ECG';
      const unsure = results.filter(r => !r.sure).length;
      readMsg = out.kind === 'ecg' && (results.length || findings.length) ? `<p class="ocr-msg ${unsure || results.length < 4 ? 'warn' : 'ok'}"><span><b>ECG report read: ${results.length} measurement${results.length === 1 ? '' : 's'}${findings.length ? ' and the machine\u2019s findings' : ''}.</b> Check the numbers against the printout.${results.length < 4 ? ' For the best result, take a close, straight photo of the box with HR, PR, QRS and QTc.' : ''}${unsure ? ' Rows in orange need a careful look.' : ''}</span></p>`
        : results.length ? `<p class="ocr-msg ${unsure ? 'warn' : 'ok'}"><span><b>Found ${results.length} value${results.length > 1 ? 's' : ''}.</b> Check each against the report and correct any that are wrong.${unsure ? ' Rows in orange need a careful look.' : ''}</span></p>`
        : `<p class="ocr-msg warn"><span><b>No values found.</b> ${out.chars < 40 ? 'The report could not be read; try a sharper, straight photo in good light.' : 'This report may not include the common tests the app knows. You can add values by hand below.'}</span></p>`;
    } catch (e3) { readMsg = `<p class="ocr-msg warn"><span>Could not read the report: ${esc(e3.message || e3)}</span></p>`; }
    drawResults();
  };
  drawResults();
  const rr = $('[data-reread]', el);
  if (rr) rr.onclick = async () => { const b = await DB.get('docfiles', d.id); if (b) runRead(b, !d.isImage); };
  const onFile = async e => {
    const f = e.target.files && e.target.files[0]; e.target.value = ''; if (!f) return;
    const zone = $('#dc-zone', el); err.hidden = true;
    if (f.size > MAX_DOC_BYTES) { err.textContent = 'That file is over 20 MB. Choose a smaller file.'; err.hidden = false; return; }
    const isPdf = f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
    const isImg = !isPdf && (f.type.startsWith('image/') || /\.(jpe?g|png|heic|webp)$/i.test(f.name));
    if (!isPdf && !isImg) { err.textContent = 'Choose a photo or a PDF file.'; err.hidden = false; return; }
    zone.innerHTML = '<div class="ph-empty"><span class="busy"></span></div>';
    try {
      if (isImg) { file = await shrinkImage(f, 2200, 0.86); fileInfo = { isImage: true, mime: 'image/jpeg', fileName: f.name }; const u = URL.createObjectURL(file); S.urls.push(u); zone.innerHTML = `<img src="${u}" alt="Report photo">`; }
      else { file = new Blob([await f.arrayBuffer()], { type: 'application/pdf' }); fileInfo = { isImage: false, mime: 'application/pdf', fileName: f.name || 'report.pdf' }; zone.innerHTML = `<div class="ph-empty">${DOC_ICON}<div style="overflow-wrap:anywhere"><b>${esc(fileInfo.fileName)}</b><br>${(f.size / 1048576).toFixed(1)} MB PDF</div></div>`; }
    } catch (er) { zone.innerHTML = `<div class="ph-empty err">${esc(er.message)}</div>`; file = null; return; }
    runRead(isImg ? f : file, isPdf);    // read the original photo: small print needs every pixel
  };
  if (!d) { $('#dc-cam', el).onchange = onFile; $('#dc-gal', el).onchange = onFile; $('#dc-pdf', el).onchange = onFile; }
  $('[data-save]', el).onclick = async () => {
    const title = $('#dc-title', el).value.trim();
    const bad = !d && !file ? 'Take a photo or choose a file first.' : !title ? 'Enter a name for the report.' : '';
    if (bad) { err.textContent = bad; err.hidden = false; return; }
    const clean = results.filter(r => r.value !== '' && isFinite(+r.value)).map(r => { const x = BPLab.reRate(Object.assign({}, r, { value: +r.value })); return { key: x.key, name: x.name, value: x.value, unit: x.unit, flag: x.flag, label: x.label, range: x.range || '' }; });
    const rec = Object.assign({}, d || Object.assign({ id: uid(), profileId: p.id, created: Date.now(), size: file.size }, fileInfo), { title, date: $('#dc-date', el).value, notes: $('#dc-notes', el).value.trim(), results: clean, findings, updated: Date.now() });
    try { if (!d) await DB.put('docfiles', file, rec.id); await DB.put('docs', rec); }
    catch (e2) { err.textContent = 'Could not save: ' + (e2 && e2.message || 'storage error'); err.hidden = false; return; }
    sh.close(); await loadReadings(); render(); toast(d ? 'Report updated' : 'Report saved');
    if (clean.length || findings.length) docView(rec.id);
  };
  const del = $('[data-del]', el);
  if (del) del.onclick = async () => {
    if (!(await confirmSheet('Delete report?', `Delete “${d.title}”? This cannot be undone.`, 'Delete', true))) return;
    await DB.del('docs', d.id); await DB.del('docfiles', d.id);
    sh.close(); await loadReadings(); render(); toast('Report deleted');
  };
}
/* what the ECG machine (or a report) concluded, explained in plain words */
function findingsHTML(fs, editable) {
  if (!fs || !fs.length) return '';
  return '<div class="sec-title" style="margin-top:12px">What the report says</div>' + fs.map((f, i) => {
    const F = BPLab.finding(f.key) || f; const fl = F.flag === 'info' ? 'normal' : F.flag;
    return `<div class="guide-box" style="--cat:var(${flagVar(fl)});margin-top:8px"><div class="row"><h3 style="flex:1;margin:0">${esc(F.label)}</h3>${editable ? `<button type="button" class="icon-btn sm" data-rmf="${i}" aria-label="Remove ${esc(F.label)}">\u00D7</button>` : ''}</div><p style="margin:6px 0">${esc(F.text || '')}</p>${F.tips && F.tips.length ? '<ul>' + F.tips.map(t => `<li>${esc(t)}</li>`).join('') + '</ul>' : ''}${F.urgent ? `<p class="urgent">${esc(F.urgent)}</p>` : ''}</div>`;
  }).join('');
}
function precautionsHTML(results) {
  const ok = results.filter(r => r.value !== '' && isFinite(+r.value));
  if (!ok.length) return '';
  const bad = ok.map(r => BPLab.reRate(Object.assign({}, r, { value: +r.value }))).filter(r => r.flag !== 'normal');
  if (!bad.length) return '<div class="guide-box" style="--cat:var(--c-normal);margin-top:10px"><h3>Values found are in the usual range</h3><p style="margin:0">Keep following your doctor\u2019s plan.</p></div>';
  return '<div class="sec-title" style="margin-top:12px">Precautions</div>' + bad.map(r => { const tips = BPLab.advice(r, S.meds); return tips.length ? `<div class="guide-box" style="--cat:var(${flagVar(r.flag)});margin-top:8px"><h3>${esc(r.name)}: ${esc(r.value)} ${esc(r.unit)} \u00B7 ${esc(r.label || r.flag)}</h3><ul>${tips.map(t => `<li>${esc(t)}</li>`).join('')}</ul></div>` : ''; }).join('') +
    '<p class="small muted" style="margin:6px 0 0">General guidance only. Your doctor knows your full picture.</p>';
}
function flagVar(f) { return f === 'normal' ? '--c-normal' : f === 'borderline' ? '--c-elevated' : f === 'low' ? '--c-low' : '--c-stage2'; }
function resultsHTML(d) {
  if ((!d.results || !d.results.length) && (!d.findings || !d.findings.length)) return '';
  if (!d.results || !d.results.length) return findingsHTML(d.findings, false);
  const bad = d.results.filter(r => r.flag !== 'normal');
  let h = `<div class="card"><h2>Values from this report</h2><div class="tbl-wrap"><table class="ranges"><thead><tr><th>Test</th><th>Result</th><th>Usual range</th></tr></thead><tbody>${d.results.map(r => `<tr><td>${esc(r.name)}</td><td class="num"><b>${esc(r.value)}</b> <span class="small muted">${esc(r.unit)}</span><br><span class="pill" style="--cat:var(${flagVar(r.flag)})">${esc(r.label || r.flag)}</span></td><td class="num small muted">${esc(r.range || BPLab.refText(r.key, r.unit))}</td></tr>`).join('')}</tbody></table></div><p class="small muted" style="margin:8px 0 0">Usual ranges are general adult values. Your lab\u2019s own range on the report takes priority.</p></div>`;
  for (const r of bad) {
    const tips = BPLab.advice(r, S.meds);
    if (tips.length) h += `<div class="guide-box" style="--cat:var(${flagVar(r.flag)})"><h3>${esc(r.name)}: ${esc(r.label || r.flag)}</h3><ul>${tips.map(t => `<li>${esc(t)}</li>`).join('')}</ul></div>`;
  }
  if (!bad.length) h += '<div class="guide-box" style="--cat:var(--c-normal)"><h3>All values found are in the usual range</h3><p style="margin:0">Keep following your doctor\u2019s plan and repeat tests when advised.</p></div>';
  return findingsHTML(d.findings, false) + h;
}

async function docView(id) {
  const d = S.docs.find(x => x.id === id); if (!d) return;
  const blob = await DB.get('docfiles', d.id);
  if (!blob) { toast('The file for this report is missing.'); return; }
  const u = URL.createObjectURL(blob); S.urls.push(u);
  const when = d.date ? fmtDate(new Date(d.date + 'T12:00').getTime(), { day: 'numeric', month: 'long', year: 'numeric' }) : '';
  const sh = openSheet({ title: d.title, full: true,
    body: `<p class="small muted" style="margin:0">${esc(when)}${d.notes ? ' · ' + esc(d.notes) : ''}</p>${d.isImage ? `<img src="${u}" alt="${esc(d.title)}" style="width:100%;border-radius:12px;border:1px solid var(--line)">` : `<div class="card empty-state">${DOC_ICON.replace('<svg', '<svg style="color:var(--accent)"')}<p style="margin:0;overflow-wrap:anywhere"><b>${esc(d.fileName || 'Report.pdf')}</b><br><span class="small muted">PDF · ${((d.size || blob.size) / 1048576).toFixed(1)} MB</span></p></div>`}`,
    foot: `<button class="btn" data-edit>${d.results && d.results.length ? 'Edit' : 'Read values'}</button><button class="btn primary" data-open>${d.isImage ? 'Share' : 'Open / Share'}</button>` });
  const head = sh.el.querySelector('.sheet-body > p'); if (head && ((d.results && d.results.length) || (d.findings && d.findings.length))) head.insertAdjacentHTML('afterend', resultsHTML(d));
  $('[data-edit]', sh.el).onclick = () => { sh.close(); docSheet(d.id); };
  $('[data-open]', sh.el).onclick = async () => {
    const ext = d.isImage ? '.jpg' : '.pdf';
    const name = (d.title + (d.date ? ' ' + d.date : '')).replace(/[\\/:*?"<>|]+/g, '').trim() + ext;
    await deliverFile(blob, name, d.mime || (d.isImage ? 'image/jpeg' : 'application/pdf'), d.isImage ? 'Photo' : 'Report');
  };
}
function allDocsSheet() {
  const p = cur(); if (!p) return;
  const sh = openSheet({ title: p.name + '’s test reports', full: true, body: `<div class="mlist">${S.docs.map(docRow).join('') || '<p class="muted">No reports yet.</p>'}</div>`, foot: '<button class="btn" data-close>Close</button><button class="btn primary" data-act="add-doc">Upload report</button>' });
  fillDocThumbs(sh.el);
}

/* ---- reading form */
const whereTxt = r => (r.place && r.place !== 'home' ? ' \u00B7 ' + esc(placeLabel(r.place)) : '');
const PLACES = [{ k: 'home', l: 'Home' }, { k: 'hospital', l: 'Hospital / clinic' }, { k: 'pharmacy', l: 'Pharmacy' }];
const placeLabel = k => (PLACES.find(x => x.k === k) || PLACES[0]).l;
function readingSheet(existing, presetSlot) {
  const place0 = existing ? (existing.place || 'home') : LS.get('bp.place', 'home');
  const p = cur();
  if (!p) { personSheet(); return; }
  const r = existing || null;
  const now = new Date();
  let photoBlob = null, photoChanged = false, photoRemoved = false;
  const slot = r ? r.slot : (presetSlot || slotFor(now));
  const body = `
    <div class="small muted">For ${esc(p.name)}</div>
    <div class="field"><span class="lbl">Where measured</span><div class="seg" id="rf-place">${PLACES.map(x => `<button type="button" data-p="${x.k}" class="${x.k === place0 ? 'on' : ''}">${x.l}</button>`).join('')}</div></div>
    <div class="photo-zone" id="rf-zone"><div class="ph-empty"><svg viewBox="0 0 24 24"><path d="M4 8.5h3l1.6-2.5h6.8L17 8.5h3V19H4z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><circle cx="12" cy="13.3" r="3.3" fill="none" stroke="currentColor" stroke-width="1.6"/></svg><div>Photo of the monitor screen</div></div></div>
    ${canLiveScan() ? `<button type="button" class="btn primary block" id="rf-live-scan"><svg viewBox="0 0 24 24"><path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M8 12h8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg><span>Scan the screen live</span></button>` : ''}
    <div class="btn-row">
      <label class="btn ${canLiveScan() ? '' : 'primary'}" for="rf-cam"><svg viewBox="0 0 24 24"><path d="M4 8.5h3l1.6-2.5h6.8L17 8.5h3V19H4z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><circle cx="12" cy="13.3" r="3.3" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>Take photo</label>
      <label class="btn" for="rf-gal">From gallery</label>
    </div>
    <input type="file" id="rf-cam" accept="image/*" capture="environment" hidden>
    <input type="file" id="rf-gal" accept="image/*" hidden>
    ${p.dialysis ? '<p class="ocr-msg warn" style="margin:0"><span>Dialysis: do not measure on the arm with your fistula or graft.</span></p>' : ''}
    ${hasCond(p, 'cancer') && p.cancer && p.cancer.noArm ? '<p class="ocr-msg warn" style="margin:0"><span>Do not measure on the arm where lymph nodes were removed; use the other arm.</span></p>' : ''}
    <details class="tipbox"><summary>Tips for a good photo</summary><ul class="tips"><li>Hold the phone straight in front of the screen so the screen fills most of the photo.</li><li>Avoid glare from lights or windows. Tilt slightly if you see a reflection.</li><li>Keep still so the digits are sharp.</li></ul></details>
    <details class="tipbox"><summary>How to measure correctly</summary><ul class="tips">${MEASURE_TIPS.map(t => `<li>${esc(t)}</li>`).join('')}</ul></details>
    <div id="rf-ocr" class="ocr-msg" hidden></div>
    <div class="lbl">Numbers on the screen</div>
    <div class="grid3">
      <div class="field"><label for="rf-sys">SYS (top)</label><input class="input bpin" id="rf-sys" type="number" inputmode="numeric" min="50" max="300" value="${r ? r.sys : ''}" placeholder="120"></div>
      <div class="field"><label for="rf-dia">DIA (bottom)</label><input class="input bpin" id="rf-dia" type="number" inputmode="numeric" min="30" max="200" value="${r ? r.dia : ''}" placeholder="80"></div>
      <div class="field"><label for="rf-pul">Pulse</label><input class="input bpin" id="rf-pul" type="number" inputmode="numeric" min="25" max="250" value="${r && r.pulse ? r.pulse : ''}" placeholder="72"></div>
    </div>
    <div id="rf-live"></div>
    <div class="field"><span class="lbl">Time of day</span><div class="seg" id="rf-slot">${SLOTS.map(s => `<button type="button" data-s="${s.k}" class="${s.k === slot ? 'on' : ''}">${s.l}</button>`).join('')}</div></div>
    <div class="field"><label for="rf-when">Date and time</label><input class="input" id="rf-when" type="datetime-local" value="${localInputValue(r ? r.ts : now.getTime())}"></div>
    <div class="field"><label for="rf-note">Note (optional)</label><input class="input" id="rf-note" maxlength="80" value="${esc(r && r.note || '')}" placeholder="e.g. felt dizzy, after walk"></div>
    <label class="check"><input type="checkbox" id="rf-med" ${r && r.medTaken ? 'checked' : ''}> Took blood pressure medicine before this reading</label>
    <p class="err" id="rf-err" hidden></p>
    ${r ? '<button class="btn danger block" data-del>Delete this reading</button>' : ''}`;
  const sh = openSheet({ title: r ? 'Edit reading' : 'New reading', body, full: true, foot: '<button class="btn" data-close>Cancel</button><button class="btn primary" data-save>Save reading</button>' });
  const el = sh.el;
  let curSlot = slot, curPlace = place0, typed = false;
  const zone = $('#rf-zone', el);
  const showPhoto = (url) => { zone.innerHTML = `<img src="${url}" alt="Monitor photo"><button class="btn sm" data-rmphoto style="position:absolute;top:8px;right:8px">Remove</button>`; $('[data-rmphoto]', zone).onclick = () => { photoBlob = null; photoChanged = true; photoRemoved = true; zone.innerHTML = '<div class="ph-empty"><div>No photo</div></div>'; }; };
  if (r && r.hasPhoto) DB.get('photos', r.id).then(b => { if (b) { const u = URL.createObjectURL(b); S.urls.push(u); showPhoto(u); } });
  const onFile = async (e) => {
    const f = e.target.files && e.target.files[0]; e.target.value = '';
    if (!f) return;
    zone.innerHTML = '<div class="ph-empty"><span class="busy"></span></div>';
    try { photoBlob = await shrinkImage(f); photoChanged = true; photoRemoved = false; const u = URL.createObjectURL(photoBlob); S.urls.push(u); showPhoto(u); }
    catch (err) { zone.innerHTML = `<div class="ph-empty err">${esc(err.message)}</div>`; return; }
    readPhoto(photoBlob);
  };
  $('#rf-cam', el).onchange = onFile; $('#rf-gal', el).onchange = onFile;
  if ($('#rf-live-scan', el)) $('#rf-live-scan', el).onclick = async () => {
    const got = await liveScan({ mode: 'bp' }); if (!got) return;
    photoBlob = got.blob; photoChanged = true; photoRemoved = false; const u = URL.createObjectURL(photoBlob); S.urls.push(u); showPhoto(u);
    typed = false; readPhoto(photoBlob, got.res);
  };
  const ocrBox = $('#rf-ocr', el);
  const boxes = { sys: $('#rf-sys', el), dia: $('#rf-dia', el), pulse: $('#rf-pul', el) };
  Object.values(boxes).forEach(b => b.addEventListener('input', e => { b.classList.remove('auto', 'unsure'); if (e.isTrusted) typed = true; }));
  let readSeq = 0;
  async function readPhoto(blob, pre) {
    const seq = ++readSeq;
    ocrBox.hidden = false; ocrBox.className = 'ocr-msg'; ocrBox.innerHTML = '<span class="busy"></span> <span id="rf-say">Reading the numbers from the photo\u2026</span>';
    const say = t => { const x = $('#rf-say', el); if (x && t) x.textContent = t; };
    // home monitors usually have segment (LCD) digits; hospital monitors show printed digits on a colour screen
    const lcd = async () => (typeof BPOCR !== 'undefined' ? BPOCR.read(blob) : null);
    const scr = async () => (typeof BPMonitor !== 'undefined' ? BPMonitor.read(blob, say) : null);
    const order = curPlace === 'home' ? [lcd, scr] : [scr, lcd];
    let res = pre || null;
    if (!pre) { try { res = await order[0](); } catch (e) { res = null; } }
    if (seq !== readSeq || !sh.el.isConnected) return;
    if (!pre && (!res || !res.sure.sys || !res.sure.dia)) {
      say('Trying another way to read the screen\u2026');
      let r2 = null; try { r2 = await order[1](); } catch (e) { r2 = null; }
      if (seq !== readSeq || !sh.el.isConnected) return;
      if (r2 && res && r2.sys === res.sys && r2.dia === res.dia) { res.sure.sys = res.sure.dia = true; if (res.pulse == null) res.pulse = r2.pulse; }
      else if (r2 && (!res || (r2.sure.sys && r2.sure.dia))) res = r2;
    }
    if (typed) { ocrBox.hidden = true; return; }      // the person already typed the numbers themselves
    if (!res) {
      ocrBox.className = 'ocr-msg warn';
      ocrBox.innerHTML = '<b>Could not read the numbers from this photo.</b> Type them in below, or retake the photo straight on, close to the screen, without glare.';
      if (!boxes.sys.value) boxes.sys.focus();
      return;
    }
    for (const k of ['sys', 'dia', 'pulse']) {
      const b = boxes[k];
      if (res[k] == null) continue;
      b.value = res[k]; b.classList.add('auto'); b.classList.toggle('unsure', !res.sure[k]);
    }
    live();
    const unsure = ['sys', 'dia', 'pulse'].filter(k => res[k] != null && !res.sure[k]).length;
    ocrBox.className = 'ocr-msg ' + (unsure || res.pulse == null ? 'warn' : 'ok');
    ocrBox.innerHTML = `<b>Read from photo: ${res.sys}/${res.dia}${res.pulse != null ? ', pulse ' + res.pulse : ''}.</b> Check these match the monitor. Tap a box to correct it.` +
      (unsure ? ' Boxes in orange need a careful look.' : '') + (res.pulse == null ? ' Pulse was not found, please type it.' : '');
  }
  $$('#rf-place button', el).forEach(b => { b.onclick = () => { const was = curPlace; curPlace = b.dataset.p; LS.set('bp.place', curPlace); $$('#rf-place button', el).forEach(x => x.classList.toggle('on', x === b)); if (was !== curPlace && photoBlob && !typed) readPhoto(photoBlob); }; });
  $$('#rf-slot button', el).forEach(b => { b.onclick = () => { curSlot = b.dataset.s; $$('#rf-slot button', el).forEach(x => x.classList.toggle('on', x === b)); }; });
  const live = () => {
    const s = +$('#rf-sys', el).value, d = +$('#rf-dia', el).value, pu = +$('#rf-pul', el).value;
    $('#rf-live', el).innerHTML = (s >= 50 && d >= 30 && s > d) ? `<div class="row"><span class="small muted">Result</span><span class="pill" style="--cat:var(--c-${bpCategory(s, d)})">${CATS[bpCategory(s, d)].label}</span>${pu ? `<span class="pill" style="--cat:var(--c-${PULSE[pulseCategory(pu)].color})">${PULSE[pulseCategory(pu)].label}</span>` : ''}</div>` : '';
  };
  ['#rf-sys', '#rf-dia', '#rf-pul'].forEach(q => $(q, el).addEventListener('input', live)); live();
  $('#rf-sys', el).addEventListener('input', e => { if (e.target.value.length >= 3) $('#rf-dia', el).focus(); });
  $('#rf-dia', el).addEventListener('input', e => { const v = e.target.value; if (v.length >= 3 || (v.length === 2 && +v >= 40)) $('#rf-pul', el).focus(); });

  $('[data-save]', el).onclick = async () => {
    const sys = Math.round(+$('#rf-sys', el).value), dia = Math.round(+$('#rf-dia', el).value);
    const pulse = $('#rf-pul', el).value ? Math.round(+$('#rf-pul', el).value) : null;
    const whenV = $('#rf-when', el).value; const ts = whenV ? new Date(whenV).getTime() : Date.now();
    const err = $('#rf-err', el);
    const bad = !sys || !dia ? 'Enter the top (SYS) and bottom (DIA) numbers.'
      : (sys < 50 || sys > 300) ? 'SYS should be between 50 and 300. Check the number.'
      : (dia < 30 || dia > 200) ? 'DIA should be between 30 and 200. Check the number.'
      : sys <= dia ? 'The top number (SYS) must be bigger than the bottom number (DIA).'
      : (pulse != null && (pulse < 25 || pulse > 250)) ? 'Pulse should be between 25 and 250.'
      : isNaN(ts) ? 'Check the date and time.' : '';
    if (bad) { err.textContent = bad; err.hidden = false; err.scrollIntoView({ block: 'center' }); return; }
    const id = r ? r.id : uid();
    const hasPhoto = photoChanged ? !!photoBlob : !!(r && r.hasPhoto);
    const rec = { id, profileId: p.id, ts, slot: curSlot, place: curPlace, sys, dia, pulse, note: $('#rf-note', el).value.trim(), medTaken: $('#rf-med', el).checked, hasPhoto, created: r ? r.created : Date.now(), updated: Date.now() };
    try {
      if (photoChanged && photoBlob) await DB.put('photos', photoBlob, id);
      if (photoRemoved && !photoBlob) await DB.del('photos', id);
      await DB.put('readings', rec);
    } catch (e2) { err.textContent = 'Could not save: ' + (e2 && e2.message || 'storage error'); err.hidden = false; return; }
    sh.close();
    hkSaveReading(rec);
    await loadReadings(); render();
    if ((!r || r.sys !== rec.sys || r.dia !== rec.dia || r.pulse !== rec.pulse) && checkEmergency(rec, p)) { /* the help screen is open */ }
    else if (!r) resultSheet(rec);
    else toast('Reading updated');
  };
  const del = $('[data-del]', el);
  if (del) del.onclick = async () => {
    if (!(await confirmSheet('Delete reading?', `Delete ${r.sys}/${r.dia} from ${fmtDate(r.ts)}, ${fmtTime(r.ts)}?`, 'Delete', true))) return;
    await DB.del('readings', r.id); await DB.del('photos', r.id);
    hkDeleteReading(r); hkForget(r);
    sh.close(); await loadReadings(); render(); toast('Reading deleted');
  };
}

function resultSheet(r) {
  const c = bpCategory(r.sys, r.dia);
  openSheet({
    title: 'Reading saved',
    body: `<div class="card latest" style="--cat:var(--c-${c})"><div class="reading-big"><span class="v num">${r.sys}/${r.dia}</span><span class="u">mmHg</span>${r.pulse ? `<span class="u num">· ${r.pulse} bpm</span>` : ''}</div><div class="row" style="margin-top:8px"><span class="pill" style="--cat:var(--c-${c})">${CATS[c].label}</span><span class="small muted">${slotLabel(r.slot)} · ${esc(fmtTime(r.ts))}${whereTxt(r)}</span></div>${guideHTML(r)}</div><p class="small muted" style="margin:0">General guidance only. Follow your doctor’s advice.</p>`,
    foot: '<button class="btn primary" data-close>Done</button>'
  });
}

async function readingDetail(id) {
  const r = S.readings.find(x => x.id === id); if (!r) return;
  const c = bpCategory(r.sys, r.dia);
  const sh = openSheet({
    title: fmtDate(r.ts, { weekday: 'short', day: 'numeric', month: 'short' }) + ', ' + fmtTime(r.ts),
    body: `<div id="rd-photo"></div><div class="card latest" style="--cat:var(--c-${c})"><div class="reading-big"><span class="v num">${r.sys}/${r.dia}</span><span class="u">mmHg</span>${r.pulse ? `<span class="u num">· ${r.pulse} bpm</span>` : ''}</div><div class="row" style="margin-top:8px"><span class="pill" style="--cat:var(--c-${c})">${CATS[c].label}</span><span class="small muted">${slotLabel(r.slot)}${whereTxt(r)}${r.note ? ' · ' + esc(r.note) : ''}</span></div>${guideHTML(r)}</div>`,
    foot: '<button class="btn" data-close>Close</button><button class="btn primary" data-edit>Edit</button>'
  });
  if (r.hasPhoto) { const u = await photoURL(r.id); if (u) $('#rd-photo', sh.el).innerHTML = `<div class="photo-zone"><img src="${u}" alt="Monitor photo"></div>`; }
  $('[data-edit]', sh.el).onclick = () => { sh.close(); readingSheet(r); };
}

function guideSheet() {
  const rows = CAT_ORDER.map(k => `<tr><td><span class="pill" style="--cat:var(--c-${k})">${CATS[k].label}</span></td><td class="num">${CATS[k].range}</td></tr>`).join('');
  const sec = k => { const c = CATS[k]; return `<div class="guide-box" style="--cat:var(--c-${k})"><h3>${esc(c.title)}</h3><p>${esc(c.summary)}</p>${c.tips.length ? '<ul>' + c.tips.map(t => `<li>${esc(t)}</li>`).join('') + '</ul>' : ''}${c.urgent ? `<p class="urgent">${esc(c.urgent)}</p>` : ''}</div>`; };
  const ps = k => { const c = PULSE[k]; return `<div class="guide-box" style="--cat:var(--c-${c.color})"><h3>${esc(c.label)}</h3><p>${esc(c.summary)}</p>${c.tips.length ? '<ul>' + c.tips.map(t => `<li>${esc(t)}</li>`).join('') + '</ul>' : ''}${c.urgent ? `<p class="urgent">${esc(c.urgent)}</p>` : ''}</div>`; };
  openSheet({
    title: 'Understanding your readings', full: true,
    body: `<p style="margin:0">A reading has two numbers in mmHg. The top number (SYS, systolic) is pressure when the heart beats. The bottom number (DIA, diastolic) is pressure between beats. If the two numbers fall in different categories, the higher category applies.</p>
      <div class="card tbl-wrap"><table class="ranges"><thead><tr><th>Category</th><th>SYS / DIA (mmHg)</th></tr></thead><tbody>${rows}</tbody></table><p class="small muted" style="margin:10px 0 0">Normal resting pulse for adults is 60–100 beats per minute.</p></div>
      <div class="sec-title">Precautions</div>${CAT_ORDER.map(sec).join('')}${ps('low')}${ps('high')}
      <div class="sec-title">Measuring correctly</div><div class="card"><ul class="tips" style="font-size:.95rem;color:var(--ink)">${MEASURE_TIPS.map(t => `<li>${esc(t)}</li>`).join('')}</ul></div>
      <p class="small muted">Categories from the American Heart Association. This is general information and not a diagnosis. ${esc(EMERGENCY)}</p>`
  });
}

/* ------------------------------------------------------------------ file output */
async function deliverFile(blob, filename, mime, label) {
  if (NATIVE) {
    const dataUrl = await blobToDataURL(blob);
    const res = NATIVE.saveFile(dataUrl.split(',')[1], filename, mime);
    if (res && res.indexOf('ios:') === 0) { toast(label + ' saved in Files \u203A Family Health Tracker'); return; }   // iPhone shows its share sheet
    if (!res || res.indexOf('error') === 0) { toast('Could not save the file. ' + (res || '')); return; }
    const sh = openSheet({ title: label + ' ready', body: `<p style="margin:0">Saved to <b>Downloads › Family Health Tracker</b> as<br><span class="small muted" style="overflow-wrap:anywhere">${esc(filename)}</span></p>`, foot: '<button class="btn" data-open>Open</button><button class="btn primary" data-share>Share</button>' });
    $('[data-open]', sh.el).onclick = () => NATIVE.openFile(res, mime);
    $('[data-share]', sh.el).onclick = () => NATIVE.shareFile(res, mime, filename);
    return;
  }
  const file = new File([blob], filename, { type: mime });
  const url = URL.createObjectURL(blob); S.urls.push(url);
  const canShare = navigator.canShare && navigator.canShare({ files: [file] });
  const sh = openSheet({ title: label + ' ready', body: `<p style="margin:0;overflow-wrap:anywhere">${esc(filename)}</p><p class="small muted" style="margin:0">${canShare ? 'Share it to WhatsApp, Mail or Files, or open it.' : 'Open or save the file.'}</p>`, foot: `<a class="btn" href="${url}" download="${esc(filename)}" target="_blank" rel="noopener">Open</a>${canShare ? '<button class="btn primary" data-share>Share / Save</button>' : ''}` });
  const sb = $('[data-share]', sh.el);
  if (sb) sb.onclick = async () => { try { await navigator.share({ files: [file], title: filename }); } catch (e) { if (e && e.name !== 'AbortError') toast('Sharing failed. Use Open instead.'); } };
}

/* ------------------------------------------------------------------ PDF report */
function reportSheet() {
  const p = cur(); if (!p) return;
  const today = new Date();
  const body = `
    <div class="small muted">Report for <b style="color:var(--ink)">${esc(p.name)}</b></div>
    <div class="field"><span class="lbl">Period</span><div class="seg" id="rp-per"><button data-d="7" class="on">7 days</button><button data-d="30">30 days</button><button data-d="90">90 days</button><button data-d="0">All</button></div></div>
    <div class="grid2"><div class="field"><label for="rp-from">From</label><input class="input" type="date" id="rp-from"></div><div class="field"><label for="rp-to">To</label><input class="input" type="date" id="rp-to" value="${dayKey(today)}"></div></div>
    <label class="check"><input type="checkbox" id="rp-photos"> Include monitor photos</label>
    <label class="check"><input type="checkbox" id="rp-guide" checked> Include guidance and precautions</label>
    <label class="check"><input type="checkbox" id="rp-docs" ${S.docs.some(d => d.isImage) ? 'checked' : ''}> Include test report photos</label>
    <p class="small muted num" id="rp-count" style="margin:0"></p>
    <p class="err" id="rp-err" hidden></p>`;
  const sh = openSheet({ title: 'PDF report', body, foot: '<button class="btn" data-close>Cancel</button><button class="btn primary" data-go>Create PDF</button>' });
  const el = sh.el;
  const setDays = d => {
    const first = S.readings.length ? S.readings[S.readings.length - 1].ts : Date.now();
    const from = d ? new Date(Date.now() - (d - 1) * 864e5) : new Date(first);
    $('#rp-from', el).value = dayKey(from.getTime()); $('#rp-to', el).value = dayKey(Date.now()); count();
  };
  const range = () => { const f = $('#rp-from', el).value, t = $('#rp-to', el).value; return [f ? new Date(f + 'T00:00').getTime() : 0, t ? new Date(t + 'T23:59:59.999').getTime() : Date.now()]; };
  const count = () => { const [a, b] = range(); const n = S.readings.filter(r => r.ts >= a && r.ts <= b).length; $('#rp-count', el).textContent = n + ' reading' + (n === 1 ? '' : 's') + ' in this period'; };
  $$('#rp-per button', el).forEach(b => b.onclick = () => { $$('#rp-per button', el).forEach(x => x.classList.toggle('on', x === b)); setDays(+b.dataset.d); });
  ['#rp-from', '#rp-to'].forEach(q => $(q, el).addEventListener('change', () => { $$('#rp-per button', el).forEach(x => x.classList.remove('on')); count(); }));
  setDays(7);
  $('[data-go]', el).onclick = async () => {
    const [a, b] = range();
    const rs = S.readings.filter(r => r.ts >= a && r.ts <= b).sort((x, y) => x.ts - y.ts);
    const err = $('#rp-err', el);
    if (!rs.length) { err.textContent = 'There are no readings in this period.'; err.hidden = false; return; }
    const btn = $('[data-go]', el); btn.disabled = true; btn.innerHTML = '<span class="busy"></span> Creating…';
    try {
      const blob = await buildPDF(p, rs, a, b, { photos: $('#rp-photos', el).checked, guide: $('#rp-guide', el).checked, docs: $('#rp-docs', el).checked });
      sh.close();
      const fn = `Health Report - ${p.name.replace(/[\\/:*?"<>|]+/g, '').trim() || 'Person'} - ${dayKey(Date.now())}.pdf`;
      await deliverFile(blob, fn, 'application/pdf', 'PDF report');
    } catch (e) { console.error(e); err.textContent = 'Could not create the PDF: ' + (e && e.message || e); err.hidden = false; btn.disabled = false; btn.textContent = 'Create PDF'; }
  };
}

const LATIN = /^[\u0000-ɏ -⁯·]*$/;
function textImage(text, px, color, bold) {
  const c = document.createElement('canvas'); const ctx = c.getContext('2d');
  const font = `${bold ? '700 ' : ''}${px * 4}px system-ui, -apple-system, "Noto Sans Arabic", "Noto Sans", sans-serif`;
  ctx.font = font; const w = Math.ceil(ctx.measureText(text).width) + 8, h = Math.ceil(px * 4 * 1.35);
  c.width = w; c.height = h; ctx.font = font; ctx.fillStyle = color; ctx.textBaseline = 'middle'; ctx.fillText(text, 4, h / 2);
  return { url: c.toDataURL('image/png'), w, h };
}
function hexRGB(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function tint(h, a) { const [r, g, b] = hexRGB(h); return [Math.round(255 - (255 - r) * a), Math.round(255 - (255 - g) * a), Math.round(255 - (255 - b) * a)]; }

const noteText = r => [r.medTaken ? 'Medicine taken' : '', r.note || ''].filter(Boolean).join('; ');

async function buildPDF(...a) { PDF_EN = true; try { return await buildPDF0(...a); } finally { PDF_EN = false; } }
async function buildPDF0(p, rs, from, to, opt) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const W = 210, M = 14;
  const INK = [15, 35, 40], MUTED = [88, 112, 118], ACC = [11, 110, 105], LINE = [214, 225, 223];
  const put = (txt, x, y, size, color, bold, align) => {
    txt = String(txt);
    if (LATIN.test(txt)) { doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); doc.setTextColor(...color); doc.text(txt, x, y, align ? { align } : undefined); return; }
    const im = textImage(txt, size, `rgb(${color.join(',')})`, bold); const hmm = size * 0.3528 * 1.35; const wmm = hmm * im.w / im.h;
    const xx = align === 'right' ? x - wmm : align === 'center' ? x - wmm / 2 : x;
    doc.addImage(im.url, 'PNG', xx, y - hmm * 0.72, wmm, hmm);
  };
  const nl = {
    didParseCell: d => { if (d.section === 'body') { const t = String(d.cell.raw == null ? '' : d.cell.raw); if (t && !LATIN.test(t)) { d.cell._nl = t; d.cell.text = ['']; } } },
    didDrawCell: d => {
      if (!d.cell._nl) return;
      const im = textImage(d.cell._nl, 8.5, 'rgb(15,35,40)'); const h = 3.8; let w = h * im.w / im.h; const mw = d.cell.width - 2; const hh = w > mw ? h * mw / w : h; w = Math.min(w, mw);
      doc.addImage(im.url, 'PNG', d.cell.x + 1, d.cell.y + (d.cell.height - hh) / 2, w, hh);
    }
  };

  // header band
  doc.setFillColor(...ACC); doc.rect(0, 0, W, 30, 'F');
  put('Family Health Report', M, 14, 19, [255, 255, 255], true);
  put('Family Health Tracker  ·  Blood pressure, sugar, thyroid and more', M, 22, 9.5, [210, 238, 234]);
  put('Generated ' + fmtDate(Date.now(), { day: 'numeric', month: 'long', year: 'numeric' }) + ', ' + fmtTime(Date.now()), W - M, 22, 9, [210, 238, 234], false, 'right');

  // patient block
  let y = 41;
  if (p.hasPhoto) { const pb = await DB.get('docfiles', 'pp_' + p.id); if (pb) { const pdu = await blobToDataURL(pb); doc.addImage(pdu, 'JPEG', W - M - 22, y - 6, 22, 22); doc.setDrawColor(...LINE); doc.rect(W - M - 22, y - 6, 22, 22, 'S'); } }
  put(p.name, M, y, 16, INK, true);
  const b = bmi(p);
  const det = [p.age ? 'Age ' + p.age : null, p.height ? 'Height ' + p.height + ' cm' : null, p.weight ? 'Weight ' + p.weight + ' kg' : null, b ? 'BMI ' + b.toFixed(1) + ' (' + bmiLabel(b) + ')' : null].filter(Boolean).join('    ');
  y += 7; put(det || 'No personal details entered', M, y, 10, MUTED);
  y += 6; put('Period: ' + fmtDate(from, { day: 'numeric', month: 'short', year: 'numeric' }) + ' – ' + fmtDate(to, { day: 'numeric', month: 'short', year: 'numeric' }) + '    Readings: ' + rs.length, M, y, 10, MUTED);

  // medicines
  const meds = (await DB.byProfile(p.id, 'meds')).filter(m => m.active).sort((a, b) => a.created - b.created);
  y += 8; put('Current medicines', M, y, 10.5, INK, true);
  if (!meds.length) { y += 5; put('None recorded in the app', M, y, 9, MUTED); }
  else {
    doc.autoTable(Object.assign({
      startY: y + 1.5, head: [['Medicine', 'Dose', 'When', 'Notes']], body: meds.map(m => [m.name, m.dose || '', medTimesText(m), m.notes || '']),
      margin: { left: M, right: M, bottom: 20 }, theme: 'striped',
      styles: { fontSize: 8.5, cellPadding: 1.4, textColor: INK }, headStyles: { fillColor: [217, 238, 235], textColor: ACC, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [246, 249, 248] }, columnStyles: { 0: { fontStyle: 'bold', cellWidth: 48 }, 1: { cellWidth: 32 }, 2: { cellWidth: 45 } }
    }, nl));
    y = doc.lastAutoTable.finalY - 1;
  }

  // upcoming appointments
  const upA = upcomingAppts(await DB.byProfile(p.id, 'appts')).slice(0, 5);
  if (upA.length) {
    y += 8; put('Upcoming appointments', M, y, 10.5, INK, true);
    doc.autoTable(Object.assign({ startY: y + 1.5, head: [['When', 'What', 'Place']], body: upA.map(a => [apptWhen(a), a.title || apptKindLabel(a.kind), a.place || '']), margin: { left: M, right: M, bottom: 20 }, theme: 'striped',
      styles: { fontSize: 8.5, cellPadding: 1.4, textColor: INK }, headStyles: { fillColor: [217, 238, 235], textColor: ACC, fontStyle: 'bold' }, alternateRowStyles: { fillColor: [246, 249, 248] }, columnStyles: { 0: { cellWidth: 70 } } }, nl));
    y = doc.lastAutoTable.finalY - 1;
  }

  const pr = rs.filter(r => r.pulse);
  if (rs.length) {   // blood pressure summary (skipped for people who do not track blood pressure)
  // summary tiles
  y += 7;
  const sA = Math.round(avg(rs.map(r => r.sys))), dA = Math.round(avg(rs.map(r => r.dia)));
  const pA = pr.length ? Math.round(avg(pr.map(r => r.pulse))) : null;
  const hi = rs.reduce((m, r) => (r.sys > m.sys || (r.sys === m.sys && r.dia > m.dia) ? r : m), rs[0]);
  const lo = rs.reduce((m, r) => (r.sys < m.sys || (r.sys === m.sys && r.dia < m.dia) ? r : m), rs[0]);
  const avgCat = bpCategory(sA, dA);
  const tiles = [
    ['Average BP', sA + '/' + dA, 'mmHg · ' + CATS[avgCat].label, CAT_HEX[avgCat]],
    ['Average pulse', pA ? String(pA) : '–', 'beats per minute', null],
    ['Highest', hi.sys + '/' + hi.dia, fmtDate(hi.ts, { day: 'numeric', month: 'short' }) + ' ' + fmtTime(hi.ts), CAT_HEX[bpCategory(hi.sys, hi.dia)]],
    ['Lowest', lo.sys + '/' + lo.dia, fmtDate(lo.ts, { day: 'numeric', month: 'short' }) + ' ' + fmtTime(lo.ts), CAT_HEX[bpCategory(lo.sys, lo.dia)]]
  ];
  const tw = (W - 2 * M - 9) / 4;
  tiles.forEach((t, i) => {
    const x = M + i * (tw + 3);
    doc.setDrawColor(...LINE); doc.setFillColor(246, 249, 248); doc.roundedRect(x, y, tw, 24, 2, 2, 'FD');
    if (t[3]) { doc.setFillColor(...hexRGB(t[3])); doc.rect(x, y + 2, 1.4, 20, 'F'); }
    put(t[0].toUpperCase(), x + 4, y + 6, 7, MUTED, true);
    put(t[1], x + 4, y + 14.5, 15, INK, true);
    put(t[2], x + 4, y + 20.5, 7, MUTED);
  });
  y += 30;

  // session averages + category counts
  const ses = SLOTS.map(s => { const a = rs.filter(r => r.slot === s.k); return a.length ? `${s.l}: ${Math.round(avg(a.map(r => r.sys)))}/${Math.round(avg(a.map(r => r.dia)))} (${a.length})` : `${s.l}: –`; }).join('     ');
  put('Average by time of day   ' + ses, M, y, 9, INK);
  const byPlace = PLACES.map(pl => { const a = rs.filter(r => (r.place || 'home') === pl.k); return a.length ? `${pl.l}: ${Math.round(avg(a.map(r => r.sys)))}/${Math.round(avg(a.map(r => r.dia)))} (${a.length})` : ''; }).filter(Boolean);
  if (byPlace.length > 1) { y += 5; put('Average by place   ' + byPlace.join('     '), M, y, 9, INK); }
  { const ins = await bpInsights(p, from, to);
    if (ins.length) { y += 6; put('Patterns in these readings (associations, not proof of cause)', M, y, 9, INK, true);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
      for (const i of ins) { for (const l of doc.splitTextToSize('\u2022 ' + i.t, 180)) { y += 4.2; put(l, M + 1, y, 8.5, INK); } } } }
  }
  if (p.trackSugar) { // sugar on page 1
    const sg = (await DB.byProfile(p.id, 'sugar')).filter(g => g.ts >= from && g.ts <= to), u = p.sugarUnit || 'mg/dL';
    if (sg.length) { const f = sg.filter(g => g.timing === 'fasting'); y += 5; put(`Blood sugar   ${sg.length} readings${f.length ? `  \u00B7  fasting average ${toUnit(avg(f.map(g => g.mg)), u)} ${u}` : ''}  \u00B7  ${sg.filter(g => g.mg < 70).length} low  (details on the Blood sugar page)`, M, y, 9, INK); }
  }
  { // walking on page 1
    const sd = await stepsByDay(p.id); const vals = [];
    for (let t = new Date(from).setHours(12, 0, 0, 0); t <= to; t += 864e5) { const e = sd.get(dayKey(t)); if (e && e.total > 0) vals.push(e.total); }
    const wl = pdfWatchLine(p, from, to); if (wl) { y += 5; put(wl, M, y, 9, INK); }
    if (vals.length) { y += 5; put(`Walking   average ${fmtN(avg(vals))} steps a day over ${vals.length} day${vals.length > 1 ? 's' : ''}  \u00B7  ${vals.filter(v => v >= STEP_GOAL).length} day(s) reached ${fmtN(STEP_GOAL)} steps  (details on the Walking page)`, M, y, 9, INK); }
  }
  const counts = {}; rs.forEach(r => { const k = bpCategory(r.sys, r.dia); counts[k] = (counts[k] || 0) + 1; });
  if (rs.length) {
  y += 6;
  let cx = M;
  CAT_ORDER.forEach(k => {
    const label = CATS[k].label + ': ' + (counts[k] || 0);
    doc.setFillColor(...hexRGB(CAT_HEX[k])); doc.circle(cx + 1.5, y - 1.1, 1.5, 'F');
    put(label, cx + 4.5, y, 8.5, INK); doc.setFontSize(8.5); cx += doc.getTextWidth(label) + 10;
  });
  y += 6;

  // chart
  if (y + 90 > 280) { doc.addPage(); y = 20; }
  const cH = 62, cX = M + 10, cW = W - M - cX, cY = y;
  doc.setDrawColor(...LINE); doc.setFillColor(255, 255, 255); doc.roundedRect(M, cY - 2, W - 2 * M, cH + 12, 2, 2, 'S');
  const vLo = Math.min(50, ...rs.map(r => r.dia)) - 5, vHi = Math.max(160, ...rs.map(r => r.sys)) + 5;
  const t0 = rs[0].ts, t1 = rs[rs.length - 1].ts;
  const px = t => cX + 4 + (cW - 10) * (t1 > t0 ? (t - t0) / (t1 - t0) : 0.5);
  const py = v => cY + 2 + (cH - 4) * (1 - (v - vLo) / (vHi - vLo));
  doc.setLineWidth(0.2);
  for (let v = Math.ceil(vLo / 20) * 20; v <= vHi; v += 20) { doc.setDrawColor(...LINE); doc.line(cX, py(v), cX + cW - 4, py(v)); put(String(v), cX - 2, py(v) + 1.1, 7, MUTED, false, 'right'); }
  doc.setDrawColor(...MUTED); doc.setLineDashPattern([1.2, 1.2], 0); [120, 80].forEach(v => doc.line(cX, py(v), cX + cW - 4, py(v))); doc.setLineDashPattern([], 0);
  const series = (k, col) => {
    doc.setDrawColor(...col); doc.setLineWidth(0.5);
    for (let i = 1; i < rs.length; i++) doc.line(px(rs[i - 1].ts), py(rs[i - 1][k]), px(rs[i].ts), py(rs[i][k]));
    doc.setFillColor(...col); rs.forEach(r => doc.circle(px(r.ts), py(r[k]), rs.length > 60 ? 0.5 : 0.9, 'F'));
  };
  series('sys', hexRGB(CAT_HEX.stage2)); series('dia', hexRGB(CAT_HEX.low));
  if (pr.length) { doc.setDrawColor(150, 150, 150); doc.setLineWidth(0.25); doc.setLineDashPattern([0.6, 0.8], 0); for (let i = 1; i < pr.length; i++) doc.line(px(pr[i - 1].ts), py(pr[i - 1].pulse), px(pr[i].ts), py(pr[i].pulse)); doc.setLineDashPattern([], 0); }
  const ly = cY + cH + 6.5;
  put(fmtDate(t0, { day: 'numeric', month: 'short' }), cX, ly, 7, MUTED);
  put(fmtDate(t1, { day: 'numeric', month: 'short' }), cX + cW - 4, ly, 7, MUTED, false, 'right');
  const leg = [[CAT_HEX.stage2, 'Systolic'], [CAT_HEX.low, 'Diastolic'], ['#969696', 'Pulse'], ['#587076', '120/80 guide']];
  let lx = W / 2 - 38; leg.forEach(([c, t]) => { doc.setDrawColor(...hexRGB(c)); doc.setLineWidth(0.7); doc.line(lx, ly - 1, lx + 5, ly - 1); put(t, lx + 6.5, ly, 7, MUTED); lx += 22; });
  y = cY + cH + 14;

  // table
  const body = rs.slice().reverse().map(r => {
    const k = bpCategory(r.sys, r.dia), pk = pulseCategory(r.pulse);
    return [fmtDate(r.ts, { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }), fmtTime(r.ts), slotLabel(r.slot) + (r.place && r.place !== 'home' ? '\n' + placeLabel(r.place) : ''), r.sys + '/' + r.dia, r.pulse ? r.pulse + (pk && pk !== 'normal' ? (pk === 'low' ? ' (low)' : ' (high)') : '') : '–', CATS[k].label, noteText(r)];
  });
  const cats = rs.slice().reverse().map(r => bpCategory(r.sys, r.dia));
  const notes = rs.slice().reverse().map(noteText);
  doc.autoTable({
    startY: y, head: [['Date', 'Time', 'Session', 'BP (mmHg)', 'Pulse', 'Category', 'Note']], body,
    margin: { left: M, right: M, bottom: 20 }, theme: 'grid',
    styles: { font: 'helvetica', fontSize: 8.3, cellPadding: 1.8, textColor: INK, lineColor: LINE, lineWidth: 0.15, valign: 'middle' },
    headStyles: { fillColor: ACC, textColor: [255, 255, 255], fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 30 }, 1: { cellWidth: 17 }, 2: { cellWidth: 19 }, 3: { cellWidth: 21, fontStyle: 'bold', halign: 'center' }, 4: { cellWidth: 17, halign: 'center' }, 5: { cellWidth: 26 }, 6: { cellWidth: 'auto' } },
    didParseCell: d => {
      if (d.section !== 'body') return;
      const k = cats[d.row.index];
      if (d.column.index === 3 || d.column.index === 5) { d.cell.styles.fillColor = tint(CAT_HEX[k], 0.16); d.cell.styles.textColor = hexRGB(CAT_HEX[k]); d.cell.styles.fontStyle = 'bold'; }
      if (d.column.index === 6 && notes[d.row.index] && !LATIN.test(notes[d.row.index])) d.cell.text = [''];
    },
    didDrawCell: d => {
      if (d.section === 'body' && d.column.index === 6) {
        const n = notes[d.row.index];
        if (n && !LATIN.test(n)) { const im = textImage(n, 8, 'rgb(15,35,40)'); const h = 3.6; let w = h * im.w / im.h; const mw = d.cell.width - 2; const hh = w > mw ? h * mw / w : h; w = Math.min(w, mw); doc.addImage(im.url, 'PNG', d.cell.x + 1, d.cell.y + (d.cell.height - hh) / 2, w, hh); }
      }
    }
  });
  }

  // guidance
  if (opt.guide && rs.length) {
    doc.addPage(); y = 20;
    put('Understanding the readings', M, y, 15, INK, true); y += 6;
    put('Categories follow the American Heart Association. If SYS and DIA fall in different categories, the higher one applies.', M, y, 8.5, MUTED); y += 4;
    doc.autoTable({
      startY: y, head: [['Category', 'SYS / DIA (mmHg)', 'Readings in this report']],
      body: CAT_ORDER.map(k => [CATS[k].label, CATS[k].range, String(counts[k] || 0)]),
      margin: { left: M, right: M, bottom: 20 }, theme: 'grid',
      styles: { fontSize: 9, cellPadding: 2, textColor: INK, lineColor: LINE, lineWidth: 0.15 }, headStyles: { fillColor: ACC, textColor: [255, 255, 255] },
      didParseCell: d => { if (d.section === 'body' && d.column.index === 0) { const k = CAT_ORDER[d.row.index]; d.cell.styles.textColor = hexRGB(CAT_HEX[k]); d.cell.styles.fontStyle = 'bold'; d.cell.styles.fillColor = tint(CAT_HEX[k], 0.14); } }
    });
    y = doc.lastAutoTable.finalY + 8;
    const present = CAT_ORDER.filter(k => counts[k]);
    const pulses = new Set(rs.map(r => pulseCategory(r.pulse)).filter(k => k && k !== 'normal'));
    put('Precautions for the categories seen in this period', M, y, 12, INK, true); y += 6;
    const block = (title, color, summary, tips, urgent) => {
      const lines = [];
      doc.setFontSize(8.8);
      const wrap = t => doc.splitTextToSize(t, W - 2 * M - 10);
      const sum = wrap(summary); const tl = tips.map(t => wrap('•  ' + t)); doc.setFont('helvetica', 'bold'); const ur = urgent ? wrap(urgent) : []; doc.setFont('helvetica', 'normal');
      const h = 8 + sum.length * 4 + tl.reduce((a, l) => a + l.length * 4, 0) + (ur.length ? ur.length * 4 + 2 : 0) + 3;
      if (y + h > 280) { doc.addPage(); y = 20; }
      doc.setFillColor(...tint(color, 0.09)); doc.setDrawColor(...tint(color, 0.4)); doc.roundedRect(M, y, W - 2 * M, h, 2, 2, 'FD');
      doc.setFillColor(...hexRGB(color)); doc.rect(M, y + 2, 1.4, h - 4, 'F');
      let yy = y + 6; put(title, M + 5, yy, 10.5, hexRGB(color), true); yy += 5;
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.8); doc.setTextColor(...INK);
      doc.text(sum, M + 5, yy); yy += sum.length * 4;
      tl.forEach(l => { doc.text(l, M + 5, yy); yy += l.length * 4; });
      if (ur.length) { yy += 1; doc.setFont('helvetica', 'bold'); doc.setTextColor(...hexRGB(CAT_HEX.crisis)); doc.text(ur, M + 5, yy); }
      y += h + 4; return lines;
    };
    present.forEach(k => { const c = CATS[k]; block(c.title, CAT_HEX[k], c.summary, c.tips, c.urgent); });
    pulses.forEach(k => { const c = PULSE[k]; block(c.label, CAT_HEX[c.color], c.summary, c.tips, c.urgent); });
    block('How to measure correctly', '#0B6E69', 'Following these steps makes readings accurate and comparable.', MEASURE_TIPS, null);
  }

  // blood sugar (only for people who track it)
  const sgs = (await DB.byProfile(p.id, 'sugar')).filter(g => g.ts >= from && g.ts <= to).sort((a, b) => a.ts - b.ts);
  if (sgs.length) {
    const u = p.sugarUnit || 'mg/dL';
    doc.addPage(); y = 20;
    put('Blood sugar', M, y, 15, INK, true); y += 6;
    const byT = SG_TIMES.map(t => { const a = sgs.filter(g => g.timing === t.k); return a.length ? `${t.l}: avg ${toUnit(avg(a.map(g => g.mg)), u)} (${a.length})` : ''; }).filter(Boolean);
    const lows = sgs.filter(g => g.mg < 70).length, highs = sgs.filter(g => ['high', 'vhigh'].includes(sgCategory(g.mg, g.timing))).length;
    put(`${sgs.length} readings in ${u}.  ${byT.join('   ')}`, M, y, 9, INK); y += 5;
    put(`Low readings (below ${u === 'mmol/L' ? '3.9' : '70'}): ${lows}    High readings: ${highs}`, M, y, 9, lows ? hexRGB(CAT_HEX.low) : INK, !!lows); y += 4;
    // chart with the in-range band
    const cY = y + 2, cH = 48, cX = M + 12, cW = W - M - cX;
    const vals = sgs.map(g => toUnit(g.mg, u)), vLo = Math.min(u === 'mmol/L' ? 3 : 50, ...vals) * 0.9, vHi = Math.max(u === 'mmol/L' ? 11 : 200, ...vals) * 1.05;
    const t0 = sgs[0].ts, t1 = sgs[sgs.length - 1].ts;
    const px = t => cX + 3 + (cW - 6) * (t1 > t0 ? (t - t0) / (t1 - t0) : 0.5), py = v => cY + cH - cH * (v - vLo) / (vHi - vLo);
    doc.setFillColor(...tint(CAT_HEX.normal, 0.12)); const bLo = toUnit(70, u), bHi = toUnit(140, u); doc.rect(cX, py(bHi), cW, py(bLo) - py(bHi), 'F');
    doc.setDrawColor(...LINE); doc.setLineWidth(0.2); const step = u === 'mmol/L' ? 2 : 50;
    for (let v = Math.ceil(vLo / step) * step; v <= vHi; v += step) { doc.line(cX, py(v), cX + cW, py(v)); put(String(v), cX - 2, py(v) + 1, 6.5, MUTED, false, 'right'); }
    doc.setDrawColor(...hexRGB('#6B4FA0')); doc.setLineWidth(0.4); for (let i = 1; i < sgs.length; i++) doc.line(px(sgs[i - 1].ts), py(vals[i - 1]), px(sgs[i].ts), py(vals[i]));
    sgs.forEach((g, i) => { doc.setFillColor(...hexRGB(SG_HEX[sgCategory(g.mg, g.timing)])); doc.circle(px(g.ts), py(vals[i]), 1, 'F'); });
    put(fmtDate(t0, { day: 'numeric', month: 'short' }), cX, cY + cH + 4.5, 7, MUTED); put(fmtDate(t1, { day: 'numeric', month: 'short' }), cX + cW, cY + cH + 4.5, 7, MUTED, false, 'right');
    put('Green band: ' + toUnit(70, u) + '\u2013' + toUnit(140, u) + ' ' + u, W / 2, cY + cH + 4.5, 7, MUTED, false, 'center');
    y = cY + cH + 9;
    const sk = sgs.map(g => sgCategory(g.mg, g.timing)).reverse();
    doc.autoTable(Object.assign({
      startY: y, head: [['Date', 'Time', 'When', 'Sugar (' + u + ')', 'Result', 'Note']],
      body: sgs.slice().reverse().map(g => [fmtDate(g.ts, { weekday: 'short', day: '2-digit', month: 'short' }), fmtTime(g.ts), sgTimeLabel(g.timing), String(toUnit(g.mg, u)), SG_CATS[sgCategory(g.mg, g.timing)].label, g.note || '']),
      margin: { left: M, right: M, bottom: 20 }, theme: 'grid',
      styles: { fontSize: 8.5, cellPadding: 1.6, textColor: INK, lineColor: LINE, lineWidth: 0.15 }, headStyles: { fillColor: ACC, textColor: [255, 255, 255] },
      columnStyles: { 3: { fontStyle: 'bold', halign: 'center' } },
      didParseCell: d => { if (d.section === 'body' && (d.column.index === 3 || d.column.index === 4)) { const hx = SG_HEX[sk[d.row.index]]; d.cell.styles.textColor = hexRGB(hx); d.cell.styles.fillColor = tint(hx, 0.12); d.cell.styles.fontStyle = 'bold'; } }
    }, nl));
    // precautions for the categories seen
    let ay = doc.lastAutoTable.finalY + 8;
    for (const k of ['vlow', 'low', 'high', 'vhigh', 'raised']) {
      if (!sk.includes(k)) continue; const c = SG_CATS[k];
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.8);
      const lines = c.tips.flatMap(t => doc.splitTextToSize('\u2022  ' + t, W - 2 * M - 10)); doc.setFont('helvetica', 'bold'); const ur = c.urgent ? doc.splitTextToSize(c.urgent, W - 2 * M - 10) : []; doc.setFont('helvetica', 'normal');
      const hh = 10 + lines.length * 4 + ur.length * 4 + (ur.length ? 2 : 0);
      if (ay + hh > 280) { doc.addPage(); ay = 20; }
      const hx = SG_HEX[k]; doc.setFillColor(...tint(hx, 0.08)); doc.setDrawColor(...tint(hx, 0.4)); doc.roundedRect(M, ay, W - 2 * M, hh, 2, 2, 'FD'); doc.setFillColor(...hexRGB(hx)); doc.rect(M, ay + 2, 1.4, hh - 4, 'F');
      put(c.title, M + 5, ay + 5.5, 10, hexRGB(hx), true);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.8); doc.setTextColor(...INK); doc.text(lines, M + 5, ay + 10.5);
      if (ur.length) { doc.setFont('helvetica', 'bold'); doc.setTextColor(...hexRGB(CAT_HEX.crisis)); doc.text(ur, M + 5, ay + 11.5 + lines.length * 4); }
      ay += hh + 3;
    }
    put('Ranges are general adult values. People with diabetes may have personal targets from their doctor.', M, Math.min(ay + 2, 280), 7.5, MUTED);
  }

  // thyroid (only for people who track it)
  if (p.trackThyroid) {
    const tp = (await thyPoints(p.id)).slice().reverse();
    const tmeds = (await DB.byProfile(p.id, 'meds')).filter(m => THY_MED.test(m.name));
    if (tp.length || tmeds.length) {
      doc.addPage(); y = 20;
      put('Thyroid', M, y, 15, INK, true); y += 6;
      if (tmeds.length) { put('Thyroid medicines: ' + tmeds.map(m => `${m.name}${m.dose ? ' ' + m.dose : ''}${m.active ? '' : ' (stopped)'}${m.start ? ' since ' + m.start : ''}`).join('; '), M, y, 9, INK); y += 5; }
      if (p.thyNext && p.thyNext.date) { put('Next thyroid blood test: ' + fmtDate(new Date(p.thyNext.date + 'T12:00').getTime(), { day: 'numeric', month: 'long', year: 'numeric' }), M, y, 9, INK); y += 5; }
      const withTsh = tp.filter(t => t.tsh);
      if (withTsh.length >= 2) {
        const cY = y + 2, cH = 40, cX = M + 12, cW = W - M - cX;
        const vs = withTsh.map(t => t.tsh.value), vHi = Math.max(6, ...vs) * 1.1;
        const ts = withTsh.map(t => new Date(t.date + 'T12:00').getTime()), t0 = ts[0], t1 = ts[ts.length - 1];
        const px = t => cX + 3 + (cW - 6) * (t1 > t0 ? (t - t0) / (t1 - t0) : 0.5), py = v => cY + cH - cH * v / vHi;
        doc.setFillColor(...tint(CAT_HEX.normal, 0.12)); doc.rect(cX, py(4.5), cW, py(0.4) - py(4.5), 'F');
        doc.setDrawColor(...LINE); doc.setLineWidth(0.2); for (let v = 0; v <= vHi; v += vHi > 12 ? 5 : 2) { doc.line(cX, py(v), cX + cW, py(v)); put(String(v), cX - 2, py(v) + 1, 6.5, MUTED, false, 'right'); }
        doc.setDrawColor(...ACC); doc.setLineWidth(0.5); for (let i = 1; i < vs.length; i++) doc.line(px(ts[i - 1]), py(vs[i - 1]), px(ts[i]), py(vs[i]));
        vs.forEach((v, i) => { const f = thyRate('tsh', v, 'mIU/L').flag; doc.setFillColor(...hexRGB(f === 'normal' ? CAT_HEX.normal : f === 'low' ? CAT_HEX.low : CAT_HEX.stage2)); doc.circle(px(ts[i]), py(v), 1.1, 'F'); });
        put('TSH (mIU/L) over time \u00B7 green band 0.4\u20134.5', W / 2, cY + cH + 4.5, 7, MUTED, false, 'center');
        y = cY + cH + 9;
      }
      if (tp.length) {
        const fl = [];
        doc.autoTable({
          startY: y, head: [['Test date', 'TSH', 'Free T4', 'Free T3', 'From', 'Note']],
          body: tp.slice().reverse().map(t => { const row = [fmtDate(new Date(t.date + 'T12:00').getTime(), { day: '2-digit', month: 'short', year: 'numeric' })]; const f = []; for (const k of THY_KEYS) { const x = t[k.k]; row.push(x ? `${x.value} ${x.unit}` : '\u2013'); f.push(x ? (x.flag || thyRate(k.k, x.value, x.unit).flag) : 'normal'); } fl.push(f); row.push(t.src === 'report' ? (t.title || 'Report') : 'Entered'); row.push(t.note || ''); return row; }),
          margin: { left: M, right: M, bottom: 20 }, theme: 'grid', styles: { fontSize: 8.8, cellPadding: 1.8, textColor: INK, lineColor: LINE, lineWidth: 0.15 }, headStyles: { fillColor: ACC, textColor: [255, 255, 255] },
          didParseCell: d => { if (d.section === 'body' && d.column.index >= 1 && d.column.index <= 3) { const f = fl[d.row.index][d.column.index - 1]; if (f !== 'normal') { const hx = f === 'low' ? CAT_HEX.low : CAT_HEX.stage2; d.cell.styles.textColor = hexRGB(hx); d.cell.styles.fillColor = tint(hx, 0.12); d.cell.styles.fontStyle = 'bold'; } } }
        });
        y = doc.lastAutoTable.finalY + 6;
      }
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.8); doc.setTextColor(...INK);
      const tips = ['Take thyroid tablets at the same time every day on an empty stomach, 30\u201360 minutes before breakfast.', 'Keep 4 hours between thyroid tablets and calcium, iron, antacids or multivitamins.', 'Recheck TSH 6\u20138 weeks after any dose change; once stable, every 6\u201312 months.', 'An overactive thyroid or too high a dose can raise pulse and blood pressure.'];
      const lines = tips.flatMap(t => doc.splitTextToSize('\u2022  ' + t, W - 2 * M - 10)); const hh = 10 + lines.length * 4;
      if (y + hh > 280) { doc.addPage(); y = 20; }
      doc.setFillColor(...tint('#0B6E69', 0.08)); doc.setDrawColor(...tint('#0B6E69', 0.4)); doc.roundedRect(M, y, W - 2 * M, hh, 2, 2, 'FD');
      put('Thyroid precautions', M + 5, y + 5.5, 10, ACC, true); doc.setFont('helvetica', 'normal'); doc.setFontSize(8.8); doc.setTextColor(...INK); doc.text(lines, M + 5, y + 10.5);
    }
  }

  // walking steps
  const stepDays = []; const sAll = await stepsByDay(p.id);
  for (let t = new Date(from).setHours(12, 0, 0, 0); t <= to; t += 864e5) { const e = sAll.get(dayKey(t)); if (e && e.total > 0) stepDays.push(e); }
  if (stepDays.length) {
    doc.addPage(); y = 20;
    put('Walking (steps)', M, y, 15, INK, true); y += 6;
    const tot = stepDays.map(e => e.total), avgS = avg(tot), best = stepDays.reduce((a, b) => (b.total > a.total ? b : a));
    const goalDays = stepDays.filter(e => e.total >= STEP_GOAL).length;
    put(`Average ${fmtN(avgS)} steps a day over ${stepDays.length} day${stepDays.length > 1 ? 's' : ''}. Most active: ${fmtDate(new Date(best.day + 'T12:00').getTime(), { day: 'numeric', month: 'short' })} (${fmtN(best.total)}). ${goalDays} day${goalDays === 1 ? '' : 's'} reached ${fmtN(STEP_GOAL)} steps.`, M, y, 9, MUTED); y += 4;
    // bar chart
    const cY = y + 2, cH = 46, cX = M + 12, cW = W - M - cX;
    const mxS = Math.max(STEP_GOAL * 1.2, ...tot);
    const daysList = []; for (let t = new Date(from).setHours(12, 0, 0, 0); t <= to; t += 864e5) daysList.push(dayKey(t));
    const bw = cW / Math.max(1, daysList.length);
    doc.setDrawColor(...LINE); doc.setLineWidth(0.2);
    for (let v = 0; v <= mxS; v += mxS > 15000 ? 5000 : 2500) { const yy = cY + cH - cH * v / mxS; doc.line(cX, yy, cX + cW, yy); put(fmtN(v), cX - 2, yy + 1, 6.5, MUTED, false, 'right'); }
    daysList.forEach((d, i) => { const e = sAll.get(d); if (!e || !e.total) return; const h = cH * e.total / mxS; doc.setFillColor(...(e.total >= STEP_GOAL ? hexRGB(CAT_HEX.normal) : ACC)); doc.rect(cX + i * bw + bw * 0.15, cY + cH - h, Math.max(0.4, bw * 0.7), h, 'F'); });
    const gy = cY + cH - cH * STEP_GOAL / mxS; doc.setDrawColor(...MUTED); doc.setLineDashPattern([1.2, 1.2], 0); doc.line(cX, gy, cX + cW, gy); doc.setLineDashPattern([], 0);
    put(fmtDate(from, { day: 'numeric', month: 'short' }), cX, cY + cH + 4.5, 7, MUTED); put(fmtDate(to, { day: 'numeric', month: 'short' }), cX + cW, cY + cH + 4.5, 7, MUTED, false, 'right');
    y = cY + cH + 9;
    // BP on active vs less active days
    const bpDay = d => { const r = rs.filter(x => dayKey(x.ts) === d); return r.length ? [avg(r.map(x => x.sys)), avg(r.map(x => x.dia))] : null; };
    const paired = stepDays.map(e => ({ e, bp: bpDay(e.day) })).filter(x => x.bp);
    if (paired.length >= 6) {
      const sorted = paired.map(x => x.e.total).sort((a, b) => a - b); const cut = paired.filter(x => x.e.total >= STEP_GOAL).length >= 3 && paired.filter(x => x.e.total < STEP_GOAL).length >= 3 ? STEP_GOAL : sorted[Math.floor(sorted.length / 2)];
      const hiG = paired.filter(x => x.e.total >= cut), loG = paired.filter(x => x.e.total < cut);
      if (hiG.length >= 3 && loG.length >= 3) {
        const m = g => Math.round(avg(g.map(x => x.bp[0]))) + '/' + Math.round(avg(g.map(x => x.bp[1])));
        put(`Average BP on days with ${fmtN(cut)}+ steps: ${m(hiG)} (${hiG.length} days).  On days with fewer steps: ${m(loG)} (${loG.length} days).`, M, y, 9, INK, true); y += 3;
      }
    }
    doc.autoTable({
      startY: y + 1, head: [['Date', 'Morning', 'Afternoon', 'Evening', 'Total steps', 'Average BP that day']],
      body: stepDays.slice().reverse().map(e => { const b = bpDay(e.day); return [fmtDate(new Date(e.day + 'T12:00').getTime(), { weekday: 'short', day: '2-digit', month: 'short' }), e.auto ? fmtN(e.morning) : '\u2013', e.auto ? fmtN(e.afternoon) : '\u2013', e.auto ? fmtN(e.evening) : '\u2013', fmtN(e.total) + (e.manual ? ' (entered)' : ''), b ? Math.round(b[0]) + '/' + Math.round(b[1]) : '\u2013']; }),
      margin: { left: M, right: M, bottom: 20 }, theme: 'grid',
      styles: { fontSize: 8.5, cellPadding: 1.6, textColor: INK, lineColor: LINE, lineWidth: 0.15, halign: 'center' }, headStyles: { fillColor: ACC, textColor: [255, 255, 255] },
      columnStyles: { 0: { halign: 'left' }, 4: { fontStyle: 'bold' } }
    });
  }

  await pdfWatchPage({ doc, put, M, INK, MUTED, ACC, LINE }, p, from, to);
  await pdfWbpPage({ doc, put, M, INK, MUTED, ACC, LINE }, p, from, to, rs);
  await pdfVitalsPage({ doc, put, M, INK, MUTED, ACC, LINE }, p, from, to);
  await pdfCondPage({ doc, put, M, INK, MUTED, ACC, LINE }, p, from, to);

  // test reports
  const docsAll = (await DB.byProfile(p.id, 'docs')).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  if (docsAll.length) {
    doc.addPage(); y = 20;
    put('Test reports', M, y, 15, INK, true); y += 5.5;
    put('Reports uploaded to the app for ' + p.name + '. PDF files are kept in the app and can be shared from there.', M, y, 8.5, MUTED); y += 3;
    doc.autoTable(Object.assign({
      startY: y, head: [['Test date', 'Report', 'Type', 'Notes']],
      body: docsAll.map(d => [d.date ? fmtDate(new Date(d.date + 'T12:00').getTime(), { day: '2-digit', month: 'short', year: 'numeric' }) : '', d.title, d.isImage ? 'Photo' + (opt.docs ? ' (attached)' : '') : 'PDF file', d.notes || '']),
      margin: { left: M, right: M, bottom: 20 }, theme: 'grid',
      styles: { fontSize: 9, cellPadding: 2, textColor: INK, lineColor: LINE, lineWidth: 0.15 }, headStyles: { fillColor: ACC, textColor: [255, 255, 255] },
      columnStyles: { 0: { cellWidth: 28 }, 1: { cellWidth: 55, fontStyle: 'bold' }, 2: { cellWidth: 30 } }
    }, nl));
    // values read from the reports
    const withRes = docsAll.filter(d => (d.results && d.results.length) || (d.findings && d.findings.length));
    if (withRes.length) {
      let yy = doc.lastAutoTable.finalY + 9;
      if (yy > 250) { doc.addPage(); yy = 20; }
      put('Test results', M, yy, 12, INK, true);
      const rowsR = [], flags = [];
      for (const d of withRes) for (const f of d.findings || []) { const F = BPLab.finding(f.key) || f; rowsR.push([d.date ? fmtDate(new Date(d.date + 'T12:00').getTime(), { day: '2-digit', month: 'short', year: 'numeric' }) : '', d.title + ' finding', F.label, '', F.flag === 'normal' || F.flag === 'info' ? 'Noted' : 'Review']); flags.push(F.flag === 'info' ? 'normal' : F.flag); }
      for (const d of withRes) for (const r of d.results || []) { rowsR.push([d.date ? fmtDate(new Date(d.date + 'T12:00').getTime(), { day: '2-digit', month: 'short', year: 'numeric' }) : '', r.name, r.value + ' ' + r.unit, r.range || BPLab.refText(r.key, r.unit), r.label || r.flag]); flags.push(r.flag); }
      doc.autoTable({
        startY: yy + 3, head: [['Test date', 'Test', 'Result', 'Usual range', 'Status']], body: rowsR,
        margin: { left: M, right: M, bottom: 20 }, theme: 'grid',
        styles: { fontSize: 8.8, cellPadding: 1.8, textColor: INK, lineColor: LINE, lineWidth: 0.15 }, headStyles: { fillColor: ACC, textColor: [255, 255, 255] },
        columnStyles: { 0: { cellWidth: 26 }, 2: { fontStyle: 'bold' } },
        didParseCell: dd => { if (dd.section === 'body' && dd.column.index >= 2) { const f = flags[dd.row.index]; if (f !== 'normal') { const hx = f === 'borderline' ? CAT_HEX.elevated : f === 'low' ? CAT_HEX.low : CAT_HEX.stage2; dd.cell.styles.textColor = hexRGB(hx); dd.cell.styles.fillColor = tint(hx, 0.12); dd.cell.styles.fontStyle = 'bold'; } } }
      });
      // precautions for the newest abnormal value of each test
      const seen = new Set(); const adv = [];
      for (const d of withRes) for (const f of d.findings || []) { const F = BPLab.finding(f.key); if (F && !seen.has('f_' + f.key) && (F.tips.length || F.urgent)) { seen.add('f_' + f.key); adv.push([{ name: F.label, value: '', unit: '', label: F.text, flag: F.flag === 'info' ? 'borderline' : F.flag }, F.tips.concat(F.urgent ? [F.urgent] : [])]); } }
      for (const d of withRes) for (const r of d.results || []) if (r.flag !== 'normal' && !seen.has(r.key)) { seen.add(r.key); const t = BPLab.advice(r, S.meds); if (t.length) adv.push([r, t]); }
      let ay = doc.lastAutoTable.finalY + 8;
      if (adv.length) { if (ay > 262) { doc.addPage(); ay = 20; } put('What the reports mean, and precautions', M, ay, 11, INK, true); ay += 5; }
      for (const [r, tips] of adv) {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8.8);
        const lines = tips.flatMap(t => doc.splitTextToSize('\u2022  ' + t, W - 2 * M - 10));
        const h = 9 + lines.length * 4;
        if (ay + h > 280) { doc.addPage(); ay = 20; }
        const hx = r.flag === 'normal' ? CAT_HEX.normal : r.flag === 'borderline' ? CAT_HEX.elevated : r.flag === 'low' ? CAT_HEX.low : CAT_HEX.stage2;
        doc.setFillColor(...tint(hx, 0.08)); doc.setDrawColor(...tint(hx, 0.4)); doc.roundedRect(M, ay, W - 2 * M, h, 2, 2, 'FD');
        doc.setFillColor(...hexRGB(hx)); doc.rect(M, ay + 2, 1.4, h - 4, 'F');
        const head = r.value === '' ? r.name : `${r.name}: ${r.value} ${r.unit} (${r.label || r.flag})`;
        const sub = r.value === '' && r.label ? doc.splitTextToSize(r.label, W - 2 * M - 10) : [];
        if (sub.length) { const extra = sub.length * 4; doc.setFillColor(...tint(hx, 0.08)); doc.roundedRect(M, ay, W - 2 * M, h + extra, 2, 2, 'F'); doc.setDrawColor(...tint(hx, 0.4)); doc.roundedRect(M, ay, W - 2 * M, h + extra, 2, 2, 'S'); doc.setFillColor(...hexRGB(hx)); doc.rect(M, ay + 2, 1.4, h + extra - 4, 'F'); }
        put(head, M + 5, ay + 5.5, 10, hexRGB(r.flag === 'normal' ? CAT_HEX.normal : hx), true);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8.8); doc.setTextColor(...INK);
        if (sub.length) doc.text(sub, M + 5, ay + 10.5);
        doc.text(lines, M + 5, ay + 10.5 + sub.length * 4);
        ay += h + sub.length * 4 + 3;
      }
      put('Usual ranges are general adult values; the lab\u2019s own range on each report takes priority.', M, Math.min(ay + 2, 280), 7.5, MUTED);
    }
    if (opt.docs) {
      for (const d of docsAll.filter(x => x.isImage)) {
        const blob = await DB.get('docfiles', d.id); if (!blob) continue;
        const du = await blobToDataURL(await shrinkImage(blob, 1800, 0.8));
        const img = await loadImage(du);
        doc.addPage(); y = 18;
        put(d.title, M, y, 13, INK, true);
        put((d.date ? fmtDate(new Date(d.date + 'T12:00').getTime(), { day: 'numeric', month: 'long', year: 'numeric' }) : '') + (d.notes ? '  \u00B7  ' + d.notes : ''), M, y + 6, 9, MUTED);
        const maxW = W - 2 * M, maxH = 280 - (y + 10);
        let iw = maxW, ih = iw * img.naturalHeight / img.naturalWidth; if (ih > maxH) { ih = maxH; iw = ih * img.naturalWidth / img.naturalHeight; }
        doc.addImage(du, 'JPEG', M + (maxW - iw) / 2, y + 10, iw, ih);
      }
    }
  }

  // photos appendix
  if (opt.photos) {
    const withP = rs.filter(r => r.hasPhoto);
    if (withP.length) {
      doc.addPage(); y = 20; put('Monitor photos', M, y, 15, INK, true); y += 6;
      const cols = 3, gw = (W - 2 * M - 8) / cols, gh = gw * 0.75 + 9;
      let i = 0;
      for (const r of withP) {
        const blob = await DB.get('photos', r.id); if (!blob) continue;
        const small = await shrinkImage(blob, 700, 0.72); const du = await blobToDataURL(small);
        const img = await loadImage(du);
        if (i && i % cols === 0) { y += gh + 4; }
        if (y + gh > 280) { doc.addPage(); y = 20; }
        const x = M + (i % cols) * (gw + 4);
        const ar = img.naturalWidth / img.naturalHeight; let iw = gw, ih = gw / ar; if (ih > gw * 0.75) { ih = gw * 0.75; iw = ih * ar; }
        doc.setFillColor(240, 243, 242); doc.rect(x, y, gw, gw * 0.75, 'F');
        doc.addImage(du, 'JPEG', x + (gw - iw) / 2, y + (gw * 0.75 - ih) / 2, iw, ih);
        const k = bpCategory(r.sys, r.dia);
        put(`${fmtDate(r.ts, { day: 'numeric', month: 'short' })} ${fmtTime(r.ts)}  ·  ${r.sys}/${r.dia}${r.pulse ? '  ·  ' + r.pulse + ' bpm' : ''}`, x, y + gw * 0.75 + 5, 7.5, hexRGB(CAT_HEX[k]), true);
        i++;
      }
    }
  }

  // footer on every page
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setDrawColor(...LINE); doc.setLineWidth(0.2); doc.line(M, 284, W - M, 284);
    put(COPYRIGHT + '  ·  Family Health Tracker', M, 288.5, 7.5, MUTED);
    put('Page ' + i + ' of ' + n, W - M, 288.5, 7.5, MUTED, false, 'right');
    put('Home readings for discussion with a doctor. General guidance only, not a diagnosis.', M, 292.5, 6.8, MUTED);
  }
  return doc.output('blob');
}

/* ------------------------------------------------------------------ reminders */
function remTexts(i) { return { title: tr('Time to check blood pressure'), text: T('{time} reading. Sit quietly for 5 minutes, then measure and add the photo.', { time: tr(SLOTS[i].l) }) }; }
function readRemForm() { return SLOTS.map((s, i) => Object.assign({ t: $('#rem-t-' + i).value || ['08:00', '14:00', '21:00'][i], on: $('#rem-on-' + i).checked }, remTexts(i))); }
/* after a language change, send the reminder wording again in the new language */
function relabelReminders() {
  if (!NATIVE) return;
  try { const rem = getRemindersLocal().map((r, i) => Object.assign({}, r, remTexts(i))); if (rem.length) NATIVE.setReminders(JSON.stringify(rem)); } catch { /* ignore */ }
  syncMedReminders();
}
function saveReminders() {
  const rem = readRemForm();
  LS.set('bp.reminders', rem);
  if (NATIVE) {
    NATIVE.setReminders(JSON.stringify(rem));
    if (NATIVE.notificationStatus() !== 'granted') NATIVE.requestNotifications();
    toast(rem.some(r => r.on) ? 'Reminders saved' : 'Reminders turned off');
  }
  return rem;
}
const icsEsc = x => String(x).replace(/[\\;,]/g, c => '\\' + c).replace(/\n/g, ' ');
function icsFile(rem, meds) {
  const d = new Date(); const ds = d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate());
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  let s = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Asrar Ahmed Junedi//Family Health Tracker//EN\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\n';
  rem.forEach((r, i) => {
    if (!r.on) return;
    const [h, m] = r.t.split(':');
    const end = new Date(2000, 0, 1, +h, +m + 10);
    s += `BEGIN:VEVENT\r\nUID:bptracker-${SLOTS[i].k}-${ds}@bptracker.app\r\nDTSTAMP:${stamp}\r\nDTSTART:${ds}T${pad(h)}${pad(m)}00\r\nDTEND:${ds}T${pad(end.getHours())}${pad(end.getMinutes())}00\r\nRRULE:FREQ=DAILY\r\nSUMMARY:${icsEsc(remTexts(i).title)} (${icsEsc(tr(SLOTS[i].l))})\r\nDESCRIPTION:${icsEsc(remTexts(i).text)}\r\nBEGIN:VALARM\r\nACTION:DISPLAY\r\nDESCRIPTION:${icsEsc(remTexts(i).title)}\r\nTRIGGER:PT0M\r\nEND:VALARM\r\nEND:VEVENT\r\n`;
  });
  const BY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  (meds || []).forEach((m, i) => {
    const [h, mi] = m.t.split(':'); const end = new Date(2000, 0, 1, +h, +mi + 5);
    const clean = t => String(t).replace(/[\\;,]/g, ' ').replace(/\n/g, ' ');
    let day = ds, rule = 'RRULE:FREQ=DAILY\r\n';
    if (m.date) { day = m.date.replace(/-/g, ''); rule = ''; }
    else if (m.days && m.days.length) rule = `RRULE:FREQ=WEEKLY;BYDAY=${m.days.map(d => BY[d]).join(',')}\r\n`;
    s += `BEGIN:VEVENT\r\nUID:bptracker-r${i}-${day}@bptracker.app\r\nDTSTAMP:${stamp}\r\nDTSTART:${day}T${pad(h)}${pad(mi)}00\r\nDTEND:${day}T${pad(end.getHours())}${pad(end.getMinutes())}00\r\n${rule}SUMMARY:${clean(m.title)}\r\nDESCRIPTION:${clean(m.text)}\r\nBEGIN:VALARM\r\nACTION:DISPLAY\r\nDESCRIPTION:${clean(m.title)}\r\nTRIGGER:PT0M\r\nEND:VALARM\r\nEND:VEVENT\r\n`;
  });
  return s + 'END:VCALENDAR\r\n';
}

/* ------------------------------------------------------------------ backup */
async function backupData(withPhotos) {
  const data = { app: 'Family Health Tracker', version: 2, exported: new Date().toISOString(), profiles: await DB.all('profiles'), readings: await DB.all('readings'), meds: await DB.all('meds'), docs: await DB.all('docs'), steps: await DB.all('steps'), sugar: await DB.all('sugar'), thyroid: await DB.all('thyroid'), appts: await DB.all('appts'), doses: await DB.all('doses'), wbp: await DB.all('wbp'), vitals: await DB.all('vitals'), devices: await DB.all('devices'), labs: await DB.all('labs'), symptoms: await DB.all('symptoms'), women: await DB.all('women'), photos: {}, files: {} };
  if (NATIVE && NATIVE.getSteps) { try { data.autoSteps = { owner: stepsOwner(), log: JSON.parse(NATIVE.getSteps()) }; } catch { /* ignore */ } }
  if (withPhotos) {
    for (const g of data.sugar) if (g.hasPhoto) { const b = await DB.get('photos', 'sg_' + g.id); if (b) data.photos['sg_' + g.id] = await blobToDataURL(b); }
    for (const r of data.readings) if (r.hasPhoto) { const b = await DB.get('photos', r.id); if (b) data.photos[r.id] = await blobToDataURL(b); }
    for (const m of data.meds) if (m.hasPhoto) { const b = await DB.get('docfiles', 'med_' + m.id); if (b) data.files['med_' + m.id] = await blobToDataURL(b); }
    for (const d of data.docs) { const b = await DB.get('docfiles', d.id); if (b) data.files[d.id] = await blobToDataURL(b); }
    for (const p of data.profiles) if (p.hasPhoto) { const b = await DB.get('docfiles', 'pp_' + p.id); if (b) data.files['pp_' + p.id] = await blobToDataURL(b); }
  } else {
    data.profiles = data.profiles.map(p => Object.assign({}, p, { hasPhoto: false }));
    data.readings = data.readings.map(r => Object.assign({}, r, { hasPhoto: false }));
    data.meds = data.meds.map(m => Object.assign({}, m, { hasPhoto: false }));
    data.docs = [];
  }
  return data;
}
/* Android: keep one up-to-date backup file in Downloads > Family Health Tracker. It stays even if the app is removed. */
async function autoBackup(force) {
  if (!NATIVE || !NATIVE.saveFileReplace) return false;
  const last = LS.get('bp.autoBackup', 0);
  if (!force && Date.now() - last < bkGap()) return false;
  if (!(await DB.all('profiles')).length) return false;
  try {
    let json = JSON.stringify(await backupData(true));
    if (json.length > 60e6) json = JSON.stringify(await backupData(false));   // very large: keep the numbers, skip photos
    const text = BKP.seal(json), b64 = btoa(unescape(encodeURIComponent(text)));
    const month = 'Family Health backup ' + dayKey(Date.now()).slice(0, 7) + '.json';
    let ok = false;
    if (IOS_APP && NATIVE.backupWrite) { NATIVE.backupWrite('Family Health backup.json', b64); NATIVE.backupWrite(month, b64); ok = true; }
    else {
      // Android: the chosen Google Drive folder, and always a copy in Downloads on the phone
      if (NATIVE.backupFolderName && NATIVE.backupFolderName()) { const r = NATIVE.backupWrite('Family Health backup.json', b64); ok = r === 'ok'; if (ok) NATIVE.backupWrite(month, b64); }
      const res = NATIVE.saveFileReplace(b64, 'Family Health auto-backup.json', 'application/json');
      if (!NATIVE.backupFolderName || !NATIVE.backupFolderName()) ok = !!(res && res.indexOf('error') !== 0);
    }
    if (ok) LS.set('bp.autoBackup', Date.now());
    return ok;
  } catch (e) { return false; }   // try again next time
}

function withPhotoFlag(g, data) { return Object.assign({}, g, { hasPhoto: !!(g.hasPhoto && data.photos && data.photos['sg_' + g.id]) }); }
async function doBackup() {
  const withPhotos = $('#bk-photos') && $('#bk-photos').checked;
  toast('Preparing backup\u2026');
  const data = await backupData(withPhotos);
  const blob = new Blob([BKP.seal(JSON.stringify(data))], { type: 'application/json' });
  await deliverFile(blob, `Family Health backup ${dayKey(Date.now())}.json`, 'application/json', 'Backup');
}
function doRestore() {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'application/json,.json';
  inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return;
    try {
      let data = JSON.parse(await f.text());
      if (BKP.isLocked(data)) { const text = await bkAskPassword(data); if (!text) return; data = JSON.parse(text); }
      // accept backups from every version of the app (it was called "BP Tracker" before)
      const okApp = data && (/tracker|family\s*health/i.test(String(data.app || '')) || (Array.isArray(data.profiles) && Array.isArray(data.readings)));
      if (!okApp || !Array.isArray(data.profiles)) throw new Error('This file is not a backup from this app. Choose the file named \u201C\u2026backup\u2026.json\u201D.');
      data.readings = data.readings || [];
      const existing = await DB.all('profiles');
      const ids = new Set(existing.map(p => p.id));
      const newPeople = data.profiles.filter(p => !ids.has(p.id));
      if (existing.length + newPeople.length > MAX_PEOPLE) throw new Error(`The backup would make more than ${MAX_PEOPLE} people. Delete someone first.`);
      if (!(await confirmSheet('Restore backup?', T('Adds {p} people and {r} readings from {file}. Matching records are replaced; nothing else is deleted.', { p: data.profiles.length, r: data.readings.length, file: f.name }), 'Restore'))) return;
      for (const p of data.profiles) await DB.put('profiles', p);
      for (const r of data.readings) await DB.put('readings', r);
      for (const [id, du] of Object.entries(data.photos || {})) await DB.put('photos', dataURLToBlob(du), id);
      for (const m of data.meds || []) await DB.put('meds', m);
      for (const st of data.steps || []) await DB.put('steps', st);
      for (const g of data.sugar || []) await DB.put('sugar', withPhotoFlag(g, data));
      for (const t of data.thyroid || []) await DB.put('thyroid', t);
      for (const a of data.appts || []) await DB.put('appts', a);
      for (const d of data.doses || []) await DB.put('doses', d);
      for (const w of data.wbp || []) await DB.put('wbp', w);
      for (const v of data.vitals || []) await DB.put('vitals', v);
      for (const d of data.devices || []) await DB.put('devices', d);
      for (const n of ['labs', 'symptoms', 'women']) for (const x of data[n] || []) await DB.put(n, x);
      if (data.autoSteps && data.autoSteps.owner && data.autoSteps.log) {
        // keep counts from the old phone as day totals for that person
        const per = {}; for (const [k, v] of Object.entries(data.autoSteps.log)) per[k.slice(0, 10)] = (per[k.slice(0, 10)] || 0) + v;
        for (const [day, n] of Object.entries(per)) { const id = data.autoSteps.owner + '|' + day; if (!(await DB.get('steps', id))) await DB.put('steps', { id, profileId: data.autoSteps.owner, day, steps: n, updated: Date.now(), restored: true }); }
      }
      for (const [id, du] of Object.entries(data.files || {})) await DB.put('docfiles', dataURLToBlob(du), id);
      for (const d of data.docs || []) if (data.files && data.files[d.id]) await DB.put('docs', d);
      await loadProfiles(); await loadReadings(); render(); syncMedReminders(); toast('Backup restored');
    } catch (e) { toast(e.message || 'Could not read that file', 4000); }
  };
  inp.click();
}

/* ------------------------------------------------------------------ events */
document.addEventListener('click', async (e) => {
  const t = e.target.closest('button, [data-act], [data-person], [data-reading], [data-tab]');
  if (!t) return;
  const inSheet = t.closest('.sheet-wrap');
  if (t.dataset.thy) { const sh = inSheet && sheetStack.find(x => x.el === inSheet); if (sh) sh.close(); const r = (S.thy || []).find(x => x.id === t.dataset.thy); if (r) thySheet(r); return; }
  if (t.dataset.appt) { const sh = inSheet && sheetStack.find(x => x.el === inSheet); if (sh) sh.close(); const a = S.appts.find(x => x.id === t.dataset.appt); if (a) apptSheet(a); return; }
  if (t.dataset.sugar) { if (inSheet) { const sh = sheetStack.find(x => x.el === inSheet); if (sh) sh.close(); } const g = S.sugar.find(x => x.id === t.dataset.sugar); if (g) sugarSheet(g); return; }
  if (t.dataset.med || t.dataset.doc || (inSheet && /^(add-med|add-doc)$/.test(t.dataset.act || ''))) {
    if (inSheet) { const sh = sheetStack.find(x => x.el === inSheet); if (sh) sh.close(); }
    if (t.dataset.med) medSheet(t.dataset.med); else if (t.dataset.doc) docView(t.dataset.doc); else if (t.dataset.act === 'add-med') medSheet(); else docSheet();
    return;
  }
  if (inSheet && !t.dataset.act) return;
  if (t.dataset.tab) { S.tab = t.dataset.tab; window.scrollTo(0, 0); render(); return; }
  if (t.dataset.person) { await selectPerson(t.dataset.person); return; }
  if (t.dataset.reading && !t.closest('.sheet-wrap')) { readingDetail(t.dataset.reading); return; }
  switch (t.dataset.act) {
    case 'add-person': personSheet(); break;
    case 'edit-person': personSheet(t.dataset.id); break;
    case 'add-reading': readingSheet(null, t.dataset.slot); break;
    case 'report': reportSheet(); break;
    case 'add-med': medSheet(); break;
    case 'add-doc': docSheet(); break;
    case 'all-meds': allMedsSheet(); break;
    case 'all-docs': allDocsSheet(); break;
    case 'add-steps': stepsSheet(); break;
    case 'dose': { const p = cur(); if (!p) break; const on = !doseTaken(t.dataset.med, t.dataset.k); await setDose(p.id, t.dataset.med, t.dataset.k, on, 'phone'); await loadReadings(); render(); toast(on ? 'Medicine taken' : 'Not taken'); break; }
    case 'hk-more': case 'hk-ecg': hkSheet(); break;
    case 'em-again': remindAgain(); break;
    case 'wbp-more': wbpSheet(); break;
    case 'wbp-cuff': { const sh = inSheet && sheetStack.find(x => x.el === inSheet); if (sh) sh.close(); readingSheet(); break; }
    case 'em-contact': { const sh = inSheet && sheetStack.find(x => x.el === inSheet); if (sh) sh.close(); personSheet(t.dataset.id); break; }
    case 'add-sugar': { const sh = t.closest('.sheet-wrap') && sheetStack.find(x => x.el === t.closest('.sheet-wrap')); if (sh) sh.close(); sugarSheet(); break; }
    case 'all-sugar': allSugarSheet(); break;
    case 'sugar-rem': sugarRemSheet(); break;
    case 'add-thy': { const sh = t.closest('.sheet-wrap') && sheetStack.find(x => x.el === t.closest('.sheet-wrap')); if (sh) sh.close(); thySheet(); break; }
    case 'all-thy': allThySheet(); break;
    case 'thy-next': thyNextSheet(); break;
    case 'add-thy-med': medSheet(null, THY_PRESET); break;
    case 'add-appt': { const sh = t.closest('.sheet-wrap') && sheetStack.find(x => x.el === t.closest('.sheet-wrap')); if (sh) sh.close(); apptSheet(null, t.dataset.kind); break; }
    case 'all-appt': allApptSheet(); break;
    case 'tracker-on': { const p = cur(); if (!p) break; await DB.put('profiles', Object.assign({}, p, { [t.dataset.k]: true })); await loadProfiles(); await loadReadings(); render(); toast((TRACKERS.find(x => x.k === t.dataset.k) || {}).l + ' turned on'); break; }
    case 'steps-setup': S.tab = 'settings'; render(); setTimeout(() => { const s = $('#st-owner'); if (s) { s.scrollIntoView({ block: 'center' }); s.focus(); } }, 50); break;
    case 'guide': guideSheet(); break;
    case 'save-rem': saveReminders(); render(); break;
    case 'test-notif': if (NATIVE) { if (NATIVE.notificationStatus() !== 'granted') NATIVE.requestNotifications(); else { NATIVE.testNotification(); toast('Test reminder sent'); } } break;
    case 'allow-notif': if (NATIVE) NATIVE.requestNotifications(); break;
    case 'ics': {
      const rem = saveReminders();
      const medRem = await medReminderList();
      if (!rem.some(r => r.on) && !medRem.length) { toast('Turn on at least one reminder first.'); break; }
      const blob = new Blob([icsFile(rem, medRem)], { type: 'text/calendar' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = 'Family Health Tracker reminders.ics'; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      break;
    }
    case 'backup': doBackup(); break;
    case 'restore': doRestore(); break;
  }
});
$('#tabAdd').addEventListener('click', () => { const p = cur(); if (!p) personSheet(); else if (bpOn(p)) readingSheet(); else quickAddSheet(p); });
/* the middle button for someone who does not track blood pressure: a short menu of what to add */
function quickAddSheet(p) {
  const it = [];
  if (hasCond(p, 'dm')) it.push(['sugar', 'Blood sugar reading']);
  if (hasCond(p, 'period')) it.push(['period', 'Period or ovulation']);
  if (hasCond(p, 'preg')) it.push(['preg', 'Pregnancy']);
  it.push(['vital', 'Weight, temperature or oxygen'], ['lab', 'Test result'], ['doc', 'Upload a report'], ['med', 'Medicine'], ['appt', 'Appointment or treatment session']);
  const c = personConds(p).find(x => !['htn', 'dm', 'thy'].includes(x.k)); if (c) it.push(['sym', T('{cond}: symptoms', { cond: tr(c.l) })]);
  it.push(['bp', 'Blood pressure reading']);
  const sh = openSheet({ title: 'Add', body: `<div class="mlist" style="margin-top:0">${it.map(([k, l]) => `<button class="mrow" data-qa="${k}"><span style="flex:1;font-weight:700">${esc(tr(l))}</span><span class="small muted">›</span></button>`).join('')}</div>`, foot: '<button class="btn" data-close>Close</button>' });
  sh.el.addEventListener('click', e => { const b = e.target.closest('[data-qa]'); if (!b) return; const k = b.dataset.qa; sh.close();
    ({ sugar: () => sugarSheet(), period: () => condSheet('period'), preg: () => condSheet('preg'), vital: () => vitalSheet(), lab: () => labSheet(p), doc: () => docSheet && docSheet(), med: () => medSheet(), appt: () => apptSheet(), sym: () => symptomSheet(p, c.k), bp: () => readingSheet() })[k](); });
}
$('#btnGuide').addEventListener('click', guideSheet);
window.bpOnNotif = () => { if (S.tab === 'settings') render(); };
window.bpOnSteps = async () => { if (!window.bpReady) return; await loadReadings(); if (S.tab === 'home' || S.tab === 'settings') render(); };
document.addEventListener('change', async e => {
  if (e.target.id === 'set-lang') { I18N.save(e.target.value); await I18N.load(e.target.value); render(); I18N.start(); relabelReminders(); toast('Language changed'); return; }
  if (['hk-watch', 'hk-bpin', 'hk-bpout'].includes(e.target.id)) { saveHkOpts(); return; }
  if (e.target.dataset && e.target.dataset.hksrc != null) { const m = LS.get('bp.hkSrc', {}); m[e.target.dataset.hksrc] = e.target.value; LS.set('bp.hkSrc', m); await hkReclassify(); toast('Saved'); return; }
  if (e.target.id !== 'st-owner' || !NATIVE) return;
  const v = e.target.value;
  if (v) { LS.set('bp.stepsOwner', v); NATIVE.setStepsEnabled(true); } else { NATIVE.setStepsEnabled(false); }
  setTimeout(() => window.bpOnSteps(), 400);
});
window.bpOpenAdd = () => { if (!window.bpReady) { window.bpPendingAdd = true; return; } if (cur() && !sheetStack.length) readingSheet(); };

/* ------------------------------------------------------------------ start */
(async function start() {
  try {
    await DB.open();
    await I18N.load(I18N.get() || 'en'); I18N.start();
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    await loadProfiles(); await loadReadings(); render();
    window.bpReady = true;
    if (window.bpPendingAdd) { window.bpPendingAdd = false; window.bpOpenAdd(); }
    if (NATIVE && !LS.get('bp.askedNotif', false) && S.profiles.length) { LS.set('bp.askedNotif', true); NATIVE.requestNotifications(); }
    syncMedReminders();
    if (IOS_APP) { setTimeout(() => { window.bpWatchInbox(); window.bpOnHealth(); }, 600); }
    setTimeout(autoSyncDevices, 1500);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') setTimeout(autoSyncDevices, 800); });
    setTimeout(() => autoBackup(false), 4000);
  } catch (e) {
    $('#view-home').innerHTML = `<div class="card"><h2>Storage problem</h2><p>Family Health Tracker could not open its storage on this device: ${esc(e && e.message || e)}. Close and reopen the app. On iPhone, make sure Private Browsing is off.</p></div>`;
  }
  if ('serviceWorker' in navigator && !NATIVE && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then(reg => { reg.update().catch(() => {}); }).catch(() => {});
    // when a new version takes over, reload once so it shows straight away
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (!reloaded && !sheetStack.length) { reloaded = true; location.reload(); } });
  }
})();
