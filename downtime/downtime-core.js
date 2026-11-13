(function () {
  'use strict';
  const config = window.DOWNTIME_CONFIG || {};
  const localKey = 'kobe_downtime_local_v1';
  const MONTHS = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  const master = window.DT_MASTER || {};
  const numberFmt = new Intl.NumberFormat('id-ID',{maximumFractionDigits:1});
  const makeDate = (d) => new Date(`${d}T00:00:00`);
  const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt = (value,digits=0) => new Intl.NumberFormat('id-ID',{minimumFractionDigits:digits,maximumFractionDigits:digits}).format(Number(value)||0);
  const num = value => Number.isFinite(Number(value)) ? Number(value) : 0;
  const compact = value => value >= 1000000 ? `${fmt(value/1000000,1)} jt` : value >= 10000 ? `${fmt(value/1000,1)} rb` : fmt(value,0);
  const todayISO = () => { const now=new Date(); const y=now.getFullYear();return `${y}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`; };
  const isoDate = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
  const dayMinus = (date,n) => { const d=makeDate(date);d.setDate(d.getDate()-n);return isoDate(d); };
  const dateIndo = d => {if(!d)return '—';const x=makeDate(d);return Number.isNaN(x.getTime())?'—':`${String(x.getDate()).padStart(2,'0')} ${MONTHS[x.getMonth()]} ${x.getFullYear()}`;};
  const weekSun = date => {if(!date)return null;const [y,m,d]=date.split('-').map(Number);const doy=Math.floor((Date.UTC(y,m-1,d)-Date.UTC(y,0,1))/86400000)+1;return Math.floor((doy+new Date(Date.UTC(y,0,1)).getUTCDay()-1)/7)+1;};
  const dateParts = d => {const x=makeDate(d);return {year:x.getFullYear(),month:x.getMonth()+1,week:weekSun(d)};};
  function duration(a,b) {if(!a||!b)return null;const p=a.split(':').map(Number),q=b.split(':').map(Number);if(p.length<2||q.length<2)return null;const st=p[0]*60+p[1],en=q[0]*60+q[1];if(st===en)return null;return (en-st+1440)%1440;}
  const configured=()=>!!(String(config.supabaseUrl||'').trim()&&String(config.supabaseAnonKey||'').trim());
  const baseUrl=()=>String(config.supabaseUrl||'').trim().replace(/\/+$/,'').replace(/\/rest\/v1$/i,'');
  function showToast(message,type='info') {
    let t=document.getElementById('dt-toast');if(!t){t=document.createElement('div');t.id='dt-toast';document.body.append(t);}
    t.className=`dt-toast show ${type}`;t.setAttribute('role','status');t.textContent=message;
    clearTimeout(showToast.timer);showToast.timer=setTimeout(()=>t.classList.remove('show'),4500);
  }
  async function api(path,method='GET',body=null,params=null){
    if(!configured())throw new Error('Supabase belum dikonfigurasi');
    const url=new URL(baseUrl()+'/rest/v1/'+path);
    if(params)for(const [k,v]of Object.entries(params)){if(v!=null&&v!=='')url.searchParams.set(k,String(v));}
    const headers={'apikey':config.supabaseAnonKey,'Authorization':`Bearer ${config.supabaseAnonKey}`,'Content-Type':'application/json','Accept':'application/json'};
    if(method==='POST')headers.Prefer='return=representation';
    const res=await fetch(url.toString(),{method,headers,body:body===null?undefined:JSON.stringify(body)});
    const raw=await res.text();let value=null;try{value=raw?JSON.parse(raw):null;}catch{value=raw;}
    if(!res.ok)throw new Error(typeof value==='object'&&(value?.message||value?.hint)?`${value.message||'Gagal'}${value.hint?' - '+value.hint:''}`:`Gagal mengakses data (${res.status})`);
    return value;
  }
  let historyLoading;
  function loadHistory(){
    if(window.DT_EXCEL_HISTORY)return Promise.resolve(window.DT_EXCEL_HISTORY);
    if(!historyLoading)historyLoading=new Promise((resolve,reject)=>{
      const script=document.createElement('script');script.src='downtime-history.js';script.onload=()=>resolve(window.DT_EXCEL_HISTORY||[]);script.onerror=()=>reject(new Error('Data Excel tidak dapat dimuat'));document.head.appendChild(script);
    });
    return historyLoading;
  }
  function readLocal(){try{const rows=JSON.parse(localStorage.getItem(localKey)||'[]');return Array.isArray(rows)?rows:[];}catch{return [];}}
  function saveLocal(payload){
    const rows=readLocal();const v=[payload.tanggal,payload.workshop,payload.section,payload.line,payload.shift,payload.grup,payload.machine,payload.start_dt,payload.stop_dt,duration(payload.start_dt,payload.stop_dt),payload.dt_category,payload.dt_description,payload.root_cause||'',payload.action||'','',0,Date.now()];
    rows.push(v);localStorage.setItem(localKey,JSON.stringify(rows.slice(-3000)));
  }
  function matching(r,f){
    const d=r[0];if(f.start&&d<f.start)return false;if(f.end&&d>f.end)return false;
    if(f.workshop&&r[1]!==f.workshop)return false;
    if(f.section&&r[2]!==f.section)return false;
    if(f.line&&r[3]!==f.line)return false;
    if(f.shift&&r[4]!==f.shift)return false;
    if(f.machine&&r[6]!==f.machine)return false;
    if(f.category&&r[10]!==f.category)return false;
    if(f.description&&r[11]!==f.description)return false;
    if(f.exclude_ishoma&&String(r[10]).toLowerCase().includes('ishoma'))return false;
    const needsPeriod=f.year||f.month||f.week;
    if(needsPeriod){const p=dateParts(d);if(f.year&&p.year!==Number(f.year))return false;if(f.month&&p.month!==Number(f.month))return false;if(f.week&&p.week!==Number(f.week))return false;}
    return true;
  }
  const aggregateMap = (obj,key,minutes) => {
    const k=key||'Tanpa Data'; if(!obj.has(k))obj.set(k,{key:k,minutes:0,events:0});
    const row=obj.get(k);row.events++;row.minutes+=num(minutes);
  };
  const sorted=(map,limit=null)=>{const v=[...map.values()].map(r=>({...r,minutes:Math.round(r.minutes*100)/100})).sort((a,b)=>b.minutes-a.minutes||a.key.localeCompare(b.key));return limit?v.slice(0,limit):v;};
  function aggregate(rows,f){
    const selected=rows.filter(r=>matching(r,f));
    const day=new Map(),week=new Map(),month=new Map(),build=new Map(),lines=new Map(),machines=new Map(),reasons=new Map(),cats=new Map();
    let total=0,valid=0;const machineSet=new Set();
    for(const r of selected){
      const min=r[9],p=dateParts(r[0]);
      if(min!=null && Number.isFinite(Number(min))){valid++;total+=num(min);}
      if(r[6])machineSet.add(r[6]);
      aggregateMap(day,r[0],min);
      aggregateMap(week,`${p.year}-W${String(p.week).padStart(2,'0')}`,min);
      aggregateMap(month,`${p.year}-${String(p.month).padStart(2,'0')}`,min);
      aggregateMap(build,r[1],min);aggregateMap(lines,r[3],min);aggregateMap(machines,r[6],min);aggregateMap(reasons,r[11],min);aggregateMap(cats,r[10],min);
    }
    const timeSorted=map=>[...map.values()].map(v=>({...v,minutes:Math.round(v.minutes*100)/100})).sort((a,b)=>a.key.localeCompare(b.key));
    const recent=selected.slice().sort((a,b)=>b[0].localeCompare(a[0])||String(b[7]).localeCompare(String(a[7]))||num(b[16])-num(a[16])).slice(0,30).map(r=>({
      id:r[15],tanggal:r[0],workshop:r[1],section:r[2],line:r[3],shift:r[4],grup:r[5],machine:r[6],
      start_dt:r[7],stop_dt:r[8],minutes:r[9],dt_category:r[10],dt_description:r[11],root_cause:r[12],action:r[13]
    }));
    return {kpi:{events:selected.length,valid_events:valid,incomplete_events:selected.length-valid,minutes:Math.round(total*100)/100,machines:machineSet.size,
       first_date:selected.reduce((a,r)=>a<r[0]?a:r[0],selected[0]?.[0]||null),last_date:selected.reduce((a,r)=>a>r[0]?a:r[0],selected[0]?.[0]||null)},
      daily:timeSorted(day),weekly:timeSorted(week),monthly:timeSorted(month),buildings:sorted(build),lines:sorted(lines,12),machines:sorted(machines,10),reasons:sorted(reasons,12),categories:sorted(cats),recent};
  }
  async function getSummary(f){
    if(configured()){
      return await api('rpc/downtime_dashboard_v1','POST',{
        p_start:f.start||null,p_end:f.end||null,p_workshop:f.workshop||null,p_section:f.section||null,p_line:f.line||null,
        p_machine:f.machine||null,p_shift:f.shift||null,p_category:f.category||null,p_description:f.description||null,
        p_year:f.year?Number(f.year):null,p_month:f.month?Number(f.month):null,p_week:f.week?Number(f.week):null,
        p_exclude_ishoma:!!f.exclude_ishoma
      });
    }
    const history=config.previewHistory ? await loadHistory() : [];return aggregate(history.concat(readLocal()),f);
  }
  async function saveEvent(payload){
    if(configured())return {mode:'online',data:await api('downtime_events','POST',payload,{select:'id,tanggal,duration_minutes'})};
    saveLocal(payload);return {mode:'local'};
  }
  async function exportRows(f){
    if(!configured()){
      const h=config.previewHistory ? await loadHistory() : [];return h.concat(readLocal()).filter(r=>matching(r,f)).map(r=>({tanggal:r[0],workshop:r[1],section:r[2],line:r[3],shift:r[4],grup:r[5],machine:r[6],start_dt:r[7],stop_dt:r[8],duration_minutes:r[9],dt_category:r[10],dt_description:r[11],root_cause:r[12],action:r[13],legacy_code:r[14]}));
    }
    let rows=[],offset=0;
    while(true){
      const params={select:'tanggal,workshop,section,line,shift,grup,machine,start_dt,stop_dt,duration_minutes,dt_category,dt_description,root_cause,action,code,legacy_code',order:'tanggal.desc,created_at.desc',limit:1000,offset};
      if(f.start)params.tanggal='gte.'+f.start;
      if(f.end){if(params.tanggal){delete params.tanggal;params.and=`(tanggal.gte.${f.start},tanggal.lte.${f.end})`;}else params.tanggal='lte.'+f.end;}
      for(const [k,col] of [['workshop','workshop'],['section','section'],['line','line'],['shift','shift'],['machine','machine'],['category','dt_category'],['description','dt_description']])if(f[k])params[col]='eq.'+f[k];
      if(f.year)params.year_no='eq.'+Number(f.year);if(f.month)params.month_no='eq.'+Number(f.month);if(f.week)params.week_no='eq.'+Number(f.week);
      if(f.exclude_ishoma && f.category?.toLowerCase().includes('ishoma'))return [];
      if(f.exclude_ishoma && !f.category)params.dt_category='not.ilike.*ishoma*';
      const page=await api('downtime_events','GET',null,params);rows=rows.concat(page);
      if(page.length<1000)break;offset+=1000;if(offset>=200000)throw new Error('Ekspor terlalu besar');
    }
    return rows;
  }
  function downloadCsv(rows){
    const head=['Month','Week','Date','Workshop','Section','Line','Shift','Grup','Machine','Start DT','Stop DT','Duration','DT Category','DT Description','Root Cause','Action','Code'];
    const serial = date => date ? Math.round((Date.parse(date+'T00:00:00Z')-Date.UTC(1899,11,30))/86400000):'';
    const cell=v=>{let x=String(v??'');if(/^[=+@]/.test(x.trimStart()))x="'"+x;return '"'+x.replace(/"/g,'""')+'"';};
    const data=rows.map(r=>{
      const dt=r.tanggal,p=dt?dateParts(dt):null;
      const code=r.legacy_code||r.code||`${serial(dt)}${r.workshop||''}${r.section||''}${r.line||''}${r.shift||''}${r.grup||''}${r.machine||''}`;
      return [p?MONTHS[p.month-1]:'',p?.week||'',dt,r.workshop,r.section,r.line,r.shift,r.grup,r.machine,r.start_dt,r.stop_dt,r.duration_minutes,r.dt_category,r.dt_description,r.root_cause,r.action,code];
    });
    const body=[head.map(cell).join(','),...data.map(row=>row.map(cell).join(','))].join('\r\n');
    const blob=new Blob(['\ufeff',body],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=`downtime-bojonegoro-${todayISO()}.csv`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  window.DowntimeCore={master,config,configured,baseUrl,esc,fmt,compact,num,todayISO,dayMinus,isoDate,dateIndo,dateParts,weekSun,duration,showToast,api,readLocal,matching,getSummary,saveEvent,exportRows,downloadCsv,loadHistory};
})();
