/** CP-TL-03D / Phase 1 — Draft workspace, controlled dark launch.
 * This is a presentation layer over the EXISTING signed TradeLinkDomainClient.
 * No local persistence, fabricated domain records, second login, or write bypass.
 */
import {ApiError} from './session.js';
import {TRADELINK_BOARD_ID,isTradeLinkBoard} from './tradelink-board-items.js';
import {TradeLinkDomainClient,TL03_DOMAIN_READS_ENABLED,
 TL03_DOMAIN_WRITES_ENABLED,validateTradeLinkDraftEnvelope} from './tradelink-domain-client.js';

export const TL03_DRAFT_INTERFACE_ENABLED=true; // presentation only
const typeLabels=Object.freeze([
 ['esi','Electronic SI'],['packing','Packing List'],['delivery','Delivery Receipt'],
 ['payment','Payment AR'],['quotation','Quotation'],['po','PO to Suppliers']
]);
const currencies=['PHP','USD','EUR','GBP','JPY','CNY','SGD','AUD','SAR'];
const vatCodes=[['12','12%'],['zero','Zero-rated'],['exempt','Exempt'],
 ['15_tkm','15% TKM'],['15_ksa','15% KSA']];
const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
}[c]));
const disabled=()=>{throw new ApiError(
 'TradeLink Draft API is in dark launch; production persistence is disabled.',503);
};
export const tradeLinkDraftReady=()=>TL03_DOMAIN_READS_ENABLED&&TL03_DOMAIN_WRITES_ENABLED;
export function initialTradeLinkDraftView(){
 return {status:'DARK_LAUNCH',rows:[],selected:null,busy:false,error:'',
  message:'',mode:'create'};
}
export function parseTradeLinkDraftForm(fields,{lineId=()=>globalThis.crypto?.randomUUID?.()}={}){
 if(!fields||typeof fields.get!=='function')
  throw new ApiError('TradeLink Draft input is missing.',400);
 const value=k=>String(fields.get(k)??'').trim();
 const draft={documentType:value('documentType'),documentNumber:value('documentNumber')};
 for(const key of ['customerName','referenceNumber','remarks']){
  if(value(key))draft[key]=value(key);
 }
 const currency=value('currency'),vatType=value('vatType');
 if(currency){
  if(!currencies.includes(currency))throw new ApiError('Invalid TradeLink currency.',400);
  draft.currency=currency;
 }
 if(vatType){
  if(!vatCodes.some(([code])=>code===vatType))
   throw new ApiError('Invalid TradeLink VAT code.',400);
  draft.vatType=vatType;
 }
 const description=value('lineDescription'),quantity=value('lineQuantity'),
  unitPrice=value('lineUnitPrice'),unit=value('lineUnit');
 if(description||quantity||unitPrice||unit){
  if(!description||!quantity||!unitPrice)
   throw new ApiError('Line item requires description, quantity and unit price.',400);
  const q=Number(quantity),p=Number(unitPrice);
  if(!Number.isFinite(q)||!Number.isFinite(p)||q<0||p<0||
     q>1000000000||p>1000000000)
   throw new ApiError('Invalid Draft line quantity or unit price.',400);
  const id=value('lineId')||lineId();
  if(typeof id!=='string'||!id||id.length>120)
   throw new ApiError('Could not create a valid line-item identifier.',400);
  draft.items=[{id,kind:'item',description,quantity:q,unitPrice:p,
   ...(unit?{unit}:{})}];
 }
 return validateTradeLinkDraftEnvelope(draft);
}
export class TradeLinkDraftWorkspace{
 constructor({auth,api}={}){this.client=new TradeLinkDomainClient({auth,api});}
 async list(){
  if(!TL03_DOMAIN_READS_ENABLED)return {status:'DARK_LAUNCH',rows:[]};
  return {status:'AUTHORIZED_READ',rows:await this.client.list(50)};
 }
 async read(documentId){
  if(!TL03_DOMAIN_READS_ENABLED)disabled();
  return this.client.read(documentId);
 }
 async save({documentId,expectedRevision=0,draft}={}){
  if(!TL03_DOMAIN_WRITES_ENABLED)disabled();
  const payload=validateTradeLinkDraftEnvelope(draft);
  const id=documentId||globalThis.crypto?.randomUUID?.();
  const operation=expectedRevision===0?'create':'update';
  return this.client.commit({documentId:id,expectedRevision,operation,draft:payload});
 }
 async changeState({documentId,revision,operation}={}){
  if(!TL03_DOMAIN_WRITES_ENABLED)disabled();
  if(!['archive','restore'].includes(operation))
   throw new ApiError('Only archive and restore are supported for TradeLink Draft.',400);
  return this.client.commit({documentId,expectedRevision:revision,operation});
 }
}
const options=(arr,current)=>arr.map(([id,label])=>
 '<option value="'+escape(id)+'"'+(id===current?' selected':'')+'>'+
 escape(label)+'</option>').join('');
function field(label,name,val='',attrs=''){
 return '<label class="tl-draft-field"><span>'+escape(label)+'</span>'+
  '<input name="'+escape(name)+'" value="'+escape(val)+'" '+attrs+'></label>';
}
function renderEditor(row,mode,canManage){
 const editing=mode==='edit'&&row?.workflow_state==='draft'&&
  row.content&&typeof row.content==='object'&&
  (!Array.isArray(row.content.items)||row.content.items.length<=1);
 const data=editing?row.content:{};
 const line=Array.isArray(data.items)?data.items[0]||{}:{};
 const writeEnabled=editing||mode==='create';
 const live=TL03_DOMAIN_WRITES_ENABLED&&canManage&&writeEnabled;
 const type=editing?data.documentType:'quotation';
 return '<section class="tl-draft-panel" aria-labelledby="tl-draft-editor-title">'+
  '<div class="tl-panel-heading"><div><p class="tl-eyebrow">Source-aligned Draft editor</p>'+
  '<h3 id="tl-draft-editor-title">'+(editing?'Edit authorized Draft':'Prepare a Draft')+'</h3></div>'+
  (editing?'<button type="button" class="secondary" data-action="tradelink-draft-new">New Draft</button>':'')+'</div>'+
  (mode==='edit'&&!editing?'<p role="alert">This record cannot be edited with the bounded Phase 1 editor.</p>':'')+
  '<p class="muted">Fields are a local, unsaved preparation form. Preview validation does not create a server record.</p>'+
  '<form data-tradelink-draft-form>'+
   '<div class="tl-draft-form-grid"><label class="tl-draft-field"><span>Document module</span>'+
    '<select name="documentType" '+(editing?'disabled':'')+'>'+options(typeLabels,type)+'</select></label>'+
    (editing?'<input type="hidden" name="documentType" value="'+escape(type)+'">':'')+
    field('Document number','documentNumber',data.documentNumber||'','required maxlength="120" pattern="[A-Za-z0-9][A-Za-z0-9._ /-]*"')+
    field('Customer / supplier','customerName',data.customerName||'','maxlength="5000"')+
    field('Reference','referenceNumber',data.referenceNumber||'','maxlength="5000"')+
    '<label class="tl-draft-field"><span>Currency</span><select name="currency">'+
     options(currencies.map(v=>[v,v]),data.currency||'PHP')+'</select></label>'+
    '<label class="tl-draft-field"><span>VAT</span><select name="vatType">'+
     options(vatCodes,data.vatType||'12')+'</select></label>'+
   '</div>'+
   '<fieldset class="tl-draft-lines"><legend>Single line item (optional)</legend>'+
    field('Description','lineDescription',line.description||'','maxlength="2000"')+
    field('Quantity','lineQuantity',line.quantity??'','type="number" min="0" max="1000000000" step="any"')+
    field('Unit price','lineUnitPrice',line.unitPrice??'','type="number" min="0" max="1000000000" step="any"')+
    field('Unit','lineUnit',line.unit||'','maxlength="120"')+
    (editing&&line.id?'<input type="hidden" name="lineId" value="'+escape(line.id)+'">':'')+
   '</fieldset>'+
   '<label class="tl-draft-field"><span>Remarks</span>'+
    '<textarea name="remarks" maxlength="5000" rows="3">'+escape(data.remarks||'')+'</textarea></label>'+
   '<div class="tl-draft-actions">'+
    '<button type="button" class="secondary" data-action="tradelink-draft-preview">Validate locally</button>'+
    '<button type="submit" class="primary"'+(live?'':' disabled title="Production Draft writes are not activated"')+
     '>'+(editing?'Save revision':'Create Draft')+'</button>'+
   '</div><p data-tradelink-draft-preview-status role="status" aria-live="polite">'+
    'Not saved. Domain write activation is pending.</p>'+
  '</form></section>';
}
export function renderTradeLinkDraftWorkspace({detail,workspaceId,view=initialTradeLinkDraftView(),canManage=false}={}){
 if(!isTradeLinkBoard(detail?.board)||detail.board.id!==TRADELINK_BOARD_ID||
   detail.board.workspace_id!==workspaceId)
  return '<section role="alert" class="tl-draft-panel">Signed TradeLink workspace unavailable.</section>';
 const rows=TL03_DOMAIN_READS_ENABLED&&view.status==='AUTHORIZED_READ'&&Array.isArray(view.rows)?view.rows:[];
 const selected=view.mode==='edit'&&view.selected?.documentId?
   view.selected:null;
 return '<div class="tl-draft-workspace">'+
  '<section class="tl-draft-panel"><div class="tl-panel-heading">'+
   '<div><p class="tl-eyebrow">CP-TL-03D / Phase 1</p><h2>Draft workspace</h2></div>'+
   '<span class="tl-draft-badge">Controlled dark launch</span></div>'+
   '<p class="muted">Draft UI is staged. Domain reads: <strong>'+
    (TL03_DOMAIN_READS_ENABLED?'enabled':'not activated')+'</strong>. Writes: <strong>'+
    (TL03_DOMAIN_WRITES_ENABLED?'enabled':'not activated')+
   '</strong>. Existing APSYNTRA signed authorization remains mandatory.</p>'+
   '<p class="tl-draft-boundary" role="note">No local draft storage, synthetic saved documents, independent login, attachments, workflow approvals or PDF export. A validated preview is not a saved record.</p>'+
   '<div class="tl-panel-heading"><h3>Authoritative Draft records</h3>'+
    '<button type="button" class="secondary" data-action="tradelink-draft-refresh"'+
      (!TL03_DOMAIN_READS_ENABLED||view.busy?' disabled':'')+'>Refresh</button></div>'+
   (view.error?'<p role="alert">'+escape(view.error)+'</p>':'')+
   (view.message?'<p role="status">'+escape(view.message)+'</p>':'')+
   (rows.length?'<div class="tl-records-scroll"><table class="tl-records-table">'+
     '<thead><tr><th>Document</th><th>Module</th><th>Revision</th><th>State</th><th>Actions</th></tr></thead><tbody>'+
    rows.map(row=>'<tr><td>'+escape(row.documentNumber)+'</td><td>'+escape(row.documentType)+
     '</td><td>'+escape(row.revision)+'</td><td>'+escape(row.workflowState)+
     (row.archived?' · Archived':'')+'</td><td>'+
     '<button type="button" class="secondary" data-action="tradelink-draft-open" data-id="'+escape(row.documentId)+'">Read</button> '+
     '<button type="button" class="secondary" data-action="tradelink-draft-archive" data-id="'+escape(row.documentId)+'"'+
      (!canManage||!TL03_DOMAIN_WRITES_ENABLED||row.archived?' disabled':'')+'>Archive</button> '+
     '<button type="button" class="secondary" data-action="tradelink-draft-restore" data-id="'+escape(row.documentId)+'"'+
      (!canManage||!TL03_DOMAIN_WRITES_ENABLED||!row.archived?' disabled':'')+'>Restore</button>'+
     '</td></tr>').join('')+'</tbody></table></div>':
    '<p class="muted">No persisted TradeLink Draft records are displayed. The signed document-list endpoint remains off during this dark launch.</p>')+
  '</section>'+renderEditor(selected?.record,view.mode,canManage)+'</div>';
}
