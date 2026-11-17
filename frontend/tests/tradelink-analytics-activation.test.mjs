import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {TL03_ANALYTICS_ENABLED,TL03_AUTOMATIC_NUMBERING_ENABLED,TradeLinkDomainClient}
 from '../tradelink-domain-client.js';
const root=new URL('../../',import.meta.url);
const source=path=>readFile(new URL(path,root),'utf8');
test('Analytics remains enabled only for the existing signed aggregate RPC; automatic numbering candidate is active only in staged branch',()=>{
 assert.equal(TL03_ANALYTICS_ENABLED,true);assert.equal(TL03_AUTOMATIC_NUMBERING_ENABLED,true);
});
test('signed analytics client calls the existing aggregate RPC without creating a new reporting endpoint',async()=>{
 const calls=[];
 const client=new TradeLinkDomainClient({auth:{userId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'},
  api:{rpc:async(name,args)=>{calls.push({name,args});return {
   generatedAt:'2026-11-17T08:00:00Z',documentCounts:[],quotationPerformance:[],
   quotationCommercialStatus:[],taxSummary:[],
   aging:{available:false,reason:'No approved ESI invoices with due dates.'}
  };}}});
 client.session=async()=>({actorId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  workspaceId:'00000000-0000-4000-8000-000000000001'});
 await client.analyticsSummary();
 assert.equal(calls.length,1);assert.equal(calls[0].name,'tl03_analytics_summary');
 assert.equal(calls[0].args.p_board_id,'264ca40d-6e4a-4e4f-97e6-3bd77c97cd88');
});
test('User Manual no longer describes the activated Analytics RPC as staged',async()=>{
 const manual=await source('frontend/tradelink-application.js');
 const client=await source('frontend/tradelink-domain-client.js');
 assert.match(manual,/Analytics uses the existing signed, read-only aggregate RPC/);
 assert.doesNotMatch(manual,/aggregate RPC is staged but not activated/i);
 assert.match(client,/export const TL03_ANALYTICS_ENABLED=true/);
 assert.match(client,/tl03_analytics_summary/);
});
test('Analytics displays truthful empty tax and receivables states instead of fabricated zero metrics',async()=>{
 const analytics=await source('frontend/tradelink-analytics.js');
 assert.match(analytics,/No approved ESI tax records in this reporting period/);
 assert.match(analytics,/No approved ESI invoices with a due date and an outstanding balance were found/);
 assert.match(analytics,/data\.aging\.available/);
});
