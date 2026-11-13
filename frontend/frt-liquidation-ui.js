/** Receipt form; no local-only financial save. */
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));
export function liquidationReceiptRow(receipt={},index=0){
 const fields=[
  ['description','Purpose','text',true,500],
  ['receiptDate','Receipt date','date',true,10],
  ['amount','Amount','text',true,24],
  ['orInvoiceNo','OR / Invoice reference','text',false,150],
  ['vendor','Vendor','text',false,250]
 ];
 return '<fieldset class="frt-receipt-row"><legend>Receipt '+(index+1)+'</legend>'+
 fields.map(([name,label,type,required,max])=>
  '<label class="field">'+escape(label)+'<input name="receipt_'+index+'_'+name+
  '" data-frt-receipt="'+name+'" type="'+type+'" maxlength="'+max+'"'+
  (required?' required':'')+' value="'+escape(receipt[name]||'')+'"></label>'
 ).join('')+'<button type="button" class="secondary" data-frt-receipt-remove>Remove receipt</button></fieldset>';
}
export function renderFRTLiquidationForm(snapshot){
 const list=snapshot.items.length?snapshot.items:[{}];
 return '<p class="note">Authoritative request amount: '+escape(snapshot.requestedAmount)+
  '. Saved liquidation: '+escape(snapshot.spentAmount)+
  '. Remaining: '+escape(snapshot.remainingAmount)+
  '. Reconciliation: '+escape(snapshot.reconciliationState||'NOT_SUBMITTED')+
  '. Submission changes financial records and remains subject to server authorization.</p>'+
  '<div data-frt-receipt-list>'+list.map(liquidationReceiptRow).join('')+'</div>'+
  '<button class="secondary" type="button" data-frt-receipt-add>Add another receipt</button>'+
  '<label class="field">Notes (optional)<textarea name="frtLiquidationNotes" maxlength="2000" rows="2">'+
  escape(snapshot.notes||'')+'</textarea></label>';
}
export function enhanceFRTLiquidationForm(modal){
 const list=modal?.querySelector('[data-frt-receipt-list]');
 if(!list)return;
 const renumber=()=>{
  [...list.querySelectorAll('.frt-receipt-row')].forEach((row,i)=>{
   row.querySelector('legend').textContent='Receipt '+(i+1);
   row.querySelectorAll('[data-frt-receipt]').forEach(input=>{
    input.name='receipt_'+i+'_'+input.dataset.frtReceipt;
   });
  });
 };
 modal.querySelector('[data-frt-receipt-add]')?.addEventListener('click',()=>{
  if(list.children.length>=100)return;
  list.insertAdjacentHTML('beforeend',liquidationReceiptRow({},list.children.length));
  list.lastElementChild?.querySelector('input')?.focus();
 });
 list.addEventListener('click',event=>{
  const remove=event.target.closest('[data-frt-receipt-remove]');
  if(!remove||list.children.length<=1)return;
  remove.closest('.frt-receipt-row')?.remove();renumber();
 });
}
export function collectFRTLiquidationForm(modal){
 const list=modal?.querySelector('[data-frt-receipt-list]');
 if(!list)throw Error('Liquidation form is unavailable.');
 const items=[...list.querySelectorAll('.frt-receipt-row')].map(row=>
  Object.fromEntries([...row.querySelectorAll('[data-frt-receipt]')].map(input=>
   [input.dataset.frtReceipt,input.value])));
 return {items,notes:modal.querySelector('[name="frtLiquidationNotes"]')?.value||''};
}
