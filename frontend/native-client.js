/** APSYNTRA Issue native transaction client.
 * Client request shapes are compatibility data, never authorization claims.
 * The hosted Supabase gateway revalidates identity, scope, RBAC and operators.
 */
const ISSUE='tracker:class:Issue';
const CREATE='core:class:TxCreateDoc';
const UPDATE='core:class:TxUpdateDoc';
const REMOVE='core:class:TxRemoveDoc';
const SPACE='tracker:space:Project';
const ID=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,95}$/;
const KEY=/^[A-Za-z][A-Za-z0-9_]{0,95}$/;
const IMMUTABLE=new Set(['_id','_class','space','modifiedBy','modifiedOn','createdBy','createdOn','attachedTo','attachedToClass','collection']);
const OPERATORS=new Set(['$inc','$unset','$push','$pull','$update','$rename']);
function guard(ok,message){if(!ok)throw new TypeError(message);}
function fields(value,allowOperators=false){
 guard(value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length>0,'Invalid Issue fields');
 for(const name of Object.keys(value)){
  if(allowOperators && name.startsWith('$')){
   guard(OPERATORS.has(name) && value[name] && typeof value[name]==='object'
     && !Array.isArray(value[name]) && Object.keys(value[name]).length>0,
     'Unsupported native field operator');
   for(const field of Object.keys(value[name])){
    guard(KEY.test(field) && !IMMUTABLE.has(field)
      && !['__proto__','prototype','constructor'].includes(field),
      'Protected operator field');
   }
  }else{
   guard(KEY.test(name) && !IMMUTABLE.has(name)
     && !['__proto__','prototype','constructor'].includes(name),
     'Protected Issue field');
  }
 }
 return value;
}
export function nativeIssueTx({kind,actor,id,attributes,operations}){
 guard(typeof actor==='string'&&actor.length>0&&ID.test(id),'Invalid signed actor or issue identity');
 const variants={create:CREATE,update:UPDATE,remove:REMOVE};
 guard(Object.hasOwn(variants,kind),'Unsupported native Issue operation');
 const tx={_id:crypto.randomUUID(),_class:variants[kind],space:SPACE,objectId:id,
   objectClass:ISSUE,objectSpace:SPACE,modifiedBy:actor,modifiedOn:Date.now()};
 if(kind==='create')tx.attributes=fields(attributes);
 if(kind==='update')tx.operations=fields(operations,true);
 return tx;
}
export function issueRowId(row){
 const value=row?.payload?.snapshot?._id;
 guard(typeof value==='string'&&ID.test(value)&&row.document_id==='huly.issue.'+value,
   'Invalid persisted Issue identity');
 return value;
}
export class NativeIssueClient {
 constructor(api){this.api=api;}
 async commit(boardId,workspaceId,txes){return this.api.nativeTransactions(boardId,workspaceId,txes);}
 async create(boardId,workspaceId,actor,{title,status='tracker:status:Todo',priority=2}){
  guard(typeof title==='string'&&title.trim().length>0,'Issue title required');
  const id=crypto.randomUUID();
  const tx=nativeIssueTx({kind:'create',actor,id,attributes:{title:title.trim(),status,priority}});
  const result=await this.commit(boardId,workspaceId,[tx]);
  guard(result.receipts[0]?.id==='huly.issue.'+id,'Unexpected native create receipt');
  return{id,receipt:result.receipts[0]};
 }
 async update(boardId,workspaceId,actor,row,operations){
  const id=issueRowId(row),tx=nativeIssueTx({kind:'update',actor,id,operations});
  const result=await this.commit(boardId,workspaceId,[tx]);
  guard(result.receipts[0]?.id===row.document_id,'Unexpected native update receipt');
  return result.receipts[0];
 }
 async remove(boardId,workspaceId,actor,row){
  const id=issueRowId(row),tx=nativeIssueTx({kind:'remove',actor,id});
  const result=await this.commit(boardId,workspaceId,[tx]);
  guard(result.receipts[0]?.id===row.document_id,'Unexpected native remove receipt');
  return result.receipts[0];
 }
}
