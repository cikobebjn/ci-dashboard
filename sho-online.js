/* KOBE SHO - Supabase shared storage. Requires the existing inline BASE, KEY, state and notify. */
(function(){
  'use strict';
  const TABLE={issues:'sho_issues',reviews:'sho_reviews'};
  const FIELDS={
    issues:['id','tanggal','shift','gedung','line','mesin','sku','tl','category','problem','action','pic','priority','status','time_start','time_end','duration_minutes','downtime_minutes','occurred_at','updated_at'],
    reviews:['id','tanggal','shift','gedung','line','mesin','tl_serah','tl_terima','issues_count','open_count','downtime_total','oee_actual','oee_target','review_notes','reviewed_at']
  };
  const order={issues:'occurred_at.desc',reviews:'reviewed_at.desc'};
  let busySync=null;
  const status=document.getElementById('sho-connection');
  const politeStatus=(message,ok)=>{
    state.online=ok;
    if(status){status.className='pill '+(ok?'online':'warn');status.textContent=message;status.title=ok?'Semua data disimpan di database Supabase.':'Tidak ada penyimpanan lokal otomatis. Periksa SQL dan koneksi.';}
    const last=document.getElementById('last-sync');
    if(last && ok)last.textContent='Sinkron terakhir: '+new Date().toLocaleTimeString('id-ID',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  };
  const errorText=async res=>{
    let msg='';
    try{const body=await res.json();msg=body.message||body.hint||body.error||JSON.stringify(body)}catch{msg=res.statusText}
    if(res.status===404 || /PGRST205|Could not find the table|schema cache/i.test(msg))return 'Tabel SHO belum tersedia. Jalankan file SQL_SETUP_SHO.sql di Supabase.';
    if(res.status===401 || res.status===403)return 'Akses Supabase ditolak ('+res.status+'). Periksa publishable key dan izin RLS tabel SHO. '+String(msg).slice(0,140);
    return 'Supabase HTTP '+res.status+': '+String(msg).slice(0,230);
  };
  const request=async (path,{method='GET',body,extraHeaders={}}={})=>{
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),15000);
    try{
      // Important: sb_publishable_* belongs in apikey, NOT a Bearer JWT header.
      const res=await fetch(BASE+'/rest/v1/'+path,{
        method,signal:controller.signal,
        headers:{apikey:KEY,Accept:'application/json','Content-Type':'application/json',...extraHeaders},
        ...(body===undefined?{}:{body:JSON.stringify(body)})
      });
      if(!res.ok)throw new Error(await errorText(res));
      if(res.status===204)return [];
      return await res.json();
    }catch(err){
      if(err.name==='AbortError')throw new Error('Koneksi Supabase melewati 15 detik. Coba lagi.');
      throw err;
    }finally{clearTimeout(timeout)}
  };
  async function readAll(kind){
    const table=TABLE[kind],items=[];
    const perPage=1000;
    for(let offset=0;offset<50000;offset+=perPage){
      const batch=await request(table+'?select=*&order='+order[kind]+'&limit='+perPage+'&offset='+offset);
      if(!Array.isArray(batch))throw Error('Respons data '+table+' bukan daftar.');
      items.push(...batch);
      if(batch.length<perPage)return items;
    }
    throw Error('Jumlah data SHO terlalu banyak; hentikan agar tidak menampilkan data yang tidak lengkap.');
  }
  async function sync(force=false){
    if(busySync){
      if(!force)return busySync;
      try{await busySync}catch{}
    }
    const task=(async()=>{
      try{
        const [issues,reviews]=await Promise.all([readAll('issues'),readAll('reviews')]);
        state.issues=issues;
        state.reviews=reviews;
        state.checkins=[];
        politeStatus('Supabase Online',true);
        document.dispatchEvent(new Event('sho-data-updated'));
        return {issues:issues.length,reviews:reviews.length};
      }catch(e){
        politeStatus('Supabase tidak terhubung',false);
        throw e;
      }
    })();
    busySync=task;
    try{return await task}finally{if(busySync===task)busySync=null}
  }
  function cleanPayload(kind,row){
    const out={};
    for(const key of FIELDS[kind])if(row[key]!==undefined)out[key]=row[key];
    return out;
  }
  async function save(kind,row,update=false,skipSync=false){
    if(!TABLE[kind])throw Error('Tabel penyimpanan tidak dikenal: '+kind);
    if(!state.online){await sync(true)}
    const path=TABLE[kind]+'?on_conflict='+encodeURIComponent(kind==='issues'?'id':'tanggal,shift,gedung,mesin');
    const body=cleanPayload(kind,row);
    let result;
    try{
      result=await request(path,{method:'POST',body:body,extraHeaders:{Prefer:'resolution=merge-duplicates,return=representation'}});
      if(!Array.isArray(result)||result.length!==1)throw Error('Server tidak mengonfirmasi data yang tersimpan.');
    }catch(err){politeStatus('Simpan gagal',false);throw err}
    if(!skipSync){
      try{await sync(true)}catch(e){
        // A successful HTTP insert must not be incorrectly presented as a failed insert.
        console.warn('Data written, but subsequent sync failed:',e);
      }
    }
    return result[0];
  }
  function oldLocal(kind){
    try{const data=JSON.parse(localStorage.getItem('kobe_sho_quick_'+kind+'_v1')||'[]');return Array.isArray(data)?data:[]}catch{return []}
  }
  const validId=id=>typeof id==='string'&&/^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(id);
  function validIssue(x){return x && validId(x.id)&&/^\d{4}-\d{2}-\d{2}$/.test(x.tanggal||'')&&[1,2,3].includes(+x.shift)&&['4','6','7'].includes(String(x.gedung))&&x.mesin&&x.problem;}
  function validReview(x){return x && validId(x.id)&&/^\d{4}-\d{2}-\d{2}$/.test(x.tanggal||'')&&[1,2,3].includes(+x.shift)&&['4','6','7'].includes(String(x.gedung))&&x.mesin;}
  function localAvailable(){return oldLocal('issues').length+oldLocal('reviews').length}
  function enableImport(){
    const header=document.querySelector('.filters .card-title');
    if(!header)return;
    const original=document.getElementById('refresh');
    const button=document.createElement('button');
    button.id='sho-import-local';button.type='button';button.className='btn btn-soft btn-sm';
    button.textContent='Impor data lama browser';
    button.style.display='none';
    button.style.margin='0 6px 0 auto';
    if(original)header.insertBefore(button,original);else header.appendChild(button);
    const show=()=>{button.style.display=state.online&&localAvailable()?'inline-flex':'none'};
    document.addEventListener('sho-data-updated',show);show();
    button.addEventListener('click',async()=>{
      if(!state.online){notify('Supabase belum terhubung.',true);return}
      const prevIssues=oldLocal('issues'),prevReviews=oldLocal('reviews');
      const remoteIds=new Set(state.issues.map(x=>x.id));
      const remoteReviewKeys=new Set(state.reviews.map(x=>[x.tanggal,+x.shift,x.gedung,x.mesin].join('|')));
      const toIssues=prevIssues.filter(x=>validIssue(x)&&!remoteIds.has(x.id));
      const toReviews=prevReviews.filter(x=>validReview(x)&&!remoteReviewKeys.has([x.tanggal,+x.shift,x.gedung,x.mesin].join('|')));
      const skipped=prevIssues.length+prevReviews.length-toIssues.length-toReviews.length;
      if(!toIssues.length&&!toReviews.length){notify('Tidak ada data browser baru untuk diimpor ('+skipped+' sudah ada / tidak lengkap).');return}
      if(!confirm('Impor '+toIssues.length+' issue dan '+toReviews.length+' handover yang belum ada di Supabase? Data online yang sudah ada tidak akan ditimpa.'))return;
      button.disabled=true;button.textContent='Mengimpor...';let done=0;
      try{
        for(const row of toIssues){await save('issues',row,false,true);done++}
        for(const row of toReviews){await save('reviews',row,false,true);done++}
        await sync(true);
        notify('Impor selesai: '+done+' catatan baru berhasil masuk Supabase. '+skipped+' dilewati.');
      }catch(e){notify('Impor terhenti setelah '+done+' catatan: '+e.message,true);try{await sync(true)}catch{}}
      finally{button.disabled=false;button.textContent='Impor data lama browser';show()}
    });
  }
  window.SHO_API={sync,save};
  enableImport();
  sync(true).catch(e=>{console.warn('SHO Supabase connection:',e.message);if(typeof notify==='function')notify('SHO belum dapat mengambil data online: '+e.message,true)});
  setInterval(()=>{if(!document.hidden)sync().catch(e=>console.warn('SHO background sync:',e.message))},15000);
  window.addEventListener('pageshow',()=>sync().catch(()=>{}));
  window.addEventListener('online',()=>sync(true).catch(()=>{}));
})();

