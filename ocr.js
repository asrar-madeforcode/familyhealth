/* Family Health Tracker photo reader — reads SYS / DIA / pulse from a photo of a blood pressure monitor,
   entirely on the device. It finds seven-segment digits and checks which of the 7 bars are lit.
   © 2026 Asrar Ahmed Junedi. All rights reserved. */
'use strict';

const BPOCR = (() => {
  const ABL = Object.assign({ seg: 1 }, (typeof window !== 'undefined' && window.__abl) || {});   // the bar-row reader stays off: it added wrong readings in testing
  /* ---------- image helpers */
  function toCanvas(img, maxSide) {
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
    const sc = Math.min(1, maxSide / Math.max(iw, ih));
    const c = document.createElement('canvas'); c.width = Math.round(iw * sc); c.height = Math.round(ih * sc);
    c.getContext('2d', { willReadFrequently: true }).drawImage(img, 0, 0, c.width, c.height);
    return c;
  }
  function gray(c) {
    const w = c.width, h = c.height; const d = c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
    const g = new Float32Array(w * h);
    for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = 0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2];
    return { g, w, h };
  }
  function integral(g, w, h) {
    const W1 = w + 1, I = new Float64Array(W1 * (h + 1)), I2 = new Float64Array(W1 * (h + 1));
    for (let y = 0; y < h; y++) {
      let s = 0, s2 = 0;
      for (let x = 0; x < w; x++) { const v = g[y * w + x]; s += v; s2 += v * v; I[(y + 1) * W1 + x + 1] = I[y * W1 + x + 1] + s; I2[(y + 1) * W1 + x + 1] = I2[y * W1 + x + 1] + s2; }
    }
    return { I, I2 };
  }
  /* Local (Sauvola) threshold. dark=true: ink is darker than its surroundings. */
  function binarize(G, II, win, k, dark) {
    const { g, w, h } = G, { I, I2 } = II, out = new Uint8Array(w * h), r = win >> 1, W1 = w + 1;
    for (let y = 0; y < h; y++) {
      const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
      for (let x = 0; x < w; x++) {
        const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1), n = (x1 - x0) * (y1 - y0);
        const s = I[y1 * W1 + x1] - I[y0 * W1 + x1] - I[y1 * W1 + x0] + I[y0 * W1 + x0];
        const s2 = I2[y1 * W1 + x1] - I2[y0 * W1 + x1] - I2[y1 * W1 + x0] + I2[y0 * W1 + x0];
        const m = s / n, sd = Math.sqrt(Math.max(0, s2 / n - m * m)), v = g[y * w + x];
        if (sd < 8) continue;
        if (dark) { if (v < m * (1 + k * (sd / 128 - 1))) out[y * w + x] = 1; }
        else if ((255 - v) < (255 - m) * (1 + k * (sd / 128 - 1))) out[y * w + x] = 1;
      }
    }
    return out;
  }
  function dilate(b, w, h, rx, ry) {
    const t = new Uint8Array(w * h), o = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      let last = -1e9; for (let x = 0; x < w; x++) { if (b[y * w + x]) last = x; if (x - last <= rx) t[y * w + x] = 1; }
      last = 1e9; for (let x = w - 1; x >= 0; x--) { if (b[y * w + x]) last = x; if (last - x <= rx) t[y * w + x] = 1; }
    }
    for (let x = 0; x < w; x++) {
      let last = -1e9; for (let y = 0; y < h; y++) { if (t[y * w + x]) last = y; if (y - last <= ry) o[y * w + x] = 1; }
      last = 1e9; for (let y = h - 1; y >= 0; y--) { if (t[y * w + x]) last = y; if (last - y <= ry) o[y * w + x] = 1; }
    }
    return o;
  }
  function components(b, w, h) {
    const lab = new Int32Array(w * h), comps = [], stack = new Int32Array(w * h);
    let id = 0;
    for (let i = 0; i < w * h; i++) {
      if (!b[i] || lab[i]) continue;
      id++; let sp = 0; stack[sp++] = i; lab[i] = id;
      let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, n = 0;
      while (sp) {
        const p = stack[--sp], x = p % w, y = (p / w) | 0; n++;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        if (x > 0 && b[p - 1] && !lab[p - 1]) { lab[p - 1] = id; stack[sp++] = p - 1; }
        if (x < w - 1 && b[p + 1] && !lab[p + 1]) { lab[p + 1] = id; stack[sp++] = p + 1; }
        if (y > 0 && b[p - w] && !lab[p - w]) { lab[p - w] = id; stack[sp++] = p - w; }
        if (y < h - 1 && b[p + w] && !lab[p + w]) { lab[p + w] = id; stack[sp++] = p + w; }
      }
      comps.push({ id, x0, y0, x1, y1, n, w: x1 - x0 + 1, h: y1 - y0 + 1 });
    }
    comps.lab = lab;
    return comps;
  }

  /* ---------- seven-segment classification
     bit order: a b c d e f g  (a=top, b=top-right, c=bottom-right, d=bottom, e=bottom-left, f=top-left, g=middle) */
  const CODES = { 0: 0b1111110, 1: 0b0110000, 2: 0b1101101, 3: 0b1111001, 4: 0b0110011, 5: 0b1011011, 6: 0b1011111, 7: 0b1110000, 8: 0b1111111, 9: 0b1111011 };
  const ALT = { 0b1110010: 7, 0b0011111: 6, 0b1110011: 9 }; // 7 with f, 6 without a, 9 without d
  // zones in unit box: [u0,u1,v0,v1]
  const ZONES = [[0.32, 0.68, 0.0, 0.14], [0.76, 1.0, 0.16, 0.36], [0.76, 1.0, 0.64, 0.84], [0.32, 0.68, 0.86, 1.0], [0.0, 0.24, 0.64, 0.84], [0.0, 0.24, 0.16, 0.36], [0.32, 0.68, 0.43, 0.57]];
  function zoneInk(raw, w, box, z, slant) {
    let ink = 0, tot = 0; const steps = 9;
    for (let a = 0; a < steps; a++) for (let c = 0; c < steps; c++) {
      const u = z[0] + (z[1] - z[0]) * (a + 0.5) / steps, v = z[2] + (z[3] - z[2]) * (c + 0.5) / steps;
      const x = Math.round(box.x0 + (u + slant * (0.5 - v)) * (box.w - 1) / (1 + Math.abs(slant))), y = Math.round(box.y0 + v * (box.h - 1));
      if (x < box.x0 || x > box.x1) continue;
      tot++; if (raw[y * w + x]) ink++;
    }
    return tot ? ink / tot : 0;
  }
  function decode(code) {
    for (const [k, v] of Object.entries(CODES)) if (v === code) return { d: +k, dist: 0 };
    if (ALT[code] != null) return { d: ALT[code], dist: 0 };
    for (const [k, v] of Object.entries(CODES)) { let x = v ^ code, c = 0; while (x) { c += x & 1; x >>= 1; } if (c === 1 && +k !== 1) return { d: +k, dist: 1 }; }
    return null;
  }
  function zoneValue(G, box, z, slant, dark) {
    const vals = [], steps = 9;
    for (let a = 0; a < steps; a++) for (let c = 0; c < steps; c++) {
      const u = z[0] + (z[1] - z[0]) * (a + 0.5) / steps, v = z[2] + (z[3] - z[2]) * (c + 0.5) / steps;
      const x = Math.round(box.x0 + (u + slant * (0.5 - v)) * (box.w - 1) / (1 + Math.abs(slant))), y = Math.round(box.y0 + v * (box.h - 1));
      if (x < box.x0 || x > box.x1) continue;
      vals.push(G.g[y * G.w + x]);
    }
    if (!vals.length) return null;
    vals.sort((a, b) => dark ? a - b : b - a);
    const n = Math.max(1, Math.round(vals.length * 0.5)); let s = 0; for (let i = 0; i < n; i++) s += vals[i];
    return s / n;
  }
  /* how strongly each bar is lit, compared with the LCD background around the digit */
  function classify(raw, G, box, dark) {
    const w = G.w, bgv = [];
    const pad = Math.round(box.h * 0.08);
    for (let y = Math.max(0, box.y0 - pad); y <= Math.min(G.h - 1, box.y1 + pad); y += 2) for (let x = Math.max(0, box.x0 - pad); x <= Math.min(w - 1, box.x1 + pad); x += 2) if (!raw[y * w + x]) bgv.push(G.g[y * w + x]);
    if (bgv.length < 10) return null;
    bgv.sort((a, b) => a - b);
    const bg = bgv[dark ? Math.floor(bgv.length * 0.8) : Math.floor(bgv.length * 0.2)];
    const ink = v => Math.max(0, dark ? bg - v : v - bg);
    if (box.w / box.h < 0.38) {
      let rows = 0, s = 0, n = 0;
      for (let y = box.y0; y <= box.y1; y++) { let hit = false; for (let x = box.x0; x <= box.x1; x++) if (raw[y * w + x]) { hit = true; s += ink(G.g[y * w + x]); n++; } if (hit) rows++; }
      return rows / box.h > 0.7 && n ? { d: 1, q: 0.6, strength: s / n } : null;
    }
    let best = null;
    for (const slant of [0, 0.12, 0.22, -0.1]) {
      const vals = ZONES.map(z => zoneValue(G, box, z, slant, dark));
      if (vals.some(v => v == null)) continue;
      const dk = vals.map(ink); const mx = Math.max(...dk);
      if (mx < 14) continue;
      // split the 7 bar strengths into lit / unlit at the biggest natural gap
      const srt = dk.slice().sort((x, y) => x - y);
      let thr = mx * 0.5, bestGap = 0;
      for (let i = 0; i < 6; i++) { const gap = srt[i + 1] - srt[i]; if (gap > bestGap) { bestGap = gap; thr = (srt[i] + srt[i + 1]) / 2; } }
      if (srt[0] > mx * 0.62) thr = srt[0] * 0.5;          // every bar lit: an 8
      else if (bestGap < mx * 0.2) thr = mx * 0.5;         // no clear gap: fall back
      let code = 0, margin = 1;
      dk.forEach((r, i) => { if (r > thr) code |= 1 << (6 - i); margin = Math.min(margin, Math.abs(r - thr) / mx); });
      // second opinion from the black-and-white image: a bar is lit if it is mostly inked and clearly dark
      const fr = ZONES.map(z => zoneInk(raw, w, box, z, slant));
      let code2 = 0; fr.forEach((f, i) => { if (f > 0.3 && dk[i] > mx * 0.4) code2 |= 1 << (6 - i); });
      for (const [cd, bonus] of [[code, 0], [code2, -0.05]]) {
        const r = decode(cd); if (!r) continue;
        const q = (cd === code ? margin : 0.3) + bonus - (r.dist ? 0.25 : 0) + (code === code2 ? 0.1 : 0);
        if (!best || q > best.q) best = { d: r.d, q, strength: mx };
      }
    }
    return best;
  }

  /* ---------- find numbers in one binarized image */
  function numbersIn(raw, G, dark, opt) {
    const w = G.w, h = G.h;
    const unit = Math.min(w, h);
    const panel = !!(opt && opt.panel);
    const minH = opt && opt.minH || unit * 0.05, maxH = opt && opt.maxH || unit * 0.45;
    if (panel) {
      // peel away a dark frame along the edges: rows/columns that are mostly ink, working inward
      raw = raw.slice();
      const rowInk = y => { let n = 0; for (let x = 0; x < w; x++) n += raw[y * w + x]; return n / w; };
      const colInk = x => { let n = 0; for (let y = 0; y < h; y++) n += raw[y * w + x]; return n / h; };
      for (let y = 0; y < h * 0.3 && rowInk(y) > 0.55; y++) for (let x = 0; x < w; x++) raw[y * w + x] = 0;
      for (let y = h - 1; y > h * 0.7 && rowInk(y) > 0.55; y--) for (let x = 0; x < w; x++) raw[y * w + x] = 0;
      for (let x = 0; x < w * 0.2 && colInk(x) > 0.55; x++) for (let y = 0; y < h; y++) raw[y * w + x] = 0;
      for (let x = w - 1; x > w * 0.8 && colInk(x) > 0.55; x--) for (let y = 0; y < h; y++) raw[y * w + x] = 0;
    }
    // remove things that cannot be digits before joining segments: the dark LCD frame, the case
    // edges, the background and specks. Otherwise digits merge with the frame and are lost.
    {
      const rc = components(raw, w, h), lab = rc.lab, drop = new Uint8Array(rc.length + 1);
      for (const c of rc) {
        const big = c.h > maxH * 1.12 || c.w > maxH * 1.6;
        const touches = c.x0 === 0 || c.y0 === 0 || c.x1 === w - 1 || c.y1 === h - 1;
        const edge = panel ? (c.w > w * 0.8 || c.h > h * 0.97) : touches && (c.h > maxH * 0.55 || c.w > maxH * 0.55);
        const speck = c.n < minH * minH * 0.015;
        const hollow = c.w > maxH * 0.9 && c.h > maxH * 0.45 && c.n < c.w * c.h * 0.25;
        if (big || edge || speck || hollow) drop[c.id] = 1;
      }
      const r2 = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) if (raw[i] && !drop[lab[i]]) r2[i] = 1;
      raw = r2;
    }
    const js = opt && opt.join || 1;
    const join = dilate(raw, w, h, Math.max(1, Math.round(js * minH / (panel ? 9 : 15))), Math.max(2, Math.round(js * minH / 4.5)));
    let comps = components(join, w, h).filter(c => c.h < maxH && c.w < maxH);
    // a loose top bar sitting on a tall thin stroke is a 7 (its segments often do not touch)
    for (let i = comps.length - 1; i >= 0; i--) {
      const A = comps[i]; if (!A || A.w < A.h * 1.5 || A.h > maxH * 0.35) continue;
      const B = comps.find(b => b !== A && b.h > A.h * 2.5 && b.w < b.h * 0.5 && b.y0 >= A.y0 && b.y0 - A.y1 < b.h * 0.2 && b.x1 >= A.x1 - A.w * 0.35 && b.x0 <= A.x1 && b.x1 <= A.x1 + A.w * 0.6);
      if (!B) continue;
      const M = { x0: Math.min(A.x0, B.x0), y0: A.y0, x1: Math.max(A.x1, B.x1), y1: B.y1, n: A.n + B.n };
      M.w = M.x1 - M.x0 + 1; M.h = M.y1 - M.y0 + 1; if (M.h > maxH) continue;
      comps.splice(comps.indexOf(B), 1); comps[comps.indexOf(A)] = M;
    }
    // join pieces stacked on top of each other (the two bars of a "1", or a digit whose middle is faint)
    for (let changed = true; changed;) {
      changed = false;
      for (let i = 0; i < comps.length && !changed; i++) for (let j = 0; j < comps.length && !changed; j++) {
        if (i === j) continue; const A = comps[i], B = comps[j];
        if (A.y0 > B.y0) continue;
        const ov = Math.min(A.x1, B.x1) - Math.max(A.x0, B.x0), nar = Math.min(A.w, B.w);
        const gap = B.y0 - A.y1, H = Math.max(A.h, B.h);
        if (ov < nar * 0.4 || gap > H * 0.3 || gap < -H * 0.5) continue;
        if (Math.min(A.h, B.h) < Math.max(A.h, B.h) * 0.45) continue;
        // only thin pieces (the two bars of a 1); two full digits above each other are different numbers
        if (A.w > A.h * 0.5 || B.w > B.h * 0.5 || Math.min(A.w, B.w) < Math.max(A.w, B.w) * 0.5) continue;
        const M = { x0: Math.min(A.x0, B.x0), y0: A.y0, x1: Math.max(A.x1, B.x1), y1: Math.max(A.y1, B.y1), n: A.n + B.n };
        M.w = M.x1 - M.x0 + 1; M.h = M.y1 - M.y0 + 1;
        if (M.h > maxH || M.w > M.h) continue;
        comps.splice(Math.max(i, j), 1); comps.splice(Math.min(i, j), 1, M); changed = true;
      }
    }
    // split boxes that hold several digits stacked on top of each other (rows set close together)
    const tall = [];
    const splitTall = c => {
      if (c.h < c.w * 2.4 || c.w < c.h * 0.28 || c.w < minH * 0.8 || c.h < minH * 2.4) { tall.push(c); return; }
      const rows = []; for (let y = c.y0; y <= c.y1; y++) { let n = 0; for (let x = c.x0; x <= c.x1; x++) n += raw[y * w + x]; rows.push(n); }
      let best = -1, bv = 1e9; const lo = Math.round(c.h * 0.25), hi = Math.round(c.h * 0.75);
      for (let i = lo; i <= hi; i++) if (rows[i] < bv) { bv = rows[i]; best = i; }
      if (best < 0 || bv > c.w * 0.04) { tall.push(c); return; }
      const t = Object.assign({}, c, { y1: c.y0 + best - 1 }), b2 = Object.assign({}, c, { y0: c.y0 + best + 1 });
      t.h = t.y1 - t.y0 + 1; b2.h = b2.y1 - b2.y0 + 1; splitTall(t); splitTall(b2);
    };
    comps.forEach(splitTall); comps = tall;
    comps = comps.filter(c => c.h > minH && c.w < c.h * 1.6 && c.n > c.w * c.h * 0.12);
    // split boxes that hold two touching digits
    const boxes = [];
    for (const c of comps) {
      if (c.w / c.h > 0.6) {
        const col = []; for (let x = c.x0; x <= c.x1; x++) { let s = 0; for (let y = c.y0; y <= c.y1; y++) s += raw[y * w + x]; col.push(s); }
        let best = -1, bv = 1e9; const lo = Math.max(Math.round(c.h * 0.06), Math.round(col.length * 0.12)), hi = col.length - Math.max(Math.round(c.h * 0.06), Math.round(col.length * 0.12));
        for (let i = lo; i < hi; i++) if (col[i] < bv || (col[i] === bv && Math.abs(i - col.length / 2) < Math.abs(best - col.length / 2))) { bv = col[i]; best = i; }
        if (best > 0 && bv < c.h * 0.06) { boxes.push(Object.assign({}, c, { x1: c.x0 + best - 1, w: best })); boxes.push(Object.assign({}, c, { x0: c.x0 + best + 1, w: c.x1 - c.x0 - best })); continue; }
      }
      boxes.push(c);
    }
    // tighten each box to the raw ink inside it
    const digits = [];
    for (const b of boxes) {
      let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1;
      for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) if (raw[y * w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      if (x1 < 0) continue;
      const box = { x0, x1, y0, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
      if (box.h < minH || box.w / box.h > 0.9) continue;
      const r = classify(raw, G, box, dark);
      if (!r) continue;
      digits.push(Object.assign(box, r, { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 }));
    }
    // group digits into numbers: same row, same height, close together
    digits.sort((a, b) => a.cx - b.cx);
    const used = new Set(), nums = [];
    for (const d of digits) {
      if (used.has(d)) continue;
      const row = [d]; used.add(d);
      let lastRight = d.x1;
      for (const e of digits) {
        if (used.has(e)) continue;
        if (Math.abs(e.cy - d.cy) > d.h * 0.25 || Math.min(e.h, d.h) / Math.max(e.h, d.h) < 0.75) continue;
        const gap = e.x0 - lastRight; if (gap < -d.h * 0.1 || gap > d.h * (e.d === 1 ? 1.05 : 0.75)) continue;
        row.push(e); used.add(e); lastRight = e.x1;
      }
      // drop faint unlit "ghost" digits (e.g. the grey 8 in front of a two-digit number)
      const top = Math.max(...row.map(x => x.strength));
      const lit = row.filter(x => x.strength >= top * 0.55);
      row.length = 0; row.push(...lit);
      if (row.length < 2 || row.length > 3) continue;
      const v = +row.map(x => x.d).join('');
      if (row[0].d === 0) continue;
      const hh = Math.max(...row.map(x => x.h));
      nums.push({ v, h: hh, x: (row[0].x0 + row[row.length - 1].x1) / 2, y: d.cy, w: row[row.length - 1].x1 - row[0].x0, q: Math.min(...row.map(x => x.q)) });
    }
    return nums;
  }

  /* ---------- find the LCD screens: light areas with dark marks inside them.
     Returns a mask of only the marks enclosed by each screen, so the dark frame around a screen
     can never touch the digits. */
  function panelMarks(G, II, ink) {
    const { g, w, h } = G, unit = Math.min(w, h), { I } = II, W1 = w + 1, r = Math.round(unit / 6);
    const light = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
      for (let x = 0; x < w; x++) {
        if (ink[y * w + x]) continue;
        const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1), n = (x1 - x0) * (y1 - y0);
        const m = (I[y1 * W1 + x1] - I[y0 * W1 + x1] - I[y1 * W1 + x0] + I[y0 * W1 + x0]) / n;
        if (g[y * w + x] > m * 0.82) light[y * w + x] = 1;
      }
    }
    const comps = components(light, w, h), lab = comps.lab;
    const out = new Uint8Array(w * h);
    let found = 0;
    for (const c of comps) {
      if (c.w < unit * 0.12 || c.h < unit * 0.08 || c.n < unit * unit * 0.01) continue;
      if (c.w > w * 0.97 && c.h > h * 0.97) continue;
      // the screen's filled shape: inside the light area's span on its row AND on its column
      const bw = c.w, bh = c.h, rL = new Int32Array(bh).fill(1e9), rR = new Int32Array(bh).fill(-1), cT = new Int32Array(bw).fill(1e9), cB = new Int32Array(bw).fill(-1);
      for (let y = c.y0; y <= c.y1; y++) for (let x = c.x0; x <= c.x1; x++) if (lab[y * w + x] === c.id) {
        const yy = y - c.y0, xx = x - c.x0;
        if (x < rL[yy]) rL[yy] = x; if (x > rR[yy]) rR[yy] = x; if (y < cT[xx]) cT[xx] = y; if (y > cB[xx]) cB[xx] = y;
      }
      let holes = 0;
      for (let y = c.y0; y <= c.y1; y++) for (let x = c.x0; x <= c.x1; x++) {
        const p = y * w + x; if (!ink[p] || lab[p] === c.id) continue;
        const yy = y - c.y0, xx = x - c.x0;
        if (x > rL[yy] && x < rR[yy] && y > cT[xx] && y < cB[xx]) { out[p] = 1; holes++; }
      }
      if (holes) found++;
    }
    return found ? out : null;
  }

  /* ---------- screens that are lighter than what surrounds them (e.g. a grey LCD set in a darker panel) */
  function lightRects(G, seeds) {
    const { g, w, h } = G, unit = Math.min(w, h), out = [];
    const II = integral(g, w, h), W1 = w + 1, r = Math.max(3, Math.round(unit / 40)), sm = new Float32Array(w * h);
    for (let y = 0; y < h; y++) { const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1); for (let x = 0; x < w; x++) { const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1); sm[y * w + x] = (II.I[y1 * W1 + x1] - II.I[y0 * W1 + x1] - II.I[y1 * W1 + x0] + II.I[y0 * W1 + x0]) / ((x1 - x0) * (y1 - y0)); } }
    // look for a solid lighter rectangle inside a region; then look again inside what was found
    const within = (R, depth) => {
      const rw = R.x1 - R.x0 + 1, rh = R.y1 - R.y0 + 1; if (rw < unit * 0.15 || rh < unit * 0.15) return;
      const vals = []; for (let y = R.y0; y <= R.y1; y += 2) for (let x = R.x0; x <= R.x1; x += 2) vals.push(sm[y * w + x]);
      vals.sort((a, b) => a - b);
      for (const q of [0.2, 0.28, 0.36, 0.44, 0.52, 0.6, 0.68, 0.76]) {
        const t = vals[Math.floor(vals.length * q)], m = new Uint8Array(rw * rh);
        for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) if (sm[(y + R.y0) * w + x + R.x0] > t) m[y * rw + x] = 1;
        const cc = components(m, rw, rh), compLab = cc.lab;
        for (const c of cc) {
          if (c.w < rw * 0.2 || c.h < rh * 0.15 || (c.w > rw * 0.92 && c.h > rh * 0.92)) continue;
          if (c.w < unit * 0.12 || c.h < unit * 0.12) continue;
          // screens are solid rectangles once the digits inside are filled in: measure row spans
          let span = 0;
          for (let y = c.y0; y <= c.y1; y++) { let L = -1, Rr = -1; for (let x = c.x0; x <= c.x1; x++) if (m[y * rw + x] && compLab[y * rw + x] === c.id) { if (L < 0) L = x; Rr = x; } if (L >= 0) span += Rr - L + 1; }
          if (span < c.w * c.h * 0.8) continue;
          if (c.x0 === 0 || c.y0 === 0 || c.x1 === rw - 1 || c.y1 === rh - 1) continue;
          const sh = Math.round(r * 0.6);
          const rect = { x0: R.x0 + c.x0 + sh, y0: R.y0 + c.y0 + sh, x1: R.x0 + c.x1 - sh, y1: R.y0 + c.y1 - sh, light: true };
          if (out.some(o => Math.abs(o.x0 - rect.x0) + Math.abs(o.x1 - rect.x1) + Math.abs(o.y0 - rect.y0) + Math.abs(o.y1 - rect.y1) < unit * 0.04)) continue;
          out.push(rect);
          if (depth < 2) within(rect, depth + 1);
        }
      }
    };
    within({ x0: 0, y0: 0, x1: w - 1, y1: h - 1 }, 0);
    for (const s of seeds || []) within(s, 1);
    return out;
  }

  /* ---------- screens found by their dark frame; each screen gets its own light/dark threshold */
  function otsu(vals) {
    const hist = new Float64Array(256); for (const v of vals) hist[Math.max(0, Math.min(255, v | 0))]++;
    let sum = 0; for (let i = 0; i < 256; i++) sum += i * hist[i];
    let sB = 0, wB = 0, best = 0, t = 128; const n = vals.length;
    for (let i = 0; i < 256; i++) { wB += hist[i]; if (!wB) continue; const wF = n - wB; if (!wF) break; sB += i * hist[i]; const mB = sB / wB, mF = (sum - sB) / wF, b = wB * wF * (mB - mF) * (mB - mF); if (b > best) { best = b; t = i; } }
    return t;
  }
  function framedScreens(G, ink) {
    const { g, w, h } = G, unit = Math.min(w, h);
    const comps = components(ink, w, h), lab = comps.lab;
    const rects = [];
    for (const c of comps) {
      if (c.w < unit * 0.15 || c.h < unit * 0.1 || c.w > w * 0.98 || c.h > h * 0.98) continue;
      if (c.n > c.w * c.h * 0.6) continue;                       // a frame is mostly empty inside
      // frame thickness: how far the frame reaches inward from each side (median over the middle half)
      const runs = [];
      const run = (x, y, dx, dy, max) => { let n = 0; while (n < max && lab[(y + dy * n) * w + x + dx * n] !== c.id) n++; const st = n; while (n < max && lab[(y + dy * n) * w + x + dx * n] === c.id) n++; return n - st; };
      const med = a => { const b = a.filter(v => v > 0).sort((p, q) => p - q); return b.length ? b[b.length >> 1] : 0; };
      const L = [], R = [], Tt = [], B = [];
      for (let y = c.y0 + (c.h >> 2); y < c.y1 - (c.h >> 2); y += 2) { L.push(run(c.x0, y, 1, 0, c.w >> 1)); R.push(run(c.x1, y, -1, 0, c.w >> 1)); }
      for (let x = c.x0 + (c.w >> 2); x < c.x1 - (c.w >> 2); x += 2) { Tt.push(run(x, c.y0, 0, 1, c.h >> 1)); B.push(run(x, c.y1, 0, -1, c.h >> 1)); }
      const tl = med(L), tr = med(R), tt = med(Tt), tb = med(B);
      if (!tl || !tr || !tt || !tb) continue;
      if (Math.max(tl, tr) > c.w * 0.2 || Math.max(tt, tb) > c.h * 0.25) continue;
      const ix0 = c.x0 + tl + 2, ix1 = c.x1 - tr - 2, iy0 = c.y0 + tt + 2, iy1 = c.y1 - tb - 2;
      if (ix1 - ix0 < c.w * 0.5 || iy1 - iy0 < c.h * 0.4) continue;
      rects.push({ x0: ix0, y0: iy0, x1: ix1, y1: iy1 });
    }
    return rects;
  }

  /* ---------- read the numbers inside one screen rectangle */
  function cropGray(G, r, minHeight) {
    const sw = r.x1 - r.x0 + 1, sh = r.y1 - r.y0 + 1, sc = Math.max(1, Math.min(4, (minHeight || 0) / sh));
    const w = Math.round(sw * sc), h = Math.round(sh * sc), g = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      const fy = Math.min(sh - 1.001, y / sc), y0 = fy | 0, ty = fy - y0;
      for (let x = 0; x < w; x++) {
        const fx = Math.min(sw - 1.001, x / sc), x0 = fx | 0, tx = fx - x0, i = (y0 + r.y0) * G.w + x0 + r.x0;
        g[y * w + x] = (G.g[i] * (1 - tx) + G.g[i + 1] * tx) * (1 - ty) + (G.g[i + G.w] * (1 - tx) + G.g[i + G.w + 1] * tx) * ty;
      }
    }
    return { g, w, h, sc };
  }
  function readRect(G, r0) {
    const mx = Math.round((r0.y1 - r0.y0) * 0.08) + 2;
    const r = { x0: Math.max(0, r0.x0 - mx), y0: Math.max(0, r0.y0 - mx), x1: Math.min(G.w - 2, r0.x1 + mx), y1: Math.min(G.h - 2, r0.y1 + mx) };
    const C = cropGray(G, r, 220), II = integral(C.g, C.w, C.h), out = [];
    const opt = { panel: true, minH: C.h * 0.22, maxH: C.h * 0.98 };
    const ink = [];
    const t = otsu(C.g); const o = new Uint8Array(C.g.length); let dk = 0; for (let i = 0; i < o.length; i++) if (C.g[i] < t) { o[i] = 1; dk++; }
    if (dk < o.length * 0.5) ink.push(o);
    for (const [wf, k] of [[0.5, 0.18], [0.5, 0.1], [0.9, 0.18]]) ink.push(binarize(C, II, Math.max(15, Math.round(C.h * wf)) | 1, k, true));
    for (const m of ink) for (const j of [1, 1.8]) for (const n of numbersIn(m, C, true, Object.assign({ join: j }, opt))) { n.x = n.x / C.sc + r.x0; n.y = n.y / C.sc + r.y0; n.h /= C.sc; n.w /= C.sc; n.q += 0.4; out.push(n); }
    return out;
  }

  /* ---------- segment-based reader for LCD digits whose bars do not touch (e.g. Beurer)
     1. find the vertical bars, 2. find digit rows from upper bars sitting on lower bars,
     3. slide a digit-sized cell along each row and read the 7 bars, 4. pick the best non-overlapping cells. */
  function barMoments(lab, w, c) {
    let sx = 0, sy = 0, n = 0;
    for (let y = c.y0; y <= c.y1; y++) for (let x = c.x0; x <= c.x1; x++) if (lab[y * w + x] === c.id) { sx += x; sy += y; n++; }
    const mx = sx / n, my = sy / n; let sxx = 0, syy = 0, sxy = 0;
    for (let y = c.y0; y <= c.y1; y++) for (let x = c.x0; x <= c.x1; x++) if (lab[y * w + x] === c.id) { const dx = x - mx, dy = y - my; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
    return { mx, my, slope: syy > 0 ? sxy / syy : 0 };            // dx per dy
  }
  function segRows(raw, G, dark) {
    const { w, h } = G, unit = Math.min(w, h);
    const cs = components(raw, w, h), lab = cs.lab;
    const vb = [];
    for (const c of cs) {
      if (c.h < unit * 0.025 || c.h > unit * 0.3 || c.h < c.w * 1.8 || c.n < c.h * 2) continue;   // tall and thin
      const m = barMoments(lab, w, c); if (Math.abs(m.slope) > 0.45) continue;
      vb.push(Object.assign({ top: c.y0, bot: c.y1, L: c.h, cx: m.mx, slope: m.slope }, c));
    }
    if (vb.length < 2) return [];
    // votes for rows: an upper bar followed by a lower bar of similar length just below it
    const votes = [];
    for (const u of vb) for (const l of vb) {
      if (u === l) continue;
      const gap = l.top - u.bot; if (gap < -u.L * 0.15 || gap > u.L * 0.35) continue;
      if (Math.min(u.L, l.L) / Math.max(u.L, l.L) < 0.7) continue;
      const H = l.bot - u.top; if (Math.abs(u.cx - l.cx) > H * 0.85) continue;
      votes.push({ y0: u.top, y1: l.bot, H, slope: (u.slope + l.slope) / 2, xs: [u.cx, l.cx] });
    }
    // cluster the votes into rows
    const rows = [];
    for (const v of votes) {
      let r = rows.find(r => Math.abs(r.y0 - v.y0) < r.H * 0.12 && Math.abs(r.y1 - v.y1) < r.H * 0.12);
      if (!r) { r = { y0: v.y0, y1: v.y1, H: v.H, n: 0, sl: 0, xmin: 1e9, xmax: -1e9 }; rows.push(r); }
      r.y0 = (r.y0 * r.n + v.y0) / (r.n + 1); r.y1 = (r.y1 * r.n + v.y1) / (r.n + 1); r.H = r.y1 - r.y0; r.sl = (r.sl * r.n + v.slope) / (r.n + 1); r.n++;
      for (const x of v.xs) { r.xmin = Math.min(r.xmin, x); r.xmax = Math.max(r.xmax, x); }
    }
    const out = [];
    for (const r of rows) {
      const H = Math.round(r.H), y0 = Math.round(r.y0);
      if (H < unit * 0.05) continue;
      // slant: x shifts by sl per pixel going down; zones are sampled along that slant
      const sl = Math.max(-0.4, Math.min(0.4, r.sl));
      const W = Math.round(H * 0.58);
      const xs = Math.max(0, Math.floor(r.xmin - W * 1.3)), xe = Math.min(w - 1, Math.ceil(r.xmax + W * 0.3));
      const cand = [];
      // row background brightness and darkness scale, so faint "ghost" bars can be told from lit ones
      const band = []; for (let yy = y0; yy < Math.min(h, y0 + H); yy += 2) for (let xx = xs; xx <= xe; xx += 2) band.push(G.g[yy * w + xx]);
      band.sort((a2, b2) => a2 - b2);
      const bgv = dark ? band[Math.floor(band.length * 0.85)] : band[Math.floor(band.length * 0.15)], inkv = dark ? band[Math.floor(band.length * 0.04)] : band[Math.floor(band.length * 0.96)];
      const full = Math.max(10, Math.abs(bgv - inkv));
      for (const cw of [Math.round(H * 0.5), W, Math.round(H * 0.66)]) for (let x = xs; x + 2 <= xe; x += Math.max(1, Math.round(H / 40))) {
        const box = { x0: x, x1: x + cw, y0, y1: y0 + H, w: cw + 1, h: H + 1 };
        const f = ZONES.map(z => {
          let ink = 0, tot = 0; const dv = [];
          for (let a = 0; a < 7; a++) for (let c = 0; c < 7; c++) {
            const u = z[0] + (z[1] - z[0]) * (a + 0.5) / 7, v = z[2] + (z[3] - z[2]) * (c + 0.5) / 7;
            const yy = Math.round(y0 + v * H), xx = Math.round(x + u * cw + sl * (v - 0.5) * H);
            if (xx < 0 || xx >= w || yy < 0 || yy >= h) continue; tot++; if (raw[yy * w + xx]) { ink++; dv.push(Math.abs(G.g[yy * w + xx] - bgv)); }
          }
          if (!tot) return 0;
          dv.sort((a2, b2) => b2 - a2); const top = dv.length ? dv[Math.floor(dv.length / 3)] : 0;
          const fr = ink / tot;
          return top < full * 0.5 ? Math.min(fr, 0.1) : fr;     // inked but faint: an unlit ghost bar
        });
        let code = 0, margin = 1, mixed = false;
        f.forEach((r2, i) => { if (r2 > 0.45) code |= 1 << (6 - i); else if (r2 > 0.18) mixed = true; margin = Math.min(margin, Math.abs(r2 - 0.45)); });
        if (mixed) continue;                               // a bar that is half inked means the cell is misplaced
        // a 1 only has its right bars; check the left bars are really empty
        const d = decode(code); if (!d || d.dist) continue;
        // ink just outside the cell on both sides should be low (we are centred on a digit)
        cand.push({ x0: x, x1: x + cw, d: d.d, q: margin + f.reduce((a2, b2, i) => a2 + ((code >> (6 - i)) & 1 ? b2 : 1 - b2), 0) / 7, cw });
      }
      // choose non-overlapping cells, left to right, maximising quality (dynamic programming)
      cand.sort((a2, b2) => a2.x1 - b2.x1);
      const best = new Array(cand.length).fill(null);
      for (let i = 0; i < cand.length; i++) {
        let bestPrev = null;
        for (let j = i - 1; j >= 0; j--) {
          if (cand[j].x1 > cand[i].x0 - H * 0.04) continue;
          if (cand[i].x0 - cand[j].x1 > H * 0.45) continue;        // digits sit close together
          if (best[j] && (!bestPrev || best[j].score > bestPrev.score)) bestPrev = best[j];
        }
        const single = { score: cand[i].q, ds: [cand[i]] };
        const chain = bestPrev && bestPrev.ds.length < 3 ? { score: bestPrev.score + cand[i].q, ds: bestPrev.ds.concat([cand[i]]) } : null;
        best[i] = chain && chain.score > single.score ? chain : single;
      }
      const chains = best.filter(b2 => b2 && b2.ds.length >= 2).sort((a2, b2) => b2.score - a2.score);
      if (!chains.length) continue;
      const ch = chains[0];
      // leading "1" cells that are really empty space are rejected by requiring real ink in the right bars
      const v = +ch.ds.map(c => c.d).join(''); if (ch.ds[0].d === 0) continue;
      const x0 = ch.ds[0].x0, x1 = ch.ds[ch.ds.length - 1].x1;
      out.push({ v, h: H, x: (x0 + x1) / 2 + sl * 0, y: y0 + H / 2, w: x1 - x0, q: 0.6 + ch.score / ch.ds.length });
    }
    return out;
  }

  /* ---------- decide which numbers are SYS / DIA / pulse */
  function choose(groups) {
    const big = groups.slice().sort((a, b) => b.h - a.h);
    let best = null;
    for (const a of big) for (const b of big) {
      if (a === b || a.y >= b.y) continue;
      if (Math.min(a.h, b.h) / Math.max(a.h, b.h) < 0.7) continue;
      if (!(a.v >= 60 && a.v <= 280 && b.v >= 30 && b.v <= 180 && a.v > b.v)) continue;
      if (Math.abs(a.x - b.x) > Math.max(a.w, b.w) * 1.2) continue;
      const score = a.h + b.h + (a.score || 0) + (b.score || 0);
      if (!best || score > best.score) best = { sys: a, dia: b, score };
    }
    if (!best) return null;
    const { sys, dia } = best;
    const rest = groups.filter(g => g !== sys && g !== dia && g.v >= 30 && g.v <= 220 && g.y > dia.y && g.y < dia.y + dia.h * 3.2 && g.h >= dia.h * 0.3 && g.h <= dia.h * 1.05 &&
      g.x > Math.min(sys.x, dia.x) - dia.h * 1.3 && g.x < Math.max(sys.x, dia.x) + dia.h * 1.1);
    rest.sort((a, b) => (b.score || 0) - (a.score || 0) || a.y - b.y);
    const p = rest[0] || null;
    return { sys: sys.v, dia: dia.v, pulse: p ? p.v : null, sure: { sys: sys.share >= 0.7, dia: dia.share >= 0.7, pulse: p ? p.share >= 0.7 : false } };
  }

  function merge(all) {
    const groups = [];
    for (const c of all) {
      let g = groups.find(G => Math.abs(G.y - c.y) < Math.min(G.h, c.h) * 0.4 && Math.abs(G.x - c.x) < Math.max(G.w, c.w) * 0.6 && Math.min(G.h, c.h) / Math.max(G.h, c.h) > 0.7);
      if (!g) { g = { x: c.x, y: c.y, h: c.h, w: c.w, votes: {}, n: 0 }; groups.push(g); }
      g.votes[c.v] = (g.votes[c.v] || 0) + 1 + c.q;
      g.h = (g.h * g.n + c.h) / (g.n + 1); g.y = (g.y * g.n + c.y) / (g.n + 1); g.x = (g.x * g.n + c.x) / (g.n + 1); g.w = Math.max(g.w, c.w); g.n++;
    }
    for (const g of groups) {
      // a missed digit is likelier than an invented one: favour the longer reading it contains
      const ent = Object.entries(g.votes).map(([v, s]) => [v, s + 0.3 * v.length]);
      // a reading that is missing one digit supports the full reading that contains it
      for (const e of ent) if (e[0].length === 3) for (const [v, s2] of Object.entries(g.votes)) if (v.length === 2 && (e[0].startsWith(v) || e[0].endsWith(v))) e[1] += s2 * 0.8;
      const tot = ent.reduce((t, e) => t + e[1], 0);
      const [v, s] = ent.sort((a, b) => b[1] - a[1])[0]; g.v = +v; g.score = s; g.share = s / tot;
    }
    return groups;
  }

  async function groupsOf(blob) { window.__ocrGroupsRaw = true; const r = await read(blob); return r; }
  /* lean the image so slanted (italic) LCD digits stand upright: x' = x - s*(y - h/2) */
  function shear(G0, sh) {
    if (!sh) return G0;
    const { w, h } = G0, g = new Float32Array(w * h);
    for (let y = 0; y < h; y++) { const off = sh * (y - h / 2); for (let x = 0; x < w; x++) { const sx = x + off, x0 = Math.floor(sx), t = sx - x0; const a = x0 < 0 ? 0 : x0 >= w ? w - 1 : x0, b = x0 + 1 < 0 ? 0 : x0 + 1 >= w ? w - 1 : x0 + 1; g[y * w + x] = G0.g[y * w + a] * (1 - t) + G0.g[y * w + b] * t; } }
    return { g, w, h };
  }

  async function readGray(G, all, full) {
    const II = integral(G.g, G.w, G.h);
    const win = Math.max(31, Math.round(Math.min(G.w, G.h) / 6) | 1);
    const rects = [];
    const passes = full ? [[true, 0.18, win], [true, 0.28, win], [true, 0.1, win], [true, 0.18, win >> 1 | 1], [true, 0.1, win >> 1 | 1], [false, 0.18, win], [false, 0.28, win], [false, 0.1, win]]
      : [[true, 0.18, win], [true, 0.1, win], [true, 0.18, win >> 1 | 1], [true, 0.1, win >> 1 | 1]];
    for (const [dark, k, wn] of passes) {
      const ink = binarize(G, II, wn, k, dark);
      if (dark && full) { const pm = panelMarks(G, II, ink); if (pm) all.push(...numbersIn(pm, G, dark).map(n => Object.assign(n, { q: n.q + 0.3 }))); }
      if (dark && wn === win && k !== 0.28) rects.push(...framedScreens(G, ink));
      for (const j of (ABL.join ? [1] : [1, 2.2, 3.6])) all.push(...numbersIn(ink, G, dark, { join: j }));
      if (dark && !ABL.seg) all.push(...segRows(ink, G, dark));
      await new Promise(r => setTimeout(r, 0)); // keep the screen responsive
    }
    if (full) {
      // frames found from the darkest parts of the photo (thick black screen borders)
      const sorted = Float32Array.from(G.g).sort();
      for (const pc of [0.06, 0.12, 0.2]) {
        const t = sorted[Math.floor(sorted.length * pc)] + 12, vd = new Uint8Array(G.g.length);
        for (let i = 0; i < vd.length; i++) if (G.g[i] < t) vd[i] = 1;
        rects.push(...framedScreens(G, vd));
        await new Promise(r => setTimeout(r, 0));
      }
      if (!ABL.light) rects.push(...lightRects(G, rects.slice()));
    }
    // read each screen on its own (skip near-duplicates)
    const uniq = [];
    for (const r of rects) if (!uniq.some(u => Math.abs(u.x0 - r.x0) + Math.abs(u.x1 - r.x1) + Math.abs(u.y0 - r.y0) + Math.abs(u.y1 - r.y1) < 16)) uniq.push(r);
    for (const r of uniq.slice(0, full ? 12 : 6)) { all.push(...readRect(G, r)); await new Promise(res => setTimeout(res, 0)); }
  }

  async function read(blob) { const mg = await analyse(blob); return mg ? choose(mg) : null; }
  /* one big number, e.g. a blood sugar meter. range = [min, max]; small ranges (mmol/L) accept a missing decimal point */
  async function readNumber(blob, range) {
    const mg = await analyse(blob); if (!mg) return null;
    const [lo, hi] = range || [20, 600];
    let best = null;
    for (const g of mg) {
      let v = g.v; if (hi < 50 && v > hi && v / 10 >= lo && v / 10 <= hi) v = v / 10;
      if (v < lo || v > hi) continue;
      if (!best || g.h > best.h * 1.15 || (g.h > best.h * 0.85 && g.score > best.score)) best = Object.assign({}, g, { v });
    }
    return best ? { v: best.v, sure: best.share >= 0.7 } : null;
  }
  async function analyse(blob) {
    const url = URL.createObjectURL(blob);
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Could not open photo')); i.src = url; });
      const c = toCanvas(img, 720);
      const G = gray(c), all = [];
      await readGray(G, all, true);
      for (const sh of (ABL.shear ? [] : [-0.16, -0.28])) {                 // slanted digits (Beurer, Omron and others)
        const part = []; await readGray(shear(G, sh), part, false);
        for (const n of part) { n.x += sh * (n.y - G.h / 2); all.push(n); }
      }
      const mg = merge(all);
      return mg;
    } finally { URL.revokeObjectURL(url); }
  }

  return { read, readNumber, _t: { toCanvas, gray, integral, binarize, numbersIn, dilate, components, panelMarks, framedScreens, readRect, cropGray, otsu, lightRects, shear, segRows } };
})();
