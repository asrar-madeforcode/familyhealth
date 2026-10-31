/* Family Health Tracker — live camera scan of a monitor or meter screen.
   The camera stays open; the app keeps reading the numbers inside the frame and saves them once two reads agree.
   Everything is read on the phone. © 2026 Asrar Ahmed Junedi. All rights reserved. */
'use strict';

const canLiveScan = () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.isSecureContext !== false);

/* mode 'bp' → {sys, dia, pulse, sure}; mode 'num' (sugar, temperature…) → {v, sure}. Resolves {blob, res} or null. */
function liveScan({ mode = 'bp', range, unit = '' } = {}) {
  return new Promise(async resolve => {
    const wrap = document.createElement('div');
    wrap.className = 'scan-wrap';
    wrap.innerHTML = `<video class="scan-video" playsinline muted autoplay></video>
      <div class="scan-frame"><i></i><i></i><i></i><i></i></div>
      <div class="scan-top"><span class="scan-tip">${esc(tr(mode === 'bp' ? 'Fit the monitor’s screen inside the frame and hold still.' : 'Fit the meter’s screen inside the frame and hold still.'))}</span></div>
      <div class="scan-bottom"><div class="scan-status" aria-live="polite"><span class="busy"></span> <span id="scan-say">${esc(tr('Starting the camera…'))}</span></div>
        <div class="scan-btns"><button class="btn" data-scan="cancel">${esc(tr('Cancel'))}</button><button class="btn" data-scan="torch" hidden>${esc(tr('Light'))}</button><button class="btn primary" data-scan="snap">${esc(tr('Take photo now'))}</button></div></div>`;
    document.body.appendChild(wrap);
    document.body.style.overflow = 'hidden';
    const video = $('.scan-video', wrap), say = t => { const x = $('#scan-say', wrap); if (x) x.textContent = tr(t); };
    let stream = null, done = false, track = null, torch = false;
    const finish = out => {
      if (done) return; done = true;
      try { stream && stream.getTracks().forEach(t => t.stop()); } catch { /* ignore */ }
      wrap.remove(); if (!sheetStack.length) document.body.style.overflow = '';
      window.removeEventListener('popstate', back);
      resolve(out);
    };
    const back = () => finish(null);
    window.addEventListener('popstate', back);
    // the Android back button closes the scanner first
    const prevBack = window.bpBack;
    window.bpBack = () => { window.bpBack = prevBack; finish(null); return true; };
    wrap.addEventListener('click', async e => {
      const b = e.target.closest('[data-scan]'); if (!b) return;
      if (b.dataset.scan === 'cancel') { window.bpBack = prevBack; finish(null); }
      if (b.dataset.scan === 'snap') { const blob = await grab(false); window.bpBack = prevBack; finish(blob ? { blob, res: null } : null); }
      if (b.dataset.scan === 'torch' && track) { torch = !torch; try { await track.applyConstraints({ advanced: [{ torch }] }); b.classList.toggle('primary', torch); } catch { /* ignore */ } }
    });
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } } });
    } catch (e) {
      toast(e && e.name === 'NotAllowedError' ? 'Allow the camera for Family Health Tracker in the phone’s settings.' : 'The camera could not start. Use Take photo instead.', 4500);
      window.bpBack = prevBack; finish(null); return;
    }
    if (done) { stream.getTracks().forEach(t => t.stop()); return; }
    video.srcObject = stream;
    try { await video.play(); } catch { /* autoplay is allowed for muted video */ }
    track = stream.getVideoTracks()[0];
    try { const caps = track.getCapabilities ? track.getCapabilities() : {}; if (caps.torch) $('[data-scan="torch"]', wrap).hidden = false; } catch { /* ignore */ }
    await new Promise(r => { if (video.videoWidth) r(); else video.onloadedmetadata = () => r(); setTimeout(r, 2500); });

    /* a still of what is inside the frame (crop=true) or of the whole picture */
    async function grab(crop, padIn) {
      const vw = video.videoWidth, vh = video.videoHeight; if (!vw || !vh) return null;
      // the frame on screen covers the middle of the video as shown with object-fit: cover
      const r = video.getBoundingClientRect(), f = $('.scan-frame', wrap).getBoundingClientRect();
      const sc = Math.max(r.width / vw, r.height / vh), ox = (vw * sc - r.width) / 2, oy = (vh * sc - r.height) / 2;
      let sx = 0, sy = 0, sw = vw, sh = vh;
      if (crop) {
        const pad = padIn == null ? 0.08 : padIn;
        sx = Math.max(0, (f.left - r.left + ox) / sc - f.width / sc * pad); sy = Math.max(0, (f.top - r.top + oy) / sc - f.height / sc * pad);
        sw = Math.min(vw - sx, f.width / sc * (1 + 2 * pad)); sh = Math.min(vh - sy, f.height / sc * (1 + 2 * pad));
      }
      const k = Math.min(1, 1280 / Math.max(sw, sh)), c = document.createElement('canvas');
      c.width = Math.round(sw * k); c.height = Math.round(sh * k);
      c.getContext('2d').drawImage(video, sx, sy, sw, sh, 0, 0, c.width, c.height);
      return new Promise(res => c.toBlob(b => res(b), 'image/jpeg', 0.9));
    }
    const read = async blob => {
      if (mode === 'bp') {
        let r = null; try { r = await BPOCR.read(blob); } catch { r = null; }
        return r && r.sys && r.dia && r.sys > r.dia ? r : null;
      }
      let r = null; try { r = await BPOCR.readNumber(blob, range); } catch { r = null; }
      return r;
    };
    const same = (a, b) => a && b && (mode === 'bp' ? a.sys === b.sys && a.dia === b.dia : a.v === b.v);
    const VIEWS = [null, 0.08, 0.22, 0.0], seen = [];   // whole picture, then the frame with more or less margin
    let tries = 0;
    say('Looking for the numbers…');
    while (!done) {
      // read the whole picture (the frame is a guide); alternate with the framed part, which helps with small screens
      const view = tries % VIEWS.length; const blob = await grab(VIEWS[view] !== null, VIEWS[view]); if (!blob || done) break;
      const r = await read(blob); tries++;
      if (window.__scanLog) window.__scanLog.push([view, r && (mode === 'bp' ? [r.sys, r.dia, r.pulse] : r.v)]);
      if (done) break;
      if (r) {
        const txt = mode === 'bp' ? `${r.sys}/${r.dia}${r.pulse ? ' · ' + r.pulse : ''}` : `${r.v} ${unit}`;
        // two different views of the screen must agree before saving
        const match = seen.slice(-6).find(x => x.view !== view && same(r, x.r));
        if (match) {
          if (mode === 'bp' && r.pulse == null && match.r.pulse != null) r.pulse = match.r.pulse;
          if (mode === 'bp') r.sure = Object.assign({}, r.sure, { sys: true, dia: true }); else r.sure = true;
          if (navigator.vibrate) { try { navigator.vibrate(60); } catch { /* ignore */ } }
          const full = await grab(false);
          window.bpBack = prevBack; finish({ blob: full || blob, res: r }); break;
        }
        seen.push({ view, r });
        $('#scan-say', wrap).textContent = T('Found {v}. Checking again…', { v: txt });
      } else {
        say(tries > 6 ? 'Still looking. Move closer, avoid glare, keep the screen straight.' : 'Looking for the numbers…');
      }
      await new Promise(r => setTimeout(r, 150));
    }
  });
}
