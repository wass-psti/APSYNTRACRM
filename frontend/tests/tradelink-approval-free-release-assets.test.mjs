import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=path=>readFileSync(new URL('../../'+path,import.meta.url),'utf8');
test('TradeLink approval-free release uses consistent browser asset identities',()=>{
 const tag='cp-tl-universal-edit-01k-20261126-01';
 const creator='cp-tl-creator-attribution-01-20261127-01';
 const repository='cp-tl-opt-01-20261127-01';
 const approval='cp-tl-universal-edit-01k-20261126-01-cp-tl-approval-02-20261127';
 const imports=[
  ['index.html','./frontend/app.js'],
  ['frontend/app.js','./tradelink-ui.js',creator],
  ['frontend/app.js','./tradelink-draft-workspace.js',creator],
  ['frontend/app.js','./tradelink-native.js',repository],
  ['frontend/app.js','./tradelink-saved-document-output.js',approval],
  ['frontend/tradelink-ui.js','./tradelink-application.js',creator],
  ['frontend/tradelink-application.js','./tradelink-draft-workspace.js',creator],
  ['frontend/tradelink-application.js','./tradelink-domain-client.js'],
  ['frontend/tradelink-draft-workspace.js','./tradelink-native.js',repository],
  ['frontend/tradelink-draft-workspace.js','./tradelink/approval-policy.js'],
  ['frontend/tradelink-native.js','./tradelink-domain-client.js',repository],
  ['frontend/tradelink-domain-client.js','./tradelink/approval-policy.js'],
  ['frontend/tradelink-saved-document-output.js','./tradelink-domain-client.js'],
  ['frontend/tradelink-saved-document-output.js','./tradelink/approval-policy.js'],
  ['frontend/tradelink-saved-document-output.js','./tradelink/quotation-print.js',approval],
  ['frontend/tradelink/quotation-print.js','./approval-policy.js']
 ];
 for(const [file,specifier,expected=tag] of imports){
  const source=read(file);
  if(file==='index.html'){
   const version=source.match(/frontend\/app\.js\?v=([^"]+)/)?.[1];
   for(const release of [tag,creator,repository,approval])
    assert.ok(version?.includes(release),file+' must include '+release);
  }else assert.ok(source.includes("'"+specifier+'?v='+expected+"'")||source.includes('"'+specifier+'?v='+expected+'"'),file+' must request the current '+specifier);
  assert.ok(!source.includes("'"+specifier+"'"),file+' must not request an unversioned '+specifier);
 }
});
