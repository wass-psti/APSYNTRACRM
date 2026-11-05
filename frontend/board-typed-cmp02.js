/** CMP-02 staged native column types. No automatic production activation.
 * Values are validated again by PostgreSQL after staged schema authorization.
 * Percentages use percentage points (12.5 = 12.5%, NOT 0.125).
 */
export const CMP02_NATIVE_TYPES=Object.freeze(['phone','rating','percentage']);
export const CMP02_SCHEMA_ACTIVATED=false;
const maxRating=config=>{
 const n=config?.max??5;
 return Number.isInteger(n)&&n>=3&&n<=10?n:5;
};
const percentageDecimals=config=>{
 const n=config?.decimals??2;
 return Number.isInteger(n)&&n>=0&&n<=4?n:2;
};
export function cmp02DefaultConfig(type,source={}){
 if(type==='phone')return {};
 if(type==='rating')return {max:maxRating(source)};
 if(type==='percentage')return {decimals:percentageDecimals(source)};
 throw new Error('Unsupported CMP-02 type.');
}
export function cmp02Validate(type,input,config={}, {allowPercentSymbol=false}={}){
 if(!CMP02_NATIVE_TYPES.includes(type))throw new Error('Unsupported CMP-02 type.');
 const raw=String(input??'').trim();
 if(!raw)return null;
 if(type==='phone'){
  if(!/^\+[1-9]\d{6,14}$/.test(raw))
   throw new Error('Phone must use international E.164 (+country code, 7–15 digits).');
  return raw;
 }
 if(type==='rating'){
  if(!/^[1-9]\d*$/.test(raw))
   throw new Error('Rating must be a whole number.');
  const n=Number(raw);
  if(!Number.isSafeInteger(n)||n>maxRating(config))
   throw new Error('Rating must be between 1 and '+maxRating(config)+'.');
  return n;
 }
 const numberText=allowPercentSymbol&&raw.endsWith('%')?raw.slice(0,-1).trim():raw;
 if(!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(numberText))
  throw new Error('Percentage must be a plain number between 0 and 100.');
 const n=Number(numberText);
 if(!Number.isFinite(n)||n<0||n>100)
  throw new Error('Percentage must be between 0 and 100.');
 const precision=(numberText.split('.')[1]||'').replace(/0+$/,'').length;
 if(precision>percentageDecimals(config))
  throw new Error('Percentage supports at most '+percentageDecimals(config)+' decimal places.');
 return n;
}
export function cmp02VisibleValue(value,type,config={}){
 if(value===null||value===undefined||value==='')return '—';
 if(type==='phone')return String(value);
 if(type==='rating')return String(value)+' / '+maxRating(config);
 if(type==='percentage')return String(value)+'%';
 return '—';
}
/** Fail closed for administrator-supplied type-specific configuration. */
export function cmp02CreationConfig(type,settings={}){
 if(type==='phone')return {};
 if(type==='rating'){
  const max=Number(settings.max??5);
  if(!Number.isInteger(max)||max<3||max>10)
   throw new Error('Rating maximum must be an integer from 3 to 10.');
  return {max};
 }
 if(type==='percentage'){
  const decimals=Number(settings.decimals??2);
  if(!Number.isInteger(decimals)||decimals<0||decimals>4)
   throw new Error('Percentage precision must be an integer from 0 to 4.');
  return {decimals};
 }
 throw new Error('Unsupported CMP-02 configuration.');
}
export function cmp02RatingMax(config){return maxRating(config);}
export function cmp02PercentageDecimals(config){return percentageDecimals(config);}
