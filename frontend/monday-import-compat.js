/** Verified monday.com XLSX/CSV checkbox text convention.
 * monday's column-value documentation reports "v" when checked and ""
 * when unchecked. Only classify a column when the observed nonblank
 * values are exclusively "v"; other exports remain untouched.
 * Docs: https://developer.monday.com/api-reference/reference/checkbox
 */
export function detectMondayCheckboxMarkers(sheet,source){
 const idx=sheet?.headers?.indexOf(source);
 if(idx==null||idx<0||!Array.isArray(sheet?.rows))return false;
 const values=sheet.rows.map(row=>String(row?.[idx]??'').trim());
 return values.some(v=>v.toLowerCase()==='v')&&
  values.every(v=>v===''||v.toLowerCase()==='v');
}
export function mondayCheckboxCell(raw){
 const value=String(raw??'').trim();
 if(!value)return false;
 if(value.toLowerCase()==='v')return true;
 throw new Error('Expected monday.com checkbox text "v" or an empty value.');
}
