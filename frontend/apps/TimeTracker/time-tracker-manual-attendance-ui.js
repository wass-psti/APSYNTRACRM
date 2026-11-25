import {manualAttendanceToday,manualAttendanceDatePolicy,TT_MANUAL_LOCATIONS,buildManualAttendanceEntry,formatManualAttendanceTime} from './time-tracker-manual-attendance.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const opt=(value,label,selected)=>'<option value="'+esc(value)+'"'+(value===selected?' selected':'')+'>'+esc(label)+'</option>';
export function manualAttendancePreviewRoster(snapshot){
 const groups=snapshot?.ojtAdmin?.groups||[];
 const shared=new Set(groups.map(g=>g.userId));
 shared.add('d613280d-907b-418f-b872-c0f6dd53e580');
 const regular=(snapshot?.access?.overviewDirectory||[]).filter(m=>m.status==='active'&&!shared.has(m.id))
  .map(m=>({id:m.id,type:'regular',name:m.display_name,active:true}));
 const interns=groups.filter(g=>g.enabled).flatMap(g=>g.interns.filter(i=>i.active)
  .map(i=>({id:i.id,type:'ojt',name:i.name,active:true})));
 return [...regular,...interns].sort((a,b)=>String(a.name).localeCompare(String(b.name)));
}
export function readManualAttendanceDraft(form){
 const data=new FormData(form);
 const [employeeType,employeeId]=String(data.get('employee')||'').split(':');
 return {employeeType,employeeId,date:String(data.get('date')||''),status:String(data.get('status')||''),
  clockInTime:String(data.get('clockInTime')||''),clockOutDate:String(data.get('clockOutDate')||''),
  clockOutTime:String(data.get('clockOutTime')||''),location:String(data.get('location')||''),
  workNote:String(data.get('workNote')||''),reason:String(data.get('reason')||'')};
}
export function syncManualAttendanceForm(form,now=new Date(),changed=null){
 if(changed?.name==='clockInPreset'||changed?.name==='clockOutPreset'){
  const field=form.elements[changed.name==='clockInPreset'?'clockInTime':'clockOutTime'];
  if(changed.value)field.value=formatManualAttendanceTime(changed.value);
  changed.value='';
 }
 const date=form.elements.date,status=form.elements.status;
 const activeOnly=form.dataset.activeOnly==='true';
 if(activeOnly){date.value=manualAttendanceToday(now);status.value='active';}
 const policy=manualAttendanceDatePolicy(date.value,now);
 date.max=manualAttendanceToday(now);
 date.setCustomValidity(policy.allowed?'':'Select today or a past date.');
 status.querySelector('option[value="active"]').disabled=!policy.activeAllowed;
 if(!policy.activeAllowed)status.value='completed';

 date.dataset.previousDate=date.value;
 const completed=status.value==='completed';
 const outDate=form.elements.clockOutDate,outTime=form.elements.clockOutTime;
 outDate.disabled=outTime.disabled=form.elements.clockOutPreset.disabled=!completed;
 outDate.required=outTime.required=completed;
 outDate.min=date.value;outDate.max=date.max;
 if(completed&&(!outDate.value||outDate.value<date.value))outDate.value=date.value;
 if(!completed){outDate.value='';outTime.value='';}
 const outFields=form.querySelector('[data-tt-manual-out]');
 outFields.hidden=!completed;outFields.style.display=completed?'':'none';
 const offsite=form.elements.location.value==='Offsite (Home)';
 const note=form.elements.workNote,noteField=form.querySelector('[data-tt-manual-note]');
 note.required=offsite;note.disabled=!offsite;
 noteField.hidden=!offsite;noteField.style.display=offsite?'':'none';
 if(!offsite)note.value='';
 form.querySelector('[data-tt-manual-policy]').textContent=activeOnly?'Active same-day regular employee sessions only.':policy.activeAllowed?
  'Today: active or completed.':'Past attendance must be completed; future dates are not permitted.';
 return readManualAttendanceDraft(form);
}
export function renderManualAttendanceEditor({editor,busy=false,error='',now=new Date()}={}){
 if(editor?.mode!=='manual')return '';
 const today=manualAttendanceToday(now),d=editor.draft||{};
 const activeOnly=editor.activeOnly===true;
 const regularOnly=activeOnly||editor.regularOnly===true;
 const offsite=d.location==='Offsite (Home)';
 const date=activeOnly?today:d.date||today,policy=manualAttendanceDatePolicy(date,now);
 const status=activeOnly?'active':policy.activeAllowed?(d.status||'active'):'completed',completed=status==='completed';
 const ready=editor.signedCreateReady===true&&!editor.uncertain;
 const input=(label,name,type,value,attrs='')=>'<label class="tt-admin-field"><span>'+esc(label)+'</span><input name="'+name+'" type="'+type+'" value="'+esc(value)+'" '+attrs+'></label>';
 const timeInput=(label,name,value,enabled=true)=>{
  const preset=name==='clockInTime'?'clockInPreset':'clockOutPreset';
  const options=Array.from({length:24},(_,h)=>String(h).padStart(2,'0')+':00')
   .map(t=>opt(t,formatManualAttendanceTime(t),'')).join('');
  return '<div class="tt-admin-field"><label for="tt-manual-'+name+'">'+esc(label)+'</label>'+
   '<div class="tt-manual-time-controls"><input id="tt-manual-'+name+'" name="'+name+
   '" type="text" value="'+esc(formatManualAttendanceTime(value))+'" placeholder="8:45 AM" autocomplete="off" '+
   (enabled?'required':'disabled')+'><select name="'+preset+'" aria-label="'+esc(label)+' hourly presets"'+
   (enabled?'':' disabled')+'>'+opt('','Select hour','')+options+'</select></div></div>';
 };
 const employee=d.employeeType&&d.employeeId?d.employeeType+':'+d.employeeId:'';
 return '<div class="tt-admin-editor-backdrop" data-tt-admin-backdrop>'+
 '<form id="tt-attendance-admin-form" class="tt-admin-editor" role="dialog" aria-modal="true" aria-labelledby="tt-admin-editor-title" data-tt-admin-dialog data-mode="manual"'+(activeOnly?' data-active-only="true"':'')+'>'+ 
 '<header class="tt-admin-editor-head"><div class="tt-admin-editor-title-group"><span class="tt-admin-eyebrow">SYSTEM ADMIN · MANUAL ATTENDANCE</span><h3 id="tt-admin-editor-title">Add Attendance Log</h3><p>'+ (activeOnly?'Start a missed employee clock-in in Philippine time.':'Register a missed clock-in or clock-out in Philippine time.')+'</p></div>'+
 '<button type="button" class="tt-admin-close" data-action="tt-log-admin-cancel" aria-label="Close editor"'+(busy?' disabled':'')+'>×</button></header>'+
 (error?'<p class="tt-admin-error" role="alert">'+esc(error)+'</p>':'')+
 (!ready?'<p class="tt-admin-error" role="status">'+(editor.uncertain?'Save confirmation uncertain. Refresh the Log before retrying.':'Manual entry service is not verified. Preview only; saving is disabled.')+'</p>':'')+
 '<fieldset class="tt-admin-editor-fields"'+(busy?' disabled':'')+'><div class="tt-admin-editor-body">'+
 '<section class="tt-admin-field-section"><h4>Employee and attendance</h4><label class="tt-admin-field"><span>'+ (regularOnly?'Employee':'Employee or intern')+'</span><select name="employee" required>'+
 opt('','Select employee…',employee)+(editor.roster||[]).filter(m=>!regularOnly||m.type==='regular').map(m=>opt(m.type+':'+m.id,m.name+(m.type==='ojt'?' (OJT)':''),employee)).join('')+'</select></label>'+
 '<div class="tt-admin-grid tt-admin-grid-two">'+input('Attendance date','date','date',date,'required max="'+today+'" data-previous-date="'+esc(date)+'"'+(activeOnly?' readonly':''))+
 '<label class="tt-admin-field"><span>Session status</span><select name="status" required><option value="active"'+(status==='active'?' selected':'')+(policy.activeAllowed?'':' disabled')+'>Active / Ongoing</option>'+
 (activeOnly?'':opt('completed','Completed',status))+'</select></label>'+
 timeInput('Clock-in time','clockInTime',d.clockInTime||'')+'</div>'+
 '<p data-tt-manual-policy>'+(activeOnly?'Active same-day regular employee sessions only.':policy.activeAllowed?'Today: active or completed.':'Past attendance must be completed; future dates are not permitted.')+'</p>'+
 '<div class="tt-admin-grid tt-admin-grid-two" data-tt-manual-out'+(completed?'':' hidden style="display:none"')+'>'+
 input('Clock-out date','clockOutDate','date',completed?(d.clockOutDate||date):'','min="'+esc(date)+'" max="'+today+'" '+(completed?'required':'disabled'))+
 timeInput('Clock-out time','clockOutTime',completed?(d.clockOutTime||''):'',completed)+'</div></section>'+
 '<section class="tt-admin-field-section"><h4>Manual entry details</h4><label class="tt-admin-field"><span>Work location</span><select name="location" required>'+
 TT_MANUAL_LOCATIONS.map(v=>opt(v,v,d.location||TT_MANUAL_LOCATIONS[0])).join('')+'</select></label>'+
 '<label class="tt-admin-field" data-tt-manual-note'+(offsite?'':' hidden style="display:none"')+'><span>Work note / Work Plan (required)</span><textarea name="workNote" maxlength="500"'+(offsite?' required':' disabled')+'>'+esc(offsite?d.workNote:'')+'</textarea></label>'+
 '<label class="tt-admin-field"><span>Reason for manual entry</span><textarea name="reason" maxlength="500" required>'+esc(d.reason)+'</textarea></label><p>No GPS coordinates will be fabricated. Manual attendance is audited by the signed service.</p></section>'+
 '</div></fieldset><footer class="tt-admin-editor-actions"><span class="tt-admin-editor-footnote">'+(activeOnly?'The employee can end this session from their own Clock screen.':'Past logs must be completed. Active logs can only start today.')+'</span><div>'+
 '<button type="button" class="secondary" data-action="tt-log-admin-cancel"'+(busy?' disabled':'')+'>Cancel</button><button type="submit"'+(!ready||busy?' disabled':'')+'>Save Attendance Log</button></div></footer></form></div>';
}
export function validateManualAttendanceForm(form,editor,now=new Date()){
 if(editor?.signedCreateReady!==true||editor.uncertain)throw Error('Signed manual attendance creation is unavailable.');
 const entry=buildManualAttendanceEntry(syncManualAttendanceForm(form,now),{now,roster:editor.roster});
 if((editor.regularOnly||editor.activeOnly)&&entry.employeeType!=='regular')
  throw Error('Only regular employees are supported by this manual attendance service.');
 if(editor.activeOnly&&entry.status!=='active')
  throw Error('Only regular employee active clock-ins are supported.');
 return entry;
}
