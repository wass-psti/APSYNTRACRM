// Signed, board-wide financial read. No browser arithmetic, durable cache or writes.
const states=['current','missing','stale','partial','incomplete','unavailable'];
const labels={current:'Current saved pricing',missing:'No saved pricing',stale:'Stale pricing — save again',partial:'Partial pricing',incomplete:'Incomplete pricing',unavailable:'Pricing unavailable'};
const decimal=value=>typeof value==='string'&&/^(0|[1-9][0-9]*)([.][0-9]+)?$/.test(value);
const money=value=>decimal(value)?'₱'+value:'—';
const keys=['php','shipPhp','landed','totalLanded','selling','vatIn'];
export function validateBoardPricing(data,{boardId,workspaceId}){
 if(!data||data.boardId!==boardId||data.workspaceId!==workspaceId||!Array.isArray(data.rows))throw Error('Unexpected pricing scope');
 const c=data.coverage,t=data.totals;
 if(!c||!t||!Number.isSafeInteger(c.total)||c.total<0||c.total!==data.rows.length||
  states.some(k=>!Number.isSafeInteger(c[k])||c[k]<0)||states.reduce((n,k)=>n+c[k],0)!==c.total)throw Error('Invalid pricing coverage');
 const seen=new Set(),counts=Object.fromEntries(states.map(k=>[k,0]));
 for(const row of data.rows){
  if(typeof row?.itemId!=='string'||seen.has(row.itemId)||!states.includes(row.state))throw Error('Invalid pricing row');
  seen.add(row.itemId);counts[row.state]++;
  if(['current','partial'].includes(row.state)){
   if(!row.pricingVersionId||!row.fxSnapshotId||row.formulaVersion!=='mrh-pricing-v1'||!row.costs||
    keys.some(k=>!decimal(row.costs[k])&&!(row.state==='partial'&&['selling','vatIn'].includes(k)&&row.costs[k]===null)))throw Error('Invalid pricing receipt');
  }else if(row.costs!==null)throw Error('Unexpected costs');
 }
 if(states.some(k=>counts[k]!==c[k]))throw Error('Invalid coverage distribution');
 if(['buying','shipping','landed','sellingVatIn'].some(k=>c.current? !decimal(t[k]):t[k]!==null))throw Error('Invalid totals');
 const f=data.latestFx;
 if(f!==null&&(!f||f.provenance!=='provider_reported'||!decimal(f.usd)||!decimal(f.eur)||!f.provider||
  !f.snapshotId||!f.observationRef||!Number.isFinite(Date.parse(f.observedAt))||!Number.isFinite(Date.parse(f.retrievedAt))))throw Error('Invalid FX provenance');
 return data;
}
function put(root,selector,value){const el=root.querySelector(selector);if(el)el.textContent=value;}
function clearProjection(host){
 for(const el of host.querySelectorAll('[data-ms-derived]'))el.textContent='—';
 for(const el of host.querySelectorAll('[data-ms-pricing-state]'))el.textContent='Pricing not loaded';
 for(const el of host.querySelectorAll('[data-ms-financial-value]'))el.textContent='—';
 put(host,'[data-ms-fx-summary]','No board FX read yet.');
 put(host,'[data-ms-coverage]','Financial coverage not loaded.');
}
export function paintBoardPricing(host,data){
 const rows=new Map(data.rows.map(row=>[row.itemId,row]));
 for(const element of host.querySelectorAll('tr[data-ms-item]')){
  const row=rows.get(element.dataset.msItem);
  for(const el of element.querySelectorAll('[data-ms-derived]'))el.textContent=money(row?.costs?.[el.dataset.msDerived]);
  put(element,'[data-ms-pricing-state]',row?labels[row.state]:'Pricing unavailable');
  const version=element.querySelector('[data-ms-pricing-state]');
  if(version)version.title=row?.pricingVersionId?'Saved version '+row.pricingVersionId:'';
 }
 const c=data.coverage;
 for(const el of host.querySelectorAll('[data-ms-financial-value]')){
  const k=el.dataset.msFinancialValue;
  el.textContent=k==='usd'||k==='eur'?data.latestFx?.[k]??'—':money(data.totals[k]);
 }
 put(host,'[data-ms-coverage]',c.current+' of '+c.total+' current · '+c.missing+' unpriced · '+c.stale+' stale · '+c.partial+' partial · '+c.incomplete+' incomplete · '+c.unavailable+' unavailable. Totals include current complete pricing only.');
 const f=data.latestFx;
 put(host,'[data-ms-fx-summary]',f?f.provider+' · observation '+f.observedAt.slice(0,10)+' · first retrieved '+f.retrievedAt+' · '+f.observationRef:'No captured provider observation for active materials.');
}
export async function loadBoardPricing(button,{api,boardId,workspaceId,isCurrent}){
 const host=button.closest('.ms-native-sourcing');
 if(!host||button.disabled||!isCurrent())return false;
 const current=()=>host.isConnected&&button.isConnected&&isCurrent();
 clearProjection(host);button.disabled=true;
 put(host,'[data-ms-pricing-status]','Loading authoritative pricing…');
 try{
  const result=validateBoardPricing(await api.rpc('mrh_pricing_board_projection',{p_board_id:boardId}),{boardId,workspaceId});
  if(!current())return false;
  paintBoardPricing(host,result);
  put(host,'[data-ms-pricing-status]','Authoritative pricing loaded. Refresh pricing after any material change.');
  return true;
 }catch{
  if(current()){clearProjection(host);put(host,'[data-ms-pricing-status]','Authoritative pricing unavailable. Retry after activation or refresh.');}
  return false;
 }finally{if(current())button.disabled=false;}
}
