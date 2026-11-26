/* KOBE BJN | Gas Density v1.1 - upload notification UI | Source: approved October allocation logic. */
(function(root){
'use strict';
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const number=v=>v===null||v===undefined||v===''?null:(Number.isFinite(Number(v))?Number(v):null);
const sum=(a,k)=>a.reduce((s,r)=>s+(number(r[k])??0),0);
const fmt=(v,d=2)=>v===null||v===undefined||!Number.isFinite(v)?'—':v.toLocaleString('id-ID',{minimumFractionDigits:d,maximumFractionDigits:d});
const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const dateAdd=(d,n)=>{const t=new Date(d+'T12:00:00Z');t.setUTCDate(t.getUTCDate()+n);return t.toISOString().slice(0,10)};
const monthEnd=m=>dateAdd(dateAdd(m+'-01',32).slice(0,7)+'-01',-1);
const days=(a,b)=>Math.round((new Date(b+'T12:00:00Z')-new Date(a+'T12:00:00Z'))/86400000)+1;
const weekStart=d=>dateAdd(d,-new Date(d+'T12:00:00Z').getUTCDay());
const keyOf=(d,mode)=>mode==='daily'?d:mode==='weekly'?weekStart(d):d.slice(0,7);
const labelOf=(k,mode)=>mode==='weekly'?k+' s.d. '+dateAdd(k,6):k;
const minDate=(...a)=>a.filter(Boolean).sort()[0]||null;
const maxDate=(...a)=>a.filter(Boolean).sort().at(-1)||null;
const inRange=(r,a,b)=>r.tanggal>=a&&r.tanggal<=b;
const uniq=a=>[...new Set(a)];
const wcOrder=['BS205','BS202','BS203','BS207','BS204','BS208','BS209'];
const normalSheet=s=>['EXTRUDER','OVEN'].includes(String(s).trim().toUpperCase())?'EXTRUDER':String(s).trim().toUpperCase()==='SFG MAKARONI'?'SFG MAKARONI':null;
function normHeader(v){return String(v??'').trim().replace(/\s+/g,' ').toUpperCase()}
function strictNum(v){if(v===null||v===undefined||v==='')return null;if(typeof v==='number')return Number.isFinite(v)?v:null;const s=String(v).trim();if(!/^\d+(\.\d+)?$/.test(s))return null;return Number(s)}
function parseDate(v){
 if(v instanceof Date&&!isNaN(v))return v.toISOString().slice(0,10);
 if(typeof v==='number'&&v>0){const d=new Date(Math.floor(v-25569)*86400000);return d.toISOString().slice(0,10)}
 let s=String(v??'').trim(),m=s.match(/^(\d{4})-(\d\d)-(\d\d)(?:[T ].*)?$/);
 if(!m){const q=s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);if(q)m=[q[0],q[3],q[2].padStart(2,'0'),q[1].padStart(2,'0')]}
 if(!m)return null;const d=m[1]+'-'+m[2]+'-'+m[3];try{return new Date(d+'T00:00:00Z').toISOString().slice(0,10)===d?d:null}catch{return null}
}
function parseSfg(sheets,mapping,month,end){
 const start=month+'-01';if(!/^\d{4}-\d{2}$/.test(month)||!end||end<start||end>monthEnd(month)||end>today())throw Error('Pilih bulan dan tanggal cutoff yang valid.');
 const seenSheets=new Set(),seen=new Set(),out=[],skipped=[];
 const lookup=new Map(mapping.map(m=>[m.source_sheet+'|'+m.po_prefix,m.process_wc]));
 for(const {name,data} of sheets){const src=normalSheet(name);if(!src)continue;
  if(seenSheets.has(src))throw Error('Sheet '+src+' muncul dua kali (misalnya OVEN dan Extruder). Pilih satu saja.');seenSheets.add(src);
  const required=['START DATE (SCHED)','PLANT','ORDER','MATERIAL','MATERIAL DESCRIPTION','UNIT OF MEASURE','CONFIRMED YIELD QUANTITY'];
  let h=-1,cols=null;
  for(let i=0;i<Math.min(12,data.length);i++){const map=new Map(data[i].map((v,j)=>[normHeader(v),j]));if(required.every(k=>map.has(k))){h=i;cols=map;break}}
  if(h<0)throw Error('Sheet '+name+': header SAP tidak lengkap. Gunakan template.');
  for(let i=h+1;i<data.length;i++){
   const r=data[i]||[],get=k=>r[cols.get(k)],t=k=>String(get(k)??'').trim();
   if(r.every(v=>v===null||v===undefined||v===''))continue;
   const po=t('ORDER'),dt=t('START DATE (SCHED)'),material=t('MATERIAL'),desc=t('MATERIAL DESCRIPTION'),plant=t('PLANT'),batch=t('BATCH'),shift=t('SHIFT'),explicit=t('WORK CENTER').toUpperCase();
   if(!po&&!dt&&!material&&!desc&&!plant&&!batch&&!shift&&!explicit){skipped.push(name+' baris '+(i+1)+' (subtotal/kosong)');continue}
   const date=parseDate(get('START DATE (SCHED)')),kg=strictNum(get('CONFIRMED YIELD QUANTITY'));
   const err=msg=>{throw Error(name+' baris '+(i+1)+': '+msg)};
   if(!date||date<start||date>end)err('Tanggal di luar periode / tidak valid.');
   if(plant!=='1500'||!/^\d+$/.test(po)||!material||!desc)err('Plant 1500, Order, Material, dan Material description wajib.');
   if(t('UNIT OF MEASURE').toUpperCase()!=='KG'||kg===null||kg<0)err('Output Confirmed Yield Quantity wajib angka >= 0 dalam KG.');
   const automatic=lookup.get(src+'|'+po.slice(0,4)),wc=explicit||automatic;
   if(explicit&&automatic&&explicit!==automatic)err('Work Center '+explicit+' bertentangan dengan mapping PO '+automatic+'. Periksa sebelum upload.');
   if(!(src==='EXTRUDER'?['BS205','BS208']:['BS202','BS208']).includes(wc))err('Work Center belum diketahui. Isi kolom Work Center yang valid.');
   const id=[date,po,material,batch,shift].join('|');if(seen.has(id))err('Order/Material/Batch/Shift/tanggal duplikat.');seen.add(id);
   out.push({tanggal:date,source_sheet:src,plant,production_order:po,material,batch,shift,material_description:desc,output_kg:kg,process_wc:wc});
  }
 }
 if(!seenSheets.has('EXTRUDER')||!seenSheets.has('SFG MAKARONI'))throw Error('Kedua sheet Extruder/OVEN dan SFG MAKARONI wajib ada.');
 return {rows:out,skipped};
}
function gasValue(r,area){
 const b=number(r['gas_gd'+area+'_mmbtu']),v=number(r['gas_gd'+area+'_nm3']);
 return b!==null&&b>=0?b:v===0?0:null;
}
function gasStats(rows,start,end){
 let g67=0,g4=0,v67=0,v4=0,n67=0,n4=0,nv67=0,nv4=0,partial=0,discrepancy=0;
 const dates=new Set();
 for(const r of rows){if(!inRange(r,start,end))continue;const a=gasValue(r,'67'),b=gasValue(r,'4'),x=number(r.gas_gd67_nm3),y=number(r.gas_gd4_nm3),t=number(r.gas_mmbtu);
  if(dates.has(r.tanggal))throw Error('Tanggal Energy duplikat: '+r.tanggal);dates.add(r.tanggal);
  if(a!==null){g67+=a;n67++}if(b!==null){g4+=b;n4++}if(x!==null&&x>=0){v67+=x;nv67++}if(y!==null&&y>=0){v4+=y;nv4++}
  if(a===null||b===null||r.gas_mmbtu_partial===true||r.gas_mmbtu_partial==='true')partial++;
  if(t!==null&&a!==null&&b!==null&&Math.abs(t-a-b)>0.005)discrepancy++;
 }
 return {g67:n67?g67:null,g4:n4?g4:null,total:n67||n4?g67+g4:null,v67:nv67?v67:null,v4:nv4?v4:null,volume:nv67||nv4?v67+v4:null,days:dates.size,expected:days(start,end),partial,discrepancy,complete:dates.size===days(start,end)&&partial===0&&discrepancy===0};
}
function allocate({energy,fg,sfg,wcs,fgMap,start,end}){
 const gas=gasStats(energy,start,end),masters=new Map(wcs.map(x=>[x.work_center,x])),maps=new Map(fgMap.map(x=>[x.order_type+'|'+x.packing_wc,x]));
 const active=wcs.filter(x=>x.basis!=='INACTIVE'&&(x.prs67||x.prs4)).sort((a,b)=>wcOrder.indexOf(a.work_center)-wcOrder.indexOf(b.work_center));
 const totals=new Map(active.map(w=>[w.work_center,0])),detail=[],unmapped=[],provisional=[],excluded=[];
 for(const r of fg.filter(r=>inRange(r,start,end))){const map=maps.get(r.order_type+'|'+r.packing_wc),kg=number(r.tonase)*1000;
  if(map?.decision==='EXCLUDE'){excluded.push({...r,kg});continue}
  const wc=map?.process_wc,w=masters.get(wc);
  if(!map||map.decision!=='INCLUDE'||w?.basis!=='FG'||!totals.has(wc)){unmapped.push({...r,kg,reason:'Mapping FG belum disetujui'});continue}
  const item={tanggal:r.tanggal,work_center:wc,cost_center:w.cost_center,material:r.material,description:r.material_description,production_order:r.production_order,basis:'FG',kg};
  if(String(map.evidence||'').toLowerCase().includes('provisional'))provisional.push(item);
  detail.push(item);totals.set(wc,totals.get(wc)+kg);
 }
 for(const r of sfg.filter(r=>inRange(r,start,end))){const wc=r.process_wc,w=masters.get(wc),kg=number(r.output_kg);
  if(w?.basis!=='SFG'||!totals.has(wc)||kg===null){unmapped.push({...r,kg,reason:'Mapping SFG belum valid'});continue}
  detail.push({tanggal:r.tanggal,work_center:wc,cost_center:w.cost_center,material:r.material,description:r.material_description,production_order:r.production_order,basis:'SFG',kg});totals.set(wc,totals.get(wc)+kg);
 }
 const base67=active.filter(w=>w.prs67).reduce((s,w)=>s+totals.get(w.work_center),0),base4=active.filter(w=>w.prs4).reduce((s,w)=>s+totals.get(w.work_center),0);
 const rows=active.map(w=>{const kg=totals.get(w.work_center),a67=gas.g67!==null&&base67>0&&w.prs67?kg/base67*gas.g67:0,a4=gas.g4!==null&&base4>0&&w.prs4?kg/base4*gas.g4:0;
  return {...w,kg,a67,a4,allocated:a67+a4,density:kg>0&&gas.total!==null?(a67+a4)/kg:null};});
 const totalAllocated=sum(rows,'allocated'),totalKg=sum(rows,'kg'),remaining=gas.total===null?null:gas.total-totalAllocated;
 for(const r of rows)r.share=totalAllocated>0?r.allocated/totalAllocated*100:null;
 const byWC=new Map(rows.map(r=>[r.work_center,r]));for(const r of detail)r.allocated=r.kg*(byWC.get(r.work_center).density??0);
 return {start,end,gas,rows,totalAllocated,totalKg,remaining,base67,base4,detail,unmapped,provisional,excluded};
}
// Export pure functions for local regression tests.
if(typeof module==='object'&&module.exports){module.exports={parseSfg,gasStats,allocate,parseDate};return}
const S={db:null,master:null,fgMap:null,sfgMap:null,gas:null,allocation:null,upload:null,charts:{},seqGas:0,seqDensity:0,uploadSeq:0,saving:false};
const config={url:'https://bmnhtxalfsfaefacgtpm.supabase.co',key:'sb_publishable_VItBKenz-q2sYz7MsibODA_nYtLXv9Q'};
async function read(table,cols,filter={},order='tanggal'){
 const all=[];for(let offset=0;offset<100000;offset+=1000){let q=S.db.from(table).select(cols);for(const [k,v] of Object.entries(filter)){if(k.endsWith('_gte'))q=q.gte(k.slice(0,-4),v);else if(k.endsWith('_lte'))q=q.lte(k.slice(0,-4),v);else q=q.eq(k,v)}
  for(const k of order.split(','))q=q.order(k,{ascending:true});const {data,error}=await q.range(offset,offset+999);if(error)throw Error(table+': '+error.message);all.push(...(data||[]));if(!data||data.length<1000)return all;
 }throw Error('Data melebihi batas aman pembacaan. Persempit periode.');
}
async function mappings(){if(S.master&&S.fgMap&&S.sfgMap)return;[S.master,S.fgMap,S.sfgMap]=await Promise.all([read('gas_work_center','*',{},'work_center'),read('gas_fg_mapping','*',{},'order_type,packing_wc'),read('gas_sfg_mapping','*',{},'source_sheet,po_prefix')]);if(!S.master.length||!S.fgMap.length||!S.sfgMap.length)throw Error('Master mapping belum lengkap. Jalankan SQL setup.');}
const energyCols='tanggal,gas_gd67_mmbtu,gas_gd4_mmbtu,gas_mmbtu,gas_gd67_nm3,gas_gd4_nm3,gas_nm3,gas_mmbtu_partial';
const sfgIcons={info:'<path d="M12 11v5m0-8h.01"/><circle cx="12" cy="12" r="9"/>',ok:'<path d="m8 12 3 3 5-6"/><circle cx="12" cy="12" r="9"/>',warn:'<path d="M12 8v5m0 3h.01"/><path d="M10.3 4.8 3 18a1.4 1.4 0 0 0 1.2 2h15.6a1.4 1.4 0 0 0 1.2-2L13.7 4.8a2 2 0 0 0-3.4 0Z"/>',error:'<path d="m9 9 6 6m0-6-6 6"/><circle cx="12" cy="12" r="9"/>',loading:'<path d="M12 3a9 9 0 1 1-9 9"/>'};
function sfgIcon(type){return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${type==='loading'?'class="gd-spin"':''}>${sfgIcons[type]||sfgIcons.info}</svg>`}
const status=(id,msg,cls='')=>{const el=$(id);el.className='gd-status '+cls;if(id!=='gdSfgStatus'){el.textContent=msg;return}const type=cls||'info';const title={info:'Siapkan data SFG',ok:'Validasi berhasil',warn:'Perlu diperiksa',error:'Data belum dapat diproses',loading:'Sedang diproses'}[type]||'Informasi';el.innerHTML=`<span class="gd-status-icon">${sfgIcon(type)}</span><span class="gd-status-copy"><strong>${esc(/^Berhasil disimpan/.test(msg)?'Data SFG tersimpan':title)}</strong><small>${esc(msg)}</small></span>`;};
const dateLabel=d=>new Date(d+'T12:00:00Z').toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
const monthLabel=m=>new Date(m+'-01T12:00:00Z').toLocaleDateString('id-ID',{month:'long',year:'numeric',timeZone:'UTC'});
let toastTimer;
function hideSfgToast(){clearTimeout(toastTimer);$('gdSfgToast').hidden=true}
function sfgToast(type,title,message){const t=$('gdSfgToast');clearTimeout(toastTimer);t.className='gd-toast '+type;$('gdToastIcon').innerHTML=sfgIcon(type);$('gdToastTitle').textContent=title;$('gdToastMessage').textContent=message;t.hidden=false;if(type==='ok')toastTimer=setTimeout(hideSfgToast,6500)}
function confirmSfg(p){const dialog=$('gdSfgDialog');$('gdConfirmPeriod').textContent=monthLabel(p.month);$('gdConfirmEnd').textContent='1 - '+dateLabel(p.end);$('gdConfirmCount').textContent=fmt(p.rows.length,0)+' record';$('gdConfirmTotal').textContent=fmt(sum(p.rows,'output_kg')/1000,3)+' ton';$('gdConfirmFile').textContent=p.file;const previous=document.activeElement;return new Promise(resolve=>{function done(){resolve(dialog.returnValue==='replace');if(previous?.isConnected)previous.focus()}dialog.addEventListener('close',done,{once:true});dialog.returnValue='cancel';dialog.showModal();$('gdDialogCancel').focus()})}
function lockSfgUpload(lock){for(const id of ['gdSfgFile','gdSfgMonth','gdSfgEnd','gdSfgConfirm','gdSfgPreviewBtn'])$(id).disabled=lock;$('gdSfgSave').disabled=lock||!(S.upload&&$('gdSfgConfirm').checked);$('gdSfgSave').innerHTML=lock?`${sfgIcon('loading')}<span>Menyimpan...</span>`:'Replace Tonase SFG';}
function cards(id,items){$(id).innerHTML=items.map(([label,v,unit])=>`<article class="gd-kpi"><span>${esc(label)}</span><strong>${esc(v)}</strong><small>${esc(unit)}</small></article>`).join('')}
function clearChart(id){if(S.charts[id]){S.charts[id].destroy();delete S.charts[id]}}
function chart(id,labels,datasets,type='bar',opt={}){clearChart(id);if(!labels.length||typeof Chart==='undefined')return;S.charts[id]=new Chart($(id),{type,data:{labels,datasets},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'bottom',labels:{boxWidth:12,font:{size:11}}},tooltip:{mode:'index',intersect:false}},scales:{x:{ticks:{maxTicksLimit:14},grid:{display:false}},y:{beginAtZero:true,grid:{color:'#e8eef5'}}},...opt}})}
function gasGroups(rows,start,end,mode){const keyed=new Map();for(let d=start;d<=end;d=dateAdd(d,1)){const k=keyOf(d,mode);if(!keyed.has(k))keyed.set(k,{start:d,end:d,rows:[]});keyed.get(k).end=d}for(const r of rows){const g=keyed.get(keyOf(r.tanggal,mode));if(g)g.rows.push(r)}return [...keyed].map(([k,g])=>({key:k,...gasStats(g.rows,g.start,g.end),start:g.start,end:g.end}));}
async function loadGas(){const seq=++S.seqGas,from=$('gdGasFrom').value,to=$('gdGasTo').value;if(!from||!to||from>to||to>today()||days(from,to)>366){status('gdGasStatus','Rentang tanggal tidak valid (maksimal 366 hari, tidak boleh masa depan).','error');return}status('gdGasStatus','Membaca Energy existing...');$('gdGasRefresh').disabled=true;try{const rows=await read('energy_daily',energyCols,{tanggal_gte:from,tanggal_lte:to});if(seq!==S.seqGas)return;S.gas={rows,from,to};renderGas();}catch(e){if(seq!==S.seqGas)return;S.gas=null;cards('gdGasCards',[['Total Gas','—','MMBTU']]);$('gdGasRows').innerHTML='<tr><td colspan="5">Data gagal dimuat.</td></tr>';clearChart('gdGasChart');status('gdGasStatus',e.message,'error')}finally{if(seq===S.seqGas)$('gdGasRefresh').disabled=false}}
function renderGas(){if(!S.gas)return;const {rows,from,to}=S.gas,mode=$('gdGasMode').value,unit=$('gdGasUnit').value==='mmbtu'?'MMBTU':'Nm³',isE=unit==='MMBTU',g=gasStats(rows,from,to),groups=gasGroups(rows,from,to,mode),a=isE?'g67':'v67',b=isE?'g4':'v4',t=isE?'total':'volume';cards('gdGasCards',[['Total Gas',fmt(g[t]),unit],['PRS GD 6 & 7',fmt(g[a]),unit],['PRS GD 4',fmt(g[b]),unit],['Hari tercatat',g.days+' / '+g.expected,'Hari kalender']]);status('gdGasStatus',`Sumber: energy_daily · ${g.days}/${g.expected} hari · ${g.partial} hari MMBTU parsial · ${g.discrepancy} selisih total sumber`,g.complete?'ok':'warn');
 chart('gdGasChart',groups.map(x=>labelOf(x.key,mode)),[{label:'PRS GD 6 & 7 ('+unit+')',data:groups.map(x=>x[a]),backgroundColor:'#367ad5',borderRadius:4},{label:'PRS GD 4 ('+unit+')',data:groups.map(x=>x[b]),backgroundColor:'#16a297',borderRadius:4}]);$('gdGasRows').innerHTML=[...groups].reverse().map(x=>`<tr><td>${esc(labelOf(x.key,mode))}</td><td>${fmt(x[a])}</td><td>${fmt(x[b])}</td><td>${fmt(x[t])}</td><td>${x.days}/${x.expected}${x.partial?' · parsial':''}${x.discrepancy?' · selisih':''}</td></tr>`).join('');}
function resetDensity(){S.allocation=null;cards('gdDensityCards',[['Gas aktual','—','MMBTU'],['Output basis','—','Ton'],['Gas teralokasi','—','MMBTU'],['Gas belum teralokasi','—','MMBTU']]);$('gdDensityRows').innerHTML='<tr><td colspan="9">Data belum siap.</td></tr>';$('gdSkuRows').innerHTML='<tr><td colspan="6">Data belum siap.</td></tr>';$('gdMapRows').innerHTML='';$('gdCoverage').textContent='';$('gdDensityNote').textContent='';$('gdExport').disabled=true;clearChart('gdDensityChart');clearChart('gdBreakChart');}
async function loadDensity(){const seq=++S.seqDensity,month=$('gdMonth').value;if(!/^\d{4}-\d{2}$/.test(month)){status('gdDensityStatus','Pilih bulan.','warn');return}const start=month+'-01',requested=minDate(monthEnd(month),today());if(requested<start){status('gdDensityStatus','Bulan belum berjalan.','warn');return}status('gdDensityStatus','Membaca gas, detail FG, SFG, dan master mapping...');resetDensity();$('gdDensityRefresh').disabled=true;
 try{await mappings();const filters={tanggal_gte:start,tanggal_lte:requested};const [energy,fg,sfg,fi,si]=await Promise.all([read('energy_daily',energyCols,filters),read('tonase_fg_detail','*',filters,'tanggal,production_order'),read('tonase_sfg','*',filters,'tanggal,source_sheet,production_order,material,batch,shift'),read('gas_fg_imports','*',{month_start:start},'month_start'),read('gas_sfg_imports','*',{month_start:start},'month_start')]);if(seq!==S.seqDensity)return;
  const f=fi[0],s=si[0],lastGas=maxDate(...energy.map(r=>r.tanggal)),actual=gasStats(energy,start,requested);
  const actualTxt=fmt(actual.total)+' MMBTU · '+actual.days+'/'+actual.expected+' hari';
  $('gdCoverage').textContent=`Gas: ${lastGas||'belum ada'} | FG: ${f?f.coverage_start+' s.d. '+f.coverage_end:'belum ada detail'} | SFG: ${s?'s.d. '+s.coverage_end:'belum upload'}`;
  if(!lastGas||!f||!s?.scope_confirmed||f.coverage_start>start){cards('gdDensityCards',[['Gas aktual tercatat',fmt(actual.total),'MMBTU · '+actual.days+' hari'],['Output basis','—','Ton'],['Gas teralokasi','—','MMBTU'],['Gas belum teralokasi','—','Menunggu data basis']]);status('gdDensityStatus','Belum dapat menghitung: diperlukan Energy, detail FG sejak tanggal 1 dan SFG dengan scope terkonfirmasi. Upload FG existing dan file SFG terlebih dahulu.','warn');return}
  const end=minDate(requested,lastGas,f.coverage_end,s.coverage_end);if(!end||end<start)throw Error('Tidak ada periode bersama.');
  const a=allocate({energy,fg,sfg,wcs:S.master,fgMap:S.fgMap,start,end});const hasOutput=a.totalKg>0,hasBoth=a.gas.g67!==null&&a.gas.g4!==null;
  // No allocation is shown as final if data missing or mapping unresolved; no fake zero for missing meter.
  const unknown=a.unmapped.length,provisional=a.provisional.length,zeroBasis=(a.gas.g67>0&&a.base67===0)||(a.gas.g4>0&&a.base4===0),pending=end<requested||!a.gas.complete||unknown>0||provisional>0||zeroBasis||!hasOutput||!hasBoth;
  S.allocation={...a,actual,requested,pending,energy,fgCoverage:f,sfgCoverage:s};
  $('gdDensityNote').textContent=`Perhitungan basis bulanan/MTD: ${start} s.d. ${end}. Aktual hingga ${requested}: ${actualTxt}. ${end<requested?'Gas setelah cutoff belum masuk alokasi. ':''}Rasio alokasi dari Excel Oktober; bukan meter per line. ${unknown?'FG/SFG unmapped dikeluarkan sementara; alokasi lain bersifat simulasi. ':''}`;
  status('gdDensityStatus',`${pending?'PROVISIONAL':'Data periode tersedia (menunggu persetujuan Utility)'} · ${a.gas.days}/${a.gas.expected} hari gas · ${a.gas.partial} parsial · ${a.gas.discrepancy} selisih meter · ${unknown} unmapped · ${provisional} mapping usulan${zeroBasis?' · gas tanpa basis output':''}`,pending?'warn':'ok');renderDensity();
 }catch(e){if(seq===S.seqDensity){resetDensity();status('gdDensityStatus',e.message,'error')}}finally{if(seq===S.seqDensity)$('gdDensityRefresh').disabled=false}}
function renderDensity(){const a=S.allocation;if(!a)return;const gas=a.gas.total,unallocated=a.remaining===null?null:Math.max(0,a.remaining),outside=a.actual.total!==null&&gas!==null?Math.max(0,a.actual.total-gas):null;
 cards('gdDensityCards',[['Gas aktual periode basis',fmt(gas,3),'MMBTU · '+a.start+' / '+a.end],['Output basis alokasi',fmt(a.totalKg/1000,3),'Ton (FG/SFG)'],['Density total',fmt(a.totalKg>0&&gas!==null?a.totalAllocated/a.totalKg:null,6),'MMBTU/kg'],['Gas teralokasi',fmt(gas===null?null:a.totalAllocated,3),'MMBTU'],['Gas tanpa basis',fmt(unallocated,3),'MMBTU dalam periode basis'],['Gas di luar cutoff',fmt(outside,3),'MMBTU aktual tercatat']]);
 $('gdDensityRows').innerHTML=a.rows.map(r=>`<tr><td>${esc(r.cost_center)}</td><td>${esc(r.work_center)}</td><td>${esc(r.basis)}</td><td>${fmt(r.kg,3)}</td><td>${fmt(r.density,6)}</td><td>${fmt(gas===null?null:r.a67,3)}</td><td>${fmt(gas===null?null:r.a4,3)}</td><td>${fmt(gas===null?null:r.allocated,3)}</td><td>${fmt(r.share,1)}${r.share===null?'':'%'}</td></tr>`).join('')+`<tr class="gd-total"><td>TOTAL</td><td></td><td></td><td>${fmt(a.totalKg,3)}</td><td>${fmt(a.totalKg>0&&gas!==null?a.totalAllocated/a.totalKg:null,6)}</td><td>${fmt(gas===null?null:sum(a.rows,'a67'),3)}</td><td>${fmt(gas===null?null:sum(a.rows,'a4'),3)}</td><td>${fmt(gas===null?null:a.totalAllocated,3)}</td><td>${a.totalAllocated>0?'100,0%':'—'}</td></tr>`;
 chart('gdDensityChart',a.rows.map(r=>r.cost_center+' · '+r.work_center),[{label:'Alokasi PRS 6&7 (MMBTU)',data:a.rows.map(r=>gas===null?null:r.a67),backgroundColor:'#367ad5',borderRadius:4},{label:'Alokasi PRS 4 (MMBTU)',data:a.rows.map(r=>gas===null?null:r.a4),backgroundColor:'#16a297',borderRadius:4}],'bar',{scales:{x:{stacked:true,ticks:{maxRotation:0},grid:{display:false}},y:{stacked:true,beginAtZero:true}}});
 const sel=$('gdSkuWC'),prev=sel.value;sel.innerHTML='<option value="">Semua Work Center</option>'+a.rows.map(r=>`<option value="${esc(r.work_center)}">${esc(r.work_center)} · ${esc(r.cost_center)}</option>`).join('');if([...sel.options].some(o=>o.value===prev))sel.value=prev;renderSku();renderBreak();
 const review=[...a.unmapped.map(r=>({order:r.production_order,code:r.order_type+' / '+(r.packing_wc||r.process_wc),kg:r.kg,reason:r.reason})),...a.provisional.map(r=>({order:r.production_order,code:r.work_center,kg:r.kg,reason:'Mapping berdasarkan kelompok line (usulan)'}))];
 $('gdMapRows').innerHTML=review.length?review.map(r=>`<tr><td>${esc(r.order)}</td><td>${esc(r.code)}</td><td>${fmt(r.kg,3)}</td><td>${esc(r.reason)}</td></tr>`).join(''):'<tr><td colspan="4">Tidak ada mapping review pada periode ini.</td></tr>';
 $('gdMapSummary').textContent=`Mapping review (${review.length}) · FG GD6 dikecualikan: ${fmt(sum(a.excluded,'kg')/1000,3)} ton`;
 $('gdExport').disabled=gas===null||!a.detail.length;
}
function skuRows(a){const map=new Map();for(const r of a.detail){const k=[r.work_center,r.material,r.basis].join('|');if(!map.has(k))map.set(k,{work_center:r.work_center,cost_center:r.cost_center,material:r.material,description:r.description,basis:r.basis,kg:0,allocated:0});const x=map.get(k);x.kg+=r.kg;x.allocated+=r.allocated}return [...map.values()].sort((x,y)=>y.allocated-x.allocated)}
function renderSku(){const a=S.allocation;if(!a)return;const wc=$('gdSkuWC').value,q=$('gdSkuSearch').value.trim().toLowerCase();const rows=skuRows(a).filter(r=>(!wc||r.work_center===wc)&&(!q||(r.material+' '+r.description).toLowerCase().includes(q)));$('gdSkuRows').innerHTML=rows.length?rows.map(r=>`<tr><td>${esc(r.cost_center)} / ${esc(r.work_center)}</td><td>${esc(r.material)}<small>${esc(r.description)}</small></td><td>${esc(r.basis)}</td><td>${fmt(r.kg,3)}</td><td>${fmt(r.kg>0&&a.gas.total!==null?r.allocated/r.kg:null,6)}</td><td>${fmt(a.gas.total===null?null:r.allocated,3)}</td></tr>`).join(''):'<tr><td colspan="6">Tidak ada SKU sesuai filter.</td></tr>'}
function renderBreak(){const a=S.allocation;if(!a)return;const mode=$('gdBreakMode').value,groups=gasGroups(a.energy,a.start,a.end,mode),by=new Map();for(const r of a.detail){const k=keyOf(r.tanggal,mode);by.set(k,(by.get(k)||0)+r.allocated)}chart('gdBreakChart',groups.map(x=>labelOf(x.key,mode)),[{label:'Gas aktual (MMBTU)',data:groups.map(x=>x.total),backgroundColor:'#367ad5',borderRadius:3},{label:'Alokasi (rasio bulan/MTD)',data:groups.map(x=>a.gas.total===null?null:by.get(x.key)||0),backgroundColor:'#16a297',borderRadius:3}]);}
function exportDensity(){const a=S.allocation;if(!a||!root.XLSX)return;const book=XLSX.utils.book_new(),append=(name,rows)=>XLSX.utils.book_append_sheet(book,XLSX.utils.json_to_sheet(rows),name);append('Rekap CC',a.rows.map(r=>({'Cost Center':r.cost_center,'Work Center':r.work_center,'Basis':r.basis,'Output (kg)':r.kg,'Density (MMBTU/kg)':r.density,'PRS GD6&7 (MMBTU)':r.a67,'PRS GD4 (MMBTU)':r.a4,'Alokasi (MMBTU)':r.allocated,'% Alokasi':r.share})));append('SKU',skuRows(a));append('Review Mapping',[...a.unmapped,...a.provisional]);append('Rekonsiliasi',[{Periode:a.start+' s.d. '+a.end,Status:a.pending?'PROVISIONAL':'Menunggu persetujuan Utility','Gas aktual basis':a.gas.total,'Alokasi':a.totalAllocated,'Selisih':a.remaining,'Gas aktual periode terpilih':a.actual.total,'Gas partial days':a.gas.partial,'Gas days':a.gas.days,'Expected days':a.gas.expected,'Unmapped rows':a.unmapped.length,'Provisional map rows':a.provisional.length,Metode:'Excel Oktober; alokasi bukan meter aktual WC'}]);XLSX.writeFile(book,'Gas_Density_'+a.start.slice(0,7)+'_sd_'+a.end+'.xlsx')}
function clearUpload(){hideSfgToast();S.upload=null;++S.uploadSeq;$('gdSfgSave').disabled=true;$('gdSfgPreview').innerHTML='';$('gdSfgConfirm').checked=false;status('gdSfgStatus','Pilih file dan periode, kemudian validasi.');}
async function previewSfg(){clearUpload();const seq=S.uploadSeq,file=$('gdSfgFile').files[0],month=$('gdSfgMonth').value,end=$('gdSfgEnd').value;if(!file){status('gdSfgStatus','Pilih file Excel terlebih dahulu.','warn');return}if(!root.XLSX){status('gdSfgStatus','Library Excel belum tersedia.','error');return}status('gdSfgStatus','Memeriksa format, periode, satuan KG dan mapping Work Center...','loading');$('gdSfgPreviewBtn').disabled=true;try{await mappings();const wb=XLSX.read(await file.arrayBuffer(),{type:'array',cellDates:false});const sheets=wb.SheetNames.map(name=>({name,data:XLSX.utils.sheet_to_json(wb.Sheets[name],{header:1,raw:true,defval:null})}));const result=parseSfg(sheets,S.sfgMap,month,end);if(seq!==S.uploadSeq)return;const group=new Map();for(const r of result.rows){const k=r.source_sheet+' · '+r.process_wc;if(!group.has(k))group.set(k,{rows:0,kg:0});const x=group.get(k);x.rows++;x.kg+=r.output_kg}
 S.upload={...result,file:file.name,month,end};$('gdSfgPreview').innerHTML=`<div class="gd-preview"><strong>Preview SFG · ${esc(month)} · s.d. ${esc(end)}</strong><div class="gd-table"><table><thead><tr><th>Sheet / Work Center</th><th>Record</th><th>Output (kg)</th></tr></thead><tbody>${[...group].map(([k,x])=>`<tr><td>${esc(k)}</td><td>${x.rows}</td><td>${fmt(x.kg,3)}</td></tr>`).join('')}<tr class="gd-total"><td>TOTAL</td><td>${result.rows.length}</td><td>${fmt(sum(result.rows,'output_kg'),3)}</td></tr></tbody></table></div><small>${result.skipped.length} subtotal/kosong dilewati. Sheet FG diabaikan. ${!result.rows.some(r=>r.process_wc==='BS208')?'Tidak ada record BS208 (GD4); pastikan benar-benar tidak produksi atau lengkapi tarikan.':''}</small></div>`;status('gdSfgStatus',`Validasi format berhasil · ${result.rows.length} record. Cek cakupan GD4 dan GD6 sebelum Replace.`,result.rows.some(r=>r.process_wc==='BS208')?'ok':'warn');
 }catch(e){if(seq===S.uploadSeq)status('gdSfgStatus',e.message,'error')}finally{$('gdSfgPreviewBtn').disabled=false}}
async function saveSfg(){
 const p=S.upload;if(S.saving||!p||!$('gdSfgConfirm').checked)return;
 S.saving=true;
 try{if(!await confirmSfg(p)||S.upload!==p||!$('gdSfgConfirm').checked)return;
 lockSfgUpload(true);hideSfgToast();status('gdSfgStatus','Menyimpan '+fmt(p.rows.length,0)+' record ke database. Jangan tutup halaman.','loading');
 let data;
 try{const result=await S.db.rpc('gas_replace_sfg',{p_month:p.month+'-01',p_end:p.end,p_rows:p.rows,p_file:p.file,p_scope_confirmed:true});if(result.error)throw Error(result.error.message);data=result.data}
 catch(e){status('gdSfgStatus','Penyimpanan belum terkonfirmasi: '+e.message,'error');sfgToast('error','Penyimpanan belum terkonfirmasi','Periksa koneksi dan status data sebelum mencoba kembali.');return}
 S.upload=null;$('gdSfgConfirm').checked=false;
 const count=data?.sfg_rows??p.rows.length;status('gdSfgStatus',`Berhasil disimpan · ${fmt(Number(count),0)} record · ${monthLabel(p.month)} · s.d. ${dateLabel(p.end)}.`,'ok');
 sfgToast('ok','Tonase SFG berhasil diperbarui',`${monthLabel(p.month)} · ${fmt(Number(count),0)} record tersimpan. Lihat rekap Gas Density setelah refresh.`);
 $('gdMonth').value=p.month;await loadDensity();
 }finally{S.saving=false;lockSfgUpload(false)}
}
function init(){if(!root.supabase||!$('gdNav'))return;S.db=supabase.createClient(config.url,config.key);const t=today(),m=t.slice(0,7);$('gdGasFrom').value=m+'-01';$('gdGasTo').value=t;$('gdMonth').value=m;$('gdSfgMonth').value=m;$('gdSfgEnd').value=t;
 document.querySelectorAll('#gdNav button').forEach(b=>b.addEventListener('click',()=>{const tab=b.dataset.tab;document.querySelectorAll('#gdNav button').forEach(x=>{x.classList.toggle('active',x===b);x.setAttribute('aria-selected',String(x===b))});for(const k of ['electric','gas','density'])$('gdPanel-'+k).hidden=k!==tab;if(tab==='gas')loadGas();else if(tab==='density')loadDensity();else requestAnimationFrame(()=>root.UtilityDMC?.renderAll?.())}));
 $('gdGasRefresh').addEventListener('click',loadGas);$('gdGasMode').addEventListener('change',renderGas);$('gdGasUnit').addEventListener('change',renderGas);$('gdDensityRefresh').addEventListener('click',loadDensity);$('gdMonth').addEventListener('change',loadDensity);$('gdSkuWC').addEventListener('change',renderSku);$('gdSkuSearch').addEventListener('input',renderSku);$('gdBreakMode').addEventListener('change',renderBreak);$('gdExport').addEventListener('click',exportDensity);
 $('gdSfgFile').addEventListener('change',clearUpload);$('gdSfgMonth').addEventListener('change',()=>{const m=$('gdSfgMonth').value;if(m)$('gdSfgEnd').value=minDate(monthEnd(m),today());clearUpload()});$('gdSfgEnd').addEventListener('change',clearUpload);$('gdSfgPreviewBtn').addEventListener('click',previewSfg);$('gdSfgConfirm').addEventListener('change',()=>{$('gdSfgSave').disabled=!(S.upload&&$('gdSfgConfirm').checked)});$('gdSfgSave').addEventListener('click',saveSfg);$('gdToastClose').addEventListener('click',hideSfgToast);status('gdSfgStatus','Pilih file Excel dan periode, kemudian klik Validasi & Preview.');
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})(typeof window!=='undefined'?window:globalThis);
