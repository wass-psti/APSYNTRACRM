/** Isolated UI for TimeTracker > Employees > Add department.
 * Signed catalog mutations remain owned by the caller, not this dialog.
 */
export function validateTimeTrackerNewDepartmentName(raw, existingDepartments=[]) {
 const name=String(raw??'').trim();
 if(!name)return 'Department name is required.';
 // The deployed TimeTracker policy and SQL require 2–60 characters.
 if(name.length<2)return 'Department name must contain at least 2 characters.';
 if(name.length>60)return 'Department name cannot exceed 60 characters.';
 if(/[\u0000-\u001f\u007f]/.test(name))return 'Department name contains invalid characters.';
 if(existingDepartments.some(item=>
  String(typeof item==='string'?item:item?.name||'').trim().toLocaleLowerCase()===
  name.toLocaleLowerCase()))
  return 'A department with this name already exists.';
 return '';
}

export function openTimeTrackerAddDepartmentModal({
 existingDepartments=[],trigger=null,onSubmit=async()=>{},onSuccess=()=>{},
 onError=()=>{},onClose=()=>{}
}={}) {
 const doc=trigger?.ownerDocument||globalThis.document;
 if(!doc?.createElement||!doc.body)throw Error('Add department requires a browser document');
 const backdrop=doc.createElement('div');
 backdrop.className='modal-backdrop tt-add-department-backdrop';
 backdrop.setAttribute('role','presentation');
 backdrop.innerHTML=[
  '<section class="modal tt-add-department-modal" role="dialog" aria-modal="true" ',
   'aria-labelledby="tt-add-department-title" aria-describedby="tt-add-department-info" tabindex="-1">',
   '<header class="modal-head tt-add-department-head">',
    '<h2 id="tt-add-department-title">Add department</h2>',
    '<button type="button" class="tt-add-department-close" data-tt-department-dismiss ',
     'aria-label="Close dialog">',
     '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" ',
      'stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">',
      '<path d="M18 6 6 18M6 6l12 12"/></svg>',
    '</button>',
   '</header>',
   '<p class="tt-add-department-info" id="tt-add-department-info">',
    '<span class="tt-add-department-info-icon" aria-hidden="true">i</span>',
    '<span>New departments become available immediately for assigning employees in this workspace.</span>',
   '</p>',
   '<form class="tt-add-department-form" novalidate>',
    '<div class="tt-add-department-field">',
     '<label for="tt-add-department-name">Department name ',
      '<span class="tt-add-department-required" aria-hidden="true">*</span></label>',
     '<input type="text" id="tt-add-department-name" name="departmentName" ',
      'placeholder="e.g. Customer Support" autocomplete="off" required minlength="2" ',
      'aria-describedby="tt-add-department-error" aria-invalid="false">',
     '<p id="tt-add-department-error" class="tt-add-department-error" role="alert" hidden></p>',
    '</div>',
    '<div class="modal-actions tt-add-department-actions">',
     '<button type="button" class="tt-add-department-cancel" data-tt-department-dismiss>Cancel</button>',
     '<button type="submit" class="tt-add-department-primary" disabled aria-disabled="true">',
      '<span class="tt-add-department-spinner" aria-hidden="true" hidden></span>',
      '<span class="tt-add-department-submit-label">Add department</span>',
     '</button>',
    '</div>',
   '</form>',
  '</section>'
 ].join('');
 const panel=backdrop.querySelector('[role="dialog"]');
 const form=backdrop.querySelector('form');
 const input=backdrop.querySelector('#tt-add-department-name');
 const error=backdrop.querySelector('#tt-add-department-error');
 const submitButton=backdrop.querySelector('[type="submit"]');
 const closeButton=backdrop.querySelector('.tt-add-department-close');
 const cancelButton=backdrop.querySelector('.tt-add-department-cancel');
 const spinner=backdrop.querySelector('.tt-add-department-spinner');
 const submitLabel=backdrop.querySelector('.tt-add-department-submit-label');
 let busy=false,touched=false,closed=false;

 function showError(message='') {
  error.textContent=message;
  error.hidden=!message;
  input.setAttribute('aria-invalid',String(!!message));
 }
 function updateState() {
  if(closed)return;
  const empty=!input.value.trim();
  submitButton.disabled=busy||empty;
  submitButton.setAttribute('aria-disabled',String(submitButton.disabled));
  if(touched&&!busy)showError(validateTimeTrackerNewDepartmentName(
   input.value,existingDepartments));
  else if(!busy)showError('');
 }
 function setBusy(next) {
  busy=next;
  panel.setAttribute('aria-busy',String(busy));
  input.disabled=busy;
  closeButton.disabled=busy;
  cancelButton.disabled=busy;
  spinner.hidden=!busy;
  submitLabel.textContent=busy?'Adding…':'Add department';
  updateState();
  if(busy)panel.focus();
 }
 function close() {
  if(closed||busy)return;
  closed=true;
  backdrop.remove();
  onClose();
  const restore=trigger?.isConnected?trigger:
   doc.querySelector('[data-action="tt-departments-add"]');
  restore?.focus?.();
 }
 input.addEventListener('input',updateState);
 input.addEventListener('blur',()=>{touched=true;updateState();});
 backdrop.addEventListener('click',event=>{
  if(event.target.closest?.('[data-tt-department-dismiss]')){close();return;}
  // Do not discard a partially entered department by clicking outside.
  if(event.target===backdrop&&!input.value.trim())close();
 });
 backdrop.addEventListener('keydown',event=>{
  if(event.key==='Escape'){
   event.preventDefault();event.stopPropagation();close();return;
  }
  if(event.key!=='Tab')return;
  const focusable=[...panel.querySelectorAll('button:not([disabled]),input:not([disabled])')];
  if(!focusable.length){event.preventDefault();panel.focus();return;}
  if(event.shiftKey&&doc.activeElement===focusable[0]){
   event.preventDefault();focusable.at(-1).focus();
  }else if(!event.shiftKey&&doc.activeElement===focusable.at(-1)){
   event.preventDefault();focusable[0].focus();
  }
 });
 form.addEventListener('submit',async event=>{
  event.preventDefault();
  if(busy||closed)return;
  touched=true;
  const message=validateTimeTrackerNewDepartmentName(input.value,existingDepartments);
  if(message){showError(message);input.focus();return;}
  setBusy(true);
  try {
   // Existing caller still owns workspace verification and the Supabase RPC.
   await onSubmit(new FormData(form));
   setBusy(false);
   close();
   onSuccess();
  } catch (reason) {
   setBusy(false);
   showError(reason?.message||'Unable to add department. Try again.');
   onError(reason);
   input.focus();
  }
 });
 doc.body.append(backdrop);
 updateState();
 input.focus();
 return backdrop;
}
