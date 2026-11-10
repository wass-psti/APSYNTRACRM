/** Material Request Hub reference-aligned, signed Add Material form.
 * Public fields use original board columns; protected values use private RPCs.
 * Missing columns are visibly unavailable rather than silently discarded.
 */
import {MATERIAL_SOURCING_BOARD_ID,MATERIAL_SOURCING_GROUP,
 isApprovedPublicMaterialSourcingColumn} from './material-sourcing-schema-plan.js';
import {parseProtectedSourcingValue} from './material-sourcing-application.js';
import {ApiError} from './session.js';
const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[char]));
const PUBLIC=Object.freeze({
 sourceType:{column:'Source Type',type:'dropdown'},
 brand:{column:'Brand',type:'text'},
 description:{column:'Material description',type:'long_text'},
 quantity:{column:'Quantity',type:'number'},
 lead:{column:'Leadtime in Weeks',type:'number'},
 due:{column:'Date required',type:'date'},
 rfq:{column:'RFQ Ref No',type:'text'}
});
const PRIVATE=Object.freeze({
 buying:'Buying Price',currency:'Currency',shipping:'Shipping Cost',
 shippingCurrency:'Shipping Cost Currency',vendor:'Vendor Details'
});
export const MATERIAL_ADD_PUBLIC_FIELDS=PUBLIC;
export const MATERIAL_ADD_PRIVATE_FIELDS=PRIVATE;
export function materialAddPublicColumns(detail){
 const result=Object.create(null);
 if(detail?.board?.id!==MATERIAL_SOURCING_BOARD_ID||
 !detail.groups?.some(group=>group.id===MATERIAL_SOURCING_GROUP.id&&group.title===MATERIAL_SOURCING_GROUP.title))return result;
 for(const [key,field] of Object.entries(PUBLIC)){
  const col=(detail.columns||[]).find(c=>c.name===field.column&&
   c.data_type===field.type&&
   (key==='quantity'?c.system_key==null&&c.visible!==false:
    isApprovedPublicMaterialSourcingColumn(detail.board,c)));
  if(col)result[key]=col.id;
 }
 return result;
}
function control(label,name,{placeholder='',type='text',required=false,
 choices=null,disabled=false,wide=false,value='',hint=''}={}){
 const id='mrh-add-'+name;
 const attrs=(required&&!disabled?' required':'')+(disabled?' disabled':'')+
  (type==='number'?' min="0" step="any"':'')+
  (type!=='date'?' maxlength="'+(name==='description'||name==='vendor'?2000:240)+'"':'');
 const input=choices?'<select name="'+escape(name)+'" id="'+id+'"'+attrs+'>'+
  '<option value="">Select…</option>'+choices.map(choice=>
   '<option value="'+escape(choice)+'"'+(value===choice?' selected':'')+'>'+escape(choice)+'</option>').join('')+'</select>':
  type==='textarea'?'<textarea id="'+id+'" name="'+escape(name)+'"'+attrs+
   ' rows="3" placeholder="'+escape(placeholder)+'"></textarea>':
  '<input id="'+id+'" name="'+escape(name)+'" type="'+type+'"'+attrs+
   ' placeholder="'+escape(placeholder)+'" value="'+escape(value)+'">';
 return '<div class="mrh-add-field'+(wide?' mrh-add-wide':'')+'">'+
  '<label for="'+id+'">'+escape(label)+(required&&!disabled?' <span aria-hidden="true">*</span>':'')+'</label>'+
  input+(hint?'<small>'+escape(hint)+'</small>':disabled?'<small>Column not activated</small>':'')+'</div>';
}
export function renderMaterialSourcingAddMaterial(detail,{canCreate=false}={}){
 const valid=detail?.board?.id===MATERIAL_SOURCING_BOARD_ID&&
 detail.board.name==='Material Request Hub'&&detail.board.status==='active'&&
 detail.groups?.some(g=>g.id===MATERIAL_SOURCING_GROUP.id&&g.title===MATERIAL_SOURCING_GROUP.title);
 if(!valid)return '<section role="alert">Original Material Sourcing group unavailable.</section>';
 if(!canCreate)return '<section class="mrh-add-unavailable" role="status">Material creation is not available for this account.</section>';
 const columns=materialAddPublicColumns(detail);
 const enabled=name=>!!columns[name];
 const missing=['sourceType','brand','description','lead','due','rfq'].filter(key=>!enabled(key));
 return '<section class="mrh-add-wrap" aria-label="Add Material form">'+
  '<form id="mrh-add-material-form" class="mrh-add-form" novalidate>'+
   '<header class="mrh-add-head"><span class="mrh-add-logo" aria-hidden="true">◇</span><div>'+
    '<h3>New Material</h3><p>Fill in the material details</p></div></header>'+
   '<div class="mrh-add-section"><h4><span aria-hidden="true">◇</span> Identification</h4>'+
    '<div class="mrh-add-fields">'+
      control('Item name','partNumber',{placeholder:'Part number',required:true})+
      control('Group','group',{value:'Main group',disabled:true,hint:'Original group is preserved'})+
      control('Source type','sourceType',{choices:['Local','Import'],required:enabled('sourceType'),disabled:!enabled('sourceType')})+
      control('Brand','brand',{placeholder:'Manufacturer',required:enabled('brand'),disabled:!enabled('brand')})+
      control('Material description','description',{type:'textarea',placeholder:'Full material specification…',wide:true,required:enabled('description'),disabled:!enabled('description')})+
    '</div></div>'+
   '<div class="mrh-add-section"><h4><span aria-hidden="true">₱</span> Pricing &amp; Cost</h4>'+
    '<div class="mrh-add-fields mrh-add-three">'+
     control('Quantity','quantity',{type:'number',placeholder:'0',required:enabled('quantity'),disabled:!enabled('quantity')})+
     control('Buying price','buying',{type:'number',placeholder:'0.00'})+
     control('Currency','currency',{choices:['PHP','USD','EUR']})+
     control('Shipping cost','shipping',{type:'number',placeholder:'0.00'})+
     control('Ship. currency','shippingCurrency',{choices:['PHP','USD','EUR'],value:'PHP'})+
     control('Leadtime (weeks)','lead',{type:'number',placeholder:'e.g. 4',disabled:!enabled('lead')})+
    '</div><p class="mrh-add-hint">Currency conversions are not calculated until verified exchange-rate data is available.</p></div>'+
   '<div class="mrh-add-section"><h4><span aria-hidden="true">▧</span> Supplier &amp; Schedule</h4>'+
    '<div class="mrh-add-fields">'+
     control('Vendor details','vendor',{placeholder:'Supplier'})+
     control('Date required','due',{type:'date',disabled:!enabled('due')})+
     control('RFQ Ref No','rfq',{placeholder:'Reference number',wide:true,disabled:!enabled('rfq')})+
    '</div></div>'+
   (missing.length?'<div class="mrh-add-activation-note" role="note">'+
    '<span>'+missing.length+' public sourcing fields need activation. This uses the existing signed board schema workflow.</span>'+
    '<button type="button" class="secondary" data-action="mrh-activate-public">Enable missing fields</button></div>':'')+
   '<footer class="mrh-add-actions"><button type="submit" class="primary" data-mrh-add-submit>＋ Add Material</button>'+
    '<button type="button" class="secondary" data-action="mrh-show-items">Cancel</button>'+
    '<p role="status" aria-live="polite" data-mrh-add-status></p></footer>'+
  '</form></section>';
}
function text(value,max=2000){
 const v=String(value??'').trim();
 if(v.length>max)throw new ApiError('Material field exceeds allowed length.',400);
 return v;
}
function number(value,name){
 if(value==='')return null;
 const raw=String(value).trim();
 if(!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(raw)||!Number.isFinite(Number(raw))||Number(raw)>1e12)
  throw new ApiError('Enter a valid nonnegative '+name+'.',400);
 return Number(raw);
}
/** Prepare every requested write BEFORE creating the item. No silent drops. */
export function parseMaterialAddForm(detail,fd){
 const columns=materialAddPublicColumns(detail);
 const partNumber=text(fd.get('partNumber'),240);
 if(!partNumber)throw new ApiError('Part number is required.',400);
 const ordinary=[],protectedValues=[];
 for(const [key,field] of Object.entries(PUBLIC)){
  const raw=text(fd.get(key),2000);
  if(!raw)continue;
  if(!columns[key])throw new ApiError(field.column+' is not activated.',409);
  let value=raw;
  if(field.type==='number')value=number(raw,field.column);
  if(field.type==='dropdown'&&!['Local','Import'].includes(value))
   throw new ApiError('Invalid source type.',400);
  if(field.type==='date'&&(!/^\d{4}-\d{2}-\d{2}$/.test(value)||
      Number.isNaN(Date.parse(value+'T00:00:00Z'))))
   throw new ApiError('Invalid required date.',400);
  ordinary.push({name:field.column,columnId:columns[key],value});
 }
 for(const [key,name] of Object.entries(PRIVATE)){
  const raw=text(fd.get(key));
  if(!raw)continue;
  protectedValues.push({name,value:parseProtectedSourcingValue(name,raw)});
 }
 return Object.freeze({partNumber,ordinary,protectedValues});
}
