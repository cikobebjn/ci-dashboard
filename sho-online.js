/*
 * KOBE SHO online connector v1.
 * Shared by sho.html and sho_input.html; no email/password form.
 * Each approved device enters a long activation code once.
 * Server-side Edge Function alone has the database service key.
 */
(() => {
  'use strict';
  if (!/^https?:$/.test(location.protocol)) return; // file:// remains an offline pilot

  const ENDPOINT = 'https://bmnhtxalfsfaefacgtpm.supabase.co/functions/v1/sho-sync';
  const DEVICE_STORAGE_KEY = 'kobe_sho_device_access_v1';
  let busy = false;
  let lastSuccess = 0;
  let currentLoad = null;
  let statusText, statusButton;

  const getCode = () => localStorage.getItem(DEVICE_STORAGE_KEY) || '';
  const putCode = value => localStorage.setItem(DEVICE_STORAGE_KEY, value);

  function banner() {
    const bar = document.createElement('div');
    bar.id = 'sho-live-connection';
    bar.style.cssText = 'display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;padding:10px 14px;margin:12px auto;max-width:1460px;border:1px solid #cfe1fa;border-radius:12px;background:#eff6ff;color:#17427a;font:600 12px/1.45 Inter,system-ui,sans-serif;';
    statusText = document.createElement('span');
    statusText.textContent = 'Menghubungkan SHO ke Supabase...';
    statusButton = document.createElement('button');
    statusButton.type = 'button';
    statusButton.textContent = 'Aktivasi Perangkat';
    statusButton.style.cssText = 'border:1px solid #bfdbfe;border-radius:9px;background:#fff;color:#1652a3;padding:8px 12px;font-weight:800;cursor:pointer;';
    statusButton.addEventListener('click', async () => {
      try { await activate(true); await reloadRemote(); }
      catch (e) { setStatus('Koneksi gagal: ' + e.message, true); }
    });
    bar.append(statusText, statusButton);
    const hero = document.querySelector('main, .wrap, .main, .container');
    if (hero) hero.prepend(bar); else document.body.prepend(bar);
  }
  function setStatus(message, error = false) {
    if (!statusText) return;
    statusText.textContent = message;
    const bar = document.getElementById('sho-live-connection');
    bar.style.background = error ? '#fff1f2' : '#eff6ff';
    bar.style.borderColor = error ? '#fecdd3' : '#cfe1fa';
    bar.style.color = error ? '#9f1239' : '#17427a';
    statusButton.textContent = getCode() ? 'Ganti kode perangkat' : 'Aktivasi Perangkat';
  }
  async function request(action, extra = {}, codeOverride = '') {
    const access = codeOverride || getCode();
    if (!access) throw Error('Aktivasi perangkat dahulu menggunakan kode akses SHO.');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 18000);
    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-sho-code': access, apikey: KEY },
        body: JSON.stringify({ action, ...extra }),
        signal: controller.signal,
        cache: 'no-store',
      });
      const text = await response.text();
      let result;
      try { result = text ? JSON.parse(text) : {}; }
      catch { throw Error('Respons server bukan JSON. Periksa deployment Edge Function.'); }
      if (!response.ok) throw Error(result.error || 'Server menolak permintaan (' + response.status + ').');
      return result;
    } finally { clearTimeout(timer); }
  }
  async function activate(force = false) {
    if (getCode() && !force) return true;
    const response = prompt('Masukkan kode aktivasi SHO (sekali per perangkat). Minta kode dari admin sistem:');
    if (response === null) return false;
    const code = response.trim();
    if (code.length < 20) throw Error('Kode aktivasi minimal 20 karakter.');
    await request('ping', {}, code);
    putCode(code);
    setStatus('Perangkat berhasil diaktifkan. Memuat data SHO online.');
    return true;
  }
  async function requireActivated() {
    if (getCode()) return true;
    if (!await activate(false)) throw Error('Aktivasi perangkat dibatalkan; tidak ada data yang disimpan.');
    return true;
  }
  function applySnapshot(snapshot) {
    if (!Array.isArray(snapshot.issues) || !Array.isArray(snapshot.reviews)) throw Error('Format data server tidak sesuai.');
    state.issues = snapshot.issues;
    state.reviews = snapshot.reviews;
    state.checkins = snapshot.checkins || [];
    lastSuccess = Date.now();
    if (typeof render === 'function') render();
    document.dispatchEvent(new Event('sho-data-updated'));
    setStatus('Online tersinkron ke Supabase - pembaruan ' + new Date().toLocaleTimeString('id-ID', {hour:'2-digit',minute:'2-digit'}));
  }
  async function reloadRemote() {
    if (!getCode()) { setStatus('SHO belum diaktifkan pada perangkat ini. Klik Aktivasi Perangkat.'); return; }
    if (currentLoad) return currentLoad;
    currentLoad = (async () => {
      try {
        const snapshot = await request('snapshot');
        applySnapshot(snapshot);
      } catch (error) {
        setStatus('Gagal sinkron: ' + error.message, true);
        throw error;
      } finally { currentLoad = null; }
    })();
    return currentLoad;
  }
  // Override the old local persistence. No silent local fallback on GitHub Pages.
  const pilotPersist = persist;
  persist = async function (table, row, update = false) {
    if (!['issues', 'reviews'].includes(table)) throw Error('Jenis record tidak tersedia untuk online.');
    if (busy) throw Error('Simpan sebelumnya masih diproses.');
    busy = true;
    try {
      await requireActivated();
      const result = await request('save', { table, row, update });
      const record = result.row || row;
      const list = state[table];
      state[table] = update ? list.map(x => x.id === record.id ? record : x) : [record, ...list];
      document.dispatchEvent(new Event('sho-data-updated'));
      if (typeof render === 'function') render();
      setStatus('Berhasil disimpan ONLINE di Supabase.');
      // Saving succeeded already. A delayed refresh must not turn it into a false error.
      reloadRemote().catch(error => console.warn('Sinkronisasi ulang tertunda:', error.message));
      return record;
    } finally { busy = false; }
  };
  refreshLocal = function () {}; // Never replace online state with local pilot data.

  const oldLoadOee = loadOee;
  loadOee = async function (ctxValue) {
    if (!getCode()) {
      state.oee = { actual:null, target:null, note:'Aktifkan perangkat untuk membaca OEE Admin' };
      document.dispatchEvent(new Event('sho-oee-updated'));
      return;
    }
    if (!ctxValue || !ctxValue.tanggal || !ctxValue.shift || !ctxValue.mesin) {
      state.oee = { actual:null, target:null, note:'Pilih tanggal, shift, dan mesin' };
      document.dispatchEvent(new Event('sho-oee-updated'));
      return;
    }
    try {
      const data = await request('oee', { ctx:ctxValue });
      const r = data.row;
      const parse = x => x == null || x === '' || !Number.isFinite(Number(x)) ? null : Number(x);
      state.oee = { actual:r ? parse(r.oee) : null, target:r ? parse(r.target) : null,
        note:r ? 'Dari laporan OEE Admin' : 'Belum ada laporan Admin untuk mesin ini' };
    } catch (e) {
      state.oee = { actual:null, target:null, note:'Data OEE belum dapat dibaca: ' + e.message };
    }
    document.dispatchEvent(new Event('sho-oee-updated'));
  };

  // Clean view of pilot history; keep old records in localStorage untouched.
  state.online = true;
  state.issues = [];
  state.reviews = [];
  state.checkins = [];
  banner();
  if (typeof render === 'function') render();
  if (typeof ctx === 'function') loadOee(ctx());
  if (typeof curCtx === 'function') loadOee(curCtx());
  reloadRemote().catch(() => {});
  window.addEventListener('focus', () => { if (Date.now() - lastSuccess > 10000) reloadRemote().catch(() => {}); });
  window.addEventListener('pageshow', () => { if (Date.now() - lastSuccess > 10000) reloadRemote().catch(() => {}); });
  window.addEventListener('storage', e => {
    if (e.key === DEVICE_STORAGE_KEY) reloadRemote().catch(() => {});
  });
  setInterval(() => { if (!document.hidden) reloadRemote().catch(() => {}); }, 20000);

  if (typeof reload === 'function') {
    reload = async function () {
      try {
        await requireActivated();
        await reloadRemote();
        if (typeof ctx === 'function') await loadOee(ctx());
        notify('Data terbaru berhasil diambil dari Supabase.');
      } catch (e) { notify('Gagal memuat: ' + e.message, true); }
    };
  }
})();
