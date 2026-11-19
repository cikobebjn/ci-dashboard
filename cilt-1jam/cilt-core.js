(function () {
  'use strict';
  const cfg = window.CILT_CONFIG;
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
  async function request(resource,method='GET',body=null,extra={}){
    const headers={'apikey':cfg.SUPABASE_ANON_KEY,'Content-Type':'application/json',...extra};
    const resp=await fetch(cfg.SUPABASE_URL.replace(/\/$/,'')+'/rest/v1/'+resource,{method,headers,body:body===null?undefined:JSON.stringify(body)});
    const raw=await resp.text();let data;
    try{data=raw?JSON.parse(raw):null;}catch(_){data=null;}
    if(!resp.ok)throw new Error(data?.message||data?.hint||'Koneksi Supabase gagal ('+resp.status+').');
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
    const saved=await request('rpc/cilt_public_save_multi','POST',{
      p_building:String(record.building || '6'),p_date:record.check_date,p_machine:record.machine,p_hour:Number(record.hour_slot),
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
  // Modern, accessible toast notifications for forms and monitoring.
  function toast(text,variant='good'){
    const kind=variant==='bad'?'bad':variant==='warn'?'warn':variant==='info'?'info':'good';
    let host=document.getElementById('toastHost');
    if(!host){
      host=document.createElement('div');
      host.id='toastHost';host.className='toast-host';
      host.setAttribute('aria-label','Notifikasi CIL');
      document.body.appendChild(host);
    }
    while(host.children.length>=3)host.firstElementChild.remove();
    const item=document.createElement('section');
    item.className='toast toast-'+kind;
    item.setAttribute('role',kind==='bad'||kind==='warn'?'alert':'status');
    const symbol=document.createElement('span');symbol.className='toast-symbol';
    symbol.setAttribute('aria-hidden','true');
    symbol.textContent={good:'✓',bad:'!',warn:'!',info:'i'}[kind];
    const body=document.createElement('div');body.className='toast-body';
    const title=document.createElement('strong');title.className='toast-title';
    title.textContent=kind==='good'?'Berhasil':kind==='info'?'Informasi':kind==='warn'?'Perhatian':/^gagal\b/i.test(String(text))?'Gagal memproses':'Periksa isian';
    const msg=document.createElement('p');msg.className='toast-message';msg.textContent=String(text);
    body.append(title,msg);
    const close=document.createElement('button');close.type='button';close.className='toast-close';
    close.setAttribute('aria-label','Tutup notifikasi');close.textContent='×';
    const progress=document.createElement('span');progress.className='toast-progress';
    progress.setAttribute('aria-hidden','true');
    const duration=kind==='bad'||kind==='warn'?8000:5500;
    item.style.setProperty('--toast-duration',duration+'ms');
    item.append(symbol,body,close,progress);
    host.appendChild(item);
    let timer;
    const dismiss=()=>{
      clearTimeout(timer);
      item.classList.add('toast-exit');
      setTimeout(()=>item.remove(),220);
    };
    close.addEventListener('click',dismiss);
    timer=setTimeout(dismiss,duration);
  }

  // Replaces the browser's default confirm popup with an in-page dialog.
  let confirmPending=false;
  function confirmAction({title='Konfirmasi',message='',confirmText='Lanjutkan',cancelText='Batal',type='primary'}={}){
    if(confirmPending)return Promise.resolve(false);
    confirmPending=true;
    return new Promise(resolve=>{
      const overlay=document.createElement('div');overlay.className='cil-confirm-overlay';
      const dialog=document.createElement('section');dialog.className='cil-confirm-dialog';
      dialog.setAttribute('role','dialog');dialog.setAttribute('aria-modal','true');
      const header=document.createElement('div');header.className='cil-confirm-head';
      const icon=document.createElement('span');icon.className='cil-confirm-icon';
      icon.setAttribute('aria-hidden','true');icon.textContent=type==='warning'?'↺':'✓';
      const copy=document.createElement('div');copy.className='cil-confirm-copy';
      const h=document.createElement('h2');h.textContent=title;const p=document.createElement('p');p.textContent=message;
      h.id='cilConfirmTitle';p.id='cilConfirmDescription';
      dialog.setAttribute('aria-labelledby',h.id);dialog.setAttribute('aria-describedby',p.id);
      copy.append(h,p);header.append(icon,copy);
      const actions=document.createElement('div');actions.className='cil-confirm-actions';
      const cancel=document.createElement('button');cancel.className='btn btn-secondary cil-confirm-cancel';
      cancel.type='button';cancel.textContent=cancelText;
      const accept=document.createElement('button');
      accept.className='btn cil-confirm-accept '+(type==='warning'?'cil-confirm-warning':'btn-primary');
      accept.type='button';accept.textContent=confirmText;
      actions.append(cancel,accept);dialog.append(header,actions);overlay.appendChild(dialog);
      document.body.appendChild(overlay);
      const prior=document.activeElement;
      const complete=confirmed=>{
        document.removeEventListener('keydown',keyHandler,true);
        overlay.remove();confirmPending=false;
        if(prior && typeof prior.focus==='function')prior.focus();
        resolve(confirmed);
      };
      const keyHandler=e=>{
        if(e.key==='Escape'){e.preventDefault();complete(false);}
        if(e.key==='Tab'){
          const focusables=[cancel,accept];
          const index=focusables.indexOf(document.activeElement);
          if(e.shiftKey && index<=0){e.preventDefault();accept.focus();}
          else if(!e.shiftKey && index===1){e.preventDefault();cancel.focus();}
        }
      };
      document.addEventListener('keydown',keyHandler,true);
      cancel.addEventListener('click',()=>complete(false));
      accept.addEventListener('click',()=>complete(true));
      overlay.addEventListener('click',e=>{if(e.target===overlay)complete(false);});
      cancel.focus();
    });
  }
  function exportCSV(filename,rows){
    function safeCsv(x){let s=String(x??'');if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';}
    const csv='\ufeffsep=;\r\n'+rows.map(row=>row.map(safeCsv).join(';')).join('\r\n');
    const blob=new Blob([csv],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),500);
  }
  async function withAuth(onReady){
    document.querySelectorAll('[data-storage-label]').forEach(el=>{el.textContent=isCloud?'Online • Supabase':'Lokal • Perangkat ini';});
    document.querySelectorAll('[data-local-note]').forEach(el=>{el.hidden=isCloud;});
    document.querySelectorAll('[data-logout]').forEach(el=>el.remove());
    await onReady();
  }
  window.CILT={cfg,isCloud,safeText,dateParts,today,currentHour,hourLabel,niceDate,addDays,getRange,getOne,upsert,evaluate,statusLabels,statusShort,toast,confirmAction,exportCSV,withAuth};
})();
