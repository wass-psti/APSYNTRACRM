import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {WORK_MANAGEMENT_WORKSPACE_ID} from '../../frontend/workspace-identity.js';
import {SOURCE_BOARD_ID,mapMondayItem} from './monday-mapping.mjs';
import {validateOrder,poKey,decimalMinor,formatMinor} from './validate-row.mjs';
function addTotal(totals,row,checked) {
 if(!/^[A-Z]{3}$/.test(row.currency||'')||checked.amount===null)return;
 const t=totals.get(row.currency)||{count:0,amount:0n,expenses:0n,profit:0n,financialCount:0};
 t.count++;t.amount+=checked.amount;
 if(checked.derived){t.financialCount++;t.expenses+=checked.expenses;t.profit+=decimalMinor(checked.derived.grossProfit,{signed:true});}
 totals.set(row.currency,t);
}
const summarize=totals=>[...totals].sort(([a],[b])=>a.localeCompare(b)).map(([currency,t])=>({
 currency,count:t.count,amount:formatMinor(t.amount),financialCount:t.financialCount,
 calculatedExpenses:t.financialCount?formatMinor(t.expenses):null,calculatedGrossProfit:t.financialCount?formatMinor(t.profit):null
}));
function indexRows(rows,keyFor) {
 const counts=new Map();
 for(const row of rows){const key=keyFor(row);if(key)counts.set(key,(counts.get(key)||0)+1);}
 return counts;
}
export function dryRunOrderIntake(source,destination) {
 if(!source||!['monday-export','monday-workbook','legacy-backup','fixture'].includes(source.kind)||!Array.isArray(source.rows)||
  !Number.isSafeInteger(source.expectedCount)||source.expectedCount!==source.rows.length||
  typeof source.reference!=='string'||!source.reference.trim()||
  typeof source.exportedAt!=='string'||!Number.isFinite(Date.parse(source.exportedAt)))throw new Error('Incomplete source inventory');
 if(['monday-export','monday-workbook'].includes(source.kind)&&String(source.boardId)!==SOURCE_BOARD_ID)throw new Error('Unexpected source board');
 if(!destination||destination.workspaceId!==WORK_MANAGEMENT_WORKSPACE_ID||destination.complete!==true||
  !Array.isArray(destination.rows)||destination.expectedCount!==destination.rows.length)throw new Error('Incomplete destination snapshot');
 const existing=new Map();
 for(const row of destination.rows) {
  const key=poKey(row.po_number);
  if(!key||existing.has(key)||row.workspace_id!==destination.workspaceId||typeof row.archived!=='boolean')throw new Error('Invalid destination identity snapshot');
  existing.set(key,row.archived);
 }
 const rows=source.rows.map(row=>{
  if(!row||typeof row!=='object'||Array.isArray(row))return {};
  return source.kind==='monday-export'?mapMondayItem(row.item||{},row.supplemental||{}):row;
 });
 const poCounts=indexRows(rows,row=>poKey(row.poNumber));
 const idCounts=indexRows(rows,row=>typeof row.sourceItemId==='string'?row.sourceItemId.trim():'');
 const sourceTotals=new Map(),candidateTotals=new Map();
 const results=rows.map((row,index)=>{
  const checked=validateOrder(row),key=poKey(row.poNumber);
  if((poCounts.get(key)||0)>1)checked.issues.push('DUPLICATE_SOURCE_PO');
  if((idCounts.get(String(row.sourceItemId||'').trim())||0)>1)checked.issues.push('DUPLICATE_SOURCE_ITEM');
  if(existing.has(key))checked.issues.push(existing.get(key)?'EXISTING_ARCHIVED_PO':'EXISTING_ACTIVE_PO');
  addTotal(sourceTotals,row,checked);
  if(!checked.issues.length)addTotal(candidateTotals,row,checked);
  return {row:index+1,sourceLocator:row.sourceLocator||null,sourceItemId:row.sourceItemId||null,status:checked.issues.length?'HOLD':'CANDIDATE',issues:checked.issues,warnings:checked.warnings};
 });
 const candidates=results.filter(row=>row.status==='CANDIDATE').length;
 return {status:source.kind==='fixture'?'FIXTURE_ONLY':candidates===rows.length&&rows.length>0?'REVIEW_REQUIRED':'EXCEPTIONS_PENDING',
  sourceKind:source.kind,sourceCount:rows.length,candidateCount:candidates,heldCount:rows.length-candidates,
  destinationActive:[...existing.values()].filter(v=>!v).length,destinationArchived:[...existing.values()].filter(Boolean).length,
  sourceTotals:summarize(sourceTotals),candidateTotals:summarize(candidateTotals),
  sourceAmountUnclassified:rows.length-[...sourceTotals.values()].reduce((n,v)=>n+v.count,0),
  results,writesAttempted:0,productionImportAuthorized:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 try{
  const [sourcePath,destinationPath]=process.argv.slice(2);
  if(!sourcePath||!destinationPath)throw new Error('Usage: node scripts/order-intake-import/dry-run.mjs source.json destination.json');
  const bytes=readFileSync(sourcePath),destinationBytes=readFileSync(destinationPath);
  const report=dryRunOrderIntake(JSON.parse(bytes),JSON.parse(destinationBytes));
  const hash=value=>createHash('sha256').update(value).digest('hex');
  console.log(JSON.stringify({...report,sourceSha256:hash(bytes),destinationSha256:hash(destinationBytes)},null,2));
 }catch(error){console.error('DRY_RUN_FAILED: '+error.message);process.exitCode=1;}
}
