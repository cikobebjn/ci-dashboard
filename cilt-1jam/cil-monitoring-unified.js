/* KOBE — CIL monitoring unified 1 Jam / 4 Jam
 * One read-only dashboard, distinct Supabase views and original form URLs.
 * Config is loaded from existing cilt-1jam/cilt-config.js; no keys copied here.
 */
(function(){
  'use strict';
  const $=id=>document.getElementById(id);
  const cfg=window.CILT_CONFIG||{};
  const FALLBACK_MACHINES=['CF 01','CF 02','CF 04','CF 05','CF 06','CF 08','CF 12','CF 13','CF 14','CF 15','CF 16','CF 17','CF 19','CF 20'];
  const machines=Array.isArray(cfg.MACHINES)&&cfg.MACHINES.some(Boolean)?Array.from(new Set(cfg.MACHINES.map(m=>String(m).trim()).filter(Boolean))):FALLBACK_MACHINES;
  const ZONE=cfg.TIMEZONE||'Asia/Jakarta';
  const cloud=Boolean(String(cfg.SUPABASE_URL||'').trim()&&String(cfg.SUPABASE_ANON_KEY||'').trim());
  const periods={
    '1':{label:'CIL 1 Jam',hours:Array.from({length:24},(_,i)=>i),tasks:[{"id":1,"type":"Cleaning","code":"C","equipment":"Longseal","part":"Hotbar Longseal","instructions":"Cleaning :\n1. Olesakan oil compound pada sikat kawat\n2. Sikat hotbar longseal secara searah dari atas kebawah","tools":"Sikat Kawat","runStop":"Stop","durationMin":4},{"id":2,"type":"Inspection","code":"I","equipment":"Longseal","part":"Hotbar Longseal","instructions":"Inspeksi :\n1. cek kondisi hotbar apakah terdapat benda asing atau tidak\n2. cek suhu set sebelum running\n3. pastikan hotbar tidak gompal","tools":"Mata","runStop":"Stop","durationMin":1},{"id":3,"type":"Cleaning","code":"C","equipment":"Endseal","part":"Hotbar Endseal","instructions":"Cleaning :\n1. Olesakan oil compound pada sikat kawat\n2. Sikat hotbar endseal secara searah dari kiri ke kanan\n3. Congkel bagian sela sela hotbar menggunakan kawat untuk menghilangkan sisa remahan pada celah hotbar","tools":"Sikat Kawat","runStop":"Stop","durationMin":4},{"id":4,"type":"Inspection","code":"I","equipment":"Endseal","part":"Hotbar Endseal","instructions":"Inspeksi :\n1. cek kondisi hotbar apakah terdapat benda asing atau tidak\n2. cek suhu set sebelum running\n3. pastikan hotbar tidak gompal","tools":"Mata","runStop":"Stop","durationMin":1}],view:'cilt_hourly_public',localKey:'kobe-cilt-chingfong-hourly-v1',form:'cilt-1jam-form.html',exportName:'1Jam'},
    '4':{label:'CIL 4 Jam',hours:[0,4,8,12,16,20],tasks:[{"id":1,"type":"Cleaning","code":"C","equipment":"Forming","part":"Forming","instructions":"Cleaning :\n1. Potong kemasan paling bawah pada former.\n2. Semprot sisa seasioning menggunakan lowress dari atas.\n3. Bersihkan Special tools dengan alkohol dan dpastikan kering.\n4. Bersihkan bagian forming bagian bawah menggunakan special tools.\n4. Bersihkan forming menggunakan Wypall kering.","tools":"Kape, wypall","runStop":"Stop","durationMin":10},{"id":2,"type":"Cleaning","code":"C","equipment":"Sensor Eyemark","part":"Sensor Eyemark","instructions":"Cleaning :\n1. Bersihkan sensor eyemark menggunakan Wypall","tools":"Wypall","runStop":"Stop","durationMin":3},{"id":3,"type":"Inspection","code":"I","equipment":"Sensor Eyemark","part":"Sensor Eyemark","instructions":"Inspeksi :\n1. cek sensor apakah berfungsi dengan baik atau tidak (pastikan lampu indikator sensor berkedip)\n2. pastikan kabel sensor tidak ada retak, putus, dan terjepit.\n3. Pastikan konektor sensor tidak longgar/kendor.","tools":"Mata","runStop":"Stop","durationMin":2}],view:'cil_4hour_public',localKey:'kobe-cil4-chingfong-4hour-v1',form:'../cil-4jam/cil-4jam-form.html',exportName:'4Jam'}
  };
  const statusText={done:'Sudah dilakukan',abnormal:'Abnormality',skipped:'Tidak dilakukan'};
  let period='1',sourceRecords=[],dayRecords=[],page=0,requestId=0;
  const PAGE_SIZE=12;
  const safe=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function parts(date=new Date()){
    const p=new Intl.DateTimeFormat('en-US',{timeZone:ZONE,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(date);
    return Object.fromEntries(p.map(x=>[x.type,x.value]));
  }
  const today=()=>{const p=parts();return `${p.year}-${p.month}-${p.day}`;};
  const hourNow=()=>Number(parts().hour);
  const hourText=n=>String(n).padStart(2,'0')+':00';
  const addDays=(ymd,n)=>{const d=new Date(ymd+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
  const formatDate=(ymd,weekday=false)=>new Intl.DateTimeFormat('id-ID',{timeZone:ZONE,year:'numeric',month:'short',day:'numeric',...(weekday?{weekday:'short'}:{})}).format(new Date(ymd+'T12:00:00+07:00'));
  const current=()=>periods[period];
  const isMatch=r=>(!$('machineFilter').value||r.machine===$('machineFilter').value)&&(!$('shiftFilter').value||String(r.shift)===$('shiftFilter').value);
  const statusFrom=record=>{
    let done=0,abnormal=0,skipped=0,empty=0;
    const checks=Array.isArray(record?.checks)?record.checks:[];
    for(const t of current().tasks){const match=checks.find(c=>Number(c.task_id)===t.id);if(match?.status==='done')done++;else if(match?.status==='abnormal')abnormal++;else if(match?.status==='skipped')skipped++;else empty++;}
    return {done,abnormal,skipped,empty,total:current().tasks.length,status:abnormal?'abnormal':skipped?'skipped':empty?'incomplete':'done'};
  };
  function showStatus(label){document.querySelectorAll('[data-storage-label]').forEach(el=>el.textContent=label);}
  function toast(message,bad=false){
    let host=document.getElementById('toastHost');if(!host){host=document.createElement('div');host.id='toastHost';host.className='toast-host';document.body.append(host);}
    const item=document.createElement('div');item.className='toast'+(bad?' bad':'');item.textContent=message;host.append(item);setTimeout(()=>item.remove(),4800);
  }
  function projectBase(){
    let url;try{url=new URL(String(cfg.SUPABASE_URL||'').trim());}catch(_){throw new Error('SUPABASE_URL belum valid. Periksa cilt-config.js.');}
    if(url.protocol!=='https:'||!/^[a-z0-9-]+\.supabase\.co$/i.test(url.hostname))throw new Error('Gunakan Project URL https://PROJECT_REF.supabase.co pada cilt-config.js.');
    return url.origin; // discards accidental /rest/v1
  }
  async function rangeCloud(view,from,to){
    const result=[];let offset=0;
    while(true){
      const q=new URLSearchParams({select:'*',order:'check_date.desc,hour_slot.desc',limit:'1000',offset:String(offset)});
      q.append('check_date','gte.'+from);q.append('check_date','lte.'+to);
      const url=projectBase()+'/rest/v1/'+view+'?'+q.toString();
      let response;
      try{response=await fetch(url,{headers:{apikey:String(cfg.SUPABASE_ANON_KEY).trim(),Accept:'application/json'}});}catch(e){throw new Error('Tidak dapat menghubungi Supabase: '+e.message);}
      const raw=await response.text();let payload;try{payload=raw?JSON.parse(raw):null;}catch(_){payload=null;}
      if(!response.ok){
        const message=payload?.message||payload?.hint||'Permintaan ditolak';
        if(response.status===404 && view==='cil_4hour_public')
          throw new Error('Data CIL 4 Jam belum tersedia. Jalankan SQL_CIL_4Jam.sql di Supabase, lalu Refresh. ('+message+')');
        throw new Error('Supabase HTTP '+response.status+(payload?.code?' / '+payload.code:'')+': '+message);
      }
      if(!Array.isArray(payload))throw new Error('Respons Supabase tidak berupa daftar data.');
      result.push(...payload);offset+=payload.length;
      if(payload.length<1000)break;
      if(offset>50000)throw new Error('Jumlah data terlalu banyak; pilih rentang tanggal lebih singkat.');
    }
    return result;
  }
  function rangeLocal(key,from,to){
    try{const all=JSON.parse(localStorage.getItem(key)||'[]');return(Array.isArray(all)?all:[]).filter(r=>r.check_date>=from&&r.check_date<=to);}catch(_){return [];}
  }
  function setPeriod(next,{load=true,remember=true}={}){
    if(!periods[next])return;
    period=next;page=0;sourceRecords=[];dayRecords=[];
    requestId++; // invalidates pending fetches from another period
    for(const button of document.querySelectorAll('[data-period]')){const active=button.dataset.period===next;button.classList.toggle('is-active',active);button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;}
    $('cilDataPanel').setAttribute('aria-labelledby',next==='1'?'tabOne':'tabFour');
    $('periodSlotCount').textContent=current().hours.length;
    $('periodTaskCount').textContent=current().tasks.length;
    $('kpiSlotLabel').textContent=next==='1'?'Jam Terinput':'Periode Terinput';
    $('heatmapHeading').textContent='Peta Pengecekan '+(next==='1'?'24 Jam':'6 Periode');
    $('recordSubtitle').textContent='Riwayat '+current().label+' sesuai tanggal, mesin, dan shift.';
    $('inputCilButton').href=current().form;
    $('inputCilButton').textContent='+  Input '+current().label;
    $('formNav').href=current().form;
    $('formNav').textContent='✎  Form '+(next==='1'?'1 Jam':'4 Jam');
    $('loadError').hidden=true;
    if(remember){const url=new URL(location.href);url.searchParams.set('period',next);history.replaceState(null,'',url);}
    renderAll();if(load)void fetchAll();
  }
  function filterDay(){const day=$('dayFilter').value;return sourceRecords.filter(r=>r.check_date===day&&isMatch(r)).sort((a,b)=>Number(b.hour_slot)-Number(a.hour_slot)||String(a.machine).localeCompare(String(b.machine)));}
  function renderKPIs(){
    const stats=dayRecords.map(statusFrom),tot=stats.reduce((n,s)=>n+s.total,0),done=stats.reduce((n,s)=>n+s.done,0);
    $('kpiSlots').textContent=dayRecords.length.toLocaleString('id-ID');
    $('kpiRate').textContent=tot?Math.round(100*done/tot)+'%':'—';
    $('kpiAbnormal').textContent=stats.reduce((n,s)=>n+s.abnormal,0).toLocaleString('id-ID');
    $('kpiSkipped').textContent=stats.reduce((n,s)=>n+s.skipped,0).toLocaleString('id-ID');
    $('kpiSlotsFoot').textContent='Tercatat pada '+formatDate($('dayFilter').value);
    $('filterCaption').textContent=current().label+' • '+formatDate($('dayFilter').value,true)+($('machineFilter').value?' · '+$('machineFilter').value:' · Semua Mesin')+($('shiftFilter').value?' · Shift '+$('shiftFilter').value:' · Semua Shift');
  }
  function renderHeatmap(){
    const day=$('dayFilter').value,hours=current().hours,shown=$('machineFilter').value?[$('machineFilter').value]:machines;
    const indexed=new Map(dayRecords.map(r=>[r.machine+'|'+r.hour_slot,r]));
    const head='<thead><tr><th>MESIN</th>'+hours.map(h=>`<th>${String(h).padStart(2,'0')}</th>`).join('')+'</tr></thead>';
    const rows=shown.map(m=>{
      let row='<tr><td>'+safe(m)+'</td>';
      for(const h of hours){
        const r=indexed.get(m+'|'+h);
        const status=r?statusFrom(r).status:(day>today()||(day===today()&&h>hourNow())?'future':'none');
        const label={done:'Seluruh task dilakukan',abnormal:'Abnormal',skipped:'Tidak dilakukan',incomplete:'Belum lengkap',future:'Jam belum tiba',none:'Belum ada data'}[status];
        row+=`<td><button class="heatmap-cell ${status}" title="${safe(m+' · '+hourText(h)+' · '+label)}" aria-label="${safe(m+' · '+hourText(h)+' · '+label)}" data-machine="${safe(m)}" data-hour="${h}" ${status==='future'?'disabled':''}></button></td>`;
      }
      return row+'</tr>';
    }).join('');
    $('heatmapTable').dataset.period=period;
    $('heatmapTable').innerHTML=head+'<tbody>'+rows+'</tbody>';
    $('heatmapSubtitle').textContent=$('shiftFilter').value?'Sesuai filter shift. Kotak kosong bukan berarti tugas tidak dilakukan.':period==='1'?'Setiap kotak mewakili satu mesin pada satu jam.':'Enam kolom: 00, 04, 08, 12, 16, dan 20.';
  }
  function renderTrend(){
    const day=$('dayFilter').value;
    const trend=Array.from({length:7},(_,i)=>{const date=addDays(day,i-6);return{date,count:sourceRecords.filter(r=>r.check_date===date&&isMatch(r)).length};});
    const max=Math.max(1,...trend.map(v=>v.count));
    $('sevenDayChart').innerHTML=trend.map(v=>{
      const label=new Intl.DateTimeFormat('id-ID',{timeZone:ZONE,weekday:'short'}).format(new Date(v.date+'T12:00:00+07:00'));
      const height=v.count?Math.max(5,Math.round(v.count/max*100)):0;
      return `<div class="chart-col"><div class="chart-bar-track"><div class="chart-bar" style="height:${height}%" title="${safe(formatDate(v.date))} · ${v.count} pengecekan"></div></div><span class="chart-day">${safe(label)}</span></div>`;
    }).join('');
    const count=trend.reduce((n,v)=>n+v.count,0);
    $('chartCaption').innerHTML=`<strong style="color:#315271">${count.toLocaleString('id-ID')} pengecekan</strong> ${safe(current().label)} dalam 7 hari sampai ${safe(formatDate(day))}. Hanya menghitung data yang tersimpan.`;
  }
  function renderRecords(){
    $('recordTotal').textContent=dayRecords.length+' DATA';
    const maxPages=Math.ceil(dayRecords.length/PAGE_SIZE);
    page=Math.max(0,Math.min(page,maxPages-1));
    const items=dayRecords.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE);
    $('recordsBody').innerHTML=items.length?items.map((r,i)=>{
      const s=statusFrom(r),label={done:'Seluruh task dilakukan',abnormal:'Abnormality',skipped:'Tidak dilakukan',incomplete:'Belum lengkap'}[s.status];
      return `<tr><td>${safe(formatDate(r.check_date))}</td><td class="strong-cell">${hourText(r.hour_slot)}</td><td class="strong-cell">${safe(r.machine)}</td><td>${safe(r.shift)}</td><td>${safe(r.operator_name||'—')}</td><td><span class="pill ${s.status}">${label}</span></td><td><button type="button" class="btn btn-secondary btn-sm" data-index="${page*PAGE_SIZE+i}">Lihat</button></td></tr>`;
    }).join(''):`<tr><td colspan="7"><div class="empty-state"><span class="empty-icon">▦</span>Belum ada pengecekan ${safe(current().label)} untuk filter ini.<br>Gunakan <b>Input CIL</b> untuk menambahkan data.</div></td></tr>`;
    $('pageInfo').textContent=items.length?`${page*PAGE_SIZE+1}–${Math.min(dayRecords.length,(page+1)*PAGE_SIZE)} dari ${dayRecords.length} data`:'0 data';
    $('prevPage').disabled=page===0;$('nextPage').disabled=page>=maxPages-1;
  }
  function renderAll(){dayRecords=filterDay();renderKPIs();renderHeatmap();renderTrend();renderRecords();}
  async function fetchAll(){
    const day=$('dayFilter').value;if(!day)return;
    const currentRequest=++requestId;
    const requested=periods[period];
    const button=$('refreshBtn');button.disabled=true;button.textContent='Memuat...';
    $('loadError').hidden=true;$('cilDataPanel').setAttribute('aria-busy','true');
    sourceRecords=[];page=0;renderAll();
    try{
      const records=cloud?await rangeCloud(requested.view,addDays(day,-6),day):rangeLocal(requested.localKey,addDays(day,-6),day);
      if(currentRequest!==requestId)return;
      sourceRecords=records;
      showStatus(cloud?'Online • Supabase':'Lokal • Perangkat ini');
      renderAll();
    }catch(e){
      if(currentRequest!==requestId)return;
      $('loadError').textContent='Gagal memuat '+requested.label+': '+e.message;
      $('loadError').hidden=false;
      showStatus('Supabase • Perlu diperiksa');
      toast('Data '+requested.label+' gagal dimuat.',true);
    }finally{
      if(currentRequest===requestId){button.disabled=false;button.textContent='↻ Refresh';$('cilDataPanel').setAttribute('aria-busy','false');}
    }
  }
  function showDetail(record){
    $('detailTitle').textContent=current().label+' · '+record.machine+' · '+hourText(record.hour_slot);
    $('detailSubtitle').textContent=formatDate(record.check_date,true)+' · Shift '+record.shift+' · '+(record.operator_name||'—');
    $('detailContents').innerHTML=current().tasks.map(t=>{
      const r=(Array.isArray(record.checks)?record.checks:[]).find(x=>Number(x.task_id)===t.id)||{};
      const key=['done','abnormal','skipped'].includes(r.status)?r.status:'incomplete';
      const extra=r.note?'Keterangan: '+safe(r.note):'Alat: '+safe(t.tools)+' · '+Number(t.durationMin)+' menit';
      return `<div class="detail-item"><div><strong>Task ${t.id} · ${safe(t.type)} · ${safe(t.part)}</strong><p>${extra}</p></div><span class="pill ${key}">${statusText[key]||'Belum diisi'}</span></div>`;
    }).join('')+(record.general_note?`<div class="notice notice-compact"><strong>Catatan tambahan:</strong> ${safe(record.general_note)}</div>`:'');
    $('detailEdit').href=current().form+'?date='+encodeURIComponent(record.check_date)+'&machine='+encodeURIComponent(record.machine)+'&hour='+Number(record.hour_slot);
    $('detailModal').hidden=false;$('closeDetail').focus();
  }
  function hideDetail(){$('detailModal').hidden=true;}
  function exportCSV(){
    if(!dayRecords.length){toast('Tidak ada data untuk diekspor pada filter ini.',true);return;}
    const rows=[['Jenis CIL','Tanggal','Jam','Gedung','Area','Mesin','Shift','Nama Operator','Urutan Task','Jenis Pekerjaan','Equipment','Nama Part','Status','Keterangan Item','Keterangan Umum','Terakhir Diperbarui']];
    for(const r of dayRecords)for(const t of current().tasks){const c=(r.checks||[]).find(x=>Number(x.task_id)===t.id)||{};rows.push([current().label,r.check_date,hourText(r.hour_slot),r.building||'6','Packing',r.machine,'Shift '+r.shift,r.operator_name||'',t.id,t.type,t.equipment,t.part,statusText[c.status]||'Belum diisi',c.note||'',r.general_note||'',r.updated_at||'']);}
    const csvCell=value=>{let v=String(value??'');if(/^\s*[=+@-]/.test(v))v="'"+v;return '"'+v.replace(/"/g,'""')+'"';};
    const csv='\ufeffsep=;\r\n'+rows.map(r=>r.map(csvCell).join(';')).join('\r\n');
    const blob=new Blob([csv],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');
    link.href=url;link.download=`CIL_${current().exportName}_${$('dayFilter').value}_${$('machineFilter').value||'SemuaMesin'}.csv`;
    document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('File CSV siap dibuka di Excel.');
  }
  function init(){
    $('dayFilter').value=today();
    const select=$('machineFilter');for(const machine of machines){const o=document.createElement('option');o.value=machine;o.textContent=machine;select.append(o);}
    document.querySelectorAll('[data-local-note]').forEach(el=>el.hidden=cloud);
    $('dayFilter').addEventListener('change',()=>void fetchAll());
    $('machineFilter').addEventListener('change',()=>{page=0;renderAll();});
    $('shiftFilter').addEventListener('change',()=>{page=0;renderAll();});
    $('refreshBtn').addEventListener('click',()=>void fetchAll());
    $('downloadCSV').addEventListener('click',exportCSV);
    $('prevPage').addEventListener('click',()=>{if(page>0){page--;renderRecords();}});
    $('nextPage').addEventListener('click',()=>{if((page+1)*PAGE_SIZE<dayRecords.length){page++;renderRecords();}});
    $('recordsBody').addEventListener('click',e=>{const b=e.target.closest('[data-index]');if(b)showDetail(dayRecords[Number(b.dataset.index)]);});
    $('heatmapTable').addEventListener('click',e=>{
      const b=e.target.closest('[data-machine][data-hour]');if(!b||b.disabled)return;
      const found=dayRecords.find(r=>r.machine===b.dataset.machine&&Number(r.hour_slot)===Number(b.dataset.hour));
      if(found)showDetail(found);
      else location.href=current().form+'?date='+encodeURIComponent($('dayFilter').value)+'&machine='+encodeURIComponent(b.dataset.machine)+'&hour='+Number(b.dataset.hour);
    });
    $('closeDetail').addEventListener('click',hideDetail);$('detailCancel').addEventListener('click',hideDetail);
    $('detailModal').addEventListener('click',e=>{if(e.target===$('detailModal'))hideDetail();});
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('detailModal').hidden)hideDetail();});
    const tabs=Array.from(document.querySelectorAll('[data-period]'));
    for(const t of tabs){t.addEventListener('click',()=>setPeriod(t.dataset.period));t.addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();const next=t.dataset.period==='1'?'4':'1';setPeriod(next);tabs.find(b=>b.dataset.period===next)?.focus();}});}
    const requested=new URLSearchParams(location.search).get('period');
    setPeriod(requested==='4'?'4':'1',{load:true,remember:false});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
