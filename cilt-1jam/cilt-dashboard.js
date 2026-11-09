(function(){
  'use strict';
  const app=window.CILT,tasks=window.CILT_TASKS,$=id=>document.getElementById(id);
  let sourceRecords=[],dayRecords=[],page=0,loading=false,pendingRefresh=false;
  const PAGE_SIZE=12;
  function optionList(){
    $('dayFilter').value=app.today();
    $('machineFilter').insertAdjacentHTML('beforeend',app.cfg.MACHINES.map(m=>`<option value="${app.safeText(m)}">${app.safeText(m)}</option>`).join(''));
  }
  function isMatch(record){return (!$('machineFilter').value||record.machine===$('machineFilter').value) && (!$('shiftFilter').value||String(record.shift)===$('shiftFilter').value);}
  function filterDay(){const day=$('dayFilter').value;return sourceRecords.filter(r=>r.check_date===day&&isMatch(r)).sort((a,b)=>Number(b.hour_slot)-Number(a.hour_slot)||a.machine.localeCompare(b.machine));}
  function updateKPIs(){
    const stats=dayRecords.map(app.evaluate);const tasksCount=stats.reduce((n,s)=>n+s.total,0);
    const done=stats.reduce((n,s)=>n+s.done,0),abnormal=stats.reduce((n,s)=>n+s.abnormal,0),skipped=stats.reduce((n,s)=>n+s.skipped,0);
    $('kpiSlots').textContent=dayRecords.length.toLocaleString('id-ID');$('kpiRate').textContent=tasksCount?Math.round(100*done/tasksCount)+'%':'—';
    $('kpiAbnormal').textContent=abnormal.toLocaleString('id-ID');$('kpiSkipped').textContent=skipped.toLocaleString('id-ID');
    $('kpiSlotsFoot').textContent='Tercatat pada '+app.niceDate($('dayFilter').value);
    const selectedMachine=$('machineFilter').value,selectedShift=$('shiftFilter').value;
    $('filterCaption').textContent=app.niceDate($('dayFilter').value,true)+(selectedMachine?' · '+selectedMachine:' · Semua Mesin')+(selectedShift?' · Shift '+selectedShift:' · Semua Shift');
  }
  function renderHeatmap(){
    const date=$('dayFilter').value,machines=$('machineFilter').value?[$('machineFilter').value]:app.cfg.MACHINES;
    const index=new Map(dayRecords.map(r=>[r.machine+'|'+r.hour_slot,r]));
    const nowDay=app.today(),futureHour=app.currentHour();
    const heading='<thead><tr><th>MESIN</th>'+Array.from({length:24},(_,h)=>`<th>${String(h).padStart(2,'0')}</th>`).join('')+'</tr></thead>';
    const rows=machines.map(machine=>{
      let html=`<tr><td>${app.safeText(machine)}</td>`;
      for(let hour=0;hour<24;hour++){
        const entry=index.get(machine+'|'+hour);
        const status=entry?app.evaluate(entry).status:((date>nowDay||(date===nowDay&&hour>futureHour))?'future':'none');
        const statusName={done:'Seluruh task dilakukan',abnormal:'Abnormal',skipped:'Tidak dilakukan',incomplete:'Belum lengkap',none:'Belum ada data',future:'Belum masuk jam'}[status];
        const name=`${machine} • ${app.hourLabel(hour)} • ${statusName}`;
        html+=`<td><button type="button" class="heatmap-cell ${status}" title="${app.safeText(name)}" aria-label="${app.safeText(name)}" data-heat-machine="${app.safeText(machine)}" data-heat-hour="${hour}"></button></td>`;
      }
      return html+'</tr>';
    }).join('');
    $('heatmapTable').innerHTML=heading+'<tbody>'+rows+'</tbody>';
    $('heatmapSubtitle').textContent=$('shiftFilter').value?'Hanya menampilkan shift yang dipilih; kolom kosong belum tentu tidak dilakukan.':'Setiap kotak mewakili satu mesin pada satu jam.';
  }
  function renderTrend(){
    const selectedDay=$('dayFilter').value;
    const trend=Array.from({length:7},(_,n)=>{
      const date=app.addDays(selectedDay,n-6);return {date,count:sourceRecords.filter(r=>r.check_date===date&&isMatch(r)).length};
    });
    const max=Math.max(1,...trend.map(x=>x.count));
    $('sevenDayChart').innerHTML=trend.map(x=>{
      const label=new Intl.DateTimeFormat('id-ID',{weekday:'short',timeZone:app.cfg.TIMEZONE}).format(new Date(x.date+'T12:00:00+07:00'));
      const height=x.count?Math.max(6,Math.round(x.count/max*100)):0;
      return `<div class="chart-col"><div class="chart-bar-track"><div class="chart-bar" style="height:${height}%" title="${app.safeText(app.niceDate(x.date))} • ${x.count} entri"></div></div><span class="chart-day">${app.safeText(label)}</span></div>`;
    }).join('');
    const sum=trend.reduce((n,x)=>n+x.count,0);
    $('chartCaption').innerHTML=`<strong style="color:#315271">${sum.toLocaleString('id-ID')} slot terinput</strong> dalam 7 hari sampai ${app.safeText(app.niceDate(selectedDay))}. Grafik menghitung data yang benar-benar disimpan.`;
  }
  function renderRecords(){
    $('recordTotal').textContent=dayRecords.length+' DATA';
    const count=Math.ceil(dayRecords.length/PAGE_SIZE);
    if(page>=count)page=Math.max(0,count-1);
    const segment=dayRecords.slice(page*PAGE_SIZE,page*PAGE_SIZE+PAGE_SIZE);
    $('recordsBody').innerHTML=segment.length?segment.map((r,i)=>{
      const stats=app.evaluate(r),statusText={done:'Seluruh task dilakukan',abnormal:'Abnormality',skipped:'Tidak dilakukan',incomplete:'Belum lengkap'}[stats.status]||'Belum dinilai';
      return `<tr><td>${app.safeText(app.niceDate(r.check_date))}</td><td class="strong-cell">${app.hourLabel(r.hour_slot)}</td><td class="strong-cell">${app.safeText(r.machine)}</td><td>${r.shift}</td><td>${app.safeText(r.operator_name)}</td><td><span class="pill ${stats.status}">${statusText}</span></td><td><button type="button" class="btn btn-secondary btn-sm" data-detail-index="${page*PAGE_SIZE+i}">Lihat</button></td></tr>`;
    }).join(''):'<tr><td colspan="7"><div class="empty-state"><span class="empty-icon">▦</span>Belum ada pengecekan untuk filter ini.<br>Gunakan tombol <b>Input CIL</b> untuk menambahkan data.</div></td></tr>';
    $('pageInfo').textContent=dayRecords.length?`${page*PAGE_SIZE+1}–${Math.min(dayRecords.length,(page+1)*PAGE_SIZE)} dari ${dayRecords.length} data`:'0 data';
    $('prevPage').disabled=page===0;$('nextPage').disabled=page>=count-1;
  }
  function redraw(){dayRecords=filterDay();updateKPIs();renderHeatmap();renderTrend();renderRecords();}
  async function fetchAll(){
    if(loading){pendingRefresh=true;return;}
    const day=$('dayFilter').value;if(!day)return;
    loading=true;$('refreshBtn').disabled=true;$('refreshBtn').textContent='Memuat...';
    try{sourceRecords=await app.getRange(app.addDays(day,-6),day);page=0;redraw();}
    catch(e){app.toast('Gagal memuat data: '+e.message,'bad');}
    finally{loading=false;$('refreshBtn').disabled=false;$('refreshBtn').textContent='↻ Refresh';if(pendingRefresh){pendingRefresh=false;void fetchAll();}}
  }
  function showDetail(record){
    if(!record)return;
    $('detailTitle').textContent=record.machine+' · '+app.hourLabel(record.hour_slot);
    $('detailSubtitle').textContent=app.niceDate(record.check_date,true)+' · Shift '+record.shift+' · '+record.operator_name;
    $('detailContents').innerHTML=tasks.map(t=>{
      const r=(record.checks||[]).find(x=>Number(x.task_id)===t.id)||{};
      const key=r.status||'incomplete';const status=app.statusLabels[key]||'Belum diisi';
      return `<div class="detail-item"><div><strong>Task ${t.id} · ${app.safeText(t.type)} · ${app.safeText(t.part)}</strong><p>${r.note?'Keterangan: '+app.safeText(r.note):'Alat: '+app.safeText(t.tools)+' · '+t.durationMin+' menit'}</p></div><span class="pill ${app.safeText(key)}">${app.safeText(status)}</span></div>`;
    }).join('')+(record.general_note?`<div class="notice notice-compact"><strong>Catatan umum:</strong> ${app.safeText(record.general_note)}</div>`:'');
    $('detailEdit').href=`cilt-1jam-form.html?date=${encodeURIComponent(record.check_date)}&machine=${encodeURIComponent(record.machine)}&hour=${Number(record.hour_slot)}`;
    $('detailModal').hidden=false;$('closeDetail').focus();
  }
  function hideDetail(){ $('detailModal').hidden=true; }
  function exportData(){
    if(!dayRecords.length){app.toast('Belum ada data untuk diekspor.','bad');return;}
    const rows=[['Tanggal','Jam','Gedung','Area','Mesin','Shift','Nama Operator','Urutan Task','Jenis CIL','Sub Equipment','Nama Part','Status','Keterangan per Item','Keterangan Umum','Terakhir Diperbarui']];
    dayRecords.forEach(record=>{
      tasks.forEach(t=>{
        const result=(record.checks||[]).find(x=>Number(x.task_id)===t.id)||{};
        rows.push([record.check_date,app.hourLabel(record.hour_slot),record.building||'6','Packing',record.machine,'Shift '+record.shift,record.operator_name,t.id,t.type,t.equipment,t.part,app.statusLabels[result.status]||'Belum diisi',result.note||'',record.general_note||'',record.updated_at||'']);
      });
    });
    app.exportCSV(`CIL_1Jam_${$('dayFilter').value}_${$('machineFilter').value||'SemuaMesin'}.csv`,rows);
    app.toast('File CSV siap dibuka di Excel.');
  }
  async function main(){
    optionList();
    $('dayFilter').addEventListener('change',fetchAll);
    $('machineFilter').addEventListener('change',()=>{page=0;redraw();});
    $('shiftFilter').addEventListener('change',()=>{page=0;redraw();});
    $('refreshBtn').addEventListener('click',fetchAll);
    $('downloadCSV').addEventListener('click',exportData);
    $('prevPage').addEventListener('click',()=>{if(page>0){page--;renderRecords();}});
    $('nextPage').addEventListener('click',()=>{if((page+1)*PAGE_SIZE<dayRecords.length){page++;renderRecords();}});
    $('recordsBody').addEventListener('click',e=>{const b=e.target.closest('[data-detail-index]');if(b)showDetail(dayRecords[Number(b.dataset.detailIndex)]);});
    $('heatmapTable').addEventListener('click',e=>{
      const b=e.target.closest('[data-heat-machine]');if(!b)return;
      const machine=b.dataset.heatMachine,hour=Number(b.dataset.heatHour);
      const rec=dayRecords.find(x=>x.machine===machine&&Number(x.hour_slot)===hour);
      if(rec)showDetail(rec);else window.location.href=`cilt-1jam-form.html?date=${encodeURIComponent($('dayFilter').value)}&machine=${encodeURIComponent(machine)}&hour=${hour}`;
    });
    $('closeDetail').addEventListener('click',hideDetail);$('detailCancel').addEventListener('click',hideDetail);
    $('detailModal').addEventListener('click',e=>{if(e.target===$('detailModal'))hideDetail();});
    document.addEventListener('keydown',e=>{if(e.key==='Escape')hideDetail();});
    window.addEventListener('cilt-data-updated',fetchAll);
    window.addEventListener('storage',e=>{if(e.key==='kobe-cilt-chingfong-hourly-v1')fetchAll();});
    await app.withAuth(fetchAll);
  }
  document.addEventListener('DOMContentLoaded',main);
})();
