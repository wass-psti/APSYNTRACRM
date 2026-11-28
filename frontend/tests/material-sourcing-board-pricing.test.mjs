import test from 'node:test';
import assert from 'node:assert/strict';
import {validateBoardPricing,paintBoardPricing,loadBoardPricing} from '../apps/MaterialSourcing/pricing-projection.js';
const scope={boardId:'board',workspaceId:'workspace'};
const costs={php:'0.00',shipPhp:'0.00',landed:'0.00',totalLanded:'0.00',selling:'0.00',vatIn:'0.00'};
const payload=()=>({...scope,coverage:{total:2,current:1,missing:1,stale:0,partial:0,incomplete:0,unavailable:0},
 totals:{buying:'0.00',shipping:'0.00',landed:'0.00',sellingVatIn:'0.00'},
 rows:[{itemId:'a',state:'current',pricingVersionId:'v',fxSnapshotId:'f',formulaVersion:'mrh-pricing-v1',costs:{...costs}},{itemId:'b',state:'missing',costs:null}],
 latestFx:{snapshotId:'f',provider:'Synthetic',provenance:'provider_reported',observationRef:'ref',observedAt:'2026-01-01T00:00:00Z',retrievedAt:'2026-01-02T00:00:00Z',usd:'63.72900000',eur:'69.82800000'}});
test('exact decimal strings and explicit zero are preserved',()=>{
 const p=payload();p.totals.buying='9007199254740993.01';
 assert.equal(validateBoardPricing(p,scope).totals.buying,'9007199254740993.01');
 assert.equal(p.rows[0].costs.php,'0.00');
});
test('scope, duplicate rows, coverage, numeric coercion and provenance fail closed',()=>{
 for(const corrupt of [
  p=>{p.workspaceId='other';},p=>{p.rows[1].itemId='a';},
  p=>{p.coverage.missing=2;},p=>{p.rows[0].costs.php=0;},
  p=>{p.totals.buying=0;},p=>{p.latestFx.provenance='legacy_unverified';},
  p=>{p.rows[1].costs={php:'0.00'};}
 ]){const p=payload();corrupt(p);assert.throws(()=>validateBoardPricing(p,scope));}
});
test('no eligible price is null, not zero; partial selling remains unavailable',()=>{
 const p=payload();p.rows[0].state='partial';p.rows[0].costs.selling=null;p.rows[0].costs.vatIn=null;
 p.coverage.current=0;p.coverage.partial=1;
 p.totals={buying:null,shipping:null,landed:null,sellingVatIn:null};
 assert.equal(validateBoardPricing(p,scope).totals.buying,null);
 p.totals.buying='0.00';assert.throws(()=>validateBoardPricing(p,scope));
});
function node(dataset={}){return {dataset,textContent:'',title:'',isConnected:true};}
function fixture(){
 const derived=node({msDerived:'php'}),state=node(),metric=node({msFinancialValue:'buying'}),fx=node(),coverage=node(),status=node();
 const row={dataset:{msItem:'a'},querySelectorAll:()=>[derived],querySelector:()=>state};
 const host={isConnected:true,querySelectorAll:s=>s==='tr[data-ms-item]'?[row]:s==='[data-ms-derived]'?[derived]:s==='[data-ms-pricing-state]'?[state]:[metric],
 querySelector:s=>({'[data-ms-fx-summary]':fx,'[data-ms-coverage]':coverage,'[data-ms-pricing-status]':status}[s])};
 const button={disabled:false,isConnected:true,closest:()=>host};
 return {host,button,derived,state,metric,fx,coverage,status};
}
test('one board request paints exact totals and clears values on failure',async()=>{
 const f=fixture();let calls=0;
 const api={rpc:async(name,args)=>{calls++;assert.equal(name,'mrh_pricing_board_projection');assert.deepEqual(args,{p_board_id:'board'});return payload();}};
 assert.equal(await loadBoardPricing(f.button,{api,...scope,isCurrent:()=>true}),true);
 assert.equal(calls,1);assert.equal(f.derived.textContent,'₱0.00');assert.equal(f.metric.textContent,'₱0.00');
 assert.match(f.fx.textContent,/Synthetic/);assert.match(f.coverage.textContent,/1 of 2 current/);
 assert.equal(await loadBoardPricing(f.button,{api:{rpc:async()=>{throw Error('offline');}},...scope,isCurrent:()=>true}),false);
 assert.equal(f.metric.textContent,'—');assert.equal(f.derived.textContent,'—');assert.match(f.status.textContent,/unavailable/);
});
test('late response is discarded after route leaves',async()=>{
 const f=fixture();let resolve;let current=true;
 const pending=loadBoardPricing(f.button,{api:{rpc:()=>new Promise(r=>{resolve=r;})},...scope,isCurrent:()=>current});
 current=false;resolve(payload());assert.equal(await pending,false);assert.equal(f.metric.textContent,'—');
});
