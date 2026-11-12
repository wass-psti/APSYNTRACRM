/** FRT board-first Monday-style projection: never synthesize finance records.
 * The three missing capabilities are marked unmapped, not silently made editable.
 * The original authoritative mirror columns remain stored and available to the
 * existing FRT finance endpoint / domain workflow.
 */
export const FRT_BOARD_ID='f36da8fe-8d9d-4629-9938-12533cb3ca39';
export const FRT_REFERENCE_STATUS_LABELS=Object.freeze([
 'Working on it','Stuck','Done','Pending Approval'
]);
const columns=Object.freeze([
 {name:'Approval Status',type:'status',key:'frt:status',title:'Status'},
 {name:'Request Date',type:'date',key:'frt:date',title:'Date'}
]);
export const FRT_UNMAPPED_FIELDS=Object.freeze(['Person','Attachments','Account QR Code']);
export function isFRTBoardReference(board){
 return board?.id===FRT_BOARD_ID&&board?.name==='Fund Released Tracker'&&
  board?.status==='active'&&
  String(board?.description||'').startsWith('[APSYNTRA:MODULE:frt:v1]');
}
export function frtReferenceColumns(detail,{primaryTitle='Item'}={}){
 if(!isFRTBoardReference(detail?.board))return null;
 const stored=Array.isArray(detail.columns)?detail.columns:[];
 const mapped=columns.map(def=>{
  const hits=stored.filter(c=>c.name===def.name&&c.data_type===def.type&&
   c.visible!==false&&c.system_key==null&&typeof c.id==='string');
  return hits.length===1?{...def,id:hits[0].id}:null;
 });
 // A missing/ambiguous schema is never displayed as a verified finance value.
 if(mapped.some(x=>!x))return null;
 return [
  {key:'record',title:String(primaryTitle||'Item')},
  {key:'frt:person',title:'Person'},
  {key:'col:'+mapped[0].id,title:'Status'},
  {key:'col:'+mapped[1].id,title:'Date'},
  {key:'frt:attachments',title:'Attachments'},
  {key:'frt:qr',title:'Account QR Code'}
 ];
}
export function frtReferenceStatusLabel(raw){
 if(raw===null||raw===undefined||raw==='')return '—';
 const value=typeof raw==='string'?raw:
  typeof raw==='object'&&raw!==null&&typeof raw.label==='string'?raw.label:null;
 if(value===null)return '—';
 const label=value.trim();
 return FRT_REFERENCE_STATUS_LABELS.find(x=>x.toLowerCase()===label.toLowerCase())||
  (label.length<=80?label:'—');
}
