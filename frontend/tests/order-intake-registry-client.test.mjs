import test from 'node:test';
import assert from 'node:assert/strict';
import {OrderIntakeRegistryClient} from '../order-intake-registry-client.js';
const native={id:'native',workspace_id:'w',record_kind:'native',revision:1,archived:false};
const legacy={id:'legacy',workspace_id:'w',record_kind:'legacy',revision:null,archived:null,source_key:'monday:3670228015:1',po_amount:'12.345'};
function fixture(rows){
 const calls=[];
 const auth={isSignedIn:true,userId:'actor',authorized:async(path,options)=>{calls.push({path,options});return rows;}};
 const api={rpc:async()=>native};
 return {client:new OrderIntakeRegistryClient({auth,api,workspaceId:'w'}),calls,auth};
}
test('bounded signed list includes unknown archive state and preserves exact monetary text',async()=>{
 const {client,calls}=fixture([legacy,native]);
 assert.deepEqual(await client.list({limit:1,fiscalYear:2026}),{items:[legacy],hasMore:true});
 const url=new URL(calls[0].path,'https://example.invalid');
 assert.equal(url.pathname,'/rest/v1/order_intake_registry');
 assert.equal(url.searchParams.get('workspace_id'),'eq.w');
 assert.equal(url.searchParams.get('or'),'(archived.eq.false,archived.is.null)');
 assert.equal(url.searchParams.get('limit'),'2');
 assert.equal(url.searchParams.get('fiscal_year'),'eq.2026');
 assert.equal(calls[0].options.retryableRead,true);
});
test('detail handles legacy and rejects missing or ambiguous identities',async()=>{
 assert.deepEqual(await fixture([legacy]).client.detail('legacy'),legacy);
 await assert.rejects(fixture([]).client.detail('legacy'),/unavailable/);
 await assert.rejects(fixture([legacy,legacy]).client.detail('legacy'),/unavailable/);
});
test('invalid scope, missing source identity, and session change fail visibly',async()=>{
 await assert.rejects(fixture([{...legacy,workspace_id:'foreign'}]).client.list(),/Invalid/);
 await assert.rejects(fixture([{...legacy,source_key:null}]).client.list(),/Invalid/);
 const {client,auth}=fixture([legacy]);
 auth.authorized=async()=>{auth.userId='changed';return [legacy];};
 await assert.rejects(client.list(),/session changed/);
});
test('native mutation contract stays inherited and legacy records have no revision',async()=>{
 assert.deepEqual(await fixture([]).client.create({},'request'),native);
 assert.throws(()=>fixture([]).client.update('legacy',null,{}),/revision/);
});
