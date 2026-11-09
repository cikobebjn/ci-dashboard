(function(){
  'use strict';
  const app=window.CILT,tasks=window.CILT_TASKS;
  const $=id=>document.getElementById(id);
  let currentRecord=null,loadVersion=0,busy=false;
  const state={};
  const validStatus=['done','abnormal','skipped'];

  function populate(){
    $('checkDate').value=app.today();
    $('machineSelect').insertAdjacentHTML('beforeend',app.cfg.MACHINES.map(x=>`<option value="${app.safeText(x)}">${app.safeText(x)}</option>`).join(''));
    $('hourSelect').innerHTML=Array.from({length:24},(_,i)=>`<option value="${i}">${app.hourLabel(i)} - ${app.hourLabel((i+1)%24)}</option>`).join('');
    $('hourSelect').value=String(app.currentHour());
    const q=new URLSearchParams(location.search);
    const machine=q.get('machine');const day=q.get('date');const hour=q.get('hour');
    if(machine && app.cfg.MACHINES.includes(machine))$('machineSelect').value=machine;
    if(day && /^\d{4}-\d{2}-\d{2}$/.test(day))$('checkDate').value=day;
    if(hour!==null && Number.isInteger(Number(hour)) && Number(hour)>=0 && Number(hour)<24)$('hourSelect').value=String(Number(hour));
    $('taskGrid').innerHTML=tasks.map(task=>{
      const t=app.safeText;
      return `<article class="task-card" id="taskCard${task.id}" data-task-card="${task.id}">
          <div class="task-top"><div class="task-identity"><div class="task-number">${String(task.id).padStart(2,'0')}</div><div><span class="task-code">${t(task.type)} · ${t(task.equipment)}</span><h3 class="task-name">${t(task.part)}</h3><span class="task-sub">${t(task.type)} / Task ${task.id}</span></div></div><span class="tag stop">● ${t(task.runStop).toUpperCase()}</span></div>
          <div class="task-meta"><span class="tag">◷ ${task.durationMin} menit</span><span class="tag">Tools: ${t(task.tools)}</span></div>
          <details class="instruction"><summary>Detail standar pengerjaan</summary><p class="instruction-steps">${t(task.instructions)}</p></details>
          <div class="status-row" role="group" aria-label="Hasil task ${task.id}">
            <button type="button" class="status-choice" data-task="${task.id}" data-status="done" data-active="false" aria-pressed="false"><b>✓</b> Sudah dilakukan</button>
            <button type="button" class="status-choice" data-task="${task.id}" data-status="abnormal" data-active="false" aria-pressed="false"><b>O</b> Abnormal</button>
            <button type="button" class="status-choice" data-task="${task.id}" data-status="skipped" data-active="false" aria-pressed="false"><b>/</b> Tidak dilakukan</button>
          </div>
          <div class="task-note-wrap" id="noteWrap${task.id}"><label class="field-label" for="taskNote${task.id}">Alasan / abnormality <span class="required">*</span></label><textarea id="taskNote${task.id}" class="control task-note" maxlength="2000" placeholder="Tuliskan kondisi yang ditemukan atau alasan tidak dilakukan..."></textarea><p class="task-note-error" id="taskError${task.id}">Keterangan wajib diisi untuk hasil ini.</p></div>
        </article>`;
    }).join('');
  }
  function updateTask(id){
    const info=state[id]||{};const card=$('taskCard'+id);if(!card)return;
    card.classList.toggle('is-complete',!!info.status);card.classList.toggle('has-alert',info.status==='abnormal'||info.status==='skipped');
    card.querySelectorAll('.status-choice').forEach(button=>{
      const active=button.dataset.status===info.status;button.dataset.active=String(active);button.setAttribute('aria-pressed',String(active));
    });
    const needNote=info.status==='abnormal'||info.status==='skipped';
    $('noteWrap'+id).classList.toggle('is-visible',needNote);
    $('taskNote'+id).value=info.note||'';
    if(!needNote)$('taskError'+id).classList.remove('is-visible');
  }
  function updateProgress(){
    let filled=tasks.filter(t=>validStatus.includes(state[t.id]?.status)).length;
    $('taskCounter').textContent=filled+' / '+tasks.length;
    $('taskProgress').style.width=Math.round(100*filled/tasks.length)+'%';
    $('saveCaption').textContent=filled===tasks.length?'Semua status sudah dipilih':'Lengkapi '+(tasks.length-filled)+' status pengecekan';
  }
  function clearResults(){
    tasks.forEach(t=>{state[t.id]={status:'',note:''};updateTask(t.id);});
    $('generalNote').value='';updateProgress();
  }
  async function loadExisting(){
    const date=$('checkDate').value,machine=$('machineSelect').value,hour=Number($('hourSelect').value);
    const stamp=++loadVersion;currentRecord=null;
    clearResults();$('saveBtn').disabled=false;$('saveBtn').textContent='Simpan Pengecekan';
    $('recordNotice').textContent=machine?'Memeriksa data untuk mesin dan jam ini...':'Pilih mesin untuk memulai.';
    if(!date||!machine||Number.isNaN(hour))return;
    try{
      const record=await app.getOne(date,machine,hour);
      if(stamp!==loadVersion)return;
      currentRecord=record;
      if(record?.locked){
        currentRecord=record;
        $('saveBtn').disabled=true;
        $('saveBtn').textContent='Sudah Terisi';
        $('recordNotice').textContent='Slot ini sudah terisi dari perangkat lain. Hubungi SPV untuk koreksi atau pilih mesin/jam yang belum terisi.';
        return;
      }
      if(record){
        $('shiftSelect').value=String(record.shift);
        $('operatorName').value=record.operator_name||'';
        $('generalNote').value=record.general_note||'';
        const checks=Array.isArray(record.checks)?record.checks:[];
        tasks.forEach(t=>{
          const data=checks.find(x=>Number(x.task_id)===t.id);
          state[t.id]={status:data?.status||'',note:data?.note||''};updateTask(t.id);
        });
        $('saveBtn').textContent='Perbarui Pengecekan';
        $('recordNotice').innerHTML=`<strong>Data sudah tersimpan</strong> · diperbarui ${app.safeText(new Date(record.updated_at||record.created_at).toLocaleString('id-ID',{timeZone:app.cfg.TIMEZONE}))}. Isian dapat diedit dan disimpan kembali.`;
      }else{$('recordNotice').textContent='Belum ada input untuk '+machine+' pada '+app.hourLabel(hour)+'.';}
      updateProgress();
    }catch(e){if(stamp!==loadVersion)return;app.toast(e.message,'bad');$('recordNotice').textContent='Tidak berhasil memuat pengecekan sebelumnya.';}
  }
  function validate(){
    const fields=[['checkDate','Tanggal'],['machineSelect','Mesin'],['hourSelect','Jam'],['shiftSelect','Shift'],['operatorName','Nama Operator']];
    for(const [id,label] of fields){if(!$(id).value.trim()){app.toast(label+' wajib diisi.','bad');$(id).focus();return false;}}
    const day=$('checkDate').value,slot=Number($('hourSelect').value);
    if(day>app.today() || (day===app.today() && slot>app.currentHour())){app.toast('Jam pengecekan belum terjadi. Pilih jam saat ini atau sebelumnya.','bad');$('hourSelect').focus();return false;}
    for(const t of tasks){
      const data=state[t.id];
      if(!validStatus.includes(data?.status)) {app.toast('Pilih hasil pengecekan untuk task '+t.id+'.','bad');$('taskCard'+t.id).scrollIntoView({behavior:'smooth',block:'center'});return false;}
      if((data.status==='abnormal'||data.status==='skipped') && !String(data.note||'').trim()){
        $('taskError'+t.id).classList.add('is-visible');app.toast('Task '+t.id+' wajib memiliki keterangan.','bad');$('taskNote'+t.id).focus();return false;
      }
    }
    return true;
  }
  async function save(){
    if(busy||currentRecord?.locked||!validate())return;
    const date=$('checkDate').value,machine=$('machineSelect').value,hour=Number($('hourSelect').value);
    if(!window.confirm(`${currentRecord?'Perbarui':'Simpan'} hasil CILT untuk ${machine}, ${app.niceDate(date)}, jam ${app.hourLabel(hour)}?`))return;
    const record={check_date:date,hour_slot:hour,building:app.cfg.BUILDING,machine,shift:Number($('shiftSelect').value),operator_name:$('operatorName').value.trim(),checks:tasks.map(t=>({task_id:t.id,status:state[t.id].status,note:(state[t.id].status==='done'?'':state[t.id].note||'').trim()})),general_note:$('generalNote').value.trim()};
    busy=true;const btn=$('saveBtn');btn.disabled=true;btn.textContent='Menyimpan...';
    try{currentRecord=await app.upsert(record);app.toast('Pengecekan CILT berhasil disimpan.');$('recordNotice').innerHTML='<strong>Data tersimpan.</strong> Bisa diperbarui dari perangkat yang sama.';btn.textContent='Perbarui Pengecekan';}
    catch(e){app.toast('Gagal menyimpan: '+e.message,'bad');btn.textContent=currentRecord?'Perbarui Pengecekan':'Simpan Pengecekan';}
    finally{busy=false;btn.disabled=false;}
  }
  async function main(){
    populate();clearResults();
    $('taskGrid').addEventListener('click',event=>{
      const btn=event.target.closest('button[data-task][data-status]');if(!btn)return;
      const id=Number(btn.dataset.task),status=btn.dataset.status;
      state[id]={status,note:status==='done'?'':(state[id]?.note||'')};updateTask(id);updateProgress();
    });
    $('taskGrid').addEventListener('input',event=>{
      const el=event.target;if(!el.id.startsWith('taskNote'))return;
      const id=Number(el.id.replace('taskNote',''));if(state[id])state[id].note=el.value;
      if(el.value.trim())$('taskError'+id).classList.remove('is-visible');
    });
    for(const id of ['checkDate','machineSelect','hourSelect'])$(id).addEventListener('change',loadExisting);
    $('saveBtn').addEventListener('click',save);
    $('resetBtn').addEventListener('click',()=>{if(window.confirm('Kosongkan isian checklist pada layar ini? Data yang sudah tersimpan tidak akan terhapus.')){clearResults();$('recordNotice').textContent='Isian di layar dikosongkan, data tersimpan tidak dihapus.';}});
    await app.withAuth(loadExisting);
  }
  document.addEventListener('DOMContentLoaded',main);
})();
