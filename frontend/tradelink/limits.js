/**
 * Shared TradeLink document capacity.
 *
 * PostgreSQL validates octet_length(jsonb_value::text), not the compact
 * JSON request body. This helper mirrors JSONB's separator spacing and
 * numeric text format so the browser and database enforce the same byte cap.
 */
export const TRADELINK_MAX_ITEMS=250;
export const TRADELINK_MAX_PAYLOAD_BYTES=2*1024*1024;

const encoder=new TextEncoder();
const utf8Length=value=>encoder.encode(value).byteLength;

function postgresNumericText(value){
 const source=String(value);
 const match=/^(-?)([0-9]+)(?:[.]([0-9]+))?[eE]([+-]?[0-9]+)$/.exec(source);
 if(!match)return source;
 const sign=match[1],whole=match[2],fraction=match[3]||'';
 const digits=whole+fraction;
 const decimalPosition=whole.length+Number(match[4]);
 if(decimalPosition<=0)return sign+'0.'+'0'.repeat(-decimalPosition)+digits;
 if(decimalPosition>=digits.length)return sign+digits+'0'.repeat(decimalPosition-digits.length);
 return sign+digits.slice(0,decimalPosition)+'.'+digits.slice(decimalPosition);
}

/** Return the UTF-8 byte length of PostgreSQL's canonical jsonb::text output. */
export function tradeLinkJsonbTextByteLength(value){
 if(value===null||value===undefined)return 4;
 if(typeof value==='string')return utf8Length(JSON.stringify(value));
 if(typeof value==='boolean')return value?4:5;
 if(typeof value==='number')
  return Number.isFinite(value)?utf8Length(postgresNumericText(value)):4;
 if(Array.isArray(value)){
  let size=2+Math.max(0,value.length-1)*2;
  for(const child of value)size+=tradeLinkJsonbTextByteLength(child);
  return size;
 }
 if(typeof value==='object'){
  const entries=Object.entries(value).filter(([,child])=>
   child!==undefined&&typeof child!=='function'&&typeof child!=='symbol');
  let size=2+Math.max(0,entries.length-1)*2;
  for(const [key,child] of entries)
   size+=utf8Length(JSON.stringify(key))+2+tradeLinkJsonbTextByteLength(child);
  return size;
 }
 return 4;
}
