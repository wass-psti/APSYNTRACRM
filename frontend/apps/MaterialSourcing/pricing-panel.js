/** CP-MS-CRM-04B.4: mounted, explicitly uncommitted exact decimal preview.
 * Server pricing context is loaded only on demand; legacy material saves remain independent.
 * No persisted commercial drafts, provider calls or inferred rates.
 */
import {authorizeMaterialSourcingViewer,authorizeMaterialSourcingItem,revalidateMaterialSourcingSession} from '../../material-sourcing-application.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const required=['quantity','buyingPrice','currency','shipping','shipCurrency','usd','eur'];
const inputKeys=['quantity','buyingPrice','currency','shipping','shipCurrency','source'];
const moneyLabels={php:'Buying cost (PHP/unit)',shipPhp:'Shipping (PHP/unit)',landed:'Landed cost (PHP/unit)',totalLanded:'Total landed (PHP)',selling:'Selling price (VAT-ex/unit)',vatIn:'Total selling (VAT-in)'};
const currencies=['PHP','USD','EUR'];
const idPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function scaled(value,places){
 const [whole,fraction='']=value.split('.');
 return BigInt(whole+fraction.padEnd(places,'0'));
}
function round(n,d){return (n+d/2n)/d;}
function cents(value){return value===null?null:(value/100n).toString()+'.'+(value%100n).toString().padStart(2,'0');}
export function calculatePricingPreview(inputs){
 const missing=[],invalid=[],numbers={};
 let sourceStatus='missing';
 const result=(status,costs=null)=>({formulaVersion:'mrh-pricing-v1',status,missing,invalid,sourceStatus,costs});
 if(!inputs||typeof inputs!=='object'||Array.isArray(inputs)){invalid.push('input');return result('invalid');}
 if(Object.keys(inputs).some(k=>![...required,'source'].includes(k)))invalid.push('unexpectedField');
 for(const key of required){
  const value=inputs[key];
  if(value===null||value===undefined){missing.push(key);continue;}
  if(typeof value!=='string'){invalid.push(key);continue;}
  if(key==='currency'||key==='shipCurrency'){
   if(!currencies.includes(value))invalid.push(key);
   continue;
  }
  const rate=key==='usd'||key==='eur',places=rate?8:6;
  const pattern=rate?/^(0|[1-9][0-9]{0,11})([.][0-9]{1,8})?$/:/^(0|[1-9][0-9]{0,13})([.][0-9]{1,6})?$/;
  // JS $ can match before a final newline, unlike the intended exact domain.
  if(value.length>21||!pattern.test(value)||/\s/.test(value)){invalid.push(key);continue;}
  const n=scaled(value,places);
  if((rate||key==='quantity')&&n===0n){invalid.push(key);continue;}
  numbers[key]=n;
 }
 const source=inputs.source;
 if(source!==null&&source!==undefined){
  if(typeof source!=='string'){sourceStatus='invalid';invalid.push('source');}
  else sourceStatus=source==='Local'||source==='Import'?'known':source==='Unknown'?'unknown':'unsupported';
 }
 if(invalid.length)return result('invalid');
 if(missing.length)return result('incomplete');
 const rate=c=>c==='USD'?numbers.usd:c==='EUR'?numbers.eur:100000000n;
 const buying=round(numbers.buyingPrice*rate(inputs.currency),1000000000000n);
 const shipping=round(numbers.shipping*rate(inputs.shipCurrency),1000000000000n);
 const landed=buying+shipping;
 const selling=sourceStatus==='known'?round(landed*(source==='Local'?130n:169n),100n):null;
 const vat=selling===null?null:round(selling*numbers.quantity*112n,100000000n);
 return result(sourceStatus==='known'?'complete':'partial',{
  php:cents(buying),shipPhp:cents(shipping),landed:cents(landed),
  totalLanded:cents(round(landed*numbers.quantity,1000000n)),selling:cents(selling),vatIn:cents(vat)
 });
}
const draftValue=v=>v===null||v===undefined?'':typeof v==='string'||typeof v==='number'?String(v):'';
const money=v=>typeof v==='string'&&/^[0-9]+\.[0-9]{2}$/.test(v)?'₱'+v.replace(/\B(?=(\d{3})+\.)/g,','):'—';
function costMarkup(result){
 return '<dl class="mrh-detail-field-grid">'+Object.entries(moneyLabels).map(([key,label])=>
  '<div class="mrh-detail-field"><dt>'+esc(label)+'</dt><dd>'+esc(money(result?.costs?.[key]))+'</dd></div>').join('')+'</dl>';
}
export function renderPricingHistory(history=[]){
 if(!history.length)return '<p>No saved pricing versions returned.</p>';
 return '<ol>'+history.map(v=>'<li><strong>'+esc(v.formulaVersion)+'</strong> · '+esc(v.recordedAt)+' · '+esc(v.calculation?.status)+
  '<p>Version '+esc(v.pricingVersionId)+'; FX '+esc(v.fxSnapshotId||'none')+'</p>'+costMarkup(v.calculation)+'</li>').join('')+'</ol>';
}
function previewMessage(result){
 if(result.status==='invalid')return 'Invalid preview inputs: '+result.invalid.join(', ')+'.';
 if(result.status==='incomplete')return 'Not calculated — missing '+result.missing.join(', ')+'.';
 return result.status==='partial'?'Preview only — source not classified; selling amounts are unavailable.':'Preview only — not a saved or authoritative price.';
}
const same=(a,b)=>{
 if(a===b)return true;
 if(!a||!b||typeof a!=='object'||typeof b!=='object')return false;
 const ak=Object.keys(a),bk=Object.keys(b);
 return ak.length===bk.length&&ak.every(k=>Object.hasOwn(b,k)&&same(a[k],b[k]));
};
function validContext(result,input,fx){
 return result&&result.workspaceId===input.workspaceId&&result.itemId===input.itemId&&
  result.state?.workspaceId===input.workspaceId&&result.state?.itemId===input.itemId&&
  result.state.fxSnapshotId===fx&&Array.isArray(result.snapshots)&&Array.isArray(result.history)&&
  result.inputs&&typeof result.inputs==='object'&&result.snapshots.every(s=>idPattern.test(s.snapshotId)&&
   ['legacy_unverified','provider_reported'].includes(s.provenance)&&typeof s.usd==='string'&&typeof s.eur==='string');
}
export function renderNativePricingPanel(row,cells){
 const fields={quantity:row?.quantity,source:row?.source,buyingPrice:cells?.['Buying Price']?.value,
  currency:cells?.Currency?.value,shipping:cells?.['Shipping Cost']?.value,
  shipCurrency:cells?.['Shipping Cost Currency']?.value,usd:cells?.['Ex. Rate USD']?.value,eur:cells?.['Ex. Rate EUR']?.value};
 const labels={quantity:'Quantity',source:'Source type',buyingPrice:'Buying price',currency:'Buying currency',
  shipping:'Shipping cost',shipCurrency:'Shipping currency',usd:'USD → PHP',eur:'EUR → PHP'};
 const select=(key,options)=>'<select data-pricing-field="'+key+'"><option value="">Not recorded</option>'+
  options.map(v=>'<option value="'+esc(v)+'"'+(fields[key]===v?' selected':'')+'>'+esc(v)+'</option>').join('')+'</select>';
 return '<section class="mrh-private-section mrh-calculated-section" aria-label="Pricing workspace"><h3>Pricing preview &amp; history</h3>'+
  '<p>Preview rates are editable for estimation only. No rate, calculated price or draft is stored by the preview. Load saved pricing to use an immutable FX snapshot.</p>'+
  '<p>Legacy manual selling price (VAT-ex): <strong data-pricing-manual>'+esc(draftValue(cells?.['Selling Price (VAT-EX)']?.value)||'—')+'</strong> (separate from calculated prices)</p>'+
  '<div class="mrh-private-grid">'+Object.keys(labels).map(key=>'<label class="mrh-sourcing-field"><span>'+labels[key]+'</span>'+
   (key==='source'?select(key,['Local','Import','Unknown']):key==='currency'||key==='shipCurrency'?select(key,currencies):
    '<input type="text" inputmode="decimal" maxlength="21" data-pricing-field="'+key+'" value="'+esc(draftValue(fields[key]))+'">')+'</label>').join('')+'</div>'+
  '<div data-pricing-result></div><p role="status" aria-live="polite" data-pricing-preview-status></p>'+
  '<button type="button" class="secondary" data-pricing-load>Load saved pricing &amp; FX</button>'+
  '<label>FX snapshot <select data-pricing-fx disabled><option value="">Manual preview only</option></select></label>'+
  '<button type="button" class="secondary" data-pricing-save hidden disabled>Save inputs and calculated pricing</button>'+
  '<p role="status" aria-live="polite" data-pricing-status>Saved pricing has not been loaded.</p>'+
  '<details><summary>Saved pricing history (latest 20)</summary><div data-pricing-history><p>Load saved pricing to view history.</p></div></details></section>';
}
/** Separate mounted draft; existing edit/save remains unchanged. An explicit load
 * may fail when the candidate API has not been deployed. Never fall back on writes.
 */
export function mountNativePricingPanel(host,{input,row,cells,canEdit,isCurrent,canSave,onBusy,onSaved}){
 host.innerHTML=renderNativePricingPanel(row,cells);
 const {api,auth}=input,actor=auth.userId;
 const field=k=>host.querySelector('[data-pricing-field="'+k+'"]');
 const status=host.querySelector('[data-pricing-status]'),fxSelect=host.querySelector('[data-pricing-fx]');
 const save=host.querySelector('[data-pricing-save]'),load=host.querySelector('[data-pricing-load]');
 const current=()=>host.isConnected&&isCurrent()&&auth.userId===actor;
 const values=()=>Object.fromEntries([...inputKeys,'usd','eur'].map(k=>[k,field(k).value||null]));
 let context=null,busy=false,dirty=false,unconfirmed=false;
 const preview=()=>{
  const result=calculatePricingPreview(values());
  host.querySelector('[data-pricing-result]').innerHTML=costMarkup(result);
  host.querySelector('[data-pricing-preview-status]').textContent=previewMessage(result);
  const source=field('source').value;
  const sourceWritable=source!=='Unknown'||context?.inputs?.source==='Unknown';
  save.disabled=busy||unconfirmed||!context?.state?.fxSnapshotId||!sourceWritable||!['complete','partial'].includes(result.status);
  return result;
 };
 const setBusy=v=>{
  busy=v;load.disabled=v;fxSelect.disabled=v||!context;
  for(const key of inputKeys)field(key).disabled=v;
  for(const key of ['usd','eur'])field(key).disabled=v||!!fxSelect.value;
  preview();
 };
 async function read(fx,version=null){
  const who=await authorizeMaterialSourcingViewer(input);
  if(!current()||who!==actor)throw Error('Session changed.');
  const response=await api.rpc('mrh_pricing_context',{p_item:input.itemId,p_fx:fx,p_version:version});
  await revalidateMaterialSourcingSession(input,actor);
  if(!current()||!validContext(response,input,fx))throw Error('Pricing response could not be verified.');
  return response;
 }
 function apply(result,fx,initialize){
  context=result;
  fxSelect.innerHTML='<option value="">Manual preview only</option>'+result.snapshots.map(s=>
   '<option value="'+esc(s.snapshotId)+'">'+esc(s.provenance+' · USD '+s.usd+' / EUR '+s.eur+' · '+s.snapshotId)+'</option>').join('');
  fxSelect.value=fx||'';
  if(fx&&fxSelect.value!==fx)throw Error('Selected FX snapshot is unavailable.');
  if(initialize&&!dirty)for(const key of inputKeys){
   const v=result.inputs[key];
   if(v===null||typeof v==='string')field(key).value=v??'';
  }
  if(fx){
   const snapshot=result.snapshots.find(s=>s.snapshotId===fx);
   field('usd').value=snapshot.usd;field('eur').value=snapshot.eur;
  }
  if(result.manualSelling!==undefined)host.querySelector('[data-pricing-manual]').textContent=result.manualSelling??'—';
  host.querySelector('[data-pricing-history]').innerHTML=renderPricingHistory(result.history);
  save.hidden=!canEdit;
 }
 async function reload(fx){
  if(!current()||busy)return;
  setBusy(true);status.textContent='Loading signed pricing context…';
  try{
   const result=await read(fx);
   if(!current())return;
   apply(result,fx,true);unconfirmed=false;
   status.textContent=dirty?'Latest saved state loaded. Review your retained preview inputs before saving.':'Saved pricing context loaded. Select a stored FX snapshot to save pricing.';
  }catch{
   if(!current())return;
   context=null;fxSelect.value='';save.hidden=true;
   status.textContent='Saved pricing unavailable for this item or not activated. Preview remains available; no pricing write was attempted.';
  }finally{if(current())setBusy(false);}
 }
 host.addEventListener('input',event=>{
  if(event.target.matches('[data-pricing-field]')){dirty=true;preview();}
 });
 host.addEventListener('change',event=>{
  if(event.target.matches('[data-pricing-field]')){dirty=true;preview();}
 });
 load.addEventListener('click',()=>void reload(fxSelect.value||null));
 fxSelect.addEventListener('change',()=>void reload(fxSelect.value||null));
 save.addEventListener('click',async()=>{
  if(!current()||busy||!canEdit||!context||!context.state.fxSnapshotId||!canSave()) {
   if(current())status.textContent='Finish the current material edit before saving pricing.';
   return;
  }
  const calculated=preview();
  if(!['complete','partial'].includes(calculated.status))return;
  const fx=context.state.fxSnapshotId,expected=context.state;
  const draft=Object.fromEntries(inputKeys.map(k=>[k,field(k).value||null]));
  let attempted=false,verified=false;
  setBusy(true);onBusy(true);status.textContent='Saving pricing atomically…';
  try{
   const who=await authorizeMaterialSourcingItem({...input,edit:true});
   await revalidateMaterialSourcingSession(input,actor);
   if(!current()||who!==actor)throw Error('Session changed.');
   attempted=true;
   const receipt=await api.rpc('mrh_save_pricing_atomic',{p_item:input.itemId,p_fx:fx,p_expected:expected,p_draft:draft});
   await revalidateMaterialSourcingSession(input,actor);
   if(!current())return;
   if(receipt?.itemId!==input.itemId||receipt?.workspaceId!==input.workspaceId||receipt?.fxSnapshotId!==fx||
    !idPattern.test(receipt?.pricingVersionId||'')||!same(receipt.calculation,calculated))throw Error('Pricing receipt mismatch.');
   const result=await read(fx,receipt.pricingVersionId);
   if(!same(result.receipt,receipt))throw Error('Saved version readback mismatch.');
   verified=true;
   if(!current())return;
   dirty=false;apply(result,fx,true);
   status.textContent='Saved and verified pricing version '+receipt.pricingVersionId+'.';
   await onSaved();
  }catch{
   if(current()){
    unconfirmed=attempted&&!verified;
    status.textContent=verified?'Pricing saved and verified; reopen the material details to refresh the other fields.':attempted?'Save not confirmed. Your draft is retained. Load saved pricing and review history before retrying.':'Pricing save could not start. Your draft is retained.';
   }
  }finally{if(current()){onBusy(false);setBusy(false);}}
 });
 preview();
 return {preview,updateStored(nextRow,nextCells){
  if(!current()||busy)return;
  const updated={quantity:nextRow?.quantity,source:nextRow?.source,
   buyingPrice:nextCells?.['Buying Price']?.value,currency:nextCells?.Currency?.value,
   shipping:nextCells?.['Shipping Cost']?.value,shipCurrency:nextCells?.['Shipping Cost Currency']?.value,
   usd:nextCells?.['Ex. Rate USD']?.value,eur:nextCells?.['Ex. Rate EUR']?.value};
  // Ordinary material writes invalidate a previously loaded exact baseline.
  // Preserve a modified pricing draft rather than overwriting user input.
  context=null;fxSelect.value='';fxSelect.disabled=true;save.hidden=true;
  field('usd').disabled=false;field('eur').disabled=false;
  if(!dirty)for(const key of Object.keys(updated))field(key).value=draftValue(updated[key]);
  host.querySelector('[data-pricing-manual]').textContent=draftValue(nextCells?.['Selling Price (VAT-EX)']?.value)||'—';
  status.textContent=dirty?'Material values refreshed. Pricing draft retained; load saved pricing to review the latest baseline.':'Material values refreshed. Load saved pricing to obtain an exact baseline.';
  preview();
 }};
}
