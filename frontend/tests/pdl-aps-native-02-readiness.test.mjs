import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectNativeReadiness } from '../../scripts/pdl-aps-native-02-readiness.mjs';

const reservationId = '11111111-1111-4111-8111-111111111111';
const makeRequest = ({recordsA=[],recordsB=[],denyB=false}={}) => {
  const calls=[];
  const request=async (url, options) => {
    calls.push({url,options});
    const token=options.headers.authorization?.slice(7);
    const headers={'access-control-allow-origin':'https://wass-psti.github.io'};
    const response=(body,status=200)=>Response.json(body,{status,headers});
    if (options.method==='OPTIONS')return new Response(null,{status:204,headers});
    if (url.endsWith('/v1/health'))return response({paymentsLive:false});
    if (!token)return response({error:'administrator_auth_required'},401);
    if (token==='B'&&denyB)return response({error:'administrator_auth_required'},401);
    if (url.endsWith('/v1/admin/session'))return response({authenticated:true,actorId:token==='A'?'actor-a':'actor-b'});
    if (url.includes('/v1/admin/reservations'))return response({reservations:token==='A'?recordsA:recordsB});
    if (url.endsWith('/v1/admin/courts'))return response({courts:[{enabled:false},{enabled:false},{enabled:false}]});
    throw Error('Unrecognized test endpoint');
  };
  return {calls,request};
};
const record={id:reservationId,booking_status:'pending_verification',payment_status:'submitted',version:1};

test('real public health and denial can be checked without signed users',async()=>{
  const mock=makeRequest();const result=await inspectNativeReadiness({request:mock.request});
  assert.equal(result.publicOrigin,'VERIFIED');
  assert.equal(result.unsignedAdminDenial,'VERIFIED');
  assert.equal(result.signedPair,'PENDING');
  assert.equal(result.decision,'PENDING_SIGNED_SESSIONS');
  assert.equal(mock.calls.length,3);
  assert.ok(mock.calls.every(call=>['GET','OPTIONS'].includes(call.options.method)));
});

test('two different real-session contracts and matching reservation versions permit read-only reconciliation',async()=>{
  const mock=makeRequest({recordsA:[record],recordsB:[{...record}]});
  const result=await inspectNativeReadiness({request:mock.request,tokenA:'A',tokenB:'B',reservationId});
  assert.equal(result.signedPair,'VERIFIED');
  assert.equal(result.reservationReadback,'VERIFIED');
  assert.equal(result.decision,'PENDING_FINANCIAL_EVIDENCE');
  assert.equal(result.productionFinancialActivation,'NOT_AUTHORIZED');
  assert.ok(mock.calls.every(call=>['GET','OPTIONS'].includes(call.options.method)));
  assert.ok(!JSON.stringify(result).includes('Bearer A'));
});

test('a revoked administrator cannot be counted as a signed second account',async()=>{
  const mock=makeRequest({denyB:true});
  const result=await inspectNativeReadiness({request:mock.request,tokenA:'A',tokenB:'B',reservationId});
  assert.equal(result.signedPair,'FAILED');
  assert.equal(result.decision,'BLOCKED');
  assert.ok(!mock.calls.some(call=>call.url.includes('/v1/admin/courts')));
});

test('same token is not two independently authenticated accounts',async()=>{
  const mock=makeRequest();
  const result=await inspectNativeReadiness({request:mock.request,tokenA:'A',tokenB:'A'});
  assert.equal(result.signedPair,'FAILED');
  assert.equal(result.decision,'BLOCKED');
});

test('stale or differing payment version fails independent readback',async()=>{
  const mock=makeRequest({recordsA:[record],recordsB:[{...record,version:2}]});
  const result=await inspectNativeReadiness({request:mock.request,tokenA:'A',tokenB:'B',reservationId});
  assert.equal(result.reservationReadback,'FAILED');
  assert.equal(result.decision,'BLOCKED');
});

test('two genuine administrator contracts with no reservation remain pending',async()=>{
  const mock=makeRequest();
  const result=await inspectNativeReadiness({request:mock.request,tokenA:'A',tokenB:'B'});
  assert.equal(result.signedPair,'VERIFIED');
  assert.equal(result.reservationReadback,'PENDING');
  assert.equal(result.decision,'PENDING_PERSISTED_RESERVATION');
});
