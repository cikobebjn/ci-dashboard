/* FTQ Monitoring — SAP MTD -> perhitungan sama dengan Pivot Resume
   Rumus: (SUM(Total GR) - SUM(Total Reject)) / SUM(Total GR) * 100
   Filter Pivot: Order Type B101, B401, B701 dikecualikan.
   Mode produksi: Supabase + RLS admin; preview offline: data Excel terlampir.
*/
(() => {
  'use strict';
  const cfg = window.FTQ_CONFIG || {};
  const excluded = new Set(cfg.excludedOrderTypes || ['B101','B401','B701']);
  const hasCloudConfig = Boolean(cfg.supabaseUrl && cfg.supabaseAnonKey);
  const db = hasCloudConfig && window.supabase ? window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey) : null;
  const demoKey = 'ftq_demo_snapshots_v1';
  const demoNotesKey = 'ftq_demo_actions_v1';
  const targetKey = 'ftq_dashboard_target_v1';
  const $ = (id) => document.getElementById(id);
  const state = {
    month: '', target: Number(cfg.targetFtqPercent ?? 99),
    dailyAll: [], monthRows: [], materials: [], notes: {},
    importedRows: null, importingFile: '', noteDate: '', admin: false,
    user: null, chartDaily: null, chartMonthly: null, loading: false
  };
  const fmtNumber = (n, places=2) => new Intl.NumberFormat('id-ID',{maximumFractionDigits:places}).format(Number(n || 0));
  const fmtPct = (n) => (n === null || n === undefined || !Number.isFinite(Number(n))) ? '—' : new Intl.NumberFormat('id-ID',{minimumFractionDigits:2, maximumFractionDigits:2}).format(Number(n))+'%';
  const fmtCompact = (n) => { const x=Number(n||0);return Math.abs(x)>=1e9?fmtNumber(x/1e9,2)+' M':Math.abs(x)>=1e6?fmtNumber(x/1e6,2)+' jt':Math.abs(x)>=1e3?fmtNumber(x/1e3,1)+' rb':fmtNumber(x); };
  const firstOfMonth = (month) => month+'-01';
  const monthNext = (month, add=1) => { const [y,m]=month.split('-').map(Number);const d=new Date(y,m-1+add,1);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`; };
  const isoLocal = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  const currentMonth = () => isoLocal(new Date()).slice(0,7);
  const cutoffIso = () => { const d=new Date();d.setFullYear(d.getFullYear()-1);return isoLocal(d); };
  const dateLabel = (v) => {if(!v)return ''; const [y,m,d]=v.slice(0,10).split('-').map(Number);return new Intl.DateTimeFormat('id-ID',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(y,m-1,d));};
  const monthLabel = (m) => {const [y,mo]=m.split('-').map(Number);return new Intl.DateTimeFormat('id-ID',{month:'long',year:'numeric'}).format(new Date(y,mo-1,1));};
  const escapeHtml = (v) => String(v ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safeGet = (key, fallback) => {try{const v=localStorage.getItem(key);return v?JSON.parse(v):fallback;}catch{return fallback;}};
  const safeSet = (key, value) => {try{localStorage.setItem(key,JSON.stringify(value));return true;}catch{return false;}};
  const notify = (message, isError=false) => {const e=document.createElement('div');e.className='toast'+(isError?' error':'');e.textContent=message;$('toast').append(e);setTimeout(()=>e.remove(),4800);};
  const showError = (message) => {$('errorNotice').textContent=message;$('errorNotice').hidden=false;};
  const clearError = () => {$('errorNotice').hidden=true;};
  const showDialog = (id) => {const dlg=$(id);if(typeof dlg.showModal==='function')dlg.showModal();else notify('Peramban tidak mendukung dialog. Gunakan Chrome terbaru.',true);};
  const isEditable = () => !hasCloudConfig || (db && state.admin);
  const isValidMonth = (month) => /^\d{4}-\d{2}$/.test(month) && month >= $('monthPicker').min && month <= $('monthPicker').max;

  function sumDailyFromSAP(rows) {
    const grouped = new Map();
    for(const r of rows) {
      if(excluded.has(r.order_type))continue;
      const k=r.prod_date;
      if(!grouped.has(k))grouped.set(k,{prod_date:k,month_key:k.slice(0,7)+'-01',doc_count:0,total_gr:0,total_reject:0,total_qi_24h:0,last_imported_at:null});
      const v=grouped.get(k);
      v.doc_count++;v.total_gr+=Number(r.total_gr||0);v.total_reject+=Number(r.total_reject||0);v.total_qi_24h+=Number(r.total_qi_24h||0);
    }
    return Array.from(grouped.values()).map(v=>({...v,ftq_pct:v.total_gr===0?null:(v.total_gr-v.total_reject)*100/v.total_gr})).sort((a,b)=>a.prod_date.localeCompare(b.prod_date));
  }
  function aggregateMaterial(rows) {
    const dict=new Map();
    for(const r of rows) {
      if(excluded.has(r.order_type))continue;
      const key=r.material+'|'+r.material_description;
      if(!dict.has(key))dict.set(key,{material:r.material,material_description:r.material_description,material_group_desc:r.material_group_desc||'',total_gr:0,total_reject:0});
      const v=dict.get(key);v.total_gr+=Number(r.total_gr||0);v.total_reject+=Number(r.total_reject||0);
    }
    return Array.from(dict.values()).sort((a,b)=>b.total_reject-a.total_reject);
  }
  function getDemoSnapshots(){
    const fromStorage=safeGet(demoKey,{});
    const cutoff=cutoffIso();
    for(const month of Object.keys(fromStorage)){
      fromStorage[month]=fromStorage[month].filter(r=>r.prod_date>=cutoff);
      if(!fromStorage[month].length)delete fromStorage[month];
    }
    safeSet(demoKey,fromStorage);
    return fromStorage;
  }
  async function refreshAdmin() {
    if(!db){
      $('authBtn').textContent='Mode Demo';
      $('connectionStatus').textContent=hasCloudConfig?'Library Supabase belum termuat':'Pratinjau lokal';
      $('connectionStatus').className='status-pill demo';
      $('demoNotice').hidden=false;return;
    }
    $('demoNotice').hidden=true;
    const {data:{session},error}=await db.auth.getSession();
    if(error)notify('Gagal membaca sesi login: '+error.message,true);
    state.user=session?.user||null;state.admin=false;
    if(state.user){const {data, error:roleError}=await db.rpc('ftq_is_admin');state.admin=!roleError&&data===true;}
    $('authBtn').textContent=state.user?(state.admin?'Keluar Admin':'Keluar Akun'):'Login Admin';
    $('authBtn').title=state.user?.email||'';
    $('connectionStatus').textContent=state.admin?'Online · Admin':'Online · Monitoring';
    $('connectionStatus').className='status-pill online';
  }
  async function loadData(){
    if(state.loading)return;
    state.loading=true;clearError();$('dataInfo').textContent='Memuat data '+monthLabel(state.month)+'...';
    try{
      if(hasCloudConfig && !db)throw Error('Pustaka Supabase tidak tersedia. Periksa koneksi internet/CDN.');
      if(db){
        const begin=cutoffIso(),end=monthNext(state.month)+'-01';
        const [d,m,n]=await Promise.all([
          db.from('ftq_daily_resume').select('*').gte('prod_date',begin).order('prod_date',{ascending:true}).limit(450),
          db.from('ftq_reject_material_monthly').select('month_key,material,material_description,material_group_desc,total_gr,total_reject').eq('month_key',firstOfMonth(state.month)).order('total_reject',{ascending:false}).limit(20),
          db.from('ftq_action_notes').select('*').gte('prod_date',firstOfMonth(state.month)).lt('prod_date',end).limit(50)
        ]);
        for(const res of [d,m,n])if(res.error)throw res.error;
        state.dailyAll=(d.data||[]).map(x=>({...x,total_gr:Number(x.total_gr),total_reject:Number(x.total_reject),total_qi_24h:Number(x.total_qi_24h),ftq_pct:x.ftq_pct===null?null:Number(x.ftq_pct)}));
        state.materials=(m.data||[]).map(x=>({...x,total_gr:Number(x.total_gr),total_reject:Number(x.total_reject)}));
        state.notes=Object.fromEntries((n.data||[]).map(x=>[x.prod_date,x]));
      }else{
        const all=getDemoSnapshots();
        const daily=sumDailyFromSAP(Object.values(all).flat());
        if(!Object.hasOwn(all,'2026-11')){
          const seed=(window.FTQ_DEMO_DAILY||[]).filter(x=>x.prod_date>=cutoffIso());
          daily.push(...seed);
        }
        state.dailyAll=daily.sort((a,b)=>a.prod_date.localeCompare(b.prod_date));
        state.materials=Object.hasOwn(all,state.month)?aggregateMaterial(all[state.month]):(state.month==='2026-11'?(window.FTQ_DEMO_MATERIAL||[]):[]);
        const notes=safeGet(demoNotesKey,{});state.notes=Object.fromEntries(Object.entries(notes).filter(([k])=>k.startsWith(state.month)));
      }
      state.monthRows=state.dailyAll.filter(x=>x.prod_date.startsWith(state.month));
      render();
    }catch(err){showError('Gagal mengambil data: '+(err.message||String(err)));notify('Gagal memuat data FTQ',true);}
    finally{state.loading=false;}
  }
  function monthlyAggregates(){
    const map=new Map();
    for(const r of state.dailyAll){const m=r.prod_date.slice(0,7);if(!map.has(m))map.set(m,{gr:0,rej:0});const x=map.get(m);x.gr+=r.total_gr;x.rej+=r.total_reject;}
    return map;
  }
  function renderKpis(){
    const gr=state.monthRows.reduce((s,r)=>s+r.total_gr,0),rej=state.monthRows.reduce((s,r)=>s+r.total_reject,0);
    const pct=gr?(gr-rej)*100/gr:null;
    const below=state.monthRows.filter(r=>r.ftq_pct!==null&&r.ftq_pct<state.target).length;
    const isCurrent=state.month===currentMonth();
    $('ftqMetricLabel').textContent=isCurrent?'FTQ MTD':'FTQ BULANAN';
    $('kpiFtq').textContent=fmtPct(pct);
    $('kpiFtqCompare').textContent=pct===null?'Belum ada data':pct<state.target?'Di bawah target '+fmtPct(state.target):'Mencapai target '+fmtPct(state.target);
    $('kpiGr').textContent=fmtCompact(gr);$('kpiGr').title=fmtNumber(gr,4);
    $('kpiReject').textContent=fmtCompact(rej);$('kpiReject').title=fmtNumber(rej,4);
    $('kpiRejectRate').textContent=gr?'Reject Rate '+fmtPct(rej*100/gr):'Reject terhadap Total GR';
    $('kpiBelow').textContent=String(below);$('kpiDaysInfo').textContent='Dari '+state.monthRows.length+' hari dengan data';
    $('kpiBelow').closest('.kpi-card').classList.toggle('metric-alert',below>0);
  }
  function renderMaterial(){
    const list=state.materials.filter(x=>x.total_reject>0).slice(0,5);
    if(!list.length){$('materialBars').innerHTML='<p class="empty">Belum ada reject material pada bulan ini.</p>';return;}
    const biggest=list[0].total_reject||1;
    $('materialBars').innerHTML=list.map((m,i)=>`<div class="material-item" title="${escapeHtml(m.material_description)}"><div class="material-rank">#${i+1} · ${escapeHtml(m.material)}</div><div class="material-name">${escapeHtml(m.material_description||'Tanpa deskripsi')}</div><div class="material-number">${fmtNumber(m.total_reject)}</div><div class="material-track"><div class="material-fill" style="width:${Math.max(2,100*m.total_reject/biggest)}%"></div></div></div>`).join('');
  }
  function renderTable(){
    const search=$('searchInput').value.trim().toLowerCase();
    const entries=[...state.monthRows].sort((a,b)=>b.prod_date.localeCompare(a.prod_date)).filter(r=>{
      if(!search)return true;const n=state.notes[r.prod_date]||{};
      return [r.prod_date,dateLabel(r.prod_date),n.issue,n.root_cause,n.corrective_action,n.preventive_action].some(v=>String(v||'').toLowerCase().includes(search));
    });
    $('tableCount').textContent=entries.length+' hari';
    if(!entries.length){$('resumeBody').innerHTML='<tr><td colspan="9" class="loading-row">'+(search?'Tidak ada hasil pencarian.':'Belum ada data SAP pada periode ini.')+'</td></tr>';return;}
    const noteCell=(v,date)=>`<td class="note-col" data-date="${date}" title="Klik untuk mengisi atau mengubah catatan">${v?`<div class="note-text" title="${escapeHtml(v)}">${escapeHtml(v)}</div>`:'<span class="note-placeholder">Belum diisi</span>'}</td>`;
    $('resumeBody').innerHTML=entries.map(r=>{
      const notes=state.notes[r.prod_date]||{};
      const low=r.ftq_pct!==null&&r.ftq_pct<state.target;
      const rateClass=r.ftq_pct===null?'':(low?'low':'high');
      return `<tr><td class="date-cell">${dateLabel(r.prod_date)}</td><td class="align-right">${fmtNumber(r.total_gr,3)}</td><td class="align-right">${fmtNumber(r.total_reject,3)}</td><td class="align-right"><span class="metric-pill ${rateClass}">${fmtPct(r.ftq_pct)}</span></td>${noteCell(notes.issue,r.prod_date)}${noteCell(notes.root_cause,r.prod_date)}${noteCell(notes.corrective_action,r.prod_date)}${noteCell(notes.preventive_action,r.prod_date)}<td class="align-center"><button type="button" class="btn-edit" data-date="${r.prod_date}">${['issue','root_cause','corrective_action','preventive_action'].some(k=>String(notes[k]||'').trim())?'Lihat / Edit':'Isi Catatan'}</button></td></tr>`;
    }).join('');
    $('resumeBody').querySelectorAll('[data-date]').forEach(el=>el.addEventListener('click',()=>openNotes(el.dataset.date)));
  }
  // Fallback grafik native HTML Canvas: tetap berfungsi jika Chart.js/CDN tidak tersedia.
  function nativeChart(canvas, spec) {
    const dpr=window.devicePixelRatio||1, width=Math.max(300,canvas.parentElement.clientWidth-34), height=Math.max(190,canvas.parentElement.clientHeight-38);
    canvas.width=width*dpr;canvas.height=height*dpr;
    const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,width,height);
    const left=37,top=25,right=12,bottom=32,pw=width-left-right,ph=height-top-bottom;
    const min=spec.options.scales.y.min ?? 0,max=spec.options.scales.y.max ?? 100;
    const yPos=(v)=>top+(max-v)/(max-min)*ph;
    ctx.font='10px Segoe UI, Arial';ctx.textAlign='right';ctx.textBaseline='middle';
    for(let i=0;i<=4;i++){
      const v=min+(max-min)*i/4,y=yPos(v);
      ctx.strokeStyle='#eaf0f7';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(left,y);ctx.lineTo(left+pw,y);ctx.stroke();
      ctx.fillStyle='#94a2b7';ctx.fillText(fmtNumber(v,0)+'%',left-8,y);
    }
    const labels=spec.data.labels;const values=spec.data.datasets[0].data;
    const n=labels.length;ctx.textAlign='center';ctx.textBaseline='top';
    for(let i=0;i<n;i++){
      if(n>14&&i%2!==0)continue;
      const x=spec.type==='bar'?left+(i+.5)*pw/n:left+(n>1?i*pw/(n-1):pw/2);
      ctx.fillStyle='#9aa8ba';ctx.fillText(labels[i],x,top+ph+9);
    }
    if(spec.type==='bar'){
      for(let i=0;i<n;i++){
        const v=values[i];if(v===null||!Number.isFinite(v))continue;
        const x=left+(i+.5)*pw/n;
        const barWidth=Math.min(37,Math.max(12,pw/n*.57));
        ctx.fillStyle=spec.data.datasets[0].backgroundColor?.[i]||'#5c8dd8';
        const y=yPos(v);
        ctx.fillRect(x-barWidth/2,y,barWidth,Math.max(0,top+ph-y));
        ctx.textAlign='center';ctx.fillStyle='#315380';ctx.font='bold 9px Segoe UI, Arial';
        ctx.fillText(fmtNumber(v,1)+'%',x,Math.max(0,y-14));
      }
    }else{
      const coords=values.map((v,i)=>v===null||!Number.isFinite(v)?null:{x:left+(n>1?i*pw/(n-1):pw/2),y:yPos(v),v});
      const target=spec.data.datasets[1]?.data?.[0];
      if(Number.isFinite(target)){
        ctx.setLineDash([5,5]);ctx.strokeStyle='#b3bfd0';ctx.lineWidth=1.5;
        ctx.beginPath();ctx.moveTo(left,yPos(target));ctx.lineTo(left+pw,yPos(target));ctx.stroke();ctx.setLineDash([]);
      }
      ctx.strokeStyle='#2d66c7';ctx.lineWidth=2.5;ctx.beginPath();let active=false;
      for(const p of coords){if(!p){active=false;continue;}if(!active){ctx.moveTo(p.x,p.y);active=true;}else ctx.lineTo(p.x,p.y);}
      ctx.stroke();
      coords.forEach((p)=>{if(!p)return;ctx.beginPath();ctx.fillStyle=p.v<state.target?'#d3415b':'#2f70d7';ctx.arc(p.x,p.y,4.1,0,Math.PI*2);ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=1.5;ctx.stroke();
        if(n<=16){ctx.font='bold 9px Segoe UI, Arial';ctx.textAlign='center';ctx.textBaseline='bottom';ctx.fillStyle='#4b6589';ctx.fillText(fmtNumber(p.v,1)+'%',p.x,Math.max(8,p.y-8));}
      });
    }
  }
  function buildChart(chartKey, canvasId, fallbackId, config){
    if(typeof window.Chart!=='function'){
      if(state[chartKey]){state[chartKey].destroy();state[chartKey]=null;}
      $(canvasId).hidden=false;$(fallbackId).hidden=true;
      nativeChart($(canvasId),config);return;
    }
    if(state[chartKey])state[chartKey].destroy();
    state[chartKey]=new window.Chart($(canvasId).getContext('2d'),config);
  }
  function baseChartOptions(){return{responsive:true,maintainAspectRatio:false,animation:{duration:450},plugins:{legend:{display:false},tooltip:{backgroundColor:'#1b3359',padding:12,titleFont:{size:11,weight:'bold'},bodyFont:{size:11},callbacks:{label:(ctx)=>ctx.raw===null?'Tidak ada data':fmtPct(ctx.raw)}}},scales:{x:{grid:{display:false},ticks:{color:'#98a4b5',font:{size:10},maxRotation:0,autoSkip:true,maxTicksLimit:13}},y:{grid:{color:'#edf1f6'},border:{display:false},ticks:{color:'#9ba7b8',font:{size:10},callback:(v)=>v+'%'}}}};}
  function renderCharts(){
    $('trendPeriod').textContent=monthLabel(state.month);
    const daily=[...state.monthRows].sort((a,b)=>a.prod_date.localeCompare(b.prod_date));
    const dailyVals=daily.map(r=>r.ftq_pct);
    const min=Math.max(0,Math.floor(Math.min(state.target,...dailyVals.filter(Number.isFinite),100)-3));
    const dailyOpt=baseChartOptions();dailyOpt.scales.y.min=min;dailyOpt.scales.y.max=101;
    buildChart('chartDaily','dailyChart','dailyFallback',{type:'line',data:{labels:daily.map(r=>r.prod_date.slice(-2)),datasets:[{label:'FTQ',data:dailyVals,fill:true,borderColor:'#2f63c8',backgroundColor:'rgba(55,115,220,.095)',pointRadius:3.6,pointHoverRadius:6,tension:.32,borderWidth:2.5,spanGaps:false},{label:'Target FTQ',data:daily.map(()=>state.target),borderColor:'#b6c1d2',borderDash:[6,5],pointRadius:0,fill:false,borderWidth:1.5}]},options:dailyOpt});
    const monthlyMap=monthlyAggregates();const months=[];for(let i=11;i>=0;i--)months.push(monthNext(currentMonth(),-i));
    const mv=months.map(m=>{const x=monthlyMap.get(m);return x&&x.gr?(x.gr-x.rej)*100/x.gr:null;});
    const monthlyOpt=baseChartOptions();monthlyOpt.scales.y.min=Math.max(0,Math.floor(Math.min(state.target,...mv.filter(Number.isFinite),100)-3));monthlyOpt.scales.y.max=101;monthlyOpt.scales.x.ticks.maxTicksLimit=12;
    buildChart('chartMonthly','monthlyChart','monthlyFallback',{type:'bar',data:{labels:months.map(m=>new Intl.DateTimeFormat('id-ID',{month:'short'}).format(new Date(m+'-01T12:00:00'))),datasets:[{label:'FTQ Bulanan',data:mv,backgroundColor:months.map(m=>m===state.month?'#2863ce':'#a8c6ec'),hoverBackgroundColor:'#2555ac',borderRadius:4,barPercentage:.7,maxBarThickness:34}]},options:monthlyOpt});
  }
  function render(){
    renderKpis();renderMaterial();renderTable();renderCharts();
    const stamps=state.monthRows.map(x=>x.last_imported_at).filter(Boolean).sort();
    if(db){
      $('dataInfo').textContent=state.monthRows.length+' hari tercatat · '+(stamps.length?'Sinkron terakhir '+new Date(stamps.at(-1)).toLocaleString('id-ID'):'Belum ada upload bulan ini');
      $('lastUpdated').textContent=stamps.length?'Update: '+new Date(stamps.at(-1)).toLocaleString('id-ID'):'Belum ada import';
    }else{$('dataInfo').textContent=state.monthRows.length+' hari tercatat · Pratinjau Excel November 2026';$('lastUpdated').textContent='Mode demo · data belum tersimpan di server';}
    $('prevMonthBtn').disabled=!isValidMonth(monthNext(state.month,-1));$('nextMonthBtn').disabled=!isValidMonth(monthNext(state.month,1));
  }
  function openNotes(date){
    if(!isEditable()){$('authError').hidden=true;showDialog('authDialog');return;}
    state.noteDate=date;const x=state.notes[date]||{},d=state.monthRows.find(r=>r.prod_date===date);
    $('notesDate').textContent=dateLabel(date);
    $('notesMetric').textContent=d?`FTQ ${fmtPct(d.ftq_pct)}  •  GR ${fmtNumber(d.total_gr)}  •  Reject ${fmtNumber(d.total_reject)}`:'—';
    $('noteIssue').value=x.issue||'';$('noteRoot').value=x.root_cause||'';
    $('noteCorrective').value=x.corrective_action||'';$('notePreventive').value=x.preventive_action||'';
    showDialog('notesDialog');
  }
  async function saveNotes(ev){
    ev.preventDefault();if(!isEditable())return notify('Login sebagai admin terlebih dahulu.',true);
    const payload={prod_date:state.noteDate,issue:$('noteIssue').value.trim(),root_cause:$('noteRoot').value.trim(),corrective_action:$('noteCorrective').value.trim(),preventive_action:$('notePreventive').value.trim()};
    const button=$('saveNotesBtn');button.disabled=true;button.textContent='Menyimpan...';
    try{
      if(db){const {error}=await db.rpc('ftq_save_action',{p_date:payload.prod_date,p_issue:payload.issue,p_root_cause:payload.root_cause,p_corrective_action:payload.corrective_action,p_preventive_action:payload.preventive_action});if(error)throw error;}
      else {const all=safeGet(demoNotesKey,{});all[payload.prod_date]=payload;if(!safeSet(demoNotesKey,all))throw Error('Penyimpanan browser penuh. Hubungkan Supabase.');}
      state.notes[payload.prod_date]=payload;
      $('notesDialog').close();renderTable();notify('Catatan FTQ berhasil disimpan'+(db?'.':' di browser demo.'));
    }catch(err){notify('Gagal menyimpan: '+(err.message||err),true);}finally{button.disabled=false;button.textContent='Simpan Catatan';}
  }
  async function signIn(ev){
    ev.preventDefault();if(!db)return;
    const btn=$('loginSubmitBtn');btn.disabled=true;btn.textContent='Memeriksa...';$('authError').hidden=true;
    try{
      const {error}=await db.auth.signInWithPassword({email:$('adminEmail').value.trim(),password:$('adminPassword').value});
      if(error)throw error;
      await refreshAdmin();
      if(!state.admin){await db.auth.signOut();await refreshAdmin();throw Error('Akun belum terdaftar pada tabel ftq_admins. Hubungi administrator Supabase.');}
      $('authDialog').close();$('adminPassword').value='';notify('Login admin berhasil.');
    }catch(err){$('authError').hidden=false;$('authError').textContent=err.message||String(err);}
    finally{btn.disabled=false;btn.textContent='Masuk';}
  }
  function normalize(s){return String(s??'').trim().toLowerCase().replace(/[^a-z0-9]/g,'');}
  function parseNumber(raw){
    if(typeof raw==='number')return Number.isFinite(raw)?raw:NaN;
    if(raw===null||raw===undefined||String(raw).trim()==='')return 0;
    let s=String(raw).trim().replace(/\s/g,'');
    if(s.includes('.')&&s.includes(',')){
      if(s.lastIndexOf(',')>s.lastIndexOf('.'))s=s.replace(/\./g,'').replace(',','.');
      else s=s.replace(/,/g,'');
    }else if(s.includes(','))s=s.replace(',','.');
    return Number(s);
  }
  function parseDate(raw){
    if(raw instanceof Date&&!Number.isNaN(raw.getTime()))return isoLocal(raw);
    if(typeof raw==='number'&&window.XLSX){const x=window.XLSX.SSF.parse_date_code(raw);if(x&&x.y>=2000&&x.y<=2100)return `${x.y}-${String(x.m).padStart(2,'0')}-${String(x.d).padStart(2,'0')}`;}
    const s=String(raw??'').trim();
    let m=s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if(m)return validateDate(+m[1],+m[2],+m[3]);
    m=s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
    if(m)return validateDate(+m[3],+m[2],+m[1]);
    return null;
  }
  function validateDate(y,m,d){const dt=new Date(y,m-1,d);if(dt.getFullYear()!==y||dt.getMonth()+1!==m||dt.getDate()!==d)return null;return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;}
  const requiredHeaders=['matdoc','matdocyear','matdocitem','date','ordertype','totalgr','totalreject'];
  function findSapTable(workbook){
    const preferred=[...(workbook.SheetNames.includes('Data')?['Data']:[]),...workbook.SheetNames.filter(n=>n!=='Data')];
    for(const sheetName of preferred){
      const table=window.XLSX.utils.sheet_to_json(workbook.Sheets[sheetName],{header:1,defval:'',raw:true});
      for(let i=0;i<Math.min(40,table.length);i++){
        const headers=(table[i]||[]).map(normalize);
        if(requiredHeaders.every(k=>headers.includes(k))){
          const index=Object.fromEntries(headers.map((h,j)=>[h,j]));
          return {table,index,headerLine:i+1,sheetName};
        }
      }
    }
    throw Error('Header SAP tidak ditemukan. Wajib memuat Mat Doc, Mat Doc Year, Mat Doc Item, Date, Order Type, Total GR, dan Total Reject.');
  }
  function parseSapWorkbook(workbook){
    const {table,index,headerLine,sheetName}=findSapTable(workbook);
    const get=(arr,k)=>(index[k]===undefined?'':arr[index[k]]);
    const data=[];const seen=new Set();
    for(let i=headerLine;i<table.length;i++){
      const arr=table[i]||[];
      if(arr.every(v=>v===null||v===undefined||String(v).trim()===''))continue;
      const matDoc=String(get(arr,'matdoc')??'').trim();
      if(!matDoc||/^grand\s*total|^total$/i.test(matDoc))continue;
      const prodDate=parseDate(get(arr,'date'));
      const matYear=String(get(arr,'matdocyear')??'').trim();
      const matItem=String(get(arr,'matdocitem')??'').trim();
      const plant=String(get(arr,'plant')??'').trim();
      const gr=parseNumber(get(arr,'totalgr')),rej=parseNumber(get(arr,'totalreject'));
      const uu=parseNumber(get(arr,'totaluu')),qi=parseNumber(get(arr,'totalqi24h'));
      if(!prodDate||!matYear||!matItem||!Number.isFinite(gr)||!Number.isFinite(rej)||!Number.isFinite(uu)||!Number.isFinite(qi))throw Error('Isi tidak valid pada baris SAP '+(i+1)+'. Periksa tanggal dan angka GR / Reject.');
      const docKey=[matYear,matDoc,matItem,plant].join('|');
      if(seen.has(docKey))throw Error('Dokumen SAP duplikat dalam file (baris '+(i+1)+'): '+docKey);
      seen.add(docKey);
      const sourceFtq=get(arr,'ftq')===''?null:parseNumber(get(arr,'ftq'));
      if(sourceFtq!==null&&!Number.isFinite(sourceFtq))throw Error('Kolom FTQ salah pada baris '+(i+1));
      data.push({doc_key:docKey,prod_date:prodDate,mat_doc:matDoc,mat_doc_year:matYear,mat_doc_item:matItem,plant,
        prod_order:String(get(arr,'prodorder')??'').trim(),material:String(get(arr,'material')??'').trim(),
        material_description:String(get(arr,'materialdescription')??'').trim(),material_group_desc:String(get(arr,'materialgroupdesc')??'').trim(),
        order_type:String(get(arr,'ordertype')??'').trim(),total_gr:gr,total_uu:uu,total_reject:rej,total_qi_24h:qi,
        source_ftq:sourceFtq,entry_date:parseDate(get(arr,'entrydate'))});
    }
    if(!data.length)throw Error('File Excel SAP tidak berisi transaksi.');
    const months=new Set(data.map(r=>r.prod_date.slice(0,7)));
    if(months.size!==1)throw Error('File berisi lebih dari satu bulan ('+Array.from(months).join(', ')+'). Ekspor SAP secara MTD untuk satu bulan saja.');
    return {rows:data,month:[...months][0],sheetName};
  }
  async function handleFile(ev){
    $('uploadError').hidden=true;$('uploadPreview').hidden=true;$('commitImportBtn').disabled=true;state.importedRows=null;
    const f=ev.target.files?.[0];if(!f)return;
    if(!window.XLSX)return showUploadError('Pustaka XLSX belum termuat. Periksa koneksi internet.');
    if(!/\.xlsx?$/i.test(f.name))return showUploadError('Gunakan file Excel .xlsx atau .xls dari SAP.');
    try{
      const ab=await f.arrayBuffer();const wb=window.XLSX.read(ab,{type:'array',cellDates:false});
      const parsed=parseSapWorkbook(wb);
      if(parsed.month>currentMonth())throw Error('File berisi bulan mendatang.');
      const cutoff=cutoffIso();
      if(parsed.rows.some(r=>r.prod_date<cutoff))throw Error('File memuat data lebih lama dari 1 tahun dan tidak bisa diimpor.');
      if(parsed.month<$('monthPicker').min)throw Error('Bulan file di luar rentang histori yang diizinkan.');
      state.importedRows=parsed.rows;state.importingFile=f.name;
      const included=parsed.rows.filter(r=>!excluded.has(r.order_type));
      const gr=included.reduce((s,r)=>s+r.total_gr,0),rej=included.reduce((s,r)=>s+r.total_reject,0);
      const dates=parsed.rows.map(r=>r.prod_date).sort();
      $('uploadPreview').innerHTML=`<strong>${escapeHtml(f.name)}</strong><div>Sheet: ${escapeHtml(parsed.sheetName)} · Periode: <strong>${monthLabel(parsed.month)}</strong></div><div>Transaksi: <strong>${fmtNumber(parsed.rows.length)}</strong> · Masuk rumus FTQ: <strong>${fmtNumber(included.length)}</strong></div><div>Tanggal: ${dateLabel(dates[0])} – ${dateLabel(dates.at(-1))}</div><div>GR: ${fmtNumber(gr)} · Reject: ${fmtNumber(rej)} · FTQ: <strong>${fmtPct(gr?(gr-rej)*100/gr:null)}</strong></div><div>Upload akan mengganti <strong>SELURUH data bulan ${monthLabel(parsed.month)}</strong>.</div>`;
      $('uploadPreview').hidden=false;$('commitImportBtn').disabled=false;
      state.importedMonth=parsed.month;
    }catch(err){showUploadError(err.message||String(err));}
  }
  function showUploadError(text){$('uploadError').hidden=false;$('uploadError').textContent=text;notify(text,true);}
  async function saveImport(ev){
    ev.preventDefault();const rows=state.importedRows;const month=state.importedMonth;
    if(!rows?.length)return;
    if(!isEditable())return notify('Login admin diperlukan untuk import SAP.',true);
    const okay=window.confirm(`REPLACE SAP MTD ${monthLabel(month)}\n\n${rows.length} transaksi dari ${state.importingFile}.\nSemua transaksi lama pada bulan ini akan diganti sesuai file; bulan lainnya dan catatan admin tetap aman.\n\nPastikan file mencakup data MTD lengkap dari SAP. Lanjutkan?`);
    if(!okay)return;
    const btn=$('commitImportBtn');btn.disabled=true;btn.textContent='Menyimpan...';
    try{
      if(db){const {error}=await db.rpc('ftq_replace_month',{p_month:firstOfMonth(month),p_rows:rows});if(error)throw error;}
      else {const base=safeGet(demoKey,{});base[month]=rows;if(!safeSet(demoKey,base))throw Error('Penyimpanan lokal penuh. Silakan hubungkan Supabase.');}
      $('uploadDialog').close();$('sapFile').value='';state.importedRows=null;
      state.month=month;$('monthPicker').value=month;await loadData();
      notify('Import MTD '+monthLabel(month)+' berhasil — '+fmtNumber(rows.length)+' transaksi'+(db?' tersimpan online.':' tersimpan di pratinjau browser.'));
    }catch(err){showUploadError('Gagal import: '+(err.message||String(err)));}
    finally{btn.disabled=false;btn.textContent='Import & Replace Bulan';}
  }
  function exportResume(){
    if(!window.XLSX)return notify('Library ekspor Excel tidak termuat. Periksa koneksi internet.',true);
    const rows=[...state.monthRows].sort((a,b)=>a.prod_date.localeCompare(b.prod_date));
    if(!rows.length)return notify('Belum ada data untuk diekspor.',true);
    const header=['Tanggal','Total GR','Total Reject','FTQ (%)','Issue','Root Cause','Corrective Action','Preventive Action'];
    const data=[header];let sumGr=0,sumRej=0;
    for(const r of rows){sumGr+=r.total_gr;sumRej+=r.total_reject;const x=state.notes[r.prod_date]||{};data.push([r.prod_date,r.total_gr,r.total_reject,r.ftq_pct===null?null:r.ftq_pct/100,x.issue||'',x.root_cause||'',x.corrective_action||'',x.preventive_action||'']);}
    data.push(['Grand Total',sumGr,sumRej,sumGr?(sumGr-sumRej)/sumGr:null,'','','','']);
    const wb=window.XLSX.utils.book_new();const ws=window.XLSX.utils.aoa_to_sheet(data);
    ws['!cols']=[{wch:16},{wch:18},{wch:18},{wch:13},{wch:37},{wch:37},{wch:37},{wch:37}];
    for(let i=2;i<=data.length;i++){const cell=ws['D'+i];if(cell&&cell.t==='n')cell.z='0.00%';}
    for(const col of ['B','C'])for(let i=2;i<=data.length;i++){const cell=ws[col+i];if(cell&&cell.t==='n')cell.z='#,##0.00';}
    window.XLSX.utils.book_append_sheet(wb,ws,'Resume FTQ');
    const about=window.XLSX.utils.aoa_to_sheet([['Keterangan','Nilai'],['Bulan',monthLabel(state.month)],['FTQ','(SUM Total GR - SUM Total Reject) / SUM Total GR'],['Exclude Order Type','B101, B401, B701'],['Upload','Snapshot Month-to-date'],['Retensi','1 tahun dari tanggal produksi'],['Target visual dashboard',fmtPct(state.target)],['Sumber','SAP sheet Data, olahan sesuai Resume']]);
    about['!cols']=[{wch:25},{wch:65}];window.XLSX.utils.book_append_sheet(wb,about,'Info');
    window.XLSX.writeFile(wb,'FTQ_Resume_'+state.month+'.xlsx');
    notify('Resume FTQ '+monthLabel(state.month)+' telah diekspor.');
  }
  function changeMonth(month){if(!isValidMonth(month)){notify('Periode hanya tersedia dalam masa retensi 1 tahun.',true);$('monthPicker').value=state.month;return;}state.month=month;$('monthPicker').value=month;loadData();}
  function bind(){
    $('monthPicker').addEventListener('change',(e)=>changeMonth(e.target.value));
    $('prevMonthBtn').addEventListener('click',()=>changeMonth(monthNext(state.month,-1)));
    $('nextMonthBtn').addEventListener('click',()=>changeMonth(monthNext(state.month,1)));
    $('refreshBtn').addEventListener('click',()=>loadData());
    $('targetInput').addEventListener('change',(e)=>{const v=Number(e.target.value);if(!Number.isFinite(v)||v<0||v>100){e.target.value=state.target;return notify('Target harus 0 sampai 100.',true);}state.target=v;safeSet(targetKey,v);render();});
    $('searchInput').addEventListener('input',renderTable);
    $('exportBtn').addEventListener('click',exportResume);
    $('importBtn').addEventListener('click',()=>{if(!isEditable())return showDialog('authDialog');$('uploadPreview').hidden=true;$('uploadError').hidden=true;$('commitImportBtn').disabled=true;$('sapFile').value='';state.importedRows=null;showDialog('uploadDialog');});
    $('sapFile').addEventListener('change',handleFile);
    $('uploadForm').addEventListener('submit',saveImport);
    $('notesForm').addEventListener('submit',saveNotes);
    $('authForm').addEventListener('submit',signIn);
    $('authBtn').addEventListener('click',async()=>{if(db&&state.user){await db.auth.signOut();await refreshAdmin();notify('Anda telah keluar dari akun admin.');}else if(db)showDialog('authDialog');else notify('Mode demo lokal; catatan tersimpan hanya di browser, bukan server.');});
    document.querySelectorAll('[data-close]').forEach(b=>b.addEventListener('click',() => $(b.dataset.close).close()));
  }
  async function boot(){
    state.month=currentMonth();
    const today=new Date(), min=new Date(today.getFullYear(),today.getMonth()-12,1);
    $('monthPicker').min=isoLocal(min).slice(0,7);$('monthPicker').max=state.month;$('monthPicker').value=state.month;
    const target=safeGet(targetKey,NaN);if(typeof target==='number'&&Number.isFinite(target)&&target>=0&&target<=100)state.target=target;
    $('targetInput').value=state.target;
    bind();await refreshAdmin();await loadData();
  }
  document.addEventListener('DOMContentLoaded',()=>{boot().catch(e=>showError('Inisialisasi FTQ gagal: '+(e.message||e)));});
})();
