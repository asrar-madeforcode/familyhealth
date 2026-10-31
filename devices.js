/* Family Health Tracker — health devices and body measurements.
   Any standard Bluetooth health device (blood pressure monitor, sugar meter, scale, thermometer, pulse oximeter)
   is read through a small native Bluetooth bridge; the bytes are decoded here. Devices that only send to their
   own app come in through Apple Health / Health Connect, and devices with only a screen through the camera.
   © 2026 Asrar Ahmed Junedi. All rights reserved. */
'use strict';

/* ------------------------------------------------------------------ decoding the standard Bluetooth health formats */
const BLEP = (() => {
  const bytes = hex => { const b = []; for (let i = 0; i + 1 < (hex || '').length; i += 2) b.push(parseInt(hex.substr(i, 2), 16)); return b; };
  const u16 = (b, i) => (b[i] | (b[i + 1] << 8)) >>> 0;
  const s16 = (b, i) => { const v = u16(b, i); return v & 0x8000 ? v - 0x10000 : v; };
  /* IEEE-11073 16-bit SFLOAT and 32-bit FLOAT */
  function sf(b, i) {
    if (i + 1 >= b.length) return null;
    const raw = u16(b, i); if ([0x07FF, 0x0800, 0x07FE, 0x0802, 0x0801].includes(raw)) return null;
    let m = raw & 0x0FFF; if (m & 0x0800) m -= 0x1000;
    let e = raw >> 12; if (e & 8) e -= 16;
    return +(m * Math.pow(10, e)).toPrecision(7);
  }
  function fl(b, i) {
    if (i + 3 >= b.length) return null;
    const raw = b[i] | (b[i + 1] << 8) | (b[i + 2] << 16); if ([0x7FFFFF, 0x800000, 0x7FFFFE, 0x800002, 0x800001].includes(raw)) return null;
    let m = raw; if (m & 0x800000) m -= 0x1000000;
    let e = b[i + 3]; if (e & 0x80) e -= 256;
    return +(m * Math.pow(10, e)).toPrecision(7);
  }
  function dt(b, i) {
    if (i + 6 >= b.length) return null;
    const y = u16(b, i), mo = b[i + 2], d = b[i + 3];
    if (!y || !mo || !d) return null;
    const t = new Date(y, mo - 1, d, b[i + 4], b[i + 5], b[i + 6]).getTime();
    return isNaN(t) ? null : t;
  }
  /* 2A35 blood pressure measurement. Some monitors put plain whole numbers where the standard has SFLOAT. */
  function bp(hex) {
    const b = bytes(hex); if (b.length < 7) return null;
    const f = b[0]; let sys = sf(b, 1), dia = sf(b, 3), i = 7, ts = null, pulse = null, user = null, status = 0, pi = -1;
    if (f & 2) { ts = dt(b, i); i += 7; }
    if (f & 4) { pi = i; pulse = sf(b, i); i += 2; }
    if (f & 8) { user = b[i]; i += 1; }
    if (f & 16) { status = u16(b, i); i += 2; }
    if (f & 1) { if (sys != null) sys *= 7.50062; if (dia != null) dia *= 7.50062; }
    const ok = (s, d) => s > 50 && s < 300 && d > 25 && d < 200 && s > d;
    if (!ok(sys, dia)) {
      const s2 = u16(b, 1), d2 = u16(b, 3);
      if (!ok(s2, d2)) return null;
      sys = s2; dia = d2; if (pi >= 0) pulse = u16(b, pi);
    }
    if (pulse != null && (pulse < 25 || pulse > 250)) pulse = null;
    return { kind: 'bp', sys: Math.round(sys), dia: Math.round(dia), pulse: pulse != null ? Math.round(pulse) : null, ts, user, ihb: !!(status & 4), move: !!(status & 1), cuff: !!(status & 2) };
  }
  /* 2A18 glucose measurement and 2A34 glucose context (the meal tag) */
  function glu(hex) {
    const b = bytes(hex); if (b.length < 10) return null;
    const f = b[0], seq = u16(b, 1); let ts = dt(b, 3), i = 10, mg = null, type = 0;
    if (f & 1) { const off = s16(b, i); i += 2; if (ts != null) ts += off * 60000; }
    if (f & 2) { const v = sf(b, i); type = b[i + 2] & 0x0f; i += 3; if (v != null) mg = f & 4 ? v * 1000 * 18.016 : v * 100000; }
    return { kind: 'glu', seq, ts, mg: mg != null ? Math.round(mg * 10) / 10 : null, control: type === 10 };
  }
  function gluCtx(hex) {
    const b = bytes(hex); if (b.length < 3) return null;
    const f = b[0], seq = u16(b, 1); let i = 3, meal = null;
    if (f & 0x80) i++;
    if (f & 1) i += 3;
    if (f & 2) meal = b[i];
    return { kind: 'gctx', seq, timing: { 1: 'before', 2: 'after', 3: 'fasting', 4: 'random', 5: 'bedtime' }[meal] || null };
  }
  function racp(hex) { const b = bytes(hex); return { kind: 'racp', op: b[0], req: b[2], code: b[3], n: b[0] === 5 ? u16(b, 2) : null }; }
  /* 2A9D weight, 2A9C body composition */
  function weight(hex) {
    const b = bytes(hex); if (b.length < 3) return null;
    const f = b[0], raw = u16(b, 1); if (raw === 0xFFFF || !raw) return null;
    const kg = f & 1 ? raw * 0.01 * 0.453592 : raw * 0.005;
    let i = 3, ts = null, user = null, bmi = null, h = null;
    if (f & 2) { ts = dt(b, i); i += 7; }
    if (f & 4) { user = b[i]; i++; }
    if (f & 8) { bmi = u16(b, i) * 0.1; h = f & 1 ? u16(b, i + 2) * 0.254 : u16(b, i + 2) * 0.1; }
    return { kind: 'wt', kg: Math.round(kg * 10) / 10, ts, user, bmi, heightCm: h };
  }
  function body(hex) {
    const b = bytes(hex); if (b.length < 4) return null;
    const f = u16(b, 0), fat = u16(b, 2); let i = 4, ts = null, user = null, kg = null;
    if (f & 2) { ts = dt(b, i); i += 7; }
    if (f & 4) { user = b[i]; i++; }
    for (const bit of [8, 16, 32, 64, 128, 256, 512]) if (f & bit) i += 2;
    if (f & 1024) { const w = u16(b, i); kg = f & 1 ? w * 0.01 * 0.453592 : w * 0.005; }
    return { kind: 'bc', fat: fat === 0xFFFF ? null : Math.round(fat) / 10, ts, user, kg: kg != null ? Math.round(kg * 10) / 10 : null };
  }
  /* 2A1C body temperature */
  function temp(hex) {
    const b = bytes(hex); if (b.length < 5) return null;
    const f = b[0]; let v = fl(b, 1); if (v == null) return null;
    if (f & 1) v = (v - 32) * 5 / 9;
    return { kind: 'temp', c: Math.round(v * 10) / 10, ts: f & 2 ? dt(b, 5) : null };
  }
  /* 2A5E spot check and 2A5F continuous pulse oximeter */
  function spo2(hex, cont) {
    const b = bytes(hex); if (b.length < 5) return null;
    const f = b[0], s = sf(b, 1), pr = sf(b, 3);
    if (s == null || s < 50 || s > 100) return null;
    return { kind: cont ? 'spo2c' : 'spo2', v: Math.round(s), pulse: pr != null && pr > 25 && pr < 250 ? Math.round(pr) : null, ts: !cont && f & 1 ? dt(b, 5) : null };
  }
  function parse(c, hex) {
    switch (c) {
      case '2a35': return bp(hex);
      case '2a18': return glu(hex);
      case '2a34': return gluCtx(hex);
      case '2a52': return racp(hex);
      case '2a9d': return weight(hex);
      case '2a9c': return body(hex);
      case '2a1c': return temp(hex);
      case '2a5e': return spo2(hex, false);
      case '2a5f': return spo2(hex, true);
      default: return null;
    }
  }
  /* what to ask every device: listen to every standard health measurement it has, set its clock,
     and ask a sugar meter for its stored readings */
  function plan() {
    const n = new Date(), y = n.getFullYear();
    const t7 = [y & 255, y >> 8, n.getMonth() + 1, n.getDate(), n.getHours(), n.getMinutes(), n.getSeconds()];
    const hx = a => a.map(x => x.toString(16).padStart(2, '0')).join('');
    return {
      subs: [{ s: '1810', c: '2a35', m: 'i' }, { s: '1808', c: '2a18', m: 'n' }, { s: '1808', c: '2a34', m: 'n' }, { s: '1808', c: '2a52', m: 'i' },
        { s: '181d', c: '2a9d', m: 'i' }, { s: '181b', c: '2a9c', m: 'i' }, { s: '1809', c: '2a1c', m: 'i' }, { s: '1822', c: '2a5e', m: 'i' }, { s: '1822', c: '2a5f', m: 'n' }],
      writes: [{ s: '1805', c: '2a2b', hex: hx(t7.concat([((n.getDay() + 6) % 7) + 1, 0, 1])) }, { s: '1810', c: '2a08', hex: hx(t7) }, { s: '1808', c: '2a52', hex: '0101' }],
      idle: 10, max: 150
    };
  }
  return { parse, plan, _t: { bytes, sf, fl, dt, bp, glu, gluCtx, weight, body, temp, spo2 } };
})();

/* ------------------------------------------------------------------ the native Bluetooth bridge */
const BLE = { listeners: new Set(), busy: false };
const bleOK = () => !!(NATIVE && NATIVE.bleScan && NATIVE.bleSync);
window.bpOnBle = s => { let e; try { e = typeof s === 'string' ? JSON.parse(s) : s; } catch { return; } for (const f of [...BLE.listeners]) { try { f(e); } catch { /* ignore */ } } };
/* make sure Bluetooth is usable; quiet = never show a permission question */
function bleReady(quiet) {
  return new Promise(res => {
    if (!bleOK()) return res('unsupported');
    const s = NATIVE.bleState();
    if (s === 'on') return res('on');
    if (quiet && s !== 'unknown') return res(s);
    if (s === 'unsupported') return res(s);
    const f = e => { if (e.ev === 'perm') { BLE.listeners.delete(f); clearTimeout(t); res(e.s); } };
    const t = setTimeout(() => { BLE.listeners.delete(f); res(NATIVE.bleState()); }, quiet ? 4000 : 30000);
    BLE.listeners.add(f);
    NATIVE.bleRequest();
  });
}
/* one connection to one device; collects everything it sends */
function bleSession(id, onState) {
  return new Promise(res => {
    const out = { recs: [], services: null, reason: '', connected: false };
    let stopTimer = null;
    const f = e => {
      if (e.ev === 'state') { if (e.s === 'connected') out.connected = true; if (onState) onState(e.s); }
      else if (e.ev === 'services') { out.services = (e.list || []).map(x => x.s); out.connected = true; }
      else if (e.ev === 'ready') { if (onState) onState('waiting'); }
      else if (e.ev === 'data' || e.ev === 'read') {
        const r = BLEP.parse(e.c, e.hex); if (!r) return;
        out.recs.push(r);
        if (onState) onState('receiving', out.recs.length);
        // a sugar meter says when it has sent everything it stores
        if (r.kind === 'racp' && r.op === 6) { clearTimeout(stopTimer); stopTimer = setTimeout(() => NATIVE.bleStop(), 900); }
      } else if (e.ev === 'end' || e.ev === 'error') {
        BLE.listeners.delete(f); BLE.busy = false; clearTimeout(stopTimer);
        out.reason = e.reason || e.msg || ''; res(out);
      }
    };
    BLE.listeners.add(f); BLE.busy = true;
    NATIVE.bleSync(id, JSON.stringify(BLEP.plan()));
  });
}

/* ------------------------------------------------------------------ devices the family has added */
const DEV_KINDS = [
  { k: 'bp', l: 'Blood pressure monitor', svc: ['1810'], hint: 'Turn the monitor’s Bluetooth on: on most monitors, take a measurement or hold the memory (M) or Bluetooth button until the Bluetooth sign blinks.' },
  { k: 'sugar', l: 'Sugar meter', svc: ['1808'], hint: 'Turn on the meter’s Bluetooth or pairing mode (see its leaflet; often hold the main button until the Bluetooth sign blinks).' },
  { k: 'scale', l: 'Scale', svc: ['181d', '181b'], hint: 'Step on the scale so it wakes up, then keep it on while the phone looks for it.' },
  { k: 'thermo', l: 'Thermometer', svc: ['1809'], hint: 'Take a temperature so the thermometer wakes up and sends it.' },
  { k: 'oxi', l: 'Pulse oximeter', svc: ['1822'], hint: 'Put the oximeter on a finger so it turns on.' },
  { k: 'watch', l: 'Smartwatch or band', svc: [] },
  { k: 'other', l: 'Other health device', svc: ['1810', '1808', '181d', '181b', '1809', '1822'], hint: 'Turn the device on and put it in pairing or Bluetooth mode.' }
];
const DEV_ICON = { bp: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>',
  sugar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3s-5 6-5 10a5 5 0 0 0 10 0c0-4-5-10-5-10z" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
  scale: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="4" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M9 9.5a4 4 0 0 1 6 0l-2 2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  thermo: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M10 4a2 2 0 0 1 4 0v9.5a4 4 0 1 1-4 0z" fill="none" stroke="currentColor" stroke-width="1.8"/></svg>',
  oxi: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="7" width="14" height="10" rx="5" fill="none" stroke="currentColor" stroke-width="1.8"/><circle cx="12" cy="12" r="2" fill="currentColor"/></svg>',
  watch: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="6" width="10" height="12" rx="3" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M9 6l1-3h4l1 3M9 18l1 3h4l1-3" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>' };
DEV_ICON.other = DEV_ICON.bp;
const devKind = k => DEV_KINDS.find(x => x.k === k) || DEV_KINDS[DEV_KINDS.length - 1];
const devLabel = k => devKind(k).l;
async function allDevices() { try { return (await DB.all('devices')).sort((a, b) => a.created - b.created); } catch { return []; } }
const shortDev = id => String(id).replace(/[^a-z0-9]/gi, '').slice(-8).toLowerCase();
function fixTs(ts) { const now = Date.now(); return ts && ts < now + 864e5 && ts > new Date(2015, 0, 1).getTime() ? { ts, ok: true } : { ts: now, ok: false }; }

/* save what one session brought; returns a short summary */
async function importSession(dev, out) {
  const sum = { bp: 0, sugar: 0, weight: 0, fat: 0, temp: 0, spo2: 0, latest: null, em: null, users: new Set() };
  const who = user => (user != null && dev.users && dev.users[user]) || dev.pid;
  const pOf = pid => S.profiles.find(p => p.id === pid);
  const tag = shortDev(dev.id), note = dev.name || devLabel(dev.kind);
  // blood pressure: a monitor with a wrong clock sends every stored reading with the same time; keep only the newest then
  let bps = out.recs.filter(r => r.kind === 'bp');
  if (bps.filter(r => !fixTs(r.ts).ok).length > 1) bps = bps.filter(r => fixTs(r.ts).ok).concat(bps.filter(r => !fixTs(r.ts).ok).slice(-1));
  for (const r of bps) {
    if (r.user != null) sum.users.add(r.user);
    const pid = who(r.user); if (!pOf(pid)) continue;
    const { ts, ok } = fixTs(r.ts);
    const id = 'ble_' + tag + '_' + (ok ? ts : 'x') + '_' + r.sys + '_' + r.dia;
    if (await DB.get('readings', id)) continue;
    const have = await DB.byProfile(pid);
    if (have.some(x => Math.abs(x.ts - ts) < (ok ? 120e3 : 600e3) && x.sys === r.sys && x.dia === r.dia)) continue;
    const rec = { id, profileId: pid, ts, slot: slotFor(new Date(ts)), place: 'home', sys: r.sys, dia: r.dia, pulse: r.pulse, ihb: r.ihb || undefined,
      note: note + (r.ihb ? ' · irregular heartbeat' : '') + (r.move ? ' · moved during measurement' : ''), medTaken: false, hasPhoto: false, src: 'ble', created: Date.now(), updated: Date.now() };
    await DB.put('readings', rec); sum.bp++;
    if (!sum.latest || ts > sum.latest.ts) sum.latest = { ts, text: `${r.sys}/${r.dia}${r.pulse ? ' · ' + r.pulse + ' bpm' : ''}`, kind: 'bp' };
    if (typeof hkSaveReading === 'function') hkSaveReading(rec);
    if (Date.now() - ts < 6 * 3600e3 && emergencyKind(rec) && (!sum.em || ts > sum.em[0].ts)) sum.em = [rec, pOf(pid)];
  }
  // blood sugar, with the meal tag the meter sends separately
  const ctx = new Map(out.recs.filter(r => r.kind === 'gctx').map(r => [r.seq, r.timing]));
  for (const r of out.recs.filter(r => r.kind === 'glu' && r.mg && !r.control && r.mg >= 15 && r.mg <= 700)) {
    const p = pOf(dev.pid); if (!p) continue;
    const { ts } = fixTs(r.ts);
    const id = 'ble_' + tag + '_' + r.seq + '_' + Math.round(ts / 60000);
    if (await DB.get('sugar', id)) continue;
    if (!p.trackSugar) { p.trackSugar = true; await DB.put('profiles', p); }
    const h = new Date(ts).getHours();
    const timing = ctx.get(r.seq) || (h >= 4 && h < 10 ? 'fasting' : 'random');
    await DB.put('sugar', { id, profileId: p.id, ts, mg: r.mg, unit: p.sugarUnit || 'mg/dL', timing, note, hasPhoto: false, src: 'ble', created: Date.now() });
    sum.sugar++;
    if (!sum.latest || ts > sum.latest.ts) sum.latest = { ts, text: toUnit(r.mg, p.sugarUnit || 'mg/dL') + ' ' + (p.sugarUnit || 'mg/dL'), kind: 'sugar' };
  }
  // scale, thermometer, oximeter
  const vit = async (pid, k, v, ts0, extra) => {
    const p = pOf(pid); if (!p || v == null) return false;
    const { ts, ok } = fixTs(ts0);
    const id = 'ble_' + tag + '_' + k + '_' + Math.round(ts / 10000);
    if (await DB.get('vitals', id)) return false;
    // a device without a clock sends the same last value again: skip it if seen in the last 15 minutes
    if (!ok && (await DB.byProfile(pid, 'vitals')).some(x => x.k === k && x.v === v && Math.abs(x.ts - ts) < 15 * 60e3)) return false;
    await DB.put('vitals', Object.assign({ id, profileId: pid, ts, k, v, src: 'ble', note, created: Date.now() }, extra || {}));
    if (k === 'weight' && (!p.wTs || ts >= p.wTs)) { p.weight = v; p.wTs = ts; await DB.put('profiles', p); }
    if (!sum.latest || ts > sum.latest.ts) sum.latest = { ts, text: fmtMeasure(k, v), kind: k };
    return true;
  };
  for (const r of out.recs) {
    if (r.kind === 'wt' && await vit(who(r.user), 'weight', r.kg, r.ts)) sum.weight++;
    if (r.kind === 'bc') { if (r.fat != null && await vit(who(r.user), 'fat', r.fat, r.ts)) sum.fat++; if (r.kg != null && await vit(who(r.user), 'weight', r.kg, r.ts)) sum.weight++; }
    if (r.kind === 'temp' && await vit(dev.pid, 'temp', r.c, r.ts)) sum.temp++;
    if (r.kind === 'spo2' && await vit(dev.pid, 'spo2', r.v, r.ts, r.pulse ? { pulse: r.pulse } : null)) sum.spo2++;
  }
  // a continuous oximeter: keep one steady value from the end of the session
  const cont = out.recs.filter(r => r.kind === 'spo2c');
  if (cont.length >= 5) {
    const last = cont.slice(-8), v = Math.round(median(last.map(r => r.v))), pr = last.filter(r => r.pulse).map(r => r.pulse);
    if (await vit(dev.pid, 'spo2', v, Date.now(), pr.length ? { pulse: Math.round(median(pr)) } : null)) sum.spo2++;
  }
  sum.total = sum.bp + sum.sugar + sum.weight + sum.fat + sum.temp + sum.spo2;
  return sum;
}
const median = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[s.length >> 1] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
function sumText(s) {
  const parts = [];
  if (s.bp) parts.push(T('{n} blood pressure', { n: s.bp }));
  if (s.sugar) parts.push(T('{n} sugar', { n: s.sugar }));
  if (s.weight) parts.push(T('{n} weight', { n: s.weight }));
  if (s.fat) parts.push(T('{n} body fat', { n: s.fat }));
  if (s.temp) parts.push(T('{n} temperature', { n: s.temp }));
  if (s.spo2) parts.push(T('{n} oxygen', { n: s.spo2 }));
  return parts.join(', ');
}

/* sync one device; quiet = in the background when the app opens */
async function syncDevice(dev, quiet, onState) {
  if (BLE.busy) return null;
  const st = await bleReady(quiet);
  if (st !== 'on') { if (!quiet) bleProblem(st); return null; }
  const out = await bleSession(dev.id, onState);
  const sum = await importSession(dev, out);
  dev.last = Date.now(); if (sum.total) dev.lastNew = Date.now();
  if (sum.users.size) dev.seenUsers = [...new Set([...(dev.seenUsers || []), ...sum.users])].sort();
  if (out.connected) { dev.services = out.services || dev.services; await DB.put('devices', dev); }
  if (sum.total) { await loadReadings(); render(); }
  if (sum.em) checkEmergency(sum.em[0], sum.em[1]);
  else if (sum.total) toast(T('From {dev}: {what}', { dev: dev.name || tr(devLabel(dev.kind)), what: sumText(sum) }), 4000);
  else if (!quiet) toast(out.connected ? 'Connected. No new readings on the device.' : 'Could not reach the device. Turn it on or take a measurement, then try again.', 4500);
  return { out, sum };
}
let autoSyncAt = 0;
async function autoSyncDevices() {
  if (!bleOK() || BLE.busy || Date.now() - autoSyncAt < 10 * 60e3) return;
  autoSyncAt = Date.now();
  for (const d of (await allDevices()).filter(d => d.route === 'ble')) await syncDevice(d, true);
}
function bleProblem(st) {
  const msg = { off: 'Bluetooth is off. Turn it on in the phone’s settings, then try again.', unauthorized: 'Allow Family Health Tracker to use Bluetooth (Nearby devices) in the phone’s settings, then try again.', unsupported: 'This phone cannot connect to Bluetooth health devices.', ask: 'Allow Bluetooth when the phone asks, then try again.' }[st] || 'Bluetooth is not ready. Try again.';
  toast(msg, 4500);
}

/* ------------------------------------------------------------------ the "Add a device" steps */
function addDeviceSheet(kind0) {
  const ppl = S.profiles; if (!ppl.length) return;
  let kind = kind0 || null, pid = S.current || ppl[0].id;
  const sh = openSheet({ title: 'Add a device', body: '<div id="dv-body"></div>', full: true, foot: '<button class="btn" data-close>Close</button>' });
  const el = sh.el, box = $('#dv-body', el);
  sh.onClose = () => { if (BLE.busy || scanning) { try { NATIVE.bleStop(); } catch { /* ignore */ } } BLE.listeners.delete(scanL); };
  let scanning = false, scanL = null;
  const personSel = () => ppl.length > 1 ? `<div class="field"><label for="dv-p">Whose readings?</label><select class="input" id="dv-p">${ppl.map(p => `<option value="${p.id}" ${p.id === pid ? 'selected' : ''} data-noi18n>${esc(p.name)}</option>`).join('')}</select></div>` : '';
  const bindPerson = () => { const s = $('#dv-p', el); if (s) s.onchange = () => { pid = s.value; }; };

  function step1() {
    box.innerHTML = `<p class="small muted" style="margin-top:0">What kind of device is it?</p><div class="dv-grid">${DEV_KINDS.map(k => `<button class="dv-kind" data-k="${k.k}"><span class="mic">${DEV_ICON[k.k]}</span><span>${k.l}</span></button>`).join('')}</div>`;
    $$('[data-k]', box).forEach(b => b.onclick = () => { kind = b.dataset.k; step2(); });
  }
  function step2() {
    const isWatch = kind === 'watch';
    box.innerHTML = `<div class="row" style="margin-bottom:6px"><span class="mic">${DEV_ICON[kind]}</span><b style="flex:1">${devLabel(kind)}</b><button class="btn sm" data-back>Change</button></div>
      ${personSel()}
      ${isWatch ? appRouteHTML(kind) : `<p class="small muted" style="margin:6px 0">How does it share readings?</p>
      <div class="dv-routes">
        ${bleOK() ? `<button class="dv-route" data-r="ble"><b>Bluetooth</b><span class="small muted">Connect it straight to this phone. Works with most Bluetooth health devices (Beurer, Omron, A&amp;D, Accu-Chek, Contour, CareSens and others).</span></button>` : ''}
        <button class="dv-route" data-r="app"><b>Its own app</b><span class="small muted">The device sends readings to its maker’s app (for example Omron Connect, Withings, beurer HealthManager Pro, Accu-Chek).</span></button>
        <button class="dv-route" data-r="camera"><b>Only a screen, no Bluetooth</b><span class="small muted">For example Beurer BM 25. The phone camera reads the numbers on the screen.</span></button>
      </div>`}`;
    bindPerson();
    $('[data-back]', box).onclick = step1;
    $$('[data-r]', box).forEach(b => b.onclick = () => { const r = b.dataset.r; if (r === 'ble') step3(); else if (r === 'app') { box.innerHTML = appRouteHTML(kind) + personSel(); bindPerson(); addSave('app'); } else { box.innerHTML = cameraRouteHTML(kind) + personSel(); bindPerson(); addSave('camera'); } });
    if (isWatch) addSave('app');
  }
  function addSave(route) {
    const b = document.createElement('button'); b.className = 'btn primary block'; b.style.marginTop = '12px'; b.textContent = tr('Save this device');
    b.onclick = async () => {
      const name = ($('#dv-name', box) && $('#dv-name', box).value.trim()) || '';
      await DB.put('devices', { id: 'd_' + uid(), name, kind, route, pid, created: Date.now() });
      sh.close(); toast('Device saved'); render();
      if (route === 'camera' && (kind === 'bp' || kind === 'sugar')) setTimeout(() => (kind === 'sugar' ? sugarSheet() : readingSheet()), 300);
    };
    box.appendChild(b);
  }
  function step3() {
    const kd = devKind(kind);
    box.innerHTML = `<div class="ocr-msg"><b>${esc(tr(kd.hint || ''))}</b></div>
      <div class="row" style="margin:10px 0 4px"><span class="busy" id="dv-spin"></span><span class="small muted" id="dv-st" style="flex:1">Looking for devices…</span><button class="btn sm" id="dv-again" hidden>Search again</button></div>
      <div class="mlist" id="dv-list"></div>
      <p class="small muted" id="dv-none" hidden>Nothing found yet. Make sure the device is on and in Bluetooth mode, close to the phone. If it still does not appear, its maker may only let its own app connect: use “Its own app” or the camera instead.</p>`;
    scan();
  }
  async function scan() {
    const st = await bleReady(false);
    if (st !== 'on') { bleProblem(st); $('#dv-st', box).textContent = tr('Bluetooth is not ready.'); $('#dv-spin', box).hidden = true; $('#dv-again', box).hidden = false; $('#dv-again', box).onclick = scan; return; }
    const seen = new Map(), kd = devKind(kind), list = $('#dv-list', box);
    const BRANDS = /beurer|bm\s?\d|bc\s?\d|bf\s?\d|gl\s?\d|po\s?\d|ft\s?\d|omron|hem-|blesmart|a&d|a\s?&\s?d|ua-|uc-|accu|contour|caresens|isens|onetouch|sinocare|yuwell|microlife|withings|qardio|nonin|masimo|jumper|vivachek|rossmax|medisana|sanitas|silvercrest|scale|meter|bpm|oxi|thermo|glucose|blood|pressure|health/i;
    const draw = () => {
      const arr = [...seen.values()].map(d => Object.assign(d, { score: (d.services || []).some(s => kd.svc.includes(s)) * 100 + (d.services || []).some(s => ['1810', '1808', '181d', '181b', '1809', '1822'].includes(s)) * 50 + BRANDS.test(d.name || '') * 30 + (d.bonded ? 10 : 0) + Math.max(0, 100 + (d.rssi || -100)) / 10 }))
        .filter(d => d.score >= 30 || d.name).sort((a, b) => b.score - a.score).slice(0, 12);
      list.innerHTML = arr.map(d => `<button class="mrow" data-id="${esc(d.id)}"><span class="mic">${DEV_ICON[kind]}</span><span style="flex:1;min-width:0"><b data-noi18n>${esc(d.name || tr('Unnamed device'))}</b><br><span class="small muted">${d.score >= 80 ? esc(tr('Health device')) : d.bonded ? esc(tr('Paired with this phone')) : ''}</span></span><span class="small muted">›</span></button>`).join('');
      $$('[data-id]', list).forEach(b => b.onclick = () => connect(seen.get(b.dataset.id)));
      $('#dv-none', box).hidden = arr.length > 0;
    };
    BLE.listeners.delete(scanL);
    scanL = e => {
      if (e.ev === 'found') { const o = seen.get(e.id) || {}; seen.set(e.id, Object.assign(o, e, { name: e.name || o.name, services: (e.services && e.services.length ? e.services : o.services) || [] })); draw(); }
      if (e.ev === 'scanEnd' || (e.ev === 'error' && scanning)) { scanning = false; const sp = $('#dv-spin', box); if (sp) { sp.hidden = true; $('#dv-st', box).textContent = tr(seen.size ? 'Tap your device.' : 'No devices found.'); $('#dv-again', box).hidden = false; $('#dv-again', box).onclick = scan; } $('#dv-none', box) && ($('#dv-none', box).hidden = seen.size > 0); }
    };
    BLE.listeners.add(scanL);
    scanning = true; $('#dv-spin', box).hidden = false; $('#dv-again', box).hidden = true; $('#dv-st', box).textContent = tr('Looking for devices…');
    NATIVE.bleScan(20);
  }
  async function connect(found) {
    if (!found) return;
    BLE.listeners.delete(scanL); scanning = false; try { NATIVE.bleStop(); } catch { /* ignore */ }
    const dev = { id: found.id, name: found.name || '', kind, route: 'ble', pid, users: {}, created: Date.now() };
    box.innerHTML = `<div class="row" style="gap:10px"><span class="busy"></span><b id="dv-cs" style="flex:1">Connecting…</b></div><p class="small muted" id="dv-ch">If the phone asks to pair, allow it. Some devices show a PIN on their screen to type in.</p>`;
    const words = { connecting: 'Connecting…', connected: 'Connected. Reading…', pairing: 'Pairing… allow it on the phone.', paired: 'Paired. Reading…', waiting: 'Connected. Take a measurement now if nothing comes.', receiving: 'Receiving readings…' };
    await new Promise(r => setTimeout(r, 400));
    const res = await syncDevice(dev, false, (s, n) => { const x = $('#dv-cs', box); if (x) x.textContent = tr(words[s] || s) + (n ? ' (' + n + ')' : ''); });
    if (!res) { step3(); return; }
    const std = (res.out.services || []).some(s => ['1810', '1808', '181d', '181b', '1809', '1822'].includes(s));
    if (res.sum.total || std) {
      dev.services = res.out.services; dev.last = Date.now(); await DB.put('devices', dev);
      box.innerHTML = `<div class="ocr-msg ok"><b>${esc(T('{dev} is connected.', { dev: dev.name || tr(devLabel(kind)) }))}</b> ${res.sum.total ? esc(T('Saved: {what}.', { what: sumText(res.sum) })) : esc(tr('No readings were waiting on it.'))}</div>
        <p class="small">From now on, new readings come in by themselves when you open the app near the device, or tap “Sync” on the Today screen.</p>`;
      if (kind === 'bp' && ppl.length > 1) box.insertAdjacentHTML('beforeend', '<p class="small muted">If two people share this monitor (user 1 and user 2), choose who is who in Settings › Devices after both have measured.</p>');
    } else if (res.out.connected) {
      box.innerHTML = `<div class="ocr-msg warn"><b>This device connected, but it does not use the standard Bluetooth health connection.</b> Its maker only lets its own app read it.</div>${appRouteHTML(kind)}`;
      addSave('app');
    } else {
      box.innerHTML = `<div class="ocr-msg warn"><b>Could not connect.</b> Turn the device on or take a measurement, keep it close to the phone, and try again.</div><button class="btn primary block" id="dv-retry">Try again</button>`;
      $('#dv-retry', box).onclick = step3;
    }
  }
  if (kind) step2(); else step1();
}
function appRouteHTML(kind) {
  const hint = kind === 'watch' ? 'In the watch’s app (for example Da Fit, Samsung Health, Fitbit, Huawei Health, Zepp), turn on sharing with' : 'In the device’s own app, turn on sharing with';
  const where = IOS_APP ? 'Apple Health' : 'Health Connect';
  return `<div class="card" style="padding:12px"><b>${esc(tr('Connect through ' + where))}</b>
    <ol class="small" style="margin:8px 0 0;padding-inline-start:18px">
      <li>${esc(tr(hint))} ${esc(where)}.</li>
      <li>${IOS_APP ? esc(tr('In Family Health: Settings › Apple Health and Apple Watch, choose whose phone this is and tick “Add blood pressure readings from other apps”.')) : esc(tr('In Family Health: Settings › Health Connect, choose whose phone this is and allow the readings.'))}</li>
      <li>${esc(tr('Readings then come in by themselves each time you open Family Health.'))}</li></ol>
    ${kind === 'watch' ? `<p class="small muted" style="margin:8px 0 0">${esc(tr('Blood pressure from a watch without a cuff is kept apart as an estimate.'))}</p>` : ''}
    <div class="field" style="margin-top:10px"><label for="dv-name">Name (optional)</label><input class="input" id="dv-name" maxlength="40" placeholder="e.g. Omron M7, Da Fit watch" data-noi18n-ph></div></div>`;
}
function cameraRouteHTML(kind) {
  return `<div class="card" style="padding:12px"><b>Read it with the camera</b>
    <p class="small" style="margin:6px 0 0">${esc(tr(kind === 'sugar' ? 'After each test, tap “+ Add” on the sugar card and point the camera at the meter’s screen.' : 'After each measurement, tap the camera button and point it at the screen. The app reads the numbers and saves them when they are steady.'))}</p>
    <div class="field" style="margin-top:10px"><label for="dv-name">Name (optional)</label><input class="input" id="dv-name" maxlength="40" placeholder="e.g. Beurer BM 25"></div></div>`;
}

/* ------------------------------------------------------------------ Settings › Devices and the Today screen */
async function devicesSettingsHTML() {
  const ds = await allDevices();
  const name = pid => (S.profiles.find(p => p.id === pid) || {}).name || '';
  const route = r => r === 'ble' ? 'Bluetooth' : r === 'app' ? (IOS_APP ? 'Through Apple Health' : 'Through Health Connect') : 'Camera';
  return `<div class="card"><div class="row"><h2 style="margin:0">Devices</h2><span class="spacer"></span><button class="btn sm" data-dev="add">+ Add a device</button></div>
    ${ds.length ? `<div class="mlist">${ds.map(d => `<div class="mrow" style="cursor:default"><span class="mic">${DEV_ICON[d.kind] || DEV_ICON.other}</span><span style="flex:1;min-width:0"><b data-noi18n>${esc(d.name || tr(devLabel(d.kind)))}</b><br><span class="small muted"><span>${esc(route(d.route))}</span> · <span data-noi18n>${esc(name(d.pid))}</span>${d.last ? ` · <span>${esc(T('synced {when}', { when: fmtDate(d.last, { day: 'numeric', month: 'short' }) + ', ' + fmtTime(d.last) }))}</span>` : ''}</span>
      ${d.route === 'ble' && d.kind === 'bp' && (d.seenUsers || []).length > 1 ? `<span class="row" style="margin-top:6px;gap:6px;flex-wrap:wrap">${d.seenUsers.map(u => `<label class="small">${esc(T('User {n}', { n: u }))} <select class="input" style="min-height:34px;padding:4px 8px" data-devuser="${esc(d.id)}|${u}">${S.profiles.map(p => `<option value="${p.id}" ${((d.users || {})[u] || d.pid) === p.id ? 'selected' : ''} data-noi18n>${esc(p.name)}</option>`).join('')}</select></label>`).join('')}</span>` : ''}</span>
      ${d.route === 'ble' ? `<button class="btn sm" data-dev="sync" data-id="${esc(d.id)}">Sync</button>` : ''}<button class="btn sm" data-dev="del" data-id="${esc(d.id)}" aria-label="Remove">✕</button></div>`).join('')}</div>`
      : '<p class="small muted" style="margin:8px 0 0">Add your blood pressure monitor, sugar meter, scale, thermometer, pulse oximeter or smartwatch. Bluetooth devices send readings by themselves; others come in through their own app or the camera.</p>'}</div>`;
}
function devicesBar(p) {
  const ds = (S.devices || []).filter(d => d.route === 'ble' && (d.pid === p.id || Object.values(d.users || {}).includes(p.id)));
  if (!ds.length) return '';
  const last = Math.max(...ds.map(d => d.last || 0));
  return `<div class="card dv-bar"><span class="mic">${DEV_ICON[ds[0].kind] || DEV_ICON.other}</span><span style="flex:1;min-width:0"><b>${ds.length > 1 ? esc(T('{n} devices', { n: ds.length })) : `<span data-noi18n>${esc(ds[0].name || tr(devLabel(ds[0].kind)))}</span>`}</b><br><span class="small muted" id="dv-bar-st">${last ? esc(T('synced {when}', { when: fmtTime(last) })) : ''}</span></span><button class="btn sm" data-dev="syncall">Sync</button></div>`;
}
document.addEventListener('click', async e => {
  const t = e.target.closest('[data-dev]'); if (!t) return;
  const a = t.dataset.dev;
  if (a === 'add') addDeviceSheet();
  else if (a === 'sync' || a === 'syncall') {
    const ds = (await allDevices()).filter(d => d.route === 'ble' && (a === 'syncall' ? (d.pid === S.current || Object.values(d.users || {}).includes(S.current)) : d.id === t.dataset.id));
    t.disabled = true; const st = $('#dv-bar-st');
    for (const d of ds) await syncDevice(d, false, s => { if (st) st.textContent = tr({ connecting: 'Connecting…', connected: 'Connected. Reading…', pairing: 'Pairing… allow it on the phone.', waiting: 'Connected. Take a measurement now if nothing comes.', receiving: 'Receiving readings…' }[s] || ''); });
    t.disabled = false; S.devices = await allDevices(); render();
  } else if (a === 'del') {
    if (!(await confirmSheet('Remove device?', 'Readings already saved stay. The device will no longer send new ones.', 'Remove', true))) return;
    await DB.del('devices', t.dataset.id); S.devices = await allDevices(); render();
  }
});
document.addEventListener('change', async e => {
  const s = e.target.closest('[data-devuser]'); if (!s) return;
  const [id, u] = s.dataset.devuser.split('|'); const d = await DB.get('devices', id); if (!d) return;
  d.users = Object.assign({}, d.users, { [u]: s.value }); await DB.put('devices', d); toast('Saved');
});

/* ------------------------------------------------------------------ body measurements: weight, waist, body fat, temperature, oxygen */
const MEASURES = {
  weight: { l: 'Weight', u: 'kg', min: 2, max: 350, step: 0.1 },
  waist: { l: 'Waist', u: 'cm', min: 30, max: 250, step: 0.5 },
  fat: { l: 'Body fat', u: '%', min: 2, max: 75, step: 0.1 },
  temp: { l: 'Temperature', u: '°C', min: 30, max: 45, step: 0.1 },
  spo2: { l: 'Oxygen (SpO₂)', u: '%', min: 50, max: 100, step: 1 },
  peak: { l: 'Peak flow', u: 'L/min', min: 50, max: 900, step: 10 }
};
const fmtMeasure = (k, v) => (Math.round(v * 10) / 10) + ' ' + ((MEASURES[k] || {}).u || '');
function bmiOf(p, kg) { const h = +p.height; if (!h || !kg) return null; return Math.round(kg / Math.pow(h / 100, 2) * 10) / 10; }
function bmiCat(b) { return b < 18.5 ? ['Underweight', 'low'] : b < 25 ? ['Healthy weight', 'normal'] : b < 30 ? ['Overweight', 'elevated'] : b < 35 ? ['Obesity', 'stage1'] : ['Severe obesity', 'stage2']; }
/* a gentle flag for a value that needs attention */
function vitalFlag(k, v) {
  if (k === 'spo2') return v < 90 ? ['Very low oxygen. Get medical help now if you are breathless or confused.', 'crisis'] : v < 94 ? ['Lower than usual oxygen. Measure again at rest; call your doctor if it stays below 94%.', 'stage1'] : null;
  if (k === 'temp') return v >= 39.5 ? ['High fever. Drink fluids and contact a doctor, especially with dialysis, sickle cell disease or after surgery.', 'stage2'] : v >= 38 ? ['Fever.', 'stage1'] : v < 35 ? ['Low body temperature. Warm up and measure again.', 'low'] : null;
  return null;
}
function vitalsCard(p) {
  const vs = S.vitals || [], latest = k => vs.find(x => x.k === k);
  const w = latest('weight'), kgs = w ? w.v : +p.weight || null, bmi = bmiOf(p, kgs);
  const tiles = [];
  if (kgs) {
    const prev = vs.filter(x => x.k === 'weight' && w && x.ts < w.ts - 20 * 3600e3)[0];
    tiles.push(`<button class="hk-tile" data-vit="weight"><span class="small muted">Weight</span><b class="num">${fmtMeasure('weight', kgs)}</b>${bmi ? `<span class="small" style="color:var(--c-${bmiCat(bmi)[1]})"><span>BMI</span> <span class="num">${bmi}</span> · <span>${bmiCat(bmi)[0]}</span></span>` : '<span class="small muted">Add height in Edit person for BMI</span>'}${prev ? `<span class="small muted num">${(w.v - prev.v > 0 ? '+' : '') + (Math.round((w.v - prev.v) * 10) / 10)} kg</span>` : ''}</button>`);
  }
  for (const k of ['waist', 'fat', 'temp', 'spo2', 'peak']) {
    const x = latest(k); if (!x) continue;
    const fl = vitalFlag(k, x.v);
    tiles.push(`<button class="hk-tile" data-vit="${k}"><span class="small muted">${MEASURES[k].l}</span><b class="num"${fl ? ` style="color:var(--c-${fl[1]})"` : ''}>${fmtMeasure(k, x.v)}</b><span class="small muted">${esc(fmtDate(x.ts, { day: 'numeric', month: 'short' }))}</span></button>`);
  }
  return `<div class="card"><div class="row"><h2 style="margin:0">Body and vitals</h2><span class="spacer"></span><button class="btn sm" data-vit="add">+ Add</button></div>
    ${tiles.length ? `<div class="hk-grid" style="margin-top:10px">${tiles.join('')}</div>` : '<p class="small muted" style="margin:10px 0 0">Weight, waist, body fat, temperature and oxygen level. Add them by hand, or from a Bluetooth scale, thermometer or pulse oximeter.</p>'}</div>`;
}
function vitalSheet(k0) {
  const p = cur(); if (!p) return;
  let k = k0 || 'weight';
  const body = `<div class="small muted">For ${esc(p.name)}</div>
    <div class="field"><span class="lbl">What</span><div class="tchips" id="vt-k">${Object.entries(MEASURES).map(([key, m]) => `<button type="button" data-k="${key}" class="${key === k ? 'on' : ''}">${m.l}</button>`).join('')}</div></div>
    <div class="field"><label for="vt-v" id="vt-l"></label><input class="input bpin num" id="vt-v" type="number" inputmode="decimal"></div>
    <div id="vt-flag"></div>
    <div class="field"><label for="vt-when">Date and time</label><input class="input" id="vt-when" type="datetime-local" value="${localInputValue(Date.now())}"></div>
    <div class="field"><label for="vt-note">Note (optional)</label><input class="input" id="vt-note" maxlength="80"></div><p class="err" id="vt-err" hidden></p>`;
  const sh = openSheet({ title: 'Add measurement', body, full: true, foot: '<button class="btn" data-close>Cancel</button><button class="btn primary" data-save>Save</button>' });
  const el = sh.el, v = $('#vt-v', el);
  const setK = () => { const m = MEASURES[k]; $('#vt-l', el).textContent = tr(m.l) + ' (' + m.u + ')'; v.step = m.step; v.min = m.min; v.max = m.max; $$('#vt-k button', el).forEach(b => b.classList.toggle('on', b.dataset.k === k)); flag(); };
  const flag = () => { const x = parseFloat(String(v.value).replace(',', '.')), f = isFinite(x) ? vitalFlag(k, x) : null; $('#vt-flag', el).innerHTML = f ? `<div class="ocr-msg warn"><b>${esc(tr(f[0]))}</b></div>` : ''; };
  $$('#vt-k button', el).forEach(b => b.onclick = () => { k = b.dataset.k; setK(); v.focus(); });
  v.addEventListener('input', flag); setK(); setTimeout(() => v.focus(), 60);
  $('[data-save]', el).onclick = async () => {
    const m = MEASURES[k], x = parseFloat(String(v.value).replace(',', '.'));
    if (!isFinite(x) || x < m.min || x > m.max) { const er = $('#vt-err', el); er.textContent = T('Enter a value between {a} and {b} {u}.', { a: m.min, b: m.max, u: m.u }); er.hidden = false; return; }
    const ts = $('#vt-when', el).value ? new Date($('#vt-when', el).value).getTime() : Date.now();
    await DB.put('vitals', { id: uid(), profileId: p.id, ts, k, v: Math.round(x * 10) / 10, src: 'manual', note: $('#vt-note', el).value.trim(), created: Date.now() });
    if (k === 'weight' && (!p.wTs || ts >= p.wTs)) { p.weight = Math.round(x * 10) / 10; p.wTs = ts; await DB.put('profiles', p); }
    sh.close(); await loadReadings(); render(); toast('Saved');
  };
}
function vitalHistory(k) {
  const p = cur(); if (!p) return; const m = MEASURES[k];
  const list = (S.vitals || []).filter(x => x.k === k);
  openSheet({ title: m.l, full: true, body: list.length ? `${k === 'weight' && list.length > 1 ? vitalChart(list.slice(0, 60).reverse()) : ''}<div class="mlist">${list.slice(0, 200).map(x => `<div class="mrow" style="cursor:default"><span style="flex:1"><b class="num">${fmtMeasure(k, x.v)}</b>${k === 'weight' && bmiOf(p, x.v) ? ` <span class="small muted">BMI ${bmiOf(p, x.v)}</span>` : ''}<br><span class="small muted">${esc(fmtDate(x.ts, { day: 'numeric', month: 'short', year: 'numeric' }))}, ${esc(fmtTime(x.ts))}${x.note ? ' · ' + esc(x.note) : ''}</span></span><button class="btn sm" data-vitdel="${esc(x.id)}" aria-label="Delete">✕</button></div>`).join('')}</div>` : '<p class="muted">Nothing yet.</p>',
    foot: `<button class="btn" data-close>Close</button><button class="btn primary" data-vit="add" data-k="${k}">Add</button>` });
}
function vitalChart(list) {
  const W = 320, H = 120, xs = list.map(x => x.ts), ys = list.map(x => x.v);
  const x0 = Math.min(...xs), x1 = Math.max(...xs) || x0 + 1, y0 = Math.min(...ys) - 1, y1 = Math.max(...ys) + 1;
  const X = t => 8 + (t - x0) / ((x1 - x0) || 1) * (W - 16), Y = v => H - 14 - (v - y0) / ((y1 - y0) || 1) * (H - 28);
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Weight trend" style="width:100%;height:auto;margin-bottom:8px"><polyline fill="none" stroke="var(--accent)" stroke-width="2" points="${list.map(x => X(x.ts).toFixed(1) + ',' + Y(x.v).toFixed(1)).join(' ')}"/>${list.map(x => `<circle cx="${X(x.ts).toFixed(1)}" cy="${Y(x.v).toFixed(1)}" r="2.5" fill="var(--accent)"/>`).join('')}<text x="4" y="12" font-size="10" fill="currentColor">${Math.round(y1)}</text><text x="4" y="${H - 2}" font-size="10" fill="currentColor">${Math.round(y0)}</text></svg>`;
}
document.addEventListener('click', async e => {
  const t = e.target.closest('[data-vit],[data-vitdel]'); if (!t) return;
  if (t.dataset.vitdel) {
    if (!(await confirmSheet('Delete?', 'Delete this measurement?', 'Delete', true))) return;
    await DB.del('vitals', t.dataset.vitdel); await loadReadings(); render();
    const top = sheetStack[sheetStack.length - 1]; if (top) top.close(); return;
  }
  const a = t.dataset.vit;
  if (a === 'add') { const top = t.closest('.sheet-wrap') && sheetStack.find(s => s.el === t.closest('.sheet-wrap')); if (top) top.close(); vitalSheet(t.dataset.k); }
  else vitalHistory(a);
});

/* ------------------------------------------------------------------ PDF page */
async function pdfVitalsPage(c, p, from, to) {
  let list = []; try { list = (await DB.byProfile(p.id, 'vitals')).filter(x => x.ts >= from && x.ts <= to + 864e5).sort((a, b) => b.ts - a.ts); } catch { list = []; }
  if (!list.length) return;
  const { doc, put, M, INK, MUTED, LINE } = c;
  doc.addPage(); let y = 20;
  put('Body measurements and vitals', M, y, 14, INK, true); y += 6;
  const w = list.filter(x => x.k === 'weight');
  if (w.length) {
    const b = bmiOf(p, w[0].v);
    put(`Weight ${w[0].v} kg${b ? `, BMI ${b} (${bmiCat(b)[0]})` : ''}${w.length > 1 ? `; change over the period ${(w[0].v - w[w.length - 1].v > 0 ? '+' : '') + Math.round((w[0].v - w[w.length - 1].v) * 10) / 10} kg` : ''}.`, M, y, 9.5, INK, true); y += 5;
  }
  put('Sources: typed in, Bluetooth devices, Apple Health or Health Connect.', M, y, 8.5, MUTED); y += 3;
  doc.autoTable({ startY: y + 1, head: [['Date', 'Measurement', 'Value', 'Source / note']],
    body: list.slice(0, 120).map(x => [fmtDate(x.ts, { day: '2-digit', month: 'short', year: 'numeric' }) + ', ' + fmtTime(x.ts), MEASURES[x.k] ? MEASURES[x.k].l.replace('₂', '2') : x.k, fmtMeasure(x.k, x.v) + (x.pulse ? ' (pulse ' + x.pulse + ')' : ''), [x.src === 'ble' ? 'Bluetooth' : x.src === 'health' ? 'Health app' : '', x.note || ''].filter(Boolean).join(' · ')]),
    margin: { left: M, right: M, bottom: 20 }, theme: 'grid', styles: { fontSize: 8.5, cellPadding: 1.5, textColor: INK, lineColor: LINE, lineWidth: 0.15 },
    headStyles: { fillColor: [11, 110, 105], textColor: [255, 255, 255] } });
}
