import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../../'+path,import.meta.url),'utf8');
test('TradeLink approval-free release uses consistent browser asset identities',()=>{
 const tag='cp-tl-universal-edit-01k-20261126-01';
 const imports=[
  ['index.html','./frontend/app.js'],
  ['frontend/app.js','./tradelink-ui.js'],
  ['frontend/app.js','./tradelink-draft-workspace.js'],
  ['frontend/app.js','./tradelink-native.js'],
  ['frontend/app.js','./tradelink-saved-document-output.js'],
  ['frontend/tradelink-ui.js','./tradelink-application.js'],
  ['frontend/tradelink-application.js','./tradelink-draft-workspace.js'],
  ['frontend/tradelink-application.js','./tradelink-domain-client.js'],
  ['frontend/tradelink-draft-workspace.js','./tradelink-native.js'],
  ['frontend/tradelink-draft-workspace.js','./tradelink/approval-policy.js'],
  ['frontend/tradelink-native.js','./tradelink-domain-client.js'],
  ['frontend/tradelink-domain-client.js','./tradelink/approval-policy.js'],
  ['frontend/tradelink-saved-document-output.js','./tradelink-domain-client.js'],
  ['frontend/tradelink-saved-document-output.js','./tradelink/approval-policy.js'],
  ['frontend/tradelink-saved-document-output.js','./tradelink/quotation-print.js'],
  ['frontend/tradelink/quotation-print.js','./approval-policy.js']
 ];
 for(const [file,specifier] of imports){
  const source=read(file);
  assert.ok(source.includes(specifier+'?v='+tag),file+' must request the current '+specifier);
  assert.ok(!source.includes("'"+specifier+"'"),file+' must not request an unversioned '+specifier);
 }
});
