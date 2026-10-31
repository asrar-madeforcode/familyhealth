/* Family Health Tracker — app languages. © 2026 Asrar Ahmed Junedi. All rights reserved.
   The screens are written in English; this file swaps each piece of text for the chosen language
   as it appears. Text with numbers or names in it is matched with patterns. */
'use strict';

const I18N = (() => {
  const LANGS = [
    { k: 'en', name: 'English', dir: 'ltr' },
    { k: 'ar', name: 'العربية', dir: 'rtl' },
    { k: 'ur', name: 'اردو', dir: 'rtl' },
    { k: 'hi', name: 'हिन्दी', dir: 'ltr' },
    { k: 'ml', name: 'മലയാളം', dir: 'ltr' },
    { k: 'ta', name: 'தமிழ்', dir: 'ltr' },
    { k: 'te', name: 'తెలుగు', dir: 'ltr' },
    { k: 'bn', name: 'বাংলা', dir: 'ltr' },
    { k: 'tl', name: 'Filipino', dir: 'ltr' },
    { k: 'id', name: 'Bahasa Indonesia', dir: 'ltr' }
  ];
  let lang = 'en', dict = null, pats = [], seen = null;
  const ATTRS = ['placeholder', 'aria-label', 'title'];
  const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'svg', 'SVG', 'path']);

  function get() { try { return localStorage.getItem('bp.lang') || ''; } catch { return ''; } }
  function save(k) { try { localStorage.setItem('bp.lang', k); } catch { /* ignore */ } }

  async function load(k) {
    lang = LANGS.find(l => l.k === k) ? k : 'en';
    dict = null; pats = [];
    if (lang !== 'en') {
      try {
        const res = await fetch('lang/' + lang + '.json');
        const j = await res.json();
        dict = j.t || {};
        pats = (j.p || []).map(([re, out]) => [new RegExp('^' + re + '$'), out]);
      } catch (e) { lang = 'en'; }
    }
    const L = LANGS.find(l => l.k === lang);
    document.documentElement.lang = lang;
    document.documentElement.dir = L.dir;
  }

  /* Numbers and people's names are swapped for {0}, {1}… and {name} before looking text up,
     so "Add Fatima's first reading" and "Add Ali's first reading" share one translation. */
  let names = [];
  const NUM = /(?<![A-Za-z\d])\d+(?:[.,:]\d+)*(?![A-Za-z\d])/g;
  function mask(key) {
    const vals = []; let nm = null;
    for (const n of names) if (n && key.includes(n)) { nm = n; key = key.split(n).join('\u0001'); break; }
    key = key.replace(NUM, m => '{' + (vals.push(m) - 1) + '}');
    return { k: key.split('\u0001').join('{name}'), vals, nm };
  }
  function lookup(key) {
    let out = dict[key];
    if (out != null) return out;
    const m = mask(key);
    if (m.k !== key && dict[m.k] != null) return dict[m.k].replace(/\{(\d+)\}/g, (_, i) => m.vals[+i] ?? '').split('{name}').join(m.nm || '');
    for (const [re, o] of pats) { const r = key.match(re); if (r) return o.replace(/\$(\d)/g, (_, i) => tr(r[+i] || '')); }
    // "Morning · 8:00 AM" and similar: translate each part
    if (key.includes(' \u00B7 ')) { const parts = key.split(' \u00B7 '), t = parts.map(x => lookup(x)); if (t.some(x => x != null)) return t.map((x, i) => x ?? parts[i]).join(' \u00B7 '); }
    return null;
  }
  /* translate one string; unknown text stays English */
  function tr(s) {
    if (!s) return s;
    const key = s.replace(/\s+/g, ' ').trim();
    if (!key) return s;
    if (seen) { seen.add(mask(key).k); if (key.includes(' \u00B7 ')) key.split(' \u00B7 ').forEach(x => seen.add(mask(x).k)); }
    if (lang === 'en' || !dict) return s;
    const out = lookup(key);
    if (out == null) return s;
    const lead = s.match(/^\s*/)[0], tail = s.match(/\s*$/)[0];
    return lead + out + tail;
  }

  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) { fixText(root); return; }
    if (root.nodeType !== 1 || SKIP.has(root.nodeName) || root.hasAttribute('data-noi18n')) return;
    for (const a of ATTRS) if (root.hasAttribute(a)) { const v = root.getAttribute(a), t = tr(v); if (t !== v) root.setAttribute(a, t); }
    if (root.nodeName === 'INPUT' && (root.type === 'button' || root.type === 'submit') && root.value) root.value = tr(root.value);
    for (let c = root.firstChild; c; c = c.nextSibling) walk(c);
  }
  function fixText(n) {
    const p = n.parentNode; if (!p || SKIP.has(p.nodeName) || (p.closest && p.closest('[data-noi18n]'))) return;
    const v = n.nodeValue; if (!/[A-Za-z]/.test(v)) return;
    const t = tr(v); if (t !== v) n.nodeValue = t;
  }

  let obs = null;
  function start() {
    walk(document.body);
    if (obs) obs.disconnect();
    obs = new MutationObserver(ms => {
      if (lang === 'en' && !seen) return;
      for (const m of ms) {
        if (m.type === 'characterData') fixText(m.target);
        else if (m.type === 'attributes') { const el = m.target, v = el.getAttribute(m.attributeName); if (v) { const t = tr(v); if (t !== v) el.setAttribute(m.attributeName, t); } }
        else m.addedNodes.forEach(walk);
      }
    });
    obs.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  }

  return {
    LANGS, tr, start, load, save, get,
    setNames(list) { names = (list || []).filter(n => n && n.length > 1).sort((a, b) => b.length - a.length); },
    get lang() { return lang; },
    get dir() { return (LANGS.find(l => l.k === lang) || LANGS[0]).dir; },
    /* used while preparing translations: remember every English text shown */
    collect() { seen = new Set(); return seen; }
  };
})();
