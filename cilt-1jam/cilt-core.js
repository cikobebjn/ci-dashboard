(function () {
  'use strict';
  const cfg = window.CILT_CONFIG;
  const STORE_KEY = 'kobe-cilt-chingfong-hourly-v1';
  const AUTH_KEY = 'kobe-cilt-cloud-auth-v1';
  const isCloud = Boolean(cfg.SUPABASE_URL.trim() && cfg.SUPABASE_ANON_KEY.trim());
  let runningAuthCallback = null;

  const statusLabels = { done: 'Sudah dilakukan', abnormal: 'Abnormality', skipped: 'Tidak dilakukan' };
  const statusShort = { done: '✓', abnormal: 'O', skipped: '/' };

  function safeText(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, x => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
  }
  function dateParts(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: cfg.TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23'
    }).formatToParts(date);
    return Object.fromEntries(parts.map(v => [v.type, v.value]));
  }
  function today() {
    const p = dateParts(); return `${p.year}-${p.month}-${p.day}`;
  }
  function currentHour() { return Number(dateParts().hour); }
  function hourLabel(n) { return String(n).padStart(2, '0') + ':00'; }
  function niceDate(ymd, withWeekday = false) {
    const d = new Date(ymd + 'T12:00:00+07:00');
    return new Intl.DateTimeFormat('id-ID', {timeZone: cfg.TIMEZONE, weekday: withWeekday ? 'short' : undefined, day:'numeric',month:'short',year:'numeric'}).format(d);
  }
  function addDays(ymd, offset) {
    const d = new Date(ymd + 'T00:00:00Z');d.setUTCDate(d.getUTCDate() + offset);return d.toISOString().slice(0,10);
  }
  function getSession() { try { return JSON.parse(sessionStorage.getItem(AUTH_KEY) || 'null'); } catch (_) { return null; } }
  function setSession(data) {
    sessionStorage.setItem(AUTH_KEY, JSON.stringify({access_token:data.access_token,refresh_token:data.refresh_token,expires_at:Date.now() + (Number(data.expires_in || 3600)*1000)}));
  }
  async function authRequest(grantType, body) {
    const resp = await fetch(cfg.SUPABASE_URL.replace(/\/$/, '') + '/auth/v1/token?grant_type=' + grantType, {
      method:'POST',headers:{'Content-Type':'application/json','apikey':cfg.SUPABASE_ANON_KEY},body:JSON.stringify(body)
    });
    let json;try { json=await resp.json(); } catch (_) {json={};}
    if(!resp.ok) throw new Error(json.msg || json.error_description || json.message || 'Autentikasi gagal.');
    return json;
  }
  async function accessToken() {
    if (!isCloud) return null;
    let s = getSession();
    if (!s || !s.access_token) throw new Error('Silakan masuk menggunakan akun Supabase Auth.');
    if (s.expires_at && s.expires_at < Date.now()+90000) {
      if (!s.refresh_token) throw new Error('Sesi telah habis. Silakan masuk kembali.');
      try {s=await authRequest('refresh_token',{refresh_token:s.refresh_token});setSession(s);}
      catch(e){sessionStorage.removeItem(AUTH_KEY);throw e;}
    }
    return getSession().access_token;
  }
  async function login(email, password) {
    if (!isCloud) return;
    const session = await authRequest('password', {email, password});setSession(session);
  }
  async function logout() {
    if (isCloud) {
      const s = getSession();
      if (s?.access_token) {
        try { await fetch(cfg.SUPABASE_URL.replace(/\/$/,'')+'/auth/v1/logout', {method:'POST',headers:{apikey:cfg.SUPABASE_ANON_KEY,Authorization:'Bearer '+s.access_token}}); }catch(_){}
      }
      sessionStorage.removeItem(AUTH_KEY);
      location.reload();
    }
  }
  async function rest(query, method='GET', body=null, extra={}) {
    const token = await accessToken();
    const headers = {'apikey':cfg.SUPABASE_ANON_KEY,'Authorization':'Bearer '+token,'Content-Type':'application/json',...extra};
    const result = await fetch(cfg.SUPABASE_URL.replace(/\/$/,'') + '/rest/v1/' + cfg.TABLE + query,{method,headers,body:body===null?undefined:JSON.stringify(body)});
    const raw=await result.text();let json;
    try{json=raw?JSON.parse(raw):null;}catch(_){json=null;}
    if(!result.ok) throw new Error(json?.message || json?.hint || 'Gagal mengambil atau menyimpan data ('+result.status+').');
    return json;
  }
  function allLocal() {
    try{const obj=JSON.parse(localStorage.getItem(STORE_KEY)||'[]');return Array.isArray(obj)?obj:[];}catch(_){return [];}
  }
  function writeLocal(list) {
    const d = new Date(today()+'T00:00:00Z');
    d.setUTCFullYear(d.getUTCFullYear()-1);
    const oneYearAgo=d.toISOString().slice(0,10);
    const kept=list.filter(item=>item.check_date >= oneYearAgo);
    localStorage.setItem(STORE_KEY,JSON.stringify(kept));
    window.dispatchEvent(new Event('cilt-data-updated'));
  }
  async function getRange(from,to) {
    if (!isCloud) return allLocal().filter(x=>x.check_date>=from && x.check_date<=to).sort((a,b)=> b.check_date.localeCompare(a.check_date)||b.hour_slot-a.hour_slot);
    let all=[];let offset=0;const page=1000;
    while(true) {
      const q='?select=*&check_date=gte.'+encodeURIComponent(from)+'&check_date=lte.'+encodeURIComponent(to)+'&order=check_date.desc,hour_slot.desc&limit='+page+'&offset='+offset;
      const rows=await rest(q);
      all=all.concat(rows||[]);
      if(!rows || rows.length<page) break;
      offset+=rows.length;
      if(offset>40000) throw new Error('Data melebihi batas tampilan. Filter tanggal lebih sempit.');
    }
    return all;
  }
  async function getOne(ymd, machine, hour) {
    if(!isCloud) return allLocal().find(x=>x.check_date===ymd && x.machine===machine && Number(x.hour_slot)===Number(hour)) || null;
    const q='?select=*&check_date=eq.'+encodeURIComponent(ymd)+'&machine=eq.'+encodeURIComponent(machine)+'&hour_slot=eq.'+Number(hour)+'&limit=1';
    const rows=await rest(q); return rows?.[0]||null;
  }
  async function upsert(record) {
    if(!isCloud) {
      const all=allLocal();const i=all.findIndex(x=>x.check_date===record.check_date && x.machine===record.machine && Number(x.hour_slot)===Number(record.hour_slot));
      const now=new Date().toISOString(); const saved={...record,id:i<0?('local-'+Date.now()+'-'+Math.random().toString(36).slice(2,7)):all[i].id,created_at:i<0?now:all[i].created_at,updated_at:now};
      if(i<0)all.push(saved);else all[i]=saved;
      writeLocal(all);return saved;
    }
    const rows=await rest('?on_conflict=check_date,machine,hour_slot','POST',record,{'Prefer':'resolution=merge-duplicates,return=representation'});
    return rows?.[0]||record;
  }
  function evaluate(entry) {
    const checks=Array.isArray(entry?.checks)?entry.checks:[];
    const stats={done:0,abnormal:0,skipped:0,empty:0};
    for(const task of window.CILT_TASKS){const result=checks.find(x=>Number(x.task_id)===task.id);const key=result?.status;if(Object.hasOwn(stats,key))stats[key]++;else stats.empty++;}
    let status='empty';
    if(stats.abnormal)status='abnormal'; else if(stats.skipped)status='skipped';else if(stats.empty)status='incomplete';else status='done';
    return {...stats,status,total:window.CILT_TASKS.length};
  }
  function toast(text,variant='good'){
    let host=document.querySelector('#toastHost');if(!host){host=document.createElement('div');host.id='toastHost';host.className='toast-host';document.body.appendChild(host);}
    const e=document.createElement('div');e.className='toast '+variant;e.textContent=text;host.appendChild(e);setTimeout(()=>e.remove(),5200);
  }
  function exportCSV(filename,rows){
    function safeCsv(x){let s=String(x??'');if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';}
    const csv='\ufeffsep=;\r\n'+rows.map(row=>row.map(safeCsv).join(';')).join('\r\n');
    const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),500);
  }
  async function withAuth(afterAuth) {
    runningAuthCallback=afterAuth;
    document.querySelectorAll('[data-storage-label]').forEach(el=>{el.textContent=isCloud?'Online • Supabase':'Lokal • Perangkat ini';});
    document.querySelectorAll('[data-local-note]').forEach(el=>{el.hidden=isCloud;});
    document.querySelectorAll('[data-logout]').forEach(btn=>{btn.hidden=!isCloud;btn.addEventListener('click',logout);});
    if(!isCloud){await afterAuth();return;}
    if(getSession()?.access_token){try{await accessToken();await afterAuth();return;}catch(e){toast(e.message,'bad');}}
    showLogin();
  }
  function showLogin() {
    let gate=document.querySelector('#authGate');
    if(!gate){gate=document.createElement('div');gate.id='authGate';gate.className='auth-gate';document.body.appendChild(gate);}
    gate.innerHTML=`<div class="auth-card"><div class="brand-mark">K</div><h2>Akses CILT Online</h2><p>Masuk menggunakan akun yang sudah dibuat di Supabase Auth agar data sinkron antarpengguna.</p><form id="authForm"><label>Email akun</label><input type="email" id="authEmail" required autocomplete="username" placeholder="email@perusahaan.com"><label>Password</label><input type="password" id="authPassword" required autocomplete="current-password"><div class="auth-error" id="authError" role="alert"></div><button class="btn btn-primary" type="submit" id="authSubmit">Masuk</button></form></div>`;
    gate.hidden=false;
    gate.querySelector('form').addEventListener('submit', async event=>{
      event.preventDefault();const btn=gate.querySelector('#authSubmit');const err=gate.querySelector('#authError');btn.disabled=true;btn.textContent='Memeriksa...';err.textContent='';
      try{await login(gate.querySelector('#authEmail').value.trim(),gate.querySelector('#authPassword').value);gate.hidden=true;await runningAuthCallback();}
      catch(e){err.textContent=e.message;}
      finally{btn.disabled=false;btn.textContent='Masuk';}
    });
  }
  window.CILT={cfg,isCloud,safeText,dateParts,today,currentHour,hourLabel,niceDate,addDays,getRange,getOne,upsert,evaluate,statusLabels,statusShort,toast,exportCSV,withAuth,logout};
})();
