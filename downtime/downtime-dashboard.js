(function () {
  'use strict';
  const C = window.DowntimeCore, M=C.master;
  const $ = id=>document.getElementById(id);
  const MONTHS=['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  const state={period:'weekly', f:{},pending:null,requestNo:0,last:null};
  const filterFields={start:'fStart',end:'fEnd',workshop:'fWorkshop',line:'fLine',machine:'fMachine',year:'fYear',month:'fMonth',week:'fWeek',section:'fSection',shift:'fShift',category:'fCategory',description:'fDescription'};
  const dayOne=()=>C.todayISO();
  const blankRows = '<div class="chart-empty">Tidak ada data pada periode ini</div>';
  function options(id,items,placeholder){
    const el=$(id),prior=el.value;el.replaceChildren(new Option(placeholder,''));
    for(const item of items){const name=typeof item==='string'?item:item.label;const value=typeof item==='string'?item:item.value;el.append(new Option(name,value));}
    if([...el.options].some(option=>option.value===prior))el.value=prior;
  }
  function lineOptions(){
    const building=$('fWorkshop').value;
    const lines=building?(M.linesByBuilding?.[building]||[]):[...new Set(Object.values(M.linesByBuilding||{}).flat())].sort();
    options('fLine',lines,'Semua Line');machineOptions();
  }
  function machineOptions(){
    const line=$('fLine').value;
    const lines=line?[line]:$('fWorkshop').value?(M.linesByBuilding[$('fWorkshop').value]||[]):Object.keys(M.machinesByLine||{});
    const machines=[...new Set(lines.flatMap(l=>M.machinesByLine?.[l]||[]))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
    options('fMachine',machines,'Semua Mesin');
  }
  function readFilters(){
    const f={};for(const [key,id]of Object.entries(filterFields))f[key]=$(id).value;
    f.exclude_ishoma=$('excludeIshoma').checked;return f;
  }
  function defaultDates(){
    const last=dayOne(),days=Math.max(1,Number(C.config.defaultDays)||30);
    $('fEnd').value=last;$('fStart').value=C.dayMinus(last,days-1);
  }
  function initial(){
    const now=new Date(),years=[now.getFullYear()-1,now.getFullYear()];
    options('fWorkshop',M.buildings||[],'Semua Gedung');
    options('fSection',M.sections||[],'Semua Section');
    options('fShift',M.shifts||[],'Semua Shift');
    options('fCategory',M.categories||[],'Semua Kategori');
    options('fDescription',(M.reasons||[]).map(x=>x.description),'Semua Deskripsi');
    options('fYear',years.map(x=>({label:String(x),value:String(x)})),'Semua Tahun');
    options('fMonth',MONTHS.map((x,i)=>({label:`${String(i+1).padStart(2,'0')} - ${x}`,value:String(i+1)})),'Semua Bulan');
    options('fWeek',Array.from({length:54},(_,i)=>({label:`Week ${i+1}`,value:String(i+1)})),'Semua Week');
    lineOptions();defaultDates();
    const badge=$('sourceBadge');badge.classList.toggle('online',C.configured());$('sourceLabel').textContent=C.configured()?'SUPABASE ONLINE':C.config.previewHistory?'DATA EXCEL':'MODE LOKAL';
    for(const [key,id] of Object.entries(filterFields)){
      $(id).addEventListener('change',()=>{
        if(key==='workshop')lineOptions();if(key==='line')machineOptions();
        if(key==='year')chooseYear();
        if(key==='month')chooseMonth();
        if(key==='week')chooseWeek();
        if(key==='start'||key==='end')clearPeriods();
        update();
      });
    }
    $('excludeIshoma').addEventListener('change',update);
    $('moreFilters').addEventListener('click',()=>{const open=$('filterPanel').classList.toggle('expanded');$('moreFilters').setAttribute('aria-expanded',String(open));$('filterArrow').textContent=open?'⌃':'⌄';});
    $('resetFilters').addEventListener('click',()=>{
      for(const [key,id]of Object.entries(filterFields))if(key!=='start'&&key!=='end')$(id).value='';
      $('excludeIshoma').checked=false;lineOptions();defaultDates();update();
    });
    document.querySelectorAll('[data-period]').forEach(button=>button.addEventListener('click',()=>{
      state.period=button.dataset.period;
      document.querySelectorAll('[data-period]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
      if(state.last)renderTrend(state.last);else update();
    }));
    $('eventDetail').addEventListener('click',e=>{if(e.target===$('eventDetail'))$('eventDetail').close();});
    $('closeDetail').addEventListener('click',()=> $('eventDetail').close());$('detailDone').addEventListener('click',()=> $('eventDetail').close());
    $('historyTable').addEventListener('click',e=>{
      const tr=e.target.closest('tr[data-index]');if(tr)showDetail(Number(tr.dataset.index));
    });
    $('exportCsv').addEventListener('click',exportCsv);
    update();
  }
  function clearPeriods(){$('fYear').value='';$('fMonth').value='';$('fWeek').value='';}
  function chooseYear(){
    const y=Number($('fYear').value);if(!y)return;
    $('fMonth').value='';$('fWeek').value='';$('fStart').value=`${y}-01-01`;$('fEnd').value=`${y}-12-31`;
  }
  function chooseMonth(){
    const m=Number($('fMonth').value);if(!m)return;
    if(!$('fYear').value)$('fYear').value=String(new Date().getFullYear());
    const y=Number($('fYear').value);$('fWeek').value='';
    const a=new Date(y,m-1,1),b=new Date(y,m,0);$('fStart').value=C.isoDate(a);$('fEnd').value=C.isoDate(b);
  }
  function chooseWeek(){
    const w=Number($('fWeek').value);if(!w)return;
    if(!$('fYear').value)$('fYear').value=String(new Date().getFullYear());
    $('fMonth').value='';const y=Number($('fYear').value);
    const first=new Date(y,0,1);first.setDate(first.getDate()-first.getDay()+7*(w-1));
    const last=new Date(first);last.setDate(last.getDate()+6);
    $('fStart').value=C.isoDate(first);$('fEnd').value=C.isoDate(last);
  }
  function update(){clearTimeout(state.pending);state.pending=setTimeout(refresh,130);}
  async function refresh(){
    const ticket=++state.requestNo,stateF=readFilters();state.f=stateF;
    if(stateF.start&&stateF.end&&stateF.start>stateF.end){C.showToast('Tanggal awal melebihi tanggal akhir','error');return;}
    try{
      const data=await C.getSummary(stateF);if(ticket!==state.requestNo)return;
      state.last=data;render(data);
    }catch(e){if(ticket!==state.requestNo)return;C.showToast(e.message||'Gagal memuat downtime','error');renderError(e.message||'Tidak dapat mengambil data');}
  }
  function renderError(message){
    for(const id of ['kMinutes','kEvents','kAverage','kMachines'])$(id).textContent='—';
    $('kHours').textContent='';$('kValid').textContent='';
    $('trendChart').innerHTML=`<div class="chart-empty">${C.esc(message)}</div>`;
    for(const id of ['chartBuildings','chartLines','chartMachines','chartReasons','chartCategories'])$(id).innerHTML=blankRows;
    $('historyTable').innerHTML='<tr><td colspan="8" class="table-empty">Data tidak tersedia</td></tr>';
    $('dataPeriod').textContent='—';
  }
  function render(data){
    const k=data.kpi||{},minutes=C.num(k.minutes),events=C.num(k.events),valid=C.num(k.valid_events);
    $('kMinutes').textContent=C.fmt(minutes,minutes%1?1:0);
    $('kHours').textContent=`${C.fmt(minutes/60,1)} jam downtime`;
    $('kEvents').textContent=C.fmt(events);
    $('kValid').textContent=valid===events?`${C.fmt(valid)} kejadian dengan durasi`:`${C.fmt(valid)} valid · ${C.fmt(events-valid)} belum lengkap`;
    $('kAverage').textContent=C.fmt(valid?minutes/valid:0,1);$('kMachines').textContent=C.fmt(k.machines);
    $('dataPeriod').textContent=k.first_date&&k.last_date?`${C.dateIndo(k.first_date)} – ${C.dateIndo(k.last_date)}`:'Tidak ada data';
    renderTrend(data);
    renderBars('chartBuildings',data.buildings,'buildings');
    renderBars('chartLines',data.lines,'lines');
    renderBars('chartMachines',data.machines,'machines');
    renderBars('chartReasons',data.reasons,'reasons',minutes);
    renderBars('chartCategories',data.categories,'categories');
    renderTable(data.recent||[]);
  }
  function trendLabel(key){
    if(state.period==='weekly'){const m=key.match(/-W(\d+)$/);return m?`W${Number(m[1])}`:key;}
    if(state.period==='monthly'){const [y,m]=key.split('-');return `${MONTHS[Number(m)-1]||m} ${y}`;}
    const parts=key.split('-');return `${Number(parts[2])} ${MONTHS[Number(parts[1])-1]||''}`;
  }
  function renderTrend(data){
    const key=state.period==='daily'?'daily':state.period==='weekly'?'weekly':'monthly';
    const rows=data[key]||[];$('trendMeta').textContent=key.toUpperCase();
    if(!rows.length){$('trendChart').innerHTML=blankRows;return;}
    const W=940,H=260,left=57,right=20,top=23,bottom=44,plotW=W-left-right,plotH=H-top-bottom;
    const mx=Math.max(1,...rows.map(r=>C.num(r.minutes))),maxY=Math.ceil(mx/5)*5||5;
    const x=i=>left+(rows.length===1?plotW/2:(i*plotW)/(rows.length-1));
    const y=v=>top+(1-C.num(v)/maxY)*plotH;
    const points=rows.map((r,i)=>[x(i),y(r.minutes)]);
    const line=points.map(([px,py],i)=>(i?'L':'M')+px.toFixed(1)+' '+py.toFixed(1)).join(' ');
    const area=`${line} L${points[points.length-1][0].toFixed(1)} ${top+plotH} L${points[0][0].toFixed(1)} ${top+plotH} Z`;
    let svg=`<svg role="img" aria-label="Tren downtime ${key}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="dt-area-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#4a96f3" stop-opacity=".26"/><stop offset="1" stop-color="#c8e3fb" stop-opacity="0"/></linearGradient></defs>`;
    for(let i=0;i<=4;i++){
      const val=maxY*i/4,gy=y(val);svg+=`<line x1="${left}" x2="${W-right}" y1="${gy}" y2="${gy}" stroke="#eaf0f7" stroke-width="1" stroke-dasharray="3 5"/><text x="${left-12}" y="${gy+4}" text-anchor="end" font-size="12" fill="#95a7be">${C.esc(C.compact(val))}</text>`;
    }
    svg+=`<path d="${area}" fill="url(#dt-area-fill)"/><path d="${line}" fill="none" stroke="#287be5" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>`;
    const stride=Math.max(1,Math.ceil(rows.length/9));
    rows.forEach((r,i)=>{
      const [px,py]=points[i];
      const isLabel=i%stride===0||i===rows.length-1;
      svg+=`<circle cx="${px}" cy="${py}" r="${rows.length<=14?4:3}" fill="#fff" stroke="#2f7ee3" stroke-width="2.5"><title>${C.esc(trendLabel(r.key))}: ${C.fmt(r.minutes,1)} menit / ${C.fmt(r.events)} kejadian</title></circle>`;
      if(isLabel)svg+=`<text x="${px}" y="${H-13}" text-anchor="middle" font-size="12" fill="#8598b1">${C.esc(trendLabel(r.key))}</text>`;
      if(rows.length<=12 && C.num(r.minutes)>0)svg+=`<text x="${px}" y="${Math.max(12,py-12)}" text-anchor="middle" font-size="11" font-weight="750" fill="#2d69b9">${C.esc(C.compact(r.minutes))}</text>`;
    });
    svg+='</svg>';$('trendChart').innerHTML=svg;
  }
  function renderBars(id,rows,type,totalMinutes){
    const el=$(id);if(!rows?.length){el.innerHTML=blankRows;return;}
    const max=Math.max(1,...rows.map(r=>C.num(r.minutes)));let sum=0;
    el.innerHTML=rows.map((r,i)=>{
      const m=C.num(r.minutes),pc=Math.min(100,Math.max(0,m/max*100)),label=C.esc(r.key),count=C.fmt(r.events),cum=type==='reasons'?Math.round((sum+=m)/Math.max(totalMinutes||1,1)*100):null;
      const cumulative=type==='reasons'?`<span class="pareto-cumulative">${cum}% kumulatif</span>`:'';
      return `<div class="bar-row" title="${label}: ${C.fmt(m,1)} menit, ${count} kejadian"><div class="bar-meta"><span class="bar-label">${label}</span><span class="bar-value">${C.fmt(m,0)} min</span></div><div class="bar-track"><span class="bar-fill" style="width:${pc.toFixed(2)}%"></span></div><div class="bar-meta"><span class="bar-events">${count} kejadian</span>${cumulative}</div></div>`;
    }).join('');
  }
  function classCat(text){const t=String(text||'').toLowerCase();return t.includes('repair')?'repair':t.includes('delay')?'delay':t.includes('ishoma')?'ishoma':'';}
  function renderTable(rows){
    const el=$('historyTable');if(!rows.length){el.innerHTML='<tr><td colspan="8" class="table-empty">Tidak ada data pada filter ini</td></tr>';return;}
    el.innerHTML=rows.map((r,i)=>`<tr data-index="${i}" tabindex="0" aria-label="Buka detail downtime">
      <td class="strong-cell">${C.esc(C.dateIndo(r.tanggal))}</td><td>${C.esc(r.workshop)}</td><td title="${C.esc(r.line)}">${C.esc(r.line||'—')}</td><td class="strong-cell">${C.esc(r.machine||'—')}</td><td>${C.esc(r.shift||'—')}</td><td title="${C.esc(r.dt_description)}">${C.esc(r.dt_description||'—')}</td><td><span class="duration-tag">${r.minutes==null?'—':C.fmt(r.minutes,1)+' min'}</span></td><td><span class="badge-cat ${classCat(r.dt_category)}">${C.esc(r.dt_category||'—')}</span></td>
    </tr>`).join('');
    el.querySelectorAll('tr[data-index]').forEach(tr=>tr.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();showDetail(Number(tr.dataset.index));}}));
  }
  function showDetail(index){
    const r=state.last?.recent?.[index];if(!r)return;
    const fields=[['Tanggal',C.dateIndo(r.tanggal)],['Gedung',r.workshop],['Section',r.section],['Line',r.line],['Shift',r.shift],['Grup',r.grup],['Mesin',r.machine],['Waktu',`${r.start_dt||'—'} – ${r.stop_dt||'—'}`],['Durasi',r.minutes==null?'—':C.fmt(r.minutes,1)+' menit'],['Kategori',r.dt_category],['Deskripsi',r.dt_description],['Root Cause',r.root_cause],['Action',r.action]];
    $('detailContent').innerHTML=fields.map(([label,value])=>`<div class="dialog-item ${['Deskripsi','Root Cause','Action'].includes(label)?'wide':''}"><span>${C.esc(label)}</span><strong>${C.esc(value||'—')}</strong></div>`).join('');
    $('eventDetail').showModal();
  }
  async function exportCsv(){
    const button=$('exportCsv'),label=button.textContent;button.disabled=true;button.textContent='Mengekspor...';
    try{const rows=await C.exportRows(readFilters());if(!rows.length){C.showToast('Tidak ada data untuk diekspor');return;}C.downloadCsv(rows);C.showToast(`${C.fmt(rows.length)} data berhasil diekspor`,'success');}
    catch(e){C.showToast(e.message||'Ekspor gagal','error');}
    finally{button.disabled=false;button.textContent=label;}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initial);else initial();
})();
