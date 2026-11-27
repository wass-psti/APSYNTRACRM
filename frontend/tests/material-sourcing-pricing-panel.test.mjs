import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {calculatePricingPreview,renderNativePricingPanel,renderPricingHistory,describeFxSnapshot,FX_PROVIDER} from '../apps/MaterialSourcing/pricing-panel.js';
const base={quantity:'4',buyingPrice:'120.36',currency:'USD',shipping:'20',shipCurrency:'USD',usd:'64.45',eur:'71',source:'Import'};
test('reference pricing exact decimal and rounding order',()=>{
 assert.deepEqual(calculatePricingPreview(base).costs,{php:'7757.20',shipPhp:'1289.00',landed:'9046.20',totalLanded:'36184.80',selling:'15288.08',vatIn:'68490.60'});
 assert.equal(calculatePricingPreview({...base,source:'Unknown'}).costs.selling,null);
 assert.equal(calculatePricingPreview({...base,buyingPrice:'0',shipping:'0'}).costs.vatIn,'0.00');
 assert.equal(calculatePricingPreview({...base,usd:null}).status,'incomplete');
 assert.equal(calculatePricingPreview({...base,quantity:'0',usd:null}).status,'invalid');
 for(const value of ['1e3','1\n','1.1234567','01','-1',1])assert.equal(calculatePricingPreview({...base,shipping:value}).status,'invalid');
 assert.equal(calculatePricingPreview({...base,quantity:'99999999999999.999999',buyingPrice:'99999999999999.999999',currency:'PHP',shipping:'0',shipCurrency:'PHP',source:'Local'}).costs.totalLanded,'9999999999999999999900000000.00');
});
test('native pricing markup labels uncommitted rates and historical values, escapes input',()=>{
 const html=renderNativePricingPanel({quantity:'4',source:'Import'},{'Buying Price':{value:'<img src=x>'},'Selling Price (VAT-EX)':{value:12}});
 assert.match(html,/estimation only/);assert.match(html,/Legacy manual selling price/);assert.match(html,/data-pricing-save hidden disabled/);
 assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img/);
 assert.doesNotMatch(renderPricingHistory([{formulaVersion:'<img>',recordedAt:'2026-01-01',calculation:{status:'complete',costs:{php:'1.00'}}}]),/<img>/);
});
test('native panel is mounted only after signed commercial read and existing save is retained',()=>{
 const app=readFileSync('frontend/app.js','utf8'),detail=readFileSync('frontend/material-sourcing-detail-tabs.js','utf8');
 assert.match(detail,/data-mrh-pricing-host/);
 assert.match(app,/readProtectedSourcingItem\(input\)[\s\S]*?mountNativePricingPanel\(pricingHost/);
 assert.match(app,/saveMaterialSourcingAtomic\(\{\.\.\.input,publicChanges,privateChanges:changes\}\)/);
 const module=readFileSync('frontend/apps/MaterialSourcing/pricing-panel.js','utf8');
 assert.doesNotMatch(module,/localStorage|sessionStorage|indexedDB/);
 assert.match(module,/mrh_save_pricing_atomic/);
});
test('PostgreSQL oracle parity for all generated reference and edge cases',{skip:!process.env.MRH_PRICING_ORACLE},()=>{
 const cases=readFileSync(process.env.MRH_PRICING_ORACLE,'utf8').trim().split('\n').map(JSON.parse);
 assert.equal(cases.length,104);
 for(const {input,result} of cases)assert.deepEqual(calculatePricingPreview(input),result,JSON.stringify(input));
});

test('FX acquisition is explicit, date-only provenance is identified, and manual preview stays available',()=>{
 const html=renderNativePricingPanel({},{});
 assert.match(html,/data-pricing-fetch hidden disabled/);
 assert.match(html,/Daily reference rates, not live market/);
 const label=describeFxSnapshot({provider:FX_PROVIDER,observedAt:'2026-11-27T00:00:00+00:00',usd:'64.45000000',eur:'71.12345678',snapshotId:'test'});
 assert.match(label,/observation date 2026-11-27/);
 assert.doesNotMatch(label,/00:00:00/);
 const source=readFileSync('frontend/apps/MaterialSourcing/pricing-panel.js','utf8');
 assert.match(source,/api.rpc\('mrh_capture_latest_fx',\{p_item:input.itemId\}\)/);
 assert.match(source,/apply\(result,receipt.snapshotId,false\)/);
 assert.doesNotMatch(source,/api\.frankfurter\.dev|fetch\(/);
});
