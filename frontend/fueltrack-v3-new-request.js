/** FuelTrack+ v3 reference-aligned request composition surface.
 * Presentation-only until signed personnel/vehicle catalogs and an authoritative
 * request transaction/approval contract are available. No network or storage writes.
 */
const h=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const input=(id,label,{type='text',placeholder='',required=false,min=null,step=null,maxlength=null}={})=>
 '<label class="ft3-new-field" for="'+id+'"><span>'+h(label)+(required?' <b aria-label="required">*</b>':'')+'</span>'+
 '<input id="'+id+'" name="'+id+'" type="'+type+'" placeholder="'+h(placeholder)+'"'+
 (min!==null?' min="'+h(min)+'"':'')+(step!==null?' step="'+h(step)+'"':'')+
 (maxlength!==null?' maxlength="'+h(maxlength)+'"':'')+' autocomplete="off"></label>';
const select=(id,label,placeholder)=>
 '<label class="ft3-new-field" for="'+id+'"><span>'+h(label)+' <b aria-label="required">*</b></span>'+
 '<select id="'+id+'" name="'+id+'" disabled aria-describedby="ft3-new-catalog-note">'+
 '<option value="">'+h(placeholder)+'</option></select></label>';
const textArea=()=>'<label class="ft3-new-field ft3-new-wide" for="ft3-purpose"><span>Purpose <b aria-label="required">*</b></span>'+
 '<textarea id="ft3-purpose" name="purpose" rows="4" maxlength="500" placeholder="Describe the purpose of this fuel request"></textarea></label>';
const section=(number,title,body)=>'<section class="ft3-new-panel"><h3><span class="ft3-new-index">'+number+'</span>'+h(title)+'</h3>'+
 '<div class="ft3-new-fields">'+body+'</div></section>';
const mode=(id,title,subtitle,icon)=>
 '<label class="ft3-new-option" for="ft3-mode-'+id+'">'+
 '<input type="radio" name="ft3-fuel-mode" id="ft3-mode-'+id+'" value="'+id+'"'+(id==='vehicle'?' checked':'')+'>'+
 '<span class="ft3-new-option-body"><span class="ft3-new-option-icon" aria-hidden="true">'+icon+'</span><strong>'+title+'</strong><small>'+subtitle+'</small></span></label>';
export function renderFuelTrackNewRequest(){
 const purpose=section(3,'Justification',textArea()+
 '<div class="ft3-new-field ft3-new-wide"><span>Receipt Photo (Optional)</span>'+
 '<button type="button" disabled aria-describedby="ft3-new-catalog-note">Capture Receipt / Photo — unavailable</button></div>');
 return '<section class="ft3-new-request" aria-labelledby="ft3-new-title">'+
 '<header class="ft3-new-title"><h2 id="ft3-new-title">New Fuel Request</h2>'+
 '<p>Choose a refuel type and prepare request details. Submission remains unavailable until the signed request service and reference lists are verified.</p></header>'+
 '<div class="ft3-new-progress" aria-label="Request steps"><span>Vehicle / Container Details</span><span>Trip Information</span><span>Justification</span></div>'+
 '<div class="ft3-new-composer">'+
 '<div class="ft3-new-panel ft3-new-type" role="group" aria-label="Select Refuel Type"><h3>Select Refuel Type</h3>'+
 '<div class="ft3-new-options">'+mode('vehicle','Vehicle Fuel','Cars, trucks, motorcycles','⛽')+
 mode('container','Container Refill','Drums, canisters, tanks','⬡')+'</div></div>'+
 '<p class="ft3-new-boundary" id="ft3-new-catalog-note" role="status">Vehicle, personnel and container option lists are not yet verified in the central backend. These selectors are disabled; no request will be saved or submitted.</p>'+
 '<div class="ft3-new-vehicle">'+
 section(1,'Vehicle Details',select('ft3-plate','Plate Number','Select plate number')+
 select('ft3-owner','Vehicle Owner','Select owner')+
 input('ft3-odometer','Odometer Reading',{type:'number',placeholder:'Current mileage',min:0,step:'any'}))+
 section(2,'Trip Information',input('ft3-origin','Origin',{placeholder:'Starting location',required:true,maxlength:240})+
 input('ft3-destination','Destination',{placeholder:'Ending location',required:true,maxlength:240})+
 input('ft3-distance','Distance (km)',{type:'number',min:0,step:'any',placeholder:'0'}))+
 purpose+'</div>'+
 '<div class="ft3-new-container">'+
 section(1,'Container Details',select('ft3-quantity','Number of Containers','Select quantity')+
 select('ft3-responsible','Responsible Person','Select person'))+
 section(3,'Justification','<label class="ft3-new-field ft3-new-wide" for="ft3-container-purpose"><span>Purpose <b aria-label="required">*</b></span>'+
 '<textarea id="ft3-container-purpose" maxlength="500" rows="4" placeholder="Describe the purpose of this fuel request"></textarea></label>'+
 '<div class="ft3-new-field ft3-new-wide"><span>Receipt Photo (Optional)</span>'+
 '<button type="button" disabled>Capture Receipt / Photo — unavailable</button></div>')+
 '</div>'+
 '<button type="button" class="ft3-new-submit" disabled aria-describedby="ft3-new-catalog-note">Submit for Approval — unavailable</button>'+
 '</div></section>';
}
