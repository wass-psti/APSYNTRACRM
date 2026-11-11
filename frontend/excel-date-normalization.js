/** Deterministic Excel dates for XLSX import. Never evaluate workbook formulas.
 * Excel 1900 serial 60 denotes fictional 1900-02-29 and is rejected.
 * Dates are interpreted as timezone-free calendar values; ISO timestamp
 * output uses UTC only as a stable representation, not a timezone conversion.
 */
const DAY_MS=86400000;
const ISO_DATE=/^(\d{4})-(\d{2})-(\d{2})$/;
// Monday.com exports may append the explicit UTC marker instead of ISO's Z.\nconst ISO_DATETIME=/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(?:Z|\\s+UTC)?$/i;
const fail=reason=>{throw new Error(reason);};
function calendarDate(year,month,day){
 const dt=new Date(0);
 dt.setUTCFullYear(year,month-1,day);
 dt.setUTCHours(0,0,0,0);
 if(!Number.isFinite(dt.getTime())||dt.getUTCFullYear()!==year||
   dt.getUTCMonth()+1!==month||dt.getUTCDate()!==day||year<1||year>9999)
  fail('Calendar date is invalid or outside the supported years 0001–9999.');
 return dt;
}
function isoDate(d){return String(d.getUTCFullYear()).padStart(4,'0')+'-'+
 String(d.getUTCMonth()+1).padStart(2,'0')+'-'+
 String(d.getUTCDate()).padStart(2,'0');}
export function normalizeTextDate(value,{dateTime=false}={}){
 const raw=String(value??'').trim();
 if(!raw)return '';
 const iso=raw.match(ISO_DATE);
 const timestamp=raw.match(ISO_DATETIME);
 if(!iso&&!timestamp)fail('Date must use YYYY-MM-DD'+
  (dateTime?' or YYYY-MM-DD HH:mm[:ss[.SSS]]':'')+
  '; date ranges and locale-dependent slash dates require explicit conversion.');
 if(timestamp&&!dateTime)fail('A date-only column cannot accept a timestamp.');
 const parts=iso||timestamp;
 const year=Number(parts[1]),month=Number(parts[2]),day=Number(parts[3]);
 const base=calendarDate(year,month,day);
 if(iso)return isoDate(base);
 const hour=Number(parts[4]),minute=Number(parts[5]);
 const second=Number(parts[6]||0),milliseconds=Number((parts[7]||'').padEnd(3,'0')||0);
 if(hour>23||minute>59||second>59)
  fail('Timestamp contains an invalid hour, minute or second.');
 base.setUTCHours(hour,minute,second,milliseconds);
 return isoDate(base)+'T'+String(hour).padStart(2,'0')+':'+
  String(minute).padStart(2,'0')+':'+String(second).padStart(2,'0')+
  (milliseconds?'.'+String(milliseconds).padStart(3,'0'):'')+'Z';
}
export function excelDateFormat(format){
 // Remove quoted literals, escaped characters, palette/locale brackets,
 // padding and spacing directives before recognizing date/time tokens.
 let code=String(format??'').replace(/"(?:""|[^"])*"/g,'')
  .replace(/\\./g,'').replace(/\[[^\]]*\]/g,'')
  .replace(/_.|\*./g,'').toLowerCase();
 if(!code||!/[ymdhs]/.test(code))return null;
 const date=/[yd]/.test(code)||/\bm\b[\/-]/.test(code)||
  /[\/-]\bm\b/.test(code);
 const time=/[hs]/.test(code)||(/m/.test(code)&&/:/.test(code));
 if(!date&&!time)return null;
 return {date,time};
}
export function normalizeExcelSerial(value,{date1904=false,hasDate=true,hasTime=false}={}){
 if(typeof value==='string'&&!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(value.trim()))
  fail('Expected a numeric Excel date serial; the cell contains text.');
 const n=Number(value);
 if(!Number.isFinite(n)||n<0||n>2958465.999999)
  fail('Excel serial must be a finite nonnegative date within the supported calendar range.');
 let day=Math.floor(n);
 let millis=Math.round((n-day)*DAY_MS);
 if(millis===DAY_MS){millis=0;day++;}
 if(!date1904&&day===60)
  fail('Excel 1900 serial 60 refers to the nonexistent date 1900-02-29.');
 if(!hasDate){
  if(day!==0)fail('A time-only field cannot include whole elapsed days.');
  return new Date(millis).toISOString().slice(11,23).replace(/\.000$/,'');
 }
 if(!date1904&&day===0)fail('Excel 1900 date serial 0 has no valid calendar date.');
 const base=date1904?Date.UTC(1904,0,1):
  (day<60?Date.UTC(1899,11,31):Date.UTC(1899,11,30));
 const dt=new Date(base+day*DAY_MS+millis);
 if(Number.isNaN(dt.valueOf())||dt.getUTCFullYear()>9999)
  fail('Excel serial exceeds the supported calendar date range.');
 const dayText=isoDate(dt);
 return hasTime?dayText+'T'+dt.toISOString().slice(11,23).replace(/\.000$/,'')+'Z':dayText;
}
export function normalizeExcelCellDate(raw,{date1904=false,format={date:true,time:false},
 cellType='n'}={}){
 const text=String(raw??'').trim();
 if(!text)return '';
 if(cellType==='n'||cellType==null)return normalizeExcelSerial(text,{
  date1904,hasDate:format.date,hasTime:format.time
 });
 // A text cell can carry a date number format. Never reinterpret that
 // text as a numeric serial, even when it looks like a calendar date range.
 // Only strictly supported ISO dates are normalized; other text remains
 // unchanged for explicit mapping/conversion decisions.
 if(ISO_DATE.test(text)||ISO_DATETIME.test(text))
  return normalizeTextDate(text,{dateTime:format.time});
 return text;
}
