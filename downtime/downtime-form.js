(function (){
  'use strict';
  const C=window.DowntimeCore,M=C.master;
  const $=id=>document.getElementById(id);
  const MONTHS=['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  const form=$('downtimeForm');
  let preserving=false;
  function setOptions(id,choices,placeholder,preserve=''){
    const node=$(id);node.replaceChildren(new Option(placeholder,''));
    for(const item of choices)node.add(new Option(String(item),String(item)));
    if(preserve&&choices.includes(preserve))node.value=preserve;
  }
  function updateLines(preserve=''){
    const b=$('workshop').value;
    const lines=M.linesByBuilding?.[b]||[];
    setOptions('line',lines,'Pilih Line',preserve);$('line').disabled=!b;updateMachines();
  }
  function updateMachines(preserve=''){
    const ln=$('line').value;
    const machines=M.machinesByLine?.[ln]||[];
    setOptions('machine',[...machines,'Lainnya'],'Pilih Mesin',preserve);
    $('machine').disabled=!ln;toggleOtherMachine();
  }
  function toggleOtherMachine(){
    const other=$('machine').value==='Lainnya';$('otherMachineBox').hidden=!other;
    $('otherMachine').required=other;if(!other)$('otherMachine').value='';
  }
  function updateTime(){
    const d=C.duration($('start_dt').value,$('stop_dt').value);
    $('durMin').textContent=d===null?'— menit':`${C.fmt(d)} menit`;
    $('durMin').style.color=d!==null?'#245cbd':'#7e94ad';
  }
  function updateDate(){
    const value=$('tanggal').value;
    if(!value){$('dateWeek').textContent='—';$('dateMonth').textContent='—';return;}
    const p=C.dateParts(value);
    $('dateWeek').textContent=`Week ${p.week}`;
    $('dateMonth').textContent=`${MONTHS[p.month-1]} ${p.year}`;
  }
  function setCategory(){
    const desc=$('dt_description').value.trim().toLocaleLowerCase('id-ID');
    const item=(M.reasons||[]).find(r=>r.description.toLocaleLowerCase('id-ID')===desc);
    $('dt_category').disabled=!!item;
    if(item)$('dt_category').value=item.category;
    else $('dt_category').value='';
  }
  function initialize(){
    setOptions('workshop',M.buildings||[],'Pilih Gedung');
    setOptions('section',M.sections||[],'Pilih Section');
    setOptions('shift',M.shifts||[],'Pilih Shift');
    setOptions('grup',M.groups||[],'Pilih Grup');
    setOptions('dt_category',M.categories||[],'Pilih kategori downtime');
    const datalist=$('reasonChoices');for(const r of M.reasons||[])datalist.add(new Option(r.description,r.description));
    const now=C.todayISO();$('tanggal').value=now;
    $('tanggal').max=C.dayMinus(now,-1);
    const old=new Date(now+'T00:00:00');old.setFullYear(old.getFullYear()-1);$('tanggal').min=C.isoDate(old);
    $('workshop').addEventListener('change',()=>updateLines());
    $('line').addEventListener('change',()=>updateMachines());
    $('machine').addEventListener('change',toggleOtherMachine);
    ['start_dt','stop_dt'].forEach(id=>$(id).addEventListener('input',updateTime));
    $('tanggal').addEventListener('change',updateDate);
    $('dt_description').addEventListener('input',setCategory);
    form.addEventListener('submit',submit);
    form.addEventListener('reset',()=>{if(preserving)return;setTimeout(()=>{
      $('tanggal').value=C.todayISO();$('line').disabled=true;$('machine').disabled=true;toggleOtherMachine();
      $('dt_category').disabled=false;updateDate();updateTime();
    },0);});
    $('sourceBadge').classList.toggle('online',C.configured());
    $('sourceLabel').textContent=C.configured()?'SUPABASE ONLINE':'MODE LOKAL';
    updateDate();updateTime();
  }
  function fromForm(){
    const machine=$('machine').value==='Lainnya'?$('otherMachine').value.trim():$('machine').value;
    return {
      tanggal:$('tanggal').value,
      workshop:$('workshop').value,section:$('section').value,
      line:$('line').value,shift:$('shift').value,grup:$('grup').value,machine,
      start_dt:$('start_dt').value,stop_dt:$('stop_dt').value,
      dt_category:$('dt_category').value,dt_description:$('dt_description').value.trim(),
      root_cause:$('root_cause').value.trim(),action:$('action').value.trim(),source:'form'
    };
  }
  function preserveLocation(payload){
    preserving=true;form.reset();preserving=false;
    $('tanggal').value=payload.tanggal;
    $('workshop').value=payload.workshop;
    $('section').value=payload.section;
    updateLines(payload.line);updateMachines(M.machinesByLine?.[payload.line]?.includes(payload.machine)?payload.machine:'Lainnya');
    if($('machine').value==='Lainnya')$('otherMachine').value=payload.machine;
    $('shift').value=payload.shift;$('grup').value=payload.grup;
    $('dt_category').disabled=false;updateDate();updateTime();
    $('start_dt').focus();
  }
  async function submit(event){
    event.preventDefault();
    if(!form.checkValidity()){form.reportValidity();return;}
    const payload=fromForm();
    if(!payload.machine){C.showToast('Nama mesin wajib diisi','error');$('otherMachine').focus();return;}
    if(!payload.dt_category){C.showToast('Pilih kategori downtime','error');$('dt_category').focus();return;}
    const duration=C.duration(payload.start_dt,payload.stop_dt);
    if(duration===null){C.showToast('Jam mulai dan selesai tidak boleh sama','error');return;}
    const button=$('saveButton');button.disabled=true;button.textContent='Menyimpan...';
    try{
      const result=await C.saveEvent(payload);
      C.showToast(result.mode==='online'?`Downtime ${C.fmt(duration)} menit berhasil disimpan`:`Downtime ${C.fmt(duration)} menit disimpan di perangkat (mode lokal)`,'success');
      preserveLocation(payload);
    }catch(e){C.showToast(e.message||'Gagal menyimpan downtime','error');}
    finally{button.disabled=false;button.textContent='Simpan Downtime';}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize);else initialize();
})();
