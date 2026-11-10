/** FuelTrack+ v3 request composition surface.
 * Submission is gated by a verified signed FuelTrack snapshot and Board view access.
 * Private receipt attachments are restricted to the later refueling lifecycle.
 */
import {FUELTRACK_PLATE_OPTIONS,FUELTRACK_PERSON_OPTIONS,FUELTRACK_CONTAINER_OPTIONS} from './fueltrack-v3-reference-options.js';
const h=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const input=(id,label,{type='text',placeholder='',required=false,min=null,step=null,maxlength=null}={})=>
 '<label class="ft3-new-field" for="'+id+'"><span>'+h(label)+(required?' <b aria-label="required">*</b>':'')+'</span>'+
 '<input id="'+id+'" name="'+id+'" type="'+type+'" placeholder="'+h(placeholder)+'"'+
 (min!==null?' min="'+h(min)+'"':'')+(step!==null?' step="'+h(step)+'"':'')+
 (maxlength!==null?' maxlength="'+h(maxlength)+'"':'')+' autocomplete="off"></label>';
const select=(id,label,placeholder,options)=>
 '<label class="ft3-new-field" for="'+id+'"><span>'+h(label)+' <b aria-label="required">*</b></span>'+
 '<select id="'+id+'" name="'+id+'" aria-required="true">'+
 '<option value="" selected disabled>'+h(placeholder)+'</option>'+
 options.map(value=>'<option value="'+h(value)+'">'+h(value)+'</option>').join('')+
 (id==='ft3-quantity'?'<option value="custom">Custom number of containers</option>':'')+
 '</select></label>';
const textArea=()=>'<label class="ft3-new-field ft3-new-wide" for="ft3-purpose"><span>Purpose <b aria-label="required">*</b></span>'+
 '<textarea id="ft3-purpose" name="purpose" rows="4" maxlength="500" placeholder="Describe the purpose of this fuel request"></textarea></label>';
const section=(number,title,body)=>'<section class="ft3-new-panel"><h3><span class="ft3-new-index">'+number+'</span>'+h(title)+'</h3>'+
 '<div class="ft3-new-fields">'+body+'</div></section>';
const mode=(id,title,subtitle,icon)=>
 '<label class="ft3-new-option" for="ft3-mode-'+id+'">'+
 '<input type="radio" name="ft3-fuel-mode" id="ft3-mode-'+id+'" value="'+id+'"'+(id==='vehicle'?' checked':'')+'>'+
 '<span class="ft3-new-option-body"><span class="ft3-new-option-icon" aria-hidden="true">'+icon+'</span><strong>'+title+'</strong><small>'+subtitle+'</small></span></label>';
export function renderFuelTrackNewRequest({enabled=false,busy=false,message='',receiptHref=null}={}){
 // A receipt is a post-refueling artifact. Never imply a file chosen here was
 // uploaded, retained or registered before the server permits registration.
 const receipt=()=>'<div class="ft3-new-field ft3-new-wide ft3-new-receipt-info">'+
 '<span>Receipt Photo (Optional — after refueling)</span>'+
 '<p>Submit this fuel request first. Once approved and marked Refueling Done, an authorized Admin can upload the private receipt in LightFuels.</p>'+
 (enabled&&receiptHref?'<a class="ft3-receipt-action" href="'+h(receiptHref)+'">Capture Receipt / Photo in LightFuels</a>':'')+
 '</div>';
 const purpose=section(3,'Justification',textArea()+receipt());
 return '<section class="ft3-new-request" aria-labelledby="ft3-new-title">'+
 '<header class="ft3-new-title"><h2 id="ft3-new-title">New Fuel Request</h2>'+
 '<p>Choose a refuel type, complete the required fields, then submit a signed request for approval. Receipt photos are added after physical refueling.</p></header>'+
 '<div class="ft3-new-progress" aria-label="Request steps"><span>Vehicle / Container Details</span><span>Trip Information</span><span>Justification</span></div>'+
 (enabled?'<form id="ft3-new-request-form" class="ft3-new-composer">':'<div class="ft3-new-composer">')+
 '<div class="ft3-new-panel ft3-new-type" role="group" aria-label="Select Refuel Type"><h3>Select Refuel Type</h3>'+
 '<div class="ft3-new-options">'+mode('vehicle','Vehicle Fuel','Cars, trucks, motorcycles','⛽')+
 mode('container','Container Refill','Drums, canisters, tanks','⬡')+'</div></div>'+
 '<p class="ft3-new-boundary" id="ft3-new-catalog-note" role="status">'+(enabled?'Signed submission available. Vehicle and person choices are reference labels, not verified catalog identities.':'Signed FuelTrack access could not be verified. Requests cannot be saved until the connection succeeds.')+'</p>'+ (message?'<p class="ft3-new-boundary" role="status">'+h(message)+'</p>':'')+
 '<div class="ft3-new-vehicle">'+
 section(1,'Vehicle Details',select('ft3-plate','Plate Number','Select plate number',FUELTRACK_PLATE_OPTIONS)+
 select('ft3-owner','Vehicle Owner','Select owner',FUELTRACK_PERSON_OPTIONS)+
 input('ft3-odometer','Odometer Reading',{type:'number',placeholder:'Current mileage',min:0,step:'any'}))+
 section(2,'Trip Information',input('ft3-origin','Origin',{placeholder:'Starting location',required:true,maxlength:240})+
 input('ft3-destination','Destination',{placeholder:'Ending location',required:true,maxlength:240})+
 input('ft3-distance','Distance (km)',{type:'number',min:0,step:'any',placeholder:'0'}))+
 purpose+'</div>'+
 '<div class="ft3-new-container">'+
 section(1,'Container Details',select('ft3-quantity','Number of Containers','Select quantity',FUELTRACK_CONTAINER_OPTIONS)+
 '<label class="ft3-new-field ft3-new-custom-count" for="ft3-custom-count"><span>Custom number of containers</span><input id="ft3-custom-count" name="customCount" type="number" min="1" max="10000" step="1" inputmode="numeric" placeholder="Enter quantity"></label>'+
 select('ft3-responsible','Responsible Person','Select person',FUELTRACK_PERSON_OPTIONS))+
 section(3,'Justification','<label class="ft3-new-field ft3-new-wide" for="ft3-container-purpose"><span>Purpose <b aria-label="required">*</b></span>'+
 '<textarea id="ft3-container-purpose" name="containerPurpose" maxlength="500" rows="4" placeholder="Describe the purpose of this fuel request"></textarea></label>'+
 receipt())+
 '</div>'+
 '<button type="submit" class="ft3-new-submit"'+(!enabled||busy?' disabled':'')+' aria-describedby="ft3-new-catalog-note">'+(busy?'Submitting…':enabled?'Submit for Approval':'Submit for Approval — connect signed service first')+'</button>'+(!enabled?'<button type="button" class="ft3-new-retry" data-action="ft3-retry-backend"'+(busy?' disabled':'')+'>Retry signed FuelTrack connection</button>':'')+
 (enabled?'</form>':'</div>')+'</section>';
}

/** Convert the unchanged input controls to the strictly typed RPC payload.
 * Never accept actor IDs, roles, statuses, or audit fields from this form.
 */
export function fuelTrackNewRequestPayload(form){
 if(!form||typeof form.querySelector!=='function')throw new TypeError('Invalid fuel request form');
 const val=id=>String(form.querySelector('#'+id)?.value??'').trim();
 const kind=form.querySelector('[name="ft3-fuel-mode"]:checked')?.value;
 const purpose=kind==='vehicle'?val('ft3-purpose'):val('ft3-container-purpose');
 if(purpose.length<10||purpose.length>500)
  throw new TypeError('Purpose must contain 10–500 characters.');
 if(kind==='vehicle'){
  const plate=val('ft3-plate'),owner=val('ft3-owner'),
   origin=val('ft3-origin'),destination=val('ft3-destination');
  if(!FUELTRACK_PLATE_OPTIONS.includes(plate)||!FUELTRACK_PERSON_OPTIONS.includes(owner)||
     !origin||!destination||origin.length>240||destination.length>240)
   throw new TypeError('Complete all required vehicle and trip details.');
  const details={plate,owner,origin,destination,purpose};
  for(const [field,key,max] of [['ft3-odometer','odometer',1000000000],
   ['ft3-distance','distance',10000000]]){
   const raw=val(field);
   if(raw){
    const number=Number(raw);
    if(!Number.isFinite(number)||number<0||number>max)
     throw new TypeError('Invalid '+key);
    details[key]=number;
   }
  }
  return {kind,details};
 }
 if(kind==='container'){
  const value=val('ft3-quantity');
  const raw=value==='custom'?val('ft3-custom-count'):value;
  const containerCount=Number(raw),responsiblePerson=val('ft3-responsible');
  if(!raw||!Number.isSafeInteger(containerCount)||containerCount<1||
     containerCount>10000||!FUELTRACK_PERSON_OPTIONS.includes(responsiblePerson))
   throw new TypeError('Select a valid container quantity and responsible person.');
  return {kind,details:{containerCount,responsiblePerson,purpose}};
 }
 throw new TypeError('Select a fuel request type.');
}
