// CP-FT-UI-07: reproducible, non-authoritative station source evidence.
// Only the three already-allowlisted station metadata fields contribute to the digest.
const SCHEMA='fueltrans-station-candidate-review-v1';
const STATUSES=new Set(['matched_on_visible_page','name_difference_on_visible_page','not_on_visible_page']);

function projection(rows){
 if(!Array.isArray(rows)||rows.length>5000)throw Error('Invalid station candidate projection.');
 const result=rows.map(row=>{
  if(!row||typeof row.client!=='string'||typeof row.stationId!=='string'||typeof row.stationName!=='string')throw Error('Invalid station metadata.');
  return [row.client,row.stationId,row.stationName];
 });
 result.sort((a,b)=>{const left=JSON.stringify(a),right=JSON.stringify(b);return left<right?-1:left>right?1:0;});
 return JSON.stringify({schema:SCHEMA,stations:result});
}
export async function stationCandidateSha256(rows){
 const text=projection(rows);
 if(!globalThis.crypto?.subtle)throw Error('Station fingerprint requires a secure browser context (HTTPS).');
 const bytes=new TextEncoder().encode(text);
 const hash=await crypto.subtle.digest('SHA-256',bytes);
 return [...new Uint8Array(hash)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
}
export async function stationCandidateEvidence({parsed,compared,ticketPage,ticketCount,reviewedAt}={}){
 if(!parsed||!Array.isArray(parsed.rows)||!Array.isArray(parsed.issues)||!Array.isArray(compared))throw Error('Invalid station candidate evidence.');
 if(parsed.issues.length>0)throw Error('Resolve source validation issues before exporting evidence.');
 if(!Number.isSafeInteger(ticketPage)||ticketPage<1||!Number.isSafeInteger(ticketCount)||ticketCount<0||ticketCount>50)throw Error('Invalid ticket-page scope.');
 if(typeof reviewedAt!=='string'||!Number.isFinite(Date.parse(reviewedAt)))throw Error('Missing review timestamp.');
 if(compared.length!==parsed.rows.length)throw Error('Comparison must cover all validated candidates.');
 const observed={matched_on_visible_page:0,name_difference_on_visible_page:0,not_on_visible_page:0};
 for(let index=0;index<compared.length;index++){
  const row=compared[index],source=parsed.rows[index];
  if(!row||!STATUSES.has(row.status)||row.client!==source.client||row.stationId!==source.stationId||row.stationName!==source.stationName)
   throw Error('Comparison does not correspond to the selected source.');
  observed[row.status]++;
 }
 const digest=await stationCandidateSha256(parsed.rows);
 return Object.freeze({
  schema:SCHEMA,verificationStatus:'UNVERIFIED_CANDIDATE',
  registryActivated:false,authorityVerified:false,storage:'none',
  fingerprint:{algorithm:'SHA-256',scope:'client + station ID + station name; sorted metadata projection only',value:digest},
  source:{dataRows:parsed.totalDataRows,uniqueStations:parsed.rows.length,identicalDuplicates:parsed.duplicates,extraColumnsIgnored:parsed.ignoredColumnCount,validationIssues:0},
  comparison:{scope:'visible-ticket-page-only',ticketPage,ticketCount,observed},
  reviewedAt,
  note:'This fingerprint proves only that the same projected metadata was reviewed. It does not verify station ownership, source authority, completeness, deployments or credentials.'
 });
}
