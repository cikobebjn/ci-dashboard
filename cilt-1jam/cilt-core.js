(function () {
  'use strict';
  const cfg = window.CILT_CONFIG || {};
  // Daftar mesin fallback untuk Packaging Chingfong / Gedung 6.
  // Tetap gunakan MACHINES dari konfigurasi jika berupa array yang valid.
  const DEFAULT_MACHINES = ["CF 01","CF 02","CF 04","CF 05","CF 06","CF 08","CF 12","CF 13","CF 14","CF 15","CF 16","CF 17","CF 19","CF 20"];
  const configuredMachines = Array.isArray(cfg.MACHINES)
    ? [...new Set(cfg.MACHINES.map(v => String(v || '').trim()).filter(Boolean))] : [];
  cfg.MACHINES = configuredMachines.length ? configuredMachines : DEFAULT_MACHINES.slice();
  cfg.SUPABASE_URL = String(cfg.SUPABASE_URL || '').trim();
  cfg.SUPABASE_ANON_KEY = String(cfg.SUPABASE_ANON_KEY || '').trim();
  cfg.TIMEZONE = cfg.TIMEZONE || 'Asia/Jakarta';
  cfg.BUILDING = String(cfg.BUILDING || '6');
  const STORE_KEY = 'kobe-cilt-chingfong-hourly-v1';
  const OWNER_KEY = 'kobe-cilt-slot-tokens-v1';
  const isCloud = Boolean(cfg.SUPABASE_URL.trim() && cfg.SUPABASE_ANON_KEY.trim());
  // Tanpa akun; token slot dibuat otomatis saat penyimpanan pertama.

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
  const slotKey=(date,machine,hour)=>`${date}|${machine}|${Number(hour)}`;
  function tokenMap(){
    try{const m=JSON.parse(localStorage.getItem(OWNER_KEY)||'{}');return m&&typeof m==='object'&&!Array.isArray(m)?m:{};}
    catch(_){return {};}
  }
  function tokenFor(d,m,h){return tokenMap()[slotKey(d,m,h)]||'';}
  function saveToken(d,m,h,token){
    const mapp=tokenMap();mapp[slotKey(d,m,h)]=token;
    for(const k of Object.keys(mapp)){if(k.slice(0,10)<addDays(today(),-370))delete mapp[k];}
    localStorage.setItem(OWNER_KEY,JSON.stringify(mapp));
  }
  function generateToken(){
    if(crypto.randomUUID)return crypto.randomUUID();
    const random=new Uint8Array(24);crypto.getRandomValues(random);
    return Array.from(random,x=>x.toString(16).padStart(2,'0')).join('');
  }
  // Normalisasi URL memastikan prefix '/rest/v1' hanya ada satu kali.
  // Format konfigurasi yang diterima: https://PROJECT_REF.supabase.co
  // Jika pengguna menyalin URL lengkap /rest/v1, bagian path akan dibuang.
  function projectBaseUrl(){
    let url;
    try { url = new URL(String(cfg.SUPABASE_URL || '').trim()); }
    catch (_) { throw new Error('SUPABASE_URL tidak valid. Gunakan https://PROJECT_REF.supabase.co'); }
    if (url.protocol !== 'https:' || !/^[a-z0-9-]+\.supabase\.co$/i.test(url.hostname)) {
      throw new Error('SUPABASE_URL bukan Project URL Supabase. Gunakan https://PROJECT_REF.supabase.co');
    }
    return url.origin;
  }
  function setConnectionStatus(label){
    document.querySelectorAll('[data-storage-label]').forEach(el=>el.textContent=label);
  }
  async function request(resource,method='GET',body=null,extra={}){
    const cleanResource=String(resource).replace(/^\/+/, '');
    const endpoint='/rest/v1/'+cleanResource;
    const url=projectBaseUrl()+endpoint;
    const headers={'apikey':cfg.SUPABASE_ANON_KEY.trim(),'Content-Type':'application/json',...extra};
    let resp;
    try { resp=await fetch(url,{method,headers,body:body===null?undefined:JSON.stringify(body)}); }
    catch (e) {
      setConnectionStatus('Supabase • Koneksi gagal');
      throw new Error('Tidak dapat menghubungi Supabase: '+(e?.message||'koneksi gagal'));
    }
    const raw=await resp.text();let data;
    try { data=raw?JSON.parse(raw):null; }catch(_){ data=null; }
    if (!resp.ok){
      setConnectionStatus('Supabase • Gagal memuat');
      const code=data?.code?' / '+data.code:'';
      const message=data?.message||data?.hint||'Permintaan ditolak oleh API Supabase.';
      // Jangan pernah mencantumkan apikey / token dalam pesan error.
      throw new Error('HTTP '+resp.status+code+' ('+method+' '+endpoint.split('?')[0]+'): '+message);
    }
    setConnectionStatus('Online • Supabase');
    return data;
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
  async function getRange(from,to){
    if(!isCloud)return allLocal().filter(x=>x.check_date>=from&&x.check_date<=to).sort((a,b)=>b.check_date.localeCompare(a.check_date)||b.hour_slot-a.hour_slot);
    let all=[],offset=0;const page=1000;
    while(true){
      const query='cilt_hourly_public?select=*&check_date=gte.'+encodeURIComponent(from)+'&check_date=lte.'+encodeURIComponent(to)+'&order=check_date.desc,hour_slot.desc&limit='+page+'&offset='+offset;
      const rows=await request(query);
      all=all.concat(rows||[]);
      if(!rows||rows.length<page)break;
      offset+=rows.length;
      if(offset>40000)throw new Error('Terlalu banyak data. Gunakan filter tanggal lebih sempit.');
    }
    return all;
  }
  async function getOne(date,machine,hour){
    if(!isCloud)return allLocal().find(x=>x.check_date===date&&x.machine===machine&&Number(x.hour_slot)===Number(hour))||null;
    const token=tokenFor(date,machine,hour);
    if(token){
      const full=await request('rpc/cilt_public_get_record','POST',{p_date:date,p_machine:machine,p_hour:Number(hour),p_token:token});
      if(full)return full;
    }
    const query='cilt_hourly_public?select=*&check_date=eq.'+encodeURIComponent(date)+'&machine=eq.'+encodeURIComponent(machine)+'&hour_slot=eq.'+Number(hour)+'&limit=1';
    const rows=await request(query);
    return rows?.length?{...rows[0],locked:true}:null;
  }
  async function upsert(record){
    if(!isCloud){
      const all=allLocal(),i=all.findIndex(x=>x.check_date===record.check_date&&x.machine===record.machine&&Number(x.hour_slot)===Number(record.hour_slot));
      const now=new Date().toISOString();const saved={...record,id:i<0?('local-'+Date.now()+'-'+Math.random().toString(36).slice(2,7)):all[i].id,created_at:i<0?now:all[i].created_at,updated_at:now};
      if(i<0)all.push(saved);else all[i]=saved;
      writeLocal(all);return saved;
    }
    const token=tokenFor(record.check_date,record.machine,record.hour_slot)||generateToken();
    const saved=await request('rpc/cilt_public_save','POST',{
      p_date:record.check_date,p_machine:record.machine,p_hour:Number(record.hour_slot),
      p_shift:Number(record.shift),p_operator_name:record.operator_name,
      p_checks:record.checks,p_general_note:record.general_note||'',p_token:token
    });
    if(!saved)throw new Error('Server tidak mengembalikan data yang tersimpan.');
    saveToken(record.check_date,record.machine,record.hour_slot,token);
    return saved;
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
  async function withAuth(onReady){
    setConnectionStatus(isCloud?'Supabase • Menghubungkan...':'Lokal • Perangkat ini');
    document.querySelectorAll('[data-local-note]').forEach(el=>{el.hidden=isCloud;});
    document.querySelectorAll('[data-logout]').forEach(el=>el.remove());
    await onReady();
  }
  window.CILT={cfg,isCloud,safeText,dateParts,today,currentHour,hourLabel,niceDate,addDays,getRange,getOne,upsert,evaluate,statusLabels,statusShort,toast,exportCSV,withAuth};
})();
