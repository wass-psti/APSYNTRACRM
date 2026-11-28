// An explicit, read-only lookup of existing procurement records. The panel
// lives in the current route DOM, so route replacement removes its values.
import {readProcurementReferences,filterProcurementReferences,SUPPLIER_PO_BOARD_ID} from './procurement-reference.js';

const PAGE_SIZE=25;
function element(doc,tag,value){
 const node=doc.createElement(tag);
 if(value!==undefined)node.textContent=value;
 return node;
}
export async function toggleProcurementReferences(button,{api,auth,workspaceId,isCurrent}){
 const panel=button.closest('.ms-native-sourcing')?.querySelector('[data-ms-procurement-references]');
 if(!panel||button.disabled||!isCurrent())return false;
 const doc=button.ownerDocument,actor=auth.userId;
 const active=()=>button.isConnected&&panel.isConnected&&isCurrent()&&auth.userId===actor;
 const clear=()=>{panel.replaceChildren();panel.hidden=true;button.setAttribute('aria-expanded','false');};
 if(!panel.hidden){clear();return true;}
 panel.hidden=false;button.setAttribute('aria-expanded','true');button.disabled=true;
 const heading=element(doc,'h3','Supplier & PO references');
 const status=element(doc,'p','Loading existing signed procurement records…');
 status.setAttribute('role','status');panel.replaceChildren(heading,status);
 try{
  const data=await readProcurementReferences({api,auth,workspaceId,isCurrent:active});
  if(!active()){clear();return false;}
  status.textContent=data.records.length+' active source records · '+data.suppliers.length+
   ' distinct normalized supplier names · '+data.unnamed+' records without supplier names.';
  const note=element(doc,'p','Historical reference lookup only. Names are not verified supplier identities; legacy references are not confirmed material links. No records are created or changed here.');
  const link=element(doc,'a','Open Supplier PO Procurement');
  link.href='#/boards/'+SUPPLIER_PO_BOARD_ID;
  const searchLabel=element(doc,'label','Search procurement references ');
  const search=element(doc,'input');search.type='search';search.maxLength=240;
  search.placeholder='Supplier, PO, client or record ID';searchLabel.append(search);
  const supplierLabel=element(doc,'label',' Supplier ');
  const select=element(doc,'select');select.setAttribute('aria-label','Supplier');
  const all=element(doc,'option','All supplier names');all.value='';select.append(all);
  for(const supplier of data.suppliers){
   const option=element(doc,'option',supplier.name+' ('+supplier.count+')');
   option.value=supplier.name;select.append(option);
  }
  supplierLabel.append(select);
  const results=element(doc,'p');results.setAttribute('role','status');
  const region=element(doc,'div');region.className='ms-native-table-scroll';
  region.setAttribute('role','region');region.setAttribute('aria-label','Historical procurement reference results');region.tabIndex=0;
  const table=element(doc,'table');table.className='ms-native-table';
  const header=table.createTHead().insertRow();
  for(const title of ['Source record','Supplier name','Supplier PO date','Client PO reference','Legacy material reference','Source record UUID']){
   const th=element(doc,'th',title);th.scope='col';header.append(th);
  }
  const body=table.createTBody();region.append(table);
  const prev=element(doc,'button','Previous');prev.type='button';
  const next=element(doc,'button','Next');next.type='button';
  const controls=element(doc,'div');controls.className='ms-native-header-actions';controls.append(prev,next);
  let page=0;
  function render(){
   if(!active()){clear();return;}
   const filtered=filterProcurementReferences(data.records,search.value,select.value);
   page=Math.min(page,Math.max(0,Math.ceil(filtered.length/PAGE_SIZE)-1));
   const offset=page*PAGE_SIZE,visible=filtered.slice(offset,offset+PAGE_SIZE);
   body.replaceChildren();
   for(const record of visible){
    const row=body.insertRow();
    for(const value of [record.reference,record.supplier,record.date,record.clientReference,record.legacyMaterialReference,record.id])
     row.insertCell().textContent=value||'—';
   }
   results.textContent=filtered.length?(offset+1)+'–'+(offset+visible.length)+' of '+filtered.length+' matching records':'No matching source records.';
   prev.disabled=page===0;next.disabled=offset+PAGE_SIZE>=filtered.length;
  }
  search.addEventListener('input',()=>{page=0;render();});
  select.addEventListener('change',()=>{page=0;render();});
  prev.addEventListener('click',()=>{page=Math.max(0,page-1);render();});
  next.addEventListener('click',()=>{page++;render();});
  panel.append(note,link,searchLabel,supplierLabel,results,region,controls);render();
  return true;
 }catch(error){
  if(active())status.textContent=error.message||'Procurement references unavailable. Close and reopen to retry.';
  else clear();
  return false;
 }finally{if(button.isConnected)button.disabled=false;}
}
