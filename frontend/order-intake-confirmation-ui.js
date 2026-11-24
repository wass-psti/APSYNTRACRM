import {CONFIRMATION_CURRENCIES,CONFIRMATION_ENTITIES,CONFIRMATION_SIGNATORIES,confirmationEntity,buildConfirmation} from './order-intake-confirmation.js';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
const input=(label,name,value='',type='text',readonly=false)=>'<label>'+esc(label)+'<input name="'+name+'" type="'+type+'" value="'+esc(value)+'"'+(readonly?' readonly':'')+' required></label>';
const select=(label,name,options,selected='',disabled=false)=>'<label>'+esc(label)+'<select name="'+name+'"'+(disabled?' disabled':'')+' required><option value="">Select '+esc(label.toLowerCase())+'</option>'+options.map(([value,title])=>'<option value="'+esc(value)+'"'+(selected===value?' selected':'')+'>'+esc(title)+'</option>').join('')+'</select></label>';
function itemRow(index){
 return '<fieldset class="oi-confirmation-item" data-oi-confirmation-item><legend>Item '+index+'</legend>'+input('Description','description')+input('Quantity','quantity','1')+input('Unit','unit','pc')+input('VAT-inclusive unit price','unitPrice')+'<button type="button" class="secondary" data-oi-remove-item>Remove item</button></fieldset>';
}
export function confirmationFields(row){
 const entity=confirmationEntity(row);
 return '<div class="oi-confirmation-form"><p>PO '+esc(row.po_number)+' · Revision '+row.revision+' · Recorded amount: '+esc(row.currency||'Unknown currency')+' '+esc(row.po_amount??'Unavailable')+'</p>'+
 '<p>Document-only details do not change the order. Item prices are VAT-inclusive. The selected signatory is printed as a name, not an applied signature.</p>'+
 select('Issuing entity','entity',CONFIRMATION_ENTITIES.map(e=>[e.id,e.name]),entity,Boolean(entity))+
 (!entity?'<label><input type="checkbox" name="confirmEntity"> I verified the issuing legal entity against the original PO.</label>':'')+
 input('Client name','client',row.client_name||'','text',Boolean(row.client_name))+
 input('PO date','poDate',row.po_date||'','date',Boolean(row.po_date))+
 input('Delivery date','deliveryDate',row.delivery_date||'','date',Boolean(row.delivery_date))+
 select('Currency','currency',CONFIRMATION_CURRENCIES.map(c=>[c,c]),row.currency||'',Boolean(row.currency))+
 input('VAT rate (%)','vatRate',row.vat_rate??'','text',row.vat_rate!=null)+
 (row.record_kind==='legacy'?'<label><input name="confirmHistorical" type="checkbox"> I verified any missing historical details against the original purchase order.</label>':'')+
 '<label>Quotation reference<input name="quotation"></label><div data-oi-confirmation-items>'+itemRow(1)+'</div><button type="button" class="secondary" data-oi-add-item>Add item</button>'+
 '<label>Payment terms<textarea name="payment" required maxlength="1000" rows="2"></textarea></label><label>Warranty terms<textarea name="warranty" required maxlength="2000" rows="3"></textarea></label>'+
 select('Signatory','signatory',CONFIRMATION_SIGNATORIES.map(s=>[s,s]))+
 '<p data-oi-confirmation-summary role="status"></p></div>';
}
export function readConfirmationForm(form,row){
 const values=Object.fromEntries(new FormData(form));
 return {...values,entity:confirmationEntity(row)||values.entity,currency:row.currency||values.currency,
 items:[...form.querySelectorAll('[data-oi-confirmation-item]')].map(el=>Object.fromEntries([...el.querySelectorAll('input')].map(input=>[input.name,input.value])))};
}
export function bindConfirmationForm(form,row){
 const container=form.querySelector('[data-oi-confirmation-items]');
 const summary=form.querySelector('[data-oi-confirmation-summary]');
 function update(){
  try{const doc=buildConfirmation(row,readConfirmationForm(form,row));summary.textContent='Reconciled: '+doc.currency+' '+doc.total+' · VAT '+doc.vatAmount;}
  catch(error){summary.textContent=error.message;}
 }
 form.addEventListener('input',update);
 form.addEventListener('change',update);
 form.addEventListener('click',event=>{
  if(event.target.closest('[data-oi-add-item]')&&container.children.length<100){container.insertAdjacentHTML('beforeend',itemRow(container.children.length+1));update();}
  const remove=event.target.closest('[data-oi-remove-item]');
  if(remove&&container.children.length>1){remove.closest('[data-oi-confirmation-item]').remove();[...container.children].forEach((item,i)=>item.querySelector('legend').textContent='Item '+(i+1));update();}
 });
 update();
}
