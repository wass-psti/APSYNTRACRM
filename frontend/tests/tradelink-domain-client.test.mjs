import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {TRADELINK_BOARD_ID} from '../tradelink-board-items.js';
import {
 TL03_DOMAIN_READS_ENABLED,TL03_DOMAIN_WRITES_ENABLED,TL03_AUTOMATIC_NUMBERING_ENABLED,TL03_ANALYTICS_ENABLED,TradeLinkDomainClient,
 validateTradeLinkDraftEnvelope,normalizeTradeLinkDomainReceipt,
 normalizeTradeLinkDomainRow
} from '../tradelink-domain-client.js';
import {TRADELINK_MAX_PAYLOAD_BYTES,tradeLinkJsonbTextByteLength} from '../tradelink/limits.js';

const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const item='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const workspace='00000000-0000-4000-8000-000000000001';
const draft={documentType:'quotation',documentNumber:'Q-000001',
 currency:'PHP',vatType:'12',items:[{
  id:'line-1',kind:'item',description:'Source item',quantity:1,unit:'pc',unitPrice:100
 }]};
test('document contract matches the six source types and denies mutable server fields',()=>{
 for(const type of ['esi','packing','delivery','payment','quotation','po'])
  assert.equal(validateTradeLinkDraftEnvelope({...draft,documentType:type}).documentType,type);
 for(const bad of [{...draft,documentType:'new'},
  {...draft,documentNumber:'<script>'},
  {...draft,workflow:{state:'approved'}},
  {...draft,status:'Approved'},
  {...draft,approvedAt:'2026-11-05'},
  {...draft,role:'system-admin'},
  {...draft,items:Array.from({length:251},()=>({}))}])
  assert.throws(()=>validateTradeLinkDraftEnvelope(bad));
});

test('250-item and 2 MiB JSONB capacities are exact, UTF-8 byte-accurate and duplicate-safe',()=>{
 const items=Array.from({length:250},(_,index)=>({...draft.items[0],id:'line-'+(index+1)}));
 assert.equal(validateTradeLinkDraftEnvelope({...draft,items:items.slice(0,249)}).items.length,249);
 assert.equal(validateTradeLinkDraftEnvelope({...draft,items}).items.length,250);
 assert.throws(()=>validateTradeLinkDraftEnvelope({...draft,items:[...items,{...items[0],id:'line-251'}]}),/250-item/);
 assert.throws(()=>validateTradeLinkDraftEnvelope({...draft,items:[items[0],{...items[1],id:items[0].id}]}),/Duplicate/);
 const unicode={name:'Café 漢字 😀',n:1e-7,list:[1,2],ok:true};
 assert.equal(tradeLinkJsonbTextByteLength(unicode),73);
 assert.equal(tradeLinkJsonbTextByteLength({a:1,bb:2}),17);
 assert.equal(tradeLinkJsonbTextByteLength({s:'line\nquote"slash\\'}),29);
 const base={...draft,items:[{...draft.items[0],unit:''}]};
 const fillerLength=TRADELINK_MAX_PAYLOAD_BYTES-tradeLinkJsonbTextByteLength(base);
 const exact={...base,items:[{...base.items[0],unit:'x'.repeat(fillerLength)}]};
 assert.equal(tradeLinkJsonbTextByteLength(exact),TRADELINK_MAX_PAYLOAD_BYTES);
 assert.doesNotThrow(()=>validateTradeLinkDraftEnvelope(exact));
 const below={...exact,items:[{...exact.items[0],unit:exact.items[0].unit.slice(0,-1)}]};
 assert.equal(tradeLinkJsonbTextByteLength(below),TRADELINK_MAX_PAYLOAD_BYTES-1);
 assert.doesNotThrow(()=>validateTradeLinkDraftEnvelope(below));
 const over={...exact,items:[{...exact.items[0],unit:exact.items[0].unit+'x'}]};
 assert.equal(tradeLinkJsonbTextByteLength(over),TRADELINK_MAX_PAYLOAD_BYTES+1);
 assert.throws(()=>validateTradeLinkDraftEnvelope(over),/2 MiB/);
});

test('server revision and item-link receipts are mandatory',()=>{
 const receipt={documentId:id,boardItemId:item,documentNumber:'Q-011130',revision:1,state:'draft',
  operation:'create',idempotent:false};
 assert.deepEqual(normalizeTradeLinkDomainReceipt(receipt,id,'create'),receipt);
 assert.equal(normalizeTradeLinkDomainReceipt({...receipt,idempotent:true},id,'create').idempotent,true);
 for(const wrong of [{...receipt,boardItemId:'bad'},
  {...receipt,documentId:workspace},{...receipt,revision:0},
  {...receipt,operation:'update'},{...receipt,state:'approved'}])
  assert.throws(()=>normalizeTradeLinkDomainReceipt(wrong,id,'create'));
});
test('foreign workspace, board or unknown document states fail closed',()=>{
 const row={id,board_id:TRADELINK_BOARD_ID,workspace_id:workspace,
  board_item_id:item,document_type:'quotation',workflow_state:'draft',
  revision:1,content:draft};
 assert.equal(normalizeTradeLinkDomainRow(row,workspace,id),row);
 assert.equal(normalizeTradeLinkDomainRow({...row,workflow_state:'for-approval'},workspace,id).workflow_state,'for-approval');
 for(const changed of [{...row,workspace_id:id},
  {...row,board_id:id},{...row,revision:-1},
  {...row,workflow_state:'unknown'},{...row,content:[]}])
  assert.throws(()=>normalizeTradeLinkDomainRow(changed,workspace,id));
});
test('read and write operations require a complete signed authorization client',async()=>{
 assert.equal(TL03_DOMAIN_READS_ENABLED,true);
 assert.equal(TL03_DOMAIN_WRITES_ENABLED,true);
 let invoked=0;
 const client=new TradeLinkDomainClient({
  auth:{getVerifiedUser:async()=>{invoked++;throw Error('Unexpected signed access');}},
  api:{rpc:async()=>{invoked++;throw Error('Unexpected network call');}}
 });
 await assert.rejects(()=>client.list(),/Signed TradeLink reviewer API unavailable/);
 await assert.rejects(()=>client.read(id),/Signed TradeLink domain API unavailable/);
 await assert.rejects(()=>client.commit({documentId:id,expectedRevision:0,
  operation:'create',draft}),/Signed TradeLink domain API unavailable/);
 assert.equal(invoked,0);
});

test('signed analytics RPC is enabled as a read-only path while automatic numbering is enabled in this candidate',async()=>{
 assert.equal(TL03_ANALYTICS_ENABLED,true);
 assert.equal(TL03_AUTOMATIC_NUMBERING_ENABLED,true);
 const calls=[];let boardCalls=0,managerChecks=0;
 const summary={generatedAt:'2026-11-16T08:00:00.000Z',
  documentCounts:[{documentType:'quotation',workflowState:'draft',count:3}],
  quotationPerformance:[{workflowState:'draft',currency:'PHP',count:3,total:1000}],
  quotationCommercialStatus:[{quoteStatus:'unspecified',currency:'PHP',count:3,total:1000}],
  taxSummary:[],
  aging:{available:true,reason:'Approved ESI invoices with due dates only.',
   buckets:[],unallocatedReceipts:[],excessPayments:[],pendingChequeReceipts:[],excludedWithoutDueDate:0}};
 const auth={userId:id,getVerifiedUser:async()=>({id})};
 const api={
  context:async()=>({user_id:id,workspace_id:workspace,profile:{status:'active'}}),
  board:async()=>{boardCalls++;throw new Error('Analytics must not load full board pages');},
  allowed:async(boardId,permission)=>{managerChecks++;assert.equal(boardId,TRADELINK_BOARD_ID);assert.equal(permission,'manage');return true;},
  rpc:async(name,args)=>{calls.push({name,args});return summary;}
 };
 const client=new TradeLinkDomainClient({auth,api});
 const result=await client.analyticsSummary();
 assert.deepEqual(result.documentCounts,summary.documentCounts);
 assert.equal(managerChecks,1,'the existing signed manager check remains active');
 assert.equal(boardCalls,0,'the aggregate RPC performs authoritative board/workspace validation');
 assert.deepEqual(calls,[{name:'tl03_analytics_summary',args:{
  p_board_id:TRADELINK_BOARD_ID,p_from:null,p_to:null}}]);
 await assert.rejects(()=>client.analyticsSummary({from:'invalid'}),/Invalid TradeLink analytics reporting period/);
 assert.equal(calls.length,1,'invalid period must not issue an RPC');
});

test('analytics retries one transient invalidated context read for the same signed user',async()=>{
 let contextCalls=0,boardCalls=0;
 const rpcCalls=[];
 const summary={generatedAt:'2026-11-16T08:00:00.000Z',documentCounts:[],
  quotationPerformance:[],quotationCommercialStatus:[],taxSummary:[],
  aging:{available:true,reason:'No qualifying invoices.',buckets:[],
   unallocatedReceipts:[],excessPayments:[],pendingChequeReceipts:[],excludedWithoutDueDate:0}};
 const auth={userId:id,getVerifiedUser:async()=>({id})};
 const api={
  context:async()=>{
   contextCalls++;
   if(contextCalls===1){
    const error=new Error('Signed workspace context changed during loading.');
    error.status=409;throw error;
   }
   return {user_id:id,workspace_id:workspace,profile:{status:'active'}};
  },
  board:async()=>{boardCalls++;throw new Error('Analytics must not load full board pages');},
  allowed:async()=>true,
  rpc:async(name,args)=>{rpcCalls.push({name,args});return summary;}
 };
 const client=new TradeLinkDomainClient({auth,api});
 const result=await client.analyticsSummary();
 assert.deepEqual(result.documentCounts,[]);
 assert.equal(contextCalls,2,'only the invalidated context read is retried');
 assert.equal(boardCalls,0,'the retry remains shell-free for Analytics');
 assert.equal(rpcCalls.length,1,'the aggregate RPC is called once after session validation');
 assert.equal(rpcCalls[0].name,'tl03_analytics_summary');
});

test('analytics does not retry an invalidated context read after signed identity changes',async()=>{
 const changedUser='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
 let contextCalls=0,rpcCalls=0;
 const auth={userId:id,getVerifiedUser:async()=>({id})};
 const api={
  context:async()=>{
   contextCalls++;
   auth.userId=changedUser;
   const error=new Error('Signed workspace context changed during loading.');
   error.status=409;throw error;
  },
  board:async()=>({board:{id:TRADELINK_BOARD_ID,workspace_id:workspace,
   name:'TradeLink',status:'active',description:'[APSYNTRA:MODULE:tradelink:v1]'}}),
  allowed:async()=>true,
  rpc:async()=>{rpcCalls++;return {};}
 };
 const client=new TradeLinkDomainClient({auth,api});
 await assert.rejects(()=>client.analyticsSummary(),/Signed workspace context changed during loading/);
 assert.equal(contextCalls,1,'identity change must not be retried');
 assert.equal(rpcCalls,0,'no aggregate read occurs after identity changes');
});

test('legacy manually numbered create remains compatible when numbering explicitly disabled',async()=>{
 assert.equal(TL03_AUTOMATIC_NUMBERING_ENABLED,true);
 const calls=[];
 const auth={userId:id,getVerifiedUser:async()=>({id})};
 const api={context:async()=>({user_id:id,workspace_id:workspace,profile:{status:'active'}}),
  board:async()=>({board:{id:TRADELINK_BOARD_ID,workspace_id:workspace,name:'TradeLink',status:'active',description:'[APSYNTRA:MODULE:tradelink:v1]'}}),
  allowed:async()=>true,rpc:async(name,args)=>{calls.push({name,args});return {
   documentId:id,boardItemId:item,revision:1,state:'draft',operation:'create',idempotent:false};}};
 const client=new TradeLinkDomainClient({auth,api,automaticNumberingEnabled:false});
 const receipt=await client.commit({documentId:id,expectedRevision:0,operation:'create',
  draft:{...draft,documentNumber:'Q-011129'},initialState:'draft'});
 assert.equal(receipt.documentNumber,'Q-011129');
 assert.equal(calls.length,1);
 assert.equal(calls[0].name,'tl03_document_save');
 assert.equal(calls[0].args.p_expected_revision,0);
 assert.equal(calls[0].args.p_operation,'create');
 assert.equal(calls[0].args.p_data.documentNumber,'Q-011129');
 await assert.rejects(()=>client.commit({documentId:id,expectedRevision:0,operation:'create',
  draft:{...draft,documentNumber:''},initialState:'draft'}),/Invalid TradeLink draft type or document number/);
});

test('activated automatic numbering uses the atomic server-number RPC and returns the assigned number',async()=>{
 const calls=[];
 const auth={userId:id,getVerifiedUser:async()=>({id})};
 const api={
  context:async()=>({user_id:id,workspace_id:workspace,profile:{status:'active'}}),
  board:async()=>({board:{id:TRADELINK_BOARD_ID,workspace_id:workspace,
   name:'TradeLink',status:'active',description:'[APSYNTRA:MODULE:tradelink:v1]'}}),
  allowed:async()=>true,
  rpc:async(name,args)=>{
   calls.push({name,args});
   return {documentId:id,boardItemId:item,documentNumber:'Q-011130',
    revision:1,state:'draft',operation:'create',idempotent:false};
  }
 };
 const client=new TradeLinkDomainClient({auth,api,automaticNumberingEnabled:true});
 const receipt=await client.commit({documentId:id,expectedRevision:0,operation:'create',
  draft:{...draft,documentNumber:''},initialState:'draft'});
 assert.equal(receipt.documentNumber,'Q-011130');
 assert.equal(calls.length,1);
 assert.equal(calls[0].name,'tl03_document_create');
 assert.equal(calls[0].args.p_data.documentNumber,'');
 assert.equal('p_expected_revision' in calls[0].args,false);
});

test('no source local-first fallback, duplicated auth or privileged client credentials',()=>{
 const source=readFileSync('frontend/tradelink-domain-client.js','utf8');
 assert.match(source,/getVerifiedUser/);
 assert.match(source,/TRADELINK_BOARD_ID/);
 assert.match(source,/this\.api\.allowed\(TRADELINK_BOARD_ID,'manage'\)/);
 assert.doesNotMatch(source,/localStorage|sessionStorage|service_role|sb_secret|fetch\(/);
});


test('CAS receipts accept exact no-op and immediate replay-safe update receipts only',()=>{
 const first={documentId:id,boardItemId:item,documentNumber:'Q-011130',revision:1,state:'draft',
  operation:'create',idempotent:false};
 assert.equal(normalizeTradeLinkDomainReceipt(first,id,'create',0).revision,1);
 assert.equal(normalizeTradeLinkDomainReceipt({...first,idempotent:true},id,'create',0).revision,1);
 const noOp={documentId:id,boardItemId:item,revision:4,state:'for-approval',
  operation:'update',idempotent:true};
 assert.equal(normalizeTradeLinkDomainReceipt(noOp,id,'update',4,'for-approval'),noOp);
 const replay={...noOp,revision:5};
 assert.equal(normalizeTradeLinkDomainReceipt(replay,id,'update',4,'for-approval'),replay);
 assert.equal(normalizeTradeLinkDomainReceipt({...replay,idempotent:false},id,'update',4,'for-approval').revision,5);
 for(const invalid of [
  [{...first,revision:3},'create',0],
  [{...first,idempotent:true,revision:2},'create',0],
  [{...noOp,revision:6},'update',4],
  [{...noOp,revision:3},'update',4],
  [{...noOp,operation:'archive'},'archive',4],
  [{...replay,idempotent:false,revision:4},'update',4],
  [{...first,operation:'archive',revision:2},'archive',9]
 ])assert.throws(()=>normalizeTradeLinkDomainReceipt(invalid[0],id,invalid[1],invalid[2]),/mismatch/);
 assert.throws(()=>validateTradeLinkDraftEnvelope({...draft,documentNumber:'Q-000001 '}),/Invalid/);
 assert.equal(validateTradeLinkDraftEnvelope({...draft,documentNumber:''},{allowUnassignedNumber:true}).documentNumber,'');
 assert.throws(()=>validateTradeLinkDraftEnvelope({...draft,documentNumber:''}));
});

test('retry-safe production migration only accepts the immediate same-actor exact-payload replay',()=>{
 const sql=readFileSync(new URL('../../supabase/migrations/20261113065300_tradelink_retry_safe_revision_bound_updates.sql',import.meta.url),'utf8');
 for(const pattern of [
  /d\.revision=p_expected_revision\+1/,
  /p_expected_revision<9223372036854775807/,
  /d\.content=payload/,
  /d\.workflow_state=p_initial_state/,
  /e\.operation='updated'/,
  /e\.actor_id=actor/,
  /e\.revision=d\.revision/,
  /e\.metadata->>'toState'=p_initial_state/,
  /projection\.title=d\.document_number/,
  /projection\.updated_at>=d\.updated_at/,
  /'operation','update','idempotent',TRUE/,
  /SET search_path='' /,
  /has_function_privilege\('anon'/
 ])assert.match(sql,pattern);
 assert.doesNotMatch(sql,/GRANT (?:INSERT|UPDATE|DELETE) ON TABLE|DROP POLICY|CREATE ROLE|service_role/);
});
test('signed TradeLink session overlaps actor, context and manager reads then uses the shell-only board cache',async()=>{
 const calls=[],resolvers=new Map();
 const gated=label=>new Promise(resolve=>{calls.push(label);resolvers.set(label,resolve);});
 const auth={userId:id,getVerifiedUser:()=>gated('actor')};
 const api={context:()=>gated('context'),
  boardCached:async(boardId,scope)=>{
   calls.push('boardCached');
   assert.equal(boardId,TRADELINK_BOARD_ID);
   assert.deepEqual(scope,{userId:id,workspaceId:workspace,includeItems:false});
   return {board:{id:TRADELINK_BOARD_ID,workspace_id:workspace,
    name:'TradeLink',status:'active',description:'[APSYNTRA:MODULE:tradelink:v1]'}};
  },
  allowed:()=>gated('manage'),rpc:async name=>{calls.push(name);return [];}};
 const client=new TradeLinkDomainClient({auth,api});
 const result=client.list();
 assert.deepEqual(calls,['actor','context','manage']);
 assert.equal(calls.includes('tl03_documents_list'),false);
 resolvers.get('manage')(true);
 resolvers.get('context')({user_id:id,workspace_id:workspace,profile:{status:'active'}});
 resolvers.get('actor')({id});
 assert.deepEqual(await result,[]);
 assert.deepEqual(calls,['actor','context','manage','boardCached','tl03_documents_list']);
});
test('concurrent signed preflight denies wrong workspace and denied manager without any document RPC',async()=>{
 for(const override of [{workspaceId:item},{manage:false},{actorId:item},{active:false}]){
  let calls=0;
  const auth={userId:id,getVerifiedUser:async()=>({id:override.actorId||id})};
  const api={context:async()=>({user_id:id,workspace_id:workspace,
    profile:{status:override.active===false?'inactive':'active'}}),
   board:async()=>({board:{id:TRADELINK_BOARD_ID,
    workspace_id:override.workspaceId||workspace,name:'TradeLink',status:'active',
    description:'[APSYNTRA:MODULE:tradelink:v1]'}}),
   allowed:async()=>override.manage!==false,
   rpc:async()=>{calls++;return [];}};
  await assert.rejects(()=>new TradeLinkDomainClient({auth,api}).list(),
   /identity or workspace changed|Board manager scope required|signed document capability is unavailable|Create New context is unavailable|Signed TradeLink reviewer API unavailable/);
  assert.equal(calls,0);
 }
});


test('existing TradeLink User module role can create and list own Drafts without Board manage',async()=>{
 const calls=[];
 const board={id:TRADELINK_BOARD_ID,workspace_id:workspace,name:'TradeLink',
  status:'active',description:'[APSYNTRA:MODULE:tradelink:v1] canonical board'};
 const auth={userId:id,getVerifiedUser:async()=>({id})};
 const api={
  context:async()=>({user_id:id,workspace_id:workspace,profile:{status:'active'}}),
  allowed:async(boardId,permission)=>{
   calls.push(['allowed',boardId,permission]);
   return false;
  },
  nativeApplicationBoardContext:async moduleId=>{
   calls.push(['native',moduleId]);
   return {moduleId,userId:id,workspaceId:workspace,role:'User',board};
  },
  rpc:async(name,args)=>{
   calls.push(['rpc',name,args]);
   if(name==='tl03_documents_list')return [{
    documentId:id,boardItemId:item,documentType:'quotation',documentNumber:'Q-TEST-01',
    workflowState:'draft',revision:1,archived:false,createdByActor:true,
    clientName:'Example Client',createdAt:'2026-11-19T10:00:00Z',
    updatedAt:'2026-11-19T10:00:00Z'
   }];
   if(name==='tl03_document_create')return {
    documentId:id,boardItemId:item,documentNumber:'Q-20261119000001',
    revision:1,state:'draft',operation:'create',idempotent:false
   };
   throw new Error('Unexpected RPC '+name);
  }
 };
 const client=new TradeLinkDomainClient({auth,api});
 const rows=await client.list();
 assert.equal(rows.length,1);
 assert.equal(rows[0].createdByActor,true);
 const receipt=await client.commit({documentId:id,expectedRevision:0,
  operation:'create',draft:{...draft,documentNumber:''},initialState:'draft'});
 assert.equal(receipt.documentNumber,'Q-20261119000001');
 await assert.rejects(()=>client.commit({documentId:id,expectedRevision:1,
  operation:'archive',expectedState:'draft',draft:null}),
  /supports document creation and own Draft updates only/);
 assert.ok(calls.some(call=>call[0]==='allowed'&&call[2]==='manage'));
 assert.ok(calls.some(call=>call[0]==='native'&&call[1]==='tradelink'));
 assert.ok(calls.some(call=>call[0]==='rpc'&&call[1]==='tl03_document_create'));
 assert.equal(calls.some(call=>call[0]==='rpc'&&call[1]==='tl03_document_commit'),false);
 assert.equal(calls.some(call=>call[0]==='boardCached'),false);
});


test('existing TradeLink User role can create all six document types with the existing server number prefixes',async()=>{
 const board={id:TRADELINK_BOARD_ID,workspace_id:workspace,name:'TradeLink',
  status:'active',description:'[APSYNTRA:MODULE:tradelink:v1] canonical board'};
 const prefixes={esi:'ESI-',packing:'PL-',delivery:'DR-',payment:'AR-',quotation:'Q-',po:'PO-'};
 const created=[];
 const auth={userId:id,getVerifiedUser:async()=>({id})};
 const api={
  context:async()=>({user_id:id,workspace_id:workspace,profile:{status:'active'}}),
  allowed:async()=>false,
  nativeApplicationBoardContext:async moduleId=>({
   moduleId,userId:id,workspaceId:workspace,role:'User',board
  }),
  rpc:async(name,args)=>{
   assert.equal(name,'tl03_document_create');
   created.push(args.p_data.documentType);
   return {documentId:id,boardItemId:item,
    documentNumber:prefixes[args.p_data.documentType]+'20261119000001',
    revision:1,state:args.p_initial_state,operation:'create',idempotent:false};
  }
 };
 const client=new TradeLinkDomainClient({auth,api});
 for(const type of Object.keys(prefixes)){
  const receipt=await client.commit({documentId:id,expectedRevision:0,
   operation:'create',initialState:'draft',draft:{...draft,documentType:type,documentNumber:''}});
  assert.ok(receipt.documentNumber.startsWith(prefixes[type]),type);
 }
 assert.deepEqual(created,Object.keys(prefixes));
});

test('non-User TradeLink module roles cannot use the Create New client capability',async()=>{
 const board={id:TRADELINK_BOARD_ID,workspace_id:workspace,name:'TradeLink',
  status:'active',description:'[APSYNTRA:MODULE:tradelink:v1] canonical board'};
 const auth={userId:id,getVerifiedUser:async()=>({id})};
 let rpcCalls=0;
 const api={
  context:async()=>({user_id:id,workspace_id:workspace,profile:{status:'active'}}),
  allowed:async()=>false,
  nativeApplicationBoardContext:async moduleId=>({
   moduleId,userId:id,workspaceId:workspace,role:'Viewer',board
  }),
  rpc:async()=>{rpcCalls++;return [];}
 };
 await assert.rejects(()=>new TradeLinkDomainClient({auth,api}).list(),
  /Board manager scope required/);
 assert.equal(rpcCalls,0);
});

test('assigned TradeLink reviewers resolve the native app and one document projection without generic board view',async()=>{
 const calls=[];
 const board={id:TRADELINK_BOARD_ID,workspace_id:workspace,name:'TradeLink',
  status:'active',description:'[APSYNTRA:MODULE:tradelink:v1] canonical board'};
 const auth={userId:id,getVerifiedUser:async()=>({id})};
 const api={
  context:async()=>({user_id:id,workspace_id:workspace,profile:{status:'active'}}),
  nativeApplicationBoardContext:async moduleId=>{
   calls.push(['native',moduleId]);
   return {userId:id,workspaceId:workspace,role:'User',board};
  },
  board:async()=>{calls.push(['generic-board']);throw Error('generic board read forbidden');},
  allowed:async()=>{calls.push(['generic-view']);throw Error('generic board view forbidden');},
  rpc:async(name,args)=>{
   calls.push([name,args]);
   if(name==='tl03_assigned_documents')return [];
   if(name==='tl03_board_projection')return {
    contract:'tradelink-board-projection-v1',board,
    item:{id:item,title:'Q-2026-001',archived_at:null,
     updated_at:'2026-11-19T00:00:00Z'}
   };
   throw Error('Unexpected RPC '+name);
  }
 };
 const client=new TradeLinkDomainClient({auth,api});
 assert.deepEqual(await client.assignedDocuments(),[]);
 const projection=await client.boardProjection(id);
 assert.equal(projection.board.id,TRADELINK_BOARD_ID);
 assert.equal(projection.items.length,1);
 assert.equal(projection.items[0].title,'Q-2026-001');
 assert.ok(calls.some(call=>call[0]==='native'&&call[1]==='tradelink'));
 assert.ok(calls.some(call=>call[0]==='tl03_board_projection'));
 assert.equal(calls.some(call=>call[0]==='generic-board'||call[0]==='generic-view'),false);
});
