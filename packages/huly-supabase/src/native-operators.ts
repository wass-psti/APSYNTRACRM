/** Strict Huly operator subset for direct fields, $inc, $unset, $push and $pull. */
import { Denied } from './sb02.js';
const RESERVED=new Set(['_id','_class','space','attachedTo','attachedToClass','collection','createdBy','createdOn','modifiedBy','modifiedOn','parents','subIssues']);
const KEY=/^[A-Za-z][A-Za-z0-9_]{0,95}$/;
const OPERATORS=new Set(['$inc','$unset','$push','$pull']);
const rec=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const num=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x)&&Math.abs(x)<=Number.MAX_SAFE_INTEGER;
function field(k:string){if(!KEY.test(k)||RESERVED.has(k)||['__proto__','constructor','prototype'].includes(k))throw new Denied();}
function clone<T>(v:T):T{
 let s:string|undefined;try{s=JSON.stringify(v);}catch{throw new Denied();}
 if(s===undefined||new TextEncoder().encode(s).byteLength>225000)throw new Denied();
 return JSON.parse(s) as T;
}
const eq=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
export function applyIssueOperations(src:Record<string,unknown>,ops:unknown):Record<string,unknown>{
 if(!rec(ops)||Object.keys(ops).length===0)throw new Denied();
 const doc=clone(src),touched=new Set<string>();
 for(const [operator,body] of Object.entries(ops)){
  if(!operator.startsWith('$')){field(operator);if(touched.has(operator))throw new Denied();touched.add(operator);doc[operator]=clone(body);continue;}
  if(!OPERATORS.has(operator)||!rec(body)||Object.keys(body).length===0)throw new Denied();
  for(const [key,arg] of Object.entries(body)){
   field(key);if(touched.has(key))throw new Denied();touched.add(key);
   const old=doc[key];
   if(operator==='$inc'){if(!num(old)||!num(arg)||!num(old+arg))throw new Denied();doc[key]=old+arg;}
   else if(operator==='$unset'){if(arg!==true&&arg!==1)throw new Denied();delete doc[key];}
   else if(operator==='$push'){
    if(old!==undefined&&!Array.isArray(old))throw new Denied();
    const descriptor=rec(arg)&&Object.hasOwn(arg,'$each');
    if(descriptor&&(!Array.isArray(arg.$each)||!Object.keys(arg).every(k=>['$each','$position'].includes(k))))throw new Denied();
    const values=clone(descriptor?(arg.$each as unknown[]):[arg]);
    const arr=old===undefined?[]:[...old as unknown[]];
    const pos=descriptor?arg.$position:undefined;
    if(pos!==undefined&&(!Number.isSafeInteger(pos)||Number(pos)<0||Number(pos)>arr.length))throw new Denied();
    arr.splice(pos===undefined?arr.length:Number(pos),0,...values);
    if(arr.length>10000)throw new Denied();doc[key]=arr;
   }else{
    if(!Array.isArray(old))throw new Denied();
    const remove=rec(arg)?arg.$in:[arg];
    if(!Array.isArray(remove)||(rec(arg)&&Object.keys(arg).length!==1))throw new Denied();
    doc[key]=old.filter(v=>!remove.some(t=>eq(v,t)));
   }
  }
 }
 return doc;
}
