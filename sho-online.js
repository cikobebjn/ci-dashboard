/*
 KOBE | SHO ONLINE - direct Supabase, no login / activation.
 WARNING: public read/write pilot. Protect access before production use.
 This file replaces bridge/local writes on GitHub Pages; uses browser localStorage
 only for current filter context and optional explicit import of old issues.
*/
(()=>{
 'use strict';
 if(!/^https?:$/.test(location.protocol)) return;
 let client, ready=false, inFlight=null, lastRead=0, writing=0;
 let bannerEl, statusEl, importEl, retryEl;
 const TABLE={issues:'sho_live_issues',reviews:'sho_live_reviews'};
 const originalLocalIssues=read('issues',[]);
 const originalLocalReviews=read('reviews',[]);
 const explain=e=>String(e?.message||e||'Tidak diketahui').slice(0,220);
 function status(message,hasError=false){
   if(!statusEl)return;
   statusEl.textContent=message;
   bannerEl.style.cssText+=';background:'+(hasError?'#fff1f2':'#eff6ff')+';border-color:'+(hasError?'#fecdd3':'#bfdbfe')+';color:'+(hasError?'#9f1239':'#17427a');
 }
 function appendBanner(){
   bannerEl=document.createElement('div'); bannerEl.id='sho-online-status';
   bannerEl.setAttribute('role','status');
   bannerEl.style.cssText='display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin:0 0 16px;padding:12px 15px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;color:#17427a;font:600 12px/1.5 system-ui';
   statusEl=document.createElement('span');statusEl.style.flex='1 1 220px';statusEl.textContent='Menghubungkan ke Supabase...';
   retryEl=document.createElement('button');retryEl.type='button';retryEl.textContent='Muat Ulang Data';
   retryEl.style.cssText='border:1px solid #bfdbfe;border-radius:9px;padding:7px 10px;background:white;color:#17427a;font-size:11px;font-weight:800;cursor:pointer';
   retryEl.onclick=()=>boot().catch(()=>{});
   importEl=document.createElement('button');importEl.type='button';importEl.textContent='Impor Data Lama';importEl.hidden=true;
   importEl.style.cssText=retryEl.style.cssText;importEl.onclick=importLocal;
   bannerEl.append(statusEl,retryEl,importEl);
   (document.querySelector('main,.wrap,.main')||document.body).prepend(bannerEl);
 }
 function renderNow(){
   document.dispatchEvent(new Event('sho-data-updated'));
   if(typeof render==='function')render();
 }
 function localToImport(){
   const saved=new Set((state.issues||[]).map(x=>x.id));
   return originalLocalIssues.filter(x=>x&&x.id&&!saved.has(x.id));
 }
 function showImport(){
   if(!importEl)return;
   const list=localToImport();
   importEl.hidden=!ready||!list.length;
   if(list.length)importEl.textContent='Impor '+list.length+' Issue Lokal';
 }
 function requireOnline(){if(!ready||!client)throw Error('Belum terkoneksi ke Supabase. Periksa status koneksi di atas dan SQL database.');}
 async function boot(){
   if(!window.supabase?.createClient){status('GAGAL • Library Supabase tidak termuat. Periksa internet atau blokir CDN.',true);return;}
   if(!client){
     client=window.supabase.createClient(BASE,KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,storageKey:'sho-public-direct'}});
   }
   state.online=true;
   try{await synchronize();ready=true;showImport();}
   catch(e){ready=false;status('BELUM TERSAMBUNG • '+explain(e)+' · Jalankan SQL 02_AKTIFKAN_SHO_ONLINE.sql',true);}
 }
 async function synchronize(){
   if(!client)throw Error('Client Supabase belum siap.');
   if(inFlight)return inFlight;
   inFlight=(async()=>{
     const [issues,reviews]=await Promise.all([
       client.from(TABLE.issues).select('*').order('occurred_at',{ascending:false}).limit(2000),
       client.from(TABLE.reviews).select('*').order('reviewed_at',{ascending:false}).limit(2000)
     ]);
     if(issues.error)throw issues.error;
     if(reviews.error)throw reviews.error;
     state.issues=issues.data||[];
     state.reviews=reviews.data||[];
     state.checkins=[];
     lastRead=Date.now();
     ready=true;
     renderNow();showImport();
     status('ONLINE • Data Supabase sama untuk HP dan laptop · '+new Date().toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit'}));
     return true;
   })();
   try{return await inFlight;}
   catch(e){status('GAGAL MEMUAT • '+explain(e),true);throw e;}
   finally{inFlight=null;}
 }
 async function saveOnline(table,row,update=false){
   requireOnline();
   if(!Object.prototype.hasOwnProperty.call(TABLE,table))throw Error('Jenis data tidak dikenal.');
   writing++;
   try{
     // Only current schema columns are sent, no authentication fields.
     const target=client.from(TABLE[table]);
     const {data,error}=update
        ?await target.update(row).eq('id',row.id).select().single()
        :await target.insert(row).select().single();
     if(error)throw error;
     if(!data?.id)throw Error('Respons Supabase tidak berisi ID catatan.');
     state[table]=update ? state[table].map(x=>x.id===data.id?data:x) : [data,...state[table]];
     renderNow();
     status('SUKSES • '+(table==='issues'?'Issue':'Handover')+' tersimpan online di Supabase.');
     // Do not flag save as failed if read refresh fails afterward.
     synchronize().catch(e=>console.warn('Penyegaran tertunda:',explain(e)));
     return data;
   } catch(e){
     status('GAGAL MENYIMPAN • '+explain(e),true);
     throw new Error(explain(e));
   } finally {writing--;}
 }
 async function importLocal(){
   requireOnline();
   const pending=localToImport();
   if(!pending.length)return;
   if(!confirm('Impor '+pending.length+' issue lama dari browser ini ke database online? Pastikan belum tercatat dari perangkat lain agar tidak terjadi duplikasi.'))return;
   importEl.disabled=true;
   let successes=0,failures=[];
   for(const x of pending){
     try{await saveOnline('issues',x);successes++;}
     catch(err){failures.push(explain(err));}
   }
   importEl.disabled=false;
   await synchronize().catch(()=>{});
   if(failures.length)alert('Impor '+successes+' berhasil, '+failures.length+' gagal. '+failures[0]);
   else alert(successes+' catatan berhasil diimpor.');
 }
 appendBanner();
 // Immediately discard LOCAL issue/review copies as display source on hosted site.
 // Keep local browser keys intact to allow explicit import.
 state.online=true;state.issues=[];state.reviews=[];state.checkins=[];
 refreshLocal=function(){};
 persist=saveOnline;
 if(typeof reload==='function')reload=async()=>{
    try{await synchronize();await loadOee(ctx());notify('Data Supabase terbaru berhasil dimuat.');}
    catch(e){notify('Gagal sinkron: '+explain(e),true);}
 };
 renderNow();
 boot().catch(e=>status('GAGAL TERHUBUNG • '+explain(e),true));
 window.addEventListener('focus',()=>{if(client&&Date.now()-lastRead>7000)synchronize().catch(()=>{});});
 window.addEventListener('pageshow',()=>{if(client)synchronize().catch(()=>{});});
 setInterval(()=>{if(ready&&!document.hidden&&!writing)synchronize().catch(()=>{});},12000);
 window.SHO_ONLINE={get ready(){return ready;},refresh:synchronize};
})();
