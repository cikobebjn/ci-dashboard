(function(){
  'use strict';
  const $ = id => document.getElementById(id);
  const primary = window.CILT;
  const PAGE_SIZE = 12;
  let sourceRecords=[], dayRecords=[], page=0, loading=false, refreshPending=false;

  function selectedPeriod(){return $('periodFilter').value === '4' ? '4' : '1';}
  function app(){return selectedPeriod()==='4'?window.CIL4:window.CILT;}
  function tasks(){return selectedPeriod()==='4'?window.CIL4_TASKS:window.CILT_TASKS;}
  function slots(){return selectedPeriod()==='4'?[0,4,8,12,16,20]:Array.from({length:24},(_,i)=>i);}
  function urlForForm(r={}){
    const prefix=selectedPeriod()==='4'?'../cil-4jam/cil-4jam-form.html':'cilt-1jam-form.html';
    const args=new URLSearchParams();
    if(r.building)args.set('building',r.building);
    if(r.machine)args.set('machine',r.machine);
    if(r.check_date)args.set('date',r.check_date);
    if(r.hour_slot!==undefined)args.set('hour',String(r.hour_slot));
    return prefix+(args.toString()?'?'+args:'');
  }
  function setInputLink(){
    const el=$('mainInputLink');if(!el)return;
    el.href=urlForForm({building:$('buildingFilter').value||'6'});
    el.textContent='+ Input CIL '+selectedPeriod()+' Jam';
  }
  function options(){
    $('dayFilter').value=primary.today();
    const params=new URLSearchParams(location.search);
    if(['1','4'].includes(params.get('period')))$('periodFilter').value=params.get('period');
    if(['4','6','7'].includes(params.get('building')))$('buildingFilter').value=params.get('building');
    renderMachineOptions();
    setInputLink();
  }
  function renderMachineOptions(){
    const b=$('buildingFilter').value,old=$('machineFilter').value;
    const machines=window.CIL_MACHINE_MASTER.filter(x=>!b||x.building===b);
    $('machineFilter').innerHTML='<option value="">Semua Mesin</option>'+machines.map(x=>
      `<option value="${primary.safeText(x.machine)}">${primary.safeText(x.machine)} · GD${x.building}</option>`).join('');
    if(machines.some(x=>x.machine===old))$('machineFilter').value=old;
  }
  function isMatch(r){
    return (!$('buildingFilter').value||r.building===$('buildingFilter').value)
      && (!$('machineFilter').value||r.machine===$('machineFilter').value)
      && (!$('shiftFilter').value||String(r.shift)===$('shiftFilter').value);
  }
  function filterDay(){const day=$('dayFilter').value;return sourceRecords.filter(r=>r.check_date===day&&isMatch(r)).sort((a,b)=>Number(b.hour_slot)-Number(a.hour_slot)||a.machine.localeCompare(b.machine));}
  function updateKPIs(){
    const selectedApp=app(),v=dayRecords.map(r=>selectedApp.evaluate(r)),total=v.reduce((n,s)=>n+s.total,0);
    const done=v.reduce((n,s)=>n+s.done,0),abnormal=v.reduce((n,s)=>n+s.abnormal,0),skipped=v.reduce((n,s)=>n+s.skipped,0);
    $('kpiSlots').textContent=dayRecords.length.toLocaleString('id-ID');
    $('kpiRate').textContent=total?Math.round(done/total*100)+'%':'—';
    $('kpiAbnormal').textContent=abnormal.toLocaleString('id-ID');
    $('kpiSkipped').textContent=skipped.toLocaleString('id-ID');
    $('kpiSlotsFoot').textContent='Tercatat pada '+selectedApp.niceDate($('dayFilter').value);
    const b=$('buildingFilter').value||'Semua',m=$('machineFilter').value||'Semua Mesin',shift=$('shiftFilter').value;
    $('filterCaption').textContent=selectedApp.niceDate($('dayFilter').value,true)+' · CIL '+selectedPeriod()+' Jam · Gedung '+b+' · '+m+(shift?' · Shift '+shift:'');
  }
  function renderHeatmap(){
    const selectedApp=app(),dates=$('dayFilter').value;
    const building=$('buildingFilter').value;
    const machines=window.CIL_MACHINE_MASTER.filter(x=>(!building||x.building===building)&&(!$('machineFilter').value||x.machine===$('machineFilter').value));
    const index=new Map(dayRecords.map(r=>[r.building+'|'+r.machine+'|'+r.hour_slot,r]));
    const nowDay=selectedApp.today(),nowHour=selectedApp.currentHour(),ss=slots();
    const head='<thead><tr><th>MESIN</th>'+ss.map(h=>`<th>${String(h).padStart(2,'0')}</th>`).join('')+'</tr></thead>';
    const rows=machines.map(item=>{
      let html=`<tr><td>GD${item.building} · ${selectedApp.safeText(item.machine)}</td>`;
      for(const h of ss){
        const r=index.get(item.building+'|'+item.machine+'|'+h);
        const status=r?selectedApp.evaluate(r).status:dates>nowDay||(dates===nowDay&&h>nowHour)?'future':'none';
        const desc={done:'Selesai',abnormal:'Abnormal',skipped:'Tidak dilakukan',incomplete:'Belum lengkap',none:'Belum terisi',future:'Belum waktunya'}[status];
        const label=`Gedung ${item.building} · ${item.machine} · ${selectedApp.hourLabel(h)} · ${desc}`;
        html+=`<td><button type="button" class="heatmap-cell ${status}" title="${selectedApp.safeText(label)}" aria-label="${selectedApp.safeText(label)}" data-machine="${selectedApp.safeText(item.machine)}" data-building="${item.building}" data-hour="${h}"></button></td>`;
      }
      return html+'</tr>';
    }).join('');
    $('heatmapTable').innerHTML=head+'<tbody>'+rows+'</tbody>';
    $('heatmapSubtitle').textContent=selectedPeriod()==='4'?'6 periode pemeriksaan per mesin (setiap 4 jam)':'24 periode pemeriksaan per mesin (setiap jam)';
  }
  function renderTrend(){
    const selectedApp=app(),end=$('dayFilter').value;
    const values=Array.from({length:7},(_,n)=>{const date=selectedApp.addDays(end,n-6);return {date,count:sourceRecords.filter(r=>r.check_date===date&&isMatch(r)).length};});
    const max=Math.max(1,...values.map(x=>x.count));
    $('sevenDayChart').innerHTML=values.map(x=>{
      const label=new Intl.DateTimeFormat('id-ID',{weekday:'short',timeZone:selectedApp.cfg.TIMEZONE}).format(new Date(x.date+'T12:00:00+07:00'));
      const h=x.count?Math.max(6,Math.round(x.count/max*100)):0;
      return `<div class="chart-col"><div class="chart-bar-track"><div class="chart-bar" style="height:${h}%" title="${selectedApp.safeText(selectedApp.niceDate(x.date))} · ${x.count} entri"></div></div><span class="chart-day">${selectedApp.safeText(label)}</span></div>`;
    }).join('');
    $('chartCaption').textContent=values.reduce((n,x)=>n+x.count,0)+' pengecekan tersimpan dalam 7 hari sampai '+selectedApp.niceDate(end)+'.';
  }
  function renderRecords(){
    const selectedApp=app();
    $('recordTotal').textContent=dayRecords.length+' DATA';
    const pages=Math.ceil(dayRecords.length/PAGE_SIZE);if(page>=pages)page=Math.max(0,pages-1);
    const chunk=dayRecords.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE);
    $('recordsBody').innerHTML=chunk.length?chunk.map((r,i)=>{
      const stat=selectedApp.evaluate(r),label={done:'Seluruh task dilakukan',abnormal:'Abnormality',skipped:'Tidak dilakukan',incomplete:'Belum lengkap'}[stat.status]||'Belum dinilai';
      return `<tr><td>${selectedApp.safeText(selectedApp.niceDate(r.check_date))}</td><td class="strong-cell">${selectedApp.hourLabel(r.hour_slot)}</td><td>GD${selectedApp.safeText(r.building||'6')}</td><td class="strong-cell">${selectedApp.safeText(r.machine)}</td><td>${r.shift}</td><td>${selectedApp.safeText(r.operator_name)}</td><td><span class="pill ${stat.status}">${label}</span></td><td><button type="button" class="btn btn-secondary btn-sm" data-detail-index="${page*PAGE_SIZE+i}">Lihat</button></td></tr>`;
    }).join(''):'<tr><td colspan="8"><div class="empty-state">Belum ada pengecekan untuk filter ini.</div></td></tr>';
    $('pageInfo').textContent=dayRecords.length?`${page*PAGE_SIZE+1}–${Math.min(dayRecords.length,(page+1)*PAGE_SIZE)} dari ${dayRecords.length} data`:'0 data';
    $('prevPage').disabled=page===0;$('nextPage').disabled=page>=pages-1;
  }
  function redraw(){dayRecords=filterDay();updateKPIs();renderHeatmap();renderTrend();renderRecords();setInputLink();}
  async function fetchAll(){
    if(loading){refreshPending=true;return;}
    const day=$('dayFilter').value;if(!day)return;
    loading=true;$('refreshBtn').disabled=true;$('refreshBtn').textContent='Memuat...';
    try{sourceRecords=await app().getRange(app().addDays(day,-6),day);page=0;redraw();}
    catch(e){primary.toast('Gagal memuat: '+e.message,'bad');sourceRecords=[];dayRecords=[];redraw();}
    finally{loading=false;$('refreshBtn').disabled=false;$('refreshBtn').textContent='↻ Refresh';if(refreshPending){refreshPending=false;void fetchAll();}}
  }
  function showDetail(record){
    const selectedApp=app(),tt=tasks();if(!record)return;
    $('detailTitle').textContent='Gedung '+(record.building||'6')+' · '+record.machine+' · '+selectedApp.hourLabel(record.hour_slot);
    $('detailSubtitle').textContent=selectedApp.niceDate(record.check_date,true)+' · Shift '+record.shift+' · '+record.operator_name+' · CIL '+selectedPeriod()+' Jam';
    $('detailContents').innerHTML=tt.map(t=>{
      const row=(record.checks||[]).find(x=>Number(x.task_id)===t.id)||{};
      const key=row.status||'incomplete',status=selectedApp.statusLabels[key]||'Belum diisi';
      return `<div class="detail-item"><div><strong>Task ${t.id} · ${selectedApp.safeText(t.type)} · ${selectedApp.safeText(t.part)}</strong><p>${row.note?'Keterangan: '+selectedApp.safeText(row.note):'Alat: '+selectedApp.safeText(t.tools)+' · '+t.durationMin+' menit'}</p></div><span class="pill ${selectedApp.safeText(key)}">${selectedApp.safeText(status)}</span></div>`;
    }).join('')+(record.general_note?`<div class="notice notice-compact"><strong>Catatan:</strong> ${selectedApp.safeText(record.general_note)}</div>`:'');
    $('detailEdit').href=urlForForm(record);$('detailModal').hidden=false;$('closeDetail').focus();
  }
  function exportCSV(){
    if(!dayRecords.length){primary.toast('Tidak ada data untuk diekspor.','bad');return;}
    const selectedApp=app(),tt=tasks(),rows=[['Tanggal','Jam','Gedung','Line','Mesin','Shift','Operator','Task','Jenis','Equipment','Part','Status','Keterangan','Catatan Umum','Terakhir Update']];
    dayRecords.forEach(r=>{
      const info=window.CIL_MACHINE_INFO(r.machine);
      tt.forEach(t=>{const task=(r.checks||[]).find(x=>Number(x.task_id)===t.id)||{};
        rows.push([r.check_date,selectedApp.hourLabel(r.hour_slot),r.building||'6',info?.line||'',r.machine,r.shift,r.operator_name,t.id,t.type,t.equipment,t.part,selectedApp.statusLabels[task.status]||'Belum diisi',task.note||'',r.general_note||'',r.updated_at||'']);
      });
    });
    selectedApp.exportCSV(`CIL_${selectedPeriod()}Jam_${$('dayFilter').value}_Gedung${$('buildingFilter').value||'Semua'}.csv`,rows);
    selectedApp.toast('CSV berhasil dibuat.');
  }
  async function main(){
    options();$('dayFilter').addEventListener('change',fetchAll);
    $('periodFilter').addEventListener('change',fetchAll);
    $('buildingFilter').addEventListener('change',()=>{renderMachineOptions();page=0;redraw();});
    $('machineFilter').addEventListener('change',()=>{page=0;redraw();});
    $('shiftFilter').addEventListener('change',()=>{page=0;redraw();});
    $('refreshBtn').addEventListener('click',fetchAll);
    $('downloadCSV').addEventListener('click',exportCSV);
    $('prevPage').addEventListener('click',()=>{if(page>0){page--;renderRecords();}});
    $('nextPage').addEventListener('click',()=>{if((page+1)*PAGE_SIZE<dayRecords.length){page++;renderRecords();}});
    $('recordsBody').addEventListener('click',e=>{const b=e.target.closest('[data-detail-index]');if(b)showDetail(dayRecords[Number(b.dataset.detailIndex)]);});
    $('heatmapTable').addEventListener('click',e=>{
      const b=e.target.closest('[data-machine]');if(!b)return;
      const record=dayRecords.find(r=>r.machine===b.dataset.machine&&r.building===b.dataset.building&&Number(r.hour_slot)===Number(b.dataset.hour));
      if(record)showDetail(record);
      else location.href=urlForForm({building:b.dataset.building,machine:b.dataset.machine,check_date:$('dayFilter').value,hour_slot:Number(b.dataset.hour)});
    });
    $('closeDetail').addEventListener('click',()=>{$('detailModal').hidden=true;});
    $('detailCancel').addEventListener('click',()=>{$('detailModal').hidden=true;});
    $('detailModal').addEventListener('click',e=>{if(e.target===$('detailModal'))$('detailModal').hidden=true;});
    document.addEventListener('keydown',e=>{if(e.key==='Escape')$('detailModal').hidden=true;});
    window.addEventListener('cilt-data-updated',fetchAll);
    window.addEventListener('cil4-data-updated',fetchAll);
    window.addEventListener('storage',e=>{if(['kobe-cilt-chingfong-hourly-v1','kobe-cil-4hour-multigedung-v1'].includes(e.key))fetchAll();});
    await primary.withAuth(fetchAll);
  }
  document.addEventListener('DOMContentLoaded',main);
})();
