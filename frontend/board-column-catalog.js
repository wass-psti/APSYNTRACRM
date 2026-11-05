/** CMP-01: only operational, server-backed ordinary-board column types.
 * Inventory is intentionally narrower than monday.com; no AI, Marketplace,
 * proprietary monday, file-storage or unimplemented relationship columns.
 */
export const BOARD_STANDARD_COLUMN_CATALOG=Object.freeze([
 {type:'text',label:'Text',group:'Essentials',description:'Single-line text up to 1,000 characters.',icon:'T',keywords:'name label'},
 {type:'long_text',label:'Long Text',group:'Essentials',description:'Multiline notes up to 5,000 characters.',icon:'≡',keywords:'notes description'},
 {type:'number',label:'Numbers',group:'Essentials',description:'Validated finite numeric values and numeric summaries.',icon:'123',keywords:'numeric amount'},
 {type:'status',label:'Status',group:'Essentials',description:'Configured labels with stable IDs and status colors.',icon:'●',keywords:'priority phase state'},
 {type:'dropdown',label:'Dropdown',group:'Essentials',description:'One choice from configurable options.',icon:'▾',keywords:'category select'},
 {type:'date',label:'Date',group:'Essentials',description:'Calendar date without unintended timezone shifts.',icon:'▦',keywords:'day calendar'},
 {type:'people',label:'People',group:'Essentials',description:'One authorized board-member assignment.',icon:'♙',keywords:'member assignee'},
 {type:'checkbox',label:'Checkbox',group:'Essentials',description:'Boolean yes/no tracking.',icon:'☑',keywords:'true false'},
 {type:'timeline',label:'Timeline',group:'Super useful',description:'Start and end dates with validity checking.',icon:'⟷',keywords:'range dates'},
 {type:'email',label:'Email',group:'Super useful',description:'Validated email address.',icon:'@',keywords:'contact'},
 {type:'url',label:'Link',group:'Super useful',description:'Validated HTTP(S) URL.',icon:'↗',keywords:'website url'}
]);
export const BOARD_STANDARD_COLUMN_GROUPS=Object.freeze(['Essentials','Super useful']);
export const SUPPORTED_COLUMN_TYPE_IDS=Object.freeze(BOARD_STANDARD_COLUMN_CATALOG.map(x=>x.type));
export const BOARD_COLUMN_PRESETS=Object.freeze([
 {type:'priority_preset',label:'Priority (Status preset)',group:'Presets',
  description:'A real Status column with Critical, High, Medium and Low options.',
  icon:'!',keywords:'priority urgency severity labels',backendType:'status'}
]);
export const COLUMN_CENTER_GROUPS=Object.freeze([...BOARD_STANDARD_COLUMN_GROUPS,'Presets']);
const COLUMN_CENTER_ENTRIES=Object.freeze([...BOARD_STANDARD_COLUMN_CATALOG,...BOARD_COLUMN_PRESETS]);
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({
 '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function findStandardColumnType(type){
 return BOARD_STANDARD_COLUMN_CATALOG.find(x=>x.type===type)||null;
}
export function searchStandardColumns(query=''){
 const words=String(query||'').trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
 return BOARD_STANDARD_COLUMN_CATALOG.filter(x=>
  words.every(w=>[x.label,x.description,x.type,x.keywords,x.group]
   .join(' ').toLocaleLowerCase().includes(w)));
}
/** Converts a visual preset into an existing authoritative schema type. */
export function resolveColumnTypeSelection(type,options=''){
 if(type==='priority_preset')
  return {type:'status',options:'Critical\nHigh\nMedium\nLow',preset:'priority'};
 if(!SUPPORTED_COLUMN_TYPE_IDS.includes(type))
  throw new Error('Unsupported column type or preset.');
 return {type,options:String(options??''),preset:null};
}
export function renderColumnTypeOptions(entries=COLUMN_CENTER_ENTRIES){
 const options=[];
 for(const group of COLUMN_CENTER_GROUPS){
  const subset=entries.filter(x=>x.group===group);
  if(!subset.length)continue;
  options.push('<optgroup label="'+escape(group)+'">'+subset.map(x=>
   '<option value="'+escape(x.type)+'">'+escape(x.label)+' — '+
   escape(x.description)+'</option>').join('')+'</optgroup>');
 }
 return options.join('');
}
export function renderColumnCenterCards(){
 return '<div class="board-column-center-cards" role="group" aria-label="Available operational columns and presets">'+
  COLUMN_CENTER_GROUPS.map(group=>{
   const items=COLUMN_CENTER_ENTRIES.filter(x=>x.group===group);
   return '<section class="board-column-center-category" data-column-group>'+
    '<h5>'+escape(group)+'</h5><div class="board-column-center-grid">'+
    items.map(x=>'<button type="button" data-column-type="'+escape(x.type)+'" '+
      'data-column-search-words="'+escape([x.label,x.description,x.keywords].join(' ').toLowerCase())+
      '" aria-pressed="'+(x.type==='text'?'true':'false')+'" class="board-column-center-choice">'+
      '<span class="board-column-icon" aria-hidden="true">'+escape(x.icon)+'</span>'+
      '<span class="board-column-choice-info"><strong>'+escape(x.label)+'</strong>'+
      '<small>'+escape(x.description)+'</small></span></button>').join('')+
    '</div></section>';
  }).join('')+'</div>';
}
