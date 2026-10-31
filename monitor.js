/* Family Health Tracker — reads hospital / clinic patient-monitor screens (printed digits such as "158/115"),
   on the device. © 2026 Asrar Ahmed Junedi. All rights reserved. */
'use strict';

const BPMonitor = (() => {
  const base = new URL('lib/lab/', document.baseURI).href;
  let workerP = null, scriptP = null;
  function loadScript() {
    if (window.Tesseract) return Promise.resolve();
    if (!scriptP) scriptP = new Promise((res, rej) => { const s = document.createElement('script'); s.src = base + 'tesseract.min.js'; s.onload = res; s.onerror = () => { scriptP = null; rej(new Error('Could not load the screen reader')); }; document.head.appendChild(s); });
    return scriptP;
  }
  async function worker() {
    await loadScript();
    if (!workerP) workerP = Tesseract.createWorker('eng', 1, { workerPath: base + 'worker.min.js', corePath: base, langPath: base, gzip: false, cacheMethod: 'none', workerBlobURL: false })
      .then(async w => { await w.setParameters({ tessedit_pageseg_mode: '11', tessedit_char_whitelist: '0123456789/()PRBbpmSYDIAsyd. -' }); return w; })
      .catch(e => { workerP = null; throw e; });
    return workerP;
  }

  /* bright coloured text on a dark screen -> dark text on white */
  function prep(img, maxSide, invert, deg) {
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    const sc = Math.min(2.5, maxSide / Math.max(iw, ih));
    const c = document.createElement('canvas'); c.width = Math.round(iw * sc); c.height = Math.round(ih * sc);
    const x = c.getContext('2d', { willReadFrequently: true });
    if (deg) { x.fillStyle = '#000'; x.fillRect(0, 0, c.width, c.height); x.translate(c.width / 2, c.height / 2); x.rotate(deg * Math.PI / 180); x.translate(-c.width / 2, -c.height / 2); }
    x.drawImage(img, 0, 0, c.width, c.height); x.setTransform(1, 0, 0, 1, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height), p = d.data;
    for (let i = 0; i < p.length; i += 4) {
      const v = Math.max(p[i], p[i + 1], p[i + 2]);          // coloured digits are bright in at least one channel
      const o = invert ? 255 - v : v; p[i] = p[i + 1] = p[i + 2] = o;
    }
    x.putImageData(d, 0, 0);
    return { c, sc };
  }

  function words(res, sc) {
    const out = [];
    for (const w of (res.data && res.data.words) || []) {
      const t = (w.text || '').trim(); if (!t) continue;
      const b = w.bbox;
      out.push({ t, x0: b.x0 / sc, x1: b.x1 / sc, y0: b.y0 / sc, y1: b.y1 / sc, h: (b.y1 - b.y0) / sc, cx: (b.x0 + b.x1) / 2 / sc, cy: (b.y0 + b.y1) / 2 / sc, conf: w.confidence || 0 });
    }
    return out;
  }

  /* join words into lines (same height band), keep geometry */
  function lines(ws) {
    const L = [];
    for (const w of ws.slice().sort((a, b) => a.cx - b.cx)) {
      let l = L.find(l => Math.abs(l.cy - w.cy) < Math.min(l.h, w.h) * 0.5 && Math.min(l.h, w.h) / Math.max(l.h, w.h) > 0.55 && w.x0 - l.x1 < Math.max(l.h, w.h) * 1.6);
      if (!l) { l = { ws: [], cy: w.cy, h: w.h, x0: w.x0, x1: w.x1 }; L.push(l); }
      l.ws.push(w); l.x1 = Math.max(l.x1, w.x1); l.h = Math.max(l.h, w.h);
    }
    for (const l of L) l.text = l.ws.map(w => w.t).join(' ');
    return L;
  }

  function parse(ws) {
    const L = lines(ws);
    // SYS/DIA: "ddd/dd" pair, the tallest one on screen (history tables are small)
    let best = null;
    for (const l of L) {
      const re = /(\d{2,3})\s*\/\s*(\d{2,3})/g; let m;
      while ((m = re.exec(l.text))) {
        const s = +m[1], d = +m[2];
        if (s < 60 || s > 280 || d < 30 || d > 180 || d >= s) continue;
        if (!best || l.h > best.h * 1.05) best = { sys: s, dia: d, h: l.h, cy: l.cy, x0: l.x0, x1: l.x1, line: l };
      }
    }
    // fall back: two tall numbers side by side (the slash was not recognised)
    if (!best) {
      const nums = ws.filter(w => /^\d{2,3}$/.test(w.t)).sort((a, b) => b.h - a.h);
      for (const a of nums) for (const b of nums) {
        if (a === b || b.x0 < a.x1 || Math.abs(a.cy - b.cy) > a.h * 0.4 || Math.min(a.h, b.h) / Math.max(a.h, b.h) < 0.75) continue;
        const s = +a.t, d = +b.t; if (s < 60 || s > 280 || d < 30 || d > 180 || d >= s) continue;
        if (b.x0 - a.x1 > a.h * 1.5) continue;
        if (!best || a.h > best.h) best = { sys: s, dia: d, h: Math.max(a.h, b.h), cy: a.cy, x0: a.x0, x1: b.x1 };
      }
    }
    if (!best) return null;
    const map = Math.round((best.sys + 2 * best.dia) / 3);
    // pulse: the biggest stand-alone number that is not the MAP (in brackets) and not part of the BP line
    let pulse = null, pScore = -1;
    for (const w of ws) {
      const t = w.t.replace(/[^\d()]/g, '');
      if (!/^\d{2,3}$/.test(t)) continue;
      const v = +t; if (v < 30 || v > 220) continue;
      if (Math.abs(v - map) <= 3 && /[()]/.test(w.t + '')) continue;
      if (best.line && best.line.ws.includes(w)) continue;
      if (Math.abs(w.cy - best.cy) < best.h * 0.6 && w.x0 > best.x0 - best.h && w.x1 < best.x1 + best.h * 3) continue; // MAP printed next to BP
      if (w.h < best.h * 0.3) continue;
      // reward a "PR" / "PUL" / "bpm" label nearby
      const lab = ws.some(o => /^(PR|PUL|bpm|PR-?NIBP)$/i.test(o.t) && Math.abs(o.cx - w.cx) < w.h * 4 && o.cy < w.cy + w.h && o.cy > w.cy - w.h * 3);
      const sc = w.h / best.h + (lab ? 0.5 : 0) + w.conf / 400;
      if (sc > pScore) { pScore = sc; pulse = v; }
    }
    return { sys: best.sys, dia: best.dia, pulse, sure: { sys: true, dia: true, pulse: pulse != null } };
  }

  /* ---- find lines of large characters with our own image tools, then read each line */
  function grayOf(c) {
    const w = c.width, h = c.height, d = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data, g = new Float32Array(w * h);
    for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = d[j];
    return { g, w, h };
  }
  function textLines(G, wdiv, k, minFrac, maxFrac) {
    const T = BPOCR._t, II = T.integral(G.g, G.w, G.h), unit = Math.min(G.w, G.h);
    let ink;
    if (wdiv === 'otsu') { const t = T.otsu(G.g); ink = new Uint8Array(G.g.length); for (let i = 0; i < ink.length; i++) if (G.g[i] < t) ink[i] = 1; }
    else ink = T.binarize(G, II, Math.max(31, Math.round(unit / (wdiv || 8))) | 1, k || 0.15, true);
    const all = T.components(ink, G.w, G.h), lab = all.lab;
    const cs = all.filter(c => c.h > unit * (minFrac || 0.022) && c.h < unit * (maxFrac || 0.3) && c.w < c.h * 1.4 && c.w > c.h * 0.08 && c.n > c.w * c.h * 0.15);
    cs.sort((a, b) => a.x0 - b.x0);
    const L = [];
    for (const c of cs) {
      const cy = (c.y0 + c.y1) / 2;
      let l = L.find(l => Math.abs(l.cy - cy) < l.h * 0.35 && Math.min(l.h, c.h) / Math.max(l.h, c.h) > 0.6 && c.x0 - l.x1 < l.h * (minFrac ? 1.6 : 1.1));
      if (!l) { l = { cs: [], cy, h: c.h, x0: c.x0, x1: c.x1, y0: c.y0, y1: c.y1 }; L.push(l); }
      l.cs.push(c); l.x1 = Math.max(l.x1, c.x1); l.y0 = Math.min(l.y0, c.y0); l.y1 = Math.max(l.y1, c.y1);
      l.h = (l.h * (l.cs.length - 1) + c.h) / l.cs.length; l.cy = (l.cy * (l.cs.length - 1) + cy) / l.cs.length;
    }
    // keep lines whose pieces look like characters: similar height, character-like width and fill
    const charLike = c => c.w / c.h >= 0.12 && c.w / c.h <= 0.95 && c.n / (c.w * c.h) >= 0.18 && c.n / (c.w * c.h) <= 0.8;
    const maxN = minFrac ? 80 : 14;
    const out = L.filter(l => l.cs.length >= 2 && l.cs.length <= maxN && l.cs.filter(charLike).length >= Math.max(2, l.cs.length * 0.6)).sort((a, b) => b.h - a.h);
    for (const l of out) { l.lab = lab; l.W = G.w; l.ids = new Set(l.cs.map(c => c.id)); }
    return out;
  }
  function rawLineCanvas(src, l, H) {
    const pad = Math.round(l.h * 0.3), x0 = Math.max(0, l.x0 - pad), y0 = Math.max(0, l.y0 - pad), x1 = Math.min(src.width, l.x1 + pad), y1 = Math.min(src.height, l.y1 + pad);
    const k = (H || 52) / l.h, c = document.createElement('canvas'); c.width = Math.max(8, Math.round((x1 - x0) * k)); c.height = Math.max(8, Math.round((y1 - y0) * k));
    const x = c.getContext('2d', { willReadFrequently: true }); x.imageSmoothingQuality = 'high'; x.drawImage(src, x0, y0, x1 - x0, y1 - y0, 0, 0, c.width, c.height);
    const d = x.getImageData(0, 0, c.width, c.height), p = d.data, vals = []; for (let i = 0; i < p.length; i += 4) vals.push(p[i]);
    const t = BPOCR._t.otsu(vals); for (let i = 0; i < p.length; i += 4) { const v = p[i] < t ? 0 : 255; p[i] = p[i + 1] = p[i + 2] = v; }
    x.putImageData(d, 0, 0); return c;
  }
  /* draw only this line's own characters, black on white, at a size the text engine likes */
  function lineCanvas(src, l, H) {
    const pad = Math.round(l.h * 0.4), x0 = Math.max(0, l.x0 - pad), y0 = Math.max(0, l.y0 - pad), x1 = Math.min(src.width, l.x1 + pad), y1 = Math.min(src.height, l.y1 + pad);
    const bw = x1 - x0, bh = y1 - y0, m = document.createElement('canvas'); m.width = bw; m.height = bh;
    const mx = m.getContext('2d'), d = mx.createImageData(bw, bh), p = d.data;
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
      const on = l.ids.has(l.lab[(y + y0) * l.W + x + x0]), q = (y * bw + x) * 4;
      p[q] = p[q + 1] = p[q + 2] = on ? 0 : 255; p[q + 3] = 255;
    }
    mx.putImageData(d, 0, 0);
    const k = (H || 52) / l.h, c = document.createElement('canvas'); c.width = Math.max(8, Math.round(bw * k)); c.height = Math.max(8, Math.round(bh * k));
    const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(m, 0, 0, c.width, c.height);
    return c;
  }

  /* "158/115", "190(110", "201/114(133" or "1901110" (slash read as 1) -> [sys, dia] */
  function bpPair(t) {
    const ok = (sv, dv) => sv >= 60 && sv <= 280 && dv >= 30 && dv <= 180 && dv < sv;
    const m = t.match(/(\d{2,3})\s*[\/(|\\\[{!]\s*(\d{2,3})/);
    if (m && ok(+m[1], +m[2])) return [+m[1], +m[2]];
    const d = (t.match(/\d{5,7}/) || [''])[0];
    for (const [a, sep] of [[3, 1], [2, 1], [3, 0], [2, 0]]) {
      if (sep && d[a] !== '1') continue;
      const sv = +d.slice(0, a), dv = +d.slice(a + sep, a + sep + 3);
      const rest = d.slice(a + sep);
      if (rest.length >= 2 && rest.length <= 3 && ok(sv, +rest)) return [sv, +rest];
    }
    return null;
  }

  async function read(blob, onStatus) {
    const r1 = await readAt(blob, onStatus, 1100);
    if (r1 && r1.pulse != null) return r1;
    const r2 = await readAt(blob, onStatus, 2200);      // small or distant screen: look closer
    if (r1 && r2 && r2.sys === r1.sys && r2.dia === r1.dia && r2.pulse != null) return r2;
    if (r1 || r2) return r1 || r2;
    for (const deg of [12, -12, 18, -18, 7, -7]) {      // tilted photo: try straightening it
      const r = await readAt(blob, onStatus, 1800, deg);
      if (r) return r;
    }
    return null;
  }
  async function readAt(blob, onStatus, side, deg) {
    const say = s => { try { onStatus && onStatus(s); } catch { /* ignore */ } };
    say('Reading the monitor screen…');
    const w = await worker();
    await w.setParameters({ tessedit_pageseg_mode: '7', tessedit_char_whitelist: '0123456789/()' });
    const url = URL.createObjectURL(blob);
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Could not open photo')); i.src = url; });
      // collect text lines from both polarities and two thresholds (screens mix light-on-dark and dark-on-light)
      const pool = [];
      for (const inv of [true, false]) {
        const { c } = prep(img, side, inv, deg); const G = grayOf(c);
        for (const [wd, k] of [[8, 0.15], [5, 0.25], ['otsu', 0], [14, 0.2]]) for (const l of textLines(G, wd, k).slice(0, 14)) {
          if (pool.some(p => Math.abs(p.l.x0 - l.x0) < l.h * 0.5 && Math.abs(p.l.x1 - l.x1) < l.h * 0.5 && Math.abs(p.l.cy - l.cy) < l.h * 0.4)) continue;
          pool.push({ l, c });
        }
      }
      pool.sort((a, b) => b.l.h - a.l.h);
      const read1 = [];
      let n = 0;
      for (const { l, c } of pool.slice(0, 16)) {
        say(`Reading the monitor screen\u2026 ${Math.round(++n / Math.min(16, pool.length) * 100)}%`);
        const texts = [];
        for (const cv of [lineCanvas(c, l, 52), rawLineCanvas(c, l, 52)]) { const r = await w.recognize(cv); texts.push({ t: ((r.data && r.data.text) || '').replace(/\s+/g, ' ').trim(), conf: r.data ? r.data.confidence : 0 }); }
        read1.push({ l, texts, c });
      }
      // second look, at more sizes, for lines that look like a reading (digits, maybe a slash)
      for (const x of read1) {
        if (!x.texts.some(t => /\d/.test(t.t) && (bpPair(t.t) || /^\(?\d{1,3}\)?$/.test(t.t.replace(/\s/g, '')) || /\d{2,3}\s*\//.test(t.t)))) continue;
        for (const cv of [lineCanvas(x.c, x.l, 34), rawLineCanvas(x.c, x.l, 72), lineCanvas(x.c, x.l, 80), rawLineCanvas(x.c, x.l, 40)]) { const r = await w.recognize(cv); x.texts.push({ t: ((r.data && r.data.text) || '').replace(/\s+/g, ' ').trim(), conf: r.data ? r.data.confidence : 0 }); }
      }
      // SYS/DIA: vote across renderings; prefer the tallest line
      const votes = {};
      for (const x of read1) for (const t of x.texts) {
        const m = bpPair(t.t); if (!m) continue;
        const key = m.join('/'); const v = votes[key] || (votes[key] = { m, score: 0, x });
        v.score += x.l.h * (1 + t.conf / 100); if (x.l.h > v.x.l.h) v.x = x;
      }
      // a SYS line ending with "/" plus a DIA line right next to it (e.g. DIA shown in a highlighted box)
      for (const x of read1) for (const t of x.texts) {
        const ms = t.t.match(/^(\d{2,3})\s*\/$/); if (!ms) continue;
        for (const y of read1) {
          if (y === x || Math.abs(y.l.cy - x.l.cy) > x.l.h * 0.5 || y.l.x0 < x.l.x1 - x.l.h * 0.3 || y.l.x0 - x.l.x1 > x.l.h * 1.2) continue;
          for (const u of y.texts) { const md = u.t.match(/^(\d{2,3})\b/); if (!md) continue; const sv = +ms[1], dv = +md[1];
            if (sv >= 60 && sv <= 280 && dv >= 30 && dv <= 180 && dv < sv) { const key = sv + '/' + dv; const v = votes[key] || (votes[key] = { m: [sv, dv], score: 0, x }); v.score += x.l.h; } }
        }
      }
      const bpv = Object.values(votes).sort((a, b) => b.score - a.score)[0];
      if (!bpv) return null;
      const bp = { sys: bpv.m[0], dia: bpv.m[1], x: bpv.x };
      const map = Math.round((bp.sys + 2 * bp.dia) / 3);
      const pv = {};
      for (const x of read1) {
        if (x === bp.x || x.l.h < bp.x.l.h * 0.3 || x.l.h > bp.x.l.h * 1.2) continue;
        if (Math.abs(x.l.cy - bp.x.l.cy) < bp.x.l.h * 0.8 && x.l.x0 > bp.x.l.x1 - bp.x.l.h) continue;   // the MAP printed right after the BP
        for (const t of x.texts) {
          if (t.t.includes('/') || bpPair(t.t)) continue;
          const plain = t.t.replace(/\([^)]*\)?/g, ' ');
          const ms = plain.match(/\b\d{2,3}\b/g) || [];
          if (ms.length !== 1) continue;                      // a pulse stands alone
          const v = +ms[0]; if (v < 30 || v > 220 || (Math.abs(v - map) <= 2 && /\(/.test(t.t))) continue;
          pv[v] = (pv[v] || 0) + x.l.h * (1 + t.conf / 100);
        }
      }
      const pb = Object.entries(pv).sort((a, b) => b[1] - a[1])[0];
      const tot = Object.values(votes).reduce((a, v) => a + v.score, 0);
      const found = { sys: bp.sys, dia: bp.dia, pulse: pb ? +pb[0] : null, sure: { sys: bpv.score >= tot * 0.7, dia: bpv.score >= tot * 0.7, pulse: !!pb } };
      return found;
    } finally { URL.revokeObjectURL(url); }
  }

  /* read every line of printed text on a page (for reports such as ECG printouts) */
  async function pageLines(canvas, opts) {
    const o = opts || {};
    const w = await worker();
    await w.setParameters({ tessedit_pageseg_mode: '7', tessedit_char_whitelist: '' });
    const G = grayOf(canvas), out = [];
    const L = textLines(G, o.wdiv || 20, o.k || 0.2, o.minFrac || 0.006, o.maxFrac || 0.05).filter(l => l.cs.length >= 3);
    L.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
    for (const l of L.slice(0, o.max || 90)) {
      const r = await w.recognize(lineCanvas(canvas, l, 40));
      const t = ((r.data && r.data.text) || '').replace(/\s+/g, ' ').trim();
      if (t) out.push({ t, h: l.h, cy: l.cy, x0: l.x0, x1: l.x1, conf: r.data ? r.data.confidence : 0 });
      if (o.onLine) o.onLine(out.length, L.length);
    }
    return out;
  }

  return { read, pageLines, _prep: prep, _lines: textLines, _gray: grayOf, _lineCanvas: lineCanvas };
})();
