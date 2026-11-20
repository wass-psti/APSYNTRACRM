#!/usr/bin/env node
/** Classify already-observed, sanitized signed sessions and native readback.
 * Not a role writer, credential reader, or substitute for live mutation evidence.
 */
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
export const NATIVE_FOUR=Object.freeze(['time-tracker','fund-released-tracker','fueltrack-plus','tradelink']);
const KEY=/^[0-9a-f]{16}$/;
export function assess03G(preflight,native){
 const blocked=(gate,reason,verifiedNative=0)=>({status:'BLOCKED',gate,reason,verifiedNative,expectedNative:4,mutationPerformed:false,productionPermissionWrites:0});
 if(!preflight||!Array.isArray(preflight.accounts)||!native||!Array.isArray(native.accounts))
  return blocked('EVIDENCE','Two authoritative signed readback reports are required');
 const actors=preflight.accounts;
 if(actors.length!==2||actors.some(x=>!KEY.test(x.accountKey||'')||!KEY.test(x.workspaceKey||''))||new Set(actors.map(x=>x.accountKey)).size!==2)
  return blocked('IDENTITY','Exactly two distinct signed, active account reports are required');
 const admin=actors.find(x=>x.role==='admin'),target=actors.find(x=>['employee','supervisor','viewer'].includes(x.role));
 if(!admin||!target)return blocked('ROLE','Signed CRM administrator and non-admin target are required');
 if(admin.workspaceKey!==target.workspaceKey)return blocked('WORKSPACE','Administrator and target currently select different workspaces');
 if(preflight.status!=='ELIGIBLE')return blocked('SIGNED_PREFLIGHT','Signed same-workspace session eligibility has not passed');
 const nativeActor=native.accounts.find(x=>x.accountKey===target.accountKey&&x.workspaceKey===target.workspaceKey&&x.signed===true&&x.active===true);
 if(!nativeActor)return blocked('NATIVE_IDENTITY','Target native readback does not match signed identity and workspace');
 const readings=NATIVE_FOUR.map(moduleId=>nativeActor.applications?.find(x=>x.moduleId===moduleId));
 const count=readings.filter(x=>x?.status==='VERIFIED'&&x.nativeBoardMatch===true&&Array.isArray(x.domainRpcs)&&x.domainRpcs.some(r=>r.status===200)&&Array.isArray(x.pageErrors)&&x.pageErrors.length===0).length;
 if(count!==4)return blocked('NATIVE_READBACK','Four authoritative native startup reads have not passed',count);
 // An eligible pair plus four successful reads is still only PREPARED.
 // A genuine role change must be verified independently; never accept a
 // caller-supplied boolean as evidence that production was mutated.
 return {status:'READY_FOR_MUTATION',gate:'LIVE_ROLE_MUTATION',reason:'Signed preflight and four target native startups passed; genuine mutation, readback and cross-session acceptance not executed',verifiedNative:count,expectedNative:4,mutationPerformed:false,productionPermissionWrites:0};
}
function readPrefixed(file,prefix){
 const text=readFileSync(file,'utf8');
 const entry=text.trim().split('\n').reverse().find(line=>line.startsWith(prefix+' '));
 if(!entry)throw Error('Expected sanitized evidence marker is absent');
 return JSON.parse(entry.slice(prefix.length+1));
}
if(import.meta.url===pathToFileURL(process.argv[1]||'/dev/null').href){
 try{
  const args=process.argv.slice(2);
  if(args.length!==2)throw Error('Provide the 03F preflight JSON file and 03 native readback log');
  const preflight=JSON.parse(readFileSync(args[0],'utf8'));
  const native=readPrefixed(args[1],'CP_URM03_SIGNED_READONLY');
  const result=assess03G(preflight,native);
  console.log('CP_CRM_URM_03G_ACCEPTANCE '+JSON.stringify(result));
  if(result.status!=='READY_FOR_MUTATION')process.exitCode=2;
 }catch(error){console.error('CP_CRM_URM_03G_BLOCKED '+error.message.slice(0,140));process.exitCode=2;}
}
