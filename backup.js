/* Family Health Tracker — automatic backup to the family's own Google Drive (Android) or iCloud Drive (iPhone),
   with an optional backup password. No login and no server: the phone's own Drive / iCloud does the syncing.
   © 2026 Asrar Ahmed Junedi. All rights reserved. */
'use strict';

const BKP = (() => {
  const enc = new TextEncoder(), dec = new TextDecoder();
  const b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = s => { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < u.length; i++) u[i] = bin.charCodeAt(i); return u; };
  /* PBKDF2 with HMAC-SHA-512 (the same on every phone, no browser crypto needed) */
  function hmac(key, msg) {
    if (key.length > 128) key = nacl.hash(key);
    const k = new Uint8Array(128); k.set(key);
    const ip = new Uint8Array(128 + msg.length), op = new Uint8Array(128 + 64);
    for (let i = 0; i < 128; i++) { ip[i] = k[i] ^ 0x36; op[i] = k[i] ^ 0x5c; }
    ip.set(msg, 128); op.set(nacl.hash(ip), 128);
    return nacl.hash(op);
  }
  function pbkdf2(pw, salt, iter) {
    const P = enc.encode(pw), s1 = new Uint8Array(salt.length + 4); s1.set(salt); s1[s1.length - 1] = 1;
    let u = hmac(P, s1); const t = u.slice();
    for (let i = 1; i < iter; i++) { u = hmac(P, u); for (let j = 0; j < 64; j++) t[j] ^= u[j]; }
    return t.slice(0, 32);
  }
  const ITER = 40000;
  /* the key is kept on this phone so the daily backup can be locked without asking each time */
  function setPassword(pw) {
    if (!pw) { LS.set('bp.bkKey', null); return; }
    const salt = nacl.randomBytes(16);
    LS.set('bp.bkKey', { salt: b64(salt), key: b64(pbkdf2(pw, salt, ITER)), iter: ITER, set: Date.now() });
  }
  const hasPassword = () => !!(LS.get('bp.bkKey', null) || {}).key;
  /* JSON text → the text to save (locked when a password is set) */
  function seal(text) {
    const k = LS.get('bp.bkKey', null);
    if (!k || !k.key) return text;
    const nonce = nacl.randomBytes(24), box = nacl.secretbox(enc.encode(text), nonce, unb64(k.key));
    return JSON.stringify({ app: 'Family Health Tracker', locked: 'secretbox-pbkdf2-sha512', iter: k.iter, salt: k.salt, nonce: b64(nonce), data: b64(box), exported: new Date().toISOString() });
  }
  const isLocked = o => !!(o && o.locked && o.data && o.salt && o.nonce);
  function open(o, pw) {
    const key = pbkdf2(pw, unb64(o.salt), o.iter || ITER);
    const out = nacl.secretbox.open(unb64(o.data), unb64(o.nonce), key);
    return out ? dec.decode(out) : null;
  }
  return { setPassword, hasPassword, seal, isLocked, open, b64, _t: { pbkdf2, hmac } };
})();

/* daily (recommended) or weekly; a monthly copy is always kept as well */
const bkFreq = () => LS.get('bp.bkFreq', 'day') === 'week' ? 'week' : 'day';
const bkGap = () => bkFreq() === 'week' ? 6.5 * 864e5 : 20 * 3600e3;
document.addEventListener('click', e => { const b = e.target.closest('[data-bkf]'); if (!b) return; LS.set('bp.bkFreq', b.dataset.bkf); toast(b.dataset.bkf === 'week' ? 'Backup every week' : 'Backup every day'); render(); });

/* where the automatic backup goes */
function bkWhere() {
  if (!NATIVE) return null;
  if (IOS_APP) { const w = NATIVE.backupWhere ? NATIVE.backupWhere() : ''; return w === 'icloud' ? 'iCloud Drive › Family Health' : 'Files › On My iPhone › Family Health Tracker'; }
  const f = NATIVE.backupFolderName ? NATIVE.backupFolderName() : '';
  return f ? f : '';
}
function backupCardHTML() {
  const last = LS.get('bp.autoBackup', 0), where = bkWhere(), android = NATIVE && !IOS_APP;
  const lastTxt = last ? fmtDate(last, { day: 'numeric', month: 'short' }) + ', ' + fmtTime(last) : '';
  const ok = NATIVE && (IOS_APP || where);
  return `<div class="card" id="bk-card"><h2>Backup and new phone</h2>
    <p class="small" style="margin-top:0"><b>All data stays on this phone. App updates never ask for a login and always keep your data.</b></p>
    ${NATIVE ? `<div class="bk-status ${ok ? 'ok' : 'warn'}"><span class="bk-dot"></span><span style="flex:1;min-width:0">
      ${ok ? `<b>${bkFreq() === 'week' ? 'Automatic backup every week' : 'Automatic backup every day'}</b><br><span class="small"><span>Saved to:</span> <b data-noi18n>${esc(where)}</b></span>` : `<b>Automatic backup to Google Drive is not set up</b><br><span class="small">Until it is, a daily copy is kept only on this phone (Downloads › Family Health Tracker).</span>`}
      ${lastTxt ? `<br><span class="small muted"><span>Last backup:</span> <span>${esc(lastTxt)}</span></span>` : ''}</span></div>
    <div class="btn-row" style="margin-top:10px">${android ? `<button class="btn ${where ? '' : 'primary'}" data-bk="folder">${where ? 'Change Drive folder' : 'Choose Google Drive folder'}</button>` : ''}<button class="btn" data-bk="now">Back up now</button></div>` : ''}
    ${NATIVE ? `<div class="row" style="margin-top:12px"><span style="flex:1"><b>How often</b></span><div class="seg" id="bk-freq" style="flex:1.4"><button type="button" data-bkf="day" class="${bkFreq() === 'day' ? 'on' : ''}">Every day</button><button type="button" data-bkf="week" class="${bkFreq() === 'week' ? 'on' : ''}">Every week</button></div></div>` : ''}
    <div class="row" style="margin-top:12px"><span style="flex:1"><b>Backup password (optional)</b><br><span class="small muted">${BKP.hasPassword() ? 'On: backups can only be opened with your password.' : 'Not needed. Backups work without a password; add one only if you want extra protection.'}</span></span><button class="btn sm" data-bk="pw">${BKP.hasPassword() ? 'Change' : 'Set'}</button>${BKP.hasPassword() ? '<button class="btn sm" data-bk="pwoff">Remove</button>' : ''}</div>
    <details class="bk-help"><summary>${android ? 'How to back up to Google Drive' : 'How backup to iCloud works'}</summary><ol class="small">${android ? `
      <li>Tap “Choose Google Drive folder”.</li>
      <li>In the window that opens, tap ☰ (menu) and choose Drive with your Gmail account.</li>
      <li>Open or create a folder called “Family Health”, then tap “Use this folder” and “Allow”.</li>
      <li>Done. Every day the app saves “Family Health backup.json” there, plus one copy each month.</li>` : `
      <li>On the iPhone, turn on iCloud Drive: Settings › your name › iCloud › iCloud Drive.</li>
      <li>The app saves “Family Health backup.json” to iCloud Drive › Family Health every day, plus one copy each month.</li>
      <li>If iCloud Drive is off, the backup stays in Files › On My iPhone › Family Health Tracker (and in the iPhone’s own iCloud backup).</li>`}</ol></details>
    <details class="bk-help"><summary>Moving to a new phone</summary><ol class="small">
      <li>Install Family Health Tracker on the new phone.</li>
      <li>${android ? 'Open Settings › Backup and new phone › Restore, then choose Drive › Family Health › “Family Health backup.json”.' : 'Open Settings › Backup and new phone › Restore › Browse › iCloud Drive › Family Health › “Family Health backup.json”.'}</li>
      <li>Type the backup password if you set one.</li>
      <li>${android ? 'Choose the Drive folder again on the new phone so daily backups continue.' : 'Daily backups continue by themselves.'}</li>
      <li>Everything comes back: people, readings, photos, reports, medicines, reminders and devices.</li></ol></details>
    <div style="border-top:1px solid var(--line);margin-top:12px;padding-top:10px">
      <label class="check"><input type="checkbox" id="bk-photos" checked> Include photos and test reports (bigger file)</label>
      <div class="btn-row"><button class="btn" data-act="backup">Save backup file</button><button class="btn" data-act="restore">Restore</button></div></div></div>`;
}
function bkPasswordSheet() {
  const sh = openSheet({ title: 'Backup password', body: `<p class="small" style="margin-top:0">Backups will be locked with this password. You will need it to restore on a new phone.</p>
    <div class="ocr-msg warn"><b>If you forget it, the backup cannot be opened by anyone, including us.</b> Write it down somewhere safe.</div>
    <div class="field"><label for="bk-p1">Password (at least 6 characters)</label><input class="input" id="bk-p1" type="password" autocomplete="new-password"></div>
    <div class="field"><label for="bk-p2">Type it again</label><input class="input" id="bk-p2" type="password" autocomplete="new-password"></div><p class="err" id="bk-err" hidden></p>`,
    foot: '<button class="btn" data-close>Cancel</button><button class="btn primary" data-save>Save password</button>' });
  $('[data-save]', sh.el).onclick = async () => {
    const a = $('#bk-p1', sh.el).value, b = $('#bk-p2', sh.el).value, er = $('#bk-err', sh.el);
    if (a.length < 6) { er.textContent = tr('Use at least 6 characters.'); er.hidden = false; return; }
    if (a !== b) { er.textContent = tr('The two passwords are different.'); er.hidden = false; return; }
    toast('Saving…'); await new Promise(r => setTimeout(r, 30));
    BKP.setPassword(a); sh.close(); toast('Backup password saved'); render(); autoBackup(true);
  };
}
document.addEventListener('click', async e => {
  const t = e.target.closest('[data-bk]'); if (!t) return;
  const a = t.dataset.bk;
  if (a === 'folder' && NATIVE && NATIVE.backupPickFolder) NATIVE.backupPickFolder();
  else if (a === 'now') { t.disabled = true; toast('Preparing backup…'); const ok = await autoBackup(true); t.disabled = false; toast(ok ? 'Backup saved' : 'Backup could not be saved. Choose the Drive folder again.', 3500); render(); }
  else if (a === 'pw') bkPasswordSheet();
  else if (a === 'pwoff') { if (await confirmSheet('Remove backup password?', 'New backups will not be locked. Older locked backups still need the old password.', 'Remove', true)) { BKP.setPassword(null); render(); autoBackup(true); } }
});
window.bpOnBackupFolder = name => { toast(name ? T('Backups will be saved to {f}.', { f: name }) : 'No folder chosen.', 3500); if (name) autoBackup(true).then(() => render()); else render(); };

/* ask for the password of a locked backup file; resolves the opened JSON text or null */
function bkAskPassword(o) {
  return new Promise(res => {
    const sh = openSheet({ title: 'Locked backup', body: `<p class="small" style="margin-top:0">This backup is locked. Type the backup password.</p><div class="field"><label for="bk-o">Backup password</label><input class="input" id="bk-o" type="password" autocomplete="current-password"></div><p class="err" id="bk-oe" hidden></p>`,
      foot: '<button class="btn" data-close>Cancel</button><button class="btn primary" data-save>Open</button>' });
    let done = false; sh.onClose = () => { if (!done) res(null); };
    setTimeout(() => $('#bk-o', sh.el).focus(), 60);
    $('[data-save]', sh.el).onclick = async () => {
      toast('Opening…'); await new Promise(r => setTimeout(r, 30));
      const text = BKP.open(o, $('#bk-o', sh.el).value);
      if (!text) { const er = $('#bk-oe', sh.el); er.textContent = tr('Wrong password. Try again.'); er.hidden = false; return; }
      done = true; sh.close(); res(text);
    };
  });
}

/* Today screen: a gentle reminder to turn on Drive backup (Android), until it is set up or dismissed for 30 days */
function backupNudge() {
  if (!NATIVE || IOS_APP || !NATIVE.backupFolderName || NATIVE.backupFolderName()) return '';
  if ((S.readings || []).length < 3 || Date.now() < LS.get('bp.bkNudge', 0)) return '';
  return `<div class="card bk-nudge"><b>Protect your family’s data</b><p class="small" style="margin:4px 0 8px">Turn on automatic backup to your Google Drive, so nothing is lost if this phone is lost or changed. No login needed.</p>
    <div class="btn-row"><button class="btn sm" data-bk="later">Later</button><button class="btn sm primary" data-bk="folder">Choose Google Drive folder</button></div></div>`;
}
document.addEventListener('click', e => { const t = e.target.closest('[data-bk="later"]'); if (t) { LS.set('bp.bkNudge', Date.now() + 30 * 864e5); render(); } });
