/** FRT reference-aligned three-step request wizard; DOM-only, no RPC or persistence. */
const esc=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const field=(label,name,{type='text',required=false,placeholder='',max=180}={})=>
 `<div class="frt-wizard-field"><label for="frt-wizard-${name}">${esc(label)}${required?' <b aria-hidden="true">*</b>':''}</label>`+
 `<input id="frt-wizard-${name}" name="${name}" type="${type}" ${required?'required':''} maxlength="${max}" placeholder="${esc(placeholder)}" autocomplete="off"/></div>`;
const category=(number)=>`<div class="frt-wizard-expense" data-expense-index="${number}">
 <div class="frt-wizard-expense-heading"><span class="frt-wizard-index">${number}</span><strong>Expense Item</strong>
 ${number>1?'<button type="button" class="frt-wizard-remove" data-frt-remove-expense aria-label="Remove expense item '+number+'">Remove</button>':''}</div>
 <div class="frt-wizard-grid"><div class="frt-wizard-field"><label for="frt-expense-category-${number}">Category <b aria-hidden="true">*</b></label>
 <input id="frt-expense-category-${number}" name="expenseCategory" required maxlength="180" placeholder="Expense category" autocomplete="off"/></div>
 <div class="frt-wizard-field"><label for="frt-expense-amount-${number}">Amount (PHP) <b aria-hidden="true">*</b></label>
 <input id="frt-expense-amount-${number}" name="expenseAmount" required inputmode="decimal" placeholder="0.00" pattern="[0-9]+(\\.[0-9]{1,2})?" autocomplete="off"/></div></div></div>`;
export function renderFRTRequestWizard({companies=[],selectedCompany=''}={}){
 const options=companies.filter(c=>/^[A-Za-z0-9_-]{1,32}$/.test(c?.code||'')).map(c=>
  `<option value="${esc(c.code)}"${c.code===selectedCompany?' selected':''}>${esc(c.name||c.code)}</option>`).join('');
 return `<div class="frt-wizard-intro"><p>Set up basic request information</p><span class="frt-wizard-status">Filing status: Not Filed</span></div>
 <div class="frt-wizard-steps" aria-label="New Fund Request steps">
 <div data-frt-step-indicator="1" class="is-active"><span>1</span><strong>Basic Info</strong></div>
 <div data-frt-step-indicator="2"><span>2</span><strong>Recipient</strong></div>
 <div data-frt-step-indicator="3"><span>3</span><strong>Details</strong></div></div>
 <div class="frt-wizard-scroll">
 <section class="frt-wizard-page" data-frt-step="1" aria-label="Basic Info">
 <div class="frt-wizard-grid"><div class="frt-wizard-field"><label for="frt-wizard-company">Company Account <b aria-hidden="true">*</b></label>
 <select id="frt-wizard-company" name="companyCode" required>${options}</select></div>
 ${field('Date Needed','dateNeeded',{type:'date',required:true})}</div>
 ${field('Fund Source Account','fundSource',{required:true,placeholder:'Enter the fund source'})}
 <fieldset class="frt-wizard-expenses"><legend>Expense Categories</legend><div data-frt-expenses>${category(1)}</div>
 <button type="button" class="frt-wizard-add" data-frt-add-expense>＋ Add Category</button>
 <p class="frt-wizard-helper">Complete each expense category and amount before continuing.</p></fieldset>
 ${field('Check # (optional)','checkNo',{placeholder:'Enter check number'})}
 </section>
 <section class="frt-wizard-page" data-frt-step="2" aria-label="Recipient" hidden>
 <p class="frt-wizard-section-lead">Configure payment recipient</p>
 ${field('Payee / Supplier','recipientName',{placeholder:'Search or type payee name'})}
 <div class="frt-wizard-field"><label for="frt-wizard-saved-recipient">Select Saved Account</label>
 <select id="frt-wizard-saved-recipient" data-frt-saved-recipient disabled><option value="">Loading saved accounts…</option></select></div>
 <div class="frt-wizard-divider"></div>
 <div class="frt-wizard-grid">${field('Account Name','recipientAccountName',{placeholder:'Account holder for saved account'})}
 ${field('Bank','recipientBank',{placeholder:'Bank name (optional)'})}</div>
 ${field('Account Number','recipientAccount',{placeholder:'Account number (optional)'})}
 <div class="frt-wizard-recipient-actions"><button type="button" class="secondary" data-frt-save-recipient disabled>Save Recipient Account</button>
 <span data-frt-recipient-status role="status" aria-live="polite">Checking saved-account availability…</span></div>
 <div class="frt-wizard-field"><label for="frt-wizard-qr-file">QR Code <small>Optional · private PNG, JPEG or WebP, up to 3 MB</small></label>
 <input id="frt-wizard-qr-file" type="file" accept="image/png,image/jpeg,image/webp" data-frt-qr-file disabled />
 <button type="button" class="secondary" data-frt-upload-qr disabled>Upload QR to saved recipient</button>
 <button type="button" class="secondary" data-frt-preview-qr disabled>View private QR</button></div>
 <p class="frt-wizard-helper">Choose or save a recipient account before attaching a QR. The QR is private and belongs to the saved recipient; the signed request stores recipient, bank and account details.</p>
 </section>
 <section class="frt-wizard-page" data-frt-step="3" aria-label="Details" hidden>
 <p class="frt-wizard-section-lead">Add description and references</p>
 ${field('Fund Request Name','requestName',{required:true,placeholder:'Request title'})}
 ${field('Department','department',{required:true,placeholder:'Enter department'})}
 <div class="frt-wizard-field"><label for="frt-wizard-description">Expense Description <b aria-hidden="true">*</b></label>
 <textarea id="frt-wizard-description" name="description" rows="4" required maxlength="2500" placeholder="Describe the purpose, project details, or requirements..."></textarea><small>Provide context and justification for this expense</small></div>
 <div class="frt-wizard-grid">${field('Order / Project No. (optional)','orderIntakeNo',{placeholder:'e.g., OI-2026-001'})}
 <div class="frt-wizard-field"><label>Check Number <small>Optional</small></label><div class="frt-wizard-optional-note">Set in Basic Info</div></div></div>
 <div class="frt-wizard-field"><label for="frt-on-behalf-disabled">On Behalf Of <small>Optional</small></label><input id="frt-on-behalf-disabled" disabled placeholder="Proxy submission not connected"/></div>
 <p class="frt-wizard-helper">Submitting creates one signed financial request, with the initial filing status Not Filed.</p>
 </section></div>
 <div class="frt-wizard-counter" role="status" aria-live="polite">Step 1 of 3 · Basic Info</div>`;
}
export function enhanceFRTRequestWizard(view){
 if(!view?.querySelector('[data-frt-step]'))return null;
 view.classList.add('frt-wizard-backdrop');
 const dialog=view.querySelector('.modal');
 dialog?.classList.add('frt-wizard-modal');
 const form=view.querySelector('#modal-form'),footer=view.querySelector('.modal-actions');
 const submit=footer?.querySelector('[type="submit"]');
 if(!form||!footer||!submit)return null;
 const back=document.createElement('button');back.type='button';back.className='secondary frt-wizard-back';back.textContent='‹ Back';back.hidden=true;
 const next=document.createElement('button');next.type='button';next.className='primary frt-wizard-next';next.textContent='Continue ›';
 footer.insertBefore(back,submit);footer.insertBefore(next,submit);
 let step=1,entry=1;
 const show=()=>{
  for(const section of view.querySelectorAll('[data-frt-step]'))section.hidden=Number(section.dataset.frtStep)!==step;
  for(const indicator of view.querySelectorAll('[data-frt-step-indicator]')){
   const current=Number(indicator.dataset.frtStepIndicator);
   indicator.classList.toggle('is-active',current===step);
   indicator.classList.toggle('is-complete',current<step);
  }
  back.hidden=step===1;next.hidden=step===3;submit.hidden=step!==3;
  const name=['Basic Info','Recipient','Details'][step-1];
  view.querySelector('.frt-wizard-counter').textContent=`Step ${step} of 3 · ${name}`;
  view.querySelector('.frt-wizard-intro p').textContent=['Set up basic request information','Configure payment recipient','Add description and references'][step-1];
  const scroller=view.querySelector('.frt-wizard-scroll');if(scroller)scroller.scrollTop=0;
 };
 const currentFields=()=>[...view.querySelectorAll(`[data-frt-step="${step}"] input:not(:disabled),[data-frt-step="${step}"] select:not(:disabled),[data-frt-step="${step}"] textarea:not(:disabled)`)];
 const validate=()=>{
  for(const control of currentFields()){
   if(!control.checkValidity()){control.reportValidity();control.focus();return false;}
  }
  if(step===1){
   const amounts=[...view.querySelectorAll('[name="expenseAmount"]')];
   for(const control of amounts){
    const amount=Number(control.value);
    if(!Number.isFinite(amount)||amount<=0||amount>999999999999.99){
     control.setCustomValidity('Enter a positive expense amount.');control.reportValidity();control.focus();return false;
    }
    control.setCustomValidity('');
   }
  }
  return true;
 };
 next.addEventListener('click',()=>{if(!validate())return;step=Math.min(3,step+1);show();});
 back.addEventListener('click',()=>{step=Math.max(1,step-1);show();});
 view.addEventListener('click',event=>{
  if(event.target.closest('[data-frt-add-expense]')){
   if(!validate()||step!==1)return;
   const host=view.querySelector('[data-frt-expenses]');
   if(host.children.length>=100)return;
   entry++;host.insertAdjacentHTML('beforeend',category(entry));
   host.lastElementChild.querySelector('input')?.focus();
  }
  const remove=event.target.closest('[data-frt-remove-expense]');
  if(remove){remove.closest('.frt-wizard-expense')?.remove();}
 });
 view.addEventListener('input',event=>{if(event.target.matches('[name="expenseAmount"]'))event.target.setCustomValidity('');});
 form.addEventListener('keydown',event=>{
  if(event.key==='Enter'&&event.target.tagName!=='TEXTAREA'&&step<3){event.preventDefault();next.click();}
 });
 form.addEventListener('submit',event=>{
  if(step!==3||!validate()){event.preventDefault();event.stopImmediatePropagation();}
 },true);
 show();
 return {getStep:()=>step,validate};
}
export function collectFRTWizardRequest(formData){
 const categories=formData.getAll('expenseCategory').map(v=>String(v||'').trim());
 const amounts=formData.getAll('expenseAmount').map(v=>String(v||'').trim());
 if(!categories.length||categories.length!==amounts.length)throw Error('Expense lines are incomplete.');
 return {
  companyCode:String(formData.get('companyCode')||''),
  title:String(formData.get('requestName')||''),department:String(formData.get('department')||''),
  fundSource:String(formData.get('fundSource')||''),description:String(formData.get('description')||''),
  dateNeeded:String(formData.get('dateNeeded')||''),checkNo:String(formData.get('checkNo')||''),
  orderIntakeNo:String(formData.get('orderIntakeNo')||''),
  recipientName:String(formData.get('recipientName')||''),recipientBank:String(formData.get('recipientBank')||''),
  recipientAccount:String(formData.get('recipientAccount')||''),
  items:categories.map((category,i)=>({category,amount:amounts[i]}))
 };
}
