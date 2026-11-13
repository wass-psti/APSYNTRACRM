/** CP-FRT-IC-01 signed intercompany ledger client.
 * Reads remain available to the existing FRT membership roles. Ledger writes
 * reuse the existing finance mutation roles; no role assignments are created.
 */
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const money=/^[0-9]{1,30}(?:\.[0-9]{1,2})?$/;
const entryMoney=/^[0-9]{1,16}(?:\.[0-9]{1,2})?$/;
const date=/^\d{4}-\d{2}-\d{2}$/;
const readRoles=new Set(['GENERAL_MANAGER','FINANCE_MANAGER','FINANCE_APPROVER','REQUESTOR']);
const writeRoles=new Set(['GENERAL_MANAGER','FINANCE_MANAGER','FINANCE_APPROVER']);
const riskStatuses=new Set(['SETTLED','OVERDUE','DUE_SOON','CURRENT','NO_MATURITY']);
const text=(value,max)=>typeof value==='string'&&value.length<=max;
const validMoney=value=>typeof value==='string'&&money.test(value);
const validSignedMoney=value=>typeof value==='string'&&/^-?[0-9]{1,30}(?:\.[0-9]{1,2})?$/.test(value);
const cents=value=>{
 const negative=value.startsWith('-'),plain=negative?value.slice(1):value;
 const [whole,fraction='']=plain.split('.');
 const result=BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));
 return negative?-result:result;
};
const validDate=value=>{
 if(value===null)return true;
 if(typeof value!=='string'||!date.test(value))return false;
 const parsed=new Date(value+'T00:00:00Z');
 return !Number.isNaN(parsed.getTime())&&parsed.toISOString().slice(0,10)===value;
};

function projectCompany(value){
 return value&&uuid.test(value.id||'')&&
  text(value.code,32)&&/^[A-Za-z0-9_-]{1,32}$/.test(value.code)&&
  text(value.name,120)&&value.name.trim()
  ?{id:value.id,code:value.code,name:value.name}:null;
}
function projectMatrix(value,codes){
 if(!Array.isArray(value)||value.length!==codes.length*codes.length)return null;
 const seen=new Set(),rows=[];
 for(const row of value){
  if(!row||!codes.includes(row.row_company_code)||
     !codes.includes(row.column_company_code)||!validMoney(row.amount))return null;
  const key=row.row_company_code+'|'+row.column_company_code;
  if(seen.has(key))return null;
  seen.add(key);
  rows.push({rowCompanyCode:row.row_company_code,
   columnCompanyCode:row.column_company_code,amount:row.amount});
 }
 return rows;
}
function projectObligation(row,codes){
 if(!row||!uuid.test(row.id||'')||
    !text(row.reference,80)||row.reference.length<2||
    !['RECEIVABLE','LOAN'].includes(row.kind)||
    !codes.includes(row.creditor_code)||!codes.includes(row.debtor_code)||
    row.creditor_code===row.debtor_code||!text(row.description,500)||
    !validMoney(row.principal_amount)||!validMoney(row.settled_amount)||
    !validMoney(row.outstanding_amount)||!row.issued_on||!validDate(row.issued_on)||
    !validDate(row.due_on)||(row.kind==='LOAN'&&!row.due_on)||
    !riskStatuses.has(row.risk_status))return null;
 return {id:row.id,reference:row.reference,kind:row.kind,
  creditorCode:row.creditor_code,debtorCode:row.debtor_code,
  description:row.description,principalAmount:row.principal_amount,
  settledAmount:row.settled_amount,outstandingAmount:row.outstanding_amount,
  issuedOn:row.issued_on,dueOn:row.due_on,createdAt:row.created_at,
  riskStatus:row.risk_status};
}
function projectLoan(row,codes){
 if(!row||!uuid.test(row.id||'')||!text(row.reference,80)||
    !codes.includes(row.lender_code)||!codes.includes(row.borrower_code)||
    row.lender_code===row.borrower_code||!validMoney(row.original_amount)||
    !validMoney(row.settled_amount)||!validMoney(row.outstanding_balance)||
    !row.issue_date||!validDate(row.issue_date)||!row.maturity_date||!validDate(row.maturity_date)||
    !Number.isSafeInteger(row.days_outstanding)||row.days_outstanding<0||
    !Number.isSafeInteger(row.days_to_maturity)||!riskStatuses.has(row.risk_status))return null;
 return {id:row.id,reference:row.reference,lenderCode:row.lender_code,
  borrowerCode:row.borrower_code,originalAmount:row.original_amount,
  settledAmount:row.settled_amount,outstandingBalance:row.outstanding_balance,
  issueDate:row.issue_date,maturityDate:row.maturity_date,
  daysOutstanding:row.days_outstanding,daysToMaturity:row.days_to_maturity,
  riskStatus:row.risk_status};
}

/** Validate the full signed RPC result against the already-authorized FRT company roster. */
export function projectFRTICSnapshot(raw,workspaceId,expectedCompanies){
 if(!raw||raw.workspace_id!==workspaceId||!uuid.test(workspaceId||'')||
    !validDate(raw.as_of_date)||!Array.isArray(expectedCompanies)||
    !Array.isArray(raw.companies)||raw.companies.length!==expectedCompanies.length||
    !Array.isArray(raw.entities)||raw.entities.length!==expectedCompanies.length||
    !raw.summary||typeof raw.summary!=='object'||
    typeof raw.summary.ledger_balanced!=='boolean'||
    raw.summary.ledger_balance_basis!=='BILATERAL_SINGLE_SOURCE'||
    !text(raw.disclosure,500))return null;
 const companies=raw.companies.map(projectCompany);
 if(companies.some(x=>!x))return null;
 const expected=new Map(expectedCompanies.map(c=>[c.code,c.name]));
 if(expected.size!==expectedCompanies.length||companies.some(c=>expected.get(c.code)!==c.name)||
    companies.length!==expected.size)return null;
 const codes=companies.map(c=>c.code);
 const summary=raw.summary;
 const numericFields=['total_receivables','total_payables','net_intercompany_position',
  'active_loan_balance','exposure_threshold'];
 const countFields=['active_obligation_count','active_loan_count','overdue_count',
  'due_soon_count','high_exposure_pair_count'];
 if(numericFields.some(k=>!validMoney(summary[k]))||
    countFields.some(k=>!Number.isSafeInteger(summary[k])||summary[k]<0)||
    summary.ledger_balanced!==true||
    summary.total_receivables!==summary.total_payables||
    cents(summary.net_intercompany_position)!==0n)return null;
 const entities=[];
 for(const row of raw.entities){
  if(!row||!codes.includes(row.company_code)||
     !text(row.company_name,120)||!validMoney(row.receivables)||
     !validMoney(row.payables)||!validSignedMoney(row.net_position))return null;
  entities.push({companyCode:row.company_code,companyName:row.company_name,
   receivables:row.receivables,payables:row.payables,netPosition:row.net_position});
 }
 if(new Set(entities.map(x=>x.companyCode)).size!==codes.length||
    entities.some(x=>expected.get(x.companyCode)!==x.companyName))return null;
 const receivablesMatrix=projectMatrix(raw.receivables_matrix,codes);
 const payablesMatrix=projectMatrix(raw.payables_matrix,codes);
 if(!receivablesMatrix||!payablesMatrix)return null;
 for(const row of receivablesMatrix){
  const counterpart=payablesMatrix.find(x=>x.rowCompanyCode===row.columnCompanyCode&&
   x.columnCompanyCode===row.rowCompanyCode);
  if(!counterpart||counterpart.amount!==row.amount)return null;
 }
 for(const entity of entities){
  const expectedNet=cents(entity.receivables)-cents(entity.payables);
  if(expectedNet!==cents(entity.netPosition))return null;
 }
 if(!Array.isArray(raw.obligations)||raw.obligations.length>100||
    !Array.isArray(raw.loans)||raw.loans.length>100)return null;
 const obligations=raw.obligations.map(x=>projectObligation(x,codes));
 const loans=raw.loans.map(x=>projectLoan(x,codes));
 if(obligations.some(x=>!x)||loans.some(x=>!x))return null;
 return {workspaceId,asOfDate:raw.as_of_date,companies,entities,
  receivablesMatrix,payablesMatrix,summary:{
   totalReceivables:summary.total_receivables,totalPayables:summary.total_payables,
   netIntercompanyPosition:summary.net_intercompany_position,
   activeObligationCount:summary.active_obligation_count,
   activeLoanCount:summary.active_loan_count,activeLoanBalance:summary.active_loan_balance,
   overdueCount:summary.overdue_count,dueSoonCount:summary.due_soon_count,
   highExposurePairCount:summary.high_exposure_pair_count,
   exposureThreshold:summary.exposure_threshold,ledgerBalanced:true
  },obligations,loans,disclosure:raw.disclosure};
}

async function verifySignedFinanceScope({auth,api,workspaceId,write=false}){
 if(!auth||!api||!uuid.test(workspaceId||''))
  throw new Error('A verified FRT session and workspace are required.');
 const user=await auth.getVerifiedUser();
 const context=await api.context();
 if(!uuid.test(user?.id||'')||auth.userId!==user.id||
    context?.user_id!==user.id||context?.workspace_id!==workspaceId||
    context?.profile?.status!=='active')
  throw new Error('The signed FRT session or workspace changed. Reopen the finance view.');
 const bootstrap=await api.rpc('frt_bootstrap',{p_workspace_id:workspaceId});
 const membership=bootstrap?.membership;
 const allowed=write?writeRoles:readRoles;
 if(membership?.user_id!==user.id||membership?.workspace_id!==workspaceId||
    membership?.enabled!==true||membership?.status!=='active'||
    !allowed.has(membership?.role)||!Array.isArray(bootstrap?.companies))
  throw new Error(write?'An existing FRT finance role is required for ledger entries.':
   'Active FRT membership is required.');
 const companies=bootstrap.companies.map(projectCompany);
 if(companies.some(x=>!x)||new Set(companies.map(x=>x.code)).size!==companies.length)
  throw new Error('The signed FRT company roster is invalid.');
 return {userId:user.id,role:membership.role,companies};
}
async function verifyScopeUnchanged({auth,api,workspaceId,userId}){
 const user=await auth.getVerifiedUser();
 const context=await api.context();
 if(user?.id!==userId||auth.userId!==userId||
    context?.user_id!==userId||context?.workspace_id!==workspaceId||
    context?.profile?.status!=='active')
  throw new Error('The signed FRT session changed while saving. Refresh before retrying.');
}
function validateObligation(payload,companies){
 const codes=new Set(companies.map(c=>c.code));
 if(!payload||!['RECEIVABLE','LOAN'].includes(payload.kind)||
    !text(payload.reference,80)||payload.reference.trim().length<2||
    !text(payload.description||'',500)||!codes.has(payload.creditorCode)||
    !codes.has(payload.debtorCode)||payload.creditorCode===payload.debtorCode||
    !entryMoney.test(payload.amount)||Number(payload.amount)<=0||
    !validDate(payload.issuedOn)||!validDate(payload.dueOn||null)||
    (payload.kind==='LOAN'&&!payload.dueOn))
  throw new Error('Complete the intercompany details with a valid amount, date, and two different companies.');
}
async function readBackSignedICSnapshot({auth,api,workspaceId,scope}){
 // The receipt acknowledges a write, not its persistence through a separate read.
 // A failed read-back is ambiguous: never tell the operator to resubmit the write.
 let raw;
 try{raw=await api.rpc('frt_ic_snapshot',{p_workspace_id:workspaceId});}
 catch{throw new Error('The financial write was acknowledged, but persistence could not be verified. Refresh the ledger before attempting another entry.');}
 await verifyScopeUnchanged({auth,api,workspaceId,userId:scope.userId});
 const projected=projectFRTICSnapshot(raw,workspaceId,scope.companies);
 if(!projected)
  throw new Error('The financial write was acknowledged, but the ledger read-back was invalid. Refresh and inspect the original reference before retrying.');
 return projected;
}
export async function createFRTICObligation({auth,api,workspaceId,payload}={}){
 const scope=await verifySignedFinanceScope({auth,api,workspaceId,write:true});
 validateObligation(payload,scope.companies);
 const receipt=await api.rpc('frt_ic_create_obligation',{
  p_workspace_id:workspaceId,
  p_payload:{...payload,dueOn:payload.dueOn||null,reference:payload.reference.trim(),
   description:(payload.description||'').trim()}
 });
 if(receipt?.ok!==true||!uuid.test(receipt.id||'')||
    receipt.reference!==payload.reference.trim())
  throw new Error('The server did not return a valid intercompany creation receipt.');
 const readback=await readBackSignedICSnapshot({auth,api,workspaceId,scope});
 const saved=readback.obligations.find(row=>row.id===receipt.id&&
  row.reference===payload.reference.trim()&&row.kind===payload.kind&&
  row.creditorCode===payload.creditorCode&&row.debtorCode===payload.debtorCode);
 if(!saved||cents(saved.principalAmount)!==cents(payload.amount)||
    saved.issuedOn!==payload.issuedOn||saved.dueOn!==(payload.dueOn||null))
  throw new Error('The financial entry was acknowledged, but its saved record could not be confirmed. Refresh and search the reference before retrying.');
 return receipt;
}
export async function recordFRTICSettlement({auth,api,workspaceId,obligationId,payload}={}){
 const scope=await verifySignedFinanceScope({auth,api,workspaceId,write:true});
 if(!uuid.test(obligationId||'')||!payload||!entryMoney.test(payload.amount)||
    Number(payload.amount)<=0||!text(payload.reference,80)||
    payload.reference.trim().length<2||!validDate(payload.settledOn)||
    !text(payload.notes||'',500))
  throw new Error('Enter a valid settlement amount, date, and reference.');
 const receipt=await api.rpc('frt_ic_record_settlement',{
  p_workspace_id:workspaceId,p_obligation_id:obligationId,
  p_payload:{...payload,reference:payload.reference.trim(),notes:(payload.notes||'').trim()}
 });
 if(receipt?.ok!==true||!uuid.test(receipt.id||'')||
    receipt.obligation_id!==obligationId||!validMoney(receipt.remaining_amount))
  throw new Error('The server did not return a valid settlement receipt.');
 const readback=await readBackSignedICSnapshot({auth,api,workspaceId,scope});
 const saved=readback.obligations.find(row=>row.id===obligationId);
 if(!saved||cents(saved.outstandingAmount)!==cents(receipt.remaining_amount))
  throw new Error('The settlement was acknowledged, but its remaining balance could not be confirmed. Refresh the ledger and inspect settlement history before retrying.');
 return receipt;
}
