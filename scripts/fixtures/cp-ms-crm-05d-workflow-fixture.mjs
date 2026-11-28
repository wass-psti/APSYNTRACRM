// Browser-only synthetic persistence fixture. No external calls or production data.
export function workflowFixture(clientId,workspaceId){
 const revisions=[],receipts=new Map(),calls=[];
 let loseNextReceipt=false;
 const clone=value=>structuredClone(value);
 const read=args=>{
  let rows=revisions.filter(r=>r.itemId===args.p_item);
  if(args.p_rfq)rows=rows.filter(r=>r.rfq_id===args.p_rfq&&(!args.p_before_revision||r.revision<args.p_before_revision)).sort((a,b)=>b.revision-a.revision);
  else{
   const latest=new Map();
   for(const row of rows)latest.set(row.rfq_id,row);
   rows=[...latest.values()].sort((a,b)=>a.rfq_id.localeCompare(b.rfq_id));
  }
  const page=rows.slice(args.p_offset,args.p_offset+args.p_limit+1);
  return {item_id:args.p_item,rows:clone(page.slice(0,args.p_limit)),has_more:page.length>args.p_limit};
 };
 const apply=args=>{
  calls.push(clone(args));
  const prior=receipts.get(args.p_operation);
  if(prior){
   if(JSON.stringify(prior.args)!==JSON.stringify(args))throw Error('operation conflict');
   return {...prior.receipt,replayed:true};
  }
  const old=revisions.filter(r=>r.rfq_id===args.p_rfq).at(-1);
  if((old?.revision||0)!==args.p_expected_revision)throw Error('revision conflict');
  const p=args.p_payload,command=args.p_command;
  let s=old?clone(old.snapshot):null;
  if(command==='create')s={...p,status:'open',quotes:[],selection:null,supplier_po_id:null,client_po_id:null,client_po_kind:null};
  else if(command==='add_quote'||command==='amend_quote'){
   const prev=s.quotes.find(q=>q.id===p.quote_id);
   const quote={...p,id:p.quote_id,revision:(prev?.revision||0)+1};
   delete quote.quote_id;
   for(const key of ['quantity','unit_price','shipping_total','lead_weeks'])quote[key]=String(quote[key]);
   if(prev)s.quotes=s.quotes.map(q=>q.id===quote.id?quote:q);else s.quotes.push(quote);
  }else if(command==='select_quote'){
   const q=s.quotes.find(q=>q.id===p.quote_id);if(!q)throw Error('missing quote');
   s.status='selected';s.selection={quote_id:q.id,quote_revision:q.revision,reason:p.reason};
  }else if(command==='link_po')s={...s,...p,status:'po_linked'};
  else if(command==='reopen')s={...s,status:'open',selection:null,supplier_po_id:null,client_po_id:null,client_po_kind:null};
  else if(command==='cancel')s={...s,status:'cancelled',selection:null};
  else throw Error('unexpected procurement command');
  const revision=args.p_expected_revision+1;
  revisions.push({itemId:args.p_item,rfq_id:args.p_rfq,revision,command,created_at:'2026-11-28T00:00:00Z',snapshot:s});
  const receipt={rfq_id:args.p_rfq,revision,operation_id:args.p_operation,replayed:false};
  receipts.set(args.p_operation,{args:clone(args),receipt});
  if(loseNextReceipt){loseNextReceipt=false;throw Error('synthetic lost response');}
  return receipt;
 };
 return {read,apply,calls:()=>clone(calls),loseNext:()=>{loseNextReceipt=true;},
  clientLookup:path=>{
   const url=new URL(path,'https://fixture.invalid');
   if(url.pathname!=='/rest/v1/order_intake_registry'||url.searchParams.get('workspace_id')!=='eq.'+workspaceId||url.searchParams.get('archived')!=='eq.false')throw Error('unexpected client lookup');
   if(url.searchParams.get('po_number')!=='eq.CLIENT-QA'&&url.searchParams.get('id')!=='eq.'+clientId)return [];
   return [{id:clientId,workspace_id:workspaceId,record_kind:'native',po_number:'CLIENT-QA',archived:false,revision:1,source_key:null}];
  }};
}
