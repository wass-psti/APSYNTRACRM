/** Source-aligned TradeLink commercial calculation preview.
 * Formula adapted from uploaded src/domain/model.ts vatRate/calculate.
 * This module deliberately does not create/save a document, grant access or
 * replace server-authoritative financial validation.
 */
const VAT_RATES=Object.freeze({'15_tkm':0.15,'15_ksa':0.15,'12':0.12,exempt:0,zero:0});
export const TRADELINK_VAT_CODES=Object.freeze(['15_tkm','15_ksa','12','exempt','zero']);
export const TRADELINK_CURRENCIES=Object.freeze(['PHP','USD','EUR','GBP','JPY','CNY','SGD','AUD','SAR']);
const bounded=v=>{const n=Number(v);return Number.isFinite(n)?Math.max(0,n):0;};
export function tradeLinkVatRate(code){return VAT_RATES[code]??0;}
export function calculateTradeLinkAmounts(document={}){
 const items=Array.isArray(document.items)?document.items:[];
 const subtotal=items.filter(i=>i?.kind==='item').reduce((sum,i)=>
  sum+bounded(i.quantity)*bounded(i.unitPrice),0);
 const discountValue=bounded(document.discountValue);
 const rawDiscount=document.discountType==='percentage'?
  subtotal*Math.min(100,discountValue)/100:discountValue;
 const discount=Math.min(subtotal,rawDiscount);
 const taxable=Math.max(0,subtotal-discount);
 const rate=tradeLinkVatRate(document.vatType);
 const vat=taxable*rate;
 const total=taxable+vat;
 const phpEquivalent=document.currency==='PHP'?total:
  total*bounded(document.exchangeRate);
 return {subtotal,discount,taxable,vatRate:rate,vat,total,phpEquivalent};
}
const money=new Intl.NumberFormat('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2});
export function formatTradeLinkAmount(value){return Number.isFinite(value)?money.format(value):'—';}
export function renderTradeLinkFinancePreview(){
 return '<section class="tl-finance-preview" aria-labelledby="tl-finance-title">'+
  '<div class="tl-finance-head"><div><p class="tl-eyebrow">Source financial engine</p>'+
   '<h3 id="tl-finance-title">Commercial calculation preview</h3></div>'+
   '<span class="tl-finance-local">Unsaved estimate</span></div>'+
  '<p class="muted">This uses the source discount, VAT and currency rules on one sample line item. It is not a saved invoice, quotation or purchase order.</p>'+
  '<div class="tl-finance-fields" data-tradelink-finance-preview>'+
   '<label>Quantity<input name="quantity" type="number" min="0" step="any" value="1" inputmode="decimal"></label>'+
   '<label>Unit price<input name="unitPrice" type="number" min="0" step="any" value="0" inputmode="decimal"></label>'+
   '<label>Discount<select name="discountType"><option value="percentage">Percentage</option><option value="fixed">Fixed amount</option></select></label>'+
   '<label>Discount value<input name="discountValue" type="number" min="0" step="any" value="0" inputmode="decimal"></label>'+
   '<label>VAT<select name="vatType"><option value="zero">0% Zero Rated</option>'+
    '<option value="exempt">0% Tax Exempt</option><option value="12">12% VAT</option>'+
    '<option value="15_tkm">15% TKM VAT</option><option value="15_ksa">15% KSA VAT</option></select></label>'+
   '<label>Currency<select name="currency">'+TRADELINK_CURRENCIES.map(c=>
    '<option value="'+c+'">'+c+'</option>').join('')+'</select></label>'+
   '<label>PHP exchange rate<input name="exchangeRate" type="number" min="0" step="any" value="1" inputmode="decimal"></label>'+
   '</div>'+
  '<dl class="tl-finance-results" aria-live="polite" aria-atomic="true">'+
   [['subtotal','Subtotal'],['discount','Discount'],['taxable','Taxable'],['vat','VAT'],
    ['total','Total'],['phpEquivalent','PHP equivalent']].map(([key,label])=>
    '<div><dt>'+label+'</dt><dd data-tradelink-finance-result="'+key+'">0.00</dd></div>').join('')+'</dl>'+
   '<p class="tl-finance-local">Preview only · no database transaction or draft persistence</p></section>';
}
/** Delegated from the existing APSYNTRA shell. Updates text nodes only. */
export function updateTradeLinkFinancePreview(container){
 if(!container||!container.querySelector)return null;
 const field=name=>container.querySelector('[name="'+name+'"]')?.value;
 const currency=field('currency');
 const result=calculateTradeLinkAmounts({
  items:[{kind:'item',quantity:field('quantity'),unitPrice:field('unitPrice')}],
  discountType:field('discountType'),discountValue:field('discountValue'),
  vatType:field('vatType'),currency,exchangeRate:field('exchangeRate')
 });
 for(const [key,value] of Object.entries(result)){
  const target=container.parentElement?.querySelector('[data-tradelink-finance-result="'+key+'"]');
  if(target)target.textContent=formatTradeLinkAmount(value);
 }
 return result;
}
