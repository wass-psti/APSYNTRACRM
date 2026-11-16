/**
 * CP-CRM-GLOBAL-SEARCH-03A — Native application search adapter registry.
 *
 * Adapters are thin read-only projections over existing application clients.
 * The registry owns query bounds, normalization, deduplication, ranking and
 * per-adapter failure isolation; it never creates an alternate data transport.
 */
import {normalizeGlobalSearchQuery,GLOBAL_SEARCH_MAX_RESULTS} from './global-search.js';

export const NATIVE_SEARCH_QUERY_LIMIT=120;
export const NATIVE_SEARCH_ADAPTER_LIMIT=12;
export const NATIVE_SEARCH_RESULT_LIMIT=GLOBAL_SEARCH_MAX_RESULTS;

const clean=(value,max=180)=>String(value??'').replace(/\s+/g,' ').trim().slice(0,max);
const tokens=query=>query.split(/\s+/).filter(Boolean);

export function scoreNativeSearchResult(query,fields=[]){
 const q=normalizeGlobalSearchQuery(query);
 const parts=fields.map(value=>clean(value,500).toLocaleLowerCase()).filter(Boolean);
 const text=parts.join(' ');
 const words=tokens(q);
 if(!q||!words.length||!words.every(word=>text.includes(word)))return null;
 if(parts.some(value=>value===q))return 0;
 if(parts.some(value=>value.startsWith(q)))return 1;
 if(parts.some(value=>value.includes(q)))return 2;
 return 3;
}

export function normalizeNativeSearchResult(adapter,row,query){
 if(!adapter||!row||typeof row!=='object')return null;
 const recordId=clean(adapter.getId?.(row),160);
 const title=clean(adapter.getTitle?.(row),180);
 const href=adapter.getHref?.(row);
 if(!recordId||!title||typeof href!=='string'||!href.startsWith('#/'))return null;
 const subtitle=clean(adapter.getSubtitle?.(row),220);
 const excerpt=clean(adapter.getExcerpt?.(row),240);
 const score=scoreNativeSearchResult(query,[title,subtitle,excerpt,
  ...(adapter.getSearchFields?.(row)||[])]);
 if(score===null)return null;
 return Object.freeze({
  id:adapter.id+':'+recordId,type:'native-record',native:true,
  application:adapter.name,applicationId:adapter.applicationId,
  recordType:adapter.recordType,recordId,title,subtitle,excerpt,href,score,
  query:normalizeGlobalSearchQuery(query),
  navigationScope:clean(adapter.getNavigationScope?.(row),100)
 });
}

export function createNativeSearchAdapter({id,applicationId=id,name,recordType,read,getId,getTitle,
 getSubtitle=()=>'',getExcerpt=()=>'',getSearchFields=()=>[],getNavigationScope=()=>'',getHref}={}){
 if(!/^[a-z][a-z0-9-]{1,39}$/.test(String(id||''))||
  !/^[a-z][a-z0-9-]{1,39}$/.test(String(applicationId||''))||
  !clean(name,100)||!clean(recordType,80)||typeof read!=='function'||
  typeof getId!=='function'||typeof getTitle!=='function'||typeof getHref!=='function')
  throw new TypeError('Invalid native search adapter contract');
 return Object.freeze({id,applicationId,name:clean(name,100),recordType:clean(recordType,80),
  read,getId,getTitle,getSubtitle,getExcerpt,getSearchFields,getNavigationScope,getHref});
}


/** Cache a bounded native snapshot per signed workspace scope. Concurrent searches
 * share the same in-flight read; query changes only filter the cached snapshot. */
export function createSnapshotReader(read,{ttlMs=12000,maxEntries=4}={}){
 if(typeof read!=='function'||!Number.isFinite(ttlMs)||ttlMs<0||
    !Number.isInteger(maxEntries)||maxEntries<1)throw new TypeError('Invalid snapshot reader');
 const cache=new Map();
 return async(context={})=>{
  const key=[context.userId||'',context.workspaceId||'',context.boardId||''].join('|');
  const now=Date.now(),prior=cache.get(key);
  if(prior&&(prior.promise||prior.expiresAt>now)){
   if(prior.promise)return prior.promise;
   return prior.value;
  }
  const entry={promise:Promise.resolve().then(()=>read(context))};
  cache.delete(key);cache.set(key,entry);
  while(cache.size>maxEntries)cache.delete(cache.keys().next().value);
  try{
   const value=await entry.promise;
   if(cache.get(key)===entry)cache.set(key,{value,expiresAt:Date.now()+ttlMs});
   return value;
  }catch(error){if(cache.get(key)===entry)cache.delete(key);throw error;}
 };
}

/** Executes independent read adapters concurrently; one unavailable module does not
 * suppress other modules. Providers must call existing signed application APIs. */
export function createNativeSearchRegistry(adapters=[],{limit=NATIVE_SEARCH_RESULT_LIMIT,
 adapterLimit=NATIVE_SEARCH_ADAPTER_LIMIT}={}){
 const registered=Object.freeze(adapters.filter(Boolean).slice(0,adapterLimit));
 return Object.freeze({
  adapters:registered,
  async search(query,context={}){
   const normalized=normalizeGlobalSearchQuery(query).slice(0,NATIVE_SEARCH_QUERY_LIMIT);
   if(normalized.length<2)return {results:[],errors:[]};
   const bounded=Math.max(1,Math.min(NATIVE_SEARCH_RESULT_LIMIT,
    Number.isInteger(limit)?limit:NATIVE_SEARCH_RESULT_LIMIT));
   const settled=await Promise.allSettled(registered.map(async adapter=>{
    const rows=await adapter.read(normalized,{...context,limit:Math.min(20,bounded)});
    if(!Array.isArray(rows))throw new TypeError(adapter.id+' returned a non-array result');
    return rows.slice(0,20).map(row=>normalizeNativeSearchResult(adapter,row,normalized))
     .filter(Boolean);
   }));
   const results=[],errors=[],seen=new Set();
   for(let i=0;i<settled.length;i++){
    const item=settled[i],adapter=registered[i];
    if(item.status==='rejected'){errors.push({adapterId:adapter.id,error:item.reason});continue;}
    for(const row of item.value){
     const key=row.href+'|'+row.recordType+'|'+row.recordId;
     if(seen.has(key))continue;
     seen.add(key);results.push(row);
    }
   }
   results.sort((a,b)=>a.score-b.score||
    a.application.localeCompare(b.application)||a.title.localeCompare(b.title));
   return {results:results.slice(0,bounded),errors};
  }
 });
}
