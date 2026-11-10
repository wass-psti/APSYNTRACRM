import test from 'node:test';
import assert from 'node:assert/strict';
import {FuelTrackV3ReceiptStorageClient,validFuelTrackReceiptFile,verifyFuelTrackReceiptSignature}
 from '../fueltrack-v3-receipt-storage.js';
import {FuelTrackV3DomainClient} from '../fueltrack-v3-domain-client.js';
const board='7af78b3f-67bf-4600-9aa1-9006d19d486e';
const ws='11111111-1111-4111-8111-111111111111';
const user='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const req='88888888-8888-4888-8888-888888888888';
const item='dddddddd-dddd-4ddd-8ddd-eeeeeeeeeeee';
const file=new Blob([new Uint8Array([255,216,255,217])],{type:'image/jpeg'});
const auth=()=>({isSignedIn:true,userId:user,token:async()=> 'local-synthetic-token',
 refresh:async()=> 'rotated-synthetic-token'});
const requests=[];
const api={rpc:async(name,args)=>{
 requests.push({name,args});
 if(name==='fueltrack_v3_receipt_prepare')return {
  status:'VERIFIED_RECEIPT_PREPARE',boardId:board,workspaceId:ws,
  requestId:req,boardItemId:item,bucket:'work-board-files'
 };
 if(name==='fueltrack_v3_attach_receipt')return {
  status:'VERIFIED_RECEIPT',requestId:req,boardItemId:item,
  fileId:'77777777-7777-4777-8777-777777777777',storagePath:args.p_storage_path,
  idempotent:false
 };
 if(name==='fueltrack_v3_receipt_read')return {status:'NO_RECEIPT',requestId:req};
 throw new Error('Unexpected RPC '+name);
}};
test('receipt image validation rejects oversized, empty, unsupported, and malformed files',()=>{
 assert.deepEqual(validFuelTrackReceiptFile(file),{mimeType:'image/jpeg',extension:'jpg',sizeBytes:4});
 assert.throws(()=>validFuelTrackReceiptFile(new Blob([],{type:'image/png'})),/Receipt must/);
 assert.throws(()=>validFuelTrackReceiptFile(new Blob(['abc'],{type:'application/pdf'})),/Receipt must/);
 assert.throws(()=>validFuelTrackReceiptFile({type:'image/jpeg',size:5242881,arrayBuffer:async()=>{}}),/Receipt must/);
});
test('receipt byte signature matches JPEG, PNG and WebP metadata',async()=>{
 const png=new Blob([new Uint8Array([137,80,78,71,13,10,26,10])],{type:'image/png'});
 const webp=new Blob([new Uint8Array([82,73,70,70,4,0,0,0,87,69,66,80])],{type:'image/webp'});
 for(const candidate of [file,png,webp])
  assert.equal((await verifyFuelTrackReceiptSignature(candidate)).sizeBytes,candidate.size);
});
test('mismatched content, truncated headers, and forged byte counts are rejected',async()=>{
 for(const candidate of [
  new Blob(['not an image'],{type:'image/jpeg'}),
  new Blob([new Uint8Array([137,80,78,71])],{type:'image/png'}),
  new Blob([new Uint8Array([82,73,70,70,0,0,0,0,0,0,0,0])],{type:'image/webp'}),
  {type:'image/jpeg',size:9,arrayBuffer:async()=>new Uint8Array([255,216,255,217]).buffer}
 ])await assert.rejects(verifyFuelTrackReceiptSignature(candidate),/Receipt/);
});
test('forged JPEG MIME fails before receipt preparation or Storage upload',async()=>{
 let prepare=0,upload=0;
 const client=new FuelTrackV3ReceiptStorageClient({
  auth:auth(),boardId:board,workspaceId:ws,baseUrl:'https://test.supabase.co',
  apiKey:'public-anon-key',
  api:{rpc:async()=>{prepare++;return {};}},
  fetchImpl:async()=>{upload++;return {ok:true};}
 });
 await assert.rejects(client.uploadAndRegister(req,
  new Blob(['payload'],{type:'image/jpeg'})),/Receipt image content/);
 assert.equal(prepare,0);
 assert.equal(upload,0);
});
test('upload path is derived from signed request-to-Board item link, never a request ID folder',async()=>{
 requests.length=0;const network=[];
 const signed=auth();
 const client=new FuelTrackV3ReceiptStorageClient({
  auth:signed,api,boardId:board,workspaceId:ws,baseUrl:'https://test.supabase.co',apiKey:'public-anon-key',
  fetchImpl:async(url,options)=>{network.push({url,options});return {ok:true,status:200};}
 });
 const result=await client.uploadAndRegister(req,file);
 assert.equal(result.status,'VERIFIED_RECEIPT');
 assert.equal(network.length,1);
 assert.equal(requests[0].name,'fueltrack_v3_receipt_prepare');
 assert.equal(requests[1].name,'fueltrack_v3_attach_receipt');
 assert.equal(network[0].options.headers['x-upsert'],'false');
 assert.equal(network[0].options.headers.Authorization,'Bearer local-synthetic-token');
 assert.match(network[0].url,new RegExp('/storage/v1/object/work-board-files/'+board+'/'+item+'/'));
 assert.equal(requests[1].args.p_file_name,'receipt.jpg');
 assert.equal(requests[1].args.p_mime_type,'image/jpeg');
 assert.equal(requests[1].args.p_size_bytes,4);
 assert.equal(requests[1].args.p_storage_path.startsWith(board+'/'+item+'/'),true);
});
test('invalid signed receipt-prepare reply prevents an upload',async()=>{
 let calls=0;
 const signed=auth();
 const invalid=new FuelTrackV3ReceiptStorageClient({
  auth:signed,boardId:board,workspaceId:ws,
  api:{rpc:async()=>({status:'VERIFIED_RECEIPT_PREPARE',boardId:board,
   workspaceId:'22222222-2222-4222-8222-222222222222',requestId:req,
   boardItemId:item,bucket:'work-board-files'})},
  fetchImpl:async()=>{calls++;return {ok:true};}
 });
 await assert.rejects(invalid.uploadAndRegister(req,file),/Invalid signed receipt preparation/);
 assert.equal(calls,0);
});
test('failed Storage operation never attempts registration or falsely reports success',async()=>{
 requests.length=0;
 const client=new FuelTrackV3ReceiptStorageClient({
  auth:auth(),api,boardId:board,workspaceId:ws,fetchImpl:async()=>({ok:false,status:403,
   json:async()=>({message:'Restricted upload'})})
 });
 await assert.rejects(client.uploadAndRegister(req,file),/Restricted upload/);
 assert.equal(requests.some(x=>x.name==='fueltrack_v3_attach_receipt'),false);
});
test('logout during upload prevents metadata registration',async()=>{
 const signed=auth();
 const client=new FuelTrackV3ReceiptStorageClient({
  auth:signed,api,boardId:board,workspaceId:ws,
  fetchImpl:async()=>{signed.isSignedIn=false;return {ok:true,status:200};}
 });
 await assert.rejects(client.uploadAndRegister(req,file),/Signed identity changed/);
});
test('domain client rejects unauthorized or incorrectly scoped receipt metadata',async()=>{
 const signed=auth();
 const wrong=new FuelTrackV3DomainClient({
  api:{rpc:async()=>({status:'VERIFIED_RECEIPT',requestId:req,boardItemId:item,
   fileId:'77777777-7777-4777-8777-777777777777',
   storagePath:'unrelated/'+item+'/image.jpg'})},
  auth:signed,workspaceId:ws,boardId:board
 });
 await assert.rejects(wrong.receiptRead({requestId:req}),/Mismatched receipt Board identity/);
});
test('private receipt view signs only the authorized linked Board path',async()=>{
 const path=board+'/'+item+'/f0000000-0000-4000-8000-000000000000.jpg';
 const client=new FuelTrackV3ReceiptStorageClient({
  auth:auth(),boardId:board,workspaceId:ws,api:{rpc:async()=>({
   status:'VERIFIED_RECEIPT',requestId:req,boardItemId:item,
   fileId:'77777777-7777-4777-8777-777777777777',
   storagePath:path})},
  baseUrl:'https://project.supabase.co',
  fetchImpl:async(url)=>({
   ok:true,json:async()=>({signedURL:'/object/sign/work-board-files/'+path+'?token=synthetic'})
  })
 });
 const url=await client.signedUrl(req);
 assert.equal(url,'https://project.supabase.co/storage/v1/object/sign/work-board-files/'+path+'?token=synthetic');
});
test('signed receipt URL origin swapping is rejected',async()=>{
 const path=board+'/'+item+'/f0000000-0000-4000-8000-000000000000.jpg';
 const client=new FuelTrackV3ReceiptStorageClient({
  auth:auth(),boardId:board,workspaceId:ws,
  api:{rpc:async()=>({status:'VERIFIED_RECEIPT',requestId:req,boardItemId:item,
   fileId:'77777777-7777-4777-8777-777777777777',storagePath:path})},
  fetchImpl:async()=>({ok:true,json:async()=>({signedURL:'https://attacker.example/exfil'})})
 });
 await assert.rejects(client.signedUrl(req),/Untrusted receipt URL origin/);
});

test('existing private receipt binary round-trip verifies actual bytes without exporting content or signed URL',async()=>{
 const path=board+'/'+item+'/f0000000-0000-4000-8000-000000000000.jpg';
 const calls=[];
 const client=new FuelTrackV3ReceiptStorageClient({
  auth:auth(),boardId:board,workspaceId:ws,
  api:{rpc:async(name)=>{assert.equal(name,'fueltrack_v3_receipt_read');
   return {status:'VERIFIED_RECEIPT',requestId:req,boardItemId:item,
    fileId:'77777777-7777-4777-8777-777777777777',storagePath:path};}},
  baseUrl:'https://project.supabase.co',
  decodeImage:async()=>({width:1200,height:900,close(){}}),
  fetchImpl:async(url,opts)=>{
   calls.push({url,opts});
   if(opts.method==='POST')return Response.json({
    signedURL:'/object/sign/work-board-files/'+path+'?token=short-lived-synthetic'
   });
   if(opts.method==='GET')return new Response(new Uint8Array([255,216,255,217]),
    {headers:{'Content-Type':'image/jpeg','Content-Length':'4'}});
   throw new Error('Unexpected network method');
  }
 });
 const result=await client.verifyPrivateReceiptBinary(req);
 assert.deepEqual(result,{status:'VERIFIED_PRIVATE_RECEIPT_BINARY',mimeType:'image/jpeg',
  bytes:4});
 assert.equal(calls.length,2);
 assert.equal(calls[1].opts.method,'GET');
 assert.equal(calls[1].opts.credentials,'omit');
 assert.equal(calls[1].opts.headers,undefined);
 assert.equal(JSON.stringify(result).includes('token='),false);
 assert.equal(JSON.stringify(result).includes('signedURL'),false);
});

test('private receipt binary verification fails closed on spoofed bytes, oversized response, wrong MIME or changed signed identity',async()=>{
 const path=board+'/'+item+'/f0000000-0000-4000-8000-000000000000.jpg';
 const build=(signed,body,headers={})=>new FuelTrackV3ReceiptStorageClient({
  auth:signed,boardId:board,workspaceId:ws,
  api:{rpc:async()=>({status:'VERIFIED_RECEIPT',requestId:req,boardItemId:item,
   fileId:'77777777-7777-4777-8777-777777777777',storagePath:path})},
  baseUrl:'https://project.supabase.co',
  decodeImage:async()=>({width:1200,height:900,close(){}}),
  fetchImpl:async(_,opts)=>{
   if(opts.method==='POST')return Response.json({
    signedURL:'/object/sign/work-board-files/'+path+'?token=short-lived-synthetic'
   });
   return new Response(body,{headers});
  }
 });
 await assert.rejects(build(auth(),new Uint8Array([0,0,0,0]),
  {'Content-Type':'image/jpeg'}).verifyPrivateReceiptBinary(req),/content/);
 await assert.rejects(build(auth(),new Uint8Array([255,216,255,217]),
  {'Content-Type':'image/png'}).verifyPrivateReceiptBinary(req),/type/);
 await assert.rejects(build(auth(),new Uint8Array([255,216,255,217]),
  {'Content-Length':'5242881'}).verifyPrivateReceiptBinary(req),/size/);
 const signed=auth();
 const changed=new FuelTrackV3ReceiptStorageClient({
  auth:signed,boardId:board,workspaceId:ws,
  api:{rpc:async()=>({status:'VERIFIED_RECEIPT',requestId:req,boardItemId:item,
   fileId:'77777777-7777-4777-8777-777777777777',storagePath:path})},
  baseUrl:'https://project.supabase.co',
  decodeImage:async()=>({width:1200,height:900,close(){}}),
  fetchImpl:async(_,opts)=>{
   if(opts.method==='POST')return Response.json({
    signedURL:'/object/sign/work-board-files/'+path+'?token=short-lived-synthetic'
   });
   signed.isSignedIn=false;
   return new Response(new Uint8Array([255,216,255,217]),{
    headers:{'Content-Type':'image/jpeg'}});
  }
 });
 await assert.rejects(changed.verifyPrivateReceiptBinary(req),/identity/);
});

test('signed receipt retrieval denied by Storage must not report verified binary',async()=>{
 const path=board+'/'+item+'/f0000000-0000-4000-8000-000000000000.jpg';
 const client=new FuelTrackV3ReceiptStorageClient({
  auth:auth(),boardId:board,workspaceId:ws,
  api:{rpc:async()=>({status:'VERIFIED_RECEIPT',requestId:req,boardItemId:item,
   fileId:'77777777-7777-4777-8777-777777777777',storagePath:path})},
  baseUrl:'https://project.supabase.co',
  fetchImpl:async(_,opts)=>opts.method==='POST'?
   Response.json({signedURL:'/object/sign/work-board-files/'+path+'?token=fake'}):
   new Response('Denied',{status:403})
 });
 await assert.rejects(client.verifyPrivateReceiptBinary(req),/download denied \(403\)/);
});

test('unregistered receipt cannot trigger any private signed download',async()=>{
 let count=0;
 const client=new FuelTrackV3ReceiptStorageClient({
  auth:auth(),boardId:board,workspaceId:ws,
  api:{rpc:async()=>({status:'NO_RECEIPT',requestId:req})},
  baseUrl:'https://project.supabase.co',
  fetchImpl:async()=>{count++;throw new Error('Unexpected Storage access');}
 });
 await assert.rejects(client.verifyPrivateReceiptBinary(req),/does not exist/);
 assert.equal(count,0);
});

test('private receipt binary verification also requires browser image decoding, not only magic bytes',async()=>{
 const path=board+'/'+item+'/f0000000-0000-4000-8000-000000000000.jpg';
 let attempted=0;
 const client=new FuelTrackV3ReceiptStorageClient({
  auth:auth(),boardId:board,workspaceId:ws,
  api:{rpc:async()=>({status:'VERIFIED_RECEIPT',requestId:req,boardItemId:item,
   fileId:'77777777-7777-4777-8777-777777777777',storagePath:path})},
  baseUrl:'https://project.supabase.co',
  decodeImage:async blob=>{
   attempted++;
   assert.equal(blob.type,'image/jpeg');
   throw new Error('Image decoder rejected malformed JPEG');
  },
  fetchImpl:async(_,opts)=>opts.method==='POST'?
   Response.json({signedURL:'/object/sign/work-board-files/'+path+'?token=fake'}):
   new Response(new Uint8Array([255,216,255,217]),{
    headers:{'Content-Type':'image/jpeg'}})
 });
 await assert.rejects(client.verifyPrivateReceiptBinary(req),/decoder rejected/);
 assert.equal(attempted,1);
});
