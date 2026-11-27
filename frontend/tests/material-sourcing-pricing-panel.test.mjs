import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {calculatePricingPreview,renderNativePricingPanel,renderPricingHistory} from '../apps/MaterialSourcing/pricing-panel.js';
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
